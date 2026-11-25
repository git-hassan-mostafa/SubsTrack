# WhatsApp — Setup and Test Guide (for the Sijil owner)

This is the step-by-step list to get WhatsApp messaging working, first for you, then for your tenants.
The technical design is in [whatsapp.md](whatsapp.md).

**How it works in one line:** each tenant connects **their own** WhatsApp number through Meta, and **Meta bills the tenant**, not you. Your job is to set up one Meta app once, and then turn WhatsApp on for each tenant.

Do the parts **in order**. Some steps need a value from an earlier step.

---

## Part 1 — Meta: create your app (you, once)

Start this early. **Business Verification can take a few days.**

1. **Business portfolio.** Go to [business.facebook.com](https://business.facebook.com) and create (or open) the business portfolio for your company.
2. **Verify your business.** Business Settings → Security Center → **Start verification**. You need company documents. You can keep going while you wait.
   - **No registered company yet?** A portfolio needs only a Facebook account, so Parts 1–5 (building and testing with your own accounts) still work. Verification is needed only in Part 6, before real tenants can connect.
3. **Create the app.** Go to [developers.facebook.com](https://developers.facebook.com) → My Apps → **Create app** → type **Business** → add the **WhatsApp** use case → link it to your business portfolio.
4. **Fill in the app details.** App settings → Basic: privacy policy URL, terms URL, app icon, category, data deletion URL. Meta needs these before App Review.
5. **Copy two values** from App settings → Basic. You will need them in Part 2:
   - **App ID** → used as `META_APP_ID` and as `WhatsAppAppId`
   - **App Secret** → used as `META_APP_SECRET`. **Keep this private.** Never paste it in chat, in code or in the app.
6. **Create the signup configuration.** Facebook Login for Business → **Configurations** → Create:
   - Login variation: **WhatsApp Embedded Signup**
   - Products: **Cloud API** and **WhatsApp Business app onboarding** (this is what lets a tenant keep their WhatsApp Business app number)
   - Permissions: `whatsapp_business_management` and `whatsapp_business_messaging`
   - Token expiry: **Never**
   - Save and copy the **Configuration ID** → used as `WhatsAppConfigId`.
7. **Login settings.** Facebook Login for Business → **Settings**. Turn **on**: Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth login, Use Strict Mode, Login with the JavaScript SDK. Then:
   - **Allowed domains for the JavaScript SDK:** your Sijil web domain, for example `https://app.sijil.com`
   - **Valid OAuth redirect URIs:** `https://<your Sijil web domain>/whatsapp-connect`
8. **Add yourself as a tester.** App roles → Roles. While the app is in **Development** mode, **only people with a role on this app can finish the signup.** You are the admin already. Add any other Facebook account you want to test with.

---

## Part 2 — Supabase and the Sijil web site (you, once)

9. **Run the database script.** Supabase Dashboard → SQL Editor → run `sql scripts/script.sql`. Nothing new is needed in `migration.sql`.
   - The script turns on `pg_cron` and `pg_net`. If it errors on them, turn them on in Database → Extensions, then run the script again.

10. **Make three random values** on your computer:
    ```
    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
    ```
    - 1st → `WHATSAPP_TOKEN_KEY` (encrypts every tenant's Meta token). **Save a copy in a safe place. If you lose it, every tenant must connect again.**
    - 2nd → `WHATSAPP_WORKER_SECRET`
    - 3rd → `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

11. **Set the function secrets.** Supabase Dashboard → Edge Functions → **Secrets** (or `supabase secrets set NAME=value` from `SubsTrack/`):
    | Name | Value |
    |---|---|
    | `META_APP_ID` | App ID from step 5 |
    | `META_APP_SECRET` | App Secret from step 5 |
    | `WHATSAPP_TOKEN_KEY` | from step 10 |
    | `WHATSAPP_WORKER_SECRET` | from step 10 |
    | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | from step 10 |

    `SERVICE_ROLE_KEY` and `ANON_KEY` are already set for your other functions. Keep them.

12. **Add three Vault secrets.** These let the database start the sender every minute. Supabase Dashboard → Integrations → **Vault** → Add new secret:
    | Name | Value |
    |---|---|
    | `whatsapp_worker_url` | `https://<project-ref>.supabase.co/functions/v1/whatsapp-worker` |
    | `whatsapp_worker_secret` | the **same** value as `WHATSAPP_WORKER_SECRET` |
    | `whatsapp_worker_apikey` | your project's **anon key** (Supabase refuses any call without a key) |

    `<project-ref>` is the part before `.supabase.co` in your Supabase URL. If any of the three is missing, messages stay **Waiting** and nothing shows an error.

13. **Deploy the functions.** From `SubsTrack/`:
    ```
    npm run deploy-whatsapp-functions
    ```
    (or `npm run deploy-all-functions` to deploy every function).

14. **Test the webhook address** (it must answer before Meta will accept it). Supabase refuses any call that carries no key, and Meta cannot send one as a header, so the key goes **in the address**. In a browser, open:
    ```
    https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook?apikey=<your anon key>&hub.mode=subscribe&hub.verify_token=<WHATSAPP_WEBHOOK_VERIFY_TOKEN>&hub.challenge=12345
    ```
    - It shows `12345` → good.
    - It shows **401** → the anon key in the address is wrong.
    - It shows **403** → the verify token does not match the secret.

15. **Deploy the Sijil web build** (Vercel). The connect page lives at `https://<your Sijil web domain>/whatsapp-connect`, and it must be on the same domain you added in step 7.

16. **Ship the app update.** `SubsTrack/package.json` changed, so make a **new build** (`npm run build-prod`) and publish it. Phones on the old build will not get the WhatsApp screens.

---

## Part 3 — Meta: connect the webhook (you, once)

17. developers.facebook.com → your app → WhatsApp → **Configuration** → Webhook → **Edit**:
    - Callback URL: `https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook?apikey=<your anon key>`
    - Verify token: your `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
    - Press **Verify and save**.
18. In the same place, **Subscribe** to these fields: `messages`, `message_template_status_update`, `template_category_update`, `account_update`, `phone_number_quality_update`, `phone_number_name_update`, `business_capability_update`, `account_alerts`, `history`, `smb_app_state_sync`, `smb_message_echoes`.

---

## Part 4 — SuperAdminWeb (you)

19. SuperAdminWeb → **Options** → fill in:
    | Option | Value |
    |---|---|
    | `WhatsAppAppId` | App ID from step 5 |
    | `WhatsAppConfigId` | Configuration ID from step 6 |
    | `WhatsAppConnectUrl` | `https://<your Sijil web domain>/whatsapp-connect` |

    These three are public ids, not secrets. While any of them is empty, tenants see "not set up yet" and cannot connect.
20. SuperAdminWeb → **Tenants** → edit a tenant → turn on **WhatsApp messaging allowed** → Save. The WhatsApp column then shows "Yes". Only tenants with this switch on see WhatsApp.

---

## Part 5 — Test it yourself first (you act as the first tenant)

**You need:**
- A test tenant in Sijil with an **organization-wide admin** user. Turn WhatsApp on for it (step 20).
- A phone number for the business:
  - a **spare SIM that is not on WhatsApp** (it must get an SMS or a call), **or**
  - a number already on the **WhatsApp Business app** (update the app first).

  A number on the normal personal WhatsApp app does not work.
- Your **own personal WhatsApp number**, to receive the messages.

**Steps:**

21. **Open the WhatsApp screen.** Log in to Sijil as the test tenant's admin. If you were already logged in, log out and in again so the switch takes effect. Open **Admin** → **WhatsApp**.
22. **Connect.** Choose the message language, tick the consent box, tap **Connect WhatsApp**. On the phone the browser opens; on the web the page changes. On the connect page tap **Continue with Facebook**, then follow Meta's window:
    - log in with a Facebook account that has a role on your app (step 8);
    - choose or create a business portfolio;
    - add the spare number and type the code, **or** scan the QR code with the WhatsApp Business app;
    - confirm.

    The page then shows "WhatsApp is connected". On the phone, tap **Return to Sijil**.
23. **Check the connection.** More → Admin → WhatsApp shows **Connected**, the number, quality and "Customers per day". Under **Message templates** there are 10 rows (5 messages × English and Arabic) marked **Waiting**.
24. **Add a card in Meta.** [business.facebook.com](https://business.facebook.com) → WhatsApp Manager → Overview → **Add payment method**. Without it every send fails with a payment message.
25. **Wait for approval.** When the templates show **Approved** (minutes, up to 24 h), tap **Refresh from Meta**.
26. **Make a test customer.** Create a customer with **your personal WhatsApp number** as the phone, give them a plan, and leave at least one month unpaid.
27. **Send one reminder.** Customers → the customer's row menu → **Send payment reminder** → check the preview (the amount must match the collect sheet) → **Send**. The message arrives on your personal WhatsApp.
28. **Watch the status.** More → Admin → **WhatsApp messages** should show Sent → Delivered → Read after you open it.
29. **Send to many.** Make 2–3 test customers (other phones you own). Customers → select them → **Send on WhatsApp** → pick **Service outage** → type the details → Send.
30. **Test STOP.** Reply `STOP` from your personal WhatsApp. That customer now shows "Asked not to get WhatsApp messages" and is skipped next time. Undo it from the row menu → **Allow WhatsApp messages**.
31. **Disconnect and reconnect.** More → Admin → WhatsApp → **Disconnect**. History stays. Connect again with the same number, and the old history is still there.
32. **Test a branch admin.** Log in as a branch admin. They can send only to their own branch, and they do not see the WhatsApp settings screen.
33. **Test "not connected".** On another tenant that is not connected, the row menu → **Send payment reminder** opens WhatsApp on the phone with the same text (the `wa.me` fallback).

---

## Part 6 — Go live for real tenants (you, once)

Until this part is done, only people with a role on your Meta app (step 8) can connect. Real tenants cannot.

34. **Business Verification** from step 2 must be approved.
35. **App Review.** developers.facebook.com → your app → App Review → request **Advanced access** for `whatsapp_business_management` and `whatsapp_business_messaging`. Meta asks for one screen recording per permission:
    - `whatsapp_business_messaging`: Sijil sends a reminder and it arrives in WhatsApp (steps 27–28).
    - `whatsapp_business_management`: Sijil creates templates (More → Admin → WhatsApp → **Submit templates again**, then the templates in WhatsApp Manager).
36. Switch the app from **Development** to **Live** (top of the app dashboard).
37. Finish any **Tech Provider** steps the WhatsApp dashboard still shows.

**Limit to know:** before your business is verified, Meta allows only **10 new tenant connections per 7 days** (200 after).

---

## Part 7 — Each new tenant

**You:** SuperAdminWeb → Tenants → turn on **WhatsApp messaging allowed** for them.

**Send the tenant admin these steps:**

1. Log out of Sijil and log in again.
2. Have a Facebook account ready.
3. Choose the number:
   - your **WhatsApp Business app** number (update the app first; your phone keeps working), **or**
   - a number that is **not on WhatsApp** and can get an SMS or call.
4. In Sijil: **More → Admin → WhatsApp** → choose the language → tick the consent box → **Connect WhatsApp** → follow Meta's window → **Return to Sijil**. Only an organization-wide admin sees this screen.
5. In Meta: **WhatsApp Manager → Overview → Add payment method.** Meta bills you directly for each delivered message.
6. Wait until the templates in More → Admin → WhatsApp show **Approved**.
7. Send: **Customers** → select customers → **Send on WhatsApp**, or a customer's row menu → **Send payment reminder**. Results are in **More → Admin → WhatsApp messages**.
8. To stop: More → Admin → WhatsApp → **Disconnect**. To fully remove Sijil's access, also go to Meta Business Settings → Integrations → Connected apps.

---

## Part 8 — A tenant who uses their own Meta app (the other way)

Some tenants prefer to use **their own Meta app** instead of Meta's sign-up window. Sijil then needs only **2 values** from them. Sijil finds everything else (the app, the WhatsApp account and the phone number).

**Good to know before choosing this way:**

- The number **cannot** be used in the WhatsApp or WhatsApp Business app on a phone any more. Use a number only for Sijil messages.
- The tenant does more steps in Meta than with the sign-up window. Most tenants should use the normal way (Part 7).

**You:** SuperAdminWeb → Tenants → turn on **WhatsApp messaging allowed** for them (same as Part 7).

**Send the tenant admin these steps:**

1. Go to **business.facebook.com** and make sure you have a **business portfolio** (create one if not).
2. Go to **developers.facebook.com** → **My Apps** → **Create app** → type **Business** → link it to your business portfolio.
3. In the app, add **WhatsApp**. Under **Connect on WhatsApp → Production setup → Register your WhatsApp phone number → Add phone number** (older dashboards call this **WhatsApp → API Setup**), add your phone number and verify it with the SMS or call code. **Sijil does not verify the number** — this step is the only check, so do it before connecting in Sijil.
   - Meta asks for business information: **Name** (the display name customers see), **Category** (your type of business; internet or generator → **Other**), **Country**, **Website** and **Time zone**. No website? Use your Facebook or Instagram page link. Use a page that shows your business name, because Business Verification checks it.
   - **Do not choose "Use a display name with a virtual number instead".** That gives a free Meta **test** number (+1 555…). It may stop working after about 5 messages until the display name is approved. Use it only for testing.
4. Go to **Business Settings → Users → System users** → **Add** a system user (role **Admin**).
5. On that system user, **Assign assets**: your **app** (full control) and your **WhatsApp account** (full control). **Do this before step 6** — a token made before the assets were assigned cannot reach the WhatsApp account. If you cannot see the WhatsApp account in the list, it belongs to another business portfolio: switch portfolio (top left) and make the system user there.
6. Still on that system user: **Generate new token** → choose your app → expiry **Never** → tick **whatsapp_business_messaging** and **whatsapp_business_management** → copy the token. Keep it safe; Meta shows it once.
   - To check the token: paste it at [developers.facebook.com/tools/debug/accesstoken](https://developers.facebook.com/tools/debug/accesstoken). Under **Granular scopes** you see either your WhatsApp account's ID or **"Applies to all objects"**. Both are fine.
7. In the app: **App settings → Basic** → copy the **App secret** (tap Show). Also fill **Privacy Policy URL** (any public page with your privacy policy).
8. Switch the app to **Live** at the top of the app page.
9. In Sijil: **More → Admin → WhatsApp** → choose the language → tick the consent box → **Use my own Meta app instead** → paste the **token** and the **app secret** → **Connect**.
   - If your app has more than one number, Sijil asks you to choose one.
   - If the number already has a 6-digit PIN, Sijil asks for it.
   - If the token does not name your WhatsApp account ("Applies to all objects"), Sijil asks for your **WhatsApp Business Account ID**. Find it in business.facebook.com → **Settings → Accounts → WhatsApp accounts** → click your account (the ID is under its name). Other places: the WhatsApp Manager page address (`waba_id=…`), or developers.facebook.com → your app → **Connect on WhatsApp → Step 1. Try it out**. Meta now also calls it the **Messaging account ID** — same number. Do **not** use the **Phone number ID**; Sijil finds that itself.
10. If Sijil shows a box **"One more step in Meta"**: in your app open **WhatsApp → Configuration → Webhook**, paste the **Callback URL** and **Verify token** from that box, tap **Verify and save**, then subscribe to **messages**, **message_template_status_update** and **account_update**. Back in Sijil tap **Check again**.
11. Then continue from Part 7, step 5 (payment method, wait for approved templates, send).

To change the token later: More → Admin → WhatsApp → **Change Meta app keys**.

---

## Good to know

- **The SIM is needed only once**, to get the code. After connecting, messages go through Meta's servers, not the SIM. You need the SIM again only if Meta asks to verify again or you move the number. If a prepaid SIM expires, the phone company may give the number to someone else — keep it active for a real business number.
- **Do not use free "receive SMS online" websites.** Meta often refuses them, and anyone can read the code. A **landline** works: choose **Phone call** instead of SMS.
- **Daily limit:** a new business can start conversations with **250 different customers per 24 hours**. Replies to customers who wrote first are not limited. The limit grows (2,000 → 10,000 → 100,000) with good use and Business Verification. Sijil shows it as "Customers per day".
- **Templates in Meta:** business.facebook.com → **WhatsApp Manager → Account tools → Message templates**. A new WhatsApp account also gets Meta sample templates (`jaspers_market_...`, `hello_world`). Sijil does not use them; delete them.
- **Customer phone format:** any of these works — `+96181446801`, `0096181446801`, `81 446 801`, `03 123 456`, or Arabic digits. A number without a country code is treated as Lebanese (+961). A foreign customer must be saved with their country code (`+44…`).
- **Why a message failed:** More → Admin → **WhatsApp messages** shows Meta's reason and code next to **Failed**. Code **131030** = the sending number is a Meta test number and this customer is not in its allowed list (developers.facebook.com → your app → Step 1. Try it out → add the number as a recipient), or use a real number.
- Code **131058** ("Hello World templates can only be sent from the Public Test Numbers") = you sent Meta's sample `hello_world` template from your own number. Send a Sijil template instead (payment reminder, outage, notice…), and delete `hello_world` in WhatsApp Manager.
- **One number per tenant.** If the Meta account has several numbers, Sijil asks which one to use. To change it: More → Admin → WhatsApp → **Change Meta app keys**.
- **Tenants without a business portfolio:** Meta's sign-up window creates one for them. They only need a Facebook account and a business name.

## If something goes wrong

| What you see | What to check |
|---|---|
| No **WhatsApp** in the Admin menu | Is the switch on in SuperAdminWeb? Did the admin log in again? Is the user an organization-wide admin? |
| "not set up by Sijil yet" / Connect disabled | The three Options in step 19 are empty |
| Meta's window does not open, or says the domain is not allowed | Step 7 domains; the page must be on HTTPS on that exact domain |
| Meta's window says the app is not available | The app is still in Development and this Facebook account has no role (step 8), or App Review is not done yet (Part 6) |
| Webhook "Verify and save" fails | Step 14 test; the verify token must be the same in both places |
| Templates stay **Waiting** forever | The webhook is not set up (steps 17–18). Tap **Refresh from Meta** to pull the status by hand |
| Messages stay **Waiting** | One of the three Vault secrets in step 12 is missing or wrong, or the account shows **Needs attention** |
| Failed: payment method | Step 24, then More → Admin → WhatsApp → **Check again** |
| Own Meta app: "app secret does not match" | The secret was copied from a different app than the token. Copy both from the same app (Part 8, steps 6–7) |
| Own Meta app: "this token expires" | The token was made with an expiry. Make a new one with expiry **Never** (Part 8, step 6) |
| Own Meta app: Sijil asks for a "WhatsApp Business Account ID" | Normal when the token says "Applies to all objects". Type the ID from Business Settings → Accounts → WhatsApp accounts (Part 8, step 9) |
| Own Meta app: "cannot reach this WhatsApp Business Account" | The ID typed is wrong, or the system user was not given that account (Part 8, step 5) |
| Own Meta app: number sends a few messages then stops | It is a Meta test number ("display name with a virtual number"). Add a real number (Part 8, step 3) |
| A Sijil template shows **Marketing** with a ⚠ in Meta | Meta changed its category. It costs more. Ask Meta for a review in WhatsApp Manager (within 60 days), or ask for new template wording. Words that ask the customer to buy or renew ("please renew your subscription") are the usual cause |
| Own Meta app: messages send but never show Delivered / Read | The webhook is not set. Do Part 8, step 10, then **Check again** |
| Own Meta app: "One more step in Meta" stays after **Check again** | Check in your app's webhook settings: the Callback URL is exactly the one Sijil shows, **Verify and save** showed no error, and **messages**, **message_template_status_update** and **account_update** are all **Subscribed**. Still there? Supabase → Edge Functions → whatsapp-admin → Logs, search `webhook_` to see Meta's reason |
