# Admin Hub & Navigation — QA Scenarios

Covers role-based navigation, the Admin landing screen, tab visibility, and routing edge cases. Multi-tenancy isolation has its own file ([multi-tenancy.md](multi-tenancy.md)).

**Reference code:**
- Tabs layout: [_layout.tsx (tabs)](SubsTrack/app/(app)/(tabs)/_layout.tsx)
- App layout (gates auth/tenant): [_layout.tsx (app)](SubsTrack/app/(app)/_layout.tsx)
- Root layout (session/locale init): [_layout.tsx (root)](SubsTrack/app/_layout.tsx)
- Admin index: [admin/index.tsx](SubsTrack/app/(app)/(tabs)/admin/index.tsx)
- Admin layout: [admin/_layout.tsx](SubsTrack/app/(app)/(tabs)/admin/_layout.tsx)
- useAuth hook: [useAuth.ts](SubsTrack/src/modules/auth/hooks/useAuth.ts)

---

## 1. Tab bar visibility

`isAdmin` = role is `admin` OR `superadmin`.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Admin sees three tabs | Login as admin | Tabs: Customers (default), Admin, Settings |
| 1.2 | User sees two tabs | Login as user | Tabs: Customers, Settings (Admin tab hidden via `href: null`) |
| 1.3 | Superadmin sees admin tab | Login as superadmin | Same as admin |
| 1.4 | Tab order on RTL | Switch to Arabic | Order is reversed visually; Customers should still be the first tab logically |
| 1.5 | Tab icons | Look at icons | people-outline for Customers, shield-outline for Admin, settings-outline for Settings |
| 1.6 | Tab label translation | Switch language | Labels render in the active language |

## 2. Initial route after login

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | After login | Successful login | Redirected to `/(app)/(tabs)/customers` regardless of role |
| 2.2 | Already authenticated landing | Cold start with valid session | Routed to `/(app)/(tabs)/customers` |
| 2.3 | Role change mid-session | Admin changes user's role | The session does not refresh — verify either logout-or-relaunch is required for tab visibility to update |

## 3. Admin landing screen

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Render | Tap Admin tab | Title "Admin", subtitle "Manage your workspace" |
| 3.2 | Compact stats card | See top of screen | Three cells: Collected ($Xk format), Unpaid (red number), Customers (total) |
| 3.3 | Loading on first open | First open with no metrics | ActivityIndicator inside Collected cell |
| 3.4 | Refresh on focus | Switch tabs and back | Metrics refresh |
| 3.5 | Manage menu items | Look at the list | Three rows: Dashboard, Staff, Plans (with member/plan counts) |
| 3.6 | Tap Dashboard | Tap row | Pushes Dashboard screen |
| 3.7 | Tap Staff | Tap row | Pushes Staff list |
| 3.8 | Tap Plans | Tap row | Pushes Plans list |
| 3.9 | Back navigation | Inside Dashboard, tap back | Returns to Admin landing (Stack history) |

## 4. Auth gating

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Unauthenticated to /(app) deeplink | Open `/(app)/(tabs)/customers` while logged out | Redirected to `/(auth)/login` |
| 4.2 | Authenticated to /(auth) deeplink | Open `/(auth)/login` while logged in | Redirected to `/(app)/(tabs)/customers` |
| 4.3 | Inactive tenant to any /(app) route | Login when tenant inactive | TenantInactiveScreen shown for any /(app) deeplink |
| 4.4 | Restoring session | Cold start | LoadingScreen until restore completes; no flicker between login and home |

## 5. Stack navigation inside Admin

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Pushed screens hide native header | All admin sub-screens use `headerShown: false` | Each screen renders its own header |
| 5.2 | Hardware back on Android | Press back on Plans/Users/Dashboard | Returns to Admin landing |
| 5.3 | Swipe back on iOS | Swipe right edge | Same |
| 5.4 | Deep navigation | Admin → Plans → tap plan to edit (modal) → cancel → back | Returns to Plans list, not Admin landing |
| 5.5 | State retention | Open Plans, scroll, navigate to Users, back | Plans scroll position retained (Stack default) |

## 6. Routing edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Unknown deep link | `/some/unknown/path` | Expo Router fallback (404 or splash) — verify reasonable UX |
| 6.2 | Logout during admin route | While on Plans, logout from Settings | Redirected to login; admin stack discarded |
| 6.3 | Re-open after backgrounding on Plans | App in background, return | Plans screen still rendered with cached data |
| 6.4 | Session expiry during admin work | Token expires while on Plans | Next API call surfaces error; on full refresh user is bounced to login. File whether we should detect 401 and auto-bounce |

## 7. Permissions matrix (high level)

| Module / route | Admin | Superadmin | User |
|----------------|-------|------------|------|
| Customers list / detail | ✓ | ✓ | ✓ |
| Customer create / edit | ✓ | ✓ | Create ✓ / Edit ✗ |
| Payments record | ✓ | ✓ | ✓ |
| Payments void | ✓ | ✓ | ⚠ verify gate |
| Plans CRUD | ✓ | ✓ | ✗ (tab hidden) |
| Users (Staff) CRUD | ✓ | ✓ | ✗ |
| Dashboard | ✓ | ✓ | ✗ |
| Settings | ✓ | ✓ | ✓ |

## 8. Internationalization (cross-cutting)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | All visible strings translated | Run app in English then Arabic | Every label maps to a translation. File any English-only string |
| 8.2 | Hardcoded strings | Spot-check screens | Some strings are hardcoded (e.g. "Welcome back", "Add", "Inactive", "Edit", many subtitles). File these as findings if i18n parity is required for production |
| 8.3 | RTL flipping | Arabic | Layouts flip; logical paddings (`me-`, `ms-`) used throughout |
| 8.4 | Cairo font | Arabic | Cairo font applied via `Text.defaultProps` (verify via Settings) |
| 8.5 | Number formatting | Arabic | Currency still formatted with en-US (USD) by default. File whether Arabic numerals are expected |
| 8.6 | Date formatting | Settings → date label | Uses `en-US`. Verify whether it should use the active locale for Arabic |
