# Project Structure

> Detailed directory trees for both apps. Referenced from `CLAUDE.md`.
> These trees go stale easily — when in doubt, derive the current layout with a file search rather than trusting this verbatim. Update this file whenever the structure changes.

## Workspace top level

```
App/
├── CLAUDE.md            # Source-of-truth project context (lean core)
├── docs/                # Detailed reference docs (this folder)
│   ├── project-structure.md
│   ├── features.md
│   ├── gotchas.md
│   └── edge-functions.md
├── plan.md              # Full feature specification (source of truth for requirements)
├── new-features.md      # Feature backlog (mark items done when implemented)
├── SubsTrack/           # Main tenant-facing Expo app
├── SuperAdmin/          # Internal SaaS-owner admin Expo app
├── sql scripts/         # script.sql (schema + RLS), reset.sql (teardown)
├── Design/              # Design assets
└── QA/                  # QA materials
```

---

## Directory Structure: SubsTrack

```
SubsTrack/
├── app/                           # Expo Router navigation
│   ├── _layout.tsx                # Root layout (font loading, GestureHandler, KeyboardProvider)
│   ├── index.tsx                  # Entry: redirects to login or home
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx              # Login route (also exposes "Create a new workspace" CTA)
│   │   ├── signup-workspace.tsx   # Step 1 of self-service signup (workspace name + code)
│   │   └── signup-account.tsx     # Step 2 (owner account); creates tenant + auto-logs in
│   └── (app)/
│       ├── _layout.tsx            # Auth guard (checks authStore, tenantActive)
│       └── (tabs)/
│           ├── _layout.tsx        # Bottom tab bar (role-aware)
│           ├── home/
│           │   └── index.tsx      # Home tab (admin only) — renders DashboardScreen
│           ├── admin/
│           │   ├── plans.tsx          # Plans list route
│           │   ├── products.tsx       # Products catalog route (admin-only)
│           │   ├── users.tsx          # Users list route
│           │   ├── subscription.tsx   # Tier comparison + usage + upgrade route
│           │   └── index.tsx          # Admin menu (manage section)
│           ├── customers/
│           │   ├── index.tsx      # Customer list
│           │   └── [id]/
│           │       ├── index.tsx  # Customer detail + payment grid + sales panel
│           │       └── sales.tsx  # All sales for one customer (full paginated list)
│           ├── sales/
│           │   └── index.tsx      # Sales tab — recent sales list + record-sale FAB
│           └── settings/
│               └── index.tsx      # Language & user info
│
├── src/
│   ├── core/                      # Shared — imported by all layers
│   │   ├── types/
│   │   │   ├── index.ts           # Domain models (camelCase)
│   │   │   └── db.ts              # DB row types (snake_case) — never leave repository
│   │   ├── constants/index.ts     # PAGE_SIZE=30, MONTHS array, EXPOSED_ROLES
│   │   ├── utils/
│   │   │   ├── BaseRepository.ts  # Abstract base class; holds supabase client + handleError()
│   │   │   └── date.ts            # toBillingMonth, getCurrentYearMonth, isBeforeStartDate
│   │   └── i18n/
│   │       ├── index.ts           # i18next setup
│   │       ├── languageStore.ts   # Zustand store for language preference
│   │       ├── useAppFont.ts      # Font loader hook (Cairo for Arabic, System for English)
│   │       └── locales/{en,ar}.json
│   │
│   ├── state/                     # Global Zustand store (slice pattern, immer middleware)
│   │   ├── globalStore.ts         # GlobalState + getStore() singleton (stashed on globalThis)
│   │   ├── hooks/
│   │   │   ├── useGlobalStore.ts  # Overloaded wrapper around useStore(getStore(), sel)
│   │   │   └── use<Feature>Slice.ts × 11  # Per-slice overloaded hooks (e.g. useCustomerSlice, useOptionSlice, useGraceDays exported from useSubscriptionSlice)
│   │   └── slices/
│   │       ├── auth/authSlice.ts
│   │       ├── subscription/subscriptionSlice.ts
│   │       ├── customers/customerSlice.ts
│   │       ├── payments/paymentSlice.ts
│   │       ├── plans/planSlice.ts
│   │       ├── users/userSlice.ts
│   │       ├── dashboard/dashboardSlice.ts
│   │       ├── branches/branchSlice.ts
│   │       ├── currencies/currencySlice.ts
│   │       ├── signup/signupSlice.ts
│   │       ├── products/productSlice.ts
│   │       ├── sales/saleSlice.ts
│   │       └── options/optionSlice.ts
│   │
│   ├── modules/                   # Feature modules (state moved out — see src/state/)
│   │   ├── auth/
│   │   │   ├── repository/AuthRepository.ts    # signIn, getSession, getUserProfile, getTenant, signOut
│   │   │   ├── services/AuthService.ts         # login(), restoreSession(), logout()
│   │   │   ├── screens/LoginScreen.tsx         # also routes into the signup flow
│   │   │   ├── screens/TenantInactiveScreen.tsx
│   │   │   └── hooks/useAuth.ts
│   │   │
│   │   ├── signup/                             # public self-service tenant creation
│   │   │   ├── repository/SignupRepository.ts  # calls is_tenant_code_available RPC + create-tenant edge fn
│   │   │   ├── services/SignupService.ts       # workspace + account validation (no Supabase)
│   │   │   ├── components/StepIndicator.tsx    # fillable dot progress (1/2, 2/2)
│   │   │   └── screens/{SignupWorkspaceScreen, SignupAccountScreen}.tsx
│   │   │
│   │   ├── subscription/                       # Tier limits + upgrade flow
│   │   │   ├── repository/SubscriptionRepository.ts  # findAllTiers, getTenantWithTier, countTenantUsage, upgradeTenant
│   │   │   ├── services/TierService.ts         # assertCanCreate/assertMultiCurrency/assertMultiMonth, TierLimitError, canDowngradeTo
│   │   │   ├── screens/SubscriptionScreen.tsx  # 3 tier cards + usage bars + upgrade/downgrade buttons
│   │   │   └── components/{TierCard, UsageBar, TierBadge, UpgradePromptModal}.tsx
│   │   │
│   │   ├── currencies/
│   │   │   ├── repository/CurrencyRepository.ts  # CRUD + countReferences (joins plans + payments)
│   │   │   ├── services/CurrencyService.ts       # validation; deleteCurrency() hard- or soft-deletes
│   │   │   └── components/{CurrencyCard, UsdBaseCard, CurrencyFormSheet}.tsx
│   │   │
│   │   ├── branches/
│   │   │   ├── repository/BranchRepository.ts    # CRUD + countReferences (joins users + customers + plans)
│   │   │   ├── services/BranchService.ts         # validation; deleteBranch() hard- or soft-deletes
│   │   │   ├── hooks/{useActiveBranches, useIsMultiBranchActive}.ts
│   │   │   └── components/{BranchCard, BranchFormSheet}.tsx
│   │   │
│   │   ├── tenant-settings/
│   │   │   └── screens/TenantSettingsScreen.tsx  # admin-only: display currency + branches CRUD + currencies CRUD
│   │   │
│   │   ├── customers/
│   │   │   ├── repository/CustomerRepository.ts
│   │   │   ├── services/CustomerService.ts
│   │   │   ├── screens/CustomerListScreen.tsx
│   │   │   ├── screens/CustomerDetailScreen.tsx
│   │   │   └── components/{CustomerCard, CustomerDetailsCard, CustomerFormSheet}.tsx
│   │   │
│   │   ├── customer-payments/                    # (note: directory name is customer-payments)
│   │   │   ├── repository/PaymentRepository.ts
│   │   │   ├── services/PaymentService.ts        # ← buildMonthGrid() lives here ONLY
│   │   │   └── components/{MonthGrid, MonthCell, YearNavigator, PaymentFormSheet,
│   │   │                    PaymentDetailSheet, VoidSheet, CustomerPaymentPanel}.tsx
│   │   │
│   │   ├── plans/
│   │   │   ├── repository/PlanRepository.ts
│   │   │   ├── services/PlanService.ts
│   │   │   ├── screens/PlanListScreen.tsx
│   │   │   └── components/{PlanCard, PlanFormSheet}.tsx
│   │   │
│   │   ├── users/
│   │   │   ├── repository/UserRepository.ts    # create calls edge function create-user
│   │   │   ├── services/UserService.ts
│   │   │   ├── screens/UserListScreen.tsx
│   │   │   └── components/{UserCard, UserFormSheet}.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── services/DashboardService.ts    # Promise.all() for metrics including monthly sales sum (USD)
│   │   │   ├── screens/DashboardScreen.tsx     # Revenue card now combines subscriptions + sales with sub-breakdown
│   │   │   └── components/MetricCard.tsx
│   │   │
│   │   ├── products/                            # One-off sellable items catalog
│   │   │   ├── repository/ProductRepository.ts # CRUD + countAll + countReferences (sales)
│   │   │   ├── services/ProductService.ts      # validate, createProduct (tier-gated), deleteProduct (soft if referenced)
│   │   │   ├── screens/ProductListScreen.tsx   # admin-only at app/(app)/(tabs)/admin/products.tsx
│   │   │   └── components/{ProductCard, ProductFormSheet}.tsx
│   │   │
│   │   ├── sales/                               # One-off sale ledger (separate from subscription payments)
│   │   │   ├── repository/SaleRepository.ts    # paginated findAll w/ search, findByCustomer, voidSale, totalsForMonth (drift-free USD)
│   │   │   ├── services/SaleService.ts         # createSale snapshots productName + unitAmount + ratePerUsd; voidSale; sumForMonthUsd
│   │   │   ├── hooks/useCustomerSalesList.ts    # paginated customer-scoped sales-list state, independent of saleSlice (avoids Sales-tab collision)
│   │   │   ├── screens/SalesListScreen.tsx          # bottom-tab at app/(app)/(tabs)/sales/index.tsx
│   │   │   ├── screens/CustomerSalesListScreen.tsx  # full per-customer sales list at customers/[id]/sales
│   │   │   └── components/{SaleCard, SaleFormSheet, SaleDetailSheet, CustomerSalesPanel}.tsx
│   │   │
│   │   ├── options/                             # Read-only global app config (key/value)
│   │   │   ├── repository/OptionRepository.ts  # findAll + findByKey (authenticated SELECT only)
│   │   │   └── services/OptionService.ts        # getOptions, getOptionValue, OPTION_KEYS
│   │   │
│   │   └── settings/
│   │       └── screens/SettingsScreen.tsx
│   │
│   └── shared/
│       ├── components/
│       │   ├── Button.tsx, Input.tsx, Text.tsx  # Custom primitives
│       │   ├── CurrencyInput.tsx  # Numeric input + embedded currency dropdown (USD + tenant currencies)
│       │   ├── BranchSelector.tsx # Header chip for tenant-wide admins; self-conceals otherwise
│       │   ├── FormSheet.tsx      # Reusable @gorhom/bottom-sheet wrapper
│       │   ├── ErrorBanner.tsx    # Inline error display (never toast/alert)
│       │   ├── Dropdown.tsx, DatePickerInput.tsx
│       │   ├── AsyncEntityPicker.tsx # Searchable + paginated picker for large entity lists (used for customer picker in SaleFormSheet)
│       │   ├── SearchTextBox.tsx, EmptyState.tsx
│       │   ├── PageHeader.tsx, LoadingScreen.tsx
│       │   ├── ResponsiveContainer.tsx  # Caps + centers body width on wide web/desktop; no-op on phones
│       │   ├── ConfirmDialog.tsx, ErrorBoundary.tsx
│       │   └── DirectionalIcon.tsx  # RTL-aware icon wrapper
│       ├── hooks/useDebounce.ts
│       ├── constants/colors.ts    # Design tokens
│       └── lib/
│           ├── supabase.ts        # Supabase singleton (reads EXPO_PUBLIC_ env vars)
│           ├── storage.ts         # AsyncStorage adapter for Supabase + RTL reload guard
│           ├── uiPrefStore.ts     # Persisted UI prefs (display currency, last-used currency, currentBranchId)
│           └── branchFilter.ts    # resolveBranchFilter(user) / useEffectiveBranchFilter() / applyBranchFilter(query) / ownedRowMatchesFilter(branchId, filter)
│
└── supabase/
    └── functions/                 # Edge functions — see docs/edge-functions.md
        ├── create-user/index.ts
        ├── update-user-password/index.ts
        └── create-tenant/index.ts
```

---

## Directory Structure: SuperAdmin

```
SuperAdmin/
├── app/
│   ├── _layout.tsx
│   └── (tabs)/
│       ├── index.tsx          # Tenants list
│       ├── tier-plans.tsx     # Global Free / Pro / Business tier editor
│       ├── options.tsx        # Global app options (key/value) editor — add/update/delete
│       └── _layout.tsx
└── src/
    ├── core/types/{index,db}.ts
    ├── core/utils/BaseRepository.ts
    ├── modules/
    │   ├── tenants/{repository,services,store,screens,components}
    │   ├── tier-plans/{repository,services,store,screens,components}  # SaaS owner edits the global tier catalog
    │   └── options/{repository,services,store,screens,components}     # global app_options key/value CRUD (e.g. LiraRate)
    └── shared/
        ├── components/{Button,Input,ErrorBanner,LoadingScreen,EmptyState,ConfirmDialog}
        └── lib/supabaseAdmin.ts   # Uses SERVICE_ROLE_KEY (bypasses RLS — full DB access)
```
