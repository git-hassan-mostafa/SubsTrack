import { reportException } from "@shared/core/runtime/reportException";

let installed = false;

// Chains to the previous handler, so it only adds logging, never changes crashes.
export function installGlobalErrorHandler(): void {
  if (installed) return;
  installed = true;

  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportException({
      source: "global_handler",
      message: error.message,
      stack: error.stack,
    });
    previousHandler?.(error, isFatal);
  });
}
