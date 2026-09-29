import type { ActiveFilter, PageWindow } from "@shared/core/types";

export type CurrencyInput = {
  code: string;
  name: string;
  symbol: string | null;
  ratePerUsd: number;
  decimals: number;
};

export interface CurrencyPageQuery extends PageWindow {
  search: string;
  status: ActiveFilter;
}
