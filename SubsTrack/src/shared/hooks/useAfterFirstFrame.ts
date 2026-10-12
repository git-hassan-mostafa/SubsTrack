import { useEffect, useState } from "react";

// true one frame after `active` turns on — see gotcha #51
export function useAfterFirstFrame(active = true): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    const handle = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(handle);
      setReady(false);
    };
  }, [active]);

  return active && ready;
}
