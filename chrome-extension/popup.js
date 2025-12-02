// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const ynabKeyInput = document.getElementById('ynabKey');
    const budgetIdInput = document.getElementById('budgetId');
    const amexUserInput = document.getElementById('amexUser');
    const amexPassInput = document.getElementById('amexPass');
    const statusDiv = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');

    // Load saved credentials
    chrome.storage.sync.get([
        'ynabKey', 'budgetId', 'amexUser', 'amexPass'
    ], (data) => {
        if (data.ynabKey) ynabKeyInput.value = data.ynabKey;
        if (data.budgetId) budgetIdInput.value = data.budgetId;
        if (data.amexUser) amexUserInput.value = data.amexUser;
        if (data.amexPass) amexPassInput.value = data.amexPass;
    });

    startBtn.addEventListener('click', () => {
        const ynabKey = ynabKeyInput.value.trim();
        const budgetId = budgetIdInput.value.trim();
        const amexUser = amexUserInput.value.trim();
        const amexPass = amexPassInput.value;
        if (!ynabKey || !budgetId || !amexUser || !amexPass) {
            statusDiv.textContent = 'Please fill in all fields.';
            return;
        }
        // Save for next time
        chrome.storage.sync.set({ ynabKey, budgetId, amexUser, amexPass }, () => {
            statusDiv.textContent = 'Starting import...';
            chrome.runtime.sendMessage({
                type: 'START_IMPORT',
                payload: { ynabKey, budgetId, amexUser, amexPass }
            });
        });
    });

    // Listen for status updates from background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'IMPORT_STATUS') {
            statusDiv.textContent = msg.text;
        }
    });
});
