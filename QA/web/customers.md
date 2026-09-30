# Web — Customers Page — QA Scenarios

The **Customers** page on the desktop web app: exact status tabs from the server, the customer form with its service lines, and the **Add customer** quick action. It is built on the shared web table, so first run the table checks in [branches.md](branches.md) §1, §2, §5.8, §6, §7 and §9 on this page. The tab answers come from the `customer-status` edge function: run [customer-status.md](customer-status.md) §0 first (deploy), and its §2 "same answer as the phone" checks on this page. Customer and plan rules are the phone's: [../customers.md](../customers.md).

**Reference code:**

- Page: [CustomersPage.tsx](Web/src/modules/customer/customers/CustomersPage.tsx), [CustomerPills.tsx](Web/src/modules/customer/customers/CustomerPills.tsx), [useCustomerHistoryAction.tsx](Web/src/modules/customer/customers/useCustomerHistoryAction.tsx)
- Form: [CustomerFormDialog.tsx](Web/src/modules/customer/customers/CustomerFormDialog.tsx), [PortalAccessField.tsx](Web/src/modules/customer/customers/PortalAccessField.tsx), [ServiceLinesEditor.tsx](Web/src/modules/customer/customer-plans/ServiceLinesEditor.tsx), [LinePriceField.tsx](Web/src/modules/customer/customer-plans/LinePriceField.tsx), [PlanPicker.tsx](Web/src/modules/customer/customer-plans/PlanPicker.tsx)
- Page state: [customersTable.ts](Web/src/state/customersTable.ts) (`createPagedStoreWithMeta` carries the tab counts)
- Rules shared with the phone form: [useCustomerForm.ts](Shared/src/modules/customer/customers/hooks/useCustomerForm.ts), [useLineDrafts.ts](Shared/src/modules/customer/customer-plans/hooks/useLineDrafts.ts), [lineDrafts.ts](Shared/src/modules/customer/customer-plans/utils/lineDrafts.ts), [customerPills.ts](Shared/src/modules/customer/customers/utils/customerPills.ts), [portalPassword.ts](Shared/src/core/utils/portalPassword.ts) (unit tests: `tests/suites/customerForm.test.ts`, TC-CF-*)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project (check the URL first — the form WRITES customers and lines). Use a tenant with 2+ active branches, a non-USD currency, a monthly plan, a 3-month plan and a custom-priced plan.

---

## 1. The list and the tabs

| #   | Scenario          | Steps                                                                 | Expected result                                                                                                              |
| --- | ----------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Columns           | Open Customers                                                        | Name, Plan, Phone, Branch (2+ branches only), Status, Debt, ⋮                                                                 |
| 1.2 | Tabs with counts  | Look at the tab row                                                   | Active, Unpaid, Overdue, Partly paid, Paid, Not due yet, Has debts, All, Inactive — each with its count, e.g. "Overdue (12)" |
| 1.3 | Exact tab         | Open Overdue on a tenant with 200+ customers, go to page 3            | Every row on every page is overdue; the total equals the tab count (the server looks at EVERY customer, not one page)          |
| 1.4 | Pills             | An overdue customer, a partly paid one, a walk-in, an inactive one    | Same pills as the phone card: "Overdue" (no "Unpaid" beside it), "1/2 plans paid", "Non-Regular", "Inactive" only                  |
| 1.5 | Debt column       | A customer with an LBP custom fee                                     | The debt in the display currency, same figure as the phone's orange pill; empty for a customer who owes nothing               |
| 1.6 | Plan column       | 0, 1 and 3 active lines                                               | "No plan" / the plan's name / "3 plans"                                                                                       |
| 1.7 | Search + counts   | Search part of a phone number                                         | Matching customers; every tab count shrinks to the search; back to page 1                                                     |
| 1.8 | Header branch     | Header Branch → Beirut                                                | Beirut's customers only; the counts change; back to page 1                                                                    |
| 1.9 | Empty tab         | A tab with nobody in it                                               | "No results" with Clear filters; Clear filters goes back to Active and empties the search                                     |
| 1.10 | Long pills       | A customer with "1/2 plans paid" + "Overdue" on a narrow window       | The pills wrap and the row grows; nothing is cut off                                                                           |

## 2. Row actions and bulk

| #   | Scenario           | Steps                                                        | Expected result                                                                                                  |
| --- | ------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 2.1 | Menu (admin)       | ⋮ on an active customer with a phone who paid this month and owes nothing | Open WhatsApp chat, Edit, History, Deactivate, Delete — in that order (the phone menu bands); the money items are in §6 |
| 2.2 | Menu (staff)       | Log in as a user (not admin)                                 | WhatsApp, Edit, History (plus the money items of §6); no Deactivate / Delete; History says "Admins only"; checkboxes are there, for Quick pay and Edit (§6.9) |
| 2.3 | No phone           | A customer with no phone number                              | No WhatsApp item                                                                                                  |
| 2.4 | WhatsApp chat      | Open WhatsApp chat                                           | wa.me opens in a NEW tab with the number; the app keeps its page                                                   |
| 2.5 | History            | History on a customer who was renamed and had a month paid   | One list: the rename, the line changes, the month payment; clicking one opens its details                          |
| 2.6 | Deactivate         | Deactivate → confirm                                         | The customer leaves Active and shows in Inactive; Organization Settings usage drops by 1 customer and its lines     |
| 2.7 | Activate           | Activate an inactive customer                                | Back in Active; usage goes up again                                                                               |
| 2.8 | Delete unused      | Delete a customer who never paid                             | Row gone for good                                                                                                 |
| 2.9 | Delete paid        | Delete a customer with payments                              | Not removed: the customer becomes inactive (history kept)                                                         |
| 2.10 | Bulk one          | Tick one row                                                  | Bulk bar: Quick pay, Edit, Deactivate/Activate, Delete (a user: Quick pay, Edit)                                    |
| 2.11 | Bulk many         | Tick three rows → Delete                                      | "Delete 3 customers?"; unused ones go, paid ones become inactive                                                  |
| 2.12 | Money actions     | Look for Collect / Quick pay                                  | In the menu and the bulk bar — see §6                                                                              |
| 2.13 | Not there yet     | Look for Write off all, Record sale, Add custom debt           | Not there yet — they come with phases E2, F2 and F3                                                                |

## 3. The customer form

| #   | Scenario                | Steps                                                                                   | Expected result                                                                                                    |
| --- | ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 3.1 | Add                     | Add customer → name, phone, Beirut, plan "Internet", start today → Add Customer          | Dialog closes; the customer is in the list with "Internet"                                                          |
| 3.2 | Name / branch missing   | Save with an empty name; then (2+ branches) with no branch                             | Red banner in the dialog each time; Save is never greyed out                                                        |
| 3.3 | Default branch          | Header Branch = Beirut, then Add customer                                               | Branch starts on Beirut; a branch user never sees the field                                                         |
| 3.4 | Plans follow the branch | Pick a Beirut-only plan, then switch the branch to Tripoli                              | The plan clears to "No plan"; closing now does NOT ask to discard (the form cleared it, not you)                    |
| 3.5 | No branch yet           | 2+ branches, no branch picked                                                           | The plan box is off and says "Select a branch first"                                                                |
| 3.6 | Special price           | Special price → 15, LBP                                                                 | Saved line bills 15 LBP; "Use plan price" goes back to the plan's price                                             |
| 3.7 | 3-month plan price      | Pick the 3-month plan, open Special price                                               | The label says "per 3 months" — the typed amount covers the whole 3 months                                         |
| 3.8 | Second line             | Add plan                                                                                | A second card, starting on the first card's date; "Plan 1" / "Plan 2" headers and Remove buttons appear             |
| 3.9 | Remove unsaved line     | Remove the new card                                                                     | Gone at once, no question                                                                                          |
| 3.10 | Remove paid line       | Edit a customer, Remove a line that has payments                                        | "Remove plan" confirm with a "Delete permanently" tick box: unticked = the card shows "Cancelled" with Reactivate; ticked = the card is gone |
| 3.11 | Reactivate             | Reactivate a cancelled line → Save                                                      | The line is active again                                                                                           |
| 3.12 | Last line              | A customer with one active line                                                         | No Remove button (a customer keeps at least one line)                                                              |
| 3.13 | Locked start date      | Edit a customer whose line has a paid month                                             | Start date is off and says "Start date is locked — this plan already has payments."                                |
| 3.14 | New plan inline        | (Admin) Plan box → "Add a new plan" → save it                                           | The plan dialog opens on top; after saving, the new plan is in the plan box                                        |
| 3.15 | Portal on              | (Portal URL set by the SaaS owner) switch Customer portal on                            | A 10-letter password is filled in and shown; "Make a new password" replaces it; for a new customer: "The link appears once the customer is saved." |
| 3.16 | Portal link            | Edit a customer with the portal on → Copy link                                          | "Copied" for 2 seconds; pasting gives `{portal URL}/{customer id}`                                                  |
| 3.17 | Portal off             | Switch the portal off → Save → edit again                                               | Portal off and the password box empty (switching off clears the password)                                          |
| 3.18 | Portal short password  | Portal on, password "abc" → Save                                                        | Banner: the password needs at least 4 characters                                                                    |
| 3.19 | Discard guard          | Run [app-shell.md](app-shell.md) §5 on this form                                        | As written there                                                                                                   |

## 4. Limits (quota)

| #   | Scenario                   | Steps                                                                                     | Expected result                                                                                                  |
| --- | -------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 4.1 | Customer limit             | Organization at its customer limit → Add customer → Save                                  | "Customer limit reached" dialog on top of the form; Close keeps the typing; nothing was saved                     |
| 4.2 | Plan limit on create       | Room for 1 more customer but 0 more plans, add a customer with a plan                     | "Plan limit reached"; the customer is NOT created (lines are counted before the first write)                      |
| 4.3 | Plan limit on edit         | At the plan limit, edit a customer and add a second line                                  | "Plan limit reached"; the customer's other changes are saved, the new line is not                                  |
| 4.4 | Retry after a refusal      | 4.3, then remove the extra line and Save again (or raise the limit first)                 | Saves; for a new customer the retry EDITS the one already created — never a second copy of the customer            |
| 4.5 | Go to settings             | Tenant-wide admin → "Organization settings" in the limit dialog                           | Form closes, Organization Settings opens; a branch admin sees "ask your admin" and no button                       |

## 5. Add customer quick action

| #   | Scenario            | Steps                                                            | Expected result                                                         |
| --- | ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 5.1 | Any page            | On Products (admin) or Customers, click the person-plus header icon | Tooltip "Add Customer"; the customer form opens                          |
| 5.2 | Staff see it        | Log in as a user                                                 | The icon is there (every role may add customers, like the phone)         |
| 5.3 | List refreshes      | Customers page open → quick action → save                        | The new customer appears without a page reload                            |

## 6. Money actions (quick pay, collect)

The collect dialog itself is [collect.md](collect.md). The rules are the phone list's ([../customers.md](../customers.md), [../payments.md](../payments.md)); the shared logic is [quickPay.ts](Shared/src/modules/customer/customers/utils/quickPay.ts) + [useQuickPay.ts](Shared/src/modules/customer/customers/hooks/useQuickPay.ts) (unit tests: `tests/suites/quickPay.test.ts`, TC-QP-*). Every one of these WRITES money — test project only.

| #    | Scenario                  | Steps                                                                               | Expected result                                                                                                                                                  |
| ---- | ------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1  | Quick pay, one plan       | A customer with one $20 monthly plan, this month unpaid → ⋮ → Quick pay             | No question; the ⋮ turns into a small spinner, then "Saved $20.00 from {name}."; the row re-reads (it leaves the Unpaid tab)                                      |
| 6.2  | Quick pay, many plans     | Two unpaid priced plans → ⋮ → "Quick pay unpaid plans"                              | "Pay 2 subscription(s) now?" → Pay → one payment per currency; the confirm button spins while it saves                                                           |
| 6.3  | Multi-month plan          | A 3-month plan → Quick pay                                                          | The confirm warns it is charged for its full duration                                                                                                           |
| 6.4  | No set price, one line    | A customer whose only due plan is custom-priced → Quick pay                         | The collect dialog opens for that month with "Amount for this month" (see [collect.md](collect.md) §3)                                                           |
| 6.5  | No set price, two lines   | Two custom-priced lines due → Quick pay                                             | Blue notice: each month needs its own typed amount, on the customer page (E4 will open that page instead)                                                       |
| 6.6  | Older month unpaid        | A line with LAST month unpaid                                                       | That line is not quick-paid (months are paid oldest first); if it is the only line, there is no Quick pay item                                                  |
| 6.7  | Pay & send on WhatsApp    | A customer with a phone → "Pay & send on WhatsApp"                                  | Pays like 6.1, then WhatsApp opens in a new tab with the receipt; if the browser blocks the tab, a "Send it on WhatsApp" dialog with an "Open WhatsApp" button |
| 6.8  | No phone                  | A customer with no phone                                                            | "Pay & send on WhatsApp" is greyed, with "No phone number for this customer" under it                                                                           |
| 6.9  | Bulk quick pay (any role) | Tick 3 customers (one custom-priced, one already paid) → Quick pay                  | "Pay N subscription(s) now?" with "1 on custom plans will be skipped."; after Pay: "Saved payments from 2 customers."; the page re-reads                          |
| 6.10 | Bulk, nothing to pay      | Tick only customers who already paid → Quick pay                                    | "None of the selected customers can be quick-paid." with OK                                                                                                    |
| 6.11 | Collect money             | A customer with an unpaid month and a sale debt → ⋮ → Collect money                 | Spinner on the row, then the collect dialog with every bill, oldest first; Save → "Saved …" and the Debt column updates                                          |
| 6.12 | Collect, owes nothing     | Collect money on a row whose debt was just paid on the phone                        | Blue notice "This customer owes nothing."                                                                                                                      |
| 6.13 | Collect is hidden         | A customer who paid this month and has no debt                                      | No "Collect money" item                                                                                                                                         |
| 6.14 | A failed pay              | Turn the network off → Quick pay                                                    | Red banner with the reason above the table; nothing says "Saved"; the spinner stops                                                                            |
| 6.15 | Keyboard                  | Tab through a row's ⋮, the bulk bar and the dialog                                  | Every button shows a blue outline when it has keyboard focus                                                                                                   |

