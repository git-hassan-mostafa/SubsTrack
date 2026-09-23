import { getStore } from "@/src/state/globalStore";
import { bumpDataEpoch } from "./dataEpoch";
import { resetAllDomainStores } from "./storeReset";
import { useUiPrefStore } from "./uiPrefStore";

/** The ONE way a session ends — three half-resets used to disagree (#156). */
export async function endSession(): Promise<void> {
  bumpDataEpoch();
  await getStore().getState().auth.logout();
  resetAllDomainStores();
  useUiPrefStore.getState().reset();
}
