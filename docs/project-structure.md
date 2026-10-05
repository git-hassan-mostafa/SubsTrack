# Project Structure

Trees go stale — when in doubt, file-search. Update on any structure change.

## Workspace top level

`App/`: `CLAUDE.md` (lean core context), `docs/`, `new-features.md` (backlog; mark done when implemented), `Shared/` (types → services → repositories → stores; source only, not a workspace), `SubsTrack/` (tenant Expo app: UI + offline layer), `Web/` (staff desktop, React + Vite + MUI, on Shared services + stores), `Portal/` (read-only customer portal, React + Vite, Shared pure code), `SuperAdmin/` (SaaS-owner Expo app), `tests/` (Jest money rules; own package, never inside SubsTrack/), `sql scripts/` (script.sql schema + RLS, migration.sql one-offs, reset.sql teardown), `Design/`, `QA/`.

`Web/scripts/`: `build-edge.mjs` (bundles Shared code for `customer-status` edge fn), `status-speed/` (seed + speed test, TEST project only).

```
Web/src/
  main.tsx, App.tsx   configureWeb() → i18n → restoreSession() → render
  platform/           Supabase client, configureWeb()
  core/i18n/          web i18n init + web.en.json (web-only keys under web.*)
  app/routes/         appPages.ts (THE page list: path, title, access, icon, nav, component), guards, router
  app/layout/         AppFrame, SideNav, AppHeader, QuickActions + QuickActionDialogs, UserMenu
  app/theme/
  shared/components/  ErrorBanner, FormDialog, ConfirmDialogHost, ReasonConfirmDialog, BranchSelector, BranchPicker, inputs, MoneyText, EmptyState, StatusChip, InfoRows, PanelSection…
  shared/table/       DataTable, RowActionsMenu, BulkActionBar, useTableExport, TableAction, RowLink, ActiveFilterSelect, activeStatusColumn, useBranchColumn
  shared/hooks/       useCopyText (useMoneyPair moved to Shared/src/shared/hooks)
  shared/lib/         downloadCsv, openWhatsApp (+ openWhatsAppAfterSave), copyText
  state/              web-only: createPagedStore + one table store per list (salesTable also exports createSalesTable(customerId), page-owned store), webSession.ts
  modules/<group>/<module>/  pages + dialogs:
    admin/{branches,currencies,services,plans,products,users,audit,billing,tenant-settings}
    customer/{customers,customer-plans,customer-detail (page + details panel),customer-payments (months panel + table)}
    transaction/debts   Debts page (Debtors / All debts / History tabs), DebtorDialog, CustomDebtFormDialog, useDebtDoors + DebtItemsTable; customer page's debts panel
    transaction/sales   Sales page + customer sales page on one SalesTable; useSaleDoors: receipt, record + edit (SaleFormDialog), void, invoice; customer page's sales panel
    ledger/{collect,bill,payment,void,received}  collect, bill + useBillDialog, payment detail, correct + void dialogs, Money received page
    invoicing (receipts) so far
```

Each module has the SAME path in both halves: logic `Shared/src/modules/<group>/<module>/`, screens + components `SubsTrack/src/modules/<group>/<module>/`. Groups: `admin/` (audit, billing, branches, currencies, plans, products, service-catalog, tenant-settings, users), `authentication/` (auth, signup), `customer/` (customers, customer-plans, customer-payments), `transaction/` (sales, debts, expenses, transactions); top-level `dashboard`, `invoicing`, `ledger`, `options`, `reports`, `wallet`, `whatsapp` (+ SubsTrack-only `quick-actions`, `settings`).

---

## Shared

```
Shared/
  package.json   peerDependencies = libs each app resolves ONE copy of
  tsconfig.json  strictest of all consumers (+ erasableSyntaxOnly, noUnused*)
  src/           @shared/* — never imports react-native, expo-*, or app code
    core/types/{index,db}.ts   domain (camelCase) / DB rows (snake_case, never leave a repository)
    core/constants/index.ts
    core/utils/       BaseRepository, currency, date, ids, receiptId, searchTerm, billingMonth, …
    core/runtime/     configureShared() + runtime(), Repositories, createSupabaseRepositories(), runtimeStorage, webCryptoIds, reportException
    core/i18n/        i18next instance + resources + locales/{en,ar}.json (each app inits it)
    core/audit/       buildAuditRow, describe — actor from runtime().actor()
    core/errors/offlineErrors.ts   RequiresConnectionError & co. (i18n only)
    state/            global store, CROSS-MODULE only (slices, immer)
      globalStore.ts        GlobalState + getStore() singleton (globalThis)
      refreshActiveData.ts  post-sync re-fetch — every loaded slice AND module store
      hooks/use<Feature>Slice.ts  one overloaded hook per slice + useGlobalStore
      slices/  auth, billing, branches, currencies, customers, customer-plans, ledger, options, payments, plans, products, sales, services, tenantSettings, users, whatsapp
    modules/<group>/<module>/
      repository/  I<X>Repository.ts (interface) + <X>Repository.ts (Supabase class only)
      services/    pure TS classes; repository only via repositories().x
      utils/       pure rules + mappers (Db* → domain)
      state/       MODULE STORES (dashboard, reports, ledger/collectionsList, expenses, wallet, audit, signup, debts, whatsapp) — out of GlobalState
      hooks/       React-only (no RN): useAuth, useActiveBranches, useOwedChanged, …
    shared/lib/    uiPrefStore, confirmStore + confirm, uiStore, storeReset, session, dataEpoch, branchFilter, csv (toCsv), actionOrder, menuItem, catalogMenu, quickActions, monthSections
    shared/hooks/  useDebounce, useDirtyForm, useHoldRepeat, useUserNames, useEffectiveBranchFilter, loadAllPages, exportRowFormat, useUnsavedChangesGuard (discard-changes prompt, both apps)
```

Key files (`Shared/src/modules/`):
- `customer/customer-payments/`: `utils/monthStatus.ts` (buildMonthGrid / buildCustomerStatus — ONLY month rules), `utils/monthDueRules.ts` (isNotDueYet / isNotLateYet, #83), `services/PaymentService.ts` (pay / void / unskip ORDER gates only), `utils/monthActions.ts` (every month door: click, ⋮ rows, selection, ?quickPay=1), `hooks/useCustomerMonthGrid.ts` (month panel flows, both apps; + useLineGrid, useSkipMonths)
- `customer/customers/utils/`: `customerFilters.ts` (list filters, phone + server), `customerStatusPage.ts` (server filter + sort + paging, customer-status fn), `customerStatusFacts.ts` (compact facts of customer_status_facts())
- `ledger/utils/`: `waterfall.ts` (PURE oldest-first allocation), `openItems.ts` (OpenItem builders), `debtRule.ts` (isDebtItem + balanceUsd; no i18n, bundled by edge fn), `mergeOwed.ts` (stored bills + virtual unpaid months), `collectionFilters.ts` (Money received filter shape → find options, both apps)
- `wallet/utils/custody.ts` (custody chain rules)

---

## SubsTrack

```
SubsTrack/
  app/                Expo Router
    _layout.tsx       root — configurePhone() first; fonts, GestureHandler, KeyboardProvider
    index.tsx         redirect to login or home
    (auth)/           login, signup-organization, signup-account
    (app)/_layout.tsx auth guard (session, tenantActive)
    (app)/(tabs)/     home, customers ([id]/index, [id]/sales), transactions, reports, admin/*, settings — role-aware tab bar in _layout.tsx
  src/platform/       what phone hands to Shared
    configurePhone.ts       configureShared({ supabase, repositories, ids, storage, actor, … })
    offlineRepositories.ts  createOfflineRepositories() — *.offline.ts twins
    phoneIds.ts             expo-crypto adapter for runtime.ids
  src/core/offline/   whole offline layer (docs/offline.md): db/, sync/, bootstrap/, backup/, net/, OfflineBaseRepository.ts, dbLock.ts, batch.ts, scope.ts, platform.ts (IS_OFFLINE_CAPABLE)
  src/core/errorLog/  SQLite error logger (runtime.logException) + global handler
  src/core/i18n/      setup.ts (initI18n, RTL, device language, reload), languageStore, useAppFont
  src/modules/<group>/<module>/   UI ONLY, same paths as Shared/src/modules
    index.ts          barrel: screens, components, UI hooks — never logic
    screens/, components/   e.g. customers/screens/CustomerListScreen.tsx
    hooks/            need RN / expo-router / components (useCollectSheet, …)
    repository/*.offline.ts  SQLite twin of Shared Supabase class
    utils/            presentation only: ledger/kindStyle, ledger/paymentActionIcons, debts/kindIcon, reports/reportColors, expenses/expenseCategoryIcon
  src/shared/components/  Button, Input, AppTextInput, CurrencyInput, AppBottomSheet, FormSheet, PageHeader, ErrorBanner, ConfirmDialog, SelectionBar, … (ui-patterns.md)
  src/shared/hooks/   RN: useTextField, useSelectionBackHandler, useExportRows, useSyncStatus, useSwipeableTabs, useAppUpdate, …
  src/shared/constants/colors.ts  design tokens
  src/shared/lib/     supabase.ts (client), storage.ts, exportCsv, shareFile, clipboard, maps, whatsapp
  supabase/functions/ edge fns (docs/edge-functions.md)
    customer-status/  exact customer tabs; _generated/ (git-ignored) = Shared bundle from Web/scripts/build-edge.mjs
    _shared/          whatsapp/{rules,sijilTemplates}.ts → Shared as @edge/* (zero-import only)
```

---

## SuperAdmin

```
SuperAdmin/
  app/{_layout.tsx, (tabs)/{index.tsx (tenants list), options.tsx (global app options key/value editor: add/update/delete), _layout.tsx}}
  src/core/types/{index,db}.ts, src/core/utils/BaseRepository.ts
  src/modules/{tenants,options}/{repository,services,store,screens,components}   options = global app_options key/value CRUD (e.g. LiraRate)
  src/shared/components/{Button,Input,ErrorBanner,LoadingScreen,EmptyState,ConfirmDialog}
  src/shared/lib/supabaseAdmin.ts   SERVICE_ROLE_KEY (bypasses RLS — full DB access)
```
