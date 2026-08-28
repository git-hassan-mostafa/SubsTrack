# WhatsApp Invoices — QA Scenarios

Covers sending a customer their receipt over WhatsApp. The whole feature is a `wa.me` deep link, so "it worked" always means **two** things: the record was saved correctly **and** the chat opened with the right number and the right text.

**Reference code:**

- Message format (one file owns it): [invoiceText.ts](../SubsTrack/src/modules/invoicing/utils/invoiceText.ts) — pure builders, `t` arrives in `InvoiceContext`
- One-recipient rule for a selection: [invoiceRecipient.ts](../SubsTrack/src/modules/invoicing/utils/invoiceRecipient.ts) + `useSendInvoice.resolveRecipient`
- Send seam: [useSendInvoice.ts](../SubsTrack/src/modules/invoicing/hooks/useSendInvoice.ts) → [whatsapp.ts](../SubsTrack/src/shared/lib/whatsapp.ts) `openWhatsApp`
- Button: [SendOnWhatsAppButton.tsx](../SubsTrack/src/modules/invoicing/components/SendOnWhatsAppButton.tsx)
- Entry points: [the collect sheet.tsx](../SubsTrack/src/modules/customer/customer-payments/components/the collect sheet.tsx), [SaleFormSheet.tsx](../SubsTrack/src/modules/transaction/sales/components/SaleFormSheet.tsx), [CustomerPaymentPanel.tsx](../SubsTrack/src/modules/customer/customer-payments/components/CustomerPaymentPanel.tsx), [CustomerListScreen.tsx](../SubsTrack/src/modules/customer/customers/screens/CustomerListScreen.tsx), [BillSheet.tsx](../SubsTrack/src/modules/customer/customer-payments/components/BillSheet.tsx), [SaleDetailSheet.tsx](../SubsTrack/src/modules/transaction/sales/components/SaleDetailSheet.tsx)
- Created-record forwarding: [paymentSlice.ts](../SubsTrack/src/state/slices/payments/paymentSlice.ts) (`createPayment`, `createPayments`, `createMultiMonthPayment`, `createMultiMonthPayments`, `bulkPayCustomers`)
- Multi-select toolbar: [InlineSelectionToolbar.tsx](../SubsTrack/src/shared/components/InlineSelectionToolbar.tsx) (shared by the month grid + the customer sales panel), custom-amount sheet [Bulkthe collect sheet.tsx](../SubsTrack/src/modules/customer/customer-payments/components/Bulkthe collect sheet.tsx)
- Re-send a selection: [CollectionsPanel.tsx](../SubsTrack/src/modules/customer/customer-payments/screens/CollectionsPanel.tsx), [useSaleInvoiceAction.tsx](../SubsTrack/src/modules/transaction/sales/hooks/useSaleInvoiceAction.tsx) (shared by [SalesPanel.tsx](../SubsTrack/src/modules/transaction/sales/screens/SalesPanel.tsx) + [CustomerSalesListScreen.tsx](../SubsTrack/src/modules/transaction/sales/screens/CustomerSalesListScreen.tsx) + [CustomerSalesPanel.tsx](../SubsTrack/src/modules/transaction/sales/components/CustomerSalesPanel.tsx))
- Strings: the `invoice.*` namespace in `en.json` / `ar.json`
- Related: [docs/features.md](../docs/features.md) → WhatsApp Invoices; gotchas #68, #69

---

## 0. Critical invariants

1. **The record is saved whether or not the message is sent.** A failed/cancelled WhatsApp hand-off must never roll back or duplicate the payment or sale.
2. **Never two payments.** Tapping "Save & send" records exactly one payment — the `loadingCreate` guard plus the shared `disabled` gate on both buttons.
3. **Amounts in the message equal the amounts in the receipt sheet**, in the currency actually collected (the row's frozen snapshot rate). A later edit to that currency's live rate must not change an already-sent or re-sent invoice.
4. **A voided payment or sale is never sendable.** The button is gone, not just disabled.
5. **No phone → visible but disabled, with a caption.** Never a broken `wa.me/` link and never a silent no-op.
6. **One customer, one message.** Paying several plans — or several selected months/sales — at once produces a single chat, not one per plan/month. A selection that spans customers is **refused with a dialog**, never split into several chats.
6b. **Re-sending writes nothing.** The "Send invoice" action on a selection of already-collected records only opens a chat: no payment, no sale, no void, no edit.
7. **The receipt ID in the message matches the receipt sheet** (last 6 of the id, uppercased).
8. **Saving never triggers the "Discard changes?" prompt** — via either button (see [unsaved-changes.md](unsaved-changes.md)).

---

## 1. Payment form — "Save & send on WhatsApp"

Customers → a customer → tap an unpaid month.

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 1.1 | Full payment | Fixed plan, mode **Full** → **Save & send on WhatsApp** | One payment recorded (cell green); sheet closes; WhatsApp opens on the customer's number with org name, `Month: <Mon YYYY> · <plan>`, Amount Due = Amount Paid, Paid on, Receipt ID, thank-you. **No** "Remaining" line |
| 1.2 | Partial payment | Mode **Partial**, pay less than due → Save & send | Message shows Amount Due, Amount Paid **and** Remaining; the remainder appears in Transactions → Debts |
| 1.3 | Debt (unpaid) mode | Mode **Debt**, amount paid 0 → Save & send | Charge recorded (month stays unpaid); message shows Amount Paid 0 and the full Remaining |
| 1.4 | Custom amount | Custom-price plan, type an amount → Save & send | Message uses the typed amount and its chosen currency |
| 1.5 | Multi-month bundle | 3-month plan → Save & send | `Month:` reads the **range** ("Jan – Mar 2026"), not a single month; amount is the bundle price; ONE message |
| 1.6 | Plain Save unchanged | Tap the normal **Mark as paid** | Payment recorded, sheet closes, **no** WhatsApp |
| 1.7 | No phone | Clear the customer's phone → reopen the form | Green button greyed out with "No phone number for this customer"; plain Save still works |
| 1.8 | Form not ready | Custom-price plan with the amount empty | **Both** buttons disabled; no caption (the block isn't about the phone) |
| 1.9 | Double tap | Tap Save & send twice fast | Exactly one payment row; no duplicate |
| 1.10 | Tier limit | On a tier at its limit → Save & send | Upgrade prompt appears, no payment, **no** WhatsApp |

---

## 2. Sale form — "Save & send on WhatsApp"

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 2.1 | Single product, full | Pick a customer + 1 product → Save & send | Sale recorded; message lists `• Name  qty × unit = lineTotal`, Total, Paid, Sold at, Receipt ID |
| 2.2 | Several products | 3 products, different quantities → Save & send | One bullet per product, correct line totals, Total = their sum |
| 2.3 | Partial sale | Mode **Partial**, pay less than total → Save & send | Message shows Total, Paid **and** Remaining; the remainder appears under Debts → Sales |
| 2.4 | Debt sale | Mode **Debt** (paid 0) | Message shows Paid 0 and the full Remaining |
| 2.5 | Walk-in | Leave the customer empty | Green button disabled, caption "Walk-in sale — no customer to send to"; the plain Record button still saves |
| 2.6 | Customer without a phone | Pick a customer with no phone | Button disabled with the **no-phone** caption (not the walk-in one) |
| 2.7 | Launched from a customer screen | Customer → Record sale → Save & send | Pre-selected customer is the recipient |

---

## 3. Quick pay — "Pay & send on WhatsApp"

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 3.1 | Month-cell menu | Customer detail → long-press/3-dot an unpaid month → **Pay & send on WhatsApp** | Month paid instantly AND the chat opens; the row sits right after "Quick pay" |
| 3.2 | Month-cell, no phone | Same customer with no phone | The row is present but **greyed out**, with the "No phone number…" caption underneath |
| 3.3 | Month-cell, multi-month plan | 3-month plan, unpaid month | Confirm dialog first, then paid + sent; message shows the month range |
| 3.4 | Card menu, single plan | Customers list → card 3-dot → Pay & send | Current month paid, one message |
| 3.5 | Card menu, 2 plans due | Multi-plan customer, both unpaid | Confirm dialog, both paid, and **ONE** message with a bullet per plan, a Total line, and **both** receipt IDs |
| 3.6 | Card menu, mixed | 2 plans, one already paid | Only the unpaid plan is paid; the message covers only that plan |
| 3.7 | Card menu, plan-less / custom-price only | Customer with no eligible fixed line | **"Pay & send" row is absent**; plain "Quick pay" is present and routes to the detail screen (whose form has its own Save & send) |
| 3.8 | Bulk toolbar untouched | Select several customers → bulk Quick pay | Pays them all, **no** WhatsApp attempt, no new action in the toolbar |
| 3.9 | Cancel the confirm | 3.5 but tap Cancel | Nothing paid, nothing sent |

---

## 3b. Multi-select months — one invoice for the whole selection

Customer detail → long-press a month to enter selection, then tap more months. The selection toolbar (over the year header) gains a green WhatsApp action beside "Pay now".

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 3b.1 | Several months, fixed plan | Select 3 unpaid months → the **WhatsApp** toolbar action | All 3 paid (cells green); selection clears; **ONE** message with a bullet per month, one **Total paid** line, and all 3 receipt IDs |
| 3b.2 | Plain "Pay now" unchanged | Same selection → **Pay now** | All paid, **no** WhatsApp |
| 3b.3 | Multi-month plan | 3-month plan: select 6 months → WhatsApp action | Confirm dialog counts **blocks**, not months; the message has one bullet **per block**, each showing its own range ("Jan – Mar 2026") |
| 3b.4 | Custom-price / plan-less | Select months on a custom-price line → WhatsApp action | The amount sheet opens; its submit button is **green** and reads "Save & send on WhatsApp"; on save all months are paid and one message is sent |
| 3b.5 | Custom-price, plain path | Same line → **Pay now** | The amount sheet opens with the normal (non-green) submit button; saving sends nothing |
| 3b.6 | Sheet reopened after a send | Do 3b.4, then select again and tap **Pay now** | The sheet's button is back to normal — the send intent does not stick |
| 3b.7 | No phone | Customer with no phone → select months | The WhatsApp toolbar action is **absent** (the toolbar has no room for a caption); "Pay now" still there |
| 3b.8 | Mixed selection | Select 2 unpaid + 1 already-paid month → WhatsApp action | Only the payable months are paid and only they appear in the message |
| 3b.9 | Skipped month in selection | Include a skipped month | Unchanged from before: it isn't paid, and it isn't in the message |
| 3b.10 | Two currencies | Not reachable from one line (a line has one plan/currency) — confirm the multi-plan case in 5.5 instead | — |
| 3b.11 | Tier limit, multi-month blocks | Multi-month selection on a tier without multi-month | Upgrade prompt, nothing paid, **no** WhatsApp |
| 3b.12 | Write fails | Force an error during a selection pay | Error banner shows; **no** WhatsApp attempt; selection stays |
| 3b.13 | Toolbar fits | Selection with all 4 actions available (pay + pay & send + skip + void), narrow phone | All 4 are **icon-only round buttons** on one row, none clipped; the "N selected" count stays on **one line** (it was wrapping one character per line while the pills were labelled) |
| 3b.14 | Icons are distinguishable | Same | Pay = lightning, Pay & send = WhatsApp logo, Skip = skip-forward, Void = red X. Long-press / screen-reader still announces the full label ("Pay & send on WhatsApp") |
| 3b.15 | Arabic toolbar | Switch to Arabic, open a selection | Icons order right-to-left; the count label is Arabic and on one line |

---

## 3c. Multi-select records already collected — re-send them as one receipt

The same toolbars that void a selection now carry a **receipt icon** action, "Send invoice on WhatsApp": the month grid (paid months), Payments history, and all three sales lists (Sales tab, the customer's full sales page, and the customer detail **Sales** section). Nothing is written — this only re-sends.

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 3c.1 | Paid months in the grid | Customer detail → long-press a **paid** month, add 2 more paid months → **Send invoice** | ONE message, one bullet per month, a **Total paid** line, all 3 receipt IDs; selection clears; **nothing is paid, voided or changed** |
| 3c.2 | Months collected on different days | Pick 3 paid months collected on 3 different days | **No** single "Paid on" header — each bullet ends with its own date |
| 3c.3 | Months collected together | Pick months that were paid in one go (e.g. after a bulk pay) | The single "Paid on" header is back; bullets carry **no** dates (this is the quick-pay format, unchanged) |
| 3c.4 | Oldest first | Select March, then January, then February | The message lists Jan → Feb → Mar, and the receipt IDs are in the same order |
| 3c.5 | **Multi-month block** | Select a 3-month block (selecting one cell takes the whole block) → Send invoice | **ONE** bullet with the range ("Jan – Mar 2026"), **one** amount, **one** receipt ID — never three |
| 3c.6 | Mixed selection | Select 2 unpaid + 2 paid months | Toolbar shows both "Pay & send" and "Send invoice"; **Send invoice** covers only the 2 paid months, pays nothing |
| 3c.7 | Partial month | Select a partly-paid month | Its bullet shows the amount paid **and** "Remaining" |
| 3c.8 | Voided month | Void a payment, then select that month | The month is no longer "paid", so it is not in the selection's receipt |
| 3c.9 | Grid, no phone | Customer with no phone → select paid months | The Send-invoice action is **absent** (the toolbar has no room for a caption); Void still there |
| 3c.10 | Toolbar fits (5 icons) | Selection with pay + pay & send + skip + send invoice + void, narrow phone | All 5 are icon-only round buttons on one row, none clipped; "N selected" stays on one line. Send invoice = **receipt** icon, distinct from the WhatsApp logo of "Pay & send" |
| 3c.11 | Payments history | 3-dot → Payments history → long-press a row, select 2 more rows **of the same customer** → Send invoice | ONE message with all 3 months, dated per bullet, all receipt IDs; selection clears |
| 3c.12 | Payments history, several customers | Select rows belonging to 2 different customers → Send invoice | Dialog: "One invoice goes to one number. Select records for a single customer." Nothing is sent; the selection stays |
| 3c.13 | Payments history, voided rows | Select 2 live rows + 1 voided row → Send invoice | Only the 2 live rows are in the message (same rows the Void action would take) |
| 3c.14 | Payments history, all voided | Select only voided rows | Neither Send invoice nor Void is offered |
| 3c.15 | Payments history, no phone | Select rows of a customer with no phone | Dialog: "No phone number for this customer"; nothing sent |
| 3c.16 | Sales tab | Transactions → Sales → select 3 sales of one customer → Send invoice | ONE message: a bullet per sale (`date · items summary: total`), then **Total**, **Paid**, **Remaining** (only if any is owed) and every receipt ID, oldest sale first |
| 3c.17 | Sales, one partly paid | Include a partly-paid sale | That bullet shows its own "Remaining"; the footer **Remaining** is the sum |
| 3c.18 | Sales, single row | Select exactly one sale → Send invoice | The message is the **normal single-sale receipt** (product lines, Sold at) — identical to the one from the sale's receipt sheet |
| 3c.19 | Sales, walk-in | Select a walk-in sale (no customer) → Send invoice | Dialog: "Walk-in sale — no customer to send to" |
| 3c.20 | Sales, several customers | Select sales of 2 customers | The "one number" dialog; nothing sent |
| 3c.21 | Sales, voided | Select a voided sale together with a live one | Only the live sale is in the message |
| 3c.22 | Customer sales page | Customer → Sales → Show all → select several → Send invoice | Same behaviour as the Sales tab (both lists share one hook) |
| 3c.23 | Two currencies in one selection | Select paid months (or sales) collected in USD **and** LBP | **One total line per currency** — never a single mixed number |
| 3c.24 | Void actions unchanged | Repeat any selection above and press **Void** instead | Voiding behaves exactly as before, including the void-order (newest first) rule |
| 3c.25 | **Customer detail sales section** | Customer detail → scroll to **Sales** → long-press a sale, tap 2 more → **Send invoice** | The section title + "Record" pill are replaced by `X · "N selected" · [receipt icon]`; ONE message covering the 3 sales (same text the Sales tab produces); selection clears; nothing is written |
| 3c.26 | No select-all there | Same section, in selection mode | There is **no** select-all checkbox (unlike the full page / Sales tab) — only X, the count, and the send action |
| 3c.27 | Single sale from the section | Long-press one sale → Send invoice | The normal **single-sale receipt** (product lines, Sold at) — same as tapping the sale and using its receipt sheet |
| 3c.28 | No layout jump | Long-press a card and hold | The header row keeps its height when the toolbar appears — the cards must **not** shift under the finger |
| 3c.29 | "Show all" hidden while selecting | Customer with 6+ sales → enter selection | The "Show all" link is hidden; it returns after X / Android back |
| 3c.30 | Tap opens, long-press selects | Tap a card with no selection active | The receipt sheet opens as before (selection is entered only by long-press) |
| 3c.31 | Section, no phone | Customer with no phone → select sales → Send invoice | Dialog: "No phone number for this customer"; nothing sent, selection stays |
| 3c.32 | New sale clears the selection | Enter selection, then X out and record a sale from the section | The preview refreshes with the new sale on top and **nothing is left ticked** |
| 3c.33 | Void from the section unchanged | Select nothing; tap a sale → **Void** | Void still works from the receipt sheet; the section's toolbar offers **no** bulk void (that stays on the full page / Sales tab) |
| 3c.34 | Android back | Enter selection → hardware back | Selection exits; the app does **not** navigate away from the customer |

---

## 4. Saved receipts — "Send on WhatsApp"

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 4.1 | Payment receipt, customer screen | Customer → tap a paid month | Green Send button present; sending opens the chat with the same figures the sheet shows |
| 4.2 | Payment receipt, tenant-wide list | Transactions → Payments → tap a row | Send is **enabled** (this is the join that carries `phone_number`) and uses that row's customer + plan name |
| 4.3 | Payment receipt, quick-actions history | PageHeader 3-dot → Payments history → tap a row | Same as 4.2 (it hosts the same panel) |
| 4.4 | Edit mode hides it | Open a receipt → **Edit payment** | Send button disappears while editing; returns on cancel/save |
| 4.5 | Sale receipt | Sales tab / customer sales list / customer panel → tap a sale | Send present in all three; message matches the sheet |
| 4.6 | Voided payment | Void a payment, then open its record | **No** Send button |
| 4.7 | Voided sale | Sales tab → filter to include voided → open one | **No** Send button |
| 4.8 | Walk-in sale receipt | Open a walk-in sale | Send disabled with the walk-in caption |
| 4.9 | Re-send | Send the same receipt twice | Two chats open; nothing about the record changes |

---

## 5. Money and currency in the message

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 5.1 | Non-USD collected, display currency = same | LBP plan, display currency LBP | Amounts in LBP, **no** `≈` suffix anywhere |
| 5.2 | Non-USD collected, display currency differs | LBP plan, display currency USD | Amounts in LBP; a `≈ $…` suffix on the **Amount Paid** (or **Total**) line only — not on every line |
| 5.3 | USD | USD plan | `$12.00` style, no `≈` |
| 5.4 | Snapshot immunity | Send an invoice, then edit that currency's live rate, then re-send the same receipt | Both messages show the same amounts |
| 5.5 | Two plans in two currencies | Multi-plan quick pay where one line is USD and the other LBP | **Two** Total lines, one per currency — never a single mixed number |
| 5.6 | Decimals | A currency with `decimals = 0` | No decimal places anywhere in the message |

---

## 6. Formatting / markup

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 6.1 | Org name bold | Any invoice | First line is the organization name in WhatsApp bold; the rest is plain |
| 6.2 | Product name with `*` | Product named `Water *Large*` → sell + send | Name appears literally; the message is **not** mangled into bold |
| 6.3 | Customer name with `_` | Customer `ali_hassan` | Name appears literally, no italics |
| 6.4 | Bullets | Multi-product sale / multi-plan payment | Rows start with `•` — never `*` or `-` |
| 6.5 | Line breaks survive | Any invoice | The message arrives multi-line, not one long run-on line |
| 6.6 | Phone formats | Numbers stored as `+961 3 123 456`, `03-123456` | Both open the correct chat (digits are stripped) |
| 6.7 | Junk phone | Phone field is `-` or `n/a` | Treated as **no phone**: button disabled, no link attempted |

---

## 7. Arabic / RTL

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 7.1 | Labels | Switch to Arabic, send a payment invoice | Button labels, captions and every message label are Arabic |
| 7.2 | Direction | Read the received message | Renders RTL; each `Label: value` line stays readable on its own |
| 7.3 | Digits | Same message | Money **and** date use Latin digits — one numeral system per message |
| 7.4 | Menu row | Arabic card menu | "دفع وإرسال على واتساب" row present, caption Arabic when disabled |

---

## 8. Platform / failure paths

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 8.1 | WhatsApp installed (native) | Any send | The WhatsApp app opens on the right chat with the text pre-filled |
| 8.2 | WhatsApp not installed (native) | Uninstall / test device without it | The browser opens `wa.me`; the record is still saved |
| 8.3 | Cannot open at all | Force a failure | The "Couldn't open WhatsApp" dialog appears (OK only) and says the record was saved |
| 8.4 | Web | Browser: Save & send | WhatsApp Web opens in a new tab |
| 8.5 | **Web popup blocker** (gotcha #68) | Browser with popups blocked: Save & send from a form | The tab may be blocked **silently** — this is known. The payment/sale is still recorded, and re-sending from the receipt sheet (a direct gesture) works. Confirm both halves |
| 8.6 | Return to the app (native) | Send, then switch back to SubsTrack | The form sheet is closed and the grid/list shows the new record; no crash, no stuck spinner |
| 8.7 | Offline (native) | Airplane mode → pay & send | Payment written to the local mirror; message opens with a receipt ID (last 6 of the local id); WhatsApp queues it; after reconnecting the payment syncs and keeps the same id |

---

## 9. Regressions to re-check

These paths changed shape and are the likeliest place for a silent break.

| #   | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 9.1 | Bulk pay summary | Select customers where some can't pay → bulk Quick pay | The "N paid · N failed" notice still shows the right counts (`bulkPayCustomers` now returns an array) |
| 9.2 | Multi-month conflicts | Quick-pay a 3-month block where a middle month is already paid | The block still shifts/shortens as before; the conflict behaviour is unchanged (`createMultiMonthPayment` now returns an object) |
| 9.3 | Tier-limit path | Hit the payment tier limit from the form | Upgrade prompt still appears (success is still judged by the store's `error`, not the returned record) |
| 9.4 | Existing menu rows | Open any 3-dot ActionMenu in the app | Rows look unchanged (the new `caption` field is optional); label alignment not shifted |
| 9.5 | Contact to upgrade | Admin → Subscription with `AllowPlanUpgrade = false` | The green "Contact to upgrade" button still renders and opens the support number (it now reuses `SendOnWhatsAppButton`) |
| 9.6 | Payments list unchanged | Transactions → Payments: search, filters, pagination | All still work (the list select gained one column) |
| 9.7 | Discard guard | Type in the payment form, then close without saving | "Discard changes?" appears exactly once; saving via **either** button never prompts |
| 9.8 | Spinner ownership | Press "Save & send on WhatsApp" on the payment form and on the sale form | The spinner appears on the **green** button only; pressing plain Save spins the primary button only. Neither press greys the other out into a spinnerless state |
| 9.9 | Bulk month pay unchanged | Month-grid selection → **Pay now** (fixed, multi-month, and custom paths) | All three still pay and clear the selection exactly as before (`createPayments` / `createMultiMonthPayments` now return the created rows) |
