import { runtime, type ExceptionInput } from "./runtime";

export function reportException(input: ExceptionInput): void {
  void runtime().logException?.(input);
}
