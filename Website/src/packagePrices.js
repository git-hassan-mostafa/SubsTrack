const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const READ_TIMEOUT_MS = 8000;

// The app_options rows SuperAdminWeb edits; the apps read the same ones (#149k).
const PRICE_KEYS = { 300: "package300usd", 500: "package500usd", 1000: "package1000usd" };

// Blank, bad, zero or negative = no price yet, like the apps' parsePackagePrice.
function parsePrice(raw) {
  if (!raw || !String(raw).trim()) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null;
}

// app_options is readable without login; ilike keeps the apps' case-blind match.
export async function fetchPackagePrices() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/app_options?select=key,value&key=ilike.package*usd`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Package prices could not be read (${response.status})`);
  const rows = await response.json();
  const values = new Map(rows.map((row) => [row.key.toLowerCase(), row.value]));
  return Object.fromEntries(Object.entries(PRICE_KEYS).map(([size, key]) => [size, parsePrice(values.get(key))]));
}
