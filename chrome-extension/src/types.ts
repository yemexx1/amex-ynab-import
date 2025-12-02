export interface AMEXCSVTransaction {
  Datum: string;
  Beschreibung: string;
  Betrag: string;
  "Weitere Details": string;
  "Erscheint auf Ihrer Abrechnung als": string;
  Adresse: string;
  Stadt: string;
  PLZ: string;
  Land: string;
  Betreff: string;
}

export interface AMEXAccount {
  name?: string;
  key?: string;
  token?: string;
  transactions?: string;
  pendingTransactions?: PendingTransaction[];
}

export type PendingTransaction = {
  identifier: string;
  description: string;
  charge_date: string;
  supplementary_index: string;
  amount: number;
  type: string;
  reference_id: string;
  first_name: string;
  last_name: string;
  embossed_name: string;
  account_token: string;
  charge_timestamp: string;
  extended_details: {
    merchant: {
      identifier: string;
      chain_affiliated_identifier: string;
      name: string;
      address: {
        address_lines: string[];
        country_name: string;
        postal_code: string;
        city: string;
        state: string;
      };
      display_name: string;
      phone_number: string;
      merchant_url: string;
      additional_url: string;
      store_front_indicator: boolean;
      map_eligibility_indicator: boolean;
      geo_location: {
        latitude: string;
        longitude: string;
      };
    };
    additional_description_lines: string[];
    category: {
      category_name: string;
      subcategory_name: string;
      category_code: string;
      subcategory_code: string;
    };
    rewards: {
      display_indicator: string;
    };
  };
};

export interface ImportConfig {
  ynabKey: string;
  budgetId: string;
}

export interface StatusMessage {
  type: "STATUS" | "ERROR" | "SUCCESS";
  message: string;
  progress?: number;
}
