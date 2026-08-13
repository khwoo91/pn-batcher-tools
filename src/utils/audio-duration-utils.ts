import type { BatchFile, AudioClipItem } from "../types";

/**
 * Formats seconds (e.g. 3.450) into SMIL clock value format: "H:MM:SS.mmm" (e.g. "0:00:03.450").
 */
export function formatSmilClock(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) {
    return "0:00:00.000";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.min(999, Math.round((seconds % 1) * 1000));

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");

  return `${hours}:${pad2(minutes)}:${pad2(secs)}.${pad3(ms)}`;
}

/**
 * Reads audio file duration in seconds using Web Audio API or HTML5 Audio metadata fallback.
 */
export async function getAudioFileDuration(file: File): Promise<number> {
  // Method 1: Web Audio API (Fast & Precise)
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const duration = audioBuffer.duration;
      await audioContext.close();
      if (!isNaN(duration) && duration > 0) {
        return duration;
      }
    } catch {
      await audioContext.close();
    }
  } catch {
    // Fallback to HTML5 Audio
  }

  // Method 2: HTML5 Audio metadata fallback
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();

    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
    };

    const onLoaded = () => {
      const duration = audio.duration;
      cleanup();
      if (!isNaN(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error("Invalid audio duration"));
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("Failed to load audio metadata"));
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onError);
    audio.src = url;
  });
}

/**
 * Processes a batch of files and extracts AudioClipItem timestamp info for each file.
 */
export async function extractAudioClipInfos(
  files: BatchFile[],
  onProgress?: (processed: number, total: number) => void
): Promise<AudioClipItem[]> {
  const results: AudioClipItem[] = [];

  for (let i = 0; i < files.length; i++) {
    const batchFile = files[i];
    const srcName = batchFile.relativePath || batchFile.name;

    try {
      const duration = await getAudioFileDuration(batchFile.file);
      const clipBegin = "0:00:00.000";
      const clipEnd = formatSmilClock(duration);
      const smilTag = `<audio src="${srcName}" clipBegin="${clipBegin}" clipEnd="${clipEnd}" />`;

      results.push({
        id: `clip-${i}-${Date.now()}`,
        name: batchFile.name,
        relativePath: srcName,
        sizeBytes: batchFile.file.size,
        durationSec: duration,
        clipBegin,
        clipEnd,
        smilTag,
      });
    } catch (err: any) {
      results.push({
        id: `clip-${i}-${Date.now()}`,
        name: batchFile.name,
        relativePath: srcName,
        sizeBytes: batchFile.file.size,
        durationSec: 0,
        clipBegin: "0:00:00.000",
        clipEnd: "0:00:00.000",
        smilTag: `<audio src="${srcName}" clipBegin="0:00:00.000" clipEnd="0:00:00.000" />`,
        errorMsg: err?.message || "Failed to read audio duration",
      });
    }

    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }

  return results;
}

/**
 * Generates full SMIL XML document string from extracted audio clip items.
 */
export function generateSmilXml(items: AudioClipItem[]): string {
  const audioTags = items
    .map((item) => `      <audio src="${item.relativePath}" clipBegin="${item.clipBegin}" clipEnd="${item.clipEnd}" />`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0">
  <body>
    <seq>
${audioTags}
    </seq>
  </body>
</smil>`;
}

/**
 * Generates JSON formatted string from extracted audio clip items.
 */
export function generateJsonData(items: AudioClipItem[]): string {
  const cleanData = items.map((item) => ({
    name: item.name,
    relativePath: item.relativePath,
    durationSec: Number(item.durationSec.toFixed(3)),
    clipBegin: item.clipBegin,
    clipEnd: item.clipEnd,
    smilTag: item.smilTag,
  }));

  return JSON.stringify(cleanData, null, 2);
}
