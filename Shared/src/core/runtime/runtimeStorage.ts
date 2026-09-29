import type { StateStorage } from "zustand/middleware";
import { runtimeWhenReady, type Runtime } from "./runtime";

function withRuntime<T>(
  use: (ready: Runtime) => T | Promise<T>,
): T | Promise<T> {
  const ready = runtimeWhenReady();
  return ready instanceof Promise ? ready.then(use) : use(ready);
}

// zustand persist reads storage when the store is created, before startup may run.
export const runtimeStorage: StateStorage = {
  getItem: (key) => withRuntime((ready) => ready.storage.getItem(key)),
  setItem: (key, value) =>
    withRuntime((ready) => ready.storage.setItem(key, value)),
  removeItem: (key) => withRuntime((ready) => ready.storage.removeItem(key)),
};
