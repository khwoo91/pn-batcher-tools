/// <reference types="wicg-file-system-access" />
import JSZip from "jszip";
import type { BatchFile } from "../types";
import { getSvgDimensions, convertSvgToImage } from "../utils/svg-utils";
import { getNestedDirHandle } from "../utils/fs-utils";

export interface BatchConvertOptions {
  selectedFiles: BatchFile[];
  exportFormat: "png" | "jpg";
  selectedScale: number;
  scaleSuffix: string;
  deleteOriginal: boolean;
  dirHandle: FileSystemDirectoryHandle | null;
  outputDirHandle: FileSystemDirectoryHandle | null;
  apiSupported: boolean;
  useFallback: boolean;
  t: any;

  onProgress: (progress: number, currentIndex: number) => void;
  onFileStatusChange: (
    relativePath: string,
    status: "pending" | "processing" | "success" | "error",
    errorMsg?: string,
  ) => void;
  onLog: (text: string, type: "info" | "success" | "error" | "warning") => void;
}

/**
 * Executes batch conversion of SVG files, writing to the target directory or generating a ZIP file.
 */
export async function batchConvertSvg(
  options: BatchConvertOptions,
): Promise<{ successCount: number; failCount: number; isLocalDirMode: boolean }> {
  const {
    selectedFiles,
    exportFormat,
    selectedScale,
    scaleSuffix,
    deleteOriginal,
    dirHandle,
    outputDirHandle,
    apiSupported,
    useFallback,
    t,
    onProgress,
    onFileStatusChange,
    onLog,
  } = options;

  let successCount = 0;
  let failCount = 0;
  const totalSteps = selectedFiles.length;
  let currentStep = 0;

  let zip: JSZip | null = null;

  const isLocalDirMode = !!(apiSupported && dirHandle && !useFallback);
  const hasOutputDir = outputDirHandle !== null;

  // 1. Acquire Local Directory Permissions or fallback to ZIP
  if (isLocalDirMode && dirHandle) {
    try {
      const opts = { mode: "readwrite" as const };
      if ((await dirHandle.queryPermission(opts)) !== "granted") {
        await dirHandle.requestPermission(opts);
      }
      if (hasOutputDir && outputDirHandle) {
        if ((await outputDirHandle.queryPermission(opts)) !== "granted") {
          await outputDirHandle.requestPermission(opts);
        }
        onLog(t.localOutputDirReady(outputDirHandle.name), "success");
      } else {
        onLog(t.directWriteNotice, "info");
      }
    } catch (err) {
      console.error("Local directory permission check failed. Falling back to ZIP.", err);
      onLog(t.permissionFailFallback, "warning");
      zip = new JSZip();
    }
  } else {
    zip = new JSZip();
    onLog(t.zipArchiveStart, "info");
  }

  // 2. Conversion Loop
  for (let i = 0; i < selectedFiles.length; i++) {
    const svgItem = selectedFiles[i];
    onFileStatusChange(svgItem.relativePath, "processing");

    try {
      const { width, height, text } = await getSvgDimensions(svgItem.file);
      const lastDotIndex = svgItem.name.lastIndexOf(".");
      const baseName = lastDotIndex !== -1 ? svgItem.name.substring(0, lastDotIndex) : svgItem.name;
      const outputFileName = `${baseName}${scaleSuffix}.${exportFormat}`;

      try {
        const imageBlob = await convertSvgToImage(text, width, height, selectedScale, exportFormat);

        if (isLocalDirMode && dirHandle) {
          // Write directly to file system
          let targetDirHandle: FileSystemDirectoryHandle;
          if (hasOutputDir && outputDirHandle) {
            targetDirHandle = await getNestedDirHandle(outputDirHandle, svgItem.relativePath);
          } else {
            targetDirHandle = await getNestedDirHandle(dirHandle, svgItem.relativePath);
          }
          const fileHandle = await targetDirHandle.getFileHandle(outputFileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(imageBlob);
          await writable.close();
        } else if (zip) {
          // Add to ZIP archive
          if (hasOutputDir && outputDirHandle) {
            const zipFolderPath = outputDirHandle.name;
            const relativeParts = svgItem.relativePath.split("/");
            relativeParts.pop();
            const zipPath = relativeParts.join("/");
            if (zipPath) {
              zip.folder(zipFolderPath)?.folder(zipPath)?.file(outputFileName, imageBlob);
            } else {
              zip.folder(zipFolderPath)?.file(outputFileName, imageBlob);
            }
          } else {
            const relativeParts = svgItem.relativePath.split("/");
            relativeParts.pop();
            const zipPath = relativeParts.join("/");
            if (zipPath) {
              zip.folder(zipPath)?.file(outputFileName, imageBlob);
            } else {
              zip.file(outputFileName, imageBlob);
            }
          }
        }

        successCount++;
        onLog(
          t.convertSuccess(
            svgItem.relativePath,
            outputFileName,
            Math.round(width * selectedScale),
            Math.round(height * selectedScale),
          ),
          "success",
        );

        // Optional original file cleanup
        if (deleteOriginal && dirHandle) {
          try {
            const targetDirHandle = await getNestedDirHandle(dirHandle, svgItem.relativePath);
            await targetDirHandle.removeEntry(svgItem.name);
            onLog(t.originalDeleted(svgItem.relativePath), "info");
          } catch (delErr: any) {
            onLog(t.originalDeleteFail(svgItem.relativePath, delErr.message), "warning");
          }
        }

        onFileStatusChange(svgItem.relativePath, "success");
      } catch (scaleErr: any) {
        failCount++;
        onFileStatusChange(svgItem.relativePath, "error", scaleErr.message);
        onLog(t.convertFail(svgItem.relativePath, scaleErr.message), "error");
      }
    } catch (fileErr: any) {
      failCount++;
      onFileStatusChange(svgItem.relativePath, "error", fileErr.message);
      onLog(t.parseError(svgItem.relativePath, fileErr.message), "error");
    }

    currentStep++;
    onProgress(Math.round((currentStep / totalSteps) * 100), currentStep);
  }

  // 3. Compress & download ZIP if applicable
  if (zip && successCount > 0) {
    try {
      onLog(t.zipCompressing, "info");
      const content = await zip.generateAsync({ type: "blob" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      const zipName = outputDirHandle ? outputDirHandle.name : "converted_images";
      link.download = `${zipName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      onLog(t.zipDownloadDone(zipName), "success");
    } catch (zipErr: any) {
      onLog(t.zipDownloadFail(zipErr.message), "error");
    }
  }

  // 4. Return summary
  onLog(t.conversionEnded(successCount, failCount), successCount > 0 ? "success" : "error");
  return { successCount, failCount, isLocalDirMode };
}
