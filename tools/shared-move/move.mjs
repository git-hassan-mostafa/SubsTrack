import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APP_SRC = path.join(APP, "SubsTrack/src");
const SHARED_SRC = path.join(APP, "Shared/src");
const SCAN_ROOTS = [
  "SubsTrack/app",
  "SubsTrack/src",
  "Portal/src",
  "Portal/stubs",
  "tests/suites",
  "tests/helpers",
  "tests/stubs",
  "Shared/src",
];
const CODE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const SPECIFIER =
  /(\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bjest\.(?:mock|doMock|unmock|requireActual|requireMock)\s*\(\s*)(["'])([^"'\n]+)\2/g;

const toPosix = (p) => p.split(path.sep).join("/");
const stripExt = (p) => p.replace(/\.(tsx?|jsx?|mjs|cjs)$/, "");

function readManifest(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((rel) => {
      const from = path.join(APP_SRC, rel);
      if (!fs.existsSync(from)) throw new Error(`Not found: SubsTrack/src/${rel}`);
      return { rel: toPosix(rel), from, to: path.join(SHARED_SRC, rel) };
    });
}

function listCodeFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : listCodeFiles(full);
    }
    return CODE_EXT.includes(path.extname(entry.name)) ? [full] : [];
  });
}

function resolveFile(base) {
  const candidates = [
    base,
    ...CODE_EXT.map((ext) => base + ext),
    ...CODE_EXT.map((ext) => path.join(base, "index" + ext)),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

function resolveSpecifier(spec, importerDir) {
  if (spec.startsWith("@/src/")) return resolveFile(path.join(APP_SRC, spec.slice(6)));
  if (spec.startsWith("@shared/")) return resolveFile(path.join(SHARED_SRC, spec.slice(8)));
  if (spec.startsWith(".")) return resolveFile(path.resolve(importerDir, spec));
  return null;
}

function sharedSpecifier(spec, targetNewPath) {
  const rel = stripExt(toPosix(path.relative(SHARED_SRC, targetNewPath)));
  const pointsAtIndex = rel.endsWith("/index") && !stripExt(spec).endsWith("/index");
  return "@shared/" + (pointsAtIndex ? rel.slice(0, -"/index".length) : rel);
}

function plan(moves) {
  const movedBy = new Map(moves.map((m) => [path.normalize(m.from), m]));
  const errors = [];
  const writes = new Map();

  for (const file of SCAN_ROOTS.flatMap((r) => listCodeFiles(path.join(APP, r)))) {
    const own = movedBy.get(path.normalize(file));
    const source = fs.readFileSync(file, "utf8");
    let changed = 0;
    const next = source.replace(SPECIFIER, (whole, lead, quote, spec) => {
      const target = resolveSpecifier(spec, path.dirname(file));
      if (!target) return whole;
      const targetMove = movedBy.get(path.normalize(target));
      const targetInApp = path.normalize(target).startsWith(path.normalize(APP_SRC));
      if (own && targetInApp && !targetMove) {
        errors.push(`${own.rel} imports "${spec}", which stays in SubsTrack`);
        return whole;
      }
      if (!targetMove) return whole;
      if (own && spec.startsWith(".")) return whole;
      changed++;
      return `${lead}${quote}${sharedSpecifier(spec, targetMove.to)}${quote}`;
    });
    if (changed || own) writes.set(own ? own.to : file, { from: own?.from, text: next, changed });
  }
  return { errors, writes };
}

function gitMove(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  execFileSync("git", ["mv", from, to], { cwd: APP, stdio: "inherit" });
}

// Usage: node tools/shared-move/move.mjs <manifest> [--dry]
function main() {
  const [manifestArg, ...flags] = process.argv.slice(2);
  if (!manifestArg) throw new Error("Usage: node tools/shared-move/move.mjs <manifest> [--dry]");
  const moves = readManifest(path.resolve(manifestArg));
  const { errors, writes } = plan(moves);
  if (errors.length) {
    console.error("Refused - a moved file still needs app code:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  const rewritten = [...writes.values()].filter((w) => w.changed);
  const total = rewritten.reduce((sum, w) => sum + w.changed, 0);
  console.log(`${moves.length} files to move, ${total} imports in ${rewritten.length} files to rewrite`);
  if (flags.includes("--dry")) {
    for (const [file, w] of writes) if (w.changed) console.log(`  ${toPosix(path.relative(APP, file))} (${w.changed})`);
    return;
  }
  for (const move of moves) gitMove(move.from, move.to);
  for (const [file, w] of writes) fs.writeFileSync(file, w.text);
  console.log("Done.");
}

main();
