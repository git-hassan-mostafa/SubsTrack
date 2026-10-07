import en from "@shared/core/i18n/locales/en.json";
import ar from "@shared/core/i18n/locales/ar.json";
import webEn from "../../Web/src/core/i18n/web.en.json";
import webAr from "../../Web/src/core/i18n/web.ar.json";
import portalEn from "../../Portal/src/core/i18n/portal.en.json";
import portalAr from "../../Portal/src/core/i18n/portal.ar.json";

type Tree = { [key: string]: string | Tree };

// a missing Arabic form falls back to the SINGULAR base: "one bill" for 5 bills
const ARABIC_ONLY_FORMS = ["zero", "two", "few", "many"] as const;

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

// a plural may drop {{count}}: Arabic's singular reads "and one other field"
function comparablePlaceholders(text: string, plural: boolean): string {
  const list = placeholdersOf(text);
  return (plural ? list.filter((p) => p !== "count") : list).join(",");
}

function isPluralKey(key: string, english: Map<string, string>): boolean {
  const base = key.replace(/_(zero|one|two|few|many|other)$/, "");
  return english.has(`${key}_other`) || english.has(`${base}_other`);
}

function countPluralBases(english: Map<string, string>): string[] {
  return [...english]
    .filter(([key, text]) => key.endsWith("_other") && text.includes("{{count}}"))
    .map(([key]) => key.slice(0, -"_other".length));
}

function arabicOnlyKeys(english: Map<string, string>): Set<string> {
  return new Set(
    countPluralBases(english).flatMap((base) =>
      ARABIC_ONLY_FORMS.map((form) => `${base}_${form}`),
    ),
  );
}

// TC-TR-*: a key or {{placeholder}} on one side only shows raw on screen
const LOCALE_PAIRS: [string, Tree, Tree][] = [
  ["Shared", en as unknown as Tree, ar as unknown as Tree],
  ["Web", webEn as unknown as Tree, webAr as unknown as Tree],
  ["Portal", portalEn as unknown as Tree, portalAr as unknown as Tree],
];

describe.each(LOCALE_PAIRS)("i18n (%s): the two locales line up", (_name, enTree, arTree) => {
  const english = flatten(enTree);
  const arabic = flatten(arTree);

  it("TC-TR-01 every English key has an Arabic twin", () => {
    expect([...english.keys()].filter((k) => !arabic.has(k))).toEqual([]);
  });

  it("TC-TR-02 no Arabic key is left over", () => {
    const allowed = arabicOnlyKeys(english);
    expect([...arabic.keys()].filter((k) => !english.has(k) && !allowed.has(k))).toEqual([]);
  });

  it("TC-TR-03 both sides interpolate the SAME placeholders", () => {
    const mismatched: string[] = [];
    for (const [key, text] of english) {
      const other = arabic.get(key);
      if (other === undefined) continue;
      const a = comparablePlaceholders(text, isPluralKey(key, english));
      const b = comparablePlaceholders(other, isPluralKey(key, english));
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

  it("TC-TR-05 every counted plural has all of Arabic's plural forms", () => {
    const missing = [...arabicOnlyKeys(english)].filter((k) => !arabic.has(k));
    expect(missing).toEqual([]);
  });
});
