
// Handles the logic and UI updates for the extension's popup window.

// --- Global Variables & Constants ---
const southParkQuotes = [ // Example quotes for empty states
    "Respect my authoritah!", "Oh my God! They killed Kenny!", "I'm not fat, I'm big boned!",
    "Screw you guys, I'm going home!", "Mmmm'kay?", "They took our jobs!",
    "You're gonna have a bad time.", "I learned something today..."
];

// --- Element References ---
// Cache references to frequently used DOM elements.
const fpStatusElement = document.getElementById('fp-status');
const toggleFpCheckbox = document.getElementById('toggle-fp');
const blockCountElement = document.getElementById('block-count');
const blockedListElement = document.getElementById('blocked-list');
const totalBlockCountElement = document.getElementById('total-block-count');
const statsDisplayElement = document.getElementById('stats-display');

// --- Core Functions ---

/**
 * Updates the fingerprint protection section UI based on the enabled state.
 * @param {boolean} isEnabled - Whether fingerprint protection is enabled.
 */
function updateFpUI(isEnabled) {
    if (!fpStatusElement || !toggleFpCheckbox) return; // Guard clause

    fpStatusElement.textContent = isEnabled ? "On" : "Off";
    toggleFpCheckbox.checked = isEnabled;

    // Apply CSS classes for visual styling
    if (isEnabled) {
        fpStatusElement.classList.add('enabled');
        fpStatusElement.classList.remove('disabled');
    } else {
        fpStatusElement.classList.add('disabled');
        fpStatusElement.classList.remove('enabled');
    }
}

/**
 * Fetches and displays blocker information (per-page and total counts).
 */
function initializeBlockerInfo() {
    // Set initial loading states
    statsDisplayElement.style.display = 'none'; // Hide count initially
    blockedListElement.innerHTML = `<li class="tracker-item"><i class="fa-solid fa-spinner fa-spin tracker-icon"></i> Loading...</li>`;
    totalBlockCountElement.textContent = "...";

    // Query for the active tab to get its ID
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0 || !tabs[0].id) {
            console.error("Popup: Error querying tabs:", chrome.runtime.lastError || "No active tab found");
            handleInfoError("Cannot get tab info.");
            return;
        }
        const currentTabId = tabs[0].id;

        // Request Per-Tab Blocked List
        chrome.runtime.sendMessage({ type: "getBlockedList", tabId: currentTabId }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Popup: Msg Err (getBlockedList):", chrome.runtime.lastError.message);
                handleInfoError("Connection error (page list).");
            } else if (isValidListResponse(response)) {
                 updateBlockedListUI(response.count, response.blockedList);
            } else {
                console.error("Popup: Invalid response (getBlockedList):", response);
                handleInfoError("Invalid data (page list).");
            }
        });

        // Request Total Session Blocked Count
        chrome.runtime.sendMessage({ type: "getTotalBlockedCount", tabId: currentTabId }, (response) => {
             if (chrome.runtime.lastError) {
                 console.error("Popup: Msg Err (getTotalBlockedCount):", chrome.runtime.lastError.message);
                 totalBlockCountElement.textContent = "Error";
             } else if (isValidTotalCountResponse(response)) {
                 totalBlockCountElement.textContent = response.totalCount;
             } else {
                  console.error("Popup: Invalid response (getTotalBlockedCount):", response);
                 totalBlockCountElement.textContent = "Error";
             }
        });
    }); 
}

/**
 * Updates the UI section displaying the list of blocked trackers for the current page.
 * Hides the counter if zero trackers are blocked.
 * @param {number} count - The number of blocked trackers.
 * @param {string[]} list - An array of blocked tracker URLs.
 */
function updateBlockedListUI(count, list) {
    blockedListElement.innerHTML = ""; // Clear previous content

    if (count > 0 && blockCountElement && statsDisplayElement) {
        statsDisplayElement.style.display = 'block'; // Show the counter display
        blockCountElement.textContent = count;

        // Populate the list with blocked hostnames
        list.forEach(url => {
            const listItem = document.createElement('li');
            listItem.className = 'tracker-item';
            let hostname = url;
            try {
                hostname = new URL(url).hostname.replace(/^www\./, '');
                listItem.title = url; // Tooltip shows full URL
            } catch (e) { /* Use full URL if parsing fails */ }
            listItem.innerHTML = `<i class="fa-solid fa-ban tracker-icon"></i><span>${hostname}</span>`;
            blockedListElement.appendChild(listItem);
        });
    } else {
        // Hide counter display and show an empty state message
        if(statsDisplayElement) statsDisplayElement.style.display = 'none';
        showEmptyBlockedList("No trackers blocked on this page yet.");
    }
}

/**
 * Displays a message in the blocked list area, hiding the counter.
 * @param {string} message - The message to display.
 */
function showEmptyBlockedList(message) {
    // Ensure counter is hidden
    if(statsDisplayElement) statsDisplayElement.style.display = 'none';
    // Display message using a random quote if desired, or the provided message
    const displayMessage = message || getRandomQuote();
    blockedListElement.innerHTML = `
        <li class="tracker-item">
            <i class="fa-solid fa-info-circle tracker-icon"></i>
            <span>${displayMessage}</span>
        </li>
    `;
}

/**
 * Handles errors during the fetching of blocker information.
 * @param {string} message - The error message to display.
 */
function handleInfoError(message) {
    showEmptyBlockedList(message); // Display error message in the list area
    if(totalBlockCountElement) totalBlockCountElement.textContent = "N/A"; // Indicate total count failed
}

/**
 * Checks if the response from getBlockedList message is valid.
 * @param {object} response - The response object.
 * @returns {boolean} True if the response is valid, false otherwise.
 */
function isValidListResponse(response) {
    return response && typeof response.count === 'number' && Array.isArray(response.blockedList);
}

/**
 * Checks if the response from getTotalBlockedCount message is valid.
 * @param {object} response - The response object.
 * @returns {boolean} True if the response is valid, false otherwise.
 */
function isValidTotalCountResponse(response) {
    return response && typeof response.totalCount === 'number';
}

/**
 * Gets a random quote from the predefined list.
 * @returns {string} A random South Park quote.
 */
function getRandomQuote() {
    const randomIndex = Math.floor(Math.random() * southParkQuotes.length);
    return southParkQuotes[randomIndex];
}


// --- Initialization Logic ---

// Add listener for when the popup DOM is fully loaded and parsed.
document.addEventListener('DOMContentLoaded', () => {
    console.log("Respect My Privacy: DOM loaded");

    // Validate essential elements before proceeding
    if (!fpStatusElement || !toggleFpCheckbox || !blockCountElement || !blockedListElement || !totalBlockCountElement || !statsDisplayElement) {
        console.error("Popup init failed: Critical elements missing.");
        document.body.innerHTML = "<p style='padding:10px; color:red;'>Error loading popup elements.</p>";
        return;
    }

    // 1. Initialize Fingerprint Protection Toggle State
    chrome.storage.local.get(['fingerprintProtectionEnabled'], (result) => {
        if (chrome.runtime.lastError) {
            console.error("Popup: Error getting FP state:", chrome.runtime.lastError);
            fpStatusElement.textContent = "Error";
            toggleFpCheckbox.disabled = true;
        } else {
            const isEnabled = result.fingerprintProtectionEnabled || false;
            updateFpUI(isEnabled);
        }
    });

    // 2. Add Listener for Fingerprint Toggle Changes
    toggleFpCheckbox.addEventListener('change', () => {
        const newState = toggleFpCheckbox.checked;
        chrome.storage.local.set({ fingerprintProtectionEnabled: newState }, () => {
            if (chrome.runtime.lastError) {
                console.error("Popup: Error saving FP state:", chrome.runtime.lastError);
                // Revert UI checkbox state on save error
                toggleFpCheckbox.checked = !newState;
                updateFpUI(!newState);
            } else {
                console.log("Popup: FP Protection state saved:", newState);
                updateFpUI(newState); // Reflect the change in the UI
            }
        });
    });

    // 3. Fetch and Display Blocker Information
    initializeBlockerInfo();

}); // End of DOMContentLoaded listener

console.log("Respect My Privacy: Popup script initial execution complete.");