export const PAGE_SIZE = 30;

export const OFFLINE_PAGE_SIZE = 100;

// Keys into the months.* translation namespace — must match locales/en.json and ar.json
export const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

export type MonthKey = (typeof MONTHS)[number];

export const EXPOSED_ROLES: ('admin' | 'user')[] = ['admin', 'user'];

// Sentinel used in BranchSelector / uiPrefStore to represent the
// "show only unassigned records" filter. Distinct from null (= All Branches).
// Visible only to tenant-wide admins.
export const BRANCH_FILTER_UNASSIGNED = 'unassigned' as const;
export type BranchFilter = string | null | typeof BRANCH_FILTER_UNASSIGNED;
