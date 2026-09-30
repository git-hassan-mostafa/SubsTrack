import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
const envFile = path.join(web, ".env.speed.local");

// The URLs the apps ship with; the phone's is live, so a speed run must differ.
function shippedUrls() {
  const files = [
    [path.join(web, "../SubsTrack/.env"), "EXPO_PUBLIC_SUPABASE_URL"],
    [path.join(web, "../Portal/.env"), "VITE_SUPABASE_URL"],
  ];
  const urls = new Set();
  for (const [file, key] of files) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${key}=`));
    if (line) urls.add(line.slice(key.length + 1).trim().replace(/\/$/, ""));
  }
  return urls;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing from Web/.env.speed.local`);
  return value;
}

export async function connectToTestProject() {
  if (!existsSync(envFile)) {
    throw new Error(
      "Create Web/.env.speed.local first (see QA/web/customer-status.md).",
    );
  }
  process.loadEnvFile(envFile);
  const url = required("SPEED_SUPABASE_URL").replace(/\/$/, "");
  if (shippedUrls().has(url)) {
    throw new Error(
      "SPEED_SUPABASE_URL is the project the apps ship with. Use the TEST project.",
    );
  }
  const db = createClient(url, required("SPEED_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const email = `${required("SPEED_USERNAME").toLowerCase()}@${required("SPEED_TENANT_CODE").toLowerCase()}.com`;
  const { data, error } = await db.auth.signInWithPassword({
    email,
    password: required("SPEED_PASSWORD"),
  });
  if (error) throw new Error(`Sign in failed: ${error.message}`);
  const { data: profile, error: profileError } = await db
    .from("users")
    .select("id, tenant_id, branch_id, role")
    .eq("id", data.user.id)
    .single();
  if (profileError) throw new Error(profileError.message);
  return { db, url, profile };
}
