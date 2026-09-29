# Web — Organization Settings Page — QA Scenarios

The **Organization Settings** admin page on the desktop web app: limits and billing, display currency, unpaid months rule. Only an organization-wide admin can open it. The rules are the phone's: [../customer-allowance.md](../customer-allowance.md) and [../tenant-settings.md](../tenant-settings.md).

**Reference code:**

- Page: [OrganizationPage.tsx](Web/src/modules/admin/tenant-settings/OrganizationPage.tsx), [DisplayCurrencySection.tsx](Web/src/modules/admin/tenant-settings/DisplayCurrencySection.tsx), [UnpaidRuleSection.tsx](Web/src/modules/admin/tenant-settings/UnpaidRuleSection.tsx)
- Limits: [LimitsSection.tsx](Web/src/modules/admin/billing/LimitsSection.tsx), [UpdateAllowanceDialog.tsx](Web/src/modules/admin/billing/UpdateAllowanceDialog.tsx), [AllowanceField.tsx](Web/src/modules/admin/billing/AllowanceField.tsx), [UsageMeter.tsx](Web/src/modules/admin/billing/UsageMeter.tsx)
- Form rules (shared with the phone sheet): [useAllowanceForm.ts](Shared/src/modules/admin/billing/hooks/useAllowanceForm.ts), [allowanceDraft.ts](Shared/src/modules/admin/billing/utils/allowanceDraft.ts) (unit tests: `tests/suites/allowanceDraft.test.ts`)
- Limit reached dialog (used by the customer form from D2): [QuotaReachedDialog.tsx](Web/src/modules/admin/billing/QuotaReachedDialog.tsx)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project.

---

## 1. Opening the page

| #   | Scenario           | Steps                                                  | Expected result                                                                   |
| --- | ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1.1 | Who sees it        | Log in as a branch admin, then as a staff member       | No "Organization Settings" in the nav; typing `/admin/organization` is refused    |
| 1.2 | Sections           | Organization-wide admin opens it                       | Three cards: Limits and billing, Display, Unpaid months                           |
| 1.3 | Fresh counts       | Add a customer on the phone, then open the page        | The customer count includes the new customer (the page re-reads on open)          |

## 2. Limits and billing

| #   | Scenario             | Steps                                                  | Expected result                                                                                     |
| --- | -------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 2.1 | Usage meters         | Look at both meters                                    | "used / limit", a bar, "N more … available"; amber from 80 %, red when full ("You have used your whole limit.") |
| 2.2 | Monthly amount       | Look at the amount row                                 | `$` plan limit × price per plan, with "N allowed × $price per plan" under it                        |
| 2.3 | No animation         | Reload the page                                        | The bars appear at their value at once, no sliding                                                  |
| 2.4 | Open the dialog      | Update your limits                                     | "Your limits now" box, two rows: new total + Change box with − / +                                  |
| 2.5 | Two boxes, one number | Type 70 in Allowed customers                          | Change shows +20 in green; Allowed plans rises to 70 too if it was lower                            |
| 2.6 | Type a minus         | In Change, type `-5`                                   | The minus stays while typing; the total drops by 5; the text turns red                              |
| 2.7 | Floor                | Press − until it stops                                 | Customers stop at 30; plans stop at the customer number                                             |
| 2.8 | Nothing changed      | Open, press the main button without changing anything  | Red banner "Change one of the numbers first." — nothing is saved                                     |
| 2.9 | Too small a raise    | Raise customers by 5 only                              | Red line "You can request at least 10 more in total."; Save does nothing                           |
| 2.10 | Mixed                | Raise customers, lower plans                           | "Raise or lower, not both at once…"                                                                |
| 2.11 | Below active         | Lower plans under the active plan count                | Red text under the box + amber "Deactivate first" note; Save does nothing                          |
| 2.12 | Lower                | Lower both inside the rules → Lower limits              | Confirm dialog; on confirm the dialog closes and the meters show the new limits and amount          |
| 2.13 | Raise                | Raise by 10+ → Send request                            | Dialog closes; amber "Request pending" box replaces the Update button                              |
| 2.14 | Raise + WhatsApp     | Raise → Send request + WhatsApp (support number set)   | Request saved and a new tab opens `wa.me/<support>` with "Hello, <org> would like …"               |
| 2.15 | No support number    | Remove the support number option, open the dialog      | No "Send request + WhatsApp" button                                                                 |
| 2.16 | Edit request         | Request pending → Edit request                         | Dialog opens on the numbers already asked; Save request updates the pending box                     |
| 2.17 | Cancel request       | Request pending → Cancel request                       | Red confirm; on confirm the pending box goes and Update your limits is back                        |
| 2.18 | Declined             | Decline the request in SuperAdmin, reopen the page     | Red "Request declined" box above the Update button                                                  |
| 2.19 | Discard guard        | Change a number, press Esc / X / Cancel                | "Discard changes?" confirm                                                                           |
| 2.20 | Server error         | Block the network, Lower limits                        | The error shows inside the dialog, not on the page                                                 |

## 3. Display currency

| #   | Scenario         | Steps                                           | Expected result                                                                          |
| --- | ---------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 3.1 | Options          | Open the Display currency list                  | USD (with "USD is the base currency…") and every ACTIVE currency with its name            |
| 3.2 | Save on pick     | Pick LBP                                        | Saved at once; the box shows LBP; the phone shows amounts ≈ LBP after its next refresh   |
| 3.3 | Inactive picked  | Deactivate the currency that is the display one | The box shows USD                                                                         |

## 4. Unpaid months rule

| #   | Scenario        | Steps                                        | Expected result                                                                 |
| --- | --------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| 4.1 | Options         | Open the Mark unpaid list                    | Two options, each with its explanation under it                                 |
| 4.2 | Save on pick    | Pick "On the customer's start day"           | Saved at once; the hint under the box changes to that option's explanation     |
| 4.3 | Audit           | Open Admin → Audit Log                       | "… set Unpaid months rule to …" is the newest entry                              |

## 5. Limit reached dialog (checked from D2 on)

| #   | Scenario           | Steps                                                         | Expected result                                                                   |
| --- | ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 5.1 | Admin              | Add a customer past the customer limit                        | "Customer limit reached", counts, Close + Organization settings                  |
| 5.2 | Go to settings     | Press Organization settings                                   | The customer form closes and this page opens                                      |
| 5.3 | Branch admin       | Same as a branch admin                                        | "Ask your administrator to request more." and Close only                          |
