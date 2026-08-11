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
): Promise<{ successCount: number; failCount: number; isLocalDirMode: boolean; canceled?: boolean }> {
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

  const isPermissionDeniedError = (err: any): boolean => {
    if (!err) return false;
    return (
      err.name === "NotAllowedError" ||
      err.name === "AbortError" ||
      err.name === "SecurityError" ||
      (typeof err.message === "string" &&
        (err.message.includes("denied") ||
          err.message.includes("not allowed") ||
          err.message.includes("User cancelled") ||
          err.message.includes("user agent")))
    );
  };

  // 1. Acquire Local Directory Permissions
  if (isLocalDirMode && dirHandle) {
    try {
      const opts = { mode: "readwrite" as const };
      let perm = await dirHandle.queryPermission(opts);
      if (perm !== "granted") {
        perm = await dirHandle.requestPermission(opts);
      }
      if (perm !== "granted") {
        onLog("[작업 취소] 디렉토리 변경 권한이 거부되어 작업을 취소했습니다.", "warning");
        return { successCount: 0, failCount: 0, isLocalDirMode: true, canceled: true };
      }
      onLog("로컬 디렉토리 권한이 확인되었습니다.", "success");
    } catch (err: any) {
      onLog("[작업 취소] 폴더 권한 요청이 취소되었습니다.", "warning");
      return { successCount: 0, failCount: 0, isLocalDirMode: true, canceled: true };
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
          onLog(`이름 변경 성공: ${fileItem.relativePath} -> ${newName}`, "success");
        }
        successCount++;
        onFileStatusChange(fileItem.relativePath, "success");
      } else if (zip) {
        // Add to ZIP archive
        const zipPath = fileItem.relativePath || fileItem.name;
        const parts = zipPath.split("/");
        parts.pop(); // Remove old filename
        const newZipPath = parts.length > 0 ? `${parts.join("/")}/${newName}` : newName;

        zip.file(newZipPath, fileItem.file);
        successCount++;
        onLog(`ZIP 내 이름 변경 준비: ${fileItem.relativePath} -> ${newZipPath}`, "info");
        onFileStatusChange(fileItem.relativePath, "success");
      }
    } catch (err: any) {
      if (isPermissionDeniedError(err)) {
        onLog("[작업 취소] 사용자가 변경 권한을 거부하여 작업을 취소했습니다.", "warning");
        return { successCount, failCount, isLocalDirMode: true, canceled: true };
      }
      failCount++;
      console.error(err);
      onFileStatusChange(fileItem.relativePath, "error", err.message);
      onLog(`이름 변경 실패 (${fileItem.relativePath}): ${err.message}`, "error");
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
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      link.download = `renamed_files_${dateStr}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      onLog(`이름 변경 완료 압축 파일 다운로드 완료.`, "success");
    } catch (zipErr: any) {
      console.error("ZIP Generation Error:", zipErr);
      onLog(`ZIP 생성 중 오류 발생: ${zipErr.message}`, "error");
    }
  }

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
 * Executes batch deletion of selected physical files in local directory.
 */
export async function batchDeleteFiles(
  options: DeleteBatchOptions,
): Promise<{ successCount: number; failCount: number; canceled?: boolean }> {
  const { selectedFiles, dirHandle, t, onProgress, onFileStatusChange, onLog } = options;

  let successCount = 0;
  let failCount = 0;
  const totalSteps = selectedFiles.length;
  let currentStep = 0;

  if (!dirHandle) {
    throw new Error("로컬 디렉토리가 연동되어 있지 않아 파일을 삭제할 수 없습니다.");
  }

  // Acquire permissions
  try {
    const opts = { mode: "readwrite" as const };
    let perm = await dirHandle.queryPermission(opts);
    if (perm !== "granted") {
      perm = await dirHandle.requestPermission(opts);
    }
    if (perm !== "granted") {
      onLog("[작업 취소] 디렉토리 변경 권한이 거부되어 파일 삭제를 취소했습니다.", "warning");
      return { successCount: 0, failCount: 0, canceled: true };
    }
  } catch (err: any) {
    onLog("[작업 취소] 폴더 권한 요청이 취소되었습니다.", "warning");
    return { successCount: 0, failCount: 0, canceled: true };
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
      if (
        err.name === "NotAllowedError" ||
        err.name === "AbortError" ||
        (err.message && (err.message.includes("denied") || err.message.includes("not allowed")))
      ) {
        onLog("[작업 취소] 사용자가 삭제 권한을 거부하여 작업을 취소했습니다.", "warning");
        return { successCount, failCount, canceled: true };
      }
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
