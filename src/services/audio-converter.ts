/// <reference types="wicg-file-system-access" />
import JSZip from "jszip";
import * as lamejs from "@breezystack/lamejs";
import type { BatchFile } from "../types";
import { getNestedDirHandle } from "../utils/fs-utils";

export interface AudioBatchConvertOptions {
  selectedFiles: BatchFile[];
  bitrate: number; // e.g. 128, 192, 256, 320
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
    errorMsg?: string
  ) => void;
  onLog: (text: string, type: "info" | "success" | "error" | "warning") => void;
}

/**
 * Converts Float32Array audio samples (-1.0 to 1.0) into Int16Array PCM samples (-32768 to 32767).
 */
function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

/**
 * Executes batch conversion of WAV audio files to MP3.
 */
export async function batchConvertAudio(
  options: AudioBatchConvertOptions
): Promise<{ successCount: number; failCount: number; isLocalDirMode: boolean }> {
  const {
    selectedFiles,
    bitrate,
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

  // Set up AudioContext (once)
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch (err: any) {
    console.error("Failed to initialize AudioContext", err);
  }

  // 2. Conversion Loop
  for (let i = 0; i < selectedFiles.length; i++) {
    const audioItem = selectedFiles[i];
    onFileStatusChange(audioItem.relativePath, "processing");

    try {
      if (!audioCtx) {
        throw new Error("Browser does not support AudioContext / Web Audio API");
      }

      // Read file and decode
      onLog(`Decoding: ${audioItem.relativePath}`, "info");
      const arrayBuffer = await audioItem.file.arrayBuffer();
      
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      } catch (decodeErr: any) {
        throw new Error(`Audio decoding failed. The WAV file might be corrupted or in an unsupported format. (${decodeErr.message})`);
      }

      const channels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;

      if (channels < 1 || channels > 2) {
        throw new Error(`Unsupported channel count: ${channels}. Only Mono (1ch) and Stereo (2ch) are supported.`);
      }

      onLog(`Encoding to MP3: ${audioItem.name} (${channels} ch, ${sampleRate} Hz, ${bitrate} kbps)`, "info");

      // Set up Mp3Encoder
      const EncoderClass = (lamejs as any).Mp3Encoder || (lamejs as any).default?.Mp3Encoder;
      if (!EncoderClass) {
        throw new Error("LameJS Mp3Encoder constructor not found.");
      }
      
      const mp3Encoder = new EncoderClass(channels, sampleRate, bitrate);
      const mp3Data: Int8Array[] = [];

      const left = audioBuffer.getChannelData(0);
      const right = channels > 1 ? audioBuffer.getChannelData(1) : null;

      const leftInt16 = float32ToInt16(left);
      const rightInt16 = right ? float32ToInt16(right) : null;

      const sampleBlockSize = 1152; // Must be a multiple of 576

      for (let offset = 0; offset < leftInt16.length; offset += sampleBlockSize) {
        const leftChunk = leftInt16.subarray(offset, offset + sampleBlockSize);
        let mp3buf: Int8Array;

        if (rightInt16) {
          const rightChunk = rightInt16.subarray(offset, offset + sampleBlockSize);
          mp3buf = mp3Encoder.encodeBuffer(leftChunk, rightChunk);
        } else {
          mp3buf = mp3Encoder.encodeBuffer(leftChunk);
        }

        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }

      const finalBuffer = mp3Encoder.flush();
      if (finalBuffer.length > 0) {
        mp3Data.push(finalBuffer);
      }

      // Create MP3 Blob
      const mp3Blob = new Blob(mp3Data as any[], { type: "audio/mp3" });

      const lastDotIndex = audioItem.name.lastIndexOf(".");
      const baseName = lastDotIndex !== -1 ? audioItem.name.substring(0, lastDotIndex) : audioItem.name;
      const outputFileName = `${baseName}.mp3`;

      // 3. Write output
      if (isLocalDirMode && dirHandle) {
        let targetDirHandle: FileSystemDirectoryHandle;
        if (hasOutputDir && outputDirHandle) {
          targetDirHandle = await getNestedDirHandle(outputDirHandle, audioItem.relativePath);
        } else {
          targetDirHandle = await getNestedDirHandle(dirHandle, audioItem.relativePath);
        }
        const fileHandle = await targetDirHandle.getFileHandle(outputFileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(mp3Blob);
        await writable.close();
      } else if (zip) {
        if (hasOutputDir && outputDirHandle) {
          const zipFolderPath = outputDirHandle.name;
          const relativeParts = audioItem.relativePath.split("/");
          relativeParts.pop();
          const zipPath = relativeParts.join("/");
          if (zipPath) {
            zip.folder(zipFolderPath)?.folder(zipPath)?.file(outputFileName, mp3Blob);
          } else {
            zip.folder(zipFolderPath)?.file(outputFileName, mp3Blob);
          }
        } else {
          const relativeParts = audioItem.relativePath.split("/");
          relativeParts.pop();
          const zipPath = relativeParts.join("/");
          if (zipPath) {
            zip.folder(zipPath)?.file(outputFileName, mp3Blob);
          } else {
            zip.file(outputFileName, mp3Blob);
          }
        }
      }

      successCount++;
      onLog(t.convertAudioSuccess(audioItem.relativePath, outputFileName), "success");

      // 4. Optional original file cleanup
      if (deleteOriginal && dirHandle) {
        try {
          const targetDirHandle = await getNestedDirHandle(dirHandle, audioItem.relativePath);
          await targetDirHandle.removeEntry(audioItem.name);
          onLog(t.originalDeleted(audioItem.relativePath), "info");
        } catch (delErr: any) {
          onLog(t.originalDeleteFail(audioItem.relativePath, delErr.message), "warning");
        }
      }

      onFileStatusChange(audioItem.relativePath, "success");
    } catch (err: any) {
      failCount++;
      onFileStatusChange(audioItem.relativePath, "error", err.message);
      onLog(t.convertFail(audioItem.relativePath, err.message), "error");
    }

    currentStep++;
    onProgress(Math.round((currentStep / totalSteps) * 100), currentStep);
  }

  // Close AudioContext
  if (audioCtx) {
    audioCtx.close().catch(console.error);
  }

  // 3. Compress & download ZIP if applicable
  if (zip && successCount > 0) {
    try {
      onLog(t.zipCompressing, "info");
      const content = await zip.generateAsync({ type: "blob" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      const zipName = outputDirHandle ? outputDirHandle.name : "converted_audio";
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
