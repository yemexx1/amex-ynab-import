document.addEventListener("DOMContentLoaded", () => {
  const ynabKeyInput = document.getElementById("ynabKey") as HTMLInputElement;
  const budgetIdInput = document.getElementById("budgetId") as HTMLInputElement;
  const statusDiv = document.getElementById("status") as HTMLDivElement;
  const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
  const progressBar = document.getElementById("progressBar") as HTMLDivElement;
  const progressFill = document.getElementById(
    "progressFill"
  ) as HTMLDivElement;

  // Load saved credentials
  chrome.storage.sync.get(["ynabKey", "budgetId"], (data) => {
    if (data.ynabKey) ynabKeyInput.value = data.ynabKey;
    if (data.budgetId) budgetIdInput.value = data.budgetId;
  });

  const updateStatus = (
    message: string,
    type: "info" | "error" | "success" = "info",
    progress?: number
  ) => {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    if (progress !== undefined) {
      progressBar.style.display = "block";
      progressFill.style.width = `${progress}%`;
    } else {
      progressBar.style.display = "none";
    }
  };

  startBtn.addEventListener("click", () => {
    const ynabKey = ynabKeyInput.value.trim();
    const budgetId = budgetIdInput.value.trim();

    if (!ynabKey || !budgetId) {
      updateStatus("Please fill in all fields.", "error");
      return;
    }

    // Save credentials
    chrome.storage.sync.set({ ynabKey, budgetId }, () => {
      updateStatus("Starting import...", "info", 0);
      startBtn.disabled = true;

      chrome.runtime.sendMessage({
        type: "START_IMPORT",
        payload: { ynabKey, budgetId },
      });
    });
  });

  // Listen for status updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STATUS") {
      updateStatus(message.message, "info", message.progress);
    } else if (message.type === "ERROR") {
      updateStatus(message.message, "error");
      startBtn.disabled = false;
    } else if (message.type === "SUCCESS") {
      updateStatus(message.message, "success", 100);
      startBtn.disabled = false;
    }
  });
});
