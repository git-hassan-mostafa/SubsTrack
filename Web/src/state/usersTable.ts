import type { ActiveFilter, AppUser, PageWindow } from "@shared/core/types";
import userService from "@shared/modules/admin/users/services/UserService";
import type { UserPageQuery, UserRoleFilter } from "@shared/modules/admin/users/utils/types";
import { readAllPages } from "@shared/shared/hooks/loadAllPages";
import {
  createPagedStore,
  EXPORT_PAGE_SIZE,
  pageWindow,
  type PagedQuery,
} from "./createPagedStore";

export interface UserFilters {
  status: ActiveFilter;
  role: UserRoleFilter;
}

function toUserQuery(query: PagedQuery<UserFilters>, window: PageWindow): UserPageQuery {
  return {
    ...window,
    search: query.search,
    status: query.filters.status,
    role: query.filters.role,
    branch: query.branch,
  };
}

export const useUsersTable = createPagedStore<AppUser, UserFilters>(
  (query) => userService.getUserPage(toUserQuery(query, pageWindow(query))),
  { status: "all", role: "all" },
);

export function readAllUsers(query: PagedQuery<UserFilters>): Promise<AppUser[]> {
  return readAllPages(
    (window) => userService.getUserPage(toUserQuery(query, window)),
    EXPORT_PAGE_SIZE,
  );
}
