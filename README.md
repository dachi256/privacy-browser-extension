# Respect My Privacy - Browser Extension

A Chrome extension built using Manifest V3 that enhances online privacy. The extension blocks web trackers and prevents canvas fingerprinting while providing visual feedback on blocked trackers.

## Features

- Blocks common web trackers using declarativeNetRequest rules
- Prevents canvas fingerprinting by adding noise to canvas outputs
- Shows count and list of blocked trackers in popup UI
- Displays badge with current page tracker count
- Maintains persistent total tracker count
- South Park themed UI for a fun experience

## Extension Structure

- `manifest.json` - Extension configuration
- `scripts/background.js` - Background service worker for tracking and badge updates
- `scripts/content.js` - Content script for injection detection
- `popup/` - UI files for the extension popup
- `rules/rules.json` - Tracker blocking rules
- `icons/` - Extension icons
- `test_canvas.html` - Test page for canvas fingerprinting protection

## Installation (Developer Mode)

1. Clone the repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory

## Usage

The extension works automatically after installation. Click the extension icon to:
- See trackers blocked on the current page
- View the total trackers blocked
- Toggle canvas fingerprinting protection on/off

## Testing

The extension has been tested on various websites including news sites, e-commerce platforms, and social media, successfully blocking trackers and randomizing canvas fingerprints.

..