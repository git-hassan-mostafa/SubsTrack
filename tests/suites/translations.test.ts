import en from "@/src/core/i18n/locales/en.json";
import ar from "@/src/core/i18n/locales/ar.json";

// TC-TR-* — the two locales must stay the same SHAPE. A key that exists in one
// and not the other renders its own name on screen; a {{placeholder}} that
// exists in one and not the other renders raw braces to the user, which is what
// these catch. Nothing here checks the Arabic wording, only its structure.

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

const english = flatten(en as unknown as Tree);
const arabic = flatten(ar as unknown as Tree);

describe("i18n: the two locales line up", () => {
  it("TC-TR-01 every English key has an Arabic twin", () => {
    expect([...english.keys()].filter((k) => !arabic.has(k))).toEqual([]);
  });

  it("TC-TR-02 no Arabic key is left over", () => {
    expect([...arabic.keys()].filter((k) => !english.has(k))).toEqual([]);
  });

  // A plural form may legitimately drop {{count}} — Arabic's singular reads
  // "and one other field", where the number would be noise — so only the
  // non-count placeholders have to agree on those keys.
  it("TC-TR-03 both sides interpolate the SAME placeholders", () => {
    const mismatched: string[] = [];
    for (const [key, text] of english) {
      const other = arabic.get(key);
      if (other === undefined) continue;
      const plural = english.has(`${key}_plural`) || key.endsWith("_plural");
      const drop = (list: string[]) =>
        plural ? list.filter((p) => p !== "count") : list;
      const a = drop(placeholdersOf(text)).join(",");
      const b = drop(placeholdersOf(other)).join(",");
      if (a !== b) mismatched.push(`${key}: en=[${a}] ar=[${b}]`);
    }
    expect(mismatched).toEqual([]);
  });

  it("TC-TR-04 no string is left empty in either locale", () => {
    const empty = [...english.keys()].filter(
      (k) => !english.get(k)?.trim() || !arabic.get(k)?.trim(),
    );
    expect(empty).toEqual([]);
  });
});
