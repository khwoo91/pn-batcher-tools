/// <reference types="wicg-file-system-access" />
import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";

import type { BatchFile, ScaleOption, ConversionLog } from "./types";
import { scanDirectory } from "./utils/fs-utils";
import { batchConvertSvg } from "./services/batch-converter";
import { batchConvertAudio } from "./services/audio-converter";
import { batchRenameFiles, batchDeleteFiles } from "./services/file-renamer";
import { locales } from "./locales";

import "./components/app-header";
import "./components/settings-panel";
import "./components/audio-settings-panel";
import "./components/renamer-settings-panel";
import "./components/file-queue";
import "./components/log-console";
import "./components/alert-modal";

const t = {
  ko: locales.ko.main,
  en: locales.en.main,
};

@customElement("batcher-app")
export class BatcherApp extends LitElement {
  @state() private activeTab: "svg" | "audio" | "rename" = "svg";
  @state() private currentLang: "ko" | "en" = "ko";

  // SVG specific states
  @state() private svgDirHandle: FileSystemDirectoryHandle | null = null;
  @state() private svgFiles: BatchFile[] = [];
  @state() private selectedScale = 1;
  @state() private exportFormat: "png" | "jpg" = "png";
  @state() private svgDeleteOriginal = false;
  @state() private svgOutputDirHandle: FileSystemDirectoryHandle | null = null;

  // Audio specific states
  @state() private audioDirHandle: FileSystemDirectoryHandle | null = null;
  @state() private audioFiles: BatchFile[] = [];
  @state() private audioBitrate = 192; // 128, 192, 256, 320
  @state() private audioDeleteOriginal = false;
  @state() private audioOutputDirHandle: FileSystemDirectoryHandle | null = null;
  @state() private audioInputExts: string[] = [".wav", ".mp3"];

  // Rename specific states
  @state() private renameDirHandle: FileSystemDirectoryHandle | null = null;
  @state() private renameFiles: BatchFile[] = [];
  @state() private renameExtFilter = "";
  @state() private renameHistoryStack: string[][] = [];

  // Shared UI states
  @state() private isConverting = false;
  @state() private conversionProgress = 0;
  @state() private currentConversionIndex = 0;
  @state() private conversionLogs: ConversionLog[] = [];
  @state() private apiSupported: boolean = "showDirectoryPicker" in window;
  @state() private useFallback: boolean = !("showDirectoryPicker" in window);

  @state() private modalMessage = "";
  @state() private showModal = false;
  @state() private modalType: "info" | "success" | "error" = "info";

  @state() private scaleOptions: ScaleOption[] = [
    { scale: 1, label: "1.0x (기본)", suffix: "" },
    { scale: 1.5, label: "1.5x", suffix: "@1.5x" },
    { scale: 2, label: "2.0x", suffix: "@2x" },
  ];

  protected override createRenderRoot() {
    return this;
  }

  private showAlert(
    message: string,
    type: "info" | "success" | "error" = "info"
  ) {
    this.modalMessage = message;
    this.modalType = type;
    this.showModal = true;
  }

  private addLog(
    text: string,
    type: "info" | "success" | "error" | "warning" = "info"
  ) {
    const timestamp = new Date().toLocaleTimeString();
    this.conversionLogs = [{ timestamp, text, type }, ...this.conversionLogs];
  }

  private handleTabChange(tab: "svg" | "audio" | "rename") {
    if (this.isConverting) return;
    this.activeTab = tab;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
  }

  private handleChangeSuffix(scale: number, suffix: string) {
    this.scaleOptions = this.scaleOptions.map((opt) =>
      opt.scale === scale ? { ...opt, suffix } : opt
    );
  }

  private updateStaticElements(lang: "ko" | "en") {
    const faqKo = document.getElementById("faq-ko");
    const faqEn = document.getElementById("faq-en");
    const footerKo = document.getElementById("footer-ko");
    const footerEn = document.getElementById("footer-en");

    if (faqKo && faqEn && footerKo && footerEn) {
      if (lang === "ko") {
        faqKo.classList.remove("hidden");
        faqEn.classList.add("hidden");
        footerKo.classList.remove("hidden");
        footerEn.classList.add("hidden");
      } else {
        faqKo.classList.add("hidden");
        faqEn.classList.remove("hidden");
        footerKo.classList.add("hidden");
        footerEn.classList.remove("hidden");
      }
    }
  }

  private handleLangChange(lang: "ko" | "en") {
    this.currentLang = lang;
    localStorage.setItem("batcher-lang", lang);
    this.updateStaticElements(lang);
  }

  override firstUpdated() {
    const savedLang = localStorage.getItem("batcher-lang");
    if (savedLang === "en" || savedLang === "ko") {
      this.currentLang = savedLang as "ko" | "en";
    }
    this.updateStaticElements(this.currentLang);
  }

  private getRenameExtensions(): string[] {
    if (!this.renameExtFilter.trim()) return ["*"];
    return this.renameExtFilter
      .split(",")
      .map(ext => ext.trim().toLowerCase())
      .filter(Boolean)
      .map(ext => ext.startsWith(".") ? ext : `.${ext}`);
  }

  private async selectFolder() {
    if (!this.apiSupported) {
      this.showAlert(t[this.currentLang].compatAlert, "info");
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({
        mode: "readwrite",
      });

      const files: BatchFile[] = [];
      this.conversionProgress = 0;

      if (this.activeTab === "svg") {
        this.svgDirHandle = handle;
        this.svgFiles = [];
        await scanDirectory(this.svgDirHandle, "", files, ".svg", this.svgOutputDirHandle);
        this.svgFiles = files;

        if (this.svgFiles.length === 0) {
          this.showAlert(t[this.currentLang].noSvgInFolder, "error");
        } else {
          this.addLog(t[this.currentLang].folderScanDone(this.svgFiles.length));
        }
      } else if (this.activeTab === "audio") {
        this.audioDirHandle = handle;
        this.audioFiles = [];
        await scanDirectory(this.audioDirHandle, "", files, this.audioInputExts, this.audioOutputDirHandle);
        this.audioFiles = files;

        if (this.audioFiles.length === 0) {
          this.showAlert(t[this.currentLang].noWavInFolder, "error");
        } else {
          this.addLog(t[this.currentLang].folderScanDone(this.audioFiles.length));
        }
      } else {
        this.renameDirHandle = handle;
        this.renameFiles = [];
        const exts = this.getRenameExtensions();
        await scanDirectory(this.renameDirHandle, "", files, exts);
        this.renameFiles = files.map(f => ({
          ...f,
          originalName: f.name,
          newName: f.name
        }));

        if (this.renameFiles.length === 0) {
          this.showAlert(t[this.currentLang].noRenameFiles, "error");
        } else {
          this.addLog(t[this.currentLang].folderScanDone(this.renameFiles.length));
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error(err);
        this.showAlert(t[this.currentLang].folderPermissionFail(err.message), "error");
      }
    }
  }

  private async selectOutputFolder() {
    if (!this.apiSupported) {
      this.showAlert(t[this.currentLang].compatAlert, "info");
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({
        mode: "readwrite",
      });

      if (this.activeTab === "svg") {
        this.svgOutputDirHandle = handle;
        this.addLog(t[this.currentLang].outputFolderSet(this.svgOutputDirHandle.name), "info");
      } else {
        this.audioOutputDirHandle = handle;
        this.addLog(t[this.currentLang].outputFolderSet(this.audioOutputDirHandle.name), "info");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error(err);
        this.showAlert(t[this.currentLang].folderPermissionFail(err.message), "error");
      }
    }
  }

  private appendFiles(files: FileList | File[], isDropped = false) {
    this.conversionProgress = 0;
    const isSvg = this.activeTab === "svg";
    const isAudio = this.activeTab === "audio";
    const exts = isSvg ? [".svg"] : isAudio ? this.audioInputExts : this.getRenameExtensions();
    const newBatchFiles: BatchFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const hasMatchedExt = exts.includes("*") || exts.some(ext => file.name.toLowerCase().endsWith(ext));
      if (hasMatchedExt) {
        newBatchFiles.push({
          name: file.name,
          file: file,
          relativePath: file.webkitRelativePath || file.name,
          status: "pending",
          selected: true,
          originalName: file.name,
          newName: file.name,
        });
      }
    }

    if (newBatchFiles.length === 0) {
      if (isSvg) {
        this.showAlert(t[this.currentLang].noFallbackSvg, "error");
      } else if (isAudio) {
        this.showAlert(t[this.currentLang].noFallbackWav, "error");
      } else {
        this.showAlert(this.currentLang === "ko" ? "선택한 확장자의 파일을 찾을 수 없습니다." : "No files matched the selected extensions.", "error");
      }
      return;
    }

    const activeT = t[this.currentLang];

    if (isSvg) {
      const currentPaths = new Set(this.svgFiles.map((f) => f.relativePath));
      const filteredNew = newBatchFiles.filter((f) => !currentPaths.has(f.relativePath));
      this.svgFiles = [...this.svgFiles, ...filteredNew];
      const count = filteredNew.length;
      if (count > 0) {
        this.addLog(isDropped ? activeT.filesDropped(count) : activeT.fallbackUploadDone(count), "success");
      }
    } else if (isAudio) {
      const currentPaths = new Set(this.audioFiles.map((f) => f.relativePath));
      const filteredNew = newBatchFiles.filter((f) => !currentPaths.has(f.relativePath));
      this.audioFiles = [...this.audioFiles, ...filteredNew];
      const count = filteredNew.length;
      if (count > 0) {
        this.addLog(isDropped ? activeT.filesDropped(count) : activeT.fallbackUploadDone(count), "success");
      }
    } else {
      const currentPaths = new Set(this.renameFiles.map((f) => f.relativePath));
      const filteredNew = newBatchFiles.filter((f) => !currentPaths.has(f.relativePath));
      this.renameFiles = [...this.renameFiles, ...filteredNew];
      const count = filteredNew.length;
      if (count > 0) {
        this.addLog(isDropped ? activeT.filesDropped(count) : activeT.fallbackUploadDone(count), "success");
      }
    }
  }

  private handleFallbackUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;
    this.appendFiles(files, false);
    target.value = ""; // Reset so same file can be uploaded again
  }

  private handleDropFiles(e: CustomEvent<FileList>) {
    const files = e.detail;
    if (!files || files.length === 0) return;
    this.appendFiles(files, true);
  }

  private handleChangeInputExts(e: CustomEvent<string[]>) {
    this.audioInputExts = e.detail;
    if (this.audioDirHandle) {
      this.reScanAudioDirectory();
    }
  }

  private async reScanAudioDirectory() {
    if (!this.audioDirHandle) return;
    try {
      const files: BatchFile[] = [];
      await scanDirectory(
        this.audioDirHandle,
        "",
        files,
        this.audioInputExts,
        this.audioOutputDirHandle
      );
      this.audioFiles = files;
      this.addLog(t[this.currentLang].folderScanDone(this.audioFiles.length));
    } catch (err: any) {
      console.error("Failed to re-scan audio directory", err);
    }
  }

  private async reScanRenameDirectory() {
    if (!this.renameDirHandle) return;
    try {
      const files: BatchFile[] = [];
      const exts = this.getRenameExtensions();
      await scanDirectory(this.renameDirHandle, "", files, exts);
      this.renameFiles = files.map(f => ({
        ...f,
        originalName: f.name,
        newName: f.name
      }));
      this.addLog(t[this.currentLang].folderScanDone(this.renameFiles.length));
    } catch (err: any) {
      console.error("Failed to re-scan rename directory", err);
    }
  }

  private loadSampleFile() {
    this.conversionProgress = 0;
    const isSvg = this.activeTab === "svg";
    const isAudio = this.activeTab === "audio";
    const activeT = t[this.currentLang];

    if (isSvg) {
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
      const file = new File([svgString], "sample.svg", { type: "image/svg+xml" });
      
      const sampleBatchFile: BatchFile = {
        name: file.name,
        file: file,
        relativePath: file.name,
        status: "pending",
        selected: true,
      };

      this.svgFiles = [sampleBatchFile, ...this.svgFiles.filter((f) => f.relativePath !== file.name)];
      this.addLog(activeT.sampleFileAdded("SVG"), "success");
      this.showAlert(activeT.sampleFileAdded("SVG"), "success");
    } else if (isAudio) {
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

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + numSamples * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // Raw PCM
      view.setUint16(22, 1, true); // Mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
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

      const blob = new Blob([buffer], { type: 'audio/wav' });
      const file = new File([blob], 'sample.wav', { type: 'audio/wav' });

      const sampleBatchFile: BatchFile = {
        name: file.name,
        file: file,
        relativePath: file.name,
        status: "pending",
        selected: true,
      };

      this.audioFiles = [sampleBatchFile, ...this.audioFiles.filter((f) => f.relativePath !== file.name)];
      this.addLog(activeT.sampleFileAdded("WAV"), "success");
      this.showAlert(activeT.sampleFileAdded("WAV"), "success");
    } else {
      const fileNames = ["report_draft_2026.txt", "vacation_photo (1).jpg", "[draft] logo_final.png", "temp_cache.tmp"];
      const newFiles: BatchFile[] = fileNames.map(name => {
        const file = new File(["dummy content"], name, { type: "text/plain" });
        return {
          name,
          file,
          relativePath: name,
          status: "pending",
          selected: true,
          originalName: name,
          newName: name
        };
      });

      this.renameFiles = [...newFiles, ...this.renameFiles.filter(f => !fileNames.includes(f.name))];
      this.addLog(activeT.sampleFileAdded("TXT/IMG"), "success");
      this.showAlert(activeT.sampleFileAdded("TXT/IMG"), "success");
    }
  }

  private saveRenameHistory() {
    const currentNewNames = this.renameFiles.map(f => f.newName || f.name);
    this.renameHistoryStack = [...this.renameHistoryStack, currentNewNames];
    if (this.renameHistoryStack.length > 10) {
      this.renameHistoryStack.shift();
    }
  }

  private handleUndoRename() {
    if (this.renameHistoryStack.length === 0) return;
    const previousNames = this.renameHistoryStack.pop()!;
    this.renameFiles = this.renameFiles.map((file, idx) => {
      if (idx < previousNames.length) {
        return { ...file, newName: previousNames[idx] };
      }
      return file;
    });
    this.addLog(this.currentLang === "ko" ? "마지막 변경 사항을 실행 취소했습니다." : "Undid the last rename rule.", "info");
    this.requestUpdate();
  }

  private handleResetNames() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map(file => ({
      ...file,
      newName: file.originalName || file.name
    }));
    this.addLog(this.currentLang === "ko" ? "모든 파일명을 원래 이름으로 복원했습니다." : "Restored all filenames to original.", "info");
    this.requestUpdate();
  }

  private handleApplyReplace(e: CustomEvent<{ find: string; replace: string }>) {
    const { find, replace } = e.detail;
    if (!find) return;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map(file => {
      if (!file.selected) return file;
      const currentName = file.newName || file.name;
      const lastDot = currentName.lastIndexOf(".");
      const base = lastDot !== -1 ? currentName.substring(0, lastDot) : currentName;
      const ext = lastDot !== -1 ? currentName.substring(lastDot) : "";
      
      const newBase = base.split(find).join(replace);
      return { ...file, newName: newBase + ext };
    });
    this.addLog(this.currentLang === "ko" ? `문자열 치환 적용: "${find}" → "${replace}"` : `Applied text replace: "${find}" → "${replace}"`, "info");
    this.requestUpdate();
  }

  private handleApplyPrefix(e: CustomEvent<{ text: string }>) {
    const { text } = e.detail;
    if (!text) return;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map(file => {
      if (!file.selected) return file;
      const currentName = file.newName || file.name;
      return { ...file, newName: text + currentName };
    });
    this.addLog(this.currentLang === "ko" ? `앞이름 추가 적용: "${text}"` : `Applied prefix: "${text}"`, "info");
    this.requestUpdate();
  }

  private handleApplySuffix(e: CustomEvent<{ text: string }>) {
    const { text } = e.detail;
    if (!text) return;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map(file => {
      if (!file.selected) return file;
      const currentName = file.newName || file.name;
      const lastDot = currentName.lastIndexOf(".");
      const base = lastDot !== -1 ? currentName.substring(0, lastDot) : currentName;
      const ext = lastDot !== -1 ? currentName.substring(lastDot) : "";
      return { ...file, newName: base + text + ext };
    });
    this.addLog(this.currentLang === "ko" ? `뒷이름 추가 적용: "${text}"` : `Applied suffix: "${text}"`, "info");
    this.requestUpdate();
  }

  private handleApplyRemove(e: CustomEvent<{ start: number; len: number }>) {
    const { start, len } = e.detail;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map(file => {
      if (!file.selected) return file;
      const currentName = file.newName || file.name;
      const lastDot = currentName.lastIndexOf(".");
      const base = lastDot !== -1 ? currentName.substring(0, lastDot) : currentName;
      const ext = lastDot !== -1 ? currentName.substring(lastDot) : "";

      const startIdx = start - 1;
      if (startIdx < 0 || startIdx >= base.length) return file;
      const newBase = base.substring(0, startIdx) + base.substring(startIdx + len);
      return { ...file, newName: newBase + ext };
    });
    this.addLog(this.currentLang === "ko" ? `위치 기준 지우기 적용 (시작: ${start}, 길이: ${len})` : `Applied remove at index (start: ${start}, len: ${len})`, "info");
    this.requestUpdate();
  }

  private handleKeepNumbers() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map(file => {
      if (!file.selected) return file;
      const currentName = file.newName || file.name;
      const lastDot = currentName.lastIndexOf(".");
      const base = lastDot !== -1 ? currentName.substring(0, lastDot) : currentName;
      const ext = lastDot !== -1 ? currentName.substring(lastDot) : "";

      const newBase = base.replace(/[^0-9]/g, "");
      return { ...file, newName: newBase + ext };
    });
    this.addLog(this.currentLang === "ko" ? "숫자만 남기기 적용" : "Applied keep only numbers", "info");
    this.requestUpdate();
  }

  private handleRemoveBrackets() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map(file => {
      if (!file.selected) return file;
      const currentName = file.newName || file.name;
      const lastDot = currentName.lastIndexOf(".");
      const base = lastDot !== -1 ? currentName.substring(0, lastDot) : currentName;
      const ext = lastDot !== -1 ? currentName.substring(lastDot) : "";

      const newBase = base
        .replace(/\[[^\]]*\]/g, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/\{[^}]*\}/g, "")
        .trim();
      return { ...file, newName: newBase + ext };
    });
    this.addLog(this.currentLang === "ko" ? "괄호 안 내용 지우기 적용" : "Applied remove text inside brackets", "info");
    this.requestUpdate();
  }

  private handleApplyNumbering(e: CustomEvent<{ start: number; digits: number; position: "prefix" | "suffix" }>) {
    const { start, digits, position } = e.detail;
    this.saveRenameHistory();
    let currentNumber = start;
    this.renameFiles = this.renameFiles.map(file => {
      if (!file.selected) return file;
      const currentName = file.newName || file.name;
      const lastDot = currentName.lastIndexOf(".");
      const base = lastDot !== -1 ? currentName.substring(0, lastDot) : currentName;
      const ext = lastDot !== -1 ? currentName.substring(lastDot) : "";

      const formattedNum = String(currentNumber).padStart(digits, "0");
      currentNumber++;

      let newName = currentName;
      if (position === "prefix") {
        newName = formattedNum + base + ext;
      } else {
        newName = base + formattedNum + ext;
      }
      return { ...file, newName };
    });
    this.addLog(this.currentLang === "ko" ? `일련번호 추가 적용 (시작: ${start}, 자릿수: ${digits})` : `Applied numbering (start: ${start}, digits: ${digits})`, "info");
    this.requestUpdate();
  }

  private handleApplyExtension(e: CustomEvent<{ mode: "keep" | "remove" | "change"; newExt: string }>) {
    const { mode, newExt } = e.detail;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map(file => {
      if (!file.selected) return file;
      const currentName = file.newName || file.name;
      const lastDot = currentName.lastIndexOf(".");
      const base = lastDot !== -1 ? currentName.substring(0, lastDot) : currentName;

      let newName = currentName;
      if (mode === "remove") {
        newName = base;
      } else if (mode === "change") {
        const formattedExt = newExt.startsWith(".") ? newExt : `.${newExt}`;
        newName = base + formattedExt;
      }
      return { ...file, newName };
    });
    this.addLog(this.currentLang === "ko" ? `확장자 변경 적용 (모드: ${mode}${newExt ? `, 새 확장자: ${newExt}` : ""})` : `Applied extension operation (mode: ${mode}${newExt ? `, ext: ${newExt}` : ""})`, "info");
    this.requestUpdate();
  }

  private handleApplyClearFilename() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map(file => {
      if (!file.selected) return file;
      const currentName = file.newName || file.name;
      const lastDot = currentName.lastIndexOf(".");
      const ext = lastDot !== -1 ? currentName.substring(lastDot) : "";
      return { ...file, newName: ext };
    });
    this.addLog(this.currentLang === "ko" ? "파일명 전체 삭제 적용" : "Applied clear entire filename", "info");
    this.requestUpdate();
  }

  private handleChangeFileNewName(e: CustomEvent<{ relativePath: string; newName: string }>) {
    const { relativePath, newName } = e.detail;
    this.renameFiles = this.renameFiles.map(file => {
      if (file.relativePath === relativePath) {
        return { ...file, newName };
      }
      return file;
    });
    this.requestUpdate();
  }

  private async startConversion() {
    if (this.activeTab === "svg") {
      await this.startSvgConversion();
    } else if (this.activeTab === "audio") {
      await this.startAudioConversion();
    } else {
      await this.startRenameConversion();
    }
  }

  private async startRenameConversion() {
    if (this.renameFiles.length === 0) {
      this.showAlert(t[this.currentLang].noRenameFiles, "error");
      return;
    }

    const selectedFiles = this.renameFiles.filter((f) => f.selected);
    if (selectedFiles.length === 0) {
      this.showAlert(t[this.currentLang].noSelectedRename, "error");
      return;
    }

    this.isConverting = true;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
    this.addLog(t[this.currentLang].startRenameProcess, "info");

    const activeT = t[this.currentLang];

    try {
      const result = await batchRenameFiles({
        selectedFiles,
        dirHandle: this.renameDirHandle,
        apiSupported: this.apiSupported,
        useFallback: this.useFallback,
        t: activeT,
        onProgress: (progress, currentIndex) => {
          this.conversionProgress = progress;
          this.currentConversionIndex = currentIndex;
        },
        onFileStatusChange: (relativePath, status, errorMsg) => {
          this.renameFiles = this.renameFiles.map((file) =>
            file.relativePath === relativePath ? { ...file, status, errorMsg } : file
          );
        },
        onLog: (text, type) => {
          this.addLog(text, type);
        },
      });

      this.isConverting = false;

      if (result.successCount > 0) {
        this.showAlert(
          activeT.alertRenameSuccessText(result.isLocalDirMode),
          "success"
        );
        
        this.renameFiles = this.renameFiles.map((file) => {
          if (file.selected && file.status === "success") {
            const updatedName = file.newName || file.name;
            const parts = file.relativePath.split("/");
            parts[parts.length - 1] = updatedName;
            const updatedRelativePath = parts.join("/");
            return {
              ...file,
              name: updatedName,
              originalName: updatedName,
              relativePath: updatedRelativePath,
              status: "pending"
            };
          }
          return file;
        });
      } else {
        this.showAlert(activeT.alertFail, "error");
      }
    } catch (err: any) {
      console.error(err);
      this.isConverting = false;
      this.showAlert(err.message || "이름 변경 중 오류 발생", "error");
    }
  }

  private async handleDeleteSelectedFiles() {
    const selectedFiles = this.renameFiles.filter((f) => f.selected);
    if (selectedFiles.length === 0) {
      this.showAlert(t[this.currentLang].noSelectedRename, "error");
      return;
    }

    const confirmed = confirm(t[this.currentLang].alertDeleteConfirm(selectedFiles.length));
    if (!confirmed) return;

    this.isConverting = true;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
    this.addLog("파일 삭제 프로세스를 시작합니다...", "info");

    const activeT = t[this.currentLang];

    try {
      const result = await batchDeleteFiles({
        selectedFiles,
        dirHandle: this.renameDirHandle,
        t: activeT,
        onProgress: (progress, currentIndex) => {
          this.conversionProgress = progress;
          this.currentConversionIndex = currentIndex;
        },
        onFileStatusChange: (relativePath, status, errorMsg) => {
          this.renameFiles = this.renameFiles.map((file) =>
            file.relativePath === relativePath ? { ...file, status, errorMsg } : file
          );
        },
        onLog: (text, type) => {
          this.addLog(text, type);
        },
      });

      this.isConverting = false;

      const deletedPaths = new Set(
        selectedFiles.filter((f) => f.status === "success").map((f) => f.relativePath)
      );
      this.renameFiles = this.renameFiles.filter((file) => !deletedPaths.has(file.relativePath));

      this.showAlert(
        activeT.alertDeleteSuccess(result.successCount, result.failCount),
        result.successCount > 0 ? "success" : "error"
      );
    } catch (err: any) {
      console.error(err);
      this.isConverting = false;
      this.showAlert(err.message || "파일 삭제 중 오류 발생", "error");
    }
  }

  private async startSvgConversion() {
    if (this.svgFiles.length === 0) {
      this.showAlert(t[this.currentLang].noSvgToConvert, "error");
      return;
    }

    const selectedFiles = this.svgFiles.filter((f) => f.selected);
    if (selectedFiles.length === 0) {
      this.showAlert(t[this.currentLang].noSelectedSvg, "error");
      return;
    }

    const scaleObj = this.scaleOptions.find((s) => s.scale === this.selectedScale);
    if (!scaleObj) {
      this.showAlert(t[this.currentLang].invalidScale, "error");
      return;
    }

    this.isConverting = true;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
    this.addLog(
      t[this.currentLang].startConversion(this.exportFormat, scaleObj.scale),
      "info"
    );

    const activeT = t[this.currentLang];

    try {
      const result = await batchConvertSvg({
        selectedFiles,
        exportFormat: this.exportFormat,
        selectedScale: this.selectedScale,
        scaleSuffix: scaleObj.suffix,
        deleteOriginal: this.svgDeleteOriginal,
        dirHandle: this.svgDirHandle,
        outputDirHandle: this.svgOutputDirHandle,
        apiSupported: this.apiSupported,
        useFallback: this.useFallback,
        t: activeT,
        onProgress: (progress, currentIndex) => {
          this.conversionProgress = progress;
          this.currentConversionIndex = currentIndex;
        },
        onFileStatusChange: (relativePath, status, errorMsg) => {
          this.svgFiles = this.svgFiles.map((file) =>
            file.relativePath === relativePath ? { ...file, status, errorMsg } : file
          );
        },
        onLog: (text, type) => {
          this.addLog(text, type);
        },
      });

      this.isConverting = false;
      const isLocalDirMode = !!(this.apiSupported && this.svgDirHandle && !this.useFallback);
      const hasOutputDir = this.svgOutputDirHandle !== null;

      if (result.successCount > 0) {
        this.showAlert(
          activeT.alertSuccessText(
            isLocalDirMode,
            hasOutputDir,
            this.svgOutputDirHandle ? this.svgOutputDirHandle.name : ""
          ),
          "success"
        );
      } else {
        this.showAlert(activeT.alertFail, "error");
      }
    } catch (err: any) {
      console.error(err);
      this.isConverting = false;
      this.showAlert(err.message || "변환 오류 발생", "error");
    }
  }

  private async startAudioConversion() {
    if (this.audioFiles.length === 0) {
      this.showAlert(t[this.currentLang].noWavToConvert, "error");
      return;
    }

    const selectedFiles = this.audioFiles.filter((f) => f.selected);
    if (selectedFiles.length === 0) {
      this.showAlert(t[this.currentLang].noSelectedWav, "error");
      return;
    }

    this.isConverting = true;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
    this.addLog(t[this.currentLang].startAudioConversion(this.audioBitrate), "info");

    const activeT = t[this.currentLang];

    try {
      const result = await batchConvertAudio({
        selectedFiles,
        bitrate: this.audioBitrate,
        deleteOriginal: this.audioDeleteOriginal,
        dirHandle: this.audioDirHandle,
        outputDirHandle: this.audioOutputDirHandle,
        apiSupported: this.apiSupported,
        useFallback: this.useFallback,
        t: activeT,
        onProgress: (progress, currentIndex) => {
          this.conversionProgress = progress;
          this.currentConversionIndex = currentIndex;
        },
        onFileStatusChange: (relativePath, status, errorMsg) => {
          this.audioFiles = this.audioFiles.map((file) =>
            file.relativePath === relativePath ? { ...file, status, errorMsg } : file
          );
        },
        onLog: (text, type) => {
          this.addLog(text, type);
        },
      });

      this.isConverting = false;
      const isLocalDirMode = !!(this.apiSupported && this.audioDirHandle && !this.useFallback);
      const hasOutputDir = this.audioOutputDirHandle !== null;

      if (result.successCount > 0) {
        this.showAlert(
          activeT.alertAudioSuccessText(
            isLocalDirMode,
            hasOutputDir,
            this.audioOutputDirHandle ? this.audioOutputDirHandle.name : ""
          ),
          "success"
        );
      } else {
        this.showAlert(activeT.alertFail, "error");
      }
    } catch (err: any) {
      console.error(err);
      this.isConverting = false;
      this.showAlert(err.message || "변환 오류 발생", "error");
    }
  }

  private handleToggleFileSelected(e: CustomEvent<BatchFile>) {
    const targetFile = e.detail;
    if (this.activeTab === "svg") {
      this.svgFiles = this.svgFiles.map((file) =>
        file.relativePath === targetFile.relativePath
          ? { ...file, selected: !file.selected }
          : file
      );
    } else if (this.activeTab === "audio") {
      this.audioFiles = this.audioFiles.map((file) =>
        file.relativePath === targetFile.relativePath
          ? { ...file, selected: !file.selected }
          : file
      );
    } else {
      this.renameFiles = this.renameFiles.map((file) =>
        file.relativePath === targetFile.relativePath
          ? { ...file, selected: !file.selected }
          : file
      );
    }
  }

  private handleToggleAllFiles(e: CustomEvent<boolean>) {
    const checked = e.detail;
    if (this.activeTab === "svg") {
      this.svgFiles = this.svgFiles.map((file) => ({
        ...file,
        selected: checked,
      }));
    } else if (this.activeTab === "audio") {
      this.audioFiles = this.audioFiles.map((file) => ({
        ...file,
        selected: checked,
      }));
    } else {
      this.renameFiles = this.renameFiles.map((file) => ({
        ...file,
        selected: checked,
      }));
    }
  }

  private handleDeleteFile(e: CustomEvent<BatchFile>) {
    const fileToDelete = e.detail;
    if (this.activeTab === "svg") {
      this.svgFiles = this.svgFiles.filter((file) => file.relativePath !== fileToDelete.relativePath);
    } else if (this.activeTab === "audio") {
      this.audioFiles = this.audioFiles.filter((file) => file.relativePath !== fileToDelete.relativePath);
    } else {
      this.renameFiles = this.renameFiles.filter((file) => file.relativePath !== fileToDelete.relativePath);
    }
    this.addLog(t[this.currentLang].queueRemoved(fileToDelete.name), "info");
  }

  private handleDeleteSelectedFromQueue(e: CustomEvent<BatchFile[]>) {
    const filesToDelete = e.detail;
    const pathsToDelete = new Set(filesToDelete.map(f => f.relativePath));
    
    if (this.activeTab === "svg") {
      this.svgFiles = this.svgFiles.filter((file) => !pathsToDelete.has(file.relativePath));
    } else if (this.activeTab === "audio") {
      this.audioFiles = this.audioFiles.filter((file) => !pathsToDelete.has(file.relativePath));
    } else {
      this.renameFiles = this.renameFiles.filter((file) => !pathsToDelete.has(file.relativePath));
    }
    
    this.addLog(
      this.currentLang === "ko"
        ? `선택한 ${filesToDelete.length}개의 파일을 대기열에서 삭제했습니다.`
        : `Removed ${filesToDelete.length} selected files from the queue.`,
      "info"
    );
  }

  private resetAll() {
    if (this.activeTab === "svg") {
      this.svgDirHandle = null;
      this.svgOutputDirHandle = null;
      this.svgFiles = [];
    } else if (this.activeTab === "audio") {
      this.audioDirHandle = null;
      this.audioOutputDirHandle = null;
      this.audioFiles = [];
    } else {
      this.renameDirHandle = null;
      this.renameFiles = [];
      this.renameHistoryStack = [];
    }
    this.isConverting = false;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
  }

  protected override updated(changedProperties: Map<PropertyKey, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has("conversionProgress") || changedProperties.has("isConverting")) {
      const progressBar = this.renderRoot.querySelector(".progress-bar-inner") as HTMLElement;
      if (progressBar) {
        progressBar.style.width = `${this.conversionProgress}%`;
      }
    }
  }

  protected override render() {
    const activeT = t[this.currentLang];
    const isSvg = this.activeTab === "svg";
    const isAudio = this.activeTab === "audio";
    const isRename = this.activeTab === "rename";

    const currentFiles = isSvg ? this.svgFiles : isAudio ? this.audioFiles : this.renameFiles;
    const selectedFilesCount = currentFiles.filter((f) => f.selected).length;

    // SVG suffix template
    const selectedOption = this.scaleOptions.find((o) => o.scale === this.selectedScale);
    const suffixTemplate =
      isSvg && selectedOption?.suffix
        ? html`
            <span class="text-slate-700 hidden md:inline">|</span>
            <span>
              ${activeT.suffix}
              <strong class="text-emerald-400 font-mono">${selectedOption.suffix}</strong>
            </span>
          `
        : "";

    return html`
      <div class="max-w-7xl mx-auto px-4 py-8 flex flex-col min-h-screen pb-32">
        <!-- Header -->
        <app-header
          .lang="${this.currentLang}"
          @change-lang="${(e: CustomEvent<"ko" | "en">) => this.handleLangChange(e.detail)}"
        ></app-header>

        <!-- Tabs Navigation -->
        <div class="flex items-center gap-2 p-1.5 bg-slate-900/40 border border-white/5 rounded-2xl w-full max-w-lg mx-auto mb-8 shadow-inner backdrop-blur-md">
          <button
            @click="${() => this.handleTabChange("svg")}"
            ?disabled="${this.isConverting}"
            class="flex-1 py-3 px-4 rounded-xl text-xs font-bold font-sans transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isSvg
              ? "bg-indigo-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]"
              : "text-slate-400 hover:text-slate-200"}"
          >
            <i class="fa-solid fa-file-image"></i>
            <span>${locales[this.currentLang].tabs.svg}</span>
          </button>
          <button
            @click="${() => this.handleTabChange("audio")}"
            ?disabled="${this.isConverting}"
            class="flex-1 py-3 px-4 rounded-xl text-xs font-bold font-sans transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isAudio
              ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]"
              : "text-slate-400 hover:text-slate-200"}"
          >
            <i class="fa-solid fa-music"></i>
            <span>${locales[this.currentLang].tabs.audio}</span>
          </button>
          <button
            @click="${() => this.handleTabChange("rename")}"
            ?disabled="${this.isConverting}"
            class="flex-1 py-3 px-4 rounded-xl text-xs font-bold font-sans transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isRename
              ? "bg-pink-600 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)]"
              : "text-slate-400 hover:text-slate-200"}"
          >
            <i class="fa-solid fa-file-signature"></i>
            <span>${locales[this.currentLang].tabs.rename}</span>
          </button>
        </div>

        <!-- Browser Compatibility Alert Banner -->
        ${!this.apiSupported
          ? html`
              <div class="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-sm flex items-start gap-3">
                <i class="fa-solid fa-triangle-exclamation text-lg mt-0.5 shrink-0 font-sans"></i>
                <div class="font-sans">
                  <span class="font-bold">${activeT.compatBannerTitle}</span>
                  ${isRename 
                    ? activeT.compatRenameBannerText 
                    : activeT.compatBannerText(
                        isSvg
                          ? (this.svgOutputDirHandle ? this.svgOutputDirHandle.name : "converted_images")
                          : (this.audioOutputDirHandle ? this.audioOutputDirHandle.name : "converted_audio")
                      )}
                </div>
              </div>
            `
          : ""}

        <!-- Main Layout Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-1">
          <!-- Left Control Settings Panel (cols-5) -->
          <div class="lg:col-span-5">
            ${isSvg
              ? html`
                  <settings-panel
                    .lang="${this.currentLang}"
                    .apiSupported="${this.apiSupported}"
                    .dirHandle="${this.svgDirHandle}"
                    .svgFilesCount="${this.svgFiles.length}"
                    .exportFormat="${this.exportFormat}"
                    .selectedScale="${this.selectedScale}"
                    .scaleOptions="${this.scaleOptions}"
                    .outputDirHandle="${this.svgOutputDirHandle}"
                    .deleteOriginal="${this.svgDeleteOriginal}"
                    .isConverting="${this.isConverting}"
                    .conversionProgress="${this.conversionProgress}"
                    @select-folder="${this.selectFolder}"
                    @select-output-folder="${this.selectOutputFolder}"
                    @reset-output-folder="${() => (this.svgOutputDirHandle = null)}"
                    @upload-files="${(e: CustomEvent) => this.handleFallbackUpload(e.detail)}"
                    @load-sample="${this.loadSampleFile}"
                    @change-format="${(e: CustomEvent<"png" | "jpg">) => (this.exportFormat = e.detail)}"
                    @change-scale="${(e: CustomEvent<number>) => (this.selectedScale = e.detail)}"
                    @change-suffix="${(e: CustomEvent<{ scale: number; suffix: string }>) =>
                      this.handleChangeSuffix(e.detail.scale, e.detail.suffix)}"
                    @toggle-delete="${() => (this.svgDeleteOriginal = !this.svgDeleteOriginal)}"
                  ></settings-panel>
                `
              : isAudio
              ? html`
                  <audio-settings-panel
                    .lang="${this.currentLang}"
                    .apiSupported="${this.apiSupported}"
                    .dirHandle="${this.audioDirHandle}"
                    .filesCount="${this.audioFiles.length}"
                    .bitrate="${this.audioBitrate}"
                    .outputDirHandle="${this.audioOutputDirHandle}"
                    .deleteOriginal="${this.audioDeleteOriginal}"
                    .isConverting="${this.isConverting}"
                    .conversionProgress="${this.conversionProgress}"
                    .inputExts="${this.audioInputExts}"
                    @select-folder="${this.selectFolder}"
                    @select-output-folder="${this.selectOutputFolder}"
                    @reset-output-folder="${() => (this.audioOutputDirHandle = null)}"
                    @upload-files="${(e: CustomEvent) => this.handleFallbackUpload(e.detail)}"
                    @load-sample="${this.loadSampleFile}"
                    @change-bitrate="${(e: CustomEvent<number>) => (this.audioBitrate = e.detail)}"
                    @toggle-delete="${() => (this.audioDeleteOriginal = !this.audioDeleteOriginal)}"
                    @change-input-exts="${this.handleChangeInputExts}"
                  ></audio-settings-panel>
                `
              : html`
                  <renamer-settings-panel
                    .lang="${this.currentLang}"
                    .apiSupported="${this.apiSupported}"
                    .dirHandle="${this.renameDirHandle}"
                    .filesCount="${this.renameFiles.length}"
                    .extFilter="${this.renameExtFilter}"
                    .isConverting="${this.isConverting}"
                    .conversionProgress="${this.conversionProgress}"
                    @select-folder="${this.selectFolder}"
                    @upload-files="${(e: CustomEvent) => this.handleFallbackUpload(e.detail)}"
                    @load-sample="${this.loadSampleFile}"
                    @change-ext-filter="${(e: CustomEvent<string>) => {
                      this.renameExtFilter = e.detail;
                      if (this.renameDirHandle) {
                        this.reScanRenameDirectory();
                      }
                    }}"
                    @apply-replace="${this.handleApplyReplace}"
                    @apply-prefix="${this.handleApplyPrefix}"
                    @apply-suffix="${this.handleApplySuffix}"
                    @apply-remove="${this.handleApplyRemove}"
                    @apply-keep-numbers="${this.handleKeepNumbers}"
                    @apply-remove-brackets="${this.handleRemoveBrackets}"
                    @apply-numbering="${this.handleApplyNumbering}"
                    @apply-extension="${this.handleApplyExtension}"
                    @apply-clear-filename="${this.handleApplyClearFilename}"
                    @undo-rename="${this.handleUndoRename}"
                    @reset-names="${this.handleResetNames}"
                    @delete-selected="${this.handleDeleteSelectedFiles}"
                    @clear-all-files="${this.resetAll}"
                  ></renamer-settings-panel>
                `}
          </div>

          <!-- Right Real-Time Display & Logger Panel (cols-7) -->
          <div class="lg:col-span-7 space-y-6 flex flex-col">
            <!-- File List Queue -->
            <file-queue
              .lang="${this.currentLang}"
              .files="${currentFiles}"
              .isConverting="${this.isConverting}"
              .activeTab="${this.activeTab}"
              @toggle-file-selected="${this.handleToggleFileSelected}"
              @toggle-all-files="${this.handleToggleAllFiles}"
              @delete-file="${this.handleDeleteFile}"
              @drop-files="${this.handleDropFiles}"
              @load-sample="${this.loadSampleFile}"
              @change-file-new-name="${this.handleChangeFileNewName}"
              @delete-selected-from-queue="${this.handleDeleteSelectedFromQueue}"
            ></file-queue>

            <!-- Logs Console -->
            <log-console
              .lang="${this.currentLang}"
              .conversionLogs="${this.conversionLogs}"
              @clear-logs="${() => (this.conversionLogs = [])}"
            ></log-console>
          </div>
        </div>
      </div>

      <!-- Floating Bottom Glass Action Bar -->
      <div class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-5xl bg-[rgba(255,255,255,0.75)] dark:bg-[rgba(15,23,42,0.65)] backdrop-blur-[13px] backdrop-saturate-[183%] border border-[rgba(255,255,255,0.35)] dark:border-white/10 py-4.5 px-6 z-40 rounded-3xl shadow-[0px_8px_32px_rgba(31,38,135,0.25)] dark:shadow-[0px_15px_50px_rgba(0,0,0,0.6)] transition-all duration-300 hover:border-[rgba(255,255,255,0.5)] dark:hover:border-white/15">
        <!-- Progress bar along the top inner edge -->
        ${this.isConverting || this.conversionProgress > 0
          ? html`
              <div class="absolute top-0 left-6 right-6 h-1 bg-slate-950/20 dark:bg-white/10 rounded-full overflow-hidden">
                <div class="progress-bar-inner h-full bg-linear-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
              </div>
            `
          : ""}

        <div class="w-full flex flex-col md:flex-row items-center justify-between gap-4">
          <!-- Left side: dynamic info vs progress info -->
          ${this.isConverting || this.conversionProgress > 0
            ? html`
                <div class="flex flex-wrap items-center gap-3 text-xs text-slate-300 font-sans font-bold">
                  <div class="flex items-center gap-2">
                    ${this.isConverting
                      ? html`
                          <span class="relative flex h-2.5 w-2.5">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                          </span>
                          <span class="text-slate-100 font-bold tracking-wide">${isRename ? (this.currentLang === "ko" ? "변경 진행 중..." : "Renaming...") : activeT.converting}</span>
                        `
                      : html`
                          <span class="inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                          <span class="text-emerald-600 font-bold tracking-wide">${isRename ? (this.currentLang === "ko" ? "변경 완료!" : "Rename complete!") : activeT.completed}</span>
                        `}
                  </div>
                  <span class="text-black/10 dark:text-white/10">|</span>
                  <span>
                    ${activeT.progress}
                    <strong class="text-indigo-600 dark:text-indigo-400 font-mono text-xs">${this.conversionProgress}%</strong>
                  </span>
                  <span class="text-black/10 dark:text-white/10 hidden sm:inline">|</span>
                  <span class="hidden sm:inline">
                    ${activeT.doneCount}
                    <strong class="text-emerald-600 dark:text-emerald-400 font-mono">${this.currentConversionIndex}</strong> /
                    ${currentFiles.filter((f) => f.selected).length}
                  </span>
                </div>
              `
            : html`
                <div class="flex flex-wrap items-center gap-4 text-xs text-slate-300 font-bold font-sans">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${selectedFilesCount > 0 ? "bg-indigo-400 animate-ping" : "bg-slate-300 dark:bg-slate-700"}"></span>
                    <span>
                      ${activeT.waitingFiles}
                      <strong class="text-slate-100 font-extrabold">
                        ${selectedFilesCount}${this.currentLang === "ko" ? "개" : ""}
                      </strong>
                      <span class="text-slate-500 dark:text-slate-500 font-normal">
                        / ${currentFiles.length}${this.currentLang === "ko" ? "개" : ""}
                      </span>
                    </span>
                  </div>

                  ${isSvg
                    ? html`
                        <span class="text-black/10 dark:text-white/10 hidden md:inline">|</span>
                        <span>
                          ${activeT.exportFormat}
                          <strong class="text-indigo-600 dark:text-indigo-400 uppercase font-extrabold">${this.exportFormat}</strong>
                        </span>
                        <span class="text-black/10 dark:text-white/10 hidden md:inline">|</span>
                        <span>
                          ${activeT.applyScale}
                          <strong class="text-slate-100 font-mono font-extrabold">${this.selectedScale}x</strong>
                        </span>
                        ${suffixTemplate}
                      `
                    : isAudio
                    ? html`
                        <span class="text-black/10 dark:text-white/10 hidden md:inline">|</span>
                        <span>
                          ${activeT.applyBitrate}
                          <strong class="text-purple-600 dark:text-purple-400 uppercase font-extrabold">${this.audioBitrate} kbps</strong>
                        </span>
                      `
                    : html`
                        <span class="text-black/10 dark:text-white/10 hidden md:inline">|</span>
                        <span>
                          ${this.currentLang === "ko" ? "모드" : "Mode"}:
                          <strong class="text-pink-600 dark:text-pink-400 uppercase font-extrabold">${this.currentLang === "ko" ? "파일 일괄 변경" : "Batch Rename"}</strong>
                        </span>
                      `}
                </div>
              `}

          <div class="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end">
            ${currentFiles.length > 0
              ? html`
                  <button
                    @click="${this.resetAll}"
                    ?disabled="${this.isConverting}"
                    class="flex-1 md:flex-initial w-full md:w-auto px-6 py-3 border border-black/15 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-slate-100 rounded-xl text-xs transition-all flex items-center justify-center gap-2 font-sans cursor-pointer active:scale-95"
                  >
                    <i class="fa-solid fa-rotate-left text-xs"></i>
                    <span>${this.currentLang === "ko" ? "초기화" : "Reset"}</span>
                  </button>
                `
              : ""}

            <button
              @click="${this.startConversion}"
              ?disabled="${this.isConverting || selectedFilesCount === 0}"
              class="flex-1 md:flex-initial w-full md:w-auto px-8 py-3 bg-linear-to-r ${isSvg
                ? "from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500"
                : isAudio
                ? "from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:via-fuchsia-500 hover:to-pink-500"
                : "from-pink-600 via-rose-600 to-red-600 hover:from-pink-500 hover:via-rose-500 hover:to-red-500"} disabled:bg-none disabled:bg-black/5 dark:disabled:bg-white/5 disabled:text-black/30 dark:disabled:text-white/30 disabled:border-black/5 dark:disabled:border-white/5 disabled:cursor-not-allowed disabled:shadow-none hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] active:scale-[0.97] text-white font-bold text-sm tracking-wide rounded-xl border border-white/20 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shrink-0"
            >
              ${this.isConverting
                ? html`
                    <svg class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>${isRename ? (this.currentLang === "ko" ? "변경 중..." : "Renaming...") : activeT.btnConverting}</span>
                  `
                : html`
                    <i class="fa-solid fa-play text-[10px]"></i>
                    <span>${isRename ? (this.currentLang === "ko" ? "이름 변경 적용" : "Apply Rename") : activeT.btnConvert}</span>
                  `}
            </button>
          </div>
        </div>
      </div>

      <!-- Alert Modal Overlay -->
      <alert-modal
        .show="${this.showModal}"
        .message="${this.modalMessage}"
        .type="${this.modalType}"
        @close="${() => (this.showModal = false)}"
      ></alert-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "batcher-app": BatcherApp;
  }
}
