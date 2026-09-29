export type Currency = "usd" | "ngn";

export interface GivingOption {
  currency: Currency;
  provider: "stripe" | "paystack";
  testMode: boolean;
  presets: number[];
  min: number;
  max: number;
}

export interface CheckoutStatus {
  status: "open" | "paid" | "expired";
  currency: Currency;
  kind: "one_time" | "monthly";
  amount: number;
  testMode: boolean;
}

export interface Transparency {
  updatedAt: string;
  currencies: {
    currency: Currency;
    open: boolean;
    testMode: boolean;
    received: number;
    fees: number;
    feesPartlyUnknown: boolean;
    gifts: number;
    givers: number;
    monthlyGivers: number;
    expenses: { category: string; label: string; total: number; entries: number }[];
    help: { category: string; label: string; total: number; entries: number }[];
    spent: number;
    helped: number;
    balance: number;
    months: { month: string; received: number; spent: number; helped: number }[];
  }[];
  pledges: { total: number; needs: number; angels: number };
}

export interface MyGiving {
  gifts: {
    id: string;
    kind: string;
    currency: Currency;
    amount: number;
    refunded: number;
    status: string;
    testMode: boolean;
    receivedAt: string;
  }[];
  monthly: {
    id: string;
    currency: Currency;
    amount: number;
    testMode: boolean;
    since: string;
  }[];
}

export const CURRENCY_NAMES: Record<Currency, string> = {
  usd: "US dollars",
  ngn: "Naira",
};

export const PROVIDER_NAMES = { stripe: "Stripe", paystack: "Paystack" } as const;

export function money(amount: number, currency: string) {
  return new Intl.NumberFormat(currency === "ngn" ? "en-NG" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}
