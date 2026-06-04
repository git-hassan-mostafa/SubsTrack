import { Branch } from "@/src/core/types";
import { useEffect } from "react";
import { useBranchSlice } from "@/src/state/hooks/useBranchSlice";

/**
 * Returns the tenant's active branches, ensuring they've been loaded.
 *
 * Use this when a screen or form needs to react to "does this tenant have
 * any branches?" — for example UserFormSheet enforces "staff users must be
 * assigned to a branch" only when at least one branch exists.
 *
 * Safe to call from multiple components; `getBranches()` short-circuits when
 * the store is already populated.
 */
export function useActiveBranches(): Branch[] {
    const branches = useBranchSlice((s) => s.items);
    const getBranches = useBranchSlice((s) => s.getBranches);
    useEffect(() => {
        getBranches();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return branches.filter((b) => b.active);
}