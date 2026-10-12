import { IS_OFFLINE_CAPABLE } from "../offline/platform";
import { showCrash } from "./crashStore";

interface RejectionTracker {
  allRejections: boolean;
  onUnhandled: (id: number, rejection: unknown) => void;
  onHandled: (id: number) => void;
}

interface HermesRuntime {
  enablePromiseRejectionTracker?: (tracker: RejectionTracker) => void;
}

let installed = false;

// Release builds skip RN's own handler: it closes the app instead of showing Try again.
export function installGlobalErrorHandler(): void {
  if (!IS_OFFLINE_CAPABLE || installed) return;
  installed = true;

  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    showCrash(error, "global_handler");
    if (__DEV__) previousHandler?.(error, isFatal);
  });
  trackUnhandledRejections();
}

// Replaces RN's dev-only tracker, which only printed a warning for a failed promise.
function trackUnhandledRejections(): void {
  const hermes = (globalThis as { HermesInternal?: HermesRuntime })
    .HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, rejection) => showCrash(rejection, "unhandled_rejection"),
    onHandled: () => {},
  });
}
