// Bump with a database change older app code must not write through — docs/build-and-release.md.
export const CLIENT_VERSION = 1;

export function isClientOutdated(
  minClientVersion: string | null | undefined,
): boolean {
  const min = Number(minClientVersion?.trim() || NaN);
  return Number.isInteger(min) && min > CLIENT_VERSION;
}
