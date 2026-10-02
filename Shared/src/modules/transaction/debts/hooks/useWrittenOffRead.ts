import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenItem } from "@shared/core/types";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";

export interface WrittenOffDebts {
  items: OpenItem[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

// Read on mount beside the live bills, so the written-off tab never waits.
export function useWrittenOffRead(
  load: () => Promise<OpenItem[]>,
): WrittenOffDebts {
  const [items, setItems] = useState<OpenItem[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const read = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    try {
      const open = await load();
      if (tokenRef.current !== token) return;
      setItems(open);
      setError(null);
    } catch (e) {
      if (tokenRef.current === token) setError((e as Error).message);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void read();
  }, [read]);
  useOwedChanged(read);
  const clearError = useCallback(() => setError(null), []);

  return { items, loading, error, clearError };
}

const EMPTY: OpenItem[] = [];
