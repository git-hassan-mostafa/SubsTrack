// Only the offline layer's platform check reaches it (`core/offline/platform`).
export const Platform = {
  OS: "web" as const,
  select: (o: Record<string, unknown>) => o.web ?? o.default,
};
export default { Platform };
