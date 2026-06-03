# QA — Subscription Tiers

Covers the Free / Pro / Business tier system: hard limits, feature flags, the Subscription screen, the upgrade / downgrade flow, and the inline `UpgradePromptModal` that fires when a limit is hit.

## Reference code

- Module: [SubsTrack/src/modules/subscription/](../SubsTrack/src/modules/subscription/)
- Service: [TierService.ts](../SubsTrack/src/modules/subscription/services/TierService.ts)
- Store: [subscriptionStore.ts](../SubsTrack/src/modules/subscription/store/subscriptionStore.ts) — also exports `useGraceDays()`
- Screen: [SubscriptionScreen.tsx](../SubsTrack/src/modules/subscription/screens/SubscriptionScreen.tsx)
- Block dialog: [UpgradePromptModal.tsx](../SubsTrack/src/modules/subscription/components/UpgradePromptModal.tsx)
- SQL: `tier_plans` table + `tenants.tier_id` in [sql scripts/script.sql](../sql%20scripts/script.sql)
- SuperAdmin tier editor: [SuperAdmin/src/modules/tier-plans/](../SuperAdmin/src/modules/tier-plans/)

Tier seed values (defaults — editable from SuperAdmin):

| | Free | Pro | Business |
|---|---|---|---|
| max_customers | 30 | 300 | ∞ |
| max_users | 1 | 5 | ∞ |
| max_plans | 3 | ∞ | ∞ |
| max_branches | 1 | 3 | ∞ |
| max_currencies | 0 | ∞ | ∞ |
| multi_currency | ✗ | ✓ | ✓ |
| multi_month plans | ✗ | ✓ | ✓ |
| grace_days | 0 | 3 | 7 |
| $/mo | 0 | 9 | 29 |

---

## 1. Hydration & defaults

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Self-service signup defaults to Free | Sign up a new workspace via `signup-workspace` → `signup-account` | Resulting `tenants.tier_id` row points at the Free tier; SubscriptionScreen shows Free as current |
| 1.2 | SuperAdmin tenant creation defaults to Free | In SuperAdmin Tenants tab → + Add, leave tier picker at default | New tenant lands on Free tier |
| 1.3 | SuperAdmin tenant creation with tier override | Pick Pro in the form before submit | New tenant lands on Pro; `tier_upgraded_at` is null until next change |
| 1.4 | Post-auth init | Log in to SubsTrack | Subscription store populates `tiers`, `currentTier`, `usage` before any screen renders limits |
| 1.5 | Logout resets the store | Log out | `tiers`, `currentTier`, `usage` cleared; next login refreshes everything |

## 2. Customer limit (max_customers)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Under limit — create succeeds | On Free with 0 customers, create one | Customer saved; usage bar reflects 1/30 |
| 2.2 | At limit — block | On Free with 30 customers, open Add Customer form, submit | `UpgradePromptModal` appears with "View plans" CTA; no row inserted |
| 2.3 | Modal "View plans" → Subscription screen | Tap "View plans" in the block modal | Form sheet closes; SubscriptionScreen opens |
| 2.4 | Modal "Not now" | Tap "Not now" | Modal + form sheet close; no upgrade |
| 2.5 | Unlimited tier — Business | On Business, create 31st customer | Succeeds; usage shows `X / ∞` |
| 2.6 | Usage refresh after create | Create a customer | `usage.customers` increments immediately on the Subscription screen |
| 2.7 | Usage refresh after delete | Hard-delete a customer | `usage.customers` decrements |

## 3. Users limit

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Free tier blocks 2nd user | On Free with 1 user (the owner), try to add a staff user | `UpgradePromptModal` appears |
| 3.2 | Pro allows up to 5 | On Pro with 5 users, try to add 6th | Modal appears |
| 3.3 | Business unlimited | Add 10+ users on Business | No block |

## 4. Plans limit

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Free 3 plans cap | Create plans up to 3, then try 4th | Modal on 4th |
| 4.2 | Pro / Business unlimited | Add many plans | No block |

## 5. Branches limit

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Free single-branch cap | On Free with auto-created "Default Branch" (count = 1), try Add Branch | Modal appears |
| 5.2 | Pro allows up to 3 | On Pro with 3 active branches, try 4th | Modal appears |

## 6. Multi-currency gate

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Free hides currency add UX | On Free, open Tenant Settings → currencies | Create flow blocked: `CurrencyFormSheet` triggers `assertMultiCurrency` failure → `UpgradePromptModal` |
| 6.2 | Pro unlocks | Upgrade to Pro, refresh, create a currency | Works |
| 6.3 | Existing currencies preserved on downgrade | On Pro with 1 currency, downgrade to Free | Downgrade is blocked by `canDowngradeTo` because `usage.currencies > Free.maxCurrencies (0)`; user is told to remove the currency first |

## 7. Multi-month plan gate

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Free hides multi-month duration UI | On Free, open PlanFormSheet | Duration preset row + stepper hidden; replaced with "Multi-month plans available on Pro and Business" hint |
| 7.2 | Pro unlocks | Upgrade to Pro, open Plan form | Duration picker visible; can set 3 / 6 / 12 |
| 7.3 | Multi-month payment recording blocked on Free | Manually craft a payment via store with `durationMonths > 1` on Free | `TierLimitError` thrown; modal appears (defensive — UI normally prevents this) |

## 8. Grace days

`useGraceDays()` reads `currentTier.graceDays`. Replaces the prior `DEFAULT_GRACE_DAYS = 0` constant.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Free = 0 | Current month, no payment, on day 1 | Cell renders UNPAID immediately (no grace) |
| 8.2 | Pro = 3 | Same scenario on Pro, day 2 | Cell renders FUTURE (within grace window) |
| 8.3 | Pro = 3, day 5 | Day 5 of current month, no payment | UNPAID (grace expired) |
| 8.4 | Business = 7 | Day 4 of current month on Business | FUTURE |
| 8.5 | Tier swap mid-session | Upgrade Free→Pro while on a customer detail screen | Grid recomputes on next refetch using new graceDays |
| 8.6 | SuperAdmin edits grace_days | SaaS owner changes Free.grace_days = 2 in SuperAdmin | After next login on a Free tenant, the grid honors 2 days of grace |

## 9. Upgrade flow

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Free → Pro instant swap | Subscription screen → Upgrade to Pro → confirm | `tenants.tier_id` updates; `tier_upgraded_at = NOW()`; current tier card highlights Pro |
| 9.2 | Modal close after upgrade | After upgrade succeeds | Confirmation dialog closes; usage bars re-evaluate against Pro limits |
| 9.3 | Concurrent upgrade prevented | Double-tap Upgrade button quickly | Second tap rejected by `if (get().upgrading)` guard |
| 9.4 | Network failure | Disconnect during upgrade | Error rendered via `ErrorBanner`; tier stays at previous value |

## 10. Downgrade flow

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Safe downgrade — usage within target | Business with low usage → Downgrade to Pro | Confirmation dialog → swap succeeds |
| 10.2 | Blocked — too many customers | Business with 500 customers → Downgrade to Free | Dialog lists blockers: "Customers: 500 / 30"; no swap |
| 10.3 | Blocked — multi-currency | Pro with 2 currencies → Downgrade to Free | Dialog: "Currencies: 2 / 0"; no swap. (Currencies must be removed first.) |
| 10.4 | Blocked list dismissal | Tap "OK" on the blockers dialog | Dialog closes; current tier unchanged |

## 11. SuperAdmin tier-plans editor

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | Edit max_customers on Pro | In SuperAdmin → Tier Plans tab → Pro → set max_customers = 250 | Save persists; SubsTrack picks up new limit on next login |
| 11.2 | Flip multi_month off on Pro | Toggle multi_month_plans_enabled → Save | Pro tenants no longer see multi-month UI on next login |
| 11.3 | Set price | Change Pro price_monthly_usd to 12 | SubscriptionScreen tier card shows $12/mo |
| 11.4 | Tier deactivation | Set `active = false` on Business | Business is hidden from the SubscriptionScreen comparison; tenants already on Business remain on Business |

## 12. SuperAdmin manual upgrade

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 12.1 | Manual Free → Business | SuperAdmin → tenant edit → tier dropdown → Business → Save | Tenant's `tier_id` flips to Business; `tier_upgraded_at` updates |
| 12.2 | No-op if tier unchanged | Open edit, keep current tier, save name change | `tier_upgraded_at` does NOT update |

## 13. Edge cases / safety

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 13.1 | RLS — anon reads tier_plans | Hit `tier_plans` from the public signup screen | `SELECT` returns all 3 rows |
| 13.2 | RLS — anon cannot write | Try to `UPDATE tier_plans` with anon key | Denied |
| 13.3 | tier_id FK is RESTRICTed | Try to `DELETE FROM tier_plans WHERE id = <Free.id>` while any tenant uses it | Postgres `23503` foreign_key_violation |
| 13.4 | Reset script | Run `reset.sql` then `script.sql` | Clean rebuild; 3 tier rows seeded with default values |
| 13.5 | Idempotent seed | Run `script.sql` twice | Tier rows preserved (ON CONFLICT DO NOTHING); no duplicates |
