# App Options & Default Lira Rate — QA Scenarios

A single **global** key/value table `app_options` (NOT tenant-scoped) holds app-wide configuration the SaaS owner controls. The seeded key `LiraRate` is the default USD→LBP exchange rate (LBP per 1 USD). On tenant creation, both creation paths auto-seed a default `LBP` currency for the new tenant whose `rate_per_usd` is copied from `LiraRate`. SuperAdmin owns full CRUD on options; SubsTrack reads them only.

**Reference code:**

- SuperAdmin Options tab: [options.tsx](<SuperAdmin/app/(tabs)/options.tsx>) → [OptionsScreen.tsx](SuperAdmin/src/modules/options/screens/OptionsScreen.tsx)
- SuperAdmin form sheet: [OptionFormSheet.tsx](SuperAdmin/src/modules/options/components/OptionFormSheet.tsx)
- SuperAdmin module: [OptionService.ts](SuperAdmin/src/modules/options/services/OptionService.ts), [optionStore.ts](SuperAdmin/src/modules/options/store/optionStore.ts), [OptionRepository.ts](SuperAdmin/src/modules/options/repository/OptionRepository.ts)
- SuperAdmin tab bar: [_layout.tsx](<SuperAdmin/app/(tabs)/_layout.tsx>)
- LBP seeding (SuperAdmin): [TenantService.ts](SuperAdmin/src/modules/tenants/services/TenantService.ts), [TenantRepository.ts](SuperAdmin/src/modules/tenants/repository/TenantRepository.ts) (`getLiraRate` + `createLbpCurrency`)
- LBP seeding (self-service): [create-tenant/index.ts](SubsTrack/supabase/functions/create-tenant/index.ts)
- SubsTrack read-only module: [OptionService.ts](SubsTrack/src/modules/options/services/OptionService.ts), [OptionRepository.ts](SubsTrack/src/modules/options/repository/OptionRepository.ts), [optionSlice.ts](SubsTrack/src/state/slices/options/optionSlice.ts), [useOptionSlice.ts](SubsTrack/src/state/hooks/useOptionSlice.ts)
- Schema: [script.sql](<sql scripts/script.sql>) (table `app_options`, policy `app_options_select`, seed `LiraRate`)

**DB constraints:**

- `app_options.key` — `NOT NULL UNIQUE`.
- RLS `app_options_select` — `SELECT` granted to `authenticated` only (NOT `anon`). No write policy exists → only the service role (SuperAdmin + `create-tenant` edge function) mutates.
- Seeded LBP currency must satisfy `currencies` constraints: `code = 'LBP'` (matches `^[A-Z]{2,8}$`, ≠ `USD`), `rate_per_usd > 0`, `decimals = 0`.

---

## 0. Critical invariants

1. **`app_options` is global, not tenant-scoped.** No `tenant_id` column; every tenant's authenticated users see the same rows.
2. **SubsTrack never writes options.** The mobile app reads only; the absence of any write RLS policy enforces this even if app code tried to write with the anon/authenticated key.
3. **Default LBP rate is a one-time seed, not a live link.** Editing the global `LiraRate` later does NOT change existing tenants' LBP currency rate — only newly created tenants pick up the new value. Each tenant edits its own LBP rate independently.
4. **A missing/invalid `LiraRate` must never block tenant creation.** Both paths fall back to `DEFAULT_LIRA_RATE = 89000`.
5. **Option keys are immutable after creation.** SuperAdmin's edit form only updates `value` + `description`; the key field is read-only in edit mode.

---

## 1. SuperAdmin — Options tab navigation

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Tab exists | Open SuperAdmin app | A third bottom tab "Options" (gear icon) appears after "Tenants" and "Tier Plans" |
| 1.2 | Tab renders screen | Tap "Options" | OptionsScreen renders with title "Options" and a `+ Add` action in the header |
| 1.3 | Seeded row visible | Fresh DB after running `script.sql` | `LiraRate` row is listed showing value `89000` and its description |
| 1.4 | Refresh on focus | Leave and return to the tab | `fetchOptions` re-runs (RefreshControl spinner on pull-to-refresh) |
| 1.5 | Empty state | DB with all options deleted | EmptyState "No options yet" with the add hint |

## 2. SuperAdmin — Create option

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Open create sheet | Tap `+ Add` | Modal "New Option" with editable Key, Value, Description fields |
| 2.2 | Create valid | Key `SupportPhone`, Value `+961…`, save | Row added to the list (sorted by key), sheet dismisses |
| 2.3 | Duplicate key | Create a second `LiraRate` | DB unique violation surfaces as an inline ErrorBanner; no row added |
| 2.4 | Missing key | Leave Key blank, save | ErrorBanner "Key is required"; sheet stays open |
| 2.5 | Invalid key chars | Key `My Key!`, save | ErrorBanner "Key may only contain letters, numbers, dots, and underscores" |
| 2.6 | Missing value | Key set, Value blank, save | ErrorBanner "Value is required" |
| 2.7 | Optional description | Create with description blank | Saves; card shows no description line |

## 3. SuperAdmin — Update option

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open edit | Tap an option card | Modal "Edit — <key>" pre-filled |
| 3.2 | Key read-only | Try to edit the Key field in edit mode | Key field is not editable; hint "The key cannot be changed after creation." shown |
| 3.3 | Change value | Edit `LiraRate` value `89000` → `90000`, save | Card updates to `90000`; list reflects new value |
| 3.4 | Change description | Edit description, save | Card description updates |
| 3.5 | Validation on edit | Clear Value, save | ErrorBanner "Value is required" |

## 4. SuperAdmin — Delete option

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Delete confirm | Tap "Delete" on a card | ConfirmDialog "Delete option" appears with the key in the message |
| 4.2 | Cancel delete | Tap Cancel | Dialog closes; row remains |
| 4.3 | Confirm delete | Tap Delete in the dialog | Row removed from list; dialog closes |
| 4.4 | Delete LiraRate | Delete the `LiraRate` row, then create a tenant | New tenant still gets an LBP currency at the `DEFAULT_LIRA_RATE = 89000` fallback (no crash) |

## 5. Default LBP currency on tenant creation — SuperAdmin path

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | New tenant via SuperAdmin | Create a tenant from SuperAdmin's Tenants screen | After creation, the tenant has a `currencies` row: code `LBP`, name `Lebanese Pound`, symbol `ل.ل`, decimals `0`, `rate_per_usd` = current `LiraRate` |
| 5.2 | Rate reflects current option | Set `LiraRate` = `91000`, then create a tenant | The new tenant's LBP rate = `91000` |
| 5.3 | Fallback when missing | Delete `LiraRate`, create a tenant | LBP currency created at `89000` |
| 5.4 | Fallback when invalid | Set `LiraRate` value to `abc` (or `0`), create a tenant | LBP currency created at `89000` (invalid/non-positive ignored) |
| 5.5 | Rollback cleanliness | Force a failure after branch/currency creation (e.g. duplicate admin username) | Tenant + Default Branch + LBP currency all rolled back (no orphan currency rows) |
| 5.6 | Default Branch still created | Inspect the new tenant | "Default Branch" row present alongside the LBP currency |

## 6. Default LBP currency on tenant creation — self-service signup path

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Self-service signup | In SubsTrack, "Create a new workspace" → complete both steps | New tenant created and auto-logged in; the tenant has an `LBP` currency seeded from `LiraRate` |
| 6.2 | LBP visible in app | After signup, open Tenant Settings → Currencies | `LBP` listed (note: visible only if the tier permits multi-currency display; the row exists in DB regardless) |
| 6.3 | Fallback on signup | Delete `LiraRate`, then self-service sign up | Signup succeeds; LBP seeded at `89000` (a misconfigured option never blocks signup) |
| 6.4 | Idempotent re-run of script.sql | Re-run `script.sql` after editing `LiraRate` | `INSERT … ON CONFLICT (key) DO NOTHING` preserves the edited value (does not reset to `89000`) |

## 7. SubsTrack — read-only options module

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Primed at login | Login as any user | `optionSlice.items` is populated (options fetched in `primePostAuth` alongside currencies/branches) |
| 7.2 | Cleared at logout | Logout | `optionSlice.reset()` clears `items` |
| 7.3 | Fetch failure is non-fatal | Simulate the options query failing (e.g. table absent pre-migration) | Login still completes; `optionSlice.error` set but app usable (Promise.all does not reject) |
| 7.4 | No write path | (Code review) Confirm SubsTrack `OptionRepository` exposes only `findAll`/`findByKey` — no create/update/delete | SubsTrack cannot mutate options |

## 8. RLS / security

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Authenticated read | As a logged-in SubsTrack user, query `app_options` | Rows returned |
| 8.2 | Anon read blocked | With only the anon key and no session, query `app_options` | No rows (RLS denies anon — unlike `tier_plans`) |
| 8.3 | Authenticated write blocked | Attempt an insert/update/delete on `app_options` with a normal user JWT | Denied (no write policy; only service role bypasses RLS) |
| 8.4 | Service role write | SuperAdmin (service key) and the `create-tenant` edge function | Can read + write freely |
