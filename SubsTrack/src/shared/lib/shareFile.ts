import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export class FileTooLargeError extends Error {
  readonly code = "FILE_TOO_LARGE";
  constructor(readonly size: number) {
    super("file_too_large");
    this.name = "FileTooLargeError";
  }
}

/** Filesystem-safe, keeping the period so two exports never collide. */
export function safeName(name: string): string {
  return (
    name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "export"
  );
}

function exportsDir(): Directory {
  const dir = new Directory(Paths.cache, "exports");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** A fresh empty cache file, ready for `openWriter` or `shareFile`. */
export function newExportFile(baseName: string, ext: string): File {
  const file = new File(exportsDir(), `${safeName(baseName)}.${ext}`);
  file.create({ overwrite: true });
  return file;
}

/** Append-as-you-go — `file.write` cannot append, so big files need a handle. */
export function openWriter(file: File): {
  write: (chunk: string) => void;
  close: () => void;
} {
  const handle = file.open();
  const encoder = new TextEncoder();
  return {
    write: (chunk: string) => handle.writeBytes(encoder.encode(chunk)),
    close: () => handle.close(),
  };
}

/** Hand a file on disk to the OS. False when the platform cannot share. */
export async function shareFile(
  file: File,
  mimeType: string,
  uti?: string,
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle: file.name,
    UTI: uti,
  });
  return true;
}

/** Share sheet on native, plain download on web. */
export async function shareTextFile(
  baseName: string,
  ext: string,
  content: string,
  mimeType: string,
  uti?: string,
): Promise<boolean> {
  const name = `${safeName(baseName)}.${ext}`;

  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  const file = newExportFile(baseName, ext);
  file.write(content);
  return shareFile(file, mimeType, uti);
}

/** Null on cancel; throws before reading — a huge string kills the app. */
export async function pickTextFile(
  mimeType: string,
  maxBytes: number,
): Promise<{ name: string; content: string } | null> {
  let picked: Awaited<ReturnType<typeof File.pickFileAsync>>;
  try {
    picked = await File.pickFileAsync(undefined, mimeType);
  } catch {
    return null;
  }
  const file = (Array.isArray(picked) ? picked[0] : picked) as File | undefined;
  if (!file) return null;
  if (file.size > maxBytes) throw new FileTooLargeError(file.size);
  return { name: file.name, content: await file.text() };
}
