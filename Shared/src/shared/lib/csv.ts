export type CsvValue = string | number | null;

/** A sheet ready to write: one header row plus its rows, already stringified. */
export interface CsvTable {
  headers: string[];
  rows: CsvValue[][];
}

// RFC-4180 quoting — a comma or quote in a name corrupts a hand-rolled CSV
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null)[][],
): string {
  return (
    "\ufeff" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")
  );
}

const DELIMITERS = [",", ";", "\t"] as const;

// Excel in some languages saves with ";" — the header line decides which one.
function delimiterOf(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, "");
  let best: string = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

// RFC-4180 read: quoted cells may hold the delimiter, quotes and line breaks.
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const delimiter = delimiterOf(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"' && value === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
