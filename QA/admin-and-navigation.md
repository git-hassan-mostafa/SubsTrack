# Admin Hub & Navigation — QA Scenarios

Covers role-based navigation, the Admin landing screen, tab visibility, the action menus across list screens, and routing edge cases. Multi-tenancy isolation has its own file ([multi-tenancy.md](multi-tenancy.md)).

**Reference code:**
- Tabs layout: [_layout.tsx (tabs)](SubsTrack/app/(app)/(tabs)/_layout.tsx)
- App layout (gates auth/tenant): [_layout.tsx (app)](SubsTrack/app/(app)/_layout.tsx)
- Root layout (session/locale init): [_layout.tsx (root)](SubsTrack/app/_layout.tsx)
- Admin index: [admin/index.tsx](SubsTrack/app/(app)/(tabs)/admin/index.tsx)
- Admin layout: [admin/_layout.tsx](SubsTrack/app/(app)/(tabs)/admin/_layout.tsx)
- Admin sub-routes: dashboard, plans, users, branches, currencies, tenant-settings
- useAuth hook: [useAuth.ts](SubsTrack/src/modules/auth/hooks/useAuth.ts)
- ActionMenu (cross-screen): [ActionMenu.tsx](SubsTrack/src/shared/components/ActionMenu.tsx)
- PressableOpacity (touch feedback): [PressableOpacity.tsx](SubsTrack/src/shared/components/PressableOpacity.tsx)

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
| 2.3 | Role change mid-session | Admin changes user's role | Session does not refresh — logout-or-relaunch required for tab visibility to update |

## 3. Admin landing screen

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Render | Tap Admin tab | Title "Admin", subtitle "Manage your workspace" |
| 3.2 | Compact stats card | Top of screen | Cells: Collected (display currency), Unpaid, Customers |
| 3.3 | Loading on first open | First open with no metrics | ActivityIndicator inside Collected cell |
| 3.4 | Refresh on focus | Switch tabs and back | Metrics refresh |
| 3.5 | Manage menu items | Look at the list | Rows for: Dashboard, Tenant Settings, Branches (if multi-branch), Currencies, Plans, Staff. Each with relevant count subtitle |
| 3.6 | Tap Dashboard | Pushes Dashboard screen |
| 3.7 | Tap Tenant Settings | Pushes Tenant Settings screen |
| 3.8 | Tap Branches | Pushes Branches list (if multi-branch UI is on, else verify entry point) |
| 3.9 | Tap Currencies | Pushes Currencies list |
| 3.10 | Tap Plans | Pushes Plans list |
| 3.11 | Tap Staff | Pushes Staff list |
| 3.12 | Back navigation | Inside any sub-screen, tap back | Returns to Admin landing |

## 4. Auth gating

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Unauthenticated to /(app) deeplink | Open `/(app)/(tabs)/customers` while logged out | Redirected to `/(auth)/login` |
| 4.2 | Authenticated to /(auth) deeplink | Open `/(auth)/login` while logged in | Redirected to `/(app)/(tabs)/customers` |
| 4.3 | Inactive tenant to any /(app) route | Login when tenant inactive | TenantInactiveScreen shown |
| 4.4 | Restoring session | Cold start | LoadingScreen until restore completes |

## 5. Stack navigation inside Admin

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Pushed screens hide native header | All admin sub-screens use `headerShown: false` | Each renders its own header |
| 5.2 | Hardware back on Android | Press back on Plans/Users/Dashboard/Branches/Currencies | Returns to Admin landing |
| 5.3 | Swipe back on iOS | Swipe right edge | Same |
| 5.4 | Deep navigation | Admin → Plans → tap plan to edit (modal) → cancel → back | Returns to Plans, not Admin landing |
| 5.5 | State retention | Open Plans, scroll, navigate to Users, back | Plans scroll position retained |

## 6. Routing edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Unknown deep link | `/some/unknown/path` | Expo Router fallback — verify reasonable UX |
| 6.2 | Logout during admin route | While on Plans, logout from Settings | Redirected to login; admin stack discarded |
| 6.3 | Re-open after backgrounding on Plans | App in background, return | Plans screen still rendered with cached data |
| 6.4 | Session expiry during admin work | Token expires while on Plans | Next API call surfaces error; on refresh user is bounced to login |
| 6.5 | QuickPay deeplink | Navigate to `/customers/[id]?quickPay=1` | If logged in: detail screen opens + auto-fires PaymentFormSheet. If logged out: redirect to login |

## 7. Action menu (cross-screen pattern)

`ActionMenu` is reused on Customers, Users, Plans, Branches, Currencies cards. Opened via tap on the ⋮ icon or long-press on the card.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Open via ⋮ | Tap the icon | Modal sheet opens with the entity's name/title and a list of actions |
| 7.2 | Open via long-press | Long-press the card | Same as 7.1 |
| 7.3 | Dismiss | Tap outside / hardware back | Sheet closes without action |
| 7.4 | Destructive actions styling | Look at Delete / Deactivate items | Red icon + text |
| 7.5 | Item ordering | Look at list | Constructive actions first (Pay Now, Edit), state toggles next (Activate/Deactivate), destructive last (Delete) |
| 7.6 | Per-context items | See individual feature files | Customer menu / User menu / Plan menu / Branch menu / Currency menu each have their own item sets — see feature files |
| 7.7 | Loading state per row | Tap a Quick Pay action that fires async work | Card's ⋮ icon shows a spinner while in-flight (see [customers.md § 8.11](customers.md)) |
| 7.8 | Disabled actions | If any action is contextually invalid | Verify display (greyed out or excluded) |

## 8. Touch feedback

App standardized on `PressableOpacity` for tappable elements (per recent `feat: touchable opacity` commit). Cards, menus, list items, buttons all darken/fade on press.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Card touch feedback | Tap a customer/plan/user card | Card has visible opacity-down feedback on press |
| 8.2 | Button touch feedback | Tap any primary button | Same |
| 8.3 | Menu item touch feedback | Tap menu rows | Same |
| 8.4 | RTL touch | Switch to Arabic | Same feedback behavior in RTL |

## 9. Required-field asterisks

Per recent enhancement (`enhancement: add astrisk to required fields`), every form labels required fields with "*".

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Customer form | Open Add Customer | Name and Start Date labels show "*" |
| 9.2 | Plan form | Open Add Plan | Name and Price labels show "*" (Price hidden when Custom Pricing toggled on) |
| 9.3 | User form | Open Add Staff | Full Name, Username, Password, Confirm Password labels show "*". Branch label shows "*" when branch is required |
| 9.4 | Currency form | Open Add Currency | Code, Name, Symbol, Rate, Decimals labels show "*" |
| 9.5 | Branch form | Open Add Branch | Name label shows "*" |
| 9.6 | Payment form | Open Pay Form | Amount field is implicitly required (resolved by scenario) — verify whether labels show "*" |

## 10. Permissions matrix (high level)

| Module / route | Admin | Superadmin | User |
|----------------|-------|------------|------|
| Customers list / detail | ✓ | ✓ | ✓ |
| Customer create | ✓ | ✓ | ✓ |
| Customer edit | ✓ | ✓ | ✓ |
| Customer deactivate / delete | ✓ | ✓ | ✗ |
| Quick Pay | ✓ | ✓ | ✓ |
| Payments record / edit | ✓ | ✓ | ✓ |
| Payments void | ✓ | ✓ | ⚠ verify gate |
| Plans CRUD | ✓ | ✓ | ✗ (tab hidden) |
| Users (Staff) CRUD | ✓ | ✓ | ✗ |
| User delete | Only `user`-role accounts | All | ✗ |
| Branches CRUD | ✓ | ✓ | ✗ |
| Currencies CRUD | ✓ | ✓ | ✗ |
| Tenant Settings (display currency) | ✓ | ✓ | ✗ — N/A from admin tab; settings tab covers user prefs |
| Dashboard | ✓ | ✓ | ✗ |
| Settings (user prefs) | ✓ | ✓ | ✓ |

## 11. Internationalization (cross-cutting)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | All visible strings translated | English then Arabic | Every label maps to a translation. File any English-only string |
| 11.2 | Hardcoded strings | Spot-check screens | File any remaining hardcoded English |
| 11.3 | RTL flipping | Arabic | Layouts flip; logical paddings (`me-`, `ms-`) used throughout |
| 11.4 | Cairo font | Arabic | Cairo applied via `Text.defaultProps` |
| 11.5 | Number formatting | Numbers / currencies | Formatted per active locale (USD via en-US default; LBP / EUR via Intl) |
| 11.6 | Date formatting | All date displays | Locale-aware (see `getDateLocale`) |
| 11.7 | RTL chevrons in multi-month grid | Arabic | Direction-aware via `DirectionalIcon` |
