# WhatsApp — Setup and Test Guide (for the Sijil owner)

This is the step-by-step list to get WhatsApp messaging working, first for you, then for your tenants.
The technical design is in [whatsapp.md](whatsapp.md). The full test list is in [QA/whatsapp-cloud.md](../QA/whatsapp-cloud.md).

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

## Part 4 — SuperAdmin (you)

19. SuperAdmin → **Options** → fill in:
    | Option | Value |
    |---|---|
    | `WhatsAppAppId` | App ID from step 5 |
    | `WhatsAppConfigId` | Configuration ID from step 6 |
    | `WhatsAppConnectUrl` | `https://<your Sijil web domain>/whatsapp-connect` |

    These three are public ids, not secrets. While any of them is empty, tenants see "not set up yet" and cannot connect.
20. SuperAdmin → **Tenants** → edit a tenant → turn on **WhatsApp messaging allowed** → Save. The card then shows "· WhatsApp". Only tenants with this switch on see WhatsApp.

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
23. **Check the connection.** Admin → WhatsApp shows **Connected**, the number, quality and "Customers per day". Under **Message templates** there are 8 rows (4 messages × English and Arabic) marked **Waiting**.
24. **Add a card in Meta.** [business.facebook.com](https://business.facebook.com) → WhatsApp Manager → Overview → **Add payment method**. Without it every send fails with a payment message.
25. **Wait for approval.** When the templates show **Approved** (minutes, up to 24 h), tap **Refresh from Meta**.
26. **Make a test customer.** Create a customer with **your personal WhatsApp number** as the phone, give them a plan, and leave at least one month unpaid.
27. **Send one reminder.** Customers → the customer's row menu → **Send payment reminder** → check the preview (the amount must match the collect sheet) → **Send**. The message arrives on your personal WhatsApp.
28. **Watch the status.** Admin → **WhatsApp messages** should show Sent → Delivered → Read after you open it.
29. **Send to many.** Make 2–3 test customers (other phones you own). Customers → select them → **Send on WhatsApp** → pick **Service outage** → type the details → Send.
30. **Test STOP.** Reply `STOP` from your personal WhatsApp. That customer now shows "Asked not to get WhatsApp messages" and is skipped next time. Undo it from the row menu → **Allow WhatsApp messages**.
31. **Disconnect and reconnect.** Admin → WhatsApp → **Disconnect**. History stays. Connect again with the same number, and the old history is still there.
32. **Test a branch admin.** Log in as a branch admin. They can send only to their own branch, and they do not see the WhatsApp settings screen.
33. **Test "not connected".** On another tenant that is not connected, the row menu → **Send payment reminder** opens WhatsApp on the phone with the same text (the `wa.me` fallback).

All other checks (expired link, wrong PIN, number owned by another tenant, duplicate webhooks, isolation between tenants) are in [QA/whatsapp-cloud.md](../QA/whatsapp-cloud.md).

---

## Part 6 — Go live for real tenants (you, once)

Until this part is done, only people with a role on your Meta app (step 8) can connect. Real tenants cannot.

34. **Business Verification** from step 2 must be approved.
35. **App Review.** developers.facebook.com → your app → App Review → request **Advanced access** for `whatsapp_business_management` and `whatsapp_business_messaging`. Meta asks for one screen recording per permission:
    - `whatsapp_business_messaging`: Sijil sends a reminder and it arrives in WhatsApp (steps 27–28).
    - `whatsapp_business_management`: Sijil creates templates (Admin → WhatsApp → **Submit templates again**, then the templates in WhatsApp Manager).
36. Switch the app from **Development** to **Live** (top of the app dashboard).
37. Finish any **Tech Provider** steps the WhatsApp dashboard still shows.

**Limit to know:** before your business is verified, Meta allows only **10 new tenant connections per 7 days** (200 after).

---

## Part 7 — Each new tenant

**You:** SuperAdmin → Tenants → turn on **WhatsApp messaging allowed** for them.

**Send the tenant admin these steps:**

1. Log out of Sijil and log in again.
2. Have a Facebook account ready.
3. Choose the number:
   - your **WhatsApp Business app** number (update the app first; your phone keeps working), **or**
   - a number that is **not on WhatsApp** and can get an SMS or call.
4. In Sijil: **Admin → WhatsApp** → choose the language → tick the consent box → **Connect WhatsApp** → follow Meta's window → **Return to Sijil**. Only an organization-wide admin sees this screen.
5. In Meta: **WhatsApp Manager → Overview → Add payment method.** Meta bills you directly for each delivered message.
6. Wait until the templates in Admin → WhatsApp show **Approved**.
7. Send: **Customers** → select customers → **Send on WhatsApp**, or a customer's row menu → **Send payment reminder**. Results are in **Admin → WhatsApp messages**.
8. To stop: Admin → WhatsApp → **Disconnect**. To fully remove Sijil's access, also go to Meta Business Settings → Integrations → Connected apps.

---

## If something goes wrong

| What you see | What to check |
|---|---|
| No **WhatsApp** in the Admin menu | Is the switch on in SuperAdmin? Did the admin log in again? Is the user an organization-wide admin? |
| "not set up by Sijil yet" / Connect disabled | The three Options in step 19 are empty |
| Meta's window does not open, or says the domain is not allowed | Step 7 domains; the page must be on HTTPS on that exact domain |
| Meta's window says the app is not available | The app is still in Development and this Facebook account has no role (step 8), or App Review is not done yet (Part 6) |
| Webhook "Verify and save" fails | Step 14 test; the verify token must be the same in both places |
| Templates stay **Waiting** forever | The webhook is not set up (steps 17–18). Tap **Refresh from Meta** to pull the status by hand |
| Messages stay **Waiting** | One of the three Vault secrets in step 12 is missing or wrong, or the account shows **Needs attention** |
| Failed: payment method | Step 24, then Admin → WhatsApp → **Check again** |
