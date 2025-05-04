
// Handles background tasks: tracking blocked requests, updating icon badge,
// injecting main world scripts, and responding to popup messages.

console.log("Background service worker started.");

// In-memory storage for blocked URLs per tab. Cleared on navigation/close.
let blockedUrlsPerTab = {};
// In-memory cache of the last count displayed on the badge per tab.
let lastBadgeCount = {};
// Key for storing the total count in persistent local storage.
const TOTAL_COUNT_STORAGE_KEY = 'totalBlockedCount_v1';

// --- Initialization ---
// Ensure badge is cleared on startup
chrome.action.setBadgeText({ text: '' });

// --- Badge Update Function ---

/**
 * Updates the action badge text for a given tabId based on the current block count.
 * Clears the badge if the count is 0.
 * @param {number} tabId - The ID of the tab to update the badge for.
 */
async function updateBadge(tabId) {
    if (typeof tabId !== 'number' || tabId < 0) return;
    const count = blockedUrlsPerTab[tabId]?.size || 0;
    const textToShow = count > 0 ? String(count) : '';

    if (lastBadgeCount[tabId] !== count) {
        try {
            await chrome.action.setBadgeText({ text: textToShow, tabId: tabId });
            if (textToShow) {
                await chrome.action.setBadgeBackgroundColor({ color: '#e53935' });
            }
            lastBadgeCount[tabId] = count;
        } catch (error) {
            // Ignore errors if tab no longer exists
            if (!error.message?.includes("No tab with id")) {
                 console.warn(`Badge update failed for tab ${tabId}: ${error.message}`);
            }
        }
    }
}

// --- Event Listeners ---

// Listener for matched blocking rules
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (details) => {
    const { tabId, url } = details.request;
    if (tabId < 0) return; // Ignore non-tab requests

    if (!blockedUrlsPerTab[tabId]) {
        blockedUrlsPerTab[tabId] = new Set();
        lastBadgeCount[tabId] = 0;
    }

    // Update counts only if the URL is newly added to the Set for this tab
    if (blockedUrlsPerTab[tabId].size < 500 && blockedUrlsPerTab[tabId].add(url)) {
        updateBadge(tabId); // Update per-tab badge

        // Increment persistent total count using chrome.storage.local
        try {
            const result = await chrome.storage.local.get(TOTAL_COUNT_STORAGE_KEY);
            const currentTotal = result[TOTAL_COUNT_STORAGE_KEY] || 0;
            const newTotal = currentTotal + 1;
            await chrome.storage.local.set({ [TOTAL_COUNT_STORAGE_KEY]: newTotal });
        } catch (error) {
            console.error("Background: Error updating total block count:", error);
        }
    }
});

// Listener for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    // Clean up stored data for the closed tab
    if (tabId in blockedUrlsPerTab) {
        delete blockedUrlsPerTab[tabId];
        delete lastBadgeCount[tabId];
    }
});

// Listener for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Clear tab data on navigation start
    if (changeInfo.status === 'loading') {
         if (tabId in blockedUrlsPerTab) {
             if (blockedUrlsPerTab[tabId]) blockedUrlsPerTab[tabId].clear();
             lastBadgeCount[tabId] = 0;
             updateBadge(tabId);
         }
    }

    // Inject MAIN world script if protection enabled
    if (changeInfo.status === 'complete' && tab?.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
        try {
            const storageResult = await chrome.storage.local.get(['fingerprintProtectionEnabled']);
            const isEnabled = storageResult.fingerprintProtectionEnabled || false;

            if (isEnabled) {
                 await chrome.scripting.executeScript({
                     target: { tabId: tabId, allFrames: true },
                     world: 'MAIN',
                     func: overrideCanvasFunctionInPageContext
                 });
            }
        } catch (err) {
             // Ignore common errors for pages script can't access
             if (err.message && !err.message.includes("Cannot access") && !err.message.includes("No tab with id") && !err.message.includes("Cannot create script")) {
                 console.error(`Tab ${tabId}: Injection check/process error:`, err);
             }
        }
    }
});

// Listener for tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    updateBadge(activeInfo.tabId); // Update badge for newly active tab
});


// Listener for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type || typeof message.tabId === 'undefined') {
         return false; // Invalid message structure
    }
    const tabId = message.tabId;

    // Handle request for per-tab blocked list
    if (message.type === "getBlockedList") {
        const blockedSet = blockedUrlsPerTab[tabId] || new Set();
        sendResponse({
            count: blockedSet.size,
            blockedList: Array.from(blockedSet)
        });
        return false; // Synchronous response
    }
    // Handle request for total session blocked count (from storage)
    else if (message.type === "getTotalBlockedCount") {
        (async () => { // Use async IIFE to handle await
            let totalCount = 0;
            try {
                const result = await chrome.storage.local.get(TOTAL_COUNT_STORAGE_KEY);
                totalCount = result[TOTAL_COUNT_STORAGE_KEY] || 0;
            } catch (error) {
                console.error("Background: Error getting total count:", error);
            }
            // Use helper to safely send async response
            trySendResponse(sendResponse, { totalCount: totalCount }, tabId, message.type);
        })();
        return true; // Indicate asynchronous response
    }

    // Handle unknown message types
    console.warn("Background: Received unknown message type:", message.type);
    return false;
});

// Helper function to safely send responses (popup might close)
function trySendResponse(sendResponse, payload, tabId, type) {
     try {
        sendResponse(payload);
     } catch (error) {
        // Ignore specific error if popup closed before response sent
        if (!error.message?.includes("Receiving end does not exist")) {
           console.error(`Background: Error sending ${type} response (Tab ${tabId}):`, error);
        }
     }
}


// --- Function to be Injected into MAIN world ---
// Contains the actual canvas randomization logic.
function overrideCanvasFunctionInPageContext() {
    // Flag prevents multiple executions in the same context
    if (window.hasRunCanvasOverride_PrivacyGuard) { return; }
    window.hasRunCanvasOverride_PrivacyGuard = true;

    // Ensure Canvas API is available
    if (typeof HTMLCanvasElement?.prototype?.toDataURL !== 'function') { return; }

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    let callCounter = 0;

    const modifiedToDataURL = function (type, encoderOptions) {
        callCounter++;
        const callId = callCounter + '_' + Math.random().toString(36).substring(2, 6);

        try {
            if (this.width <= 0 || this.height <= 0) {
                return originalToDataURL.apply(this, arguments);
            }
            const noiseCanvas = document.createElement('canvas');
            noiseCanvas.width = this.width;
            noiseCanvas.height = this.height;
            const ctx = noiseCanvas.getContext('2d');

            // Draw original, handle tainted canvas
            try { ctx.drawImage(this, 0, 0); } catch (e) { return originalToDataURL.apply(this, arguments); }

            // Apply drawing noise
            const numNoiseShapes = Math.max(10, Math.floor(noiseCanvas.width * noiseCanvas.height / 4000));
            for (let i = 0; i < numNoiseShapes; i++) {
                const r = Math.floor(Math.random() * 256);
                const g = Math.floor(Math.random() * 256);
                const b = Math.floor(Math.random() * 256);
                const alpha = 0.05 + Math.random() * 0.05;
                ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
                const x = Math.random() * noiseCanvas.width;
                const y = Math.random() * noiseCanvas.height;
                const w = Math.ceil(1 + Math.random());
                const h = Math.ceil(1 + Math.random());
                ctx.fillRect(x, y, w, h);
            }
            // Return modified data URL
            return originalToDataURL.call(noiseCanvas, type, encoderOptions);
        } catch (error) {
            console.error(`[PrivacyGuard Override Error #${callId}]`, error);
            // Fallback to original function on error
            return originalToDataURL.apply(this, arguments);
        }
    }; // End of modifiedToDataURL

    // Apply the override using Object.defineProperty
    try {
        Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
            value: modifiedToDataURL,
            writable: false,
            configurable: false
        });
    } catch (e) {
         console.error("[MAIN WORLD] Failed to apply canvas override:", e);
    }
} // End of injected function

// --- Service Worker Initialization ---
console.log("Background listeners active (Badge, Persistent Total Count, Injection).");