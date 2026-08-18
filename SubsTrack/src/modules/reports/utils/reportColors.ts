import { COLORS } from '@/src/shared/constants';

// One palette for every report breakdown, so the same thing keeps the same
// colour on every card: the three cash streams keep the meanings the rest of
// the app already gives them, and spending is the one warm colour.
export const REPORT_COLORS = {
  subscription: COLORS.primary,
  sale: COLORS.success,
  debt: '#8b5cf6',
  expense: COLORS.warning,
} as const;
