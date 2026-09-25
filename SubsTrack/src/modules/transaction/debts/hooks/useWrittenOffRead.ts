import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenItem } from "@/src/core/types";
import { useOwedChanged } from "@/src/modules/ledger";

// Read on mount beside the live bills, so the written-off tab never waits.
export function useWrittenOffRead(load: () => Promise<OpenItem[]>) {
  const [items, setItems] = useState<OpenItem[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef(0);

  const read = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    try {
      const open = await load();
      if (tokenRef.current !== token) return;
      setItems(open);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void read();
  }, [read]);
  useOwedChanged(read);

  return { items, loading };
}

const EMPTY: OpenItem[] = [];
