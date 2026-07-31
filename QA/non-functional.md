# Non-Functional QA Scenarios

Cross-cutting concerns that don't fit a single feature: performance, error handling, network resilience, accessibility, internationalization, observability and security. These should be regression-tested before every release.

---

## 1. Performance

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | App cold start | Force-quit, reopen | < 3 seconds to LoadingScreen → first screen on a mid-tier device |
| 1.2 | Hot start | Background then foreground | < 1 second to interactive |
| 1.3 | Customer list with 1000+ rows | Seed many customers | Initial render < 1s; scroll is smooth (FlatList virtualization) |
| 1.4 | Pagination smoothness | Scroll continuously through pages | No jank; loadingMore footer visible briefly |
| 1.5 | Search latency | Type in search field | Debounced; UI never freezes |
| 1.6 | Year switch on detail | Switch year on a 500-payment customer | Spinner; then renders < 500ms |
| 1.7 | Dashboard metrics | 5000 customers and 50000 payments | Dashboard returns within network round-trip; counts use `count: 'exact', head: true` |
| 1.8 | Memory growth | Open 10 customer detail screens in sequence | No leaks (each detail resets payments on unmount) |
| 1.9 | Form sheet animation | Tap "+ Add" rapidly | Animation does not stutter; no double-mount |
| 1.10 | Month grid memo | Tap cells, navigate years | Cells re-render minimally (verify with React profiler) |

## 2. Error handling

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Network offline at app start | Disable network, cold start | LoadingScreen → restore fails → routed to login screen with no banner crash |
| 2.2 | Network offline during a fetch | Pull-to-refresh on customers | ErrorBanner with friendly message; existing list preserved |
| 2.3 | Network offline during a write | Submit a form | ErrorBanner inside the sheet; form state preserved |
| 2.4 | Slow network (5s+) | Throttle | Loading indicators visible; timeouts don't surface raw URLs |
| 2.5 | Partial network (DNS only) | Use a captive portal | App reports a connection error, no infinite spinner |
| 2.6 | Backend 500 | Force a server error | ErrorBanner; no raw stack traces |
| 2.7 | Auth token revoked | Invalidate JWT mid-session | Next request fails; user is bounced to login on next refresh (verify) |
| 2.8 | RLS denial | Try to read another tenant's row | Empty result or "not found" — no crash, no leak |
| 2.9 | Schema mismatch | Backend column missing | Friendly error or graceful degradation, no crash |
| 2.10 | ErrorBoundary catch | Force a thrown render error | ErrorBoundary fallback shown; "Try again" works |

## 3. Loading & spinner UX

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | First-time loading | Empty store → fetch | ActivityIndicator visible; replaced by content |
| 3.2 | Re-fetch with cached data | Pull-to-refresh after data exists | Existing data stays visible; spinner only at the refresh control |
| 3.3 | Form submit loading | Submit | Button shows loading state; sheet not closed prematurely |
| 3.4 | Loading and error coexistence | Trigger a slow request that ultimately errors | Spinner shown until error; ErrorBanner replaces it |
| 3.5 | Concurrent fetches | Quickly switch tabs | No "loading flash" between cached results |

## 4. Accessibility

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | VoiceOver / TalkBack on login | Enable screen reader | All inputs labelled; button announces "Sign In" |
| 4.2 | VoiceOver on customer card | Enable | Reads name, plan, status pill |
| 4.3 | VoiceOver on month cell | Enable | Reads month label and status (verify accessibilityLabel; if absent, file finding) |
| 4.4 | Larger system font | Enable Dynamic Type / Android font scale | Layout still usable; key text scales |
| 4.5 | Reduce Motion | Enable system setting | Modal animations still work but can be reduced; verify nothing crashes |
| 4.6 | Color contrast | Inspect each pill | All text meets WCAG AA over its background |
| 4.7 | Tap targets | Each button / row | ≥ 44pt minimum |

## 5. Internationalization & RTL

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | All visible strings i18n-ed | Switch language | Every label translates. Hardcoded English strings (e.g. "Welcome back", "Inactive", "+ Add") should be flagged for translation |
| 5.2 | RTL layout | Switch to Arabic | Layouts mirror; logical paddings (`me-`, `ms-`) work |
| 5.3 | Cairo font | Switch to Arabic | Cairo font applied to all Text components |
| 5.4 | Number formatting | Currency in Arabic | Locale-aware via `Intl.NumberFormat`; verify display currency formatting in both locales |
| 5.5 | Date formatting | Customer "since" date in Arabic | Locale-aware via `getDateLocale`; spot-check for any remaining hardcoded en-US |
| 5.6 | Long translations | Some Arabic strings are longer | UI layouts (cards, buttons) accommodate longer text without truncation |
| 5.7 | Multi-currency symbols | LBP "ل.ل", EUR "€", USD "$" | Render correctly in receipts, plan cards, CurrencyInput dropdown |
| 5.8 | Multi-month chevrons in RTL | Pay Dec–Feb bundle, switch to Arabic | Chevrons on `wrapFromPrev` / `wrapToNext` cells point in the RTL-correct direction (via `DirectionalIcon`) |

## 6. Observability & logs

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | No PII in logs | Login, browse, log out | console.log output should not include passwords or full PII |
| 6.2 | Error log signal | Trigger errors | Errors are logged with enough context for debugging without secrets |
| 6.3 | Crashlytics / Sentry hookup | (If wired) | Verify crashes report; otherwise file a finding |

## 7. Security

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Password masked everywhere | Login + Add Staff forms | Always `secureTextEntry` |
| 7.2 | No tenant_id from client | Inspect repository writes | tenant_id is derived from JWT, never from user input |
| 7.3 | RLS coverage | Migrations | Every table has RLS enabled; policies filter by tenant_id |
| 7.4 | Rate limiting | Out of scope client-side | Backend should enforce; verify with backend team |
| 7.5 | No SQL injection | All filters use parameterized queries (Supabase client) | Confirm |
| 7.6 | No XSS in receipt notes | Save notes containing `<script>` | Rendered as plain text in receipt; no execution |
| 7.7 | Token storage | Inspect AsyncStorage | Token is encrypted at rest by the OS keychain (Supabase default) |

## 8. Resilience & data integrity

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Force-kill mid-write | Submit form, kill app | Either the write completed or it didn't — no partial / orphaned rows |
| 8.2 | Concurrent edits | Two devices editing same record | Last write wins (no merge UI); no crashes |
| 8.3 | Concurrent payment for same month | Two devices on same (customer, month) | First wins; second sees "A payment already exists for this customer and month" |
| 8.4 | Voiding twice | Void a payment, void it again from another device | Second succeeds idempotently or no-ops; verify; no data corruption |
| 8.5 | Clock skew on device | Set device clock 1 day ahead | Status logic uses device clock for current month; verify acceptable behavior at month boundary |
| 8.6 | DB unique constraint failure | Force a duplicate insert | Service translates to user-friendly message |
| 8.7 | Payment amount/balance snapshot integrity | Edit a plan's price after payments exist | Existing payment `amount_due / amount_paid / balance` unchanged |
| 8.8 | Payment FX snapshot integrity | Edit a currency's `rate_per_usd` after payments exist | Existing payments' USD equivalents (via `rate_per_usd_snapshot`) unchanged on Dashboard, Receipt, Year totals |
| 8.9 | Multi-month coverage integrity | Pay a Jan–Mar bundle, then void | Single row voided, all 3 months revert in one atomic operation |
| 8.10 | Multi-month conflict atomicity | Two devices submit overlapping multi-month bundles | First succeeds; second's conflict detection adjusts effectiveStart/effectiveDuration, OR rejects depending on `skipConflicts` flag |
| 8.11 | Soft-delete preservation | Delete a referenced currency / branch | Referenced rows keep their FK pointing at the soft-deleted (active=false) entity. No cascading data loss |
| 8.12 | Hard-delete cascades | Delete a customer with no payments → hard delete | Customer row removed. Deletion of customer WITH payments soft-deletes instead |
| 8.13 | Cross-tenant FK | Force a write linking entities from two tenants | RLS denies at insert/update time. No corruption |

## 9. Device matrix

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | iOS smallest supported | iPhone SE | All forms fit; KeyboardAvoidingView prevents overlap |
| 9.2 | iOS largest | iPhone 15 Pro Max | Layouts use available space; no excessive blank areas |
| 9.3 | Android compact | Pixel 4a | Same layout integrity |
| 9.4 | Android tablet | Tablet | Layouts don't break; verify tab bar usability |
| 9.5 | iPad | iPad portrait + landscape | App is mobile-first; verify it does not crash and is usable |
| 9.6 | Old OS | iOS 14 / Android API 26 (if supported) | App still functions |

## 9b. Web browser Back button (web build only)

On web, the browser Back button closes the topmost open surface — form sheet, dialog **or** popup (dropdown, date/currency/entity picker, action menu) — instead of navigating the route. Back must never change the screen while anything is open. Run these in a desktop browser.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9b.1 | Back closes a form sheet | Open any form sheet (e.g. Customer form), press browser Back | Sheet closes; URL/route unchanged; still on the same screen |
| 9b.2 | Back closes stacked sheets in order | Debts → open Debtor detail sheet → open Debt payment form on top; press Back twice | 1st Back closes the payment form, 2nd Back closes the debtor detail; still on Debts screen |
| 9b.3 | Back closes a dialog over a sheet | Admin → Wallets → open a collector wallet (sheet) → "Receive all" (confirm dialog); press Back | Only the confirm dialog closes; the wallet sheet stays open |
| 9b.4 | **Reported bug — double Back never leaves the site** | From 9b.3, press Back a 2nd time | Wallet sheet closes; still on Wallets screen. Site must NOT close or jump to another page. Repeat pressing Back fast several times |
| 9b.5 | Back after all modals closed | Close every modal, then press Back | Normal route navigation (goes to previous screen) |
| 9b.6 | Picker closes by clicking outside (not Back) | Open a dropdown / currency / date picker inside a form; click the dark backdrop | Picker closes; the form sheet stays open |
| 9b.7 | Action menu closes by clicking outside | Open a row's 3-dot action menu; click outside | Menu closes without navigating |
| 9b.8 | Confirm can't be dismissed mid-action | Start a confirm action that shows a spinner; press Back while it runs | Back is ignored until the action finishes |
| 9b.9 | **Reported bug — Back closed the sheet AND changed the screen** | Customers → open a customer (route change) → open the edit form sheet → press Back once | Only the sheet closes. Still on the customer detail screen — must NOT drop back to the customer list |
| 9b.10 | Back closes a lone popup without navigating | On any list screen open a row's 3-dot menu (no sheet under it); press Back | Menu closes; still on the same screen |
| 9b.11 | Back after a popup handoff | Open a 3-dot menu → choose a destructive action so its confirm dialog replaces the menu → press Back twice | 1st Back closes the confirm, 2nd Back navigates normally. The site must not jump pages |
| 9b.12 | Router history survives an open sheet | Customers → customer detail → open a sheet → close it with Cancel → press Back | Goes back to the customer list exactly once (router history is intact) |

## 9c. Bottom sheets — Android Back, scrolling, keyboard (native build only)

Regression pack for the sheet defects fixed after the Gorhom migration (gotchas #44 / #45 / #47). Run on a real Android device (edge-to-edge behaviour does not always reproduce in a simulator).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9c.1 | Back closes a form sheet | Open any form sheet (Customer / Sale / Payment form); press hardware Back | Sheet closes; still on the same screen — the route must NOT change |
| 9c.2 | Back closes a popup, not the route | Open a Dropdown / date picker / 3-dot action menu; press Back | Only the popup closes; the screen (and any sheet under it) stays open |
| 9c.3 | Back unwinds stacked sheets in order | Open a form sheet → open a picker inside it → press Back twice | 1st Back closes the picker, 2nd closes the form sheet; still on the same screen |
| 9c.4 | Back exits selection before the sheet | Admin → Wallets → open a collector → long-press a transaction (selection bar) → press Back | 1st Back clears the selection, 2nd Back closes the wallet sheet |
| 9c.5 | Payments-history sheet scrolls | 3-dot menu → Payments history; swipe up over the list | The list scrolls through every section; pull-to-refresh and infinite scroll still work |
| 9c.6 | Collector wallet sheet scrolls | Admin → Wallets → open a collector with many transactions; swipe up | The body scrolls to the last transaction |
| 9c.7 | Sheet still drags closed by its handle | Open any full sheet; drag the grey handle bar down | Sheet closes (dragging the body scrolls it instead — that is expected) |
| 9c.7a | Sheet drags from its whole header | Open any sheet with a header row (form sheet, dropdown, currency / date / customer picker, payments-history, debtor detail, collector wallet); drag **from the title text**, not the handle | The sheet follows the finger and closes on a downward drag — the same as dragging the handle |
| 9c.7b | Header buttons still tap | In the same headers, tap Cancel / Close / Confirm and the "+" in the debtor-detail header | Each button fires normally; a plain tap is never swallowed by the drag gesture |
| 9c.7d | Action menu drags from anywhere | Open any 3-dot action menu; drag down starting **on one of the action rows** | The whole menu follows the finger and closes; the row is NOT triggered |
| 9c.7e | Action menu rows still tap | Tap each row of an action menu, including a slightly imprecise tap that moves a few pixels | The action fires every time (the drag only takes over after ~12pt of vertical movement) |
| 9c.7c | Header drag does not break the body | Open the Customer form and the payments-history sheet; scroll the body up and down | The body still scrolls freely; the sheet itself does not move while scrolling |
| 9c.8 | Long form reaches its last field with the keyboard open | Open the Customer form, focus a field near the top so the keyboard opens, then scroll to the bottom | The last field AND the Save button are reachable and fully visible above the keyboard |
| 9c.9 | Dropdown search stays above the keyboard | Open a searchable picker (e.g. customer picker) and type | The search box and results stay visible above the keyboard |
| 9c.10 | Keyboard close restores the sheet | From 9c.8, dismiss the keyboard | The sheet returns to its normal height with no gap or jump |
| 9c.11 | **Reported bug — picker sheet clips its last rows** | Open the currency picker (a money field's currency chip) and the product picker (Record sale → product dropdown), each with 2, 4 and 10+ options | Every row is fully visible; the sheet height matches its content (header + list, nothing cut off at the bottom) and no empty gap under the list |
| 9c.12 | Picker list scrolls when it is capped | Open a dropdown with many options (e.g. products, plans, branches); swipe up over the list | The list scrolls to the last option inside the 360px cap; the sheet itself does not move |
| 9c.13 | Date picker sheet hugs its columns | Open any date picker (native + web) | The sheet is only as tall as header + the 200px wheels (+ Clear row); wheels scroll and open on the selected value |
| 9c.14 | Customer picker's last row clears the nav bar | Open the customer picker (Record sale / debt form) and scroll to the very end | The last row sits fully above the Android nav bar / home indicator |

## 10. Update / migration

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | OTA update via expo-updates | Push an update, reopen app | Update applied on next launch |
| 10.2 | Schema migration applied | Run new migration | App that requires the column does not crash |
| 10.3 | Backwards compatibility | Old client with new server | Soft errors for missing columns; no app crash |

## 11. Background / lifecycle

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | Background app for 5 min | Background and return | Stores intact; no re-fetch unless screen is focused |
| 11.2 | Background app for 24 h | Re-open | Token may expire — restoreSession handles. Drops to login if expired |
| 11.3 | Phone call interruption | Receive a call mid-form | Form state preserved on return |
| 11.4 | Memory pressure | Open many apps | App returns to last route; verify state restoration |
| 11.5 | Push notifications | (Out of scope unless wired) | Skip |

## 12. Restart & recovery

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 12.1 | Force-quit and reopen | After every feature touched | Data persists, last route is reasonable (default = Customers) |
| 12.2 | Clear app storage | Wipe data | Fresh login required; no leftover preferences |
| 12.3 | OS-killed in background | Long background, OS evicts | On reopen, restore proceeds via restoreSession |
