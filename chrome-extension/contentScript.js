// contentScript.js
// This script runs on American Express pages.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_DOWNLOAD') {
        // Placeholder: locate the CSV download button and click it.
        // The actual selector may need adjustment based on the AMEX page structure.
        const downloadBtn = document.querySelector('a[data-testid="download-csv"]') || document.querySelector('button.download-csv');
        if (downloadBtn) {
            downloadBtn.click();
            chrome.runtime.sendMessage({ type: 'IMPORT_STATUS', text: 'Clicked CSV download button.' });
        } else {
            console.warn('Download button not found.');
            chrome.runtime.sendMessage({ type: 'IMPORT_STATUS', text: 'Download button not found; manual step may be required.' });
        }
    }
});
