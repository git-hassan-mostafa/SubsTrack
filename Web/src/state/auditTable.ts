import type { AuditEntry, AuditPageQuery, PageWindow } from "@shared/core/types";
import auditService from "@shared/modules/admin/audit/services/AuditService";
import {
  NO_AUDIT_FILTER,
  toAuditFilter,
  type AuditFilterChoice,
} from "@shared/modules/admin/audit/utils/filter";
import { readAllPages } from "@shared/shared/hooks/loadAllPages";
import {
  createPagedStore,
  EXPORT_PAGE_SIZE,
  pageWindow,
  type PagedQuery,
} from "./createPagedStore";

function toAuditQuery(query: PagedQuery<AuditFilterChoice>, window: PageWindow): AuditPageQuery {
  return { ...toAuditFilter(query.filters, query.branch), ...window };
}

export const useAuditTable = createPagedStore<AuditEntry, AuditFilterChoice>(
  (query) => auditService.getEntryTablePage(toAuditQuery(query, pageWindow(query))),
  NO_AUDIT_FILTER,
  { rereadOnOpen: true },
);

export function readAllAuditEntries(query: PagedQuery<AuditFilterChoice>): Promise<AuditEntry[]> {
  return readAllPages(
    (window) => auditService.getEntryTablePage(toAuditQuery(query, window)),
    EXPORT_PAGE_SIZE,
  );
}
