/// <reference types="wicg-file-system-access" />
import type {
  BatchFile,
  BrokenLinkItem,
  UnusedFileItem,
  CleanScanResult,
} from "../types";
import { getNestedDirHandle } from "../utils/fs-utils";

/**
 * Normalizes file path to forward slashes and removes leading slashes/dots.
 */
export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, "/").trim();
  p = p.replace(/^\.\//, "");
  return p;
}

/**
 * Resolves a relative link path against a base file's directory path.
 */
export function resolveRelativePath(baseFilePath: string, relativeLink: string): string {
  if (!relativeLink) return "";

  // Strip query params or hash tags (e.g., image.png?v=1.0#crop)
  let cleanLink = relativeLink.split("?")[0].split("#")[0].trim();
  try {
    cleanLink = decodeURIComponent(cleanLink);
  } catch (e) {
    // Ignore URI malformed error
  }
  cleanLink = normalizePath(cleanLink);

  if (!cleanLink) return "";

  // If path is root relative (starts with /), treat as project relative
  if (cleanLink.startsWith("/")) {
    return cleanLink.slice(1);
  }

  const baseParts = normalizePath(baseFilePath).split("/");
  baseParts.pop(); // Remove file name, keep directory parts

  const linkParts = cleanLink.split("/");
  for (const part of linkParts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (baseParts.length > 0) baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }

  return baseParts.join("/");
}

/**
 * Checks if a URL is an external link or protocol to ignore.
 */
export function isExternalOrIgnoredUrl(url: string): boolean {
  if (!url) return true;
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("#")
  );
}

/**
 * Helper to calculate 1-based line number for a character index in string content.
 */
function getLineNumber(content: string, matchIndex: number): number {
  let line = 1;
  for (let i = 0; i < matchIndex && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

/**
 * Masks comments and lines containing [리소스 확인 필요], [불필요한 코드], [Cleaned]
 * so they are ignored during scan. Preserves line breaks for exact line numbers.
 */
function maskCommentsAndTaggedLines(content: string, isCss: boolean): string {
  // 1. Mask lines containing comment markers
  let clean = content.replace(/^.*(\[리소스 확인 필요\]|\[불필요한 코드\]|\[Cleaned\]).*$/gm, (lineMatch) => {
    return lineMatch.replace(/[^\r\n]/g, " ");
  });

  // 2. Mask block comments while preserving newlines
  if (isCss) {
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, (commentMatch) => {
      return commentMatch.replace(/[^\r\n]/g, " ");
    });
  } else {
    clean = clean.replace(/<!--[\s\S]*?-->/g, (commentMatch) => {
      return commentMatch.replace(/[^\r\n]/g, " ");
    });
  }

  return clean;
}

/**
 * Scans a project file list to detect broken links and unused physical files.
 * Supports targetSubfolder scope filtering so analysis focuses on target subfolder while matching against entire workspace.
 */
export async function scanProjectResources(
  files: BatchFile[],
  targetSubfolder = "",
): Promise<CleanScanResult> {
  const physicalMap = new Map<string, BatchFile>();
  const physicalPathSet = new Set<string>();
  const lowercasePhysicalMap = new Map<string, string>();

  // Populate ALL workspace files for global path resolution
  files.forEach((f) => {
    const norm = normalizePath(f.relativePath);
    physicalMap.set(norm, f);
    physicalPathSet.add(norm);
    lowercasePhysicalMap.set(norm.toLowerCase(), norm);
  });

  // Multi-tier candidate path matcher for robust resolution of relative paths (including ../../../../../)
  const findPhysicalMatch = (targetPath: string, rawUrl?: string): string | null => {
    if (!targetPath && !rawUrl) return null;

    const candidates: string[] = [];

    const addCandidate = (p: string) => {
      if (!p) return;
      let norm = normalizePath(p);
      if (norm && !candidates.includes(norm)) candidates.push(norm);

      // Strip leading root folder name if present (e.g. "LIT/include/..." -> "include/...")
      const parts = norm.split("/");
      if (parts.length > 1) {
        const withoutRoot = parts.slice(1).join("/");
        if (withoutRoot && !candidates.includes(withoutRoot)) candidates.push(withoutRoot);
      }

      // Strip leading ../ or ./
      const cleanDots = norm.replace(/^(\.\.\/|\.\/)+/, "");
      if (cleanDots && !candidates.includes(cleanDots)) candidates.push(cleanDots);

      // Extract shared include/ subpath (e.g. "contents/include/LIT/css/intro.css" -> "include/LIT/css/intro.css")
      const incIdx = norm.indexOf("include/");
      if (incIdx !== -1) {
        const incSub = norm.slice(incIdx);
        if (incSub && !candidates.includes(incSub)) candidates.push(incSub);
      }
    };

    addCandidate(targetPath);
    if (rawUrl) {
      const cleanRaw = rawUrl.split("?")[0].split("#")[0].trim();
      addCandidate(cleanRaw);
    }

    // 1. Direct candidate matching against physicalPathSet
    for (const cand of candidates) {
      if (physicalPathSet.has(cand)) return cand;
      const lower = cand.toLowerCase();
      if (lowercasePhysicalMap.has(lower)) return lowercasePhysicalMap.get(lower)!;
    }

    // 2. Suffix matching (handles root folder name differences or relative sub-path depth)
    for (const cand of candidates) {
      const lower = cand.toLowerCase();
      for (const realPath of physicalPathSet) {
        const realLower = realPath.toLowerCase();
        if (
          realLower === lower ||
          realLower.endsWith("/" + lower) ||
          lower.endsWith("/" + realLower)
        ) {
          return realPath;
        }
      }
    }

    // 3. Multi-segment tail matching (filename & parent folders down to last 1-4 segments)
    for (const cand of candidates) {
      const lower = cand.toLowerCase();
      const parts = lower.split("/").filter(Boolean);
      for (let depth = Math.min(parts.length, 4); depth >= 1; depth--) {
        const subTail = parts.slice(parts.length - depth).join("/");
        for (const realPath of physicalPathSet) {
          const realLower = realPath.toLowerCase();
          if (
            realLower.endsWith("/" + subTail) ||
            realLower === subTail ||
            realLower.endsWith(subTail)
          ) {
            return realPath;
          }
        }
      }
    }

    return null;
  };

  const brokenLinks: BrokenLinkItem[] = [];
  const referencedPhysicalPaths = new Set<string>();

  // Read all file contents sequentially
  const fileContentMap = new Map<string, string>();
  for (const fileItem of files) {
    const normPath = normalizePath(fileItem.relativePath);
    const ext = fileItem.name.slice(fileItem.name.lastIndexOf(".")).toLowerCase();

    // Read text-based code and script files
    if (
      [".html", ".htm", ".xhtml", ".css", ".js", ".jsx", ".ts", ".tsx", ".json", ".svg"].includes(ext)
    ) {
      try {
        const text = await fileItem.file.text();
        fileContentMap.set(normPath, text);
      } catch (err) {
        console.warn(`Failed to read file content for ${normPath}:`, err);
      }
    }
  }

  let idCounter = 1;

  const targetSubLower = targetSubfolder.toLowerCase().trim();

  // 1. Process HTML / XHTML Files
  for (const [normPath, content] of fileContentMap.entries()) {
    const ext = normPath.slice(normPath.lastIndexOf(".")).toLowerCase();

    // Scope check: If targetSubfolder filter is active, skip broken link code scanning for files outside targetSubfolder
    const isFileInTargetScope = !targetSubLower || normPath.toLowerCase().includes(targetSubLower);

    if ([".html", ".htm", ".xhtml"].includes(ext)) {
      const scannableContent = maskCommentsAndTaggedLines(content, false);

      // Regex to find HTML tags
      const tagRegex = /<(img|script|link|source|audio|video|a|embed|iframe|image)\s+([^>]+)>/gi;
      let tagMatch: RegExpExecArray | null;

      while ((tagMatch = tagRegex.exec(scannableContent)) !== null) {
        let fullSnippet = tagMatch[0];
        const tagType = tagMatch[1].toLowerCase();
        const attributesStr = tagMatch[2];

        // Check if followed by closing tag (e.g. <script ...></script> or <a></a>)
        const afterTagIndex = tagMatch.index + fullSnippet.length;
        const afterText = scannableContent.slice(afterTagIndex);
        const closeMatch = afterText.match(new RegExp(`^(\\s*</${tagType}>)`, "i"));
        if (closeMatch) {
          fullSnippet += closeMatch[1];
        }

        // Match attributes like src="...", href="...", poster="..."
        const attrRegex = /(src|href|poster|data-src)\s*=\s*["']([^"']+)["']/gi;
        let attrMatch: RegExpExecArray | null;

        while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
          const attrName = attrMatch[1].toLowerCase();
          const rawUrl = attrMatch[2].trim();

          if (isExternalOrIgnoredUrl(rawUrl)) continue;

          const resolvedPath = resolveRelativePath(normPath, rawUrl);
          if (!resolvedPath && !rawUrl) continue;

          const matchedRealPath = findPhysicalMatch(resolvedPath, rawUrl);
          const lineNumber = getLineNumber(content, tagMatch.index + attrMatch.index);

          if (matchedRealPath) {
            referencedPhysicalPaths.add(matchedRealPath);
          } else if (isFileInTargetScope) {
            brokenLinks.push({
              id: `broken-${idCounter++}`,
              sourcePath: normPath,
              lineNumber,
              snippet: fullSnippet.length > 120 ? fullSnippet.slice(0, 117) + "..." : fullSnippet,
              targetPath: resolvedPath || rawUrl,
              tagType: `<${tagType} ${attrName}>`,
              selected: true,
            });
          }
        }
      }

      // Inline CSS <style> blocks
      const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      let styleMatch: RegExpExecArray | null;
      while ((styleMatch = styleRegex.exec(scannableContent)) !== null) {
        const styleContent = styleMatch[1];
        const blockStartIndex = styleMatch.index;
        parseCssContent(
          styleContent,
          normPath,
          content,
          blockStartIndex,
          findPhysicalMatch,
          referencedPhysicalPaths,
          brokenLinks,
          () => idCounter++,
          isFileInTargetScope,
        );
      }
    }

    // 2. Process Standalone CSS Files
    if (ext === ".css") {
      const scannableContent = maskCommentsAndTaggedLines(content, true);
      parseCssContent(
        scannableContent,
        normPath,
        content,
        0,
        findPhysicalMatch,
        referencedPhysicalPaths,
        brokenLinks,
        () => idCounter++,
        isFileInTargetScope,
      );
    }

    // 3. Process JS/TS/JSON Files to protect any referenced physical assets
    if ([".js", ".jsx", ".ts", ".tsx", ".json"].includes(ext)) {
      const scannableContent = maskCommentsAndTaggedLines(content, true);
      const stringLiteralRegex = /["'`]\s*([^"'`\r\n]+\.[a-zA-Z0-9]+)\s*["'`]/g;
      let jsMatch: RegExpExecArray | null;
      while ((jsMatch = stringLiteralRegex.exec(scannableContent)) !== null) {
        const rawUrl = jsMatch[1].trim();
        if (isExternalOrIgnoredUrl(rawUrl)) continue;

        const resolvedPath = resolveRelativePath(normPath, rawUrl);
        const matchedRealPath = findPhysicalMatch(resolvedPath, rawUrl);
        if (matchedRealPath) {
          referencedPhysicalPaths.add(matchedRealPath);
        }
      }
    }
  }

  // 4. Identify Unused Physical Files (Only files with ZERO references across the entire project)
  const unusedFiles: UnusedFileItem[] = [];
  let totalUnusedBytes = 0;

  for (const [normPath, fileItem] of physicalMap.entries()) {
    const ext = fileItem.name.slice(fileItem.name.lastIndexOf(".")).toLowerCase();

    // EXCLUDE ALL HTML/HTM/XHTML FILES FROM UNUSED PHYSICAL FILES LIST
    const isHtmlFile = [".html", ".htm", ".xhtml"].includes(ext);
    if (isHtmlFile) continue;

    // Scope check: If targetSubfolder filter is active, only include unused files inside targetSubfolder
    if (targetSubLower && !normPath.toLowerCase().includes(targetSubLower)) {
      continue;
    }

    const isReferencedByCode = referencedPhysicalPaths.has(normPath);

    if (!isReferencedByCode) {
      unusedFiles.push({
        id: `unused-${idCounter++}`,
        relativePath: normPath,
        sizeBytes: fileItem.file.size,
        extension: ext || "file",
        file: fileItem.file,
        selected: true,
      });
      totalUnusedBytes += fileItem.file.size;
    }
  }

  return {
    brokenLinks,
    unusedFiles,
    totalUnusedBytes,
    scannedFileCount: files.length,
  };
}

/**
 * Helper to parse CSS url(...) and @import declarations.
 */
function parseCssContent(
  cssText: string,
  baseFilePath: string,
  fullDocumentContent: string,
  blockOffset: number,
  findPhysicalMatch: (targetPath: string, rawUrl?: string) => string | null,
  referencedPhysicalPaths: Set<string>,
  brokenLinks: BrokenLinkItem[],
  nextId: () => number,
  isFileInTargetScope = true,
) {
  const urlRegex = /url\s*\(\s*["']?([^"'()]+)["']?\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(cssText)) !== null) {
    const rawUrl = match[1].trim();
    if (isExternalOrIgnoredUrl(rawUrl)) continue;

    const resolvedPath = resolveRelativePath(baseFilePath, rawUrl);
    if (!resolvedPath && !rawUrl) continue;

    const matchGlobalIndex = blockOffset + match.index;
    const lineNumber = getLineNumber(fullDocumentContent, matchGlobalIndex);
    const matchedRealPath = findPhysicalMatch(resolvedPath, rawUrl);

    if (matchedRealPath) {
      referencedPhysicalPaths.add(matchedRealPath);
    } else if (isFileInTargetScope) {
      brokenLinks.push({
        id: `broken-${nextId()}`,
        sourcePath: baseFilePath,
        lineNumber,
        snippet: match[0],
        targetPath: resolvedPath || rawUrl,
        tagType: "CSS url()",
        selected: true,
      });
    }
  }

  const importRegex = /@import\s+["']([^"']+)["']/gi;
  while ((match = importRegex.exec(cssText)) !== null) {
    const rawUrl = match[1].trim();
    if (isExternalOrIgnoredUrl(rawUrl)) continue;

    const resolvedPath = resolveRelativePath(baseFilePath, rawUrl);
    if (!resolvedPath && !rawUrl) continue;

    const matchGlobalIndex = blockOffset + match.index;
    const lineNumber = getLineNumber(fullDocumentContent, matchGlobalIndex);
    const matchedRealPath = findPhysicalMatch(resolvedPath, rawUrl);

    if (matchedRealPath) {
      referencedPhysicalPaths.add(matchedRealPath);
    } else if (isFileInTargetScope) {
      brokenLinks.push({
        id: `broken-${nextId()}`,
        sourcePath: baseFilePath,
        lineNumber,
        snippet: match[0],
        targetPath: resolvedPath || rawUrl,
        tagType: "@import",
        selected: true,
      });
    }
  }
}

/**
 * Appends /* [리소스 확인 필요] *\/ (or <!-- [리소스 확인 필요] -->) at line end.
 */
function applyLineEndComment(fileText: string, snippet: string, isCss: boolean): { newText: string; modified: boolean } {
  if (!snippet || !fileText.includes(snippet)) {
    return { newText: fileText, modified: false };
  }

  const tagText = isCss ? "/* [리소스 확인 필요] */" : "<!-- [리소스 확인 필요] -->";
  const lines = fileText.split("\n");
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(snippet)) {
      if (!lines[i].includes("[리소스 확인 필요]") && !lines[i].includes("[불필요한 코드]")) {
        lines[i] = lines[i].replace(/\r$/, "") + ` ${tagText}`;
        modified = true;
      }
    }
  }

  return { newText: lines.join("\n"), modified };
}

/**
 * Executes resource cleanup by deleting unused files and modifying broken link code.
 */
export async function executeResourceCleanup(options: {
  unusedFilesToDelete: UnusedFileItem[];
  brokenLinksToClean: BrokenLinkItem[];
  codeCleanMode: "none" | "comment" | "remove";
  dirHandle: FileSystemDirectoryHandle | null;
  outputDirHandle: FileSystemDirectoryHandle | null;
  useFallback: boolean;
  onLog: (text: string, type: "info" | "success" | "error" | "warning") => void;
  onProgress: (progress: number) => void;
}): Promise<{ deletedFileCount: number; cleanedCodeCount: number; zipResultBlob?: Blob }> {
  const {
    unusedFilesToDelete,
    brokenLinksToClean,
    codeCleanMode,
    dirHandle,
    useFallback,
    onLog,
    onProgress,
  } = options;

  let deletedFileCount = 0;
  let cleanedCodeCount = 0;
  const totalTasks = unusedFilesToDelete.length + (codeCleanMode !== "none" ? brokenLinksToClean.length : 0);
  let completedTasks = 0;

  // 1. Local Directory Mode (File System Access API)
  if (!useFallback && dirHandle) {
    // A. Delete physical files
    for (const unused of unusedFilesToDelete) {
      try {
        const parts = unused.relativePath.split("/");
        const fileName = parts.pop()!;
        const subDirHandle = await getNestedDirHandle(dirHandle, unused.relativePath);

        if (subDirHandle) {
          await subDirHandle.removeEntry(fileName);
          deletedFileCount++;
          onLog(`[Deleted File] ${unused.relativePath}`, "success");
        } else {
          onLog(`[Warning] Could not find folder for ${unused.relativePath}`, "warning");
        }
      } catch (err: any) {
        onLog(`[Error Deleting File] ${unused.relativePath}: ${err.message}`, "error");
      }
      completedTasks++;
      if (totalTasks > 0) onProgress(Math.floor((completedTasks / totalTasks) * 100));
    }

    // B. Clean broken code in HTML/CSS files if requested
    if (codeCleanMode !== "none" && brokenLinksToClean.length > 0) {
      const linksByFile = new Map<string, BrokenLinkItem[]>();
      brokenLinksToClean.forEach((link) => {
        if (!linksByFile.has(link.sourcePath)) linksByFile.set(link.sourcePath, []);
        linksByFile.get(link.sourcePath)!.push(link);
      });

      for (const [sourcePath, links] of linksByFile.entries()) {
        try {
          const parts = sourcePath.split("/");
          const fileName = parts.pop()!;
          const subDirHandle = await getNestedDirHandle(dirHandle, sourcePath);
          if (!subDirHandle) continue;

          const fileHandle = await subDirHandle.getFileHandle(fileName);
          const fileObj = await fileHandle.getFile();
          let text = await fileObj.text();
          let modified = false;

          const isCssFile = sourcePath.toLowerCase().endsWith(".css");

          for (const item of links) {
            if (codeCleanMode === "comment") {
              const res = applyLineEndComment(text, item.snippet, isCssFile || item.tagType.includes("CSS"));
              if (res.modified) {
                text = res.newText;
                modified = true;
                cleanedCodeCount++;
              }
            } else if (codeCleanMode === "remove") {
              if (text.includes(item.snippet)) {
                text = text.replace(item.snippet, "");
                modified = true;
                cleanedCodeCount++;
              }
            }
          }

          if (modified) {
            const writable = await fileHandle.createWritable();
            await writable.write(text);
            await writable.close();
            onLog(`[Cleaned Code] Updated ${sourcePath}`, "info");
          }
        } catch (err: any) {
          onLog(`[Error Cleaning Code] ${sourcePath}: ${err.message}`, "error");
        }
        completedTasks += links.length;
        if (totalTasks > 0) onProgress(Math.floor((completedTasks / totalTasks) * 100));
      }
    }

    return { deletedFileCount, cleanedCodeCount };
  }

  // 2. Fallback Virtual Mode
  onLog(`Fallback cleanup complete. Deleted ${deletedFileCount} files.`, "success");
  return { deletedFileCount, cleanedCodeCount };
}
