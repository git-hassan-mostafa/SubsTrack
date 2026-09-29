import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APP_SRC = path.join(APP, "SubsTrack/src");
const SHARED_SRC = path.join(APP, "Shared/src");
const ts = createRequire(path.join(APP, "Shared/package.json"))("typescript");
const CODE_EXT = [".ts", ".tsx"];

const toPosix = (p) => p.split(path.sep).join("/");
const stripExt = (p) => p.replace(/\.tsx?$/, "");
const isBarrel = (file) =>
  path.normalize(file).startsWith(path.normalize(APP_SRC)) && /^index\.tsx?$/.test(path.basename(file));
const parsed = new Map();

function parse(file) {
  if (!parsed.has(file)) {
    const text = fs.readFileSync(file, "utf8");
    parsed.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  }
  return parsed.get(file);
}

function resolveFile(base) {
  const candidates = [
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

function specifierFor(file) {
  const inShared = path.normalize(file).startsWith(path.normalize(SHARED_SRC));
  const rel = stripExt(toPosix(path.relative(inShared ? SHARED_SRC : APP_SRC, file)));
  return (inShared ? "@shared/" : "@/src/") + rel;
}

function declaresExport(file, name) {
  return parse(file).statements.some((st) => {
    const exported = ts.getModifiers?.(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) return false;
    if (ts.isVariableStatement(st)) {
      return st.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name);
    }
    return st.name?.text === name;
  });
}

function definingSource(barrel, name) {
  for (const st of parse(barrel).statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    const target = resolveSpecifier(st.moduleSpecifier.text, path.dirname(barrel));
    if (!target) continue;
    if (!st.exportClause) {
      if (declaresExport(target, name)) return { file: target, name };
      if (isBarrel(target)) {
        const found = definingSource(target, name);
        if (found) return found;
      }
      continue;
    }
    if (!ts.isNamedExports(st.exportClause)) continue;
    for (const el of st.exportClause.elements) {
      if (el.name.text !== name) continue;
      const local = el.propertyName?.text ?? el.name.text;
      return isBarrel(target) ? definingSource(target, local) : { file: target, name: local };
    }
  }
  return null;
}

function importText(file, typeOnly, entries) {
  const spec = specifierFor(file);
  const keyword = typeOnly ? "import type" : "import";
  const defaults = entries.filter((e) => e.imported === "default");
  const named = entries
    .filter((e) => e.imported !== "default")
    .map((e) => (e.imported === e.local ? e.local : `${e.imported} as ${e.local}`));
  const lines = [];
  if (typeOnly && defaults.length && named.length) {
    lines.push(...defaults.map((d) => `${keyword} ${d.local} from "${spec}";`));
    defaults.length = 0;
  }
  const parts = [...defaults.map((d) => d.local)];
  if (named.length) parts.push(`{ ${named.join(", ")} }`);
  if (parts.length) lines.push(`${keyword} ${parts.join(", ")} from "${spec}";`);
  return lines.join("\n");
}

function rewrite(file, errors) {
  const source = parse(file);
  const edits = [];
  for (const st of source.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const barrel = resolveSpecifier(st.moduleSpecifier.text, path.dirname(file));
    if (!barrel || !isBarrel(barrel)) continue;
    const clause = st.importClause;
    const bindings = clause?.namedBindings;
    if (!clause || clause.name || (bindings && !ts.isNamedImports(bindings))) {
      errors.push(`${toPosix(path.relative(APP, file))}: default or namespace import of a barrel`);
      continue;
    }
    const groups = new Map();
    for (const el of bindings.elements) {
      const imported = el.propertyName?.text ?? el.name.text;
      const found = definingSource(barrel, imported);
      if (!found) {
        errors.push(`${toPosix(path.relative(APP, file))}: "${imported}" not found behind ${st.moduleSpecifier.text}`);
        continue;
      }
      const typeOnly = clause.isTypeOnly || el.isTypeOnly;
      const key = `${found.file}|${typeOnly}`;
      if (!groups.has(key)) groups.set(key, { file: found.file, typeOnly, entries: [] });
      groups.get(key).entries.push({ imported: found.name, local: el.name.text });
    }
    const text = [...groups.values()].map((g) => importText(g.file, g.typeOnly, g.entries)).join("\n");
    edits.push({ start: st.getStart(), end: st.end, text });
  }
  let next = source.text;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, e.start) + e.text + next.slice(e.end);
  }
  return { changed: edits.length, text: next };
}

function readManifest(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.split("->")[0].trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((rel) => {
      const found = [path.join(APP_SRC, rel), path.join(SHARED_SRC, rel)].find((p) => fs.existsSync(p));
      if (!found) throw new Error(`Not found in SubsTrack/src or Shared/src: ${rel}`);
      return found;
    });
}

// Usage: node tools/shared-move/deep-imports.mjs <manifest> [--dry]
function main() {
  const [manifestArg, ...flags] = process.argv.slice(2);
  if (!manifestArg) throw new Error("Usage: node tools/shared-move/deep-imports.mjs <manifest> [--dry]");
  const errors = [];
  const results = readManifest(path.resolve(manifestArg)).map((file) => ({ file, ...rewrite(file, errors) }));
  if (errors.length) {
    console.error("Refused:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  const changed = results.filter((r) => r.changed);
  for (const r of changed) console.log(`  ${toPosix(path.relative(APP, r.file))} (${r.changed})`);
  console.log(`${changed.length} files with barrel imports`);
  if (flags.includes("--dry")) return;
  for (const r of changed) fs.writeFileSync(r.file, r.text);
  console.log("Done.");
}

main();
