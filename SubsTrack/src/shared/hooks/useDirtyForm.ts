import { useState } from "react";

/**
 * "Has the user changed anything?" for a form sheet — pass the result to
 * `FormSheet`'s `dirty` prop and closing the form asks to discard first.
 *
 * Compares the current form values against the values they were **seeded** with
 * (captured once on mount, so an edit form is clean until actually edited and a
 * create form is clean until something is typed). Shallow-compares the object's
 * own keys, which is all the app's form state needs: every field is a string,
 * number, boolean or null.
 *
 * Forms whose fields live in several `useState`s pass a literal snapshot —
 * `useDirtyForm({ name, price, notes })`. Only the VALUES matter, so a fresh
 * object each render is fine; the baseline is what's held.
 *
 * Values that aren't user input (async-loaded data, `submitting` flags, a nested
 * sheet's open flag) must be left OUT — a background load would otherwise mark a
 * form the user never touched as dirty. `ignore` does that for a whole-object
 * form (`useDirtyForm(form, ["currencyId"])`) without hand-spreading the rest.
 *
 * The usual offender is a field a CHILD seeds after mount: `CurrencyInput`
 * applies the last-used currency from an effect, and `SaleItemsEditor` re-reports
 * its cart draft, both one render after the baseline was taken. Compare stable
 * values (or ignore the key) rather than the object identity.
 */
export function useDirtyForm(
  values: Record<string, unknown>,
  ignore?: readonly string[],
): boolean {
  const [initial] = useState(() => ({ ...values }));

  for (const key of Object.keys(values)) {
    if (ignore?.includes(key)) continue;
    if (!Object.is(values[key], initial[key])) return true;
  }
  return false;
}
