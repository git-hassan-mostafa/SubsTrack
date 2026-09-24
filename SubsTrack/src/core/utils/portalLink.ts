// The customer portal link carries no secret of its own - it is the customer's
// id, and the password is what gates it. So there is no code to store and none
// to rotate: switching the portal off is what revokes a link that leaked.
export function buildPortalLink(
  baseUrl: string | null,
  customerId: string,
): string | null {
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base || !customerId) return null;
  return `${base}/${customerId}`;
}
