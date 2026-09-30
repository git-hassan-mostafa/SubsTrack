# Web — App Shell, Confirm & Form Dialogs — QA Scenarios

Covers the web app's (`Web/`) frame around every signed-in page: the left nav, the header (page title, branch selector, quick actions, user menu), the app-wide confirm dialog, and the form dialog every later page uses. The phone rules are in [../admin-and-navigation.md](../admin-and-navigation.md), [../branches.md](../branches.md) and [../unsaved-changes.md](../unsaved-changes.md); the web must behave the same.

**Reference code:**

- Frame: [AppFrame.tsx](Web/src/app/layout/AppFrame.tsx), [SideNav.tsx](Web/src/app/layout/SideNav.tsx), [AppHeader.tsx](Web/src/app/layout/AppHeader.tsx), [usePageTitle.ts](Web/src/app/layout/usePageTitle.ts)
- Header parts: [BranchSelector.tsx](Web/src/shared/components/BranchSelector.tsx), [QuickActions.tsx](Web/src/app/layout/QuickActions.tsx), [UserMenu.tsx](Web/src/app/layout/UserMenu.tsx)
- Page list (nav section, icon, title, access): [appPages.ts](Web/src/app/routes/appPages.ts)
- Dialogs: [ConfirmDialogHost.tsx](Web/src/shared/components/ConfirmDialogHost.tsx), [FormDialog.tsx](Web/src/shared/components/FormDialog.tsx), guard [useUnsavedChangesGuard.ts](Shared/src/shared/hooks/useUnsavedChangesGuard.ts)
- Session end: [webSession.ts](Web/src/state/webSession.ts)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project.

---

## 1. Left nav

| #   | Scenario                     | Steps                                                         | Expected result                                                                                                             |
| --- | ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Admin (organization-wide)    | Sign in as an admin with no branch                            | Top list: Dashboard, Customers, Sales, Debts, Money received, Expenses, Reports. "Admin" group: Staff, Wallets, Plans, Products, Services, Currencies, Branches, Organization Settings, Audit Log |
| 1.2 | Branch admin                 | Sign in as an admin assigned to a branch                      | Same as 1.1 but **no** Organization Settings and **no** WhatsApp row                                                          |
| 1.3 | Staff user                   | Sign in as role `user`                                        | Only Customers, Sales, Debts, Money received; no "Admin" group heading at all                                               |
| 1.4 | WhatsApp on                  | Tenant with WhatsApp enabled; sign in as organization-wide admin | "WhatsApp" and "WhatsApp messages" rows appear in the Admin group                                                          |
| 1.5 | WhatsApp on, branch admin    | Same tenant, branch admin                                     | "WhatsApp messages" only                                                                                                     |
| 1.6 | Current page is marked       | Click Customers                                               | Customers row is highlighted and bold; its icon is blue; screen readers hear "current page"                                 |
| 1.7 | No page reload               | Click between nav rows with DevTools Network open             | No full document reload (only data requests)                                                                                |
| 1.8 | Organization name            | Look at the top of the nav                                    | Logo + organization name; a very long name is cut with "…", not wrapped                                                    |
| 1.9 | My Wallet not in the nav     | Look for My Wallet                                            | Not in the nav — it is in the user menu (3.3)                                                                               |
| 1.10 | Narrow window               | Make the window narrower than ~900 px                         | Nav hides; a menu icon (tooltip "Open menu") appears left of the title; it opens the nav over the page; picking a row closes it; Esc or a click outside closes it |
| 1.11 | Keyboard                    | Tab from the page start                                       | Focus moves through nav rows in order, with a visible focus ring; Enter opens the page                                     |

## 2. Header

| #   | Scenario                          | Steps                                                         | Expected result                                                                                    |
| --- | --------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2.1 | Page title                        | Open each nav page                                            | Header shows that page's name; the browser tab reads "<page> · Sijil"                                |
| 2.2 | Title after a direct URL          | Type `/admin/branches` in the address bar                    | Title "Branches" (not blank)                                                                       |
| 2.3 | Branch selector shown             | Organization-wide admin, tenant with 2+ active branches      | A "Branch" drop-down: All Branches, each active branch, Unassigned                                  |
| 2.4 | Branch selector hidden            | Branch admin, staff user, or a tenant with 0 or 1 branch     | No drop-down                                                                                       |
| 2.5 | Picking a branch                  | Pick a branch                                                 | The drop-down turns light blue with a blue icon; "All Branches" makes it white again               |
| 2.6 | Branch kept after reload          | Pick a branch, reload the page                                | Same branch still picked                                                                           |
| 2.7 | Branch cleared on log out         | Pick a branch, log out, sign in again                         | Back on All Branches                                                                               |
| 2.8 | Quick actions                     | Look right of the title                                       | No quick-action icons yet — each one appears in the phase that builds its dialog (E1, D2, F2, F3, F4, C2, E3) |

## 3. User menu

| #   | Scenario               | Steps                                          | Expected result                                                                                              |
| --- | ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 3.1 | Button                 | Look at the top right                          | Person icon + your full name + a down arrow                                                                   |
| 3.2 | Profile block          | Open the menu                                  | Full name; "@username · Admin/User/Super Admin"; "organization · branch name" (or "Organization-wide admin") |
| 3.3 | My Wallet              | Menu → My Wallet                               | Goes to `/my-wallet`; title "My Wallet"                                                                        |
| 3.4 | Log out asks first     | Menu → Log Out                                 | Confirm dialog "Log Out" / "Are you sure you want to log out?" with a red "Log Out" button; Cancel has focus  |
| 3.5 | Cancel log out         | In 3.4 press Cancel, or Esc                    | Dialog closes, still signed in                                                                                |
| 3.6 | Confirm log out        | In 3.4 press Log Out                           | Button spins, then `/login`; reload stays signed out                                                          |
| 3.7 | Keyboard               | Tab to the user button, Enter, arrow keys      | Menu opens; arrows move between My Wallet and Log Out; Esc closes and focus returns to the button             |

## 4. Confirm dialog (app-wide)

| #   | Scenario                   | Steps                                                        | Expected result                                                                       |
| --- | -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 4.1 | Look                       | Open any confirm (3.4)                                       | Title, message, Cancel + confirm button; no fade or slide                             |
| 4.2 | Backdrop click             | Click outside the dialog                                     | Same as Cancel                                                                        |
| 4.3 | Busy                       | Confirm on a slow network                                    | Confirm button spins; Cancel, Esc and outside clicks do nothing until it finishes     |
| 4.4 | Screen reader              | Open with a screen reader                                    | Announced as an alert dialog with its title and message                               |

## 5. Form dialog (run on the Branches form, [branches.md](branches.md) §4)

| #   | Scenario                        | Steps                                                  | Expected result                                                                                     |
| --- | ------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 5.1 | Clean close                     | Open a form, change nothing, press X / Cancel / Esc    | Closes at once, no question                                                                         |
| 5.2 | Dirty close asks                | Type in a field, press X                               | "Discard changes?" with "Discard" (red) and "Keep Editing"                                           |
| 5.3 | Keep editing                    | In 5.2 press Keep Editing                              | The form stays open with the typed text                                                             |
| 5.4 | Discard                         | In 5.2 press Discard                                   | The form closes; opening it again shows the saved values                                            |
| 5.5 | Esc and Cancel ask too          | Type, then press Esc; type, then press Cancel          | Both ask like 5.2                                                                                   |
| 5.6 | Backdrop click never closes     | Type or not, click outside the dialog                  | Nothing happens                                                                                     |
| 5.7 | Enter saves                     | Press Enter in a text field                            | Saves (same as the Save button)                                                                     |
| 5.8 | Saving                          | Save on a slow network                                 | Save spins; X, Cancel and Esc do nothing; a second Enter does not save twice                        |
| 5.9 | Error                           | Make the save fail (e.g. a duplicate name)             | Red banner at the top of the form with a friendly message; the form stays open; no toast            |
| 5.10 | Long form                      | A form taller than the window                          | Only the middle scrolls; the title and Save / Cancel stay visible                                   |
| 5.11 | Dirty close in dev mode        | `npm run dev`, Add customer, turn on Customer portal (or type a name), press X, then Cancel | Each asks like 5.2 — never a dead button (StrictMode mounts twice in dev)                   |
