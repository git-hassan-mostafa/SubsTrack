// Append-only audit trail. Rows are built by the app right next to each change —
// never by a Postgres trigger, which would only fire when the row reaches the
// server (at the next sync for an offline device) and so would record the sync
// moment and the syncing session instead of the real action and the real person.
//
// The two call helpers live on the base repositories:
//   BaseRepository.audit(input)           — web/online path
//   OfflineBaseRepository.auditIn(db, in) — native, inside the caller's transaction
//
// See docs/features.md → Audit Trail.
export { buildAuditRow, type AuditInput } from './buildAuditRow';
export { describeAudit } from './describe';
