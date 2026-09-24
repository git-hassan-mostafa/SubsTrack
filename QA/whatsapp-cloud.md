# WhatsApp Cloud API — QA Scenarios

Covers each tenant connecting **its own** WhatsApp Business account through Meta's Embedded Signup, Sijil's ready templates, sending reminders and notices (one customer or many), delivery statuses, STOP opt-outs, and disconnect/reconnect. Receipts still go through `wa.me` — see [whatsapp-invoices.md](whatsapp-invoices.md).

**Reference code:**

- Design and Meta setup: [docs/whatsapp.md](../docs/whatsapp.md)
- Server: [supabase/functions/whatsapp-*](../SubsTrack/supabase/functions) + shared [_shared/whatsapp/](../SubsTrack/supabase/functions/_shared/whatsapp)
- App module: [src/modules/whatsapp/](../SubsTrack/src/modules/whatsapp), slice [whatsappSlice.ts](../SubsTrack/src/state/slices/whatsapp/whatsappSlice.ts)
- Customer entry points: [CustomerListScreen.tsx](../SubsTrack/src/modules/customer/customers/screens/CustomerListScreen.tsx) (row menu + selection), [CustomerDetailScreen.tsx](../SubsTrack/src/modules/customer/customers/screens/CustomerDetailScreen.tsx) (header icon)
- Signup page: `/whatsapp-connect` on the Sijil **web** build — [WhatsAppConnectPage.tsx](../SubsTrack/src/modules/whatsapp/screens/WhatsAppConnectPage.tsx)
- Unit tests: `tests/suites/whatsappRules.test.ts`, `sijilTemplates.test.ts`, `whatsappReminder.test.ts`

---

## 0. Critical invariants

1. **A tenant only ever sends through its own number.** No request body can name a WABA, a phone number id or a token. The account is looked up from the caller's `users` row.
2. **No Meta token ever reaches a phone or browser.** Tokens live only in `whatsapp_credentials` (encrypted, no RLS policy).
3. **A customer is never messaged twice for one Send.** Idempotency key = request id + customer id. A crash after Meta accepted a message shows **Unknown** and is never re-sent automatically.
4. **The amount in a reminder equals what the collect sheet would collect** — per currency, balances only, never converted.
5. **Disconnect never deletes history.** Account row, templates and messages stay; only the token and the waiting queue go.
6. **A STOP reply is obeyed.** That number is skipped from then on until an admin allows it again.
7. **Only admins send; only organization-wide admins connect, disconnect or change the language.** A branch admin sends only to its own branch's customers.

---

## 1. Rollout switch

| # | Steps | Expected |
|---|---|---|
| 1.1 | Tenant without "WhatsApp messaging allowed" (SuperAdmin) | No WhatsApp items in the Admin menu. The customer row menu shows only **Send payment reminder** (wa.me) |
| 1.2 | SuperAdmin → Tenants → edit → turn on WhatsApp → Save | Card shows "· WhatsApp". After the tenant admin logs in again, Admin shows **WhatsApp** and **WhatsApp messages** |
| 1.3 | Tenant admin tries to change `tenants.whatsapp_enabled` with the anon key | Refused by `trg_tenants_guard_billing` |
| 1.4 | `WhatsAppAppId` / `WhatsAppConfigId` / `WhatsAppConnectUrl` blank in Options | WhatsApp screen says "not set up by Sijil yet"; Connect is disabled |

## 2. Connecting (needs Meta's real environment)

| # | Steps | Expected |
|---|---|---|
| 2.1 | Admin → WhatsApp → tap Connect without ticking consent | Button disabled |
| 2.2 | Tick consent → Connect (phone) | Browser opens `/whatsapp-connect?s=…`. Page shows the 3 steps and **Continue with Facebook** |
| 2.3 | Finish Meta's popup with a **new number** | "WhatsApp is connected" with name + number. Return to Sijil opens the app; the WhatsApp screen shows Connected, number, quality, daily limit |
| 2.4 | Finish with an existing **WhatsApp Business app** number (coexistence) | Same, plus the "Also on WhatsApp Business app" chip. The phone app keeps working |
| 2.5 | Close Meta's popup early | "The Meta window was closed before finishing." Try again works with the same link |
| 2.6 | Open the same link after 15 minutes, or after a successful connect | "This link has expired" |
| 2.7 | Number already has a two-step PIN | PIN box appears; wrong PIN → "That PIN is not correct"; right PIN → connected |
| 2.8 | Connect a number that another Sijil tenant has connected | "already connected to another Sijil organization" |
| 2.9 | Open `/whatsapp-connect` with no `s` | "This page only works from the link Sijil opens" |
| 2.10 | Open `/whatsapp-connect` in the native app | Redirects home |
| 2.11 | Right after connecting | Templates list shows 8 rows (4 messages × en/ar) as **Waiting**, then **Approved** after Meta's review |

## 3. Templates

| # | Steps | Expected |
|---|---|---|
| 3.1 | Meta rejects one template | Row shows **Rejected** + reason. **Submit templates again** resubmits it |
| 3.2 | Meta re-classes a Sijil template as Marketing | Warning "Meta classed this as Marketing" under the row |
| 3.3 | Tenant creates its own Utility template in WhatsApp Manager → Refresh | It appears; once approved it is offered in the send sheet as "Your own template" |
| 3.4 | Own template with an image header or dynamic URL button | Listed with "Sijil cannot send this one yet"; not offered for sending |

## 4. Sending

| # | Steps | Expected |
|---|---|---|
| 4.1 | Customer row menu → Send payment reminder (connected, approved) | Sheet: type = Payment reminder, preview with `[Amount owed]`, `[Months owed]`, `[Due since]`. Send → "1 message is on its way" |
| 4.2 | Customers → Overdue tab → select all → Send on WhatsApp | One sheet for all; result lists queued count and each skip reason (no phone, owes nothing, asked to stop, …) |
| 4.3 | Choose **Service outage**, leave Details empty | Send disabled until Details is typed |
| 4.4 | Choose the tenant's own template with `{{1}}` | Each placeholder has a "Value for 1" picker (customer name / amount owed / … / type the text) |
| 4.5 | Send the same reminder to the same customer twice within 24 h | Second time: "already got this message in the last 24 hours" + **Send again anyway** |
| 4.6 | Double-tap Send / flaky network retry | Still only one message per customer in History |
| 4.7 | Reminder amount | Equals the collect sheet total for that customer, per currency (e.g. `$20.00 + 1,500,000 L.L.`) |
| 4.8 | Customer phone `03 123456` on a Lebanese number | Sent to `+9613123456` |
| 4.9 | Customer phone `abc` | Skipped: "phone number is not valid" |
| 4.10 | Branch admin selects customers | Only own-branch customers are sent; any other → "another branch" |
| 4.11 | Native app offline → Send | "needs an internet connection" |
| 4.12 | 300 new customers on a TIER_250 account | 250 go out; the rest stay **Waiting** with "Meta's daily limit was reached", then send later |

## 5. Not connected (wa.me fallback)

| # | Steps | Expected |
|---|---|---|
| 5.1 | Row menu → Send payment reminder | WhatsApp opens on the phone with the Sijil reminder text (tenant language) and the right amount |
| 5.2 | Customer owes nothing | Dialog "owes nothing"; no chat opens |
| 5.3 | Multi-select | No "Send on WhatsApp" action (bulk needs a connection) |

## 6. Statuses and webhooks

| # | Steps | Expected |
|---|---|---|
| 6.1 | Message delivered, then read | History: Sent → Delivered → Read |
| 6.2 | Meta delivers `read` before `delivered`, or repeats a webhook | Status never moves backwards; timestamps keep the first value |
| 6.3 | Number not on WhatsApp | Failed — "This number is not on WhatsApp" |
| 6.4 | No payment method on the WABA | Failed — payment reason; account shows **Needs attention** with the fix steps; queue pauses. After adding the card → Check again → Connected |
| 6.5 | POST to the webhook with a wrong signature | 401, nothing changes |
| 6.6 | GET verify with the wrong verify token | 403 |
| 6.7 | Customer replies `STOP` / `إيقاف` | Number marked "Asked not to get WhatsApp messages"; skipped next time |
| 6.8 | Customer replies "please stop by tomorrow" | Nothing changes |
| 6.9 | Tenant removes Sijil in Meta Business Settings | Account becomes Disconnected (`partner_removed`); waiting messages cancelled |

## 7. Disconnect / reconnect

| # | Steps | Expected |
|---|---|---|
| 7.1 | Admin → WhatsApp → Disconnect → confirm | Status gone, Connect shown again. History still lists old messages. Waiting ones → Cancelled "WhatsApp was disconnected" |
| 7.2 | Connect again with the same number | Same account row comes back; old history still linked |
| 7.3 | Connect a different number | Old account Disconnected ("replaced"), new one Connected; both histories visible |

## 8. Isolation

| # | Steps | Expected |
|---|---|---|
| 8.1 | Tenant B admin queries `whatsapp_accounts` / `whatsapp_messages` | Only B's rows (RLS) |
| 8.2 | Tenant B calls `whatsapp-send` with tenant A's customer ids | All skipped as "not found" |
| 8.3 | Anyone selects `whatsapp_credentials` / `whatsapp_connect_sessions` with the anon or user key | No rows (no policy) |
| 8.4 | A `user` (non-admin) calls `whatsapp-send` | 403 "Only admins can use WhatsApp messaging" |
