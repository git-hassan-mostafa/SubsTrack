# Unsaved Changes Guard — QA Scenarios

Covers the app-wide "Discard changes?" confirmation shown when a **dirty** form sheet is closed. This is one reusable seam, not per-form code: `AppBottomSheet` takes a `dirty` prop and intercepts **every** close path, so a form only has to report whether it has been edited.

**Reference code:**

- Core seam: [AppBottomSheet.tsx](../SubsTrack/src/shared/components/AppBottomSheet.tsx) (`dirty` prop, `onAnimate` drag interception, backdrop `onPress`)
- Guard hook: [useUnsavedChangesGuard.ts](../SubsTrack/src/shared/hooks/useUnsavedChangesGuard.ts) (awaits the global confirm dialog; returns `[guardedDismiss, asking]`)
- Dirty check: [useDirtyForm.ts](../SubsTrack/src/shared/hooks/useDirtyForm.ts) (first-render baseline + `ignore` list)
- Header button seam: [FormSheet.tsx](../SubsTrack/src/shared/components/FormSheet.tsx), [sheetDismissContext.ts](../SubsTrack/src/shared/components/sheetDismissContext.ts)
- Back handling: [useAndroidBackDismiss.ts](../SubsTrack/src/shared/hooks/useAndroidBackDismiss.ts), [useWebBackDismiss.ts](../SubsTrack/src/shared/hooks/useWebBackDismiss.ts)
- Dialog: [ConfirmDialog.tsx](../SubsTrack/src/shared/components/ConfirmDialog.tsx) via [confirmSlice.ts](../SubsTrack/src/state/slices/confirm/confirmSlice.ts)
- Strings: `common.discard_changes_title` / `_message` / `common.discard` / `common.keep_editing`

---

## 0. Critical invariants

1. **All four close paths ask** — header Cancel/Close button, Android hardware Back / browser Back, drag-down gesture, backdrop tap. Missing any one is a bug.
2. **A clean form never asks.** Opening a form and closing it without typing must close immediately, with no dialog. This is the invariant most likely to regress (see §3) and the one that destroys trust in the feature.
3. **"Keep editing" preserves every entered value** — including values held by child editors (plan lines, sale cart) and the scroll position is not required to persist, but data must be.
4. **"Discard" closes and loses the edits** — nothing is saved.
5. **Saving is never blocked.** A successful Save closes the form directly, with no discard prompt (the form closes because the caller set it closed, not through the guard).
6. **The prompt owns Back while it is open.** One Back press must answer only the dialog — it must never also close the sheet or change the route.
7. **The drag gesture snaps back, it does not flash away.** On a dirty form the sheet returns to its open position while the dialog shows.

---

## 1. The four close paths

Use **Add customer** (Customers → +) as the reference form unless stated otherwise. "Make dirty" = type anything into one field.

| #   | Scenario                | Steps                                                     | Expected result                                                        |
| --- | ----------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1.1 | Header button, dirty    | Open form → make dirty → tap **Cancel** in the header      | "Discard changes?" dialog appears; sheet stays open behind it           |
| 1.2 | Header button → discard | From 1.1 → tap **Discard**                                 | Dialog closes, sheet closes, nothing saved                             |
| 1.3 | Header button → keep    | From 1.1 → tap **Keep Editing**                            | Dialog closes, sheet stays open, **typed values still there**          |
| 1.4 | Android Back, dirty     | Open form → make dirty → press hardware **Back**           | Discard dialog appears; sheet still open; route unchanged              |
| 1.5 | Browser Back, dirty     | Web: open form → make dirty → browser **Back**             | Discard dialog appears; sheet still open; **URL/route unchanged**      |
| 1.6 | Drag down, dirty        | Open form → make dirty → drag the sheet down to close      | Sheet **snaps back up** and the discard dialog appears over it         |
| 1.7 | Drag down → keep        | From 1.6 → **Keep Editing**                                | Sheet remains open at full height, values intact                       |
| 1.8 | Drag down → discard     | From 1.6 → **Discard**                                     | Sheet closes                                                           |
| 1.9 | Backdrop tap, dirty     | Open form → make dirty → tap the dim area above the sheet   | Discard dialog appears; sheet stays open (**not** silently ignored)    |
| 1.10 | Header drag area       | Make dirty → drag down **by the title bar** (not the handle) | Same as 1.6 — the header is a drag handle too                        |

---

## 2. Repeated / sequential interactions (regression-prone)

This section reproduces two fixed bugs that presented almost identically, so run it on **both** Android and web:

- **Android** — one Back press answered the dialog **and** re-closed the sheet, so a second attempt showed an extra dialog and eventually navigated away.
- **Web** — no extra dialog, but Discard popped one history entry too many and landed on the previous page. Any variant here that ends on the wrong route is a regression even when the dialogs themselves look right.

| #   | Scenario                     | Steps                                                                              | Expected result                                                                         |
| --- | ---------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2.1 | Keep → close again (Back)    | Dirty form → Back → **Keep Editing** → Back again                                   | Dialog appears again (exactly one). Sheet still open behind it                          |
| 2.2 | Keep → discard (Back)        | Continue 2.1 → **Discard**                                                          | Sheet closes and you land back on the **originating screen** — no extra dialog, **no** extra page-back |
| 2.3 | Keep → close again (button)  | Dirty form → Cancel → Keep Editing → Cancel again → Discard                          | Same as 2.2                                                                             |
| 2.4 | Mixed paths                  | Dirty form → drag down → Keep Editing → Back → Keep Editing → tap backdrop → Discard | Each attempt shows exactly one dialog; final Discard closes once, route unchanged       |
| 2.5 | Double Back, fast            | Dirty form → press Back **twice quickly**                                            | Only **one** dialog; the second press does not reach the sheet or the router            |
| 2.6 | Web: repeat then discard     | Web: repeat 2.1–2.2 three times                                                     | After the final Discard you are on the originating route — history is not over-popped   |

---

## 3. Clean forms must NOT prompt

The dirty baseline is captured on first render. Values that a **child** seeds one render later (currency defaults, cart drafts, plan rows) previously produced a false "dirty" and are explicitly excluded.

| #   | Scenario                          | Steps                                                                                  | Expected result                                    |
| --- | --------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 3.1 | Open + close, no edits            | Open any form → immediately Cancel                                                     | Closes at once, **no dialog**                      |
| 3.2 | Open + close, Back                | Open any form → Back                                                                   | Closes at once, no dialog                          |
| 3.3 | Open + drag close                 | Open any form → drag down                                                              | Closes normally, no dialog, no snap-back           |
| 3.4 | Last-used currency default        | Record a payment/sale/custom debt in a non-USD currency; reopen that form → Cancel      | No dialog (the auto-filled currency is not an edit) |
| 3.5 | Sale form, products load          | Products → open **Record sale** → wait for products to load → Cancel                   | No dialog (cart draft self-report is not an edit)  |
| 3.6 | Batch restock, clear              | Batch restock → type a quantity → **Clear** (back to zero) → Cancel                    | No dialog — clearing returns the form to clean     |
| 3.7 | Batch restock, search only        | Batch restock → type in the **search** box only → Cancel                               | No dialog (a filter is not data)                   |
| 3.8 | Edit customer, plans load         | Edit an existing customer whose plan is branch-specific → wait for plans → Cancel      | No dialog (auto-cleared out-of-branch plan is not a user edit) |
| 3.9 | Payment detail, enter edit mode   | Open a payment receipt → **Edit payment** → Close without changing the amount          | No dialog                                          |
| 3.10 | Payment detail, change amount    | As 3.9 but change the amount → Close                                                   | Discard dialog appears                             |
| 3.11 | Sale detail, void mode           | Open a sale → **Void** → Close without typing a reason                                 | No dialog                                          |
| 3.12 | Sale detail, typed reason        | As 3.11 but type a void reason → Close                                                 | Discard dialog appears                             |
| 3.13 | Revert to original                | Edit form → change a field → change it **back** to the original value → Cancel         | No dialog (baseline comparison, not a "touched" flag) |

---

## 4. Per-form coverage

Run 1.1 / 1.3 / 3.1 against each form. The **dirty trigger** column is the field to touch.

| #    | Form                     | Where                                     | Dirty trigger              |
| ---- | ------------------------ | ----------------------------------------- | -------------------------- |
| 4.1  | Add / Edit customer      | Customers → + / row → Edit                | Name                       |
| 4.2  | Add / Edit plan          | Plans → +                                 | Plan name                  |
| 4.3  | Add / Edit user          | Users → +                                 | Username                   |
| 4.4  | Add / Edit branch        | Branches → +                              | Branch name                |
| 4.5  | Add / Edit currency      | Currencies → +                            | Code                       |
| 4.6  | Add / Edit product       | Products → +                              | Product name               |
| 4.7  | Product stock sheet      | Product → Adjust stock                    | Quantity                   |
| 4.8  | Batch restock            | Quick actions → Batch restock             | Any quantity               |
| 4.9  | Record payment           | Customer → month cell                     | Custom amount / notes      |
| 4.10 | Bulk payment (collect all) | Customer list → Collect all due          | Amount due                 |
| 4.11 | Record sale              | Quick actions → Record sale               | Add a cart line / notes    |
| 4.12 | Add custom debt          | Quick actions → Add custom debt           | Amount / description       |
| 4.13 | Record debt payment      | Quick actions → Record debt payment       | Amount / notes             |
| 4.14 | Payment receipt (edit)   | Payments list → row                       | Edit → change amount       |
| 4.15 | Sale receipt (void)      | Sales list → row                          | Void → type reason         |
| 4.16 | Developer import         | Settings → Developer → Import             | Paste text                 |

---

## 5. Nested / stacked sheets

Sheet stacking is real: Record sale → Add customer; Customer form → Add plan; Debtor detail → Add custom debt → Add customer.

| #   | Scenario                        | Steps                                                                                      | Expected result                                                                    |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 5.1 | Dirty child over clean parent   | Record sale (untouched) → **+ Add customer** → type a name → Back                          | Discard dialog for the **child**; on Discard only the child closes, sale form stays |
| 5.2 | Dirty child over dirty parent   | Record sale → add a cart line → Add customer → type a name → Back → Discard → Back          | Child closes first (one dialog), then the parent asks separately                    |
| 5.3 | Clean child over dirty parent   | Record sale → add a cart line → Add customer → Back (nothing typed)                        | Child closes with **no** dialog; parent remains open and still dirty               |
| 5.4 | Child save, parent stays dirty  | Record sale → Add customer → fill + Save → then close the sale form                        | Child closes on save with no prompt; parent asks (it has a cart/customer)           |
| 5.5 | Customer form → Add plan        | Edit customer → change name → Plans **+ Add** → type plan name → Back → Discard             | Only the plan sheet closes; customer form keeps its edited name                     |
| 5.6 | 3 levels deep                   | Debtor detail → Add custom debt → Add customer → type → Back → Discard → Back → Discard      | Closes one level per confirm; the debtor detail sheet is still open at the end      |
| 5.7 | Back never skips a level        | Repeat 5.6 pressing only hardware Back                                                     | No press ever closes two sheets at once or reaches the router                       |

---

## 6. Save path (guard must stay out of the way)

| #   | Scenario                  | Steps                                                              | Expected result                                                     |
| --- | ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 6.1 | Successful save           | Any form → fill → **Save**                                         | Saves and closes; **no** discard dialog                             |
| 6.2 | Validation error          | Submit an invalid form → then Cancel                                | Error banner shows; Cancel then asks to discard (edits still there) |
| 6.3 | Server/tier error         | Trigger a tier-limit error → close the upgrade prompt              | Form closes per its existing behavior; no double discard dialog     |
| 6.4 | Save while prompt open    | Not reachable by design — confirm the dialog blocks the form behind | No way to tap Save while the discard dialog is up                   |

---

## 7. Plan lines & cart (child-owned state)

The customer form's plan rows and the sale form's cart live in child components, reported upward.

| #   | Scenario                    | Steps                                                                        | Expected result                        |
| --- | --------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| 7.1 | Add a plan line             | Edit customer → **+ Add plan** row → Cancel                                  | Discard dialog appears                 |
| 7.2 | Change a plan               | Edit customer → change the plan in an existing line → Cancel                 | Discard dialog appears                 |
| 7.3 | Change a line's start date  | Edit customer → change a line's start date → Cancel                          | Discard dialog appears                 |
| 7.4 | Remove a plan line          | Edit customer (2+ lines) → remove one → Cancel                               | Discard dialog appears                 |
| 7.5 | Reactivate a cancelled line | Edit customer with a cancelled line → Reactivate → Cancel                    | Discard dialog appears                 |
| 7.6 | Keep editing preserves lines | 7.1 → Keep Editing                                                          | The added row is still present         |
| 7.7 | Sale cart line              | Record sale → add a product line → Cancel                                    | Discard dialog appears                 |
| 7.8 | Sale cart keep              | 7.7 → Keep Editing                                                           | Cart line still present with quantity  |

---

## 8. Edge cases & resilience

| #   | Scenario                          | Steps                                                                        | Expected result                                                              |
| --- | --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 8.1 | Language / RTL                    | Switch to Arabic → repeat 1.1–1.3                                            | Dialog is translated; buttons in correct RTL order                           |
| 8.2 | Keyboard open                     | Make dirty with the keyboard up → Back                                       | Keyboard closes and/or dialog shows correctly; sheet not left half-open      |
| 8.3 | Rotate / resize during prompt     | Open the dialog → rotate (or resize the browser)                             | Dialog and sheet both survive; no crash, no orphaned overlay                 |
| 8.4 | Navigate away while prompt open   | Open the dialog → trigger a tab/route change                                 | No dialog left floating over the new screen                                  |
| 8.5 | Offline                           | Go offline → make dirty → Discard, then repeat with Save                      | Guard behaves identically (it is pure UI; no network involved)               |
| 8.6 | Web wide viewport                 | Desktop browser → repeat 1.1 / 1.9                                           | Dialog is centered and capped in width; backdrop tap still asks              |
| 8.7 | Another confirm competes          | Edit customer → remove a plan line (its own confirm) → answer it → then Cancel | Each dialog appears and settles independently; neither gets stuck            |
| 8.8 | Always-mounted sheet              | Settings → Developer → Import: type text → Back → Keep Editing → Back → Discard | Behaves like mount-on-open sheets (this one stays mounted and toggles visible) |

---

## 9. Findings to verify

- **8.4 / 8.7** exercise the dialog-lifecycle hardening (`confirmSlice.show` settles any outstanding prompt; the guard settles on unmount). If a dialog is ever left on screen with nothing behind it, file a finding.
- **1.6 drag interception is best-effort.** The snap-back is requested when the close animation is *about to* start; under a heavy JS stall the sheet may briefly animate away and then return. Data must still be preserved — only the visual is at issue. File a finding only if values are **lost**.
- **2.2 / 2.6** are the specific regression this feature shipped a fix for. Treat any extra dialog or unexpected navigation as a release blocker.
