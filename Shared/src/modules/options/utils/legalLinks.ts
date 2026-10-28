export interface LegalLinks {
  privacy: string;
  terms: string;
  deleteAccount: string;
}

// Paths are fixed by the Website build (Website/vite.config.js).
export function legalLinks(
  websiteUrl: string | null | undefined,
): LegalLinks | null {
  const base = websiteUrl?.trim().replace(/\/+$/, "");
  if (!base) return null;
  return {
    privacy: `${base}/privacy/`,
    terms: `${base}/terms/`,
    deleteAccount: `${base}/delete-account/`,
  };
}
