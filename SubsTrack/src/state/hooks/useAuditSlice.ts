import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { AuditSlice } from '@/src/state/slices/audit/auditSlice';

export function useAuditSlice(): AuditSlice;
export function useAuditSlice<T>(selector: (state: AuditSlice) => T): T;
export function useAuditSlice<T = AuditSlice>(selector?: (state: AuditSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.audit;
    return selector ? selector(slice) : (slice as T);
  });
}
