import { useEffect, useState } from "react";
import { copyText } from "@/shared/lib/copyText";

const COPIED_MS = 2000;

// "Copied" shows for two seconds, then the button reads "Copy" again.
export function useCopyText() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (text: string) => {
    if (await copyText(text)) setCopied(true);
  };

  return { copied, copy };
}
