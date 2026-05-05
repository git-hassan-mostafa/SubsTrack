export const PAGE_SIZE = 30;

// Keys into the months.* translation namespace — must match locales/en.json and ar.json
export const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

export type MonthKey = (typeof MONTHS)[number];

export const EXPOSED_ROLES: ('admin' | 'user')[] = ['admin', 'user'];
