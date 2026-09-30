# Project Structure

> Directory trees for Shared and the apps. Referenced from `CLAUDE.md`.
> These trees go stale easily — when in doubt, derive the current layout with a file search rather than trusting this verbatim. Update this file whenever the structure changes.

## Workspace top level

```
App/
├── CLAUDE.md            # Source-of-truth project context (lean core)
├── docs/                # Detailed reference docs (this folder)
├── new-features.md      # Feature backlog (mark items done when implemented)
├── Shared/              # Logic shared by every app: types → services → repositories → stores (source only, not a workspace)
├── SubsTrack/           # Main tenant-facing Expo app — UI + the offline layer
├── Web/                 # Staff web app for desktop (React + Vite + MUI), uses Shared's services and stores
├── Portal/              # Read-only customer portal (React + Vite), imports Shared's pure code
├── SuperAdmin/          # Internal SaaS-owner admin Expo app
├── tests/               # Jest money-rule tests — its own package, never inside SubsTrack/
├── sql scripts/         # script.sql (schema + RLS), migration.sql (one-offs), reset.sql (teardown)
├── Design/              # Design assets
└── QA/                  # QA materials
```

`Web/scripts/`: `build-edge.mjs` (bundles the Shared code the `customer-status` edge function runs) and `status-speed/` (seed + speed test, TEST project only — `QA/web/customer-status.md`).

`Web/src/`:

```
Web/src/
├── main.tsx, App.tsx      # configureWeb() → i18n → restoreSession() → render
├── platform/              # Supabase client, configureWeb()
├── core/i18n/             # web i18n init + web.en.json (web-only keys under web.*)
├── app/
│   ├── routes/            # appPages.ts (THE page list: path, title, access, icon, nav, component), guards, router
│   ├── layout/            # AppFrame, SideNav, AppHeader, QuickActions + QuickActionDialogs, UserMenu
│   └── theme/
├── shared/
│   ├── components/        # ErrorBanner, FormDialog, ConfirmDialogHost, BranchSelector, BranchPicker, inputs, MoneyText, EmptyState, StatusChip…
│   ├── table/             # DataTable, RowActionsMenu, BulkActionBar, useTableExport, TableAction,
│   │                      #   RowLink, ActiveFilterSelect, activeStatusColumn, useBranchColumn
│   ├── hooks/             # useMoneyPair
│   └── lib/               # downloadCsv, openWhatsApp (+ openWhatsAppAfterSave), copyText
├── state/                 # web-only stores: createPagedStore + one table store per list, webSession.ts
└── modules/<group>/<module>/  # pages + dialogs (admin/{branches,currencies,services,plans,products,users,
                               #   audit,billing,tenant-settings}, customer/{customers,customer-plans},
                               #   ledger/collect (collect dialog + quick action), invoicing (receipts) so far)
```

Each module keeps the SAME folder path in both halves: its logic under
`Shared/src/modules/<group>/<module>/`, its screens and components under
`SubsTrack/src/modules/<group>/<module>/`. Groups: `admin/` (audit, billing,
branches, currencies, plans, products, service-catalog, tenant-settings, users),
`authentication/` (auth, signup), `customer/` (customers, customer-plans,
customer-payments), `transaction/` (sales, debts, expenses, transactions), and
the top-level `dashboard`, `invoicing`, `ledger`, `options`, `reports`,
`wallet`, `whatsapp` (+ SubsTrack-only `quick-actions`, `settings`).

---

## Directory Structure: Shared

```
Shared/
├── package.json                   # peerDependencies = the libraries each app must resolve ONE copy of
├── tsconfig.json                  # strictest of all consumers (+ erasableSyntaxOnly, noUnused*)
└── src/                           # imported as @shared/* — never imports react-native, expo-*, or app code
    ├── core/
    │   ├── types/{index,db}.ts    # domain models (camelCase) / DB rows (snake_case — never leave a repository)
    │   ├── constants/index.ts
    │   ├── utils/                 # BaseRepository, currency, date, ids, receiptId, searchTerm, billingMonth, …
    │   ├── runtime/               # configureShared() + runtime(), Repositories, createSupabaseRepositories(),
    │   │                          #   runtimeStorage, webCryptoIds, reportException
    │   ├── i18n/                  # the i18next instance + resources + locales/{en,ar}.json (each app inits it)
    │   ├── audit/                 # buildAuditRow, describe — the actor comes from runtime().actor()
    │   └── errors/offlineErrors.ts  # RequiresConnectionError & co. (i18n only)
    │
    ├── state/                     # Global store: CROSS-MODULE state only (slice pattern, immer)
    │   ├── globalStore.ts         # GlobalState + getStore() singleton (stashed on globalThis)
    │   ├── refreshActiveData.ts   # post-sync re-fetch — lists every loaded slice AND module store
    │   ├── hooks/use<Feature>Slice.ts  # one overloaded hook per slice + useGlobalStore
    │   └── slices/                # auth, billing, branches, currencies, customers, customer-plans,
    │                              #   ledger, options, payments, plans, products, sales, services,
    │                              #   tenantSettings, users, whatsapp
    │
    ├── modules/<group>/<module>/
    │   ├── repository/            # I<X>Repository.ts (the interface) + <X>Repository.ts (Supabase class only)
    │   ├── services/              # pure TS classes; reach a repository only through repositories().x
    │   ├── utils/                 # pure rules + mappers (Db* → domain)
    │   ├── state/                 # MODULE STORES (dashboard, reports, ledger/collectionsList, expenses,
    │   │                          #   wallet, audit, signup, debts, whatsapp) — out of GlobalState
    │   └── hooks/                 # React-only hooks (no RN): useAuth, useActiveBranches, useOwedChanged, …
    │
    │   Key files:
    │     customer/customer-payments/utils/monthStatus.ts   # buildMonthGrid / buildCustomerStatus — the ONLY month rules
    │     customer/customer-payments/utils/monthDueRules.ts # isNotDueYet / isNotLateYet (#83)
    │     customer/customer-payments/services/PaymentService.ts  # pay / void / unskip ORDER gates only
    │     customer/customers/utils/customerTabs.ts          # the customer list tabs (phone list + server)
    │     customer/customers/utils/customerStatusPage.ts    # server paging of the exact tabs (customer-status function)
    │     customer/customers/utils/customerStatusFacts.ts   # the compact facts customer_status_facts() returns
    │     ledger/utils/waterfall.ts                         # PURE oldest-first allocation
    │     ledger/utils/openItems.ts                         # the OpenItem builders
    │     ledger/utils/debtRule.ts                          # isDebtItem + balanceUsd (no i18n, bundled by the edge function)
    │     ledger/utils/mergeOwed.ts                         # stored bills + virtual unpaid months
    │     wallet/utils/custody.ts                           # the custody chain rules
    │
    └── shared/
        ├── lib/                   # uiPrefStore, confirmStore + confirm, uiStore, storeReset, session,
        │                          #   dataEpoch, branchFilter, csv (toCsv), actionOrder, monthSections
        └── hooks/                 # useDebounce, useDirtyForm, useHoldRepeat, useUserNames,
                                   #   useEffectiveBranchFilter, loadAllPages, exportRowFormat,
                                   #   useUnsavedChangesGuard (the discard-changes prompt, both apps)
```

---

## Directory Structure: SubsTrack

```
SubsTrack/
├── app/                           # Expo Router navigation
│   ├── _layout.tsx                # Root layout — calls configurePhone() first; fonts, GestureHandler, KeyboardProvider
│   ├── index.tsx                  # Entry: redirects to login or home
│   ├── (auth)/                    # login, signup-organization, signup-account
│   └── (app)/
│       ├── _layout.tsx            # Auth guard (session, tenantActive)
│       └── (tabs)/                # home, customers ([id]/index, [id]/sales), transactions, reports,
│                                  #   admin/*, settings — role-aware tab bar in _layout.tsx
│
├── src/
│   ├── platform/                  # what the phone hands to Shared
│   │   ├── configurePhone.ts      # configureShared({ supabase, repositories, ids, storage, actor, … })
│   │   ├── offlineRepositories.ts # createOfflineRepositories() — the *.offline.ts twins
│   │   └── phoneIds.ts            # expo-crypto adapter for runtime.ids
│   │
│   ├── core/
│   │   ├── offline/               # the whole offline layer — see docs/offline.md
│   │   │   ├── db/, sync/, bootstrap/, backup/, net/
│   │   │   ├── OfflineBaseRepository.ts, dbLock.ts, batch.ts, scope.ts
│   │   │   └── platform.ts        # IS_OFFLINE_CAPABLE
│   │   ├── errorLog/              # SQLite error logger (passed as runtime.logException) + global handler
│   │   └── i18n/                  # setup.ts (initI18n, RTL, device language, reload), languageStore, useAppFont
│   │
│   ├── modules/<group>/<module>/  # UI ONLY — same paths as Shared/src/modules
│   │   ├── index.ts               # barrel: screens, components, UI hooks — never logic
│   │   ├── screens/, components/  # e.g. customers/screens/CustomerListScreen.tsx
│   │   ├── hooks/                 # hooks that need RN / expo-router / components (useCollectSheet, …)
│   │   ├── repository/*.offline.ts  # the SQLite twin of the Shared Supabase class
│   │   └── utils/                 # presentation only: ledger/kindStyle, ledger/paymentMenu,
│   │                              #   debts/kindIcon, reports/reportColors, expenses/expenseCategoryIcon
│   │
│   └── shared/
│       ├── components/            # Button, Input, AppTextInput, CurrencyInput, AppBottomSheet, FormSheet,
│       │                          #   PageHeader, ErrorBanner, ConfirmDialog, SelectionBar, … (see ui-patterns.md)
│       ├── hooks/                 # RN hooks: useTextField, useSelection,
│       │                          #   useExportRows, useSyncStatus, useSwipeableTabs, useAppUpdate, …
│       ├── constants/colors.ts    # Design tokens
│       └── lib/                   # supabase.ts (client), storage.ts, exportCsv, shareFile, clipboard, maps, whatsapp
│
└── supabase/
    └── functions/                 # Edge functions — see docs/edge-functions.md
        ├── customer-status/       # exact customer tabs; _generated/ (git-ignored) = the Shared bundle from Web/scripts/build-edge.mjs
        └── _shared/               # whatsapp/{rules,sijilTemplates}.ts reach Shared as @edge/* (zero-import files only)
```

---

## Directory Structure: SuperAdmin

```
SuperAdmin/
├── app/
│   ├── _layout.tsx
│   └── (tabs)/
│       ├── index.tsx          # Tenants list
│       ├── options.tsx        # Global app options (key/value) editor — add/update/delete
│       └── _layout.tsx
└── src/
    ├── core/types/{index,db}.ts
    ├── core/utils/BaseRepository.ts
    ├── modules/
    │   ├── tenants/{repository,services,store,screens,components}
    │   └── options/{repository,services,store,screens,components}     # global app_options key/value CRUD (e.g. LiraRate)
    └── shared/
        ├── components/{Button,Input,ErrorBanner,LoadingScreen,EmptyState,ConfirmDialog}
        └── lib/supabaseAdmin.ts   # Uses SERVICE_ROLE_KEY (bypasses RLS — full DB access)
```
