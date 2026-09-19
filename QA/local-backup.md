# Local Backup (Export / Import a JSON file) — QA Scenarios

Covers Settings → Developer → **Export to file** / **Import from file**: the whole local
SQLite mirror written as one JSON file and restored from one. Native-only and admin-only.
The sync engine itself has its own file ([sync-engine.md](sync-engine.md)).

**Reference code:**

- Screen: [DeveloperScreen.tsx](SubsTrack/src/modules/settings/developer/screens/DeveloperScreen.tsx)
- Envelope + pure validation: [validate.ts](SubsTrack/src/core/offline/backup/validate.ts), [types.ts](SubsTrack/src/core/offline/backup/types.ts)
- Streaming export: [dump.ts](SubsTrack/src/core/offline/backup/dump.ts)
- Restore: [restore.ts](SubsTrack/src/core/offline/backup/restore.ts)
- Write order + batch sizing: [tableOrder.ts](SubsTrack/src/core/offline/backup/tableOrder.ts)
- File I/O: [shareFile.ts](SubsTrack/src/shared/lib/shareFile.ts)
- Sync suspend: [engine.ts](SubsTrack/src/core/offline/sync/engine.ts)
- Rules and failure modes: [docs/offline.md](docs/offline.md), gotcha #150
- Unit tests: `tests/suites/backupValidate.test.ts`, `tests/suites/backupRoundTrip.test.ts` (TC-BK-01…09)

---

## 1. Who can reach it

| #   | Scenario                   | Steps                                                            | Expected result                                                                                      |
| --- | -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1.1 | Admin sees the row         | Login as admin on a phone                                        | Settings → Data → "Developer" row is visible                                                         |
| 1.2 | Collector does not         | Login as a `user` role on a phone                                | No "Developer" row at all                                                                            |
| 1.3 | Deep link is still refused | As a collector, open `/(app)/(tabs)/settings/developer` directly | Screen renders only "Only an administrator can use the developer tools." — no buttons, no table list |
| 1.4 | Web hides it               | Open the web app as admin                                        | No "Developer" row (the whole Data card is native-only)                                              |

---

## 2. Export

| #   | Scenario                     | Steps                                                 | Expected result                                                                                                                                                                                                                                  |
| --- | ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 | Happy path                   | Sync, then tap "Export to file"                       | Share sheet opens with `substrack-<TENANTCODE>-<date>-<time>.json`; green flash "Backup file ready (N rows)"                                                                                                                                     |
| 2.2 | Refused while un-synced      | Go offline, record a payment, tap Export              | Red banner: "N change(s) on this phone have not reached the server yet…" plus a **Sync now** button. **No file is produced**                                                                                                                     |
| 2.3 | Sync-then-export             | From 2.2, go online, tap "Sync now", tap Export again | Sync succeeds, banner clears, export now works                                                                                                                                                                                                   |
| 2.4 | Offline with nothing pending | Go offline on a fully-synced phone, tap Export        | Works — the export never needs the network                                                                                                                                                                                                       |
| 2.5 | File contents                | Save the file and open it in a text editor            | One JSON object with `format`, `version`, `exportedAt`, `app`, `tenant`, `branchScope`, `user`, `counts`, `tables`. **No `_dirty` key on any row. No `sync_meta`. No `pending_deletes`.** Every one of the 21 tables is present, even empty ones |
| 2.6 | Big tenant does not crash    | Export on a tenant with tens of thousands of rows     | Completes; app does not die. (Rows are streamed one at a time, never one big string)                                                                                                                                                             |
| 2.7 | Two exports in a row         | Export twice within the same minute                   | Two files; the second does not silently overwrite the first unless the timestamp is identical                                                                                                                                                    |
| 2.8 | Sharing unavailable          | Simulate a device with no share target                | Red banner "Sharing is not available on this device", no crash                                                                                                                                                                                   |

---

## 3. Import — the refusals (nothing must change on the phone)

Run each of these on a phone that already holds data, then confirm the row counts on the
Developer screen are **unchanged** afterwards.

| #    | Scenario                       | Steps                                                                                  | Expected result                                                                                                                                |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Another organization           | Take a backup from tenant B, import it while signed into tenant A                      | "That backup belongs to another organization (B)…" — refused                                                                                   |
| 3.2  | Smuggled row                   | Hand-edit one `customers` row's `tenant_id` to another tenant, keep the header correct | "Rows in "customers" belong to another organization." — refused. **This is the check that matters; the header alone is not trusted**           |
| 3.3  | Two tenants rows               | Add a second row to `tables.tenants`                                                   | Refused                                                                                                                                        |
| 3.4  | Wrong branch view              | Export as a tenant-wide admin, import while signed in as a branch-scoped user          | "That backup was made from a different branch view…" — refused                                                                                 |
| 3.5  | Missing your own account       | Delete your own row from `tables.users`                                                | "That backup does not contain your own account…" — refused (this is what would otherwise lock you out of the app offline)                      |
| 3.6  | Missing your branch            | As a branch user, delete that branch from `tables.branches`                            | Refused                                                                                                                                        |
| 3.7  | Not a backup                   | Pick any other `.json` file                                                            | "That file is not a SubsTrack backup."                                                                                                         |
| 3.8  | Truncated file                 | Cut the file in half                                                                   | "That file is not valid JSON."                                                                                                                 |
| 3.9  | Missing table                  | Delete the whole `expenses` key                                                        | "The backup is incomplete — the table "expenses" is missing." — **not** "leave expenses alone"                                                 |
| 3.10 | Extra table                    | Add a `"secrets": []` key                                                              | "Unknown table "secrets" in the backup."                                                                                                       |
| 3.11 | Duplicate id                   | Duplicate one `customers` row wholesale                                                | "Two rows in "customers" share the id …"                                                                                                       |
| 3.12 | Duplicate month bill           | Give two `charges` rows the same `customer_plan_id` + `billing_month`                  | "Two rows in "charges" share the same month or bill…"                                                                                          |
| 3.13 | Nested value                   | Set a `customers.name` to `{"a":1}`                                                    | "Unsupported value in "customers"."name"."                                                                                                     |
| 3.14 | Carries the upload flag        | Add `"_dirty": 1` to a row                                                             | "That backup was made before its phone finished syncing…"                                                                                      |
| 3.15 | Too large                      | Pick a file over 64 MB                                                                 | "That file is too large to open safely." — refused **before** parsing, app does not die                                                        |
| 3.16 | Un-synced writes on THIS phone | Record a payment offline, then try to import                                           | "N change(s) on this phone have not reached the server yet. Importing would delete them. Sync first." plus a Sync now button. Payment survives |
| 3.17 | Sync in flight                 | Start a manual sync, immediately tap Import                                            | "A sync is running. Wait for it to finish and try again."                                                                                      |
| 3.18 | Cancel the picker              | Tap Import, then back out of the file picker                                           | Nothing happens, no error                                                                                                                      |
| 3.19 | Cancel the confirm             | Get to the destructive confirm, tap Cancel                                             | Nothing changes                                                                                                                                |
| 3.20 | Unknown column                 | Add a `legacy_col` to a `customers` row                                                | Import is **allowed**; the confirm lists "Unknown columns in "customers" will be skipped: legacy_col" and the column is dropped                |

---

## 4. Import — the happy paths

| #   | Scenario                | Steps                                                                        | Expected result                                                                                                           |
| --- | ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Same phone round trip   | Export, then immediately import the same file, choose "No, this phone only"  | Row counts identical to before; dashboard, customer list and month grids all still correct                                |
| 4.2 | Confirm shows the facts | Reach the destructive confirm                                                | It names the source organization, the export date, the rows in the backup **and** the rows currently on the phone         |
| 4.3 | Phone A → phone B       | Export on phone A, import on phone B (same org, same branch view, same user) | B shows A's customers, payments, sales and debts                                                                          |
| 4.4 | Screens repaint         | After 4.3, open Customers, Debts, Dashboard without restarting the app       | All show the imported data — no stale rows from before the import                                                         |
| 4.5 | Progress is visible     | Import a large backup                                                        | A flash counts "Importing… N of M rows"; the app does not look frozen with no feedback                                    |
| 4.6 | Table browser           | After import, tap through a few tables on the Developer screen               | Counts match the `counts` block in the file                                                                               |
| 4.7 | Offline import          | Go offline, import a file                                                    | Works. Flash says "You are offline, so the backup can only be imported to this phone." The push question is **not** asked |
| 4.8 | Still logged in         | After any successful import                                                  | The app does not sign you out and does not show "account not configured"                                                  |

---

## 5. The server question ("also replace the server's copy")

| #   | Scenario                 | Steps                                                                             | Expected result                                                                                                                                                         |
| --- | ------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | The question is asked    | Online, import a valid file, pass the destructive confirm                         | A second confirm: "Send this data to the server too?" with **Yes, replace on the server** / **No, this phone only**                                                     |
| 5.2 | Saying No                | Choose No                                                                         | Nothing is uploaded. Check the web app — server data unchanged                                                                                                          |
| 5.3 | No, then sync            | From 5.2, run Sync now                                                            | The server's version is pulled back down and may replace what was imported. This is expected and is stated in the dialog                                                |
| 5.4 | Saying Yes               | Choose Yes                                                                        | Sync indicator runs; flash "Imported and sent to the server". In the web app, rows that the file contained now match the file                                           |
| 5.5 | Yes does not delete      | Before 5.4, create a customer on the web that is **not** in the file. Then do 5.4 | That customer is **still there** on the server afterwards. The dialog says so                                                                                           |
| 5.6 | Tenant row is not pushed | After 5.4, check `tenants` in the web app                                         | `customer_allowance` / `plan_allowance` / `price_per_plan_usd` unchanged — the tenant row is never marked for upload (gotcha #149i would reject it and wedge the queue) |
| 5.7 | No wedged queue          | After 5.4 completes, tap Export                                                   | Export is **allowed** — meaning nothing stayed stuck as un-synced. If Export is refused here, a table is wedged: investigate                                            |
| 5.8 | Push failure is honest   | Force the push to fail (kill the network mid-sync)                                | Flash "Imported, but sending to the server failed. It will retry on the next sync." The local import still stands                                                       |

---

## 6. Sync safety around the import

| #   | Scenario                     | Steps                                                               | Expected result                                                                                                                        |
| --- | ---------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | No interleaving              | Trigger a sync and an import as close together as possible          | One waits for the other; never "cannot start a transaction within a transaction", never a half-merged mirror                           |
| 6.2 | Cursor is cleared            | Import, then run Sync now                                           | A **full** re-pull happens (not an incremental one), and it heals anything the file got wrong                                          |
| 6.3 | Scope keys survive           | After an import, look at `sync_meta` in the table browser           | `active_tenant_id` and `active_branch_scope` are set to the **current** session's values; `last_pulled_at` and `last_sync_at` are gone |
| 6.4 | No back-door tenant adoption | After an import, log out and log in as a **different** organization | The normal wipe-or-block behaviour applies — the app must not silently adopt the new tenant onto the imported data                     |
| 6.5 | Delete queue is empty        | After any import, check `pending_deletes`                           | Zero rows. A backup never carries queued deletes                                                                                       |
| 6.6 | Crash mid-import             | Kill the app while the import is running                            | On restart the mirror is either fully the old data or fully the new data — never half. (One transaction)                               |

---

## 7. Non-functional

| #   | Scenario              | Steps                                                    | Expected result                                                                                                                     |
| --- | --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | Arabic                | Switch to Arabic and walk every screen and message above | All strings translated, RTL layout correct, no English leaking through                                                              |
| 7.2 | The file is sensitive | Read an exported file                                    | It is plaintext customer names, phone numbers and amounts. Confirm the admin-only gate (section 1) is what protects it              |
| 7.3 | OTA-safe              | Ship this change over the air                            | `npm run ota-fingerprint` is unchanged before and after — no new dependency was added and `expo-clipboard` stayed in `package.json` |
