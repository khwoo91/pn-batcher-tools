/// <reference types="wicg-file-system-access" />
import JSZip from "jszip";
import type { BatchFile } from "../types";
import { getNestedDirHandle } from "../utils/fs-utils";

export interface RenameBatchOptions {
  selectedFiles: BatchFile[];
  dirHandle: FileSystemDirectoryHandle | null;
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
 * Executes batch renaming of files.
 */
export async function batchRenameFiles(
  options: RenameBatchOptions,
): Promise<{ successCount: number; failCount: number; isLocalDirMode: boolean }> {
  const {
    selectedFiles,
    dirHandle,
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

  const isLocalDirMode = !!(apiSupported && dirHandle && !useFallback);
  let zip: JSZip | null = null;

  // 1. Acquire Local Directory Permissions or fallback to ZIP
  if (isLocalDirMode && dirHandle) {
    try {
      const opts = { mode: "readwrite" as const };
      if ((await dirHandle.queryPermission(opts)) !== "granted") {
        await dirHandle.requestPermission(opts);
      }
      onLog("로컬 디렉토리 권한이 확인되었습니다.", "success");
    } catch (err) {
      console.error("Local directory permission check failed. Falling back to ZIP.", err);
      onLog(t.permissionFailFallback, "warning");
      zip = new JSZip();
    }
  } else {
    zip = new JSZip();
    onLog(t.zipArchiveStart, "info");
  }

  // 2. Renaming Loop
  for (let i = 0; i < selectedFiles.length; i++) {
    const fileItem = selectedFiles[i];
    onFileStatusChange(fileItem.relativePath, "processing");

    const originalName = fileItem.name;
    const newName = fileItem.newName || fileItem.name;

    try {
      if (isLocalDirMode && dirHandle && !zip) {
        // Direct rename
        if (originalName === newName) {
          onLog(`동일한 이름 (스킵): ${fileItem.relativePath}`, "warning");
        } else {
          const parentDirHandle = await getNestedDirHandle(dirHandle, fileItem.relativePath);
          const fileHandle = await parentDirHandle.getFileHandle(originalName);

          // Check for .move() API support
          if (typeof (fileHandle as any).move === "function") {
            await (fileHandle as any).move(newName);
          } else {
            // Copy then delete fallback
            const fileData = await fileHandle.getFile();
            const newFileHandle = await parentDirHandle.getFileHandle(newName, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(fileData);
            await writable.close();
            await parentDirHandle.removeEntry(originalName);
          }
        }

        successCount++;
        onLog(t.renameSuccess(fileItem.relativePath, newName), "success");
        onFileStatusChange(fileItem.relativePath, "success");
      } else if (zip) {
        // Zip Mode fallback
        const parts = fileItem.relativePath.split("/");
        parts[parts.length - 1] = newName;
        const zipPath = parts.join("/");

        zip.file(zipPath, fileItem.file);
        successCount++;
        onLog(t.renameSuccess(fileItem.relativePath, newName), "success");
        onFileStatusChange(fileItem.relativePath, "success");
      }
    } catch (err: any) {
      failCount++;
      console.error(err);
      onFileStatusChange(fileItem.relativePath, "error", err.message);
      onLog(t.renameFail(fileItem.relativePath, err.message), "error");
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
      const zipName = "renamed_files";
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

export interface DeleteBatchOptions {
  selectedFiles: BatchFile[];
  dirHandle: FileSystemDirectoryHandle | null;
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
 * Executes batch deletion of files.
 */
export async function batchDeleteFiles(
  options: DeleteBatchOptions,
): Promise<{ successCount: number; failCount: number }> {
  const { selectedFiles, dirHandle, t, onProgress, onFileStatusChange, onLog } = options;

  let successCount = 0;
  let failCount = 0;
  const totalSteps = selectedFiles.length;
  let currentStep = 0;

  if (!dirHandle) {
    throw new Error("로컬 디렉토리가 연동되어 있지 않아 파일을 삭제할 수 없습니다.");
  }

  // Acquire permissions
  const opts = { mode: "readwrite" as const };
  if ((await dirHandle.queryPermission(opts)) !== "granted") {
    await dirHandle.requestPermission(opts);
  }

  // Deletion loop
  for (let i = 0; i < selectedFiles.length; i++) {
    const fileItem = selectedFiles[i];
    onFileStatusChange(fileItem.relativePath, "processing");

    try {
      const parentDirHandle = await getNestedDirHandle(dirHandle, fileItem.relativePath);
      await parentDirHandle.removeEntry(fileItem.name);

      successCount++;
      onLog(t.deleteSuccess(fileItem.relativePath), "success");
      onFileStatusChange(fileItem.relativePath, "success");
    } catch (err: any) {
      failCount++;
      console.error(err);
      onFileStatusChange(fileItem.relativePath, "error", err.message);
      onLog(t.deleteFail(fileItem.relativePath, err.message), "error");
    }

    currentStep++;
    onProgress(Math.round((currentStep / totalSteps) * 100), currentStep);
  }

  onLog(
    `파일 삭제 작업 완료. (성공: ${successCount}건, 실패: ${failCount}건)`,
    successCount > 0 ? "success" : "error",
  );
  return { successCount, failCount };
}
