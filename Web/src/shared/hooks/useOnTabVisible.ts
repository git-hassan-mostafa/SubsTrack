import { useEffect } from "react";

// Tabs stay open for days, so server-side switches are re-read whenever the tab comes back.
export function useOnTabVisible(onVisible: () => void): void {
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === "visible") onVisible();
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, [onVisible]);
}
