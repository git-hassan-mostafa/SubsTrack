// Well-known global option keys. Mirrors the rows seeded in script.sql and
// managed from SuperAdmin's Options page. Add new keys here as they are
// introduced so call sites reference a constant, not a magic string.
export const OPTION_KEYS = {
    liraRate: 'LiraRate',
} as const;