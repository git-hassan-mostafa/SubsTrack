# Web — Plans Page — QA Scenarios

The **Plans** admin page on the desktop web app. It is built on the shared web table, so first run the table checks in [branches.md](branches.md) §1, §2 (no status filter here), §5.8, §6, §7 and §9 on this page. The plan rules are the phone's: [../plans.md](../plans.md). The header branch and the Branch field behave as in [services.md](services.md) §1.3–1.6 and §2.7–2.9.

**Reference code:**

- Page: [PlansPage.tsx](Web/src/modules/admin/plans/PlansPage.tsx), [PlanFormDialog.tsx](Web/src/modules/admin/plans/PlanFormDialog.tsx)
- Page state: [plansTable.ts](Web/src/state/plansTable.ts)
- Server read: `findPage` in [PlanRepository.ts](Shared/src/modules/admin/plans/repository/PlanRepository.ts) (phone twin: [PlanRepository.offline.ts](SubsTrack/src/modules/admin/plans/repository/PlanRepository.offline.ts))

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project.

---

## 1. The list

| #   | Scenario        | Steps                                   | Expected result                                                                                  |
| --- | --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1.1 | Columns         | Open Admin → Plans                      | Name, Branch (2+ branches only), Price, Billing, ⋮. A→Z by name. No Status column (plans have none) |
| 1.2 | Fixed price     | A 20 USD monthly plan                   | Price "$20.00", Billing "Monthly"                                                                 |
| 1.3 | Bundle          | A 3-month plan at 55 USD                | Price "$55.00", Billing "Every 3 months"                                                          |
| 1.4 | Custom price    | A custom-price plan                     | Price shows a "Custom" chip, Billing "Monthly"                                                    |
| 1.5 | Other currency  | A plan priced in LBP                    | The LBP amount, with "≈" the display currency under it                                            |
| 1.6 | Empty tenant    | Tenant with no plans                    | "No plans yet", "Add the plans your customers pay for." and an "Add plan" button                  |

## 2. Add and edit

| #   | Scenario                 | Steps                                                         | Expected result                                                                                 |
| --- | ------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2.1 | Add monthly              | "Add plan" → Basic, Monthly, 20 USD → Save                    | Dialog closes; the row shows; the customer form can pick it                                     |
| 2.2 | Duration list            | Open Duration                                                 | Monthly, Every 2 months … Every 12 months                                                        |
| 2.3 | Bundle price             | Pick "Every 3 months"                                         | The price field is labelled "Bundle Price"; hint "Total price for all months in this block"; the Custom Pricing switch is gone |
| 2.4 | Custom price             | Monthly, switch Custom Pricing on                             | The price field is gone; Save saves a plan with no price                                         |
| 2.5 | Custom then multi-month  | Custom on, then pick "Every 2 months"                         | Custom is switched off and the price field is back                                               |
| 2.6 | Price required           | Fixed price, empty price, Save                                | Red banner: a fixed plan needs a price. Save is never greyed out                                 |
| 2.7 | Name taken               | A name that already exists                                    | Red banner: the plan name already exists                                                         |
| 2.8 | Edit                     | Click a plan name, change the price, Save                     | Row updates. Bills already made keep their old amount (a bill is a snapshot)                     |
| 2.9 | Discard guard            | Run [app-shell.md](app-shell.md) §5 on this form              | As written there                                                                                 |

## 3. Row menu

| #   | Scenario   | Steps                              | Expected result                                                                                           |
| --- | ---------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 3.1 | Items      | ⋮ on a plan                        | Edit, History, Delete (red)                                                                               |
| 3.2 | Delete     | Delete a plan customers use        | Confirm says customers will have their plan removed; after OK the row is gone; those customers' service lines stay, with no plan, and their payment history is kept |
| 3.3 | Bulk       | Tick 1 row / tick 3 rows           | Edit + Delete / Delete only ("Delete 3 plans")                                                             |
