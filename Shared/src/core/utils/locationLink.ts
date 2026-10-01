// Staff paste a maps share link as typed; a bare "maps.app.goo.gl/…" gets https.
export function locationHref(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  return /^[a-z]+:\/\//i.test(raw) || raw.startsWith("geo:")
    ? raw
    : `https://${raw}`;
}
