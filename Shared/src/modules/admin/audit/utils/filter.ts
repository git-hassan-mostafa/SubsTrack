import type { BranchFilter } from "@shared/core/constants";
import type { AuditAction, AuditFilter, AuditTable } from "@shared/core/types";

export interface AuditFilterChoice {
  table: AuditTable | null;
  action: AuditAction | null;
  actor: string | null;
  from: string | null;
  to: string | null;
}

export const NO_AUDIT_FILTER: AuditFilterChoice = {
  table: null,
  action: null,
  actor: null,
  from: null,
  to: null,
};

export const AUDIT_ACTIONS: AuditAction[] = [
  "create",
  "update",
  "delete",
  "void",
  "restore",
];

export function hasAuditFilter(choice: AuditFilterChoice): boolean {
  return Object.values(choice).some((value) => value !== null);
}

// The picked days are whole UTC days, matching how occurred_at is stored.
export function toAuditFilter(
  choice: AuditFilterChoice,
  branchFilter: BranchFilter,
): AuditFilter {
  return {
    table: choice.table ?? undefined,
    action: choice.action ?? undefined,
    actorUserId: choice.actor ?? undefined,
    from: choice.from ? `${choice.from}T00:00:00.000Z` : undefined,
    to: choice.to ? `${choice.to}T23:59:59.999Z` : undefined,
    branchFilter,
  };
}
