import { useActiveBranches } from "./useActiveBranches";

/**
 * Single policy gate for whether branch UI should be shown to the user.
 *
 * The branches feature is a "0 or ≥2" experience: with 0 active branches the
 * tenant pre-dates branches and the UI must stay hidden; with exactly 1 (the
 * auto-created Default Branch) the dropdown carries no useful choice so we
 * also hide everything. Only at ≥2 does branch UI become meaningful.
 *
 * Use this in every selector / picker / filter guard so the threshold lives
 * in one place.
 */
export function useIsMultiBranchActive(): boolean {
    return useActiveBranches().length > 1;
}