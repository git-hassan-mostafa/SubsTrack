import { useEffect } from "react";
import {
  useClientOutdated,
  useOptionSlice,
} from "@shared/state/hooks/useOptionSlice";

// Tabs stay open for days, so MinClientVersion is re-read whenever the tab comes back.
export function useClientGate(): boolean {
  const fetchOptions = useOptionSlice((s) => s.fetchOptions);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchOptions();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchOptions]);

  return useClientOutdated();
}
