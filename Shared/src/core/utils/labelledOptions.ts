export interface LabelledOption<V extends string> {
  value: V;
  label: string;
}

// A value → i18n key map as picker options, in the map's own order.
export function labelledOptions<V extends string>(
  labels: Record<V, string>,
  t: (key: string) => string,
): LabelledOption<V>[] {
  return (Object.keys(labels) as V[]).map((value) => ({
    value,
    label: t(labels[value]),
  }));
}
