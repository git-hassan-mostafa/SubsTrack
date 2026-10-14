import { useEffect } from "react";

// Prompts the browser's reload/close confirmation when the form is dirty.
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [active]);
}
