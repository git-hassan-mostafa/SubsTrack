# Currencies — QA Scenarios

Multi-currency support. USD is the implicit base — never stored as a `currencies` row. Tenants can configure an arbitrary list of non-USD currencies (LBP, EUR, etc.) with a live rate per USD. Plan prices and payment amounts are stored "as typed" paired with `currency_id`; payments additionally freeze the exchange rate at record time via `rate_per_usd_snapshot`.

**Reference code:**
- Screen: [CurrenciesScreen.tsx](SubsTrack/src/modules/currencies/screens/CurrenciesScreen.tsx)
- Cards: [CurrencyCard.tsx](SubsTrack/src/modules/currencies/components/CurrencyCard.tsx), [UsdBaseCard.tsx](SubsTrack/src/modules/currencies/components/UsdBaseCard.tsx)
- Form sheet: [CurrencyFormSheet.tsx](SubsTrack/src/modules/currencies/components/CurrencyFormSheet.tsx)
- Service: [CurrencyService.ts](SubsTrack/src/modules/currencies/services/CurrencyService.ts)
- Store: [currencyStore.ts](SubsTrack/src/modules/currencies/store/currencyStore.ts)
- Repository: [CurrencyRepository.ts](SubsTrack/src/modules/currencies/repository/CurrencyRepository.ts)
- Reusable input: [CurrencyInput.tsx](SubsTrack/src/shared/components/CurrencyInput.tsx)
- Conversion utils: [currency.ts](SubsTrack/src/core/utils/currency.ts)
- Display currency preference: [uiPrefStore.ts](SubsTrack/src/shared/lib/uiPrefStore.ts)
- Tenant settings host: [TenantSettingsScreen.tsx](SubsTrack/src/modules/tenant-settings/screens/TenantSettingsScreen.tsx)

**DB constraints:**
- `UNIQUE(tenant_id, code)` — code must be unique per tenant.
- `CHECK code ~ '^[A-Z]{2,8}$' AND code <> 'USD'` — enforced uppercase; USD forbidden.
- `decimals BETWEEN 0 AND 6`.
- `rate_per_usd > 0`.

**FK on usage:** `plans.currency_id` and `payments.currency_id` use `ON DELETE RESTRICT` — currencies cannot be hard-deleted while referenced.

---

## 0. Critical invariants

1. **USD is implicit.** `currency_id = NULL` everywhere means USD. There is no row in `currencies` for USD.
2. **Codes are uppercase 2–8 letters, not USD.** Enforced by DB CHECK and re-validated by service.
3. **Editing live rate must never shift historical payment USD totals.** Payments use `rate_per_usd_snapshot`. Plans use the live rate (forward-looking pricing).
4. **Soft-delete preserves history.** Deleting a referenced currency sets `active = false` and removes it from pickers, but does NOT touch the rows that reference it.
5. **Display currency is per-user, persisted in AsyncStorage.** There is no column on `users` — `uiPrefStore.displayCurrencyId`.

---

## 1. Navigation to Currencies

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Reach the screen | Login as admin → Admin tab → tap "Tenant Settings" → tap "Currencies" (or whichever route is mounted at `admin/currencies.tsx`) | Currencies list screen renders with PageHeader "Currencies" and a `+ Add` button |
| 1.2 | Visibility — admin | Login as admin | Screen reachable from admin sub-menu |
| 1.3 | Visibility — user role | Login as user | Admin tab hidden, currencies screen unreachable from UI |
| 1.4 | Branch-scoped admin | Login as a branch admin (`users.branch_id != NULL`) | Currencies management is tenant-wide — verify whether branch admins can access. File a finding if the gate differs from other tenant-level features |
| 1.5 | Empty tenant (no custom currencies) | Open the screen on a tenant with zero `currencies` rows | USD base card always shown at top + EmptyState "No currencies yet" with "Add your first currency" CTA |
| 1.6 | Refresh on focus | Leave/return to the screen | `fetchCurrencies` re-runs |
| 1.7 | Pull-to-refresh | Pull down | Spinner; list reloads |

## 2. USD base card

USD is always displayed at the top of the list as a non-editable reference row.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | USD card rendered | Look at the top of the list | "USD · US Dollar · $" with "Base currency" label |
| 2.2 | USD card not editable | Try to tap edit / delete | No edit/delete affordance — USD is implicit, not a row |
| 2.3 | USD card visible even if no other currencies | Empty tenant | Still rendered |

## 3. Currency list — rendering

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Active rows | Tenant has 2 active currencies | Each rendered as a CurrencyCard with code, name, symbol, current rate-per-USD, decimals |
| 3.2 | Inactive rows | Tenant has a soft-deleted currency | Rendered below active rows (or grayed). Confirm visual distinction |
| 3.3 | Counts / summary | If summary shown | Verify reflects active-only count |
| 3.4 | Sort | Multiple currencies | Sort order is deterministic (e.g. code ascending) — verify |
| 3.5 | Rate display | Currency LBP, rate = 90000 | Card shows "1 USD = 90,000 LBP" formatted with grouping |
| 3.6 | Decimals display | LBP decimals = 0 | Sample amount formatted with 0 decimals; EUR (decimals = 2) shows 2 decimals |

## 4. Add currency

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Open form | Tap "+ Add" | Sheet "Add Currency" with: Code, Name, Symbol, Rate per USD, Decimals |
| 4.2 | Required fields marked with asterisk | Look at labels | Code, Name, Symbol, Rate, Decimals show "*" |
| 4.3 | Submit disabled until valid | Open form | Submit disabled until all required fields valid |
| 4.4 | Valid create | Code "LBP", Name "Lebanese Pound", Symbol "ل.ل", Rate 90000, Decimals 0 | Currency created; appears in list; available in CurrencyInput dropdowns immediately |
| 4.5 | Code lowercased on input | Type "lbp" | Inline transform uppercases to "LBP" (or service rejects). Verify behavior |
| 4.6 | Code with USD | Type "USD" | Service throws "USD is the base currency and cannot be added" |
| 4.7 | Code wrong length | Type "L" (1 char) | Validation: 2–8 chars required |
| 4.8 | Code with numbers / special chars | Type "L1" or "L$" | Rejected (regex `^[A-Z]{2,8}$`) |
| 4.9 | Duplicate code in tenant | Create LBP twice | Service rejects: "A currency with this code already exists" |
| 4.10 | Same code in different tenant | Create LBP in tenant A and B | Both allowed (per-tenant unique) |
| 4.11 | Rate = 0 | Enter 0 | Service rejects: "Rate must be greater than 0" |
| 4.12 | Rate negative | Enter -1 | Rejected |
| 4.13 | Rate very small | Enter 0.000001 | Accepted (> 0) |
| 4.14 | Rate decimal | Enter 1.5 | Accepted |
| 4.15 | Decimals out of range | Enter 7 or -1 | Rejected (0–6 range) |
| 4.16 | Symbol empty | Leave Symbol blank | Service rejects ("Symbol required") — verify validation surface |
| 4.17 | Name empty | Leave Name blank | Rejected |
| 4.18 | Trim Name | "  Lebanese Pound  " | Stored as "Lebanese Pound" |
| 4.19 | Network error | Disable network, submit | ErrorBanner in sheet; sheet stays open with values |
| 4.20 | Loading state | Slow create | Submit shows spinner; double-tap guarded |
| 4.21 | Cancel | Tap Cancel | Sheet closes, nothing persisted |

## 5. Edit currency

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Open edit | Tap a currency card | Sheet "Edit Currency" with fields prefilled |
| 5.2 | Code editable | Try to change LBP → LBN | Allowed if not duplicate in tenant. Existing plans/payments still reference by id, so display label changes everywhere |
| 5.3 | Code to USD | Change to USD | Rejected |
| 5.4 | Edit rate | Change LBP rate from 90000 → 100000 | Saved. Plans priced in LBP now convert to USD using the new rate (forward-looking). Payments recorded BEFORE the change keep their `rate_per_usd_snapshot = 90000` |
| 5.5 | Edit name / symbol | Update | Reflected everywhere immediately (CurrencyInput labels, receipts, plan cards) |
| 5.6 | Edit decimals | Change LBP decimals from 0 → 2 | New amounts formatted with 2 decimals; existing stored values unchanged (numeric column tolerates) |
| 5.7 | Cancel | No persistence |
| 5.8 | Loading state | Slow save | Spinner; double-tap guarded |
| 5.9 | Network error | Disable net, save | ErrorBanner; values preserved |

## 6. Delete currency (smart soft/hard)

`CurrencyService.deleteCurrency()` counts references in `plans` + `payments`. Reference count > 0 → soft-delete (`active = false`). Zero references → hard-delete the row.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Confirm dialog | Tap delete on a card | ConfirmDialog with destructive style, message that explains soft- vs hard-delete depending on usage |
| 6.2 | Hard delete (unreferenced) | Currency has zero references | Row removed from DB and list |
| 6.3 | Soft delete (referenced) | Currency referenced by a plan or payment | Row's `active` set to false. Card moves to "Inactive" section or hides from default dropdowns. Existing plans/payments still display the (now-inactive) currency label |
| 6.4 | FK protection | Bypass UI and DELETE a referenced row via SQL | `ON DELETE RESTRICT` blocks the delete at the DB level |
| 6.5 | Reactivate inactive | Edit an inactive currency, save | Becomes active again. Available in pickers again |
| 6.6 | Cascade — plan dropdown | Soft-delete LBP; open Plan form | LBP no longer in the picker. Existing plans priced in LBP still show their currency on the card |
| 6.7 | Cascade — payment form | Soft-delete LBP; record a new payment | LBP no longer in `CurrencyInput` dropdown |
| 6.8 | Cancel delete | Tap Cancel on the dialog | No change |
| 6.9 | Network error | Disable net, confirm delete | ErrorBanner; currency still present |

## 7. CurrencyInput component

The reusable input with embedded currency dropdown. Used in PlanFormSheet (price), PaymentFormSheet (custom amounts), and PaymentDetailSheet (edit).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Dropdown contents | Open the dropdown | USD listed first, then each active tenant currency. Inactive currencies excluded |
| 7.2 | Default currency | Open a fresh form | Defaults to `uiPrefStore.lastUsedCurrencyId` (or USD if never used) |
| 7.3 | Switching currency does NOT convert the typed number | Type `100` while USD selected, switch to LBP | Field still shows `100` (now interpreted as 100 LBP). The literal number is preserved — "I meant this number in the new unit" |
| 7.4 | Last-used persists per submit | Submit a payment in LBP, open another form | CurrencyInput defaults to LBP |
| 7.5 | Lock currency mode | Used inside Amount Paid (locked to Due's currency) | Dropdown not interactive, shows the locked currency |
| 7.6 | Tenant with no custom currencies | Open form on a tenant with zero `currencies` rows | Dropdown shows USD only |
| 7.7 | Decimal-pad keyboard | Tap the amount input | Numeric keyboard with decimal separator |
| 7.8 | Localized number formatting | Switch app to Arabic | Numbers formatted per active locale; LBP formatted with grouping |
| 7.9 | Currency change clears partial state | In PaymentFormSheet, type custom + Partial, switch currency | Partial Amount Paid is cleared (old unit value invalid) |
| 7.10 | Negative input | Try to type `-` | Decimal-pad blocks; if forced, parseFloat rejects |

## 8. Display currency (per-user preference)

Lives in `uiPrefStore.displayCurrencyId`, persisted to AsyncStorage. Controlled from Tenant Settings → "Display currency" section.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Default | First install | Display currency = USD (null) |
| 8.2 | Change to LBP | Tenant Settings → Display currency → select LBP | All read-only displays now show LBP equivalents: plan cards, dashboard "Collected", admin compact stats, customer year-total |
| 8.3 | Persistence | Restart app | Selection persists |
| 8.4 | Receipt fidelity | Payment was recorded in LBP, display currency = USD | Receipt primary line is LBP (stored currency); secondary "≈ $X.XX" line via snapshot rate |
| 8.5 | No change to stored data | Switch display | DB rows are unchanged. UI conversion only |
| 8.6 | Cross-currency aggregate | Multiple payments in mixed currencies | Dashboard sums each to USD via its snapshot, then displays the USD total formatted in the user's display currency |
| 8.7 | Display currency deleted | User has display = LBP; admin soft-deletes LBP | Verify UI falls back to USD without crashing |
| 8.8 | Display currency per user, not per tenant | Two admins of same tenant pick different display currencies | Both stick locally; no cross-user effect |
| 8.9 | Logout does NOT reset display | Logout, log back in | Display currency persists (it's a UI pref, not session-bound) |

## 9. Currency in plans

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Create plan in USD | Plan form, leave currency = USD | Plan stored with `currency_id = NULL`. PlanCard shows "$X / month" |
| 9.2 | Create plan in LBP | Pick LBP, enter 50000 | Stored with `currency_id = LBP_id, price = 50000`. PlanCard shows "ل.ل 50,000 / month" + USD equivalent via live rate |
| 9.3 | Edit plan currency | Change LBP plan to USD | Price treated as USD (no conversion). Verify expected UX — switching currency = "I meant this number in the new unit" |
| 9.4 | Live rate change | LBP plan exists, admin edits LBP.ratePerUsd | Plan's USD equivalent on the card updates immediately (forward-looking pricing) |

## 10. Currency in payments

See [payments.md § 13](payments.md) for full coverage. Key points:

| # | Scenario | Expected result |
|---|----------|-----------------|
| 10.1 | Payment stores `currency_id` + `rate_per_usd_snapshot` | Frozen at record time |
| 10.2 | Editing a payment re-snapshots | New rate captured from current live `currencies.ratePerUsd` |
| 10.3 | USD payments | `currency_id = NULL, rate_per_usd_snapshot = 1` |
| 10.4 | Dashboard aggregate | Sums in USD via snapshot rates; never via live rate |

## 11. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | Many currencies (20+) | Tenant has 20 active currencies | List renders without performance issues; dropdown still usable |
| 11.2 | Empty list with USD card | Verify the USD card never disappears even when CurrencyCard list is empty |
| 11.3 | Concurrent rate edit | Admin A changes rate to 90000, Admin B to 100000 | Last write wins; new payments after the second edit use 100000 |
| 11.4 | Currency code length 8 | Create code "ABCDEFGH" | Accepted (max length) |
| 11.5 | Symbol with multiple chars | Symbol "ل.ل" (3 chars) | Accepted |
| 11.6 | Symbol with emoji | Symbol "🪙" | Stored. Verify rendering across receipts/cards |
| 11.7 | Soft-deleted currency in display preference | Display currency = X, then X is soft-deleted | UI must not crash; fall back to USD for formatting |
| 11.8 | RTL display | Switch to Arabic | Currency cards and forms layout RTL; symbols render correctly |
| 11.9 | Tenant scoping | Currencies created in tenant A invisible to tenant B | RLS enforces |

## 12. Permissions matrix

| Operation | Admin | User |
|-----------|-------|------|
| View currency list | ✓ | ✗ (Admin tab hidden) |
| Create/edit/delete currency | ✓ | ✗ |
| Use CurrencyInput in payment form | ✓ | ✓ |
| Change display currency | ✓ | ✓ |
