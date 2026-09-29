import { endSession } from "@shared/shared/lib/session";
import { useBranchesTable } from "./branchesTable";

const WEB_STORE_RESETS: readonly (() => void)[] = [
  () => useBranchesTable.getState().reset(),
];

// The ONE web session end: Shared's reset, then every Web/src/state store.
export async function endWebSession(): Promise<void> {
  await endSession();
  for (const reset of WEB_STORE_RESETS) reset();
}
