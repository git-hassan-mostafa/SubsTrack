# Web — Login, Session & Route Guards — QA Scenarios

Covers the web app's (`Web/`) login page, session restore, the "organization deactivated" page, and which pages each role may open. The phone rules are in [../authentication.md](../authentication.md) and [../admin-and-navigation.md](../admin-and-navigation.md); the web must behave the same.

**Reference code:**

- Router: [router.tsx](Web/src/app/routes/router.tsx)
- Page list + access: [appPages.ts](Web/src/app/routes/appPages.ts), [access.ts](Web/src/app/routes/access.ts)
- Guards: [SessionGate.tsx](Web/src/app/routes/SessionGate.tsx), [RequireSignedIn.tsx](Web/src/app/routes/RequireSignedIn.tsx), [GuestOnly.tsx](Web/src/app/routes/GuestOnly.tsx), [RequireAccess.tsx](Web/src/app/routes/RequireAccess.tsx)
- Pages: [LoginPage.tsx](Web/src/modules/auth/LoginPage.tsx), [TenantInactivePage.tsx](Web/src/modules/auth/TenantInactivePage.tsx)
- Start-up: [main.tsx](Web/src/main.tsx), [configureWeb.ts](Web/src/platform/configureWeb.ts)

Run: `cd Web && npm run dev`, with `Web/.env.local` set (see `Web/.env.example`).

---

## 1. Login

| #    | Scenario                   | Steps                                                  | Expected result                                                                                  |
| ---- | -------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1.1  | Page layout                | Open `/login`                                          | Logo + "Sijil", "Welcome back", three labelled fields, one "Sign In" button; focus is in Organization Code |
| 1.2  | Labels stay visible        | Type in each field                                     | Each label stays above its field (never only a placeholder)                                      |
| 1.3  | Empty organization code    | Leave all empty, press Sign In                          | Red banner: "Username is required" (the service checks username first); button was never greyed out |
| 1.4  | Missing field messages     | Fill username only, then username + code               | "Organization code is required", then "Password is required"                                     |
| 1.5  | Wrong password             | Valid code + username, wrong password                  | Banner: "Invalid username or password"; no toast, no popup                                       |
| 1.6  | Banner clears on typing    | After 1.5, type one letter in any field               | The banner goes away                                                                             |
| 1.7  | Enter submits              | Fill all three, press Enter in the password field     | Signs in (same as clicking Sign In)                                                               |
| 1.8  | Loading state              | Sign in on a slow network (DevTools throttling)        | Button shows a spinner and cannot be pressed twice                                               |
| 1.9  | Show / hide password       | Click the eye icon, then again                         | Password shows as text, then hides; the icon's tooltip/label says "Show password" / "Hide password" |
| 1.10 | Account not configured     | Sign in as an auth user with no `users` row            | Banner: "Account not configured. Contact your administrator."                                    |
| 1.11 | Deactivated user           | Sign in as a user with `active = false`                | Banner: "Your account has been deactivated. Contact your administrator."                          |
| 1.12 | Browser autofill           | Save the login in the browser, reload `/login`         | Browser offers to fill username + password                                                       |
| 1.13 | Case and spaces            | Code `ACME-ISP `, username ` Admin` (spaces, capitals) | Signs in like the phone (trimmed, lower-cased)                                                   |
| 1.14 | Keyboard only              | Tab through the page                                   | Order: Organization Code → Username → Password → eye icon → Sign In; focus ring always visible     |

## 2. Where you land

| #   | Scenario                        | Steps                                                | Expected result                                          |
| --- | ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| 2.1 | Admin lands on Dashboard        | Sign in as admin or superadmin                       | URL `/dashboard`                                         |
| 2.2 | User lands on Customers         | Sign in as user                                      | URL `/customers`                                         |
| 2.3 | Deep link before login          | Signed out, open `/sales`                            | Sent to `/login`; after sign-in you land on `/sales`     |
| 2.4 | Deep link the role cannot open  | Signed out, open `/reports`, sign in as a user       | Lands on `/customers` (not Reports)                      |
| 2.5 | Login page while signed in      | Signed in, open `/login`                             | Sent to your start page                                  |
| 2.6 | Unknown address                 | Open `/nothing-here`                                 | "Page not found" + a button back to the start page       |

## 3. Session restore and sign out

| #   | Scenario                      | Steps                                          | Expected result                                                                 |
| --- | ----------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| 3.1 | Reload keeps you signed in    | Sign in, reload the page                       | A short loading spinner, then the same page; no login page flash                 |
| 3.2 | New tab keeps you signed in   | Sign in, open the app in a second tab          | Signed in there too                                                              |
| 3.3 | Log out                       | Click "Log Out" in the top bar                 | Back on `/login`; reload stays signed out                                         |
| 3.4 | Log out, other org signs in   | Log out, sign in to a different organization   | Top bar shows the new organization name; nothing from the first one               |
| 3.5 | Deactivated user on reload    | Sign in, deactivate that user from the phone, reload the web | Sent to `/login` (restore signs the session out)                    |

## 4. Organization deactivated

| #   | Scenario                        | Steps                                                 | Expected result                                                                                   |
| --- | ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 4.1 | Inactive organization at login  | Set `tenants.active = false`, sign in                 | "Organization Deactivated" page with the message and hint; no app pages reachable by typing a URL   |
| 4.2 | Inactive on reload              | Signed in, deactivate the tenant, reload              | Same page                                                                                         |
| 4.3 | Leave the page                  | Click "Log Out"                                       | Back on `/login`                                                                                   |

## 5. Pages by role (type the URL directly)

`admin` = role admin or superadmin. **Tenant-wide admin** = superadmin, or admin with no branch.

| #   | Page                        | user      | branch admin | tenant-wide admin | Extra rule                    |
| --- | --------------------------- | --------- | ------------ | ----------------- | ----------------------------- |
| 5.1 | `/dashboard`                | → start   | opens        | opens             |                               |
| 5.2 | `/customers`, `/sales`, `/debts`, `/money-received`, `/my-wallet` | opens | opens | opens |              |
| 5.3 | `/expenses`, `/reports`     | → start   | opens        | opens             |                               |
| 5.4 | `/admin/users`, `/admin/wallets`, `/admin/plans`, `/admin/products`, `/admin/services`, `/admin/currencies`, `/admin/branches`, `/admin/audit` | → start | opens | opens | |
| 5.5 | `/admin/organization`       | → start   | → start      | opens             |                               |
| 5.6 | `/admin/whatsapp`           | → start   | → start      | opens             | only if WhatsApp is enabled for the organization |
| 5.7 | `/admin/whatsapp-history`   | → start   | opens        | opens             | only if WhatsApp is enabled for the organization |
| 5.8 | WhatsApp turned off         | —         | —            | —                 | With `whatsapp_enabled = false`, 5.6 and 5.7 send every role to the start page |

"→ start" = the page is not shown; the browser goes to that role's start page (2.1 / 2.2). In B1 every allowed page shows its title and "This page is not ready yet on the web."
