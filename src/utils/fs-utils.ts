/// <reference types="wicg-file-system-access" />
import type { BatchFile } from "../types";

/**
 * Creates or retrieves a nested FileSystemDirectoryHandle based on a relative file path.
 * E.g., if relativePath is "icons/logos/home.svg", it will return the handle for "icons/logos".
 */
export async function getNestedDirHandle(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = relativePath.split("/").filter(Boolean);
  parts.pop(); // Remove the filename to get folder paths

  let currentHandle = rootHandle;
  for (const part of parts) {
    currentHandle = await currentHandle.getDirectoryHandle(part, {
      create: true,
    });
  }
  return currentHandle;
}

/**
 * Scans a directory recursively to gather files matching a specific extension, bypassing the output directory if matched.
 */
export async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  path = "",
  fileAccumulator: BatchFile[] = [],
  extension: string | string[] = ".svg",
  outputDirHandle: FileSystemDirectoryHandle | null = null,
): Promise<void> {
  const extensions = Array.isArray(extension)
    ? extension.map((ext) => ext.toLowerCase())
    : [extension.toLowerCase()];

  for await (const entry of dirHandle.values()) {
    const isMatched = entry.kind === "file" && extensions.some((ext) => entry.name.toLowerCase().endsWith(ext));
    if (isMatched) {
      const file = await (entry as FileSystemFileHandle).getFile();
      fileAccumulator.push({
        name: entry.name,
        file: file,
        relativePath: path ? `${path}/${entry.name}` : entry.name,
        status: "pending",
        selected: true,
      });
    } else if (entry.kind === "directory") {
      let isOutputDir = false;
      if (outputDirHandle) {
        try {
          isOutputDir = await outputDirHandle.isSameEntry(entry);
        } catch (e) {
          isOutputDir = entry.name === outputDirHandle.name;
        }
      }
      if (!isOutputDir) {
        await scanDirectory(
          entry as FileSystemDirectoryHandle,
          path ? `${path}/${entry.name}` : entry.name,
          fileAccumulator,
          extension,
          outputDirHandle,
        );
      }
    }
  }
}

