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
│   │   ├── login.tsx                 # Login route (also exposes "Create a new organization" CTA)
│   │   ├── signup-organization.tsx   # Step 1 of self-service signup (organization name + code)
│   │   └── signup-account.tsx        # Step 2 (owner account); creates tenant + auto-logs in
│   └── (app)/
│       ├── _layout.tsx            # Auth guard (checks authStore, tenantActive)
│       └── (tabs)/
│           ├── _layout.tsx        # Bottom tab bar (role-aware)
│           ├── home/
│           │   └── index.tsx      # Home tab (admin only) — renders DashboardScreen
│           ├── admin/
│           │   ├── plans.tsx          # Plans list route
│           │   ├── products.tsx       # Products catalog route (admin-only)
│           │   ├── services.tsx       # Service price list route
│           │   ├── users.tsx          # Users list route
│           │   ├── subscription.tsx   # Tier comparison + usage + upgrade route
│           │   └── index.tsx          # Admin menu (manage section)
│           ├── customers/
│           │   ├── index.tsx      # Customer list
│           │   └── [id]/
│           │       ├── index.tsx  # Customer detail + payment grid + sales panel
│           │       └── sales.tsx  # All sales for one customer (full paginated list)
│           ├── transactions/
│           │   └── index.tsx      # Transactions hub tab — renders TransactionsScreen (Sales / Payments / Services segments)
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
│   │   │   └── date.ts            # generic only: toBillingMonth, getCurrentYearMonth, formatDate*
│   │   │                          #   (month due/late rules → customer-payments/utils/monthDueRules.ts)
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
│   │   │   └── use<Feature>Slice.ts × 11  # Per-slice overloaded hooks (e.g. useCustomerSlice, useOptionSlice, useSubscriptionSlice)
│   │   └── slices/
│   │       ├── auth/authSlice.ts
│   │       ├── subscription/subscriptionSlice.ts
│   │       ├── customers/customerSlice.ts
│   │       ├── payments/paymentSlice.ts            # per-customer month-GRID state only (bills + skips + the gate lists)
│   │       ├── ledger/ledgerSlice.ts               # the money: debts view, one customer's owed pool, collect / void / write off
│   │       ├── collections/collectionsListSlice.ts # the paginated money-in history
│   │       ├── plans/planSlice.ts
│   │       ├── users/userSlice.ts
│   │       ├── dashboard/dashboardSlice.ts
│   │       ├── branches/branchSlice.ts
│   │       ├── currencies/currencySlice.ts
│   │       ├── signup/signupSlice.ts
│   │       ├── products/productSlice.ts
│   │       ├── services/serviceSlice.ts
│   │       ├── sales/saleSlice.ts
│   │       ├── ledger/ledgerSlice.ts
│   │       ├── expenses/expenseSlice.ts
│   │       ├── reports/reportsSlice.ts             # period + section filter session, one report at a time
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
│   │   │   ├── services/SignupService.ts       # organization + account validation (no Supabase)
│   │   │   ├── components/StepIndicator.tsx    # fillable dot progress (1/2, 2/2)
│   │   │   └── screens/{SignupOrganizationScreen, SignupAccountScreen}.tsx
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
│   │   │   ├── repository/CustomerRepository.ts   # joins customer_plans(*, plans(*)); no plan_id
│   │   │   ├── services/CustomerService.ts        # createCustomer also creates the initial service line
│   │   │   ├── screens/CustomerListScreen.tsx
│   │   │   ├── screens/CustomerDetailScreen.tsx
│   │   │   └── components/{CustomerCard, CustomerDetailsCard, CustomerFormSheet}.tsx
│   │   │
│   │   ├── customer-plans/                        # service lines (multiple plans per customer)
│   │   │   ├── repository/CustomerPlanRepository.ts
│   │   │   ├── services/CustomerPlanService.ts    # createLine/updateLine/deleteLine + syncLines
│   │   │   └── utils/mapper.ts                     # managed inline from CustomerFormSheet's Plans section
│   │   │
│   │   ├── customer-payments/                    # the MONTH GRID only — money lives in modules/ledger
│   │   │   ├── repository/SkippedMonthRepository.ts  # the one table this module still owns (+ .offline sibling)
│   │   │   ├── services/PaymentService.ts        # ← buildMonthGrid() lives here ONLY. No CRUD: it takes MonthBill[] in
│   │   │   ├── services/SkippedMonthService.ts
│   │   │   ├── utils/monthDueRules.ts            # is a month started / owed / late (isNotDueYet, isNotLateYet) — #83
│   │   │   ├── utils/{payOrder, monthSelection, blockRangeLabel, paymentEntry, mapper, types}.ts
│   │   │   └── components/{MonthGrid, MonthCell, YearNavigator, SkipMonthSheet,
│   │   │                    CustomerPaymentPanel}.tsx
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
│   │   ├── reports/                             # Reports tab (admin-only) — app/(app)/(tabs)/reports/
│   │   │   ├── services/ReportsService.ts      # composes existing services/repos; one query per stream per window
│   │   │   ├── screens/ReportsScreen.tsx       # chrome: PeriodPicker + SegmentedTabs + CSV export
│   │   │   ├── screens/sections/{MoneyReport, DebtsReport}.tsx   # phase 1 (Customers + Staff/Products = phase 2)
│   │   │   ├── hooks/useReportExport.ts        # section → CSV → share sheet
│   │   │   ├── components/{ReportSection, ReportCard, KpiRow, ComparisonPill, BreakdownList, RankedList, CurrencySplit, RecordsSheet}.tsx
│   │   │   └── utils/{types, aggregate, csvRows, reportColors}.ts  # pure aggregation over CashRow[] / ExpenseItem[] (no charts — see features.md)
│   │   │
│   │   ├── products/                            # One-off sellable items catalog
│   │   │   ├── repository/ProductRepository.ts # CRUD + countAll + countReferences (sales)
│   │   │   ├── services/ProductService.ts      # validate, createProduct (tier-gated), deleteProduct (soft if referenced)
│   │   │   ├── screens/ProductListScreen.tsx   # admin-only at app/(app)/(tabs)/admin/products.tsx
│   │   │   └── components/{ProductCard, ProductFormSheet}.tsx
│   │   │
│   │   ├── service-catalog/                     # The LABOUR price list — products' twin, no stock and no cost
│   │   │   ├── repository/ServiceRepository.ts # CRUD + countAll + countReferences (sale_items.service_id) (+ .offline)
│   │   │   ├── services/ServiceCatalogService.ts # validate, create/update, deleteService (soft if referenced). NOT tier-gated
│   │   │   ├── screens/ServiceListScreen.tsx   # at app/(app)/(tabs)/admin/services.tsx
│   │   │   └── components/{ServiceCard, ServiceFormSheet}.tsx  # ServiceFormSheet is also opened inline from a sale line
│   │   │
│   │   ├── transactions/                        # Transactions hub — parent of the Debts/Sales/Expenses segments
│   │   │   └── screens/TransactionsScreen.tsx  # owns chrome + SegmentedTabs (Expenses admin-only). No Services segment: a service is a sale LINE
│   │   │
│   │   ├── sales/                               # One-off sale ledger (separate from subscription payments)
│   │   │   ├── repository/SaleRepository.ts    # paginated findAll w/ search, findByCustomer, voidSale, totalsForMonth (drift-free USD)
│   │   │   ├── services/SaleService.ts         # createSale snapshots the line name + unitAmount + ratePerUsd; voidSale; sumForMonthUsd
│   │   │   ├── utils/saleLines.ts               # PURE: lineName / productLines / savedProductLines / toItemPayload — the ONE narrowing from "a line" to "a line that moves stock"
│   │   │   ├── hooks/useCustomerSalesList.ts    # paginated customer-scoped sales-list state, independent of saleSlice (avoids Sales-tab collision)
│   │   │   ├── screens/SalesPanel.tsx               # Sales segment of the Transactions hub (body only — no page chrome)
│   │   │   ├── screens/CustomerSalesListScreen.tsx  # full per-customer sales list at customers/[id]/sales
│   │   │   └── components/{SaleCard, SaleFormSheet, SaleItemsEditor, SaleDetailSheet, CustomerSalesPanel}.tsx  # SaleItemsEditor: one row = Product | Service (catalog or one-off)
│   │   │
│   │   ├── invoicing/                           # WhatsApp receipt/invoice — a wa.me deep link, no native module
│   │   │   ├── utils/invoiceText.ts             # PURE builders (t arrives in InvoiceContext); owns the whole message format
│   │   │   ├── hooks/useSendInvoice.ts          # gathers ctx from the stores → openWhatsApp; { canSend, sendCollectionInvoice, sendSaleInvoice }
│   │   │   └── components/SendOnWhatsAppButton.tsx  # the app's single green button (+ disabled caption); also used by ContactToUpgradeButton
│   │   │
│   │   ├── ledger/                              # THE MONEY MODEL: charges (owed) + collections (received)
│   │   │   ├── repository/{IChargeRepository, ChargeRepository, ChargeRepository.offline}.ts
│   │   │   ├── repository/{ICollectionRepository, CollectionRepository, CollectionRepository.offline}.ts
│   │   │   ├── services/ChargeService.ts        # bills: raise / correct / void / write off / open items / debts view
│   │   │   ├── services/CollectionService.ts    # money: collect / void / history / wallet passthroughs
│   │   │   ├── services/LedgerService.ts        # "what does this customer owe?" — stored bills + virtual unpaid months
│   │   │   ├── utils/waterfall.ts               # PURE oldest-first allocation (no I/O, no clock)
│   │   │   ├── utils/openItems.ts               # THE debt rule (isDebtItem) + the OpenItem builders
│   │   │   ├── utils/{monthTotals, mapper}.ts
│   │   │   ├── hooks/useCollectSheet.tsx        # the one way a list opens the collect sheet
│   │   │   ├── screens/CollectionsPanel.tsx     # the money-in history (one list, was payments + debt payments)
│   │   │   └── components/{CollectSheet, BillSheet, CollectionCard, CollectionsHistorySheet,
│   │   │                    CollectQuickActionSheet, VoidCollectionDialog, CollectionsVoidDialog,
│   │   │                    AmountCollectedSection}.tsx
│   │   │
│   │   ├── debts/                               # The DEBTS SCREENS. The money model itself is modules/ledger
│   │   │   ├── hooks/useDebtRowActions.ts       # the two corrections a bill takes: void a mistake / write off a loss
│   │   │   ├── screens/DebtsPanel.tsx           # Debts segment of the hub: one row per customer who owes, worst-behind first
│   │   │   └── components/{DebtItemCard, DebtList, DebtorCard, DebtorDetailSheet,
│   │   │                    CustomerDebtsPanel, CustomDebtFormSheet}.tsx   # DebtList = shared body (debtor sheet + customer detail)
│   │   │
│   │   ├── expenses/                            # Money OUT — admin-only (Transactions → Expenses)
│   │   │   ├── repository/ExpenseRepository.ts # the STORED expenses table only (+ .offline sibling); branch scope 'owned'
│   │   │   ├── services/ExpenseService.ts       # composes stored rows + DERIVED stock costs (stock_movements.unit_cost) → ExpenseItem[] + USD summary
│   │   │   ├── utils/expenseCategories.ts       # the one code list → i18n key + Ionicons glyph (dropdown, card, future report)
│   │   │   ├── screens/ExpensesPanel.tsx        # Expenses segment of the hub: date window (this month), category/search chips, month sections
│   │   │   └── components/{ExpenseCard, ExpenseFormSheet}.tsx
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
│       │   ├── AppBottomSheet.tsx # @gorhom/bottom-sheet core — declarative visible/onDismiss bridge (variant "auto"|"full")
│       │   ├── BottomSheetScaffold.tsx # Auto-height popup shell (dropdowns/pickers/menus) on AppBottomSheet
│       │   ├── FormSheet.tsx      # Full-height form/detail sheet shell on AppBottomSheet (replaced the deleted SheetModal)
│       │   ├── bottomSheetInputContext.ts # useSheetTextInput / useSheetScrollView — swap to Gorhom variants inside a sheet
│       │   ├── ErrorBanner.tsx    # Inline error display (never toast/alert)
│       │   ├── Dropdown.tsx, DatePickerInput.tsx
│       │   ├── AsyncEntityPicker.tsx # Searchable + paginated picker for large entity lists (used for customer picker in SaleFormSheet)
│       │   ├── SearchTextBox.tsx, EmptyState.tsx
│       │   ├── PageHeader.tsx, LoadingScreen.tsx
│       │   ├── SelectionBar.tsx      # Page-level selection row (X · "N selected" · icon actions + optional select-all); hosted by PageHeader or inline
│       │   ├── InlineSelectionToolbar.tsx # Compact in-panel twin of SelectionBar (month grid year header, customer detail sales section)
│       │   ├── ResponsiveContainer.tsx  # Caps + centers body width on wide web/desktop; no-op on phones
│       │   ├── SegmentedTabs.tsx    # iOS-style pill segmented control (primary in-page tabs, e.g. the Transactions hub)
│       │   ├── PillTabs.tsx         # Dark-pill toggle row (secondary tabs/filters: customer-list filters, Debts sub-tabs)
│       │   ├── ConfirmDialog.tsx, ErrorBoundary.tsx
│       │   └── DirectionalIcon.tsx  # RTL-aware icon wrapper
│       ├── hooks/useDebounce.ts
│       ├── constants/colors.ts    # Design tokens
│       └── lib/
│           ├── supabase.ts        # Supabase singleton (reads EXPO_PUBLIC_ env vars)
│           ├── storage.ts         # AsyncStorage adapter for Supabase + RTL reload guard
│           ├── uiPrefStore.ts     # Persisted UI prefs (last-used currency, currentBranchId) — display currency is a tenant setting, not here
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
