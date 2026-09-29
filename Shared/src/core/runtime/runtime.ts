import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser } from "@shared/core/types";

export interface RuntimeIds {
  randomUUID(): string;
  sha1Hex(text: string): Promise<string>;
}

export interface RuntimeStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export type RuntimeActor = Pick<AuthUser, "id" | "tenantId" | "username">;

export type ExceptionSource =
  | "boundary"
  | "global_handler"
  | "repository"
  | "service";

export interface ExceptionInput {
  source: ExceptionSource;
  message: string;
  stack?: string;
  context?: string;
}

// The platform pieces an app hands to Shared once, at startup.
export interface Runtime {
  supabase: SupabaseClient;
  ids: RuntimeIds;
  storage: RuntimeStorage;
  actor(): RuntimeActor | null;
  logException?(input: ExceptionInput): Promise<void>;
}

let configured: Runtime | null = null;
const waiting: ((ready: Runtime) => void)[] = [];

export function configureShared(pieces: Runtime): void {
  configured = pieces;
  for (const resolve of waiting.splice(0)) resolve(pieces);
}

export function runtime(): Runtime {
  if (!configured) {
    throw new Error(
      "Shared runtime is not configured - call configureShared() at app startup",
    );
  }
  return configured;
}

// Expo Router loads route files before the root layout, so a store may ask first.
export function runtimeWhenReady(): Runtime | Promise<Runtime> {
  return configured ?? new Promise((resolve) => waiting.push(resolve));
}
