import { AMEXAccount, PendingTransaction } from "./types";

// Extract account information from the AMEX page
const getAccounts = (): AMEXAccount[] => {
  try {
    // AMEX stores account data in window.__INITIAL_STATE__
    const scriptElement = document.getElementById("initial-state");
    if (!scriptElement || !scriptElement.textContent) {
      console.error("Could not find initial state script");
      return [];
    }

    // Execute the script to get the initial state
    const scriptContent = scriptElement.textContent;
    const match = scriptContent.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);

    if (!match || !match[1]) {
      console.error("Could not extract initial state");
      return [];
    }

    const initialStateJSON = JSON.parse(match[1]);
    const flattenedState = initialStateJSON.flat(Infinity);
    const accountsList: AMEXAccount[] = [];

    let newProduct: AMEXAccount | undefined;
    const productsList = flattenedState.slice(
      flattenedState.indexOf("productsList") + 1
    );

    for (const [i, element] of productsList.entries()) {
      if (element === "product") {
        newProduct = {};
      } else if (newProduct) {
        const value = productsList[i + 1];
        switch (element) {
          case "description":
            newProduct.name = value
              .replace("Card", "")
              .replace("American Express", "")
              .replace("®", "")
              .trim();
            break;
          case "account_key":
            newProduct.key = value;
            break;
          case "account_token":
            newProduct.token = value;
            break;
        }
        if (newProduct.key && newProduct.name && newProduct.token) {
          accountsList.push(newProduct);
          newProduct = undefined;
        }
      }
    }

    // Remove duplicates
    const uniqueAccounts = accountsList.filter(
      (account, index, self) =>
        index === self.findIndex((a) => a.key === account.key)
    );

    console.log("Found AMEX accounts:", uniqueAccounts);
    return uniqueAccounts;
  } catch (error) {
    console.error("Error extracting accounts:", error);
    return [];
  }
};

// Fetch pending transactions from AMEX API
const fetchPendingTransactions = async (
  account: AMEXAccount
): Promise<PendingTransaction[]> => {
  try {
    console.log(`Fetching pending transactions for ${account.name}`);

    const response = await fetch(
      `https://global.americanexpress.com/api/servicing/v1/financials/transactions?limit=1000&status=pending&extended_details=merchant,category,tags,rewards,offer,deferred_details,receipts,flags,plan_details,transaction_codes`,
      {
        headers: {
          account_token: account.token!,
          accept: "application/json",
          "content-type": "application/json",
        },
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched ${data.transactions?.length || 0} pending transactions`);
    return data.transactions || [];
  } catch (error) {
    console.error("Error fetching pending transactions:", error);
    return [];
  }
};

// Download CSV data from AMEX
const downloadCSV = async (account: AMEXAccount): Promise<string> => {
  try {
    console.log(`Downloading CSV for ${account.name}`);

    const startDate = new Date(new Date().getTime() - 86400 * 1000 * 10)
      .toISOString()
      .split("T")[0];
    const endDate = new Date().toISOString().split("T")[0];

    const response = await fetch(
      `https://global.americanexpress.com/api/servicing/v1/financials/documents?file_format=csv&start_date=${startDate}&end_date=${endDate}&limit=30&status=posted&account_key=${account.key}&client_id=AmexAPI&additional_fields=true`,
      {
        headers: {
          accept: "text/csv",
        },
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvData = await response.text();
    console.log(`Downloaded CSV for ${account.name}`);
    return csvData;
  } catch (error) {
    console.error("Error downloading CSV:", error);
    throw error;
  }
};

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_AMEX_DATA") {
    (async () => {
      try {
        sendResponse({ status: "started" });

        const accounts = getAccounts();

        if (accounts.length === 0) {
          chrome.runtime.sendMessage({
            type: "AMEX_DATA_ERROR",
            error: "No AMEX accounts found. Make sure you're logged in and on the AMEX dashboard.",
          });
          return;
        }

        const accountsData: AMEXAccount[] = [];

        for (const account of accounts) {
          try {
            const [csvData, pendingTransactions] = await Promise.all([
              downloadCSV(account),
              fetchPendingTransactions(account),
            ]);

            accountsData.push({
              ...account,
              transactions: csvData,
              pendingTransactions,
            });
          } catch (error) {
            console.error(`Error fetching data for ${account.name}:`, error);
            chrome.runtime.sendMessage({
              type: "STATUS",
              message: `Warning: Could not fetch all data for ${account.name}`,
            });
          }
        }

        chrome.runtime.sendMessage({
          type: "AMEX_DATA_SUCCESS",
          accounts: accountsData,
        });
      } catch (error) {
        console.error("Error in FETCH_AMEX_DATA handler:", error);
        chrome.runtime.sendMessage({
          type: "AMEX_DATA_ERROR",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })();

    return true; // Keep channel open for async response
  }
});

console.log("AMEX YNAB Import content script loaded");
