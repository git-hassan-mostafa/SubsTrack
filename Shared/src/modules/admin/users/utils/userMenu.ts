import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";
import { canEditUser, canManageUser, type UserActor } from "./userPermissions";

export type UserActionKey = "edit" | "history" | "deactivate" | "reactivate" | "delete";

export type UserMenuItem = MenuItem<UserActionKey>;

interface UserTarget extends UserActor {
  active: boolean;
}

const MENU: MenuTable<UserActionKey> = {
  edit: { group: "manage", labelKey: "common.edit" },
  history: { group: "history", labelKey: "audit.history" },
  deactivate: { group: "status", labelKey: "users.deactivate", destructive: true },
  reactivate: { group: "status", labelKey: "users.activate" },
  delete: { group: "danger", labelKey: "common.delete", destructive: true },
};

function statusKey(target: UserTarget): UserActionKey {
  return target.active ? "deactivate" : "reactivate";
}

// A row outside the viewer's branch is readable but never writable (RLS).
export function userRowActions(viewer: UserActor, target: UserTarget): UserMenuItem[] {
  const keys: UserActionKey[] = [];
  if (canEditUser(viewer, target)) keys.push("edit");
  keys.push("history");
  if (canManageUser(viewer, target)) keys.push(statusKey(target), "delete");
  return pickMenu(MENU, keys);
}

export function userSelectionActions(
  viewer: UserActor,
  selected: readonly UserTarget[],
): UserMenuItem[] {
  const keys: UserActionKey[] = [];
  const one = selected.length === 1 ? selected[0] : null;
  if (one && canEditUser(viewer, one)) keys.push("edit");
  if (one && canManageUser(viewer, one)) keys.push(statusKey(one));
  if (selected.some((target) => canManageUser(viewer, target))) keys.push("delete");
  return pickMenu(MENU, keys);
}

export interface ManageableSplit<T> {
  manageable: T[];
  skipped: number;
}

// Your own account and anyone you do not outrank drop out of a bulk delete.
export function splitManageable<T extends UserActor>(
  viewer: UserActor,
  selected: readonly T[],
): ManageableSplit<T> {
  const manageable = selected.filter((target) => canManageUser(viewer, target));
  return { manageable, skipped: selected.length - manageable.length };
}
