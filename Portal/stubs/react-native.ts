// The portal is plain web, but SubsTrack's pure modules reach react-native for
// two things only: the repository platform switch and the RTL flag. Everything
// else in the app graph is kept out by importing deep paths, never barrels.
// A stub may fake a platform, never a rule.
export const Platform = {
  OS: "web" as const,
  select: (o: Record<string, unknown>) => o.web ?? o.default,
};

export const I18nManager = {
  isRTL: false,
  forceRTL: () => {},
  allowRTL: () => {},
};

export default { Platform, I18nManager };
