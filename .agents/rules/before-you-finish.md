---
trigger: always_on
description: SubsTrack work checklist from 13 code reviews — read before starting, run before finishing.
---

# Work checklist (from past reviews)

`AGENTS.md` still rules; this file = the mistakes that kept coming back in review. Every point below happened at least once.

## 1. Before writing code
- **Money work** (charges, collections, plans, prices, price history, write-offs, custody, sales, expenses) → read the `docs/gotchas.md` index + every matching entry, and `docs/domain-notes.md` → Core model. A plan that contradicts a numbered gotcha → stop, say so, never ship silently (#185 was broken this way).
- **New function/hook/component** → search `Shared/src` + both apps for an existing one first.
- **Library behaviour** (React Router, `@expo/ui`, PostgREST, MUI, Supabase) → check its docs/issues for edge cases before relying on it: several instances at once (React Router honours only the newest `useBlocker`), browser history state persisting per entry (POP), sync checks inside calls, error shapes (`.single()` vs `.maybeSingle()`).
- **Global mechanism** (blocker, registry, context, store) → list every EXISTING call site it now affects (e.g. every `navigate()` while a form is open) and check each.

## 2. Design
- Business logic → ONE Shared fn/hook used by phone AND Web. Never in a component, never copied per app, never a hand copy of an existing helper.
- **Two writes that must agree** (plan + price history, money row + audit) → ONE atomic write: Postgres fn `SECURITY INVOKER` online (RLS does tenant/branch), one SQLite transaction offline. Write order or an "undo" write is never enough — ask: what if write 2 fails for a LASTING reason (duplicate name) and for a network reason?
- Validate everything BEFORE the first write; a failed save changes nothing.
- A write returns what it WROTE; the store patches from it, no re-fetch (§5, #119). Repository update matches `id` AND its parent/tenant scope; 0 rows = friendly error, never success.
- Money-changing action → audit row with the entity name + `branch_id`.
- One data shape per value. Widening a type to `T | T[]` forces normalizers everywhere — pick the array, change every caller.
- Errors: `ErrorBanner` (never raw MUI `Alert`), message matches the real failure, a load failure never renders fake data. Slice actions don't borrow another feature's `loading`/`error`.
- Every `t()` key exists in en AND ar.

## 3. Prompts and review feedback
- Follow the INTENT, not only the words: "one place" = one implementation, not one per component.
- A step that clashes with a code comment, a sister service, a gotcha or another step → stop and name the clash; never apply it literally.
- Do EVERY numbered point. Money, docs and QA points count as much as code cleanup; report any point skipped and why.

## 4. Before finishing — run all
- `Shared/` changed → type-check BOTH apps: `cd SubsTrack && node node_modules/typescript/bin/tsc --noEmit` and `cd Web && node node_modules/typescript/bin/tsc -b`. Web lint: `node node_modules/oxlint/bin/oxlint`.
- Money touched → test in `tests/`; `cd tests && node node_modules/jest/bin/jest.js`, all green. A test must fail when the rule breaks (no `undefined === undefined` asserts, spy the real path).
- `monthStatus.ts` / `customerFilters.ts` / `customerStatusPage.ts` or their imports changed → `cd Web && npm run build-edge`, commit `_generated/`, and tell the user `customer-status` must be redeployed BEFORE Web ships. Never hand-edit `_generated/`.
- Request/response shape of any edge function changed → say redeploy order in the final report.
- Sweep the diff: every new/changed fn still used (no dead actions, params, returns, i18n keys, interface methods, fake-repo methods); no leftover normalizer for a type that no longer exists; no duplicate checks or duplicate tests.
- Comments (§1.1): zero inline; declaration comment = one line, says WHY, ≤ ~80 chars. Grep the diff for `//` before finishing.
- Docs: grep `docs/` for every rule, name and behaviour you changed; fix EVERY line now false (`domain-notes.md`, `gotchas.md`, `features.md`, `db-schema.md`, `offline.md`, `ui-patterns.md`). One fact in one doc, pointer elsewhere.
- Money rule changed → one line in the matching `QA/` file.
- DB column changed → `sql scripts/` + `SubsTrack/src/core/offline/db/tables.ts`.
- Stage only this task's files; check `git diff --cached` holds nothing from another task.
- Final report: say what was NOT tested on a device/browser.
