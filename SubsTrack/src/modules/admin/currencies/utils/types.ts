export type CurrencyInput = {
    code: string;
    name: string;
    symbol: string | null;
    ratePerUsd: number;
    decimals: number;
};