# Web — Services Page — QA Scenarios

The **Services** (price list) admin page on the desktop web app. It is built on the shared web table, so first run the table checks in [branches.md](branches.md) §1, §2, §5.8, §6, §7 and §9 on this page. The service rules are the phone's: [../services.md](../services.md).

**Reference code:**

- Page: [ServicesPage.tsx](Web/src/modules/admin/services/ServicesPage.tsx), [ServiceFormDialog.tsx](Web/src/modules/admin/services/ServiceFormDialog.tsx)
- Page state: [servicesTable.ts](Web/src/state/servicesTable.ts), `open(branch)` in [createPagedStore.ts](Web/src/state/createPagedStore.ts)
- Server read: `findPage` in [ServiceRepository.ts](Shared/src/modules/admin/service-catalog/repository/ServiceRepository.ts) (phone twin: [ServiceRepository.offline.ts](SubsTrack/src/modules/admin/service-catalog/repository/ServiceRepository.offline.ts))
- New-record branch: [defaultBranch.ts](Shared/src/modules/admin/branches/utils/defaultBranch.ts)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project. Use a tenant with 2+ active branches and at least one non-USD currency.

---

## 1. The list

| #   | Scenario               | Steps                                                    | Expected result                                                                                              |
| --- | ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1.1 | Columns                | Open Admin → Services                                    | Name, Description, Branch, Price, Status, ⋮                                                                  |
| 1.2 | Price in its currency  | A service priced 150,000 LBP, display currency USD       | Price shows "150,000 ل.ل" (its own currency; the code "LBP" when it has no symbol) with "≈ $1.68" under it; a USD service shows no "≈" line        |
| 1.3 | Branch column          | Tenant with 1 active branch                              | No Branch column. With 2+: the branch name, or "Shared (all branches)"                                       |
| 1.4 | Header branch          | Header Branch → Beirut                                   | Beirut's services plus the shared ones; the table goes back to page 1                                        |
| 1.5 | Unassigned             | Header Branch → Unassigned                               | Only services with no branch                                                                                 |
| 1.6 | Branch-scoped admin    | Sign in as a Beirut admin                                | No branch selector; only Beirut + shared services                                                            |
| 1.7 | Status filter          | Status → Inactive                                        | Only services hidden by a delete (they had been sold)                                                        |
| 1.8 | Empty tenant           | Tenant with no services                                  | "No services yet", the phone's hint, and an "Add service" button                                             |

## 2. Add and edit

| #   | Scenario              | Steps                                                   | Expected result                                                                               |
| --- | --------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2.1 | Add                   | "Add service" → Installation, 25 USD → Save             | Dialog closes; the row is in the list; the sale form can pick it                              |
| 2.2 | Price required        | Save with an empty price                                | Red banner: the price is required. Save is never greyed out                                   |
| 2.3 | Price zero            | Price 0                                                 | Red banner: the price must be more than 0                                                     |
| 2.4 | Name taken            | A name that already exists in the same branch           | Red banner: the name already exists                                                           |
| 2.5 | Currency              | Pick LBP in the price field, Save, reopen               | The price is still in LBP, as typed — never converted                                         |
| 2.6 | Last-used currency    | Add another service                                     | The price field starts on the last currency you picked                                        |
| 2.7 | Branch — tenant-wide  | Tenant-wide admin, 2+ branches, Add                     | Branch field starts on "Shared (all branches)"; any branch can be picked                      |
| 2.8 | Branch — one branch   | Tenant with one active branch, Add, Save                | No Branch field; the service is saved on that branch                                          |
| 2.9 | Branch — scoped admin | Beirut admin, Add, Save                                 | No Branch field; the service is saved on Beirut                                               |
| 2.10 | Discard guard        | Run [app-shell.md](app-shell.md) §5 on this form        | As written there                                                                              |

## 3. Row menu

| #   | Scenario           | Steps                                         | Expected result                                                                            |
| --- | ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 3.1 | Items              | ⋮ on an active / an inactive service          | Edit, History, Delete (red) / Edit, History, Reactivate — the same as the phone             |
| 3.2 | Delete, never sold | Delete a service no sale used                 | Confirm; the row is gone                                                                   |
| 3.3 | Delete, sold       | Delete a service a sale used                  | It becomes Inactive (kept for old receipts)                                                |
| 3.4 | Reactivate         | Reactivate it                                 | Green "Active" chip                                                                        |
| 3.5 | Bulk               | Tick 1 active / 1 inactive / 3 rows           | Edit + Delete / Edit + Reactivate + Delete / Delete only ("Delete 3 services")             |
