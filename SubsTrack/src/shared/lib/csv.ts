import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

// RFC-4180 quoting. A customer name with a comma, a quote or a newline in it is
// what corrupts a hand-rolled CSV, so every cell goes through this.
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return (
    "﻿" +
    [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")
  );
}

// Safe on every filesystem, and keeps the period in the name so two exports of
// the same report don't overwrite each other.
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "export";
}

/**
 * Writes a CSV and hands it to the user: the system share sheet on native, a
 * plain download on web (where `expo-sharing` is a no-op).
 *
 * Returns false when the platform has no way to share — the caller surfaces
 * that as an error banner rather than failing silently.
 */
export async function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][],
): Promise<boolean> {
  const name = `${safeName(filename)}.csv`;
  const content = toCsv(headers, rows);

  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  if (!(await Sharing.isAvailableAsync())) return false;

  const dir = new Directory(Paths.cache, "exports");
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, name);
  file.create({ overwrite: true });
  file.write(content);

  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    dialogTitle: name,
    UTI: "public.comma-separated-values-text",
  });
  return true;
}
