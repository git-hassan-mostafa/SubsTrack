/** The one plan every bill a hand-over settled shares, or null — see gotcha #141. */
export function collectionPlanId(planIds: (string | null | undefined)[]): string | null {
  const first = planIds[0] ?? null;
  return first && planIds.every((id) => (id ?? null) === first) ? first : null;
}
