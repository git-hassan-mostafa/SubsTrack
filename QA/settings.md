# Settings — QA Scenarios

Covers the Settings tab: profile card, language switcher (with restart), workspace info row, support row, and logout.

**Reference code:**
- Screen: [SettingsScreen.tsx](SubsTrack/src/modules/settings/screens/SettingsScreen.tsx)
- Language store: [languageStore.ts](SubsTrack/src/core/i18n/languageStore.ts)
- i18n init: [i18n/index.ts](SubsTrack/src/core/i18n/index.ts)
- Locales: [en.json](SubsTrack/src/core/i18n/locales/en.json), [ar.json](SubsTrack/src/core/i18n/locales/ar.json)

---

## 1. Profile card

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Render profile | Open Settings | Avatar (initials, color from username), username, "<role> · <tenant.name>" subtitle |
| 1.2 | Initials | Username "alice" | Avatar shows "AL" (first two chars uppercased — single token name) |
| 1.3 | Initials with multi-word | Username "mary jane" (if allowed) | Avatar shows "MJ" |
| 1.4 | Role text | Admin user | Subtitle "admin · Acme ISP" (role is capitalized via CSS `capitalize`) |
| 1.5 | Tenant name | Look at the subtitle | Reads from `user.tenant.name` (display name, not the tenant_code) |
| 1.6 | Avatar color stability | Same username across sessions | Same color (deterministic from charCode) |
| 1.7 | No user (impossible state) | Force user to be null | Profile card not rendered (check guard) |

## 2. Language switcher

The screen lists every value in `SUPPORTED_LANGUAGES`. Today: English and Arabic.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Default language | Fresh install | English |
| 2.2 | Active language indicator | Look at the row | Active language has the indigo ✓ badge; others show a chevron |
| 2.3 | Tap same language | Tap currently selected language | No-op (no dialog) |
| 2.4 | Tap different language | Tap Arabic | Confirm dialog: "Language" / "The app will restart to apply the new language." |
| 2.5 | Cancel restart | Tap Cancel on the dialog | Dialog closes; language unchanged |
| 2.6 | Confirm restart | Tap OK | App reloads (via expo-updates / DevSettings.reload / window.reload depending on env). After restart, UI is in the new language with RTL applied for Arabic |
| 2.7 | Persistence | After restart | Language persists across app launches (AsyncStorage) |
| 2.8 | Persistence after logout | Logout, login again | Language preference persists (it's not cleared by logout) |
| 2.9 | RTL layout | After switching to Arabic | Layout flips: tab bar order, headers, paddings respect `me-` / `ms-` logical props. Cairo font applied to text |
| 2.10 | LTR after switching back | Arabic → English → restart | LTR layout restored |
| 2.11 | Unsupported value in storage | Manually set storage to `{language: "fr"}` | App should fall back to default (English) without crashing — verify |
| 2.12 | Restart in Expo Go | Run inside Expo Go (no expo-updates) | Falls back to DevSettings.reload — app reloads. Verify |
| 2.13 | Restart on web build | Web target | window.location.reload() fires |
| 2.14 | Network during restart | Disable network, switch language | Local-only operation; works offline |

## 3. Workspace section

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Workspace row | Look at row | Label "Workspace", value = `user.tenant.name` |
| 3.2 | Privacy & data row | Look at row | Label "Privacy & data" — currently no destination; tapping is a no-op |
| 3.3 | Both rows show chevron | Look at right side | Forward chevron icon |

## 4. Support section

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Help center row | Look | Label "Help center" — currently no destination; tap is a no-op |

(Until these placeholder rows have actions, file a finding so testing scope is explicit.)

## 5. Logout

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Logout row | Look | Red "Log Out" with destructive icon |
| 5.2 | Confirm dialog | Tap | Dialog: "Log Out" / "Are you sure you want to log out?" |
| 5.3 | Cancel | Tap Cancel | Dialog closes; user remains signed in |
| 5.4 | Confirm | Tap Log Out | Dialog closes, session cleared, all stores reset, redirected to login screen |
| 5.5 | Offline logout | Disable net, logout | Local state still cleared. User is on login screen |
| 5.6 | Login as different user | After logout, login as someone else | No leftover data from prior user (root layout resets all stores when user becomes null) |

## 6. Layout & accessibility

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Scroll | Long content / small device | ScrollView scrolls smoothly |
| 6.2 | Safe area | iPhone with notch | Padding respects safe area |
| 6.3 | Tab bar visible | While on Settings | Tabs at the bottom: Customers / Admin (if admin) / Settings |
| 6.4 | Touch targets | Each row | At least 44pt high (3.5 × 14 ≈ 49pt with py-3.5) |
| 6.5 | Long username | "averylongusername" | Profile card still renders without overflow |
| 6.6 | Long tenant name | 60-char tenant name | Subtitle truncates or wraps cleanly |

## 7. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Tenant becomes inactive while on Settings | Admin elsewhere flips active = false | User is still on Settings (no live polling). Next app start shows TenantInactiveScreen |
| 7.2 | Deep link to settings without auth | Try to open `/(app)/(tabs)/settings` while logged out | Redirected to login (AppLayout guard) |
| 7.3 | Language switch immediately after login | Login, switch language | Confirm dialog appears, restart works, returns to Customers (initial route) in new language |
| 7.4 | Switch language with unsaved customer form open | Open Add Customer form, leave it, change language | App restarts; the unsaved form is lost — by design |
| 7.5 | Concurrent users in same tenant | Admin updates user's role; user is on Settings | User's profile card still shows old role until next app reload (no live refresh) |
| 7.6 | Language not in any locale file | (Defensive) | Should not occur — SUPPORTED_LANGUAGES is the single source. If a stale value sits in storage, default fallback applies |
