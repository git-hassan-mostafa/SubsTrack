# Authentication — QA Scenarios

Covers the login flow, session restoration, tenant activation gating, and logout. The auth layer wraps every other feature, so every test session begins here.

**Reference code:**
- Screen: [LoginScreen.tsx](SubsTrack/src/modules/auth/screens/LoginScreen.tsx)
- Service: [AuthService.ts](SubsTrack/src/modules/auth/services/AuthService.ts)
- Store: [authStore.ts](SubsTrack/src/modules/auth/store/authStore.ts)
- Tenant inactive screen: [TenantInactiveScreen.tsx](SubsTrack/src/modules/auth/screens/TenantInactiveScreen.tsx)
- Root gate: [_layout.tsx](SubsTrack/app/_layout.tsx)

**Email construction rule:** the login service builds the auth email as `${username}@${tenantCode}.com`, lower-cased and trimmed. Both fields must match what was used when the user was created.

---

## 1. Login screen — render and field state

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | First open of the app, no session | Cold-start the app while logged out | LoadingScreen briefly, then login screen with empty Workspace Code, Username, Password fields |
| 1.2 | Brand and copy | Open login screen | "SubsTrack" logo and "Welcome back" heading visible. Subtitle "Sign in to your workspace to start collecting." visible |
| 1.3 | Sign-in button initial state | Open login screen | Button is disabled while any of the three fields is empty/whitespace-only |
| 1.4 | Sign-in button enabled | Type non-blank Workspace Code, Username and any Password | Button becomes enabled |
| 1.5 | Whitespace-only Workspace Code | Enter only spaces in Workspace Code | Button stays disabled |
| 1.6 | Whitespace-only Username | Enter only spaces in Username | Button stays disabled |
| 1.7 | Empty Password | Type only Workspace Code and Username | Button stays disabled |
| 1.8 | Auto-capitalize / autocorrect off | Tap each field on iOS and Android | Workspace Code, Username and Password do not auto-capitalize and do not show autocorrect suggestions |
| 1.9 | Password masking | Enter characters in Password | Characters render as dots/asterisks; field never reveals plain text |
| 1.10 | Keyboard avoidance | Tap any field on a small device | Keyboard does not cover the focused input; the screen scrolls/lifts (KeyboardAvoidingView) |

## 2. Login — happy path

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Valid admin login | Enter valid Workspace Code, Username, Password for an admin | App navigates to `/(app)/(tabs)/customers`. Bottom tab bar shows Customers, Admin and Settings |
| 2.2 | Valid staff login | Same as 2.1 with a `user` role account | App navigates to Customers tab. Admin tab is HIDDEN from the bottom bar |
| 2.3 | Mixed-case Workspace Code | Enter Workspace Code with capitals (`AcmeISP`) | Login succeeds — the service lowercases before building the email |
| 2.4 | Mixed-case Username | Enter Username with capitals | Login succeeds — username is lowercased |
| 2.5 | Trim leading/trailing spaces | Enter `"  acme "` and `"  alice "` | Login succeeds — trim is applied |
| 2.6 | Loading indicator | Tap Sign In with valid creds on a slow network | Button shows loading spinner; fields stay disabled-feeling until success or error |
| 2.7 | After login: stores hydrated | Log in and immediately open Customers, Admin, Settings | Each screen loads its data without re-prompting login |

## 3. Login — invalid credentials

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Wrong password | Valid Workspace Code & Username, wrong password | Inline error on Password field: "Invalid username or password". Password field value is preserved (not cleared) |
| 3.2 | Wrong username | Valid Workspace Code, unknown Username, any password | Same inline error: "Invalid username or password" |
| 3.3 | Wrong Workspace Code | Wrong Workspace Code, valid Username/Password | Same inline error: "Invalid username or password" (because the email lookup fails) |
| 3.4 | Error clears on edit | After error, type into any field | Error disappears as soon as the user edits a field (`clearError` is called from each onChangeText) |
| 3.5 | Repeated failed attempts | Enter wrong password 5 times in a row | Each attempt shows the same inline error; no lockout banner from the app side. (Backend rate limits are out of scope but should not crash the screen) |
| 3.6 | Network failure during login | Disable internet and tap Sign In | Inline error: "Connection error. Please try again." Button returns to enabled state |
| 3.7 | Slow network then success | Throttle network, tap Sign In, wait | Spinner shows for the full duration; success path runs normally on completion |

## 4. Login — account not configured

Triggered when Supabase auth succeeds but the matching `public.users` row or `tenants` row is missing.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Auth user exists but no profile row | Use credentials of an `auth.users` record with no `public.users` row (test fixture) | A red "Account not configured. Contact your administrator." banner appears at the top. Auth session is signed out automatically |
| 4.2 | Profile exists but tenant row missing | Use a profile whose `tenant_id` references a deleted tenant | Same banner as 4.1, signed out automatically |
| 4.3 | Banner dismissal | Tap × on the banner | Banner closes, fields remain populated, user can retry |
| 4.4 | Re-attempt after fix | After admin fixes the profile, log in again | Login succeeds; banner does not return |

## 5. Tenant inactive

Triggered when the tenant exists but `active = false`.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Login while tenant inactive | Enter valid creds for a user whose tenant is deactivated | Login completes auth-side, then `TenantInactiveScreen` is rendered: lock icon, "Organization Deactivated" title, contact-hint text |
| 5.2 | "Back" button on inactive screen | Tap "‹ Back" | Logs out and returns to the login screen, fields blank |
| 5.3 | Session restore while tenant inactive | Force-quit then re-open app while tenant is inactive | App restores session and routes to `TenantInactiveScreen` (not Customers) |
| 5.4 | Tenant reactivated mid-session | Tenant is flipped to `active = true` while user is on TenantInactiveScreen | User must tap Back, log in again to refresh `tenantActive` (no live polling) |
| 5.5 | No data leakage | While on TenantInactiveScreen | None of the tabs/admin/customers/settings screens are reachable; bottom tab bar is not shown |

## 6. Session restore (cold start)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Cold start with valid session | Log in, force-quit app, re-open | LoadingScreen briefly, then directly to Customers tab. No login screen flash |
| 6.2 | Cold start with expired session | Log in, wait for token expiry, re-open | Login screen shown |
| 6.3 | Cold start with deleted profile | Log in, admin deletes the user's `public.users` row, re-open | Login screen shown (sign-out is called, see AuthService.restoreSession) |
| 6.4 | Cold start with deactivated tenant | Log in, tenant flipped inactive, re-open | TenantInactiveScreen shown |
| 6.5 | Slow restore | Cold start on slow network | LoadingScreen stays visible until restoration finishes; no premature redirect to login |
| 6.6 | Stores cleared on logout | Log out, log back in as a different tenant's user | No customers / plans / users from the previous account leak in (root layout calls reset on all stores when user becomes null) |

## 7. Logout (from Settings)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Logout confirmation | Tap "Log Out" on Settings | Confirm dialog: "Are you sure you want to log out?" |
| 7.2 | Cancel logout | Tap Cancel on the dialog | Dialog closes, user remains signed in |
| 7.3 | Confirm logout | Tap Log Out on the dialog | Returns to login screen, all stores reset |
| 7.4 | Logout while offline | Disable internet, log out | Local session/state still cleared. User lands on login screen even if remote sign-out fails |
| 7.5 | Logout then login as same user | After 7.3, log back in | Customers list is refetched; no stale data shown |
| 7.6 | Logout from admin / customer screens | (No global logout button outside Settings) | Verify there is no other entry point to logout |

## 8. Multi-language at login

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | English locale | App language = English | Labels: "Workspace Code", "Username", "Password", "Sign In" |
| 8.2 | Arabic locale | Switch language to Arabic in Settings, log out | Login screen renders in Arabic with RTL direction. "Sign In" button text in Arabic. Cairo font applied |
| 8.3 | RTL alignment | While in Arabic | Logo + brand row reads right-to-left, input alignment matches RTL |
| 8.4 | Error banner translated | Trigger account-not-configured in Arabic | Banner text appears in Arabic |

## 9. Edge cases & resilience

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Tap Sign In twice fast | Double-tap the button on a slow network | Only one login request is sent (button shows loading and stays disabled while loading) |
| 9.2 | Background app during login | Tap Sign In, immediately background the app | On return, the request completes; success → routed to Customers, error → inline error visible |
| 9.3 | Very long inputs | Paste 500-char strings into each field | Service rejects with "Invalid username or password" without crashing the UI |
| 9.4 | Unicode in username | Enter `mañana@workspace` style values | Backend accepts/rejects normally; UI never crashes |
| 9.5 | Trailing newline pasted | Paste `"alice\n"` | Trim handles newline, login proceeds |
| 9.6 | Field focus while loading | Tap a field while spinner is active | Either ignored or accepts focus but does not allow a second submit |
| 9.7 | Hardware back on Android during login | Press hardware back while spinner is showing | App stays on login (does not crash, does not navigate elsewhere) |
| 9.8 | Login screen behind keyboard on small phone | Open keyboard, scroll | Sign In button remains tappable (KeyboardAvoidingView in effect) |

## 10. Security checks

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Password not in plaintext anywhere | Inspect render and logs while typing | No password value should ever appear in console logs or toasts. `console.log` of error messages must not include the password |
| 10.2 | No auto-fill of password | Reopen login screen after a successful login + logout | Password field is empty (no client-side persistence of password) |
| 10.3 | Logout invalidates session | After 7.3, attempt to call any Supabase endpoint via deeplink | RLS rejects requests; user lands back on login |
| 10.4 | No cross-tenant credential bleed | Log out of tenant A, log into tenant B, check stores | No tenant A customers/plans/users visible (see 6.6) |
