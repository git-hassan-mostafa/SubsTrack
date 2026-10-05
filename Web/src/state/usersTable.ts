import type { ActiveFilter, AppUser, PageWindow } from "@shared/core/types";
import userService from "@shared/modules/admin/users/services/UserService";
import type { UserRoleFilter } from "@shared/modules/admin/users/utils/types";
import { matchesActiveFilter } from "@shared/core/utils/activeFilter";
import { rolesForFilter } from "@shared/modules/admin/users/utils/userRules";
import { sharedRowMatchesFilter } from "@shared/shared/lib/branchFilter";
import { createPagedStore, readEveryPage, type PagedQuery } from "./createPagedStore";

export interface UserFilters {
  status: ActiveFilter;
  role: UserRoleFilter;
}

function readUserPage(query: PagedQuery<UserFilters>, window: PageWindow) {
  return userService.getUserPage({
    ...window,
    search: query.search,
    status: query.filters.status,
    role: query.filters.role,
    branch: query.branch,
  });
}

export const useUsersTable = createPagedStore<AppUser, UserFilters>(
  readUserPage,
  { status: "all", role: "all" },
  {
    fits: (user, query) =>
      sharedRowMatchesFilter(user.branchId, query.branch) &&
      matchesActiveFilter(user.active, query.filters.status) &&
      (rolesForFilter(query.filters.role)?.includes(user.role) ?? true),
  },
);

export function readAllUsers(query: PagedQuery<UserFilters>): Promise<AppUser[]> {
  return readEveryPage(readUserPage, query);
}
