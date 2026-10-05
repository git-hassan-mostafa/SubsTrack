import type { AuditEntry, PageWindow } from "@shared/core/types";
import auditService from "@shared/modules/admin/audit/services/AuditService";
import {
  NO_AUDIT_FILTER,
  toAuditFilter,
  type AuditFilterChoice,
} from "@shared/modules/admin/audit/utils/filter";
import { createPagedStore, readEveryPage, type PagedQuery } from "./createPagedStore";

function readAuditPage(query: PagedQuery<AuditFilterChoice>, window: PageWindow) {
  return auditService.getEntryTablePage({ ...toAuditFilter(query.filters, query.branch), ...window });
}

export const useAuditTable = createPagedStore<AuditEntry, AuditFilterChoice>(
  readAuditPage,
  NO_AUDIT_FILTER,
  { rereadOnOpen: true },
);

export function readAllAuditEntries(query: PagedQuery<AuditFilterChoice>): Promise<AuditEntry[]> {
  return readEveryPage(readAuditPage, query);
}
