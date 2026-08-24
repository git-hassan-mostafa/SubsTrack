# Audit Trail — QA Scenarios

Covers the append-only `audit_logs` trail: who changed what, when, and what the value was before. Written **by the app** next to each change — never by a Postgres trigger — because a trigger only fires when the row reaches the server, which for an offline device is at the next sync (it would record the sync moment and the syncing session, and an offline device would hold no history at all).

The device keeps a rolling **30-day window**; the server keeps everything.

**Reading is server-first, with no button to press.** Opening any of the three views fetches the **complete server history** and merges in this device's **un-pushed** (`_dirty = 1`) entries, which exist nowhere else yet. With no connection — or if the server can't be reached — it falls back to the local 30-day window and the note above the list says so. There is no "Load full history" action any more.

**Reference code:**

- Row builder: [buildAuditRow.ts](../SubsTrack/src/core/audit/buildAuditRow.ts) (diff, actor, `null` when nothing changed), [describe.ts](../SubsTrack/src/core/audit/describe.ts) (the frozen `label`)
- Call helpers: [BaseRepository.ts](../SubsTrack/src/core/utils/BaseRepository.ts) (`audit`, `auditedUpdate`, `auditedDelete`), [OfflineBaseRepository.ts](../SubsTrack/src/core/offline/OfflineBaseRepository.ts) (`auditIn` — inside the caller's transaction)
- Sync flags: [tables.ts](../SubsTrack/src/core/offline/db/tables.ts) (`appendOnly`, `pullDays`, `ColType: 'json'`), [sync/push.ts](../SubsTrack/src/core/offline/sync/push.ts) (`ignoreDuplicates`) + [sync/pull.ts](../SubsTrack/src/core/offline/sync/pull.ts) (window filter, `pruneWindowedTables`)
- Read path: [AuditRepository.ts](../SubsTrack/src/modules/admin/audit/repository/AuditRepository.ts) / [.offline.ts](../SubsTrack/src/modules/admin/audit/repository/AuditRepository.offline.ts), [AuditService.ts](../SubsTrack/src/modules/admin/audit/services/AuditService.ts)
- UI: [AuditLogScreen.tsx](../SubsTrack/src/modules/admin/audit/screens/AuditLogScreen.tsx), [AuditEntrySheet.tsx](../SubsTrack/src/modules/admin/audit/components/AuditEntrySheet.tsx), [HistorySheet.tsx](../SubsTrack/src/modules/admin/audit/components/HistorySheet.tsx) (the shared shell), [RecordHistorySheet.tsx](../SubsTrack/src/modules/admin/audit/components/RecordHistorySheet.tsx), [CustomerHistorySheet.tsx](../SubsTrack/src/modules/customer/customers/components/CustomerHistorySheet.tsx)
- Timeline hooks: [useRecordHistory.ts](../SubsTrack/src/modules/admin/audit/hooks/useRecordHistory.ts) (`useRecordHistory` + `useCustomerHistory`), table set in [constants.ts](../SubsTrack/src/modules/admin/audit/utils/constants.ts) (`CUSTOMER_HISTORY_TABLES`)
- Per-list History action: [useRecordHistoryAction.tsx](../SubsTrack/src/modules/admin/audit/hooks/useRecordHistoryAction.tsx), wired in the products / plans / users / branches / currencies list screens and in [SaleDetailSheet.tsx](../SubsTrack/src/modules/transaction/sales/components/SaleDetailSheet.tsx), plus the stock history rows in [ProductStockSheet.tsx](../SubsTrack/src/modules/admin/products/components/ProductStockSheet.tsx)
- Display: [valueDisplay.ts](../SubsTrack/src/modules/admin/audit/utils/valueDisplay.ts) (per-column display registry), [format.ts](../SubsTrack/src/modules/admin/audit/utils/format.ts) (generic fallback), [useAuditLookups.ts](../SubsTrack/src/modules/admin/audit/hooks/useAuditLookups.ts) (id → name)
- Server: `sql scripts/script.sql` → `AUDIT LOGS` section + the `audit_logs_select` / `audit_logs_insert` policies
- Strings: the `audit.*` group in `en.json` / `ar.json`

> **Run `sql scripts/script.sql` first.** The client pushes a column set the server must already have.

---

## 0. Critical invariants

1. **The trail records the real person and the real moment.** `occurred_at` is the device clock when the staff member acted — never the sync time. A payment recorded offline at 09:00 and synced at 17:00 must read 09:00.
2. **An edit records the OLD value.** This is the whole point: editing a payment from 50 to 30 must show `50 → 30`.
3. **A no-op save records nothing.** Opening a form and saving without changing a field must add no entry. Most likely invariant to regress.
4. **It works offline.** Recording, editing and voiding with no connection must all produce local entries immediately.
5. **Admins only can read it.** Staff can write entries but never see one — that is what makes the trail useful in a staff-vs-admin dispute.
6. **It cannot be edited or erased from the app.** No UPDATE and no DELETE policy exists.
7. **A change and its entry are inseparable offline** — they commit in one transaction, so there is never a change without its trail (or vice versa).
8. **An un-pushed entry is never pruned**, no matter how old: it is the only copy in existence.

---

## 1. What gets recorded (online and offline both)

Sign in as an **admin** and check each via Admin → Audit Log.

| #   | Scenario              | Steps                                                            | Expected entry                                                              |
| --- | --------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1.1 | Record a payment      | Customer → tap an unpaid month → pay in full                      | **Added · Payment** naming the customer, actor = you, and the whole new row listed (month, amount, currency) |
| 1.2 | Edit a payment amount | Payment detail → Edit → change 50 → 30 → Save                     | **Edited · Payment**, one field: `Amount paid  50 → 30`                     |
| 1.3 | Void a payment        | Payment detail → Void                                             | **Voided · Payment**, fields `Voided at` + `Voided by` (and notes if given)  |
| 1.4 | Record a sale         | Quick actions → Record sale (2+ products)                         | **Added · Sale** — exactly ONE entry, not one per line                       |
| 1.5 | Void a sale           | Sale detail → Void                                                | **Voided · Sale**. No separate `stock_movements` entries                     |
| 1.5b | Restock a product    | Product menu → Adjust Stock → Add 10 → Save                       | **Nothing.** A stock entry is its own create record — only an *edit* or a *revert* of one is audited |
| 1.5c | Edit a stock entry   | Stock sheet → row menu → Edit entry → 12 → 10 → Save Changes       | **Edited · Stock entry**, one field `Quantity  12 → 10`; the subject pill and the detail sheet's top row name the **Product** (cube icon, not a person) — see [products.md](products.md) §6C |
| 1.5d | Revert a stock entry | Stock sheet → row menu → Revert entry → confirm                    | **Voided · Stock entry**, fields `Voided at, Voided by`; the subject is the **Product**, like an edit — see [products.md](products.md) §6D |
| 1.6 | Custom debt + payment | Add a custom debt, then record a debt payment                      | **Added · Custom debt**, then **Added · Debt payment**                       |
| 1.7 | Receive cash          | Admin → Wallets → receive one transaction                          | **Edited**, field `Held by  <collector> → <you>` (no `Settled at` — it stayed in the chain) |
| 1.7b | Close out cash       | My Wallet (tenant-wide admin) → Close out                          | **Edited**, fields `Held by  <you> → (empty)` + `Settled at` + `Settled by`  |
| 1.8 | Add a customer        | Customers → + Add                                                  | **Added · Customer**, whole new row listed in the detail sheet               |
| 1.9 | Edit a customer       | Change only the phone number → Save                                | **Edited · Customer**, ONE field: `Phone  old → new`                         |
| 1.10 | Deactivate a customer | Customer → deactivate                                             | **Edited · Customer**, `Active  Yes → No` + `Cancelled`                      |
| 1.11 | Reactivate a customer | Customer → reactivate                                             | **Restored · Customer** (not "Edited")                                       |
| 1.12 | Delete a customer     | Delete one with no payments                                        | **Deleted · Customer**, detail shows the whole removed row                    |
| 1.13 | Skip / unskip a month | Skip a month, then unskip it                                       | **Added · Skipped month**, then **Restored · Skipped month**                  |
| 1.14 | Plans / products      | Add, edit, then delete a plan and a product                        | Added / Edited / Deleted entries for each                                    |
| 1.15 | Branch, currency      | Add + rename a branch; change a currency rate                      | Entries with the changed field only                                          |
| 1.16 | Staff member          | Add a user, change their role, deactivate them                      | Added, then `Role  user → admin`, then `Active  Yes → No`                     |
| 1.17 | Change a password     | Staff → change password                                            | **Edited · Staff member** — and the password value is **NOT** recorded        |
| 1.18 | Tenant setting        | Admin → Tenant Settings → switch the unpaid rule                    | **Edited · Setting**, fields changed reads "Unpaid months rule", one diff row with the two rules in words (see 6c) |
| 1.19 | Bulk actions          | Select 3 customers → bulk deactivate                                | **3** entries, one per customer — not one lumped entry                       |

### 1b. What must NOT be recorded

| #    | Scenario                     | Steps                                                              | Expected                                                     |
| ---- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1.20 | No-op save                   | Open Edit customer → change nothing → Save                          | **No new entry** (invariant 3)                               |
| 1.21 | No-op payment edit           | Payment → Edit → re-enter the same amount → Save                     | **No new entry**                                             |
| 1.22 | Sale lines / stock movements | After 1.4, filter by every record type                              | No `sale_items` type exists; no stock entries from the sale   |
| 1.23 | Sync pull                    | Change a customer on device B → sync device A                        | Device A gains **no** entry of its own for that pull          |
| 1.24 | Adding stock                 | Product → stock sheet → restock                                     | No audit entry (the stock ledger already is one, with a note) |
| 1.25 | Child rows on a parent edit  | Customer with 2+ plan lines → Edit → change **only** the customer's name → Save → open the entry | Exactly **one** changed field, `Name`. **No** `customer_plans` row, and no raw JSON anywhere in the sheet (gotcha #64) |
| 1.26 | …on a plan line edit         | Edit one service line's start date → Save → open the entry           | Only the line's own columns; **no** `plans` row from the join |
| 1.27 | …web and native agree        | Repeat 1.25 on web and on the native app                             | Same single changed field on both — the online path joins, the offline path doesn't, and neither may leak children |
| 1.28 | Blank optional field         | Void a sale leaving the reason box **empty** → open the entry         | `Voided at` and `Voided by` only. **No** `Void reason` row (a blank string over NULL is not a change, gotcha #65) |
| 1.29 | …a real reason still records | Void another sale **with** a reason → open the entry                  | `Void reason` recorded, `(empty) → wrong item`                |

---

## 2. Offline behaviour

Turn on airplane mode for each. Use Settings → Developer → `audit_logs` to inspect raw rows.

| #   | Scenario                    | Steps                                                                    | Expected result                                                                |
| --- | --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 2.1 | Offline write               | Offline: record a payment, edit it, void it                                | 3 rows in `audit_logs`, all `_dirty = 1`, correct username                      |
| 2.2 | Offline read               | Offline: open Admin → Audit Log                                            | The entries show; note reads "No connection — last 30 days saved on this device". **No "Load full history" action anywhere** |
| 2.3 | Real action time            | Note the clock, record a payment offline, wait, go online, sync            | `occurred_at` = when you recorded it, **not** the sync time (invariant 1)       |
| 2.4 | Push                        | From 2.1 → go online → wait for sync (or Settings → Sync now)               | The 3 rows become `_dirty = 0` and appear in Supabase `audit_logs`              |
| 2.5 | Server-first on open        | Online → open Admin → Audit Log                                            | Loads the full server history immediately, no tap needed; note reads "showing the full history from the server"; entries older than 30 days are present |
| 2.6 | Un-pushed rows are merged   | Airplane mode → record a payment → **before** syncing, disable airplane mode and open the Audit Log **while the row is still `_dirty = 1`** | The new entry appears at the top **together with** the server's entries — a server-only read would have hidden it |
| 2.6b | …and never twice           | From 2.6 → let the sync push the row → pull-to-refresh                     | The entry appears exactly **once** (de-duped by id), still in date order        |
| 2.6c | Server unreachable          | Connected to Wi-Fi with no internet (or stop the server) → open the Audit Log | Falls back to the local window with the "No connection" note — never an error screen, never an empty list |
| 2.7 | Change + trail are atomic   | Offline: record a payment, then force-quit the app immediately; reopen      | Either both the payment and its entry exist, or neither. Never one alone        |
| 2.8 | Second device sees it       | Device A (staff) records offline → syncs. Device B (admin) syncs             | B's Audit Log shows A's entries with A's username and A's action time           |
| 2.9 | Org switch is not blocked   | Offline, with un-pushed audit rows only → log out → log in to another org    | Login is **not** refused (a log is not the user's money)                        |

---

## 3. The 30-day window and pruning

| #   | Scenario                     | Steps                                                                                    | Expected result                                              |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 3.1 | Old rows pruned              | Developer: set a synced row's `occurred_at` back 40 days → sync (or restart the app)      | The row is gone locally; it still exists in Supabase          |
| 3.2 | Un-pushed rows survive       | Set a row 40 days back **and** `_dirty = 1` → sync                                       | The row **survives** (invariant 8) — never deleted by age     |
| 3.3 | Recent rows kept             | A row 5 days old → sync                                                                   | Still there                                                   |
| 3.4 | Pull is windowed             | Fresh install → first sync                                                                | Only the last 30 days of the tenant's entries arrive          |
| 3.5 | Older history is online-only | Look for an entry 60 days old: online, then in airplane mode                              | Present online (server read); absent offline (outside the window) |
| 3.6 | Offline for a long time      | Stay offline past 30 days (or backdate the device) → reopen the app                        | Prune still runs at startup; nothing un-pushed is lost        |

---

## 4. Permissions (RLS)

| #   | Scenario                   | Steps                                                              | Expected result                                                                     |
| --- | -------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 4.1 | Staff cannot see the menu  | Sign in as `user` → open the app                                    | No Admin tab at all, so no Audit Log                                                |
| 4.2 | Staff still writes         | As `user`: record a payment → sync → check Supabase                 | The entry **is** on the server with that user as actor                               |
| 4.3 | Staff pull returns nothing | As `user`: sync → Developer → `audit_logs`                          | Only that device's own rows; no colleague's entries (intended, invariant 5)          |
| 4.4 | Branch admin scoping       | Branch-scoped admin opens Audit Log                                 | Only their branch's records, plus tenant-wide ones (currencies, settings)            |
| 4.5 | Tenant-wide admin          | Admin with `branch_id = null` and the picker on **All Branches**     | Every branch's entries                                                              |
| 4.6 | Append-only                | Try `update` and `delete` on `audit_logs` as an authenticated client  | Both refused; the row is unchanged                                                   |
| 4.7 | Cross-tenant               | Sign in to another organization                                      | None of the first organization's entries are visible                                |
| 4.8 | Per-record History gating  | Open a payment's detail sheet as `user`, then as admin                | The **History** action shows for the admin only                                     |

### 4b. Branch picker narrows the trail

RLS only scopes a branch-**bound** user. A tenant-wide admin sees every branch, so their header branch chip must narrow the query itself. Tenant-wide records (plans, settings, staff — `branch_id IS NULL`) always stay visible, since they belong to no branch.

| #    | Scenario                          | Steps                                                                                   | Expected result                                                                          |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 4b.1 | Pick a branch                     | Tenant-wide admin, 2+ branches with activity → Audit Log → pick **Branch A** in the chip   | Only Branch A's entries remain. Branch B's entries **disappear** (this was the bug)      |
| 4b.2 | Tenant-wide rows survive          | Same as 4b.1, having also edited a plan / a tenant setting / a staff member                | Those entries are **still listed** — they belong to no branch                            |
| 4b.3 | Switch branches                   | Switch the chip from Branch A to Branch B                                                  | The list refetches immediately; A's entries go, B's arrive                               |
| 4b.4 | Back to All Branches              | Set the chip back to **All Branches**                                                      | Every branch's entries return                                                            |
| 4b.5 | Unassigned                        | Pick the **Unassigned** option (if shown)                                                  | Only entries whose `branch_id IS NULL`                                                   |
| 4b.6 | Combined with other filters       | Pick Branch A **and** the Payment record type **and** a staff member                       | All three narrow together (AND), not one overriding the others                           |
| 4b.7 | Paging keeps the branch           | With Branch A picked, scroll to load page 2                                                | Page 2 is also Branch A only — no other branch leaks in on the second page               |
| 4b.8 | Full-history scope                | Pick Branch A → switch the scope to the complete server history                            | Still Branch A only                                                                      |
| 4b.9 | Offline parity (native)           | Go offline → repeat 4b.1 and 4b.3 against the local 30-day window                          | Same narrowing from the SQLite mirror                                                    |
| 4b.10 | Branch-bound admin is unaffected | Branch-scoped admin (chip hidden for them)                                                 | Still sees only their branch + tenant-wide rows, exactly as in 4.4                       |
| 4b.11 | Return to screen                  | Pick Branch A → navigate away → come back                                                  | Branch A is still applied (the chip selection persists) and the list refetches            |
| 4b.12 | Per-record History unchanged      | Open one payment's **History** sheet while Branch A is picked                              | That record's full timeline shows regardless of the chip — it is scoped to the record     |

---

## 5. Filters, paging and the list

| #   | Scenario              | Steps                                                                | Expected result                                                            |
| --- | --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 5.1 | Record-type filter    | Pick **Payment**                                                      | Only payment entries                                                       |
| 5.1b | Record-type list     | Open the Record type dropdown                                          | 13 options, including **Stock entry**; picking it shows only stock-entry edits |
| 5.2 | Action filter         | Pick **Voided**                                                       | Only voids                                                                 |
| 5.3 | Staff filter          | Pick a staff member                                                   | Only that person's actions                                                 |
| 5.4 | Date range            | Set From/To to a single past day                                       | Only that day, bounds inclusive at both ends                               |
| 5.5 | Combined              | Payment + Voided + one staff member                                    | All three applied together                                                 |
| 5.6 | Clear filters         | With filters set → tap **Clear filters**                               | Chip clears; full list returns; the pill disappears                        |
| 5.7 | Filtered empty state  | Filter to a combination with no rows                                    | "No matching changes / Try changing the filters" — not the first-run text   |
| 5.8 | First-run empty state | A brand-new organization opens the Audit Log                            | "Nothing recorded yet / Changes staff make will appear here"                |
| 5.9 | Paging (offline)      | Airplane mode, 150+ local entries → scroll to the bottom repeatedly       | More load each time; **no stop after the first page** (the local window pages by 100) |
| 5.10 | Paging (online)      | Online, 150+ entries → scroll to the bottom repeatedly                    | Keeps loading (the server pages by 30). With un-pushed rows merged into page 1, paging **still continues** — the "is there more" answer comes from the server page, not the merged length |
| 5.11 | Stale response        | Change a filter twice quickly                                            | The list matches the LAST filter chosen, never the earlier one              |
| 5.12 | Pull to refresh       | Pull down                                                                | Reloads from the top                                                       |
| 5.13 | Newest first          | Any list                                                                 | Ordered newest → oldest by when staff acted                                |
| 5.14 | Filters survive a drill-in | Set staff + date filters → tap an entry → close the detail sheet     | The **same filters are still applied** and the list is unchanged (the filter session lives in the slice, not the screen) |
| 5.15 | …and a tab round-trip | With filters set, leave the Audit Log for another tab and come back      | Filters still applied                                                      |
| 5.16 | Filters cleared on logout | Set filters → log out → log in as a **different** organization's admin | Audit Log opens **unfiltered** and shows **no** entries from the previous organization |
| 5.17 | Filter chips scroll   | Scroll the list down on a phone                                          | The chip row scrolls away with the entries (it is the list header)          |

---

### 5b. The entry card (two lines, and the customer)

The card is deliberately two lines: **record type + the customer it belongs to + the action pill**, then **staff · when**. Naming *what* moved is the detail sheet's job. The customer name comes from `audit_logs.subject`, **frozen at write time** — never resolved from `customer_id` at read time, because a deleted customer leaves the id pointing at nothing.

| #    | Scenario                       | Steps                                                                       | Expected result                                                                     |
| ---- | ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 5.20 | Customer on a payment          | Record a payment → open the Audit Log                                        | Card line 1 reads **Payment · <customer name>** with the green "Added" pill          |
| 5.21 | Customer on a sale             | Record a sale for a customer                                                 | Line 1 names the customer                                                           |
| 5.22 | Walk-in sale has no customer   | Record a sale with **no customer**                                            | Line 1 shows the type + pill only — **no blank space or "(empty)"** where a name would be |
| 5.23 | Customer on a skip             | Skip a month for a customer                                                  | Line 1 names the customer                                                           |
| 5.24 | Customer on a plan line        | Add / change / remove a service line from the customer form                   | Line 1 names the customer                                                           |
| 5.25 | A customer edit                | Edit a customer's phone                                                       | Line 1 names the customer **once** — the name is not repeated on line 2             |
| 5.26 | Records with no owner          | Add a plan, a product, a currency, a staff member, change a setting            | Line 1 shows the type + pill only; nothing implies a customer                        |
| 5.27 | Exactly two lines              | Any entry, any action                                                          | The card is **two lines tall** — the old field-name chip row is gone entirely        |
| 5.28 | No field text on the card      | Edit only a payment's amount                                                   | Line 2 is **staff · when** only — the field name lives in the sheet's "Fields changed" row |
| 5.29 | …with several fields too       | Edit a customer's name AND phone AND address                                   | Still just staff · when — no chips, no "3 fields changed" count                     |
| 5.30 | Create / delete the same       | An **Added** or **Deleted** entry                                              | Line 2 unchanged: staff · when                                                      |
| 5.31 | Renamed customer keeps history | Record a payment → **rename** the customer → reopen the Audit Log               | The old entry still shows the **name at the time**, not the new one (frozen on purpose) |
| 5.32 | Deleted customer keeps history | Record a payment → delete that customer → reopen the Audit Log                  | The entry still names them — **never** "(deleted)" or a UUID                        |
| 5.33 | Old rows have no subject       | An entry recorded **before** `subject` shipped                                  | Renders with no customer name — no blank row, no crash                              |
| 5.34 | Long names truncate            | A customer with a very long name                                               | Line 1 truncates on one line; the action pill stays fully visible and never wraps    |
| 5.35 | Card and sheet agree           | Tap an entry from 5.20                                                          | The sheet's **Customer** row shows the same name the card did                        |
| 5.36 | …on a customer entry too       | Tap the customer edit from 5.25                                                 | The **Customer** row names them here as well — it is now the only row saying whose record this is |
| 5.37 | Arabic + RTL                   | Switch to Arabic → repeat 5.20 and 5.29                                        | Name follows the type on the correct side; the pill sits at the line's end; line 2 mirrors |
| 5.38 | Same card in both views        | Compare the Audit Log screen and a per-record History sheet                     | Identical two-line card in both                                                     |

---

## 6. Entry detail and per-record history

| #   | Scenario                | Steps                                                        | Expected result                                                             |
| --- | ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 6.1 | Diff sheet              | Tap an **Edited** entry                                       | Customer / staff / when / **Fields changed**, then each changed field as `old → new` |
| 6.2 | Create sheet            | Tap an **Added** entry                                        | The whole new row's values; no arrows (nothing changed *from*)               |
| 6.3 | Delete sheet            | Tap a **Deleted** entry                                       | The whole removed row — this is the only place it still exists               |
| 6.4 | Readable values         | Any entry with a date, a true/false and an amount              | Date+time formatted, Yes/No not `1`/`0`, empty shown as `(empty)`            |
| 6.5 | Technical noise hidden  | Any entry, **including an Added one** (whole-row snapshot)      | No `id`, `tenant_id`, `created_at`, `updated_at` or generated `balance` row   |
| 6.6 | Record History          | Payment detail (as admin) → **History**                        | Only that payment's entries, newest first                                    |
| 6.7 | Record History is full   | Payment detail → **History**, on a record older than 30 days   | The complete server-side timeline loads on open — no action to tap. Offline: the 30-day window plus any un-pushed entries for that record |
| 6.8 | Record History empty    | Open History on a record created before this feature shipped    | "No changes recorded / not changed since the audit log started"              |
| 6.9 | Nested sheet closes     | History sheet → tap an entry → close the detail                  | Returns to the History list; the History sheet stays open                    |
| 6.10 | Deleted user's entries | Delete a staff member who had recorded payments                  | Their old entries still show their username (it is snapshotted)              |
| 6.11 | Deleted branch         | Delete a branch that had records                                  | Its entries remain visible and attributed                                   |
| 6.12 | Person id → name       | Void a payment or sale → open the entry                            | `Voided by` shows the **staff name**, never a UUID (gotcha #65)             |
| 6.13 | …received by           | Wallets → receive a collector's cash → open the entry                | `Received by admin` shows the admin's name, not an id                      |
| 6.14 | …after the user is gone | Delete that staff member → reopen the same entry                   | `Voided by` reads **"Deleted user"** — still no UUID. The "Staff" row keeps the snapshotted username |
| 6.15 | …opened from History   | Payment detail → History → tap the void entry (staff list not yet loaded) | Name still resolves — the sheet loads the staff list itself                |
| 6.16 | Record ids unchanged   | An entry whose diff moved `plan_id`, `customer_id` or `customer_plan_id` | Still shown as the raw id (intended: a deleted record has no name). `branch_id` / `currency_id` DO resolve — see 6c |
| 6.17 | Timestamp wording      | Open an entry for a **customer** or **plan** edit                    | The time row reads "When", not "Paid on"                                    |
| 6.18 | History sheet isolation | Open History on payment A → close → open History on payment **B**    | B's timeline only. **A's entries must not appear**, not even for a moment (the sheet's state dies with it) |
| 6.19 | …and refetches on open | Close and reopen History on A                                          | Fetches again from the server; no stale entries from the previous open       |
| 6.20 | Close during a slow load | Open History on a slow connection and close before it finishes → open another record | No crash, no flash of the first record's entries (stale-response guard)  |
| 6.21 | Shared list, both views | Compare the Audit Log screen and a History sheet                     | Same card layout, source note and detail sheet — one `<HistoryList>` renders both |

### 6e. The "Fields changed" row

The top card's last row lists the **names** of the columns that moved, comma separated — the values are in the diff right below it. It replaced a "Record" row that printed the frozen `label` as two raw values glued with ` · ` ("2026-10-01 · 600").

| #    | Scenario                    | Steps                                                                | Expected result                                                              |
| ---- | --------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 6.22 | Names, comma separated      | Edit a payment's **amount and notes** → open the entry                | Last row reads **"Amount paid, Notes"** — names only, same order as the diff below |
| 6.23 | One field                   | Edit only the amount                                                   | Reads **"Amount paid"** — no trailing comma                                   |
| 6.24 | Hidden on a create          | Tap an **Added** entry                                                 | **No** "Fields changed" row at all; "When" is the card's last row, with no dangling divider under it |
| 6.25 | Hidden on a delete          | Tap a **Deleted** entry                                                | Same — the whole-row snapshot below is the answer there                       |
| 6.26 | Many fields wrap            | Edit 5+ fields of a customer at once                                   | All names listed and wrapped, up to 3 lines, then truncated — the card never grows without limit |
| 6.27 | Unlabelled column           | An entry touching a column with no `audit.field.*` key                 | The raw column name is listed — never blank                                  |
| 6.28 | No frozen label anywhere    | Any entry                                                              | The old raw one-liner ("2026-10-01 · 600") appears **nowhere** in the app     |
| 6.29 | Known trade-off: no month   | Edit only a payment's amount → open the entry                           | The sheet names the customer and the fields, but **not which month** (it only shows if `billing_month` itself changed). Accepted; the record's own History sheet gives that context |
| 6.49 | Arabic                      | Switch to Arabic → repeat 6.22                                          | Row label and field names translated; the list reads right-to-left            |

### 6b. Customer history sheet

One customer's whole story: the customer row, every service line it has ever held, and the **month payments and skips** on those lines. Found by the entry's frozen `subject_id` (`CUSTOMER_HISTORY_TABLES`), not by listing child ids — see 6d.

| #    | Scenario                  | Steps                                                                | Expected result                                                             |
| ---- | ------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 6.30 | From the card menu        | Customer list → card 3-dot menu → **History**                         | Sheet opens titled "Customer history" with the customer's name beneath       |
| 6.31 | From the detail header    | Open a customer → tap the **clock icon** in the header                 | Same sheet, same contents                                                   |
| 6.32 | Customer + plans merged   | Rename a customer, then cancel one of its plan lines → open History     | **Both** entries in one newest-first list (a `customers` edit and a `customer_plans` change) |
| 6.33 | No foreign entries        | A customer with 2+ plan lines; other customers also edited + paid       | Only THIS customer's entries — no other customer's row, line or payment      |
| 6.34 | Cancelled lines included  | Cancel a line, then open History                                        | The cancelled line's history still appears (it is still part of the story)   |
| 6.35 | Month payments included   | Record a payment, edit its amount, then void it → open History           | **All three** entries appear, newest first, interleaved with the profile edits |
| 6.36 | Voided payments included  | The void from 6.35                                                      | Present — the void is exactly the entry a dispute is about, and it must not be filtered out |
| 6.37 | Skipped months included   | Skip a month, then unskip it → open History                             | **Added · Skipped month** then **Restored · Skipped month** (these were previously unreachable) |
| 6.38 | Sales excluded by design  | Record a sale for the customer → open History                            | **Not listed.** A sale has its own panel on the customer screen              |
| 6.39 | Debts excluded            | Add a custom debt + a debt payment → open History                        | Neither appears (the debt tables are not audited at all)                     |
| 6.40 | Deleted line survives     | Remove a service line entirely → open History                            | Its entries **remain** — `subject_id` is never joined back to a live row     |
| 6.41 | Staff sees a clear reason | Log in as a **staff** (non-admin) user → open History from either place   | Sheet opens showing **"Admins only"**, NOT an empty "nothing recorded" list  |
| 6.42 | Admin sees entries        | Same customer as 6.41, now as an admin                                  | The real timeline                                                           |
| 6.43 | Full history on open      | Open the sheet (native, online) for a customer with entries older than 30 days | Everything beyond the window is there without any action, still scoped to this customer |
| 6.44 | …offline                  | Airplane mode → open the sheet                                           | The 30-day window plus this device's un-pushed entries; note says "No connection"; no error banner |
| 6.45 | No repeated fetching      | Open the sheet and leave it open (watch logs / network)                  | One fetch, not a loop — the hook keys on a plain customer-id string          |
| 6.46 | Busy customer            | A customer with 100+ payments → open History (online)                     | Loads in one query; no URL-length error and no truncated list                |
| 6.47 | Customer with no plans    | An occasional customer with zero service lines → open History             | The customer's own entries only; no crash                                    |
| 6.48 | RTL                       | Switch to Arabic → open History                                          | Title, name, rows and chevrons mirror correctly                             |

### 6f. Per-item History on every audited list

Every audited entity now offers its own trail from the place it lives: the card's 3-dot menu for products / plans / staff / branches / currencies, and a button on the payment + sale receipts. All of them open the **same** `RecordHistorySheet`, so a fault here is either in the shared shell (affects all) or in one call site's wiring (affects one).

| #    | Scenario                     | Steps                                                                              | Expected result                                                                    |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 6.80 | Product                      | Products → card 3-dot → **History** (row sits right under Edit)                     | "Change history" with the **product name** beneath; its add/edit/delete entries only |
| 6.81 | Plan                         | Plans → card 3-dot → **History**                                                    | Same, subtitle = plan name                                                          |
| 6.82 | Staff member                 | Staff → card 3-dot → **History**                                                    | Subtitle = the person's **full name**; role / active / branch changes listed        |
| 6.83 | Branch                       | Branches → card 3-dot → **History**                                                 | Subtitle = branch name                                                              |
| 6.84 | Currency                     | Currencies → card 3-dot → **History**                                               | Subtitle = the currency **code** (not its long name); rate edits listed             |
| 6.85 | Sale receipt                 | Sales → tap a sale → **History** (above Void)                                        | Subtitle = the frozen products summary; the sale's create/void entries              |
| 6.86 | Payment receipt              | A paid month → **History**                                                           | Subtitle = the **month label** ("March 2026")                                       |
| 6.87 | Only that record             | Two products both edited → open History on the first                                 | The other product's entries are **absent**                                          |
| 6.88 | Isolation between opens      | History on product A → close → History on product **B**                              | B's timeline only; not a flash of A's (same guard as 6.18)                          |
| 6.89 | Inactive item                | Soft-delete (deactivate) a product / branch / currency → open History from its menu    | The row still offers History and the deactivation entry is listed                   |
| 6.90 | Empty state                  | History on a record created before the trail shipped                                  | "No changes recorded", never a blank screen                                         |
| 6.91 | Staff sees the reason        | As a **non-admin**, open History from a product/plan card menu                        | Sheet says **"Admins only"** — not an empty list                                    |
| 6.92 | …receipts hide it instead    | As a **non-admin**, open a payment and a sale receipt                                 | **No** History button at all (staff-facing receipts don't offer a dead end)          |
| 6.93 | Menu closes first            | Tap **History** in a card menu                                                        | The menu closes, the history sheet opens on top; Back / drag-down returns to the list |
| 6.94 | Nested entry sheet           | History → tap an entry → close                                                        | Back to the history list, still open (6.9 for these lists too)                      |
| 6.95 | Selection mode unaffected    | Long-press a card to multi-select, then use the selection toolbar                      | No History action in the toolbar; the menu row is unchanged after clearing selection  |
| 6.96 | Offline                      | Airplane mode → open History from any of the five lists                               | The 30-day window + un-pushed entries, with the "No connection" note                |
| 6.97 | Deleted-then-recreated name  | Rename a plan → open History                                                           | The header shows the **current** name; each entry still shows the values of its time |
| 6.98 | Arabic + RTL                 | Switch to Arabic → repeat 6.80 and 6.85                                               | Row label, title and subtitle translated/mirrored; the subtitle truncates on one line |

### 6d. `subject_id` — who an entry is about

The id is frozen at write time next to the name. It is what 6b filters on, so a gap here empties the customer sheet.

| #    | Scenario                       | Steps                                                                       | Expected result                                                            |
| ---- | ------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 6.70 | Written on a payment           | Record a payment → Developer → `audit_logs`                                    | The new row's `subject_id` = the customer's id                              |
| 6.71 | Written on the customer itself | Edit a customer → inspect the row                                              | `subject_id` = `record_id` (the customer IS the record)                     |
| 6.72 | Written on a plan line / skip  | Change a service line; skip a month                                             | Both rows carry the customer's `subject_id`                                 |
| 6.73 | Sales carry none               | Record a sale for a customer → inspect the row                                   | `subject_id` NULL — by design; sales are outside the customer timeline (6.38) |
| 6.74 | Walk-in sale                   | Record a sale with **no** customer                                              | `subject_id` NULL; no crash anywhere                                        |
| 6.75 | Owner-less records             | Add a plan / a product / a staff member / change a setting                       | `subject_id` NULL; the main Audit Log is unaffected                         |
| 6.76 | Offline write                  | Airplane mode → record a payment → inspect the local row                        | `subject_id` filled locally too (it comes from `customerAudit`, inside the transaction) |
| 6.77 | Pre-existing entries           | Entries recorded **before** the column shipped                                   | `subject_id` NULL → absent from the customer History sheet, still listed in the main Audit Log. There is no backfill |
| 6.78 | Column actually exists         | Run `sql scripts/script.sql` on an **existing** DB, then record a payment         | `subject_id` is added if missing — every column in `script.sql` is an `ADD COLUMN IF NOT EXISTS`. The payment records and pushes with no error |
| 6.79 | Deleted customer               | Record a payment → delete the customer → open the main Audit Log                 | The entry still lists with its frozen name; nothing tries to resolve the id  |

---

### 6c. Displayed values (the per-column display registry)

Raw columns are stored, human text is shown — declared once per column in [valueDisplay.ts](../SubsTrack/src/modules/admin/audit/utils/valueDisplay.ts): `DISPLAY` for a column's **value**, `FIELD_LABELS` for its **name** when a sibling column decides it (`tenant_settings.value` is named after the setting). An unregistered column must still render exactly as before.

| #    | Scenario                     | Steps                                                                        | Expected result                                                             |
| ---- | ---------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 6.50 | Setting name, not its key    | Admin → Organization Settings → change **Mark unpaid** → open the entry        | The diff row is titled **"Unpaid months rule"** — the changed column is named after the setting, never a bare "Value" or `UnpaidStartRule · month_start` |
| 6.51 | Setting value, not its code  | Same entry                                                                    | Value reads "On the customer's start day → On the first day of the month" — no `customer_start_day` |
| 6.52 | Same name on both rows       | The same entry's top card                                                     | "Fields changed" reads **"Unpaid months rule"** too — the same name as the diff row |
| 6.53 | Display currency setting     | Change the **display currency** → open the entry                              | Titled "Display currency"; the value shows the currency **code** (USD when cleared), never a UUID |
| 6.54 | Old rows still readable      | An entry recorded **before** this change (no `key` carried)                    | Falls back to the plain **"Value"** title and the raw value — readable, no crash |
| 6.55 | Staff role                   | Change a staff member's role → open the entry                                  | "Admin" / "User", not `admin` / `user`                                       |
| 6.56 | Branch id → name             | Move a customer to another branch → open the entry                            | Both sides show branch **names**                                            |
| 6.57 | Null branch wording          | Move a customer to no branch; a plan/product to Shared; a staff to tenant-wide | "Unassigned" / "Shared (all branches)" / "Tenant-wide admin" — never "(empty)" |
| 6.58 | Currency id → code           | Edit a payment's currency, or view a payment/plan create entry                 | The currency **code** (`LBP`); a null currency reads `USD`, not "(empty)"     |
| 6.59 | Deleted reference            | Deactivate/delete the referenced currency or branch → reopen the entry         | "(deleted)" — never a UUID                                                  |
| 6.60 | Unregistered column          | An entry touching a column with no formatter (`notes`, `price`, `active`)      | Unchanged rendering: text, number, Yes/No, `(empty)`                        |
| 6.61 | Unknown coded value          | (Developer) set a setting value to garbage → view the entry                    | The raw value is shown as-is; no blank row, no crash                        |
| 6.62 | Arabic                       | Switch to Arabic → repeat 6.50, 6.55, 6.57                                    | Setting name, role and branch wording all translated                        |
| 6.63 | Not a change row             | The setting entry from 6.50                                                    | Exactly ONE changed field (the setting itself); the `key` is context, never listed as changed |

---

## 7. Localisation and layout

| #   | Scenario         | Steps                                        | Expected result                                                          |
| --- | ---------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| 7.1 | Arabic labels    | Switch to Arabic → open the Audit Log         | Titles, actions, record types and field names all translated; no raw keys |
| 7.2 | RTL layout       | In Arabic                                     | Chips, rows and the `old → new` arrow mirror correctly                   |
| 7.3 | Long values      | Edit a customer's notes to a very long string  | The row truncates; the detail sheet wraps without overflow               |
| 7.4 | Unknown field    | (After adding a new column) view an entry      | Falls back to the raw column name rather than a blank or a crash          |

---

## 8. Regression watch-list

Each line is a specific way this feature has a known route to breaking.

| #   | Check                       | Steps                                                                       | Expected result                                                              |
| --- | --------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 8.1 | Retried push does not wedge | Force `_dirty = 1` on a row already on the server → sync, twice               | Push succeeds both times; the queue never sticks; no duplicate row            |
| 8.2 | No pull → audit → push loop | Sync repeatedly with no user action                                          | The row count stops growing; entries do not multiply                         |
| 8.3 | Corrupt JSON is survivable  | Developer: set a row's `changed` to `{oops` → open the Audit Log              | The list renders; that row degrades gracefully; no crash                     |
| 8.4 | Failed audit never blocks   | Simulate an audit-insert failure online                                      | The user's save still succeeds (the trail is best-effort online)             |
| 8.5 | New org, empty tables       | Brand-new organization: open every screen                                    | No errors; audit table exists and is empty                                   |
| 8.6 | Store reset on logout       | Admin views the Audit Log → log out → log in as another org's admin           | No entries from the previous organization are visible, even for a moment      |
| 8.7 | Money is never lost         | Offline: record payments until several are queued, then switch org             | Switching is still refused for the **payments** (only logs are exempt)       |
