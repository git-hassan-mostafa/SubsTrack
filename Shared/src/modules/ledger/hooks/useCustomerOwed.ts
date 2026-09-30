import { useEffect, useState } from "react";
import type { Customer, OpenItem } from "@shared/core/types";
import { useLoadOwed } from "./useLoadOwed";

export interface CustomerOwed {
  loading: boolean;
  owed: OpenItem[];
  failed: boolean;
  nothingOwed: boolean;
}

interface OwedResult {
  customerId: string;
  owed: OpenItem[] | null;
}

// Keyed by customer: a pick never shows the last customer's bills under the new name.
export function useCustomerOwed(customer: Customer | null): CustomerOwed {
  const loadOwed = useLoadOwed();
  const [result, setResult] = useState<OwedResult | null>(null);

  useEffect(() => {
    if (!customer) return;
    let current = true;
    void loadOwed(customer).then((owed) => {
      if (current) setResult({ customerId: customer.id, owed });
    });
    return () => {
      current = false;
    };
  }, [customer, loadOwed]);

  const theirs = customer && result?.customerId === customer.id ? result : null;
  return {
    loading: customer !== null && theirs === null,
    owed: theirs?.owed ?? [],
    failed: theirs !== null && theirs.owed === null,
    nothingOwed: theirs?.owed?.length === 0,
  };
}
