import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(__dirname, "../..");
const SHARED_SRC = path.join(APP, "Shared/src");
const EDGE_SHARED = path.join(APP, "SubsTrack/supabase/functions/_shared");

const FORBIDDEN: { rule: string; test: (spec: string) => boolean }[] = [
  { rule: "react-native", test: (s) => /^react-native(\/|-|$)/.test(s) },
  { rule: "@react-native*", test: (s) => s.startsWith("@react-native") },
  { rule: "expo", test: (s) => /^(expo(-|\/|$)|@expo\/)/.test(s) },
  { rule: "app code (@/)", test: (s) => s.startsWith("@/") },
];

// Static imports, re-exports, import(), require() and jest.mock() ids.
function specifiersOf(text: string): string[] {
  const patterns = [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bjest\.mock\s*\(\s*["']([^"']+)["']/g,
  ];
  return patterns.flatMap((re) => [...text.matchAll(re)].map((m) => m[1]));
}

function codeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return codeFiles(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(APP, file).split(path.sep).join("/");

const sharedImports = codeFiles(SHARED_SRC).flatMap((file) =>
  specifiersOf(fs.readFileSync(file, "utf8")).map((spec) => ({ file, spec })),
);

describe("Shared boundary: Shared/src stays platform-free", () => {
  it("TC-SB-01 the scan sees Shared's imports", () => {
    expect(sharedImports.length).toBeGreaterThan(100);
  });

  it("TC-SB-02 never imports React Native, Expo or an app file", () => {
    const offending = sharedImports.flatMap(({ file, spec }) =>
      FORBIDDEN.filter((f) => f.test(spec)).map((f) => `${rel(file)}: "${spec}" (${f.rule})`),
    );
    expect(offending).toEqual([]);
  });

  it("TC-SB-03 a relative import never leaves Shared/src", () => {
    const outside = sharedImports
      .filter(({ spec }) => spec.startsWith("."))
      .filter(({ file, spec }) => {
        const target = path.relative(SHARED_SRC, path.resolve(path.dirname(file), spec));
        return target.startsWith("..") || path.isAbsolute(target);
      })
      .map(({ file, spec }) => `${rel(file)}: "${spec}"`);
    expect(outside).toEqual([]);
  });

  it("TC-SB-04 an @edge/* file Shared reaches has zero imports", () => {
    const targets = [
      ...new Set(
        sharedImports
          .filter(({ spec }) => spec.startsWith("@edge/"))
          .map(({ spec }) => spec.slice("@edge/".length)),
      ),
    ];
    const withImports = targets.filter((target) => {
      const file = [".ts", ".js", "/index.ts"]
        .map((ext) => path.join(EDGE_SHARED, target + ext))
        .find((candidate) => fs.existsSync(candidate));
      if (!file) return true;
      return specifiersOf(fs.readFileSync(file, "utf8")).length > 0;
    });
    expect(targets.length).toBeGreaterThan(0);
    expect(withImports).toEqual([]);
  });
});
