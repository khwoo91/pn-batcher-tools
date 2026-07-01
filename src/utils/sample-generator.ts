/**
 * Utility functions for generating sample/mock files for testing.
 */

export function generateSampleSvgFile(): File {
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="premiumGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="50%" stop-color="#a855f7" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#6366f1" flood-opacity="0.3" />
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="#090d1f" rx="32" />
  <circle cx="200" cy="200" r="100" fill="url(#premiumGrad)" filter="url(#shadow)" />
  <path d="M170 150 L250 200 L170 250 Z" fill="#ffffff" rx="4" />
</svg>`;
  return new File([svgString], "sample.svg", { type: "image/svg+xml" });
}

export function generateSampleWavFile(): File {
  const sampleRate = 8000;
  const duration = 1.0;
  const numSamples = sampleRate * duration;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Raw PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, numSamples * 2, true);

  const frequency = 440;
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const tVal = i / sampleRate;
    const sampleVal = Math.sin(2 * Math.PI * frequency * tVal);
    const intSample = Math.max(-32768, Math.min(32767, sampleVal * 32767));
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  return new File([blob], "sample.wav", { type: "audio/wav" });
}

export function generateSampleRenameFiles(): File[] {
  const fileNames = [
    "report_draft_2026.txt",
    "vacation_photo (1).jpg",
    "[draft] logo_final.png",
    "temp_cache.tmp",
  ];
  return fileNames.map((name) => new File(["dummy content"], name, { type: "text/plain" }));
}
