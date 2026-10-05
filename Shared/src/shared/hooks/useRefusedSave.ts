import { useState } from "react";

export interface RefusedSave {
  reasonKey: string | null;
  refuse: (reasonKey: string) => void;
  clear: () => void;
}

// Save stays tappable; a refused tap names what is missing until the form can save.
export function useRefusedSave(canSave: boolean): RefusedSave {
  const [reasonKey, setReasonKey] = useState<string | null>(null);
  if (reasonKey !== null && canSave) setReasonKey(null);
  return {
    reasonKey,
    refuse: setReasonKey,
    clear: () => setReasonKey(null),
  };
}
