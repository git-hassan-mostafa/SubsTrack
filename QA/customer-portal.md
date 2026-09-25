# Customer Portal — QA Scenarios

Covers the **read-only customer portal**: a link staff copy out of the customer form, opened by the customer, gated by a password staff also set there. The portal shows one customer their own months, bills, payments and purchases — and can write nothing.

The money model underneath is in [ledger-collections.md](ledger-collections.md) and the grid rules in [monthly-grid.md](monthly-grid.md) — **run those first**; this file covers only the portal and the fields that feed it.

**Reference code:**

- Portal app: [Portal/src/](../Portal/src/) — `screens/LoginScreen.tsx`, `screens/PortalScreen.tsx`, `components/Receipt.tsx`
- Read model: [PortalReadModel.ts](../Portal/src/services/PortalReadModel.ts), repository: [PortalRepository.ts](../Portal/src/repository/PortalRepository.ts)
- Edge function: [customer-portal/index.ts](../SubsTrack/supabase/functions/customer-portal/index.ts)
- Staff-side field: [PortalAccessField.tsx](../SubsTrack/src/shared/components/PortalAccessField.tsx) inside [CustomerFormSheet.tsx](../SubsTrack/src/modules/customer/customers/components/CustomerFormSheet.tsx)
- Link builder: [portalLink.ts](../SubsTrack/src/core/utils/portalLink.ts)
- Shared rule: [mergeOwed.ts](../SubsTrack/src/modules/ledger/utils/mergeOwed.ts) — the portal and the app answer "what is owed?" with the SAME function
- Unit tests: [portalReadModel.test.ts](../tests/suites/portalReadModel.test.ts) (TC-PRT-*)

---

## 0. Critical invariants

1. **The portal reimplements NO rule.** Month colours come from `buildMonthGrid`, what is owed from `mergeOwed`, prices from `resolveLinePrice`, money formatting from `currency.ts` — all imported from `SubsTrack/src`. If a portal figure ever disagrees with the app's, a rule was restated somewhere instead of imported.
2. **The edge function is the only customer boundary.** Nothing in the database narrows a read to one customer. Every query in the function filters on the id decoded from the **verified token**, never on anything in the request body.
3. **The portal cannot write.** It holds no Supabase client — one `fetch` to one function. Confirm the built bundle has no SDK (`grep -c "@supabase/supabase-js\|createClient(" Portal/dist/assets/*.js` → `0`). It *does* carry the anon key, which the Supabase gateway demands on every function call even at `verify_jwt = false`; that key reaches only `app_options` and no customer row.
4. **A wrong password, an unknown customer, a disabled portal and an inactive tenant all answer with the SAME 401.** The link is a bare customer id, so any difference confirms a customer exists.
5. **The link cannot be rotated** — it is the customer id. Revoking is switching the portal off, or changing the password.
6. **Money prints in the currency it was collected in**, never converted, with a `≈` line only when the display currency differs.
7. **Staff internals never leave the server**: notes, map location, void reasons, who currently *holds* the cash. Who *received* it is shown on purpose.

---

## 1. Setup (do this once)

| #   | Step | Expected |
| --- | --- | --- |
| 1.1 | Run `sql scripts/script.sql` | `customers.portal_password` + `portal_enabled` exist; `customer_portal_lockouts` exists |
| 1.2 | `supabase secrets set PORTAL_JWT_SECRET=<a long random string>`, or Dashboard → Project Settings → **Edge Functions → Secrets** | set. **Miss this and the portal looks fine until the first CORRECT password** — every wrong one still answers normally, because the secret is only touched when a token gets signed |
| 1.3 | `cd Portal && npm run deploy-function` | `customer-portal` deployed with `--no-verify-jwt` |
| 1.4 | `cd Portal && cp .env.example .env`, fill `VITE_PORTAL_FUNCTION_URL` + `VITE_SUPABASE_ANON_KEY` | both set. **On Vercel these go in Project → Settings → Environment Variables** — a `.env` file is not uploaded, and a build missing either one sends no request at all |
| 1.4b | `cd Portal && npm run build`, deploy `dist/` to the portal subdomain | site loads |
| 1.5 | SuperAdmin → Options → set `CustomerPortalUrl` to that subdomain (no trailing slash) | saved |
| 1.6 | Reopen a customer in SubsTrack | the **Customer portal** block now appears in the form |

**1.7 — before 1.5, the block is hidden.** With `CustomerPortalUrl` blank, the customer form shows no portal section at all. There is no link to hand out, so there is nothing to show.

---

## 2. Staff side — the form

| #   | Step | Expected |
| --- | --- | --- |
| 2.1 | Open an existing customer → switch **Customer portal** on | password field + link row appear, and a **10-character password is already filled in and visible** |
| 2.1b | Tap the **refresh** icon beside the password | a different password every time; never the same twice |
| 2.1c | Switch the portal **off** then **on** again without saving | the password already typed is **kept**, not replaced — generating only fills an EMPTY box |
| 2.1d | Reopen a customer that already has a password and toggle off/on | the existing password survives; staff never lose one by accident |
| 2.1e | Read a generated password aloud | no `I`, `l`, `1`, `O` or `0` — those are excluded so it cannot be misheard or mistyped |
| 2.2 | Clear the password by hand and save | refused: "The portal password needs at least 4 characters" |
| 2.3 | Type a 3-character password, save | same refusal |
| 2.4 | Type a 4+ character password, save | saved |
| 2.5 | Reopen the customer | the password is **still readable** (eye toggle reveals it) — this is the chosen behaviour |
| 2.6 | Tap **Copy link** | "Copied"; clipboard holds `{CustomerPortalUrl}/{customer id}` |
| 2.7 | Switch the portal **off**, save, reopen | password field gone; the stored password was cleared |
| 2.8 | Add a **new** customer with the portal on | the link row reads "The link appears once the customer is saved." — there is no id yet |
| 2.9 | Open the customer's **History** sheet | the portal password is **NOT** in the trail. This is the audit exclusion; if it appears, `IGNORED_FIELDS` is wrong |
| 2.10 | Set a portal password with the phone in **airplane mode**, then sync | it saves offline and syncs like any other column. The password is generated **on the device**, so it works with no connection |
| 2.11 | Open the customer's **details page** (not the form) | a **Portal link** row shows the full link with a **Copy** action |
| 2.12 | Tap that row | "Copied"; the clipboard holds the same link the form copies |
| 2.13 | Switch the portal **off**, save, reopen the details page | the Portal link row is **gone** — a link to a portal that refuses every password is worse than none |
| 2.14 | With `CustomerPortalUrl` unset in SuperAdmin | the details page shows no Portal link row, exactly as the form shows no portal block |

---

## 3. Signing in

| #   | Step | Expected |
| --- | --- | --- |
| 3.1 | Open the copied link | password screen. **No organisation name, no customer name** |
| 3.2 | Enter the wrong password | "Wrong password. Please try again." |
| 3.3 | Enter the right password | the portal opens |
| 3.4 | Refresh the page | still signed in (session token), no password re-prompt |
| 3.5 | Close the tab, open the link again | password asked again — the token dies with the tab |
| 3.6 | Tap **Sign out**, then refresh | password asked again |
| 3.7 | Edit the URL to a made-up uuid | **same** "Wrong password" message as 3.2 — never "no such customer" |
| 3.8 | Edit the URL to **another real customer's** id, enter that customer's password | you see **only that customer's** data. Cross-check the name |
| 3.9 | Switch the portal off in the app, reload the portal | signing in now fails with the same 401 as a wrong password |
| 3.10 | Wrong password **10 times** | "Too many tries. Please try again later." (423). Correct password also refused until the lock expires (~15 min) |
| 3.11 | After a successful sign-in, try a wrong password once | counter was reset by the success; no lock |
| 3.12 | Turn off wifi, try to sign in | "Could not connect. Please check your internet." |
| 3.13 | Open the base URL with **no id** after it, or a truncated id | "This link is not complete." — a full page, no password box. **Never a dead button** |
| 3.14 | Build with `VITE_SUPABASE_ANON_KEY` or `VITE_PORTAL_FUNCTION_URL` unset, sign in | "This portal is not set up yet." — never "Wrong password". Only `bad_credentials` may say wrong password |
| 3.15 | Devtools → Network on any sign-in | the POST carries `apikey` + `Authorization: Bearer`. Without them the gateway answers `401 UNAUTHORIZED_NO_AUTH_HEADER` before the function runs |

---

## 4. What the customer sees — cross-check EVERY figure against the app

Open the same customer in SubsTrack side by side.

| #   | Step | Expected |
| --- | --- | --- |
| 4.1 | Compare the month grid, cell for cell, for the current year | **identical** colours and sublabels to the app's grid |
| 4.2 | Compare the outstanding total | identical, and **grouped per currency** |
| 4.3 | Compare the payment list | same hand-overs, same amounts, same dates |
| 4.4 | Year arrows ← → | the grid re-derives instantly; **no network request** (check the browser's network tab — gotcha #121) |
| 4.5 | A customer with a **multi-month** plan | months 2+ read "Included", only the first cell of the block carries a partial ring |
| 4.6 | A customer with a **partly-paid** month | amber ring, sublabel "Partial" — the cell is still green/paid, there is no "partial" status |
| 4.7 | A **skipped** month | reads "Paused", never unpaid and never overdue |
| 4.8 | A customer who owes **USD and LBP** | two separate totals, **no conversion between them**. Compare with the app's collect sheet |
| 4.9 | A **non-regular** customer | paid months are yellow, unpaid are light grey — same as the app |
| 4.10 | A customer who owes nothing | green "You are paid up" card, no red anywhere |
| 4.11 | While the page is still loading | **no red badge**. Absence means unknown, never unpaid |
| 4.12 | "What you owe" list | oldest first, with the note that this is the order payments are applied |
| 4.13 | A customer with a **plan-less** line (custom amounts) and unpaid months on it | the card is **not** "You are paid up"; each unpaid month is listed with "Amount set by your provider" in place of a figure, and it adds nothing to the totals (TC-PRT-09) |
| 4.14 | Same customer, the Months section and "Your services" | the line's title reads **"No plan"**, never blank — same as the app's line tab |
| 4.15 | Same customer who ALSO has a priced line with unpaid months | the total counts only the priced months; the plan-less months sit beside them in the list (TC-PRT-11) |
| 4.16 | Staff app → collect-all / WhatsApp reminder for that customer | unchanged — the plan-less months are still asked for through the collect sheet's amount box, not added to the owed list (TC-PRT-10) |

---

## 5. Money moving while the portal is open

| #   | Step | Expected |
| --- | --- | --- |
| 5.1 | Collect a month in the app, refresh the portal | the month flips to paid; the payment appears with the right collector name |
| 5.2 | **Void that payment** in the app, refresh | the month goes back to unpaid; the payment is **gone** from history. An emptied bill must read exactly like a month never touched |
| 5.3 | Collect a partial amount, refresh | month reads paid with the amber ring; the remainder shows in "What you owe" |
| 5.4 | Record a **sale**, refresh | it appears under Purchases with its receipt number |
| 5.5 | Void that sale, refresh | it disappears from Purchases |
| 5.6 | **Write off** a bill, refresh | the bill leaves "What you owe" — but any money already collected against it is **still** in the payment history |
| 5.7 | Undo the write-off, refresh | the bill is back in "What you owe" |
| 5.8 | One hand-over that settled **several** bills | its receipt lists them under "This pays", and they add up to the total |
| 5.9 | Deactivate the customer, refresh | the portal still opens (they may still owe money) |
| 5.10 | Deactivate the **tenant**, refresh | "This page is not available." |

---

## 6. Receipts

| #   | Step | Expected |
| --- | --- | --- |
| 6.1 | Tap a payment | receipt opens: org name, receipt id, date, who received it, total |
| 6.2 | Tap **Print** | browser print dialog; the Back/Print buttons are **not** on the printed page |
| 6.3 | Save as PDF from the print dialog | readable one-page receipt |
| 6.4 | Tap a purchase | receipt lists the lines, quantities and the total |
| 6.8 | Tap a **paid** month cell | the same receipt layout opens for that month: receipt id, the month's name, total, paid, and every hand-over that reached it |
| 6.9 | Tap an **unpaid**, **future** or **paused** month | nothing happens — there is no receipt for money that never arrived. Only paid cells are buttons |
| 6.10 | Tap a **partly paid** month | the receipt shows Paid and **Remaining**, and Remaining matches "What you owe" for that month |
| 6.11 | Tap a month settled by **two** hand-overs | both are listed, and they add up to Paid |
| 6.12 | Tap a month settled by a hand-over that **also paid other bills** | only this month's slice is shown, NOT the whole hand-over's amount |
| 6.13 | Tap a secondary cell of a **multi-month** block ("Included") | the block's one receipt opens — the same one the first cell opens |
| 6.14 | On a payment receipt, read the "This pays" list | each bill is named the way the app names it ("Jan 2026 · Internet", "#A1B2C3 · Router") — never blank |
| 6.5 | A sale whose **total was typed lower than its lines** (a discount) | the lines do **not** add up to the total, and that is correct — the gap is the discount |
| 6.6 | A sale with **zero** lines | still shows a total and its fallback summary |
| 6.7 | Compare a receipt with the WhatsApp receipt the app sends for the same hand-over | same figures, same currency, same receipt id |

---

## 7. Language, direction, devices

| #   | Step | Expected |
| --- | --- | --- |
| 7.1 | Switch to **AR** | whole page flips to right-to-left; month names in Arabic |
| 7.2 | In Arabic, check amounts and the link | numbers stay left-to-right and are not reordered |
| 7.3 | Switch back to **EN** | flips back |
| 7.4 | Open on a narrow phone (360px) | grid stays 4 columns, nothing overflows sideways |
| 7.5 | Open on a desktop browser | content stays in a readable centred column |
| 7.6 | Month names, bill labels and "Sale" wording | identical to the app's — they come from the same locale files |

---

## 8. Nothing leaks

| #   | Step | Expected |
| --- | --- | --- |
| 8.1 | Browser devtools → Network → the `customer-portal` response | contains **no** `notes`, **no** `location_url`, **no** `held_by_user_id`, **no** `remitted_at`, **no** `void_reason`, and **no** `portal_password` |
| 8.2 | Same response | contains **no** other customer's rows, and no rows from another tenant |
| 8.3 | Replay the `data` request with a **hand-edited** token | 401, and the page returns to the password screen |
| 8.4 | Replay `data` with another customer's id in the **body** | ignored — the id comes from the token only |
| 8.5 | `grep -c "@supabase/supabase-js\|createClient(" Portal/dist/assets/*.js` | `0` — the SDK never entered the bundle. The `*.supabase.co` URL and the anon key ARE there on purpose |
| 8.6 | `grep -c "react-native" Portal/dist/assets/*.js` | `0` |
| 8.7 | Supabase dashboard → function logs | one JSON line per event; passwords appear only as `passwordLength` |
