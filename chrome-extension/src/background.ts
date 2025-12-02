import { SaveTransactionWithIdOrImportId, TransactionDetail } from "ynab";
import stringSimilarity from "string-similarity";
import {
  initYNAB,
  fetchAccounts,
  fetchTransactions,
  convertCSV,
  convertPendingTransactions,
  createTransactions,
  deleteTransaction,
  Account,
} from "./ynab";
import { AMEXAccount } from "./types";

const formatTransaction = (t: TransactionDetail | SaveTransactionWithIdOrImportId) =>
  `${t.account_id}: $${t.amount! / 1000} at ${t.payee_name} on ${t.date}`;

const sendStatus = (message: string, progress?: number) => {
  chrome.runtime.sendMessage({
    type: "STATUS",
    message,
    progress,
  });
};

const sendError = (message: string) => {
  chrome.runtime.sendMessage({
    type: "ERROR",
    message,
  });
};

const sendSuccess = (message: string) => {
  chrome.runtime.sendMessage({
    type: "SUCCESS",
    message,
  });
};

// Main import logic
const processImport = async (
  ynabKey: string,
  budgetId: string,
  amexAccounts: AMEXAccount[]
) => {
  try {
    // Initialize YNAB API
    initYNAB(ynabKey, budgetId);

    sendStatus("Fetching YNAB accounts...", 10);
    const ynabAccounts = await fetchAccounts();

    sendStatus("Fetching existing YNAB transactions...", 20);
    const ynabTransactions = await fetchTransactions();

    sendStatus("Processing AMEX accounts...", 30);

    // Match AMEX accounts to YNAB accounts and convert transactions
    for (const amexAccount of amexAccounts) {
      const ynabAccount = ynabAccounts.find(
        (ynabAccount) => ynabAccount.name === amexAccount.name
      );

      if (!ynabAccount) {
        console.warn(
          `No YNAB account named "${amexAccount.name}". Skipping.`
        );
        sendStatus(`Warning: No YNAB account found for "${amexAccount.name}"`);
        continue;
      }

      const csvTransactions = amexAccount.transactions
        ? await convertCSV(amexAccount.transactions, ynabAccount.id)
        : [];

      const pendingTransactions = amexAccount.pendingTransactions
        ? convertPendingTransactions(
            amexAccount.pendingTransactions,
            ynabAccount.id
          )
        : [];

      ynabAccount.queuedTransactions = [
        ...csvTransactions,
        ...pendingTransactions,
      ];
    }

    sendStatus("Matching and deduplicating transactions...", 50);

    const readyAccounts = ynabAccounts.filter(
      (ynabAccount) => ynabAccount.queuedTransactions.length > 0
    );

    if (readyAccounts.length === 0) {
      sendSuccess("No new transactions to import");
      return;
    }

    readyAccounts.forEach((ynabAccount) => {
      console.log(`${ynabAccount.name} may have some transactions imported`);
    });

    const unfilteredImportTransactions = readyAccounts
      .map((ynabAccount) => ynabAccount.queuedTransactions)
      .flat();

    // Remove voiding transactions (refunds that cancel out)
    let importTransactions: SaveTransactionWithIdOrImportId[] =
      unfilteredImportTransactions.reduce(
        (transactions, parentTransaction) => {
          const voidingTransaction = transactions.find(
            (t) =>
              t.cleared === "uncleared" &&
              t.amount === -parentTransaction.amount! &&
              t.payee_name === parentTransaction.payee_name &&
              t.date === parentTransaction.date
          );
          if (voidingTransaction) {
            console.log(
              `Transaction ${formatTransaction(
                parentTransaction
              )} has a voiding transaction, ignoring...`
            );
            transactions = transactions.filter(
              (t) => t !== voidingTransaction && t !== parentTransaction
            );
          }
          return transactions;
        },
        [...unfilteredImportTransactions]
      );

    sendStatus("Processing pending transactions...", 60);

    const staleTransactions: TransactionDetail[] = [];
    const pendingTransactionsThatPosted: TransactionDetail[] = [];

    const pendingExistingTransactions = ynabTransactions.filter(
      (t) =>
        t.cleared === "uncleared" &&
        !t.deleted &&
        readyAccounts.find((account) => account.name === t.account_name)
    );

    for (const existingPendingTransaction of pendingExistingTransactions) {
      const matchedImportTransaction = importTransactions.find((t) => {
        const dateMatch =
          Math.abs(
            new Date(t.date as string).getTime() -
              new Date(existingPendingTransaction.date as string).getTime()
          ) <=
          86400 * 3 * 1000;

        const existingCurrentAmount = existingPendingTransaction.amount;

        const existingOriginalAmount = existingPendingTransaction.import_id
          ? parseFloat(existingPendingTransaction.import_id.split(":")[1])
          : existingCurrentAmount;

        const amountMatch =
          t.amount === existingCurrentAmount ||
          (!t.cleared && t.amount === existingOriginalAmount);

        const cleanImportName = (payeeName: string) =>
          payeeName.replace("Aplpay ", "").replace("Tst* ", "");

        let payeeMatch = false;

        let importPayeeName = t.payee_name;

        let existingPayeeName =
          existingPendingTransaction.import_payee_name ||
          existingPendingTransaction.payee_name;

        if (importPayeeName && existingPayeeName) {
          importPayeeName = importPayeeName.trim();

          existingPayeeName = cleanImportName(existingPayeeName);

          payeeMatch =
            importPayeeName === existingPayeeName ||
            stringSimilarity.compareTwoStrings(
              importPayeeName,
              existingPayeeName
            ) >= 0.25;
        }

        return dateMatch && amountMatch && payeeMatch;
      });

      if (
        matchedImportTransaction &&
        matchedImportTransaction.cleared === "uncleared"
      ) {
        console.log(
          `Transaction ${formatTransaction(
            existingPendingTransaction
          )} still pending`
        );

        if (
          existingPendingTransaction.date !== matchedImportTransaction.date ||
          existingPendingTransaction.import_id !==
            matchedImportTransaction.import_id
        ) {
          console.log(
            `Pending transaction ${formatTransaction(
              existingPendingTransaction
            )} has changed. Ignoring to prevent duplicate...`
          );
          importTransactions = importTransactions.filter(
            (t) => t !== matchedImportTransaction
          );
        }
        continue;
      } else if (matchedImportTransaction) {
        const bannedPayeeNameStarts = [
          "Transfer : ",
          "Starting Balance",
          "Manual Balance Adjustment",
          "Reconciliation Balance Adjustment",
        ];

        if (
          !bannedPayeeNameStarts.some((payeeNameStart) =>
            matchedImportTransaction.payee_name?.startsWith(payeeNameStart)
          )
        )
          matchedImportTransaction.payee_name =
            existingPendingTransaction.payee_name;

        matchedImportTransaction.approved = existingPendingTransaction.approved;
        matchedImportTransaction.category_id =
          existingPendingTransaction.category_id;
        matchedImportTransaction.memo = existingPendingTransaction.memo;
        matchedImportTransaction.subtransactions =
          existingPendingTransaction.subtransactions;

        if (
          !["red", "orange", "yellow", "green", "blue", "purple"].includes(
            matchedImportTransaction.flag_color || ""
          )
        )
          matchedImportTransaction.flag_color = undefined;

        console.log(
          `Transaction ${formatTransaction(
            existingPendingTransaction
          )} posted. Copying over data.`
        );
        pendingTransactionsThatPosted.push(existingPendingTransaction);
      } else {
        staleTransactions.push(existingPendingTransaction);
      }
    }

    sendStatus("Cleaning up stale transactions...", 70);

    for (const transaction of staleTransactions) {
      console.log(
        `Clearing out stale transaction ${formatTransaction(transaction)}`
      );
      await deleteTransaction(transaction);
    }

    for (const transaction of pendingTransactionsThatPosted) {
      console.log(
        `Clearing out pending transaction that posted: ${formatTransaction(
          transaction
        )}`
      );
      await deleteTransaction(transaction);
    }

    sendStatus(`Importing ${importTransactions.length} transactions...`, 80);

    if (importTransactions.length > 0) {
      await createTransactions(importTransactions);
      sendSuccess(
        `Successfully imported ${importTransactions.length} transaction(s)!`
      );
    } else {
      sendSuccess("No new transactions to import");
    }
  } catch (error) {
    console.error("Import error:", error);
    sendError(
      error instanceof Error ? error.message : "Unknown error during import"
    );
  }
};

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_IMPORT") {
    const { ynabKey, budgetId } = message.payload;

    sendStatus("Opening AMEX page...", 5);

    // Open or focus AMEX dashboard tab
    chrome.tabs.query(
      { url: "https://global.americanexpress.com/*" },
      (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          // Focus existing tab
          chrome.tabs.update(tabs[0].id, { active: true }, (tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, { type: "FETCH_AMEX_DATA" });
            }
          });
        } else {
          // Create new tab
          chrome.tabs.create(
            { url: "https://global.americanexpress.com/dashboard" },
            (tab) => {
              if (tab.id) {
                // Wait for page to load before sending message
                chrome.tabs.onUpdated.addListener(function listener(
                  tabId,
                  info
                ) {
                  if (tabId === tab.id && info.status === "complete") {
                    chrome.tabs.onUpdated.removeListener(listener);
                    chrome.tabs.sendMessage(tab.id!, {
                      type: "FETCH_AMEX_DATA",
                    });
                  }
                });
              }
            }
          );
        }
      }
    );

    sendResponse({ status: "started" });
    return true;
  }

  if (message.type === "AMEX_DATA_SUCCESS") {
    const { accounts } = message;
    const { ynabKey, budgetId } = message.config || {};

    if (!ynabKey || !budgetId) {
      // Get config from storage
      chrome.storage.sync.get(["ynabKey", "budgetId"], (data) => {
        processImport(data.ynabKey, data.budgetId, accounts);
      });
    } else {
      processImport(ynabKey, budgetId, accounts);
    }

    return true;
  }

  if (message.type === "AMEX_DATA_ERROR") {
    sendError(message.error);
    return true;
  }
});

console.log("AMEX YNAB Import background script loaded");
