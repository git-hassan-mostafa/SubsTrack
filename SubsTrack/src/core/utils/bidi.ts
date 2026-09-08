const FSI = '\u2068';
const PDI = '\u2069';
const ISOLATES = /[\u2066-\u2069]/g;

// Isolates a value so its own direction cannot reorder what surrounds it — gotcha #137.
export function isolate(value: string): string {
  const clean = value.replace(ISOLATES, '');
  return clean === '' ? clean : `${FSI}${clean}${PDI}`;
}
