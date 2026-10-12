import { useCallback, useEffect, useRef, useState } from "react";
import type { SheetScrollTo } from "@/src/shared/components/FormSheet";

// asked from a handler, scrolled in an effect — React Compiler refs rule
export function useSheetScrollTop() {
  const scrollRef = useRef<SheetScrollTo | null>(null);
  const [requests, setRequests] = useState(0);

  useEffect(() => {
    if (requests > 0) scrollRef.current?.(0);
  }, [requests]);

  const scrollToTop = useCallback(() => setRequests((n) => n + 1), []);

  return { scrollRef, scrollToTop };
}
