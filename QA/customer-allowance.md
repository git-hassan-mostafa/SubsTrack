# QA — Customer Allowance & Billing

Covers per-customer pricing: the **Customers & billing** card in Organization Settings, the monthly amount, the "request more customers" flow (send / edit / cancel), the SaaS owner accepting or declining a request from SuperAdmin, the hard cap on creating customers, the single **Update customer number** sheet that raises by request and lowers instantly (§13), and the server-side locks that stop a tenant admin raising it.

There are **no tiers**. Branches, users, plans, products and currencies are unlimited, multi-currency and multi-month plans are always on, and the only quantity limit left in the product is **how many active customers a tenant may hold**.

## Reference code

- Module: [SubsTrack/src/modules/admin/billing/](../SubsTrack/src/modules/admin/billing/)
- Service: [BillingService.ts](../SubsTrack/src/modules/admin/billing/services/BillingService.ts) (`monthlyAmountUsd`, `assertCanCreateCustomer`, `validateRequest`, `validateDecrease`, `lowerAllowance`)
- Settings card: [CustomerAllowanceSection.tsx](../SubsTrack/src/modules/admin/billing/components/CustomerAllowanceSection.tsx)
- Update sheet (both directions): [UpdateAllowanceSheet.tsx](../SubsTrack/src/modules/admin/billing/components/UpdateAllowanceSheet.tsx) · usage bar: [UsageBar.tsx](../SubsTrack/src/modules/admin/billing/components/UsageBar.tsx) · sign helper: [allowanceChange.ts](../SubsTrack/src/modules/admin/billing/utils/allowanceChange.ts)
- Block modal: [CustomerLimitReachedModal.tsx](../SubsTrack/src/modules/admin/billing/components/CustomerLimitReachedModal.tsx)
- Typed errors: [customerLimitError.ts](../SubsTrack/src/modules/admin/billing/utils/customerLimitError.ts), [allowanceFloorError.ts](../SubsTrack/src/modules/admin/billing/utils/allowanceFloorError.ts) · min constant: [types.ts](../SubsTrack/src/modules/admin/billing/utils/types.ts) (`MIN_CUSTOMER_REQUEST = 10`)
- Repositories: [CustomerRequestRepository.ts](../SubsTrack/src/modules/admin/billing/repository/CustomerRequestRepository.ts) (web) · [CustomerRequestRepository.offline.ts](../SubsTrack/src/modules/admin/billing/repository/CustomerRequestRepository.offline.ts) (native, online-only) · [AllowanceRepository.ts](../SubsTrack/src/modules/admin/billing/repository/AllowanceRepository.ts) + [.offline](../SubsTrack/src/modules/admin/billing/repository/AllowanceRepository.offline.ts) (the `lower_customer_allowance` RPC, online-only)
- Slice: [billingSlice.ts](../SubsTrack/src/state/slices/billing/billingSlice.ts) · hook `useBillingSlice`
- Cap enforcement: [CustomerService.createCustomer](../SubsTrack/src/modules/customer/customers/services/CustomerService.ts) → [customerSlice.ts](../SubsTrack/src/state/slices/customers/customerSlice.ts)
- Host screen: [TenantSettingsScreen.tsx](../SubsTrack/src/modules/admin/tenant-settings/screens/TenantSettingsScreen.tsx)
- SuperAdmin: [TenantCard.tsx](../SuperAdmin/src/modules/tenants/components/TenantCard.tsx), [TenantFormSheet.tsx](../SuperAdmin/src/modules/tenants/components/TenantFormSheet.tsx), [TenantService.ts](../SuperAdmin/src/modules/tenants/services/TenantService.ts), [TenantRepository.ts](../SuperAdmin/src/modules/tenants/repository/TenantRepository.ts)
- SQL: `tenants.customer_allowance` / `tenants.price_per_customer_usd`, table `customer_requests`, index `uq_customer_requests_one_pending`, trigger `trg_tenants_guard_billing`, functions `accept_customer_request()` / `lower_customer_allowance()` in [sql scripts/script.sql](../sql%20scripts/script.sql)
- Local mirror columns: [tables.ts](../SubsTrack/src/core/offline/db/tables.ts) (`tenants.customer_allowance`, `tenants.price_per_customer_usd`)
- Unit tests: `tests/suites/customerAllowance.test.ts` (TC-CA-01…11) — see [money-unit-tests.md](money-unit-tests.md)

**Schema defaults:** `customer_allowance = 30`, `price_per_customer_usd = 0.15`. Every new tenant starts there, by both creation paths.

**DB constraints:**

- `chk_tenants_customer_allowance_min` — `customer_allowance >= 30`. **Renamed** from `chk_tenants_customer_allowance` (`>= 0`); `script.sql` drops the old one, lifts any tenant under 30 onto 30, then adds the new one.
- `chk_tenants_price_per_customer` — `price_per_customer_usd >= 0`, `NUMERIC(10,4)`.
- `chk_customer_requests_min` — `requested_count >= 10`.
- `chk_customer_requests_status` — `status IN ('pending','accepted','declined','cancelled')`.
- `uq_customer_requests_one_pending` — partial unique index on `(tenant_id)` `WHERE status = 'pending'`.
- `tenants` has **no UPDATE policy**; `trg_tenants_guard_billing` additionally raises for any session carrying an `auth.uid()`.
- `accept_customer_request(UUID, INT)` is `REVOKE`d from `anon`, `authenticated` and `public`.

---

## 0. Critical invariants

1. **The monthly amount is ALWAYS in USD** — `activeCustomers × price_per_customer_usd`, rounded to 2 decimals. It never uses the tenant's display currency, even when that is LBP.
2. **The cap counts ACTIVE customers only.** Deactivating a customer frees a slot immediately; a cancelled/inactive customer never counts.
3. **The cap blocks AT the allowance, not one past it.** With `allowance = 30` and 30 active customers, the 31st is refused.
4. **Exactly one pending request per tenant**, enforced by a partial unique index — not by the UI.
5. **Only the SaaS owner moves the numbers.** A tenant admin can insert, edit and cancel a *request*; they can never raise `customer_allowance`, flip a request to `accepted`, or call `accept_customer_request`.
6. **Accept is atomic** — one `accept_customer_request()` call marks the request accepted and raises the allowance. Decline is a plain status update and touches no allowance.
7. **The allowance rides on the synced tenant row**, so the cap still blocks with no network. `customer_requests` is **not** mirrored — every request action is online-only.
8. **Minimum request is 10** (`MIN_CUSTOMER_REQUEST`), whole numbers only.

---

## 1. Settings card — layout & arithmetic

The card sits at the top of Admin → Organization Settings, above Display currency.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Card is reachable | Admin tab → Organization Settings | "Customers & billing" card renders first, above Display and Unpaid-months sections |
| 1.2 | Three rows | Look at the card | Allowed customers, Current customers, Monthly amount — in that order |
| 1.3 | Allowed customers | Fresh tenant, untouched defaults | Reads `30` |
| 1.4 | Current customers | Tenant with 12 active + 3 deactivated customers | Reads `12` — inactive ones are not counted |
| 1.5 | Monthly amount — the headline case | 100 active customers, price `0.15` | `$15.00` |
| 1.6 | Two-decimal rounding | 7 active customers, price `0.15` | `$1.05` — never `$1.0499999…` or `$1.04` (unit test TC-CA-02) |
| 1.7 | No customers yet | 0 active customers | `$0.00` |
| 1.8 | Free tenant | Owner sets price to `0`, 500 customers | `$0.00` |
| 1.9 | Amount note | Under the amount | The "N customers × $price" note echoes the same two numbers |
| 1.10 | **Always USD** | Set the tenant display currency to LBP, reopen the card | The monthly amount is still `$` USD — no LBP figure, no "≈" secondary line. Everything else on the screen may be LBP |
| 1.11 | Price with 4 decimals | Owner sets price `0.1250`, 80 customers | `$10.00`; the note shows the price as stored |
| 1.12 | Count refreshes after a create | Add a customer, return to the card | Current customers increments by 1 without a manual reload; monthly amount recomputes |
| 1.13 | Count refreshes after deactivate | Deactivate a customer, return | Current customers decrements; amount drops |
| 1.14 | Count is tenant-wide | Log in as a **branch** admin of a 3-branch tenant | Current customers shows the TENANT total, not the branch's share — the cap is tenant-wide |
| 1.15 | Card on focus | Leave the screen and come back | The request state re-reads (`useFocusEffect` → `refreshRequest`); no duplicate spinner |
| 1.16 | Non-admin | Log in as `user` role | Admin tab hidden; the card is unreachable |
| 1.17 | RTL | Switch to Arabic | Rows mirror; the amount stays `$15.00` left-to-right and is not mangled |

## 2. Requesting more customers — send

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Button present | No pending request | "Request more customers" button at the bottom of the card |
| 2.2 | Open the sheet | Tap it | Sheet opens with one numeric field, pre-filled `10`, and a hint naming the minimum |
| 2.3 | Digits only | Type `12a.b3` | Field holds `123` — letters and dots are stripped as typed |
| 2.4 | Min 10 — below | Type `9` | Inline field error "minimum 10"; **Send request** disabled |
| 2.5 | Min 10 — at | Type `10` | No error; Send request enabled |
| 2.6 | Empty field | Clear the field | Send request disabled, no error shown until something is typed |
| 2.7 | Send succeeds | Type `50`, tap **Send request** | Row inserted `status = 'pending'`, `requested_count = 50`, `requested_by` = the admin's user id; sheet closes; the card flips to the amber pending block |
| 2.8 | Allowance unchanged | After 2.7, re-read the card | Allowed customers is STILL the old number — a request grants nothing |
| 2.9 | Field caps length | Type 8 digits | Field stops at 6 characters |
| 2.10 | Double-tap Send | Tap Send twice fast | One row only; the button is disabled while `saving` |
| 2.11 | Dirty-form guard | Type `90`, drag the sheet down | "Discard changes?" prompt (see [unsaved-changes.md](unsaved-changes.md)); no row written on discard |
| 2.12 | Server rejects below 10 | Force an insert of `requested_count = 5` via the API | `chk_customer_requests_min` violation — the client-side rule is not the only guard |

## 3. Request buttons — WhatsApp variant

The second button uses the global option `SupportWhatsAppNumber` (see [options.md](options.md)).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Both buttons shown | `SupportWhatsAppNumber` set, open the sheet | **Send request** and a green **Send request + WhatsApp** below it |
| 3.2 | WhatsApp variant saves first | Type `100`, tap Send request + WhatsApp | The request row is written FIRST, then WhatsApp opens; sheet closes |
| 3.3 | Message content | Same action | Prefilled chat to the support number naming the organization and the requested count |
| 3.4 | Save fails → no WhatsApp | Force the insert to fail (e.g. a pending row already exists) | ErrorBanner in the sheet, sheet stays open, **WhatsApp does not open** |
| 3.5 | **Blank number hides the button** | Clear `SupportWhatsAppNumber` in SuperAdmin → Options, relaunch, open the sheet | Only **Send request** renders — no dead green button, no broken deep link |
| 3.6 | Option row missing entirely | Delete the `SupportWhatsAppNumber` row | Same as 3.5 — treated as blank, no crash |
| 3.7 | WhatsApp not installed | Device without WhatsApp, tap the green button | The request is still saved; the deep link fails gracefully with no crash |
| 3.8 | Same rule on edit | Pending request → Edit, with the number blank | The edit sheet also shows only one button |

## 4. Pending request — the amber block

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Block replaces the button | With a pending request | Amber block naming the requested number; the "Request more customers" button is GONE |
| 4.2 | Two actions | Look at the block | **Edit** and **Cancel** side by side |
| 4.3 | Edit opens pre-filled | Tap Edit | Sheet title reads Edit; the field holds the current requested count, not `10` |
| 4.4 | Edit saves | Change `50` → `120`, save | Same row updated, `requested_count = 120`, still `pending`; the block text updates; no second row |
| 4.5 | Edit still enforces min 10 | Edit to `4` | Field error; save disabled |
| 4.6 | Cancel asks first | Tap Cancel | A confirmation dialog naming the requested number, with a destructive confirm |
| 4.7 | Cancel — keep | Dismiss the dialog | Request untouched, still pending, block unchanged |
| 4.8 | Cancel — confirm | Confirm | Row `status = 'cancelled'`; the block disappears; "Request more customers" returns |
| 4.9 | Request again after cancel | Tap Request more customers | Allowed — the cancelled row is not pending, so the unique index does not block |
| 4.10 | **One pending at a time** | With a pending row, force a second insert via the API | `uq_customer_requests_one_pending` unique violation; the UI never offers the path |
| 4.11 | Buttons disabled while saving | Tap Cancel and watch | Edit and Cancel both disabled during the write |
| 4.12 | Owner accepts while the sheet is open | Owner accepts in SuperAdmin, then the admin returns to the screen | On focus the card re-reads: block gone, allowance raised |

## 5. Accept — the owner grants the raise

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Pill on the tenant card | Tenant has a pending request for +50 | SuperAdmin → Tenants: an ORANGE "Requested +50" pill on that tenant's card |
| 5.2 | Card billing line | Same card | "{allowance} customers · ${price} each" — e.g. "30 customers · $0.15 each" |
| 5.3 | No request, no pill | Tenant with no pending row | No orange pill; the billing line still shows |
| 5.4 | Accept block at the top | Open the tenant sheet | An Accept / Decline block ABOVE the name field, showing "Requested +50 customers" and the request date |
| 5.5 | Grant defaults to the request | Look at the Grant field | Pre-filled with `50` — the requested count |
| 5.6 | Accept as asked | Tap Accept | Allowance 30 → 80; request `status = 'accepted'`, `granted_count = 50`, `decided_at` set; block disappears |
| 5.7 | **Grant a DIFFERENT number** | Change Grant to `20`, tap Accept | Allowance 30 → **50**, not 80; `granted_count = 20`, `requested_count` stays `50` |
| 5.8 | Grant more than asked | Set Grant to `200`, Accept | Allowance rises by 200 — granting above the request is allowed |
| 5.9 | Grant must be ≥ 1 | Set Grant to `0` or blank | Accept disabled ("Granted customers must be a whole number of 1 or more") |
| 5.10 | Grant must be whole | Set Grant to `10.5` | Accept disabled |
| 5.11 | **Allowance field follows the accept** | Accept +20, then press **Save** on the same open sheet without touching anything | The tenant keeps the raised allowance — the form's Customer Allowance field was bumped by the grant, so Save does not write the pre-accept number back |
| 5.12 | Atomicity | Accept, then inspect the DB | Either both the status flip and the raise landed, or neither — they are one `accept_customer_request()` call |
| 5.13 | Accept a non-pending request | Accept, then call `accept_customer_request` again with the same id | "Request is not pending"; the allowance does **not** rise twice |
| 5.14 | Card patches, no re-fetch | Watch the tenant list after Accept | The row's allowance updates and the orange pill clears from what the write returned — no full list reload |
| 5.15 | Tenant sees it | Tenant admin reopens Organization Settings | Allowed customers = the new number; the amber block is gone; creates that were blocked now succeed |
| 5.16 | Monthly amount after a raise | Raise the allowance only | The monthly amount does NOT change — it bills ACTIVE customers, not the allowance |

## 6. Decline

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Decline the request | Tenant sheet → Decline | Row `status = 'declined'`, `decided_at` set; `customer_allowance` UNCHANGED; block disappears; pill clears |
| 6.2 | Decline is a plain update | Inspect the SQL path | A normal `UPDATE`, not `accept_customer_request` — no allowance arithmetic anywhere |
| 6.3 | Tenant sees the red note | Tenant admin opens Organization Settings | A RED note naming the declined count, with "Request more customers" available beneath it |
| 6.4 | Request again after a decline | Tap Request more customers | New pending row created — the declined one is not pending |
| 6.5 | Red note clears | After the new request is sent | The red note is replaced by the amber pending block |
| 6.6 | Only the latest matters | Tenant with an old accepted row, an old declined row and nothing pending | The card reads the NEWEST row; an old accepted row shows neither amber nor red |

## 7. The hard cap on creating customers

Enforced in `CustomerService.createCustomer` via `billingService.assertCanCreateCustomer(allowance, activeCount)`, using the **tenant-wide** active count held in the billing slice.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Under the cap | Allowance 30, 29 active, add a customer | Saved normally; count becomes 30 |
| 7.2 | **At the cap** | Allowance 30, 30 active, submit the Add Customer form | "Customer limit reached" modal; **no row inserted**; the form stays open behind it |
| 7.3 | Over the cap | Owner lowers the allowance to 20 while 30 are active, try to add | Blocked the same way — the modal reports 30 of 20 |
| 7.4 | Allowance at the floor | Owner sets allowance `30`, tenant fills all 30, try to add the 31st | Blocked — `0` is no longer settable, 30 is the product minimum |
| 7.5 | Deactivating frees a slot | At the cap, deactivate one customer, retry the create | Succeeds — the cap counts active rows only |
| 7.6 | Reactivating re-fills it | At allowance, reactivate a previously deactivated customer, then try to add a new one | Blocked again |
| 7.7 | **Tenant-wide admin gets a way out** | Hit the cap as an admin with `branch_id = null` | Modal shows the count vs allowance and a primary button to Organization Settings |
| 7.8 | That button navigates | Tap it | Modal + form close; Organization Settings opens on the Customers & billing card |
| 7.9 | **Branch admin gets no button** | Hit the cap as an admin bound to a branch | Modal says "ask your administrator"; **no** navigate button — only Close |
| 7.10 | Staff role | A `user` role hits the cap | Same "ask your administrator" wording, no button |
| 7.11 | Close the modal | Tap Close | Modal dismisses, the customer form is still there with the typed values intact; `customerLimitError` is cleared |
| 7.12 | Editing is never blocked | At the cap, edit an existing customer | Saves fine — the cap gates creates only |
| 7.13 | Not an ErrorBanner | Hit the cap | The limit surfaces as the modal, never as a red banner string; `error` stays null (the slice stores a structured `customerLimitError`) |
| 7.14 | Cap after a raise | Hit the cap, get the allowance raised, retry | Create succeeds with no relaunch — the slice refreshes on focus |
| 7.15 | Branch count does not leak | Branch admin with 5 branch customers, tenant total 30, allowance 30 | Blocked — the cap reads the tenant-wide count, never the branch-filtered one |
| 7.16 | Signup path | Brand-new tenant, immediately add customers | Blocks at 30 — schema defaults apply from day one, with no setup step |

## 8. Offline (native)

`tenants` is mirrored, `customer_requests` is not.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | **The cap still blocks offline** | Sync, go airplane mode, add customers past the allowance | Blocked with the same modal — the allowance rode in on the mirrored tenant row |
| 8.2 | Card reads offline | Airplane mode → Organization Settings | Allowed customers, Current customers and the monthly amount all render from local data |
| 8.3 | Request offline | Airplane mode → Request more customers → Send | Offline error banner in the sheet; sheet stays open; **no row written anywhere**, nothing queued |
| 8.4 | Edit offline | Pending request, airplane mode, Edit → Save | Offline error banner; the request keeps its old count; no half-written row |
| 8.5 | Cancel offline | Pending request, airplane mode, Cancel → confirm | Offline error banner; the request stays pending |
| 8.6 | No crash, no half-state | Repeat 8.3–8.5 a few times | No redbox, no duplicate rows once back online, store still consistent |
| 8.7 | Silent request refresh | Open the card offline | The pending/declined block may simply not render (the read fails quietly) — no scary banner over a read |
| 8.8 | Back online | Restore network, reopen the screen | The pending block reappears from the server read |
| 8.9 | Raise arrives by sync | Owner raises the allowance while the device is offline; device syncs | The new allowance lands with the tenant row; creates that were blocked now pass |
| 8.10 | Not in `PUSH_WAVES` | Inspect the sync engine | `customer_requests` appears in no wave and in no pull list — see [sync-engine.md](sync-engine.md) |
| 8.11 | Web is unaffected | Repeat 8.3 on web | Web talks to Supabase directly; the request writes normally when the browser is online |

## 9. SECURITY — a tenant admin cannot pay themselves

**Release blocker.** Run each of these with a real tenant-admin session token (not the service role), e.g. from a REST client or the Supabase JS client in a browser console.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | **Cannot raise their own allowance** | As a tenant admin: `UPDATE tenants SET customer_allowance = 99999 WHERE id = <own tenant>` | **Fails.** No UPDATE policy exists on `tenants`, so RLS refuses it (0 rows / permission denied). The value is unchanged |
| 9.2 | Trigger is the second lock | Temporarily grant an UPDATE policy on `tenants`, retry 9.1 | Still fails: `trg_tenants_guard_billing` raises *"customer_allowance and price_per_customer_usd are owner-only"* because the session carries an `auth.uid()`. **Drop the test policy again afterwards** |
| 9.3 | Price is locked too | As a tenant admin, try to set `price_per_customer_usd = 0` | Same refusal as 9.1 / 9.2 |
| 9.4 | Other tenant columns unaffected | Confirm the app never needs to write `tenants` | No app screen writes the tenants table; nothing breaks from it being read-only |
| 9.5 | **Cannot self-accept a request** | As a tenant admin: `UPDATE customer_requests SET status = 'accepted' WHERE id = <own pending>` | **Fails** — the update policy's `WITH CHECK` allows only `pending` or `cancelled` |
| 9.6 | Cannot self-grant | Try `UPDATE customer_requests SET granted_count = 500` on their own pending row | Refused by the same `WITH CHECK` |
| 9.7 | **Cannot call the accept function** | As a tenant admin: `rpc('accept_customer_request', { p_request_id, p_granted: 500 })` | **Fails** with a permission error — `EXECUTE` is revoked from `anon`, `authenticated` and `public` |
| 9.8 | Anon cannot call it | Same call with only the anon key | Refused |
| 9.9 | Cannot touch a decided request | Try to edit an `accepted` or `declined` row | Refused — the update policy's `USING` limits it to `status = 'pending'` |
| 9.10 | Cannot insert a pre-decided request | Insert with `status = 'accepted'` or a non-null `granted_count` / `decided_at` / `decided_by` | Refused by the insert policy's `WITH CHECK` |
| 9.11 | Staff cannot request | As a `user` role, insert a `customer_requests` row | Refused — the insert policy requires `role IN ('admin','superadmin')` and `active = true` |
| 9.12 | Deactivated admin cannot request | Set the admin's `users.active = false`, retry | Refused by the same clause |
| 9.13 | Cross-tenant insert | As tenant A's admin, insert a request with tenant B's `tenant_id` | Refused — `tenant_id = current_tenant_id()` |
| 9.14 | Cross-tenant read | As tenant A's admin, select tenant B's requests | Zero rows |
| 9.15 | Every member may read | As a `user` role, select own-tenant requests | Rows returned — the select policy is tenant-wide so the card can render for anyone who reaches it |
| 9.16 | The owner can still do it all | Repeat 9.1, 9.5 and 9.7 with the SuperAdmin service role | All three succeed — the trigger passes because there is no `auth.uid()` |

## 10. SuperAdmin — direct editing, independent of any request

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Fields always present | Open any tenant's sheet, with or without a pending request | **Customer Allowance** and **Price Per Customer (USD)** inputs are always editable |
| 10.2 | Raise the allowance directly | No pending request; set allowance 30 → 500, Save | Saved; the tenant card's billing line updates; no request row created |
| 10.3 | Lower the allowance | Set allowance below the tenant's current active count, Save | Allowed — existing customers are untouched, but the tenant can create no more (§7.3) |
| 10.4 | Change the price | Set price `0.15` → `0.25`, Save | Saved; the tenant's monthly amount recomputes on their next read |
| 10.5 | Allowance validation | Enter `-1`, `12.5` or `29` | Save disabled / "Customer allowance must be a whole number of 30 or more" |
| 10.6 | Price validation | Enter a negative price | Refused by validation and by `chk_tenants_price_per_customer` |
| 10.7 | Below the minimum | Set allowance `29` or `0`, Save | Refused — "Minimum 30 customers" under the field, Save disabled, and `chk_tenants_customer_allowance_min` would refuse it anyway |
| 10.8 | New tenant defaults | SuperAdmin → + Add Tenant, leave both fields at their placeholders | Tenant created with 30 / 0.15 — the schema DEFAULT, the placeholder and `MIN_CUSTOMER_ALLOWANCE` all agree |
| 10.8b | Self-service signup | Sign up a brand-new tenant from the SubsTrack app | Allowance is **30**: `create-tenant` omits the column on purpose, so the schema DEFAULT decides it in one place |
| 10.9 | New tenant with overrides | Set 200 / 0.10 before submitting | Tenant created with those values |
| 10.10 | Editing name only | Change only the tenant name, Save | Allowance and price come back unchanged (the form sends what it holds) |
| 10.11 | Two tabs only | Look at the SuperAdmin tab bar | **Tenants** and **Options** — there is no Tier Plans tab |
| 10.12 | Active toggle unrelated | Deactivate a tenant | Billing numbers are untouched; the tenant simply cannot log in |

## 11. Removals — nothing tier-shaped may come back

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | No Subscription entry | Admin tab landing | No "Subscription" row anywhere in the menu |
| 11.2 | No Subscription route | Deep-link `/(app)/(tabs)/admin/subscription` | Not found — the route is gone, not merely hidden |
| 11.3 | No upgrade prompts | Hit the customer cap | The "Customer limit reached" modal — never an `UpgradePromptModal`, "View plans" or "Upgrade to Pro" |
| 11.4 | Branches unlimited | Create 10+ branches | All succeed |
| 11.5 | Users unlimited | Create 10+ staff users | All succeed |
| 11.6 | Plans unlimited | Create 20+ plans | All succeed |
| 11.7 | Products unlimited | Create 20+ products | All succeed |
| 11.8 | Currencies unlimited | Add several currencies on a brand-new tenant | All succeed; no gate, no prompt |
| 11.9 | Multi-month always on | Open the Plan form on a fresh tenant | The duration preset row and stepper are visible with no hint about tiers |
| 11.10 | No admin-menu counts | Look at the Admin menu subtitles | Plain descriptions — no "3 / 5" style counters on any row |
| 11.11 | No tier tables | Query `tier_plans`, `tenants.tier_id`, `tenants.tier_upgraded_at` | All gone after `script.sql` runs |
| 11.12 | No `AllowPlanUpgrade` | Read `app_options` | The key is gone (or, if left behind, nothing reads it — no button anywhere is gated by it) |

## 12. Edge cases / safety

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 12.1 | Idempotent schema | Run `script.sql` twice on a live DB | No error; existing allowances and prices preserved; the partial unique index and trigger exist once |
| 12.2 | Reset then rebuild | `reset.sql` then `script.sql` | Clean rebuild; new tenants land on 30 / 0.15 |
| 12.3 | Existing tenants on upgrade | Run the new `script.sql` on a DB whose tenants predate the columns | Every tenant gets `customer_allowance = 30`, `price_per_customer_usd = 0.15`. **A tenant already holding more than 30 customers is now over cap** — the owner must raise it (the commented one-off `GREATEST` statement at the end of the script) |
| 12.4 | Request cascade | Delete a tenant with requests | Its `customer_requests` rows go with it (`ON DELETE CASCADE`) |
| 12.5 | Logout resets billing state | Log out | `allowance`, `price`, `activeCustomers` and `request` all reset; next login re-primes them |
| 12.6 | Tenant switch on one device | Log out of tenant A, log in as tenant B on the same device | B's own allowance and count — never A's leftovers |
| 12.7 | Audit trail | Send, edit then cancel a request; open Admin → Audit Log | A create entry, an update entry with old→new count, and the cancel recorded as a void — see [audit-log.md](audit-log.md) |
| 12.8 | Slow network on Accept | Throttle, tap Accept | Button shows a loading state and cannot be double-fired; exactly one raise lands |
| 12.9 | Accept race | Owner accepts while the admin cancels at the same moment | Whichever lands first wins; the second fails cleanly ("Request is not pending" / no pending row) with no allowance drift |
| 12.10 | Unit tests green | `cd tests && npm test -- suites/customerAllowance.test.ts` | TC-CA-01…11 all pass — see [money-unit-tests.md](money-unit-tests.md) |

## 13. Update customer number — one door, both directions

**Organization Settings → Customers & billing** now carries a **single** button, **Update customer number**, which opens `<UpdateAllowanceSheet />`. The sheet holds **two fields for one number**: the **Allowed customers** total on the left, and a **signed Change** stepper (− / value / +) on the right. Typing in either rewrites the other — `total` is the only state, the change field is a view over it (`total − allowance`), so they cannot drift apart.

**The sign decides which path the Save takes.** A **negative** change lowers the allowance **at once** (the `lower_customer_allowance` RPC). A **positive** change sends a **request** for the owner to accept, exactly as before.

**A decrease has TWO floors and the HIGHER one binds:** the product minimum of **30** (`MIN_CUSTOMER_ALLOWANCE`, mirrored by `chk_tenants_customer_allowance_min` and by the RPC) and the tenant's **active customer count**, re-counted server-side. 30 is also the allowance every tenant is created with, from SuperAdmin and from self-service signup alike.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 13.1 | Two fields, one number | Allowance 100. Open the sheet | Total reads `100`, Change is **empty** (not `+0`), Save disabled |
| 13.2 | Total drives Change (up) | Type `120` in the total | Change shows **`+20` in green**; the button reads "Send request" |
| 13.3 | Total drives Change (down) | Type `80` in the total | Change shows **`-20` in red**; the button reads "Lower limit" |
| 13.4 | Change drives Total (up) | Type `20` in the change field | Total becomes `120` |
| 13.5 | Change drives Total (down) | Type `-20` in the change field | Total becomes `80` |
| 13.6 | Plus / minus steppers | Tap **+** three times, then **−** once | Total `103`, change `+3` then `+2`; both fields stay in step |
| 13.7 | Back to the start | Move the number away and back to `100` | Change empties, Save goes disabled — a no-op change is not saveable |
| 13.8 | Typing is never eaten | Type `120` quickly, then `95` | Every keystroke lands; the caret never jumps (both fields go through `useTextField`) |
| 13.9 | Minus cannot reach the total | Try to type `-5` in the **total** field | Refused — only the change field takes a sign |
| 13.10 | Floor blocks the cut | 40 active, allowance 60 → total `39` | Field turns red, amber "Deactivate 1 customers" panel, Save disabled |
| 13.11 | Cut to exactly the active count | 40 active → total `40` | Allowed and saved instantly |
| 13.12 | Minimum on a raise | Allowance 100 → total `105` (change `+5`) | "Please request at least 10 more customers"; Save disabled |
| 13.13 | Raise at the minimum | Total `110` (change `+10`) | Allowed; a pending request for **10** is created |
| 13.14 | Raise sends a request, not a change | Save a `+20` | The allowance is **unchanged**; the amber pending block appears on the card |
| 13.15 | WhatsApp only on a raise | Compare a `+20` and a `-20` | "Send request + WhatsApp" shows only for the raise (and only when a support number is set) |
| 13.16 | Lowering confirms first | Enter `-20`, Save, then Cancel the dialog | Nothing is written |
| 13.17 | Stepper stops at the minimum | Hold **−** past 30 | Total stops at `30`; the minus button greys out |
| 13.18 | Monthly amount does not move | Lower 60 → 45 with 40 active | Still `40 × price` — billing follows **active customers**, never the limit |
| 13.19 | Survives a restart | Lower the limit, force-quit, reopen | The new limit is still shown (`auth.user.tenant` is patched too) |
| 13.20 | Offline | Turn the network off, try to lower | `RequiresConnectionError` in the sheet's `ErrorBanner`; nothing changes |
| 13.21 | Server has the last word | Let another device add customers so the local count is stale, then cut to the stale floor | The RPC refuses and the sheet shows "deactivate first" built from the **server's** count |
| 13.22 | Edit request uses the SAME sheet | With a request pending, tap **Edit request** | The same two-field sheet opens, titled **Edit request**, showing the number already asked for; the update button is hidden while a request is pending |
| 13.30 | Edit request is raise-only | In the edit sheet, press **−** below the current allowance | The minus stops at the allowance — there is no lowering path while a request is pending |
| 13.31 | Edit keeps the 10 minimum | Edit a pending request down to `+5` | "You can request at least 10 more customers"; Save disabled |
| 13.32 | Editing saves a request, not a change | Edit `+20` to `+35`, Save | The pending row now reads 35; the allowance itself is untouched |
| 13.23 | Guard still holds | As a tenant admin, `UPDATE tenants SET customer_allowance = 999` | Refused by `trg_tenants_guard_billing` — the RPC is the only door, and it only goes down |
| 13.24 | Usage bar colours | Watch the card's bar at 50%, 85% and 100% | Indigo, amber from 80%, red at or over the limit |
| 13.25 | Unit tests green | `cd tests && npm test -- suites/customerAllowance.test.ts` | TC-CA-01…11, TC-CD-01…07 and TC-CS-01…03 all pass |
| 13.26 | Typed below the minimum | 0 active, allowance 100 → total `29` | "The customer limit cannot go below 30"; Save disabled |
| 13.27 | Cut to exactly the minimum | 0 active, allowance 100 → total `30` | Allowed and saved |
| 13.28 | Active count outranks the minimum | 45 active → total `30` | The **floor** message wins: it asks to deactivate 15, rather than naming the 30 minimum |
| 13.29 | Server refuses too | Call the RPC directly with `29` | RAISEs "The customer limit cannot go below 30" — the UI is not the only guard |
