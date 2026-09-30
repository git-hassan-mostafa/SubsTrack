# Web — Audit Log Page — QA Scenarios

The **Audit Log** admin page on the desktop web app: every change staff made, newest first, as a numbered, server-paged table. It is built on the shared web table, so first run the table checks in [branches.md](branches.md) §1, §2, §6 and §7 on this page. The trail rules are the phone's: [../audit-log.md](../audit-log.md).

**Reference code:**

- Page: [AuditLogPage.tsx](Web/src/modules/admin/audit/AuditLogPage.tsx), [AuditEntryDialog.tsx](Web/src/modules/admin/audit/AuditEntryDialog.tsx), [RecordHistoryDialog.tsx](Web/src/modules/admin/audit/RecordHistoryDialog.tsx)
- Page state: [auditTable.ts](Web/src/state/auditTable.ts)
- Filter (shared with the phone store): [filter.ts](Shared/src/modules/admin/audit/utils/filter.ts) (unit tests: `tests/suites/auditFilter.test.ts`)
- Server read: `findPage` in [AuditRepository.ts](Shared/src/modules/admin/audit/repository/AuditRepository.ts); phone twin: [AuditRepository.offline.ts](SubsTrack/src/modules/admin/audit/repository/AuditRepository.offline.ts)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project.

---

## 1. The list

| #   | Scenario        | Steps                                              | Expected result                                                                                  |
| --- | --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1.1 | Columns         | Open Admin → Audit Log                             | When, Change, Record type, (Branch with 2+ branches), ⋮ — newest first                           |
| 1.2 | Long sentence   | An entry whose sentence is long                    | The row grows to fit it; nothing is cut off                                                      |
| 1.3 | Paging          | 60+ entries, go to page 2, then 3                  | Page numbers and "of N" are exact; no entry repeats between pages                               |
| 1.4 | No search box   | Look at the toolbar                                | Only filters and the export button — no Add, no search                                          |
| 1.5 | Branch          | Header Branch → Beirut                             | Only Beirut entries plus organization-wide ones; back to page 1                                  |
| 1.6 | Branch column   | Tenant with 2+ branches                            | Branch name, or "Whole organization" for an entry with no branch                                 |
| 1.7 | Staff can't     | Log in as staff, type `/admin/audit`               | Refused by the route guard                                                                       |

## 2. Filters

| #   | Scenario        | Steps                                             | Expected result                                                           |
| --- | --------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| 2.1 | Record type     | Record type → Payment                              | Only payment entries                                                      |
| 2.2 | Action          | Action → Voided                                    | Only void entries                                                         |
| 2.3 | Staff           | Staff → one user                                   | Only that user's entries                                                  |
| 2.4 | Dates           | From 1st, To 10th of this month                    | Only entries of those days (whole days, the 10th included)                |
| 2.5 | Date limits     | Pick From after To                                 | The From picker cannot go past To, and To cannot go before From           |
| 2.6 | Nothing found   | A mix that matches nothing                         | "No results" with Clear filters; pressing it brings every entry back      |
| 2.7 | Kept on return  | Filter, go to another page, come back              | The filters and page number are still there                              |
| 2.8 | Logout          | Filter, log out, log in to another tenant          | Filters cleared, no entry of the first tenant                             |

## 3. Entry details

| #   | Scenario          | Steps                                                 | Expected result                                                                                     |
| --- | ----------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 3.1 | Open              | Click the date in a row (or ⋮ → Details)              | Dialog "Edited · Customer": the sentence, then Customer / Staff / When / Fields changed              |
| 3.2 | Changes           | An edit entry                                          | A table: Field, Before (struck through), After (bold) — one row per field                          |
| 3.3 | Created record    | An "Added" entry                                       | The record's fields as label / value rows; hidden columns (ids, tenant) are not shown               |
| 3.4 | Nothing recorded  | An entry with no fields                                | "No field values recorded."                                                                          |
| 3.5 | Record history    | ⋮ → History of this record                            | The Change history dialog for that one record, with its name under the title                        |
| 3.6 | From a history    | Any page → ⋮ → History → click an entry               | The same entry details dialog opens on top; Close goes back to the history                          |

## 4. Export

| #   | Scenario      | Steps                                          | Expected result                                                              |
| --- | ------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| 4.1 | This page     | Export → Only this page                        | A CSV of the rows on screen                                                  |
| 4.2 | All matching  | Filter to one week → Export → All matching rows | A CSV of every entry of that week, not only the page                         |
