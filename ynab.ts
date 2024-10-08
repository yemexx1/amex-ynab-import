import { Readable } from "stream";
import csv from "csv-parser";
import { AMEXCSVTransaction, PendingTransaction } from "./amex.js";
import ynab, {
  Account as YNABAccount,
  SaveTransaction,
  TransactionsResponse,
  TransactionDetail,
} from "ynab";
import dateFormat from "dateformat";
import moment from "moment"
import "dotenv/config";
import { formatTransaction } from "./index.js";

export interface Account extends Omit<YNABAccount, "last_reconciled_at"> {
  last_reconciled_at?: Date;
  queuedTransactions: SaveTransaction[];
}

const apiToken = process.env.YNAB_API_KEY;
if (!apiToken) throw new Error("You must provide the YNAB API token");

export const budgetId = process.env.BUDGET_ID;
if (!budgetId) throw new Error("You must provide the YNAB budget ID");

export const ynabAPI = new ynab.API(apiToken);

const ynabAmount = (amount: string) =>  {
  return Math.round(-parseFloat(amount) * 1000)
}

const ynabDateFormat = (date: string, format: string) => {
  return moment(date, format).format("YYYY-MM-DD");
};

const ynabAmountFromGermanMoney = (amount: string) =>  {
  let noThousandSeparators = amount.replace(/\./g, '');

  let standardizedFormat = noThousandSeparators.replace(',', '.');

  let valueInEuros = parseFloat(standardizedFormat);

  let valueInCents = valueInEuros * -1000;

  return Math.round(valueInCents);
}

export const deleteTransaction = async (transaction: TransactionDetail) => {
  try {
    await ynabAPI.transactions.deleteTransaction(budgetId, transaction.id);
  } catch (e) {
    console.error(
      "Failed to delete transaction",
      formatTransaction(transaction),
      e
    );
  }
};

export const fetchAccounts = async (): Promise<Account[]> => {
  const {
    data: { accounts: ynabAccounts },
  } = await ynabAPI.accounts.getAccounts(budgetId);

  const accounts: Account[] = ynabAccounts.map((ynabAccount) => ({
    ...ynabAccount,
    last_reconciled_at:
      ynabAccount.last_reconciled_at &&
      ynabAccount.last_reconciled_at.length > 0
        ? new Date(ynabAccount.last_reconciled_at)
        : undefined,
    queuedTransactions: [],
  }));

  console.log(
    `Found YNAB accounts:\n${accounts
      .map((account) => ` - ${account.name}`)
      .join("\n")}\n`
  );
  return accounts;
};

export const fetchTransactions = async (): Promise<TransactionDetail[]> => {
  const {
    data: { transactions },
  } = await ynabAPI.transactions.getTransactions(budgetId);

  console.log(`Fetched ${transactions.length} transactions from YNAB`);

  return transactions;
};

export const convertPendingTransactions = (
  pendingTransactions: PendingTransaction[],
  accountId: string
): SaveTransaction[] => {
  const ynabTransactions: SaveTransaction[] = [];

  pendingTransactions.forEach((t) => {
    let amount = ynabAmount(t.amount.toString());
    const date = t.charge_date;

    const data: SaveTransaction = {
      account_id: accountId,
      approved: false,
      cleared: "uncleared",
      payee_name: t.description,
      amount,
      date,
    };

    const occurrence = ynabTransactions.filter(
      (yt) =>
        yt.payee_name === data.payee_name &&
        yt.amount === data.amount &&
        yt.date === data.date
    ).length;

    ynabTransactions.push({
      ...data,
     import_id: `YNAB-pending:${amount}:${date}:${occurrence + 1}`,
    });
  });
  return ynabTransactions;
};

export const convertCSV = async (
  stream: Readable,
  accountId: string
): Promise<SaveTransaction[]> =>
  new Promise((resolve) => {
    const transactions: AMEXCSVTransaction[] = [];
    const ynabTransactions: SaveTransaction[] = [];
    stream
      .pipe(csv())
      .on("data", (data) => {
        transactions.push(data);
      })
      .on("end", () => {
        transactions.forEach((t) => {
          const amount = ynabAmountFromGermanMoney(t.Betrag);
          const date = ynabDateFormat(t.Datum, "DD/MM/YYYY");

          const data: SaveTransaction = {
            account_id: accountId,
            approved: false,
            cleared: "cleared",
            payee_name: t.Beschreibung,
            amount,
            date,
          };

          const occurrence = ynabTransactions.filter(
            (yt) =>
              yt.payee_name === data.payee_name &&
              yt.amount === data.amount &&
              yt.date === data.date
          ).length;

          ynabTransactions.push({
            ...data,
            import_id: `YNAB:${amount}:${date}:${occurrence + 1}`,
          });
        });

        resolve(ynabTransactions);
      });
  });

export const createTransactions = async (transactions: SaveTransaction[]) => {
  await ynabAPI.transactions.createTransactions(budgetId, {
    transactions,
  });
};
