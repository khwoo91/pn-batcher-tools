/// <reference types="wicg-file-system-access" />
import type { BatchFile } from "../types";

export interface FastFolderNode {
  name: string;
  path: string;
  fileCount: number;
  children: FastFolderNode[];
}

/**
 * Creates or retrieves a nested FileSystemDirectoryHandle based on a relative path.
 * E.g., if relativePath is "contents/2025/01_test/LIT" and rootHandle is "kumsung_ischool",
 * it will traverse down and return the FileSystemDirectoryHandle for "LIT".
 */
export async function getNestedDirHandle(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
  isFile = true,
): Promise<FileSystemDirectoryHandle> {
  if (!relativePath) return rootHandle;

  let parts = relativePath.split("/").filter(Boolean);
  if (isFile && parts.length > 0) {
    parts.pop(); // Remove filename if parsing a file path
  }

  // If the first path segment matches the rootHandle's name (case-insensitive), strip it!
  if (parts.length > 0 && parts[0].toLowerCase() === rootHandle.name.toLowerCase()) {
    parts.shift();
  }

  let currentHandle = rootHandle;
  for (const part of parts) {
    try {
      currentHandle = await currentHandle.getDirectoryHandle(part, {
        create: false,
      });
    } catch (e) {
      break;
    }
  }
  return currentHandle;
}

/**
 * Fast directory-only structure scanner.
 * Does NOT call getFile() on files, making directory tree loading instant (sub-100ms) even for 100,000+ files.
 * Ignores hidden system folders like .svn or .git.
 */
export async function scanDirectoryTreeFast(
  dirHandle: FileSystemDirectoryHandle,
  maxDepth = 6,
  currentDepth = 0,
  path = "",
): Promise<FastFolderNode> {
  const nodeName = path ? path.split("/").pop()! : dirHandle.name;
  const node: FastFolderNode = {
    name: nodeName,
    path: path,
    fileCount: 0,
    children: [],
  };

  if (currentDepth > maxDepth) return node;

  try {
    for await (const entry of dirHandle.values()) {
      // Ignore clutter system folders
      if (entry.name === ".svn" || entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }

      try {
        if (entry.kind === "directory") {
          const childPath = path ? `${path}/${entry.name}` : entry.name;
          const childNode = await scanDirectoryTreeFast(
            entry as FileSystemDirectoryHandle,
            maxDepth,
            currentDepth + 1,
            childPath,
          );
          node.children.push(childNode);
          node.fileCount += childNode.fileCount;
        } else if (entry.kind === "file") {
          node.fileCount++;
        }
      } catch (entryErr) {
        // Skip inaccessible items quietly
      }
    }
  } catch (dirErr) {
    // Skip restricted folders quietly
  }

  return node;
}

/**
 * Scans a directory recursively to gather files matching a specific extension, bypassing the output directory if matched.
 * Resilient against permission-restricted or locked subfolders.
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

  const matchAll = extensions.includes("*") || extensions.includes(".*") || extensions.includes("");

  try {
    for await (const entry of dirHandle.values()) {
      if (entry.name === ".svn" || entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }

      try {
        const isMatched =
          entry.kind === "file" &&
          (matchAll || extensions.some((ext) => entry.name.toLowerCase().endsWith(ext)));

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
      } catch (entryErr) {
        console.warn(`Skipping inaccessible entry in ${path}/${entry.name}:`, entryErr);
      }
    }

    if (path === "") {
      fileAccumulator.sort((a, b) =>
        (a.relativePath || a.name).localeCompare(b.relativePath || b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
    }
  } catch (dirErr) {
    console.warn(`Failed to read directory handle ${dirHandle.name}:`, dirErr);
  }
}
