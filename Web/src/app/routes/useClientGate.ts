import {
  useClientOutdated,
  useOptionSlice,
} from "@shared/state/hooks/useOptionSlice";
import { useOnTabVisible } from "@/shared/hooks/useOnTabVisible";

export function useClientGate(): boolean {
  const fetchOptions = useOptionSlice((s) => s.fetchOptions);
  useOnTabVisible(fetchOptions);
  return useClientOutdated();
}
