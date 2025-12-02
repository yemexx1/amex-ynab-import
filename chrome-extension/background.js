// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_IMPORT') {
        const { ynabKey, budgetId, amexUser, amexPass } = msg.payload;
        // Notify popup that import is starting
        chrome.runtime.sendMessage({ type: 'IMPORT_STATUS', text: 'Import started...' });
        // Here you would import the core logic from the original project.
        // For now we provide a simple placeholder flow.
        // 1. Fetch YNAB accounts (placeholder)
        chrome.runtime.sendMessage({ type: 'IMPORT_STATUS', text: 'Fetching YNAB accounts...' });
        // 2. Open AMEX site in a new tab (assumes user already logged in)
        chrome.tabs.create({ url: 'https://www.americanexpress.com/' }, (tab) => {
            // Wait a moment then send a message to the content script to start download
            setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { type: 'START_DOWNLOAD' });
                chrome.runtime.sendMessage({ type: 'IMPORT_STATUS', text: 'Triggered AMEX CSV download...' });
            }, 3000);
        });
        // 3. After download you would parse CSV and push to YNAB (placeholder)
        // This part requires more implementation; we leave it as a TODO.
        // Notify completion (placeholder)
        setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'IMPORT_STATUS', text: 'Import completed (placeholder).' });
        }, 8000);
        return true; // keep channel open if async response needed
    }
});
