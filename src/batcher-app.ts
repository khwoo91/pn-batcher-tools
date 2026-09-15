/// <reference types="wicg-file-system-access" />
import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import JSZip from "jszip";

import type {
  BatchFile,
  ScaleOption,
  ConversionLog,
  ActiveTabType,
  CodeCleanMode,
  CleanScanResult,
  UnusedFileItem,
  BrokenLinkItem,
  AudioClipItem,
} from "./types";
import { scanDirectory, getNestedDirHandle } from "./utils/fs-utils";
import { batchConvertSvg } from "./services/batch-converter";
import { batchConvertAudio } from "./services/audio-converter";
import { batchRenameFiles, batchDeleteFiles } from "./services/file-renamer";
import { scanProjectResources, executeResourceCleanup } from "./services/resource-cleaner";
import { extractAudioClipInfos } from "./utils/audio-duration-utils";
import { locales } from "./locales";

import {
  applyReplace,
  applyPrefix,
  applySuffix,
  applyRemove,
  applyKeepNumbers,
  applyRemoveBrackets,
  applyNumbering,
  applyExtension,
  applyClearFilename,
} from "./utils/rename-rules";

import {
  generateSampleSvgFile,
  generateSampleWavFile,
  generateSampleRenameFiles,
} from "./utils/sample-generator";

import "./components/app-header";
import "./components/settings-panel";
import "./components/audio-settings-panel";
import "./components/renamer-settings-panel";
import "./components/cleaner-settings-panel";
import "./components/cleaner-results-view";
import "./components/file-queue";
import "./components/log-console";
import "./components/alert-modal";
import "./components/audio-timestamp-modal";

const t = {
  ko: locales.ko.main,
  en: locales.en.main,
};

@customElement("batcher-app")
export class BatcherApp extends LitElement {
  @property({ type: Boolean, attribute: "hide-header" }) hideHeader = false;
  @state() private activeTab: ActiveTabType = "svg";
  @state() private currentLang: "ko" | "en" = (() => {
    const saved = localStorage.getItem("batcher-lang");
    if (saved === "ko" || saved === "en") return saved;
    return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
  })();

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
  @state() private isExtractingTimestamps = false;
  @state() private showTimestampModal = false;
  @state() private extractedAudioClips: AudioClipItem[] = [];

  // Rename specific states
  @state() private renameDirHandle: FileSystemDirectoryHandle | null = null;
  @state() private renameFiles: BatchFile[] = [];
  @state() private renameExtFilter = "";
  @state() private renameHistoryStack: string[][] = [];

  // Resource Cleaner specific states
  @state() private resourceDirHandle: FileSystemDirectoryHandle | null = null;
  @state() private resourceFiles: BatchFile[] = [];
  @state() private resourceCodeCleanMode: CodeCleanMode = "comment";
  @state() private isResourceScanning = false;
  @state() private isResourceExecuting = false;
  @state() private resourceScanResult: CleanScanResult | null = null;
  @state() private resourceSelectedRootSegment: string = "";

  // Shared UI states
  @state() private isConverting = false;
  @state() private conversionProgress = 0;
  @state() private currentConversionIndex = 0;
  @state() private conversionLogs: ConversionLog[] = [];
  @state() private apiSupported: boolean = "showDirectoryPicker" in window;
  @state() private useFallback: boolean = !("showDirectoryPicker" in window);

  @state() private modalMessage = "";
  @state() private showModal = false;
  @state() private modalType: "info" | "success" | "error" | "support" = "info";
  @state() private modalCustomTitle = "";

  @state() private scaleOptions: ScaleOption[] = [
    { scale: 1, label: "1.0x (default)", suffix: "" },
    { scale: 1.5, label: "1.5x", suffix: "@1.5x" },
    { scale: 2, label: "2.0x", suffix: "@2x" },
  ];

  protected override createRenderRoot() {
    return this;
  }

  private get activeFiles(): BatchFile[] {
    if (this.activeTab === "svg") return this.svgFiles;
    if (this.activeTab === "audio") return this.audioFiles;
    if (this.activeTab === "rename") return this.renameFiles;
    return this.resourceFiles;
  }

  private set activeFiles(files: BatchFile[]) {
    if (this.activeTab === "svg") {
      this.svgFiles = files;
    } else if (this.activeTab === "audio") {
      this.audioFiles = files;
    } else if (this.activeTab === "rename") {
      this.renameFiles = files;
    } else {
      this.resourceFiles = files;
    }
  }

  private showAlert(
    message: string,
    type: "info" | "success" | "error" | "support" = "info",
    customTitle = "",
  ) {
    this.modalMessage = message;
    this.modalType = type;
    this.modalCustomTitle = customTitle;
    this.showModal = true;
  }

  private addLog(text: string, type: "info" | "success" | "error" | "warning" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    this.conversionLogs = [{ timestamp, text, type }, ...this.conversionLogs];
  }

  private handleTabChange(tab: ActiveTabType) {
    if (this.isConverting || this.isResourceScanning || this.isResourceExecuting) return;
    this.activeTab = tab;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
  }

  private handleChangeSuffix(scale: number, suffix: string) {
    this.scaleOptions = this.scaleOptions.map((opt) =>
      opt.scale === scale ? { ...opt, suffix } : opt,
    );
  }

  private updateStaticElements(lang: "ko" | "en") {
    document.documentElement.setAttribute("data-current-lang", lang);
    document.documentElement.lang = lang;
    if (document.body) {
      document.body.setAttribute("data-current-lang", lang);
    }
    localStorage.setItem("batcher-lang", lang);

    const faqKo = document.getElementById("faq-ko");
    const faqEn = document.getElementById("faq-en");
    const footerKo = document.getElementById("footer-ko");
    const footerEn = document.getElementById("footer-en");
    const featuresSummaryKo = document.getElementById("features-summary-ko");
    const featuresSummaryEn = document.getElementById("features-summary-en");

    if (lang === "ko") {
      faqKo?.classList.remove("hidden");
      faqEn?.classList.add("hidden");
      footerKo?.classList.remove("hidden");
      footerEn?.classList.add("hidden");
      featuresSummaryKo?.classList.remove("hidden");
      featuresSummaryEn?.classList.add("hidden");
    } else {
      faqKo?.classList.add("hidden");
      faqEn?.classList.remove("hidden");
      footerKo?.classList.add("hidden");
      footerEn?.classList.remove("hidden");
      featuresSummaryKo?.classList.add("hidden");
      featuresSummaryEn?.classList.remove("hidden");
    }
  }

  private handleExternalLangChange = (e: Event) => {
    const customEvent = e as CustomEvent<"ko" | "en">;
    if (customEvent.detail && (customEvent.detail === "ko" || customEvent.detail === "en")) {
      if (this.currentLang !== customEvent.detail) {
        this.handleLangChange(customEvent.detail);
      }
    }
  };

  private handleExternalOpenSupport = () => {
    this.showAlert(
      "",
      "support",
      this.currentLang === "ko" ? "개발자 응원하기" : "Support Developer",
    );
  };

  private handleHashChange = () => {
    const hash = window.location.hash.toLowerCase();
    if (hash === "#svg") {
      this.handleTabChange("svg");
    } else if (hash === "#audio") {
      this.handleTabChange("audio");
    } else if (hash === "#rename") {
      this.handleTabChange("rename");
    } else if (hash === "#cleaner" || hash === "#resource") {
      this.handleTabChange("resource");
    }
  };

  private handleExternalTabChange = (e: Event) => {
    const customEvent = e as CustomEvent<ActiveTabType>;
    if (customEvent.detail && ["svg", "audio", "rename", "resource"].includes(customEvent.detail)) {
      this.handleTabChange(customEvent.detail);
    }
  };

  public setTab(tab: ActiveTabType) {
    this.handleTabChange(tab);
  }

  private handleLangChange(lang: "ko" | "en") {
    this.currentLang = lang;
    this.updateStaticElements(lang);
  }

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("change-lang", this.handleExternalLangChange);
    window.addEventListener("open-support", this.handleExternalOpenSupport);
    window.addEventListener("hashchange", this.handleHashChange);
    window.addEventListener("change-tab", this.handleExternalTabChange);

    const savedLang = localStorage.getItem("batcher-lang");
    if (savedLang === "en" || savedLang === "ko") {
      this.currentLang = savedLang as "ko" | "en";
    } else {
      const browserLang = navigator.language.toLowerCase();
      this.currentLang = browserLang.startsWith("ko") ? "ko" : "en";
      localStorage.setItem("batcher-lang", this.currentLang);
    }

    // SVG export format restore
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");

    if (path.includes("svg-to-png") || hash === "#svg" || tabParam === "svg") {
      this.activeTab = "svg";
    } else if (path.includes("wav-to-mp3") || hash === "#audio" || tabParam === "audio") {
      this.activeTab = "audio";
    } else if (path.includes("batch-rename") || hash === "#rename" || tabParam === "rename") {
      this.activeTab = "rename";
    } else if (
      path.includes("cleaner") ||
      hash === "#cleaner" ||
      tabParam === "resource" ||
      tabParam === "cleaner"
    ) {
      this.activeTab = "resource";
    }

    const savedFormat = localStorage.getItem("batcher-svg-exportFormat");
    if (savedFormat === "png" || savedFormat === "jpg") {
      this.exportFormat = savedFormat;
    }
    // SVG selected scale restore
    const savedScale = localStorage.getItem("batcher-svg-selectedScale");
    if (savedScale) {
      this.selectedScale = Number(savedScale);
    }
    // SVG scale options (suffixes) restore
    const savedScaleOptions = localStorage.getItem("batcher-svg-scaleOptions");
    if (savedScaleOptions) {
      try {
        this.scaleOptions = JSON.parse(savedScaleOptions);
      } catch (e) {
        console.error("Failed to parse saved scale options", e);
      }
    }
    // SVG delete original restore
    const savedSvgDelete = localStorage.getItem("batcher-svg-deleteOriginal");
    if (savedSvgDelete) {
      this.svgDeleteOriginal = savedSvgDelete === "true";
    }

    // Audio bitrate restore
    const savedBitrate = localStorage.getItem("batcher-audio-bitrate");
    if (savedBitrate) {
      this.audioBitrate = Number(savedBitrate);
    }
    // Audio delete original restore
    const savedAudioDelete = localStorage.getItem("batcher-audio-deleteOriginal");
    if (savedAudioDelete) {
      this.audioDeleteOriginal = savedAudioDelete === "true";
    }
  }

  override disconnectedCallback() {
    window.removeEventListener("change-lang", this.handleExternalLangChange);
    window.removeEventListener("open-support", this.handleExternalOpenSupport);
    window.removeEventListener("hashchange", this.handleHashChange);
    window.removeEventListener("change-tab", this.handleExternalTabChange);
    super.disconnectedCallback();
  }

  override firstUpdated() {
    this.updateStaticElements(this.currentLang);
  }

  private getRenameExtensions(): string[] {
    if (!this.renameExtFilter.trim()) return ["*"];
    return this.renameExtFilter
      .split(",")
      .map((ext) => ext.trim().toLowerCase())
      .filter(Boolean)
      .map((ext) => (ext.startsWith(".") ? ext : `.${ext}`));
  }

  private getTabConfig() {
    if (this.activeTab === "svg") {
      return {
        exts: ".svg",
        outputDirHandle: this.svgOutputDirHandle,
        setDirHandle: (h: FileSystemDirectoryHandle) => {
          this.svgDirHandle = h;
        },
        setFiles: (fs: BatchFile[]) => {
          this.svgFiles = fs;
        },
        noFilesMessage: t[this.currentLang].noSvgInFolder,
      };
    } else if (this.activeTab === "audio") {
      return {
        exts: this.audioInputExts,
        outputDirHandle: this.audioOutputDirHandle,
        setDirHandle: (h: FileSystemDirectoryHandle) => {
          this.audioDirHandle = h;
        },
        setFiles: (fs: BatchFile[]) => {
          this.audioFiles = fs;
        },
        noFilesMessage: t[this.currentLang].noWavInFolder,
      };
    } else if (this.activeTab === "rename") {
      return {
        exts: this.getRenameExtensions(),
        outputDirHandle: null,
        setDirHandle: (h: FileSystemDirectoryHandle) => {
          this.renameDirHandle = h;
        },
        setFiles: (fs: BatchFile[]) => {
          this.renameFiles = fs.map((f) => ({
            ...f,
            originalName: f.name,
            newName: f.name,
          }));
        },
        noFilesMessage: t[this.currentLang].noRenameFiles,
      };
    } else {
      return {
        exts: ["*"],
        outputDirHandle: null,
        setDirHandle: (h: FileSystemDirectoryHandle) => {
          this.resourceDirHandle = h;
        },
        setFiles: (fs: BatchFile[]) => {
          this.resourceFiles = fs;
        },
        noFilesMessage:
          this.currentLang === "ko"
            ? "선택한 폴더에 분석할 파일이 존재하지 않습니다."
            : "No files found in the selected folder.",
      };
    }
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

      const config = this.getTabConfig();
      config.setDirHandle(handle);

      if (this.activeTab === "resource") {
        this.resourceFiles = [];
        this.resourceScanResult = null;
        this.addLog(
          this.currentLang === "ko"
            ? `[폴더 선택 완료] '${handle.name}' 계층 구조가 탐색기에 로드되었습니다. 하위 폴더 선택 후 [스캔 시작]을 눌러주세요.`
            : `[Folder Selected] '${handle.name}' loaded into tree navigator. Click [Start Scan] when ready.`,
          "success",
        );
        return;
      }

      const files: BatchFile[] = [];
      this.conversionProgress = 0;

      await scanDirectory(handle, "", files, config.exts, config.outputDirHandle);
      config.setFiles(files);

      if (files.length === 0) {
        this.showAlert(config.noFilesMessage, "error");
      } else {
        this.addLog(t[this.currentLang].folderScanDone(files.length));
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
      const hasMatchedExt =
        exts.includes("*") || exts.some((ext) => file.name.toLowerCase().endsWith(ext));
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
        this.showAlert(
          this.currentLang === "ko"
            ? "선택한 확장자의 파일을 찾을 수 없습니다."
            : "No files matched the selected extensions.",
          "error",
        );
      }
      return;
    }

    const activeT = t[this.currentLang];
    const currentPaths = new Set(this.activeFiles.map((f) => f.relativePath));
    const filteredNew = newBatchFiles.filter((f) => !currentPaths.has(f.relativePath));
    const mergedFiles = [...this.activeFiles, ...filteredNew];
    mergedFiles.sort((a, b) =>
      (a.relativePath || a.name).localeCompare(b.relativePath || b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
    this.activeFiles = mergedFiles;
    const count = filteredNew.length;
    if (count > 0) {
      this.addLog(
        isDropped ? activeT.filesDropped(count) : activeT.fallbackUploadDone(count),
        "success",
      );
    }
  }

  private handleFallbackUpload(detail: any) {
    let files: FileList | File[] | null = null;
    if (detail && detail.files) {
      files = detail.files;
    } else if (detail && detail.target) {
      files = (detail.target as HTMLInputElement).files;
      (detail.target as HTMLInputElement).value = "";
    }

    if (!files || files.length === 0) return;

    if (this.activeTab === "resource") {
      const batchFiles: BatchFile[] = [];
      const fileList = Array.from(files);
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const relPath = file.webkitRelativePath || (file as any).customRelativePath || file.name;
        batchFiles.push({
          name: file.name,
          file: file,
          relativePath: relPath,
          status: "pending",
          selected: true,
        });
      }
      batchFiles.sort((a, b) =>
        (a.relativePath || a.name).localeCompare(b.relativePath || b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
      this.resourceFiles = batchFiles;
      this.resourceScanResult = null;
      this.resourceSelectedRootSegment = "";
      const folderName =
        batchFiles[0]?.relativePath?.split("/")[0] ||
        (this.currentLang === "ko" ? "선택된 폴더" : "Selected Folder");
      this.addLog(
        this.currentLang === "ko"
          ? `[폴더 준비 완료] '${folderName}' 폴더의 총 ${batchFiles.length}개 파일 준비 완료.`
          : `[Folder Prepared] Prepared ${batchFiles.length} files from '${folderName}'.`,
        "success",
      );
    } else {
      this.appendFiles(files, false);
    }
  }

  private handleDropFiles(e: CustomEvent<FileList>) {
    const files = e.detail;
    if (!files || files.length === 0) return;
    this.appendFiles(files, true);
  }

  private async handleDropFolder(handle: FileSystemDirectoryHandle) {
    if (!this.apiSupported) {
      this.showAlert(t[this.currentLang].compatAlert, "info");
      return;
    }

    try {
      const config = this.getTabConfig();
      config.setDirHandle(handle);

      if (this.activeTab === "resource") {
        this.resourceFiles = [];
        this.resourceScanResult = null;
        this.resourceSelectedRootSegment = "";
        this.addLog(
          this.currentLang === "ko"
            ? `[폴더 드롭 완료] '${handle.name}' 계층 구조가 탐색기에 로드되었습니다. 하위 폴더 선택 후 [스캔 시작]을 눌러주세요.`
            : `[Folder Dropped] '${handle.name}' loaded into tree navigator. Click [Start Scan] when ready.`,
          "success",
        );
        return;
      }

      const files: BatchFile[] = [];
      this.conversionProgress = 0;

      await scanDirectory(handle, "", files, config.exts, config.outputDirHandle);
      config.setFiles(files);

      if (files.length === 0) {
        this.showAlert(config.noFilesMessage, "error");
      } else {
        this.addLog(t[this.currentLang].folderScanDone(files.length));
      }
    } catch (err: any) {
      console.error(err);
      this.showAlert(t[this.currentLang].folderPermissionFail(err.message), "error");
    }
  }

  private handleChangeInputExts(e: CustomEvent<string[]>) {
    this.audioInputExts = e.detail;
    if (this.audioDirHandle) {
      this.reScanAudioDirectory();
    }
  }

  private async handleExtractTimestamps() {
    if (this.audioFiles.length === 0) {
      const msg =
        this.currentLang === "ko"
          ? "분석할 오디오 파일이 대기열에 존재하지 않습니다. 먼저 오디오 파일/폴더를 선택해 주세요."
          : "No audio files available. Please select audio files or a folder first.";
      this.addLog(msg, "warning");
      this.showAlert(msg, "error");
      return;
    }

    const targetFiles = this.audioFiles.filter((f) => f.selected !== false);
    const filesToProcess = targetFiles.length > 0 ? targetFiles : this.audioFiles;

    this.isExtractingTimestamps = true;
    this.addLog(
      this.currentLang === "ko"
        ? `오디오 타임스탬프 (clipBegin & clipEnd) 분석 중... (총 ${filesToProcess.length}개)`
        : `Analyzing audio timestamps... (Total ${filesToProcess.length} files)`,
      "info",
    );

    try {
      const results = await extractAudioClipInfos(filesToProcess);
      this.extractedAudioClips = results;
      this.showTimestampModal = true;
      this.addLog(
        this.currentLang === "ko"
          ? `[타임스탬프 추출 완료] 총 ${results.length}개 오디오 파일의 clipBegin 및 clipEnd 타임스탬프를 추출했습니다.`
          : `[Extraction Complete] Successfully extracted timestamps for ${results.length} audio files.`,
        "success",
      );
    } catch (err: any) {
      this.addLog(`[타임스탬프 추출 오류] ${err?.message || err}`, "error");
    } finally {
      this.isExtractingTimestamps = false;
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
        this.audioOutputDirHandle,
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
      this.renameFiles = files.map((f) => ({
        ...f,
        originalName: f.name,
        newName: f.name,
      }));
      this.addLog(t[this.currentLang].folderScanDone(this.renameFiles.length));
    } catch (err: any) {
      console.error("Failed to re-scan rename directory", err);
    }
  }

  private loadSampleFile() {
    this.conversionProgress = 0;
    const activeT = t[this.currentLang];

    if (this.activeTab === "svg") {
      const file = generateSampleSvgFile();
      const sampleBatchFile: BatchFile = {
        name: file.name,
        file: file,
        relativePath: file.name,
        status: "pending",
        selected: true,
      };

      this.svgFiles = [
        sampleBatchFile,
        ...this.svgFiles.filter((f) => f.relativePath !== file.name),
      ];
      this.addLog(activeT.sampleFileAdded("SVG"), "success");
      this.showAlert(activeT.sampleFileAdded("SVG"), "success");
    } else if (this.activeTab === "audio") {
      const file = generateSampleWavFile();
      const sampleBatchFile: BatchFile = {
        name: file.name,
        file: file,
        relativePath: file.name,
        status: "pending",
        selected: true,
      };

      this.audioFiles = [
        sampleBatchFile,
        ...this.audioFiles.filter((f) => f.relativePath !== file.name),
      ];
      this.addLog(activeT.sampleFileAdded("WAV"), "success");
      this.showAlert(activeT.sampleFileAdded("WAV"), "success");
    } else {
      const files = generateSampleRenameFiles();
      const newFiles: BatchFile[] = files.map((file) => ({
        name: file.name,
        file,
        relativePath: file.name,
        status: "pending",
        selected: true,
        originalName: file.name,
        newName: file.name,
      }));

      this.renameFiles = [
        ...newFiles,
        ...this.renameFiles.filter((f) => !newFiles.some((nf) => nf.name === f.name)),
      ];
      this.addLog(activeT.sampleFileAdded("TXT/IMG"), "success");
      this.showAlert(activeT.sampleFileAdded("TXT/IMG"), "success");
    }
  }

  private saveRenameHistory() {
    const currentNewNames = this.renameFiles.map((f) => f.newName || f.name);
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
    this.addLog(
      this.currentLang === "ko"
        ? "마지막 변경 사항을 실행 취소했습니다."
        : "Undid the last rename rule.",
      "info",
    );
    this.requestUpdate();
  }

  private handleResetNames() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => ({
      ...file,
      newName: file.originalName || file.name,
    }));
    this.addLog(
      this.currentLang === "ko"
        ? "모든 파일명을 원래 이름으로 복원했습니다."
        : "Restored all filenames to original.",
      "info",
    );
    this.requestUpdate();
  }

  private handleApplyReplace(e: CustomEvent<{ find: string; replace: string }>) {
    const { find, replace } = e.detail;
    if (!find) return;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applyReplace(file.newName || file.name, find, replace) };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `문자열 치환 적용: "${find}" → "${replace}"`
        : `Applied text replace: "${find}" → "${replace}"`,
      "info",
    );
    this.requestUpdate();
  }

  private handleApplyPrefix(e: CustomEvent<{ text: string }>) {
    const { text } = e.detail;
    if (!text) return;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applyPrefix(file.newName || file.name, text) };
    });
    this.addLog(
      this.currentLang === "ko" ? `앞이름 추가 적용: "${text}"` : `Applied prefix: "${text}"`,
      "info",
    );
    this.requestUpdate();
  }

  private handleApplySuffix(e: CustomEvent<{ text: string }>) {
    const { text } = e.detail;
    if (!text) return;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applySuffix(file.newName || file.name, text) };
    });
    this.addLog(
      this.currentLang === "ko" ? `뒷이름 추가 적용: "${text}"` : `Applied suffix: "${text}"`,
      "info",
    );
    this.requestUpdate();
  }

  private handleApplyRemove(e: CustomEvent<{ start: number; len: number }>) {
    const { start, len } = e.detail;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applyRemove(file.newName || file.name, start, len) };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `위치 기준 지우기 적용 (시작: ${start}, 길이: ${len})`
        : `Applied remove at index (start: ${start}, len: ${len})`,
      "info",
    );
    this.requestUpdate();
  }

  private handleKeepNumbers() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applyKeepNumbers(file.newName || file.name) };
    });
    this.addLog(
      this.currentLang === "ko" ? "숫자만 남기기 적용" : "Applied keep only numbers",
      "info",
    );
    this.requestUpdate();
  }

  private handleRemoveBrackets() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applyRemoveBrackets(file.newName || file.name) };
    });
    this.addLog(
      this.currentLang === "ko"
        ? "괄호 안 내용 지우기 적용"
        : "Applied remove text inside brackets",
      "info",
    );
    this.requestUpdate();
  }

  private handleApplyNumbering(
    e: CustomEvent<{ start: number; digits: number; position: "prefix" | "suffix" }>,
  ) {
    const { start, digits, position } = e.detail;
    this.saveRenameHistory();
    let currentNumber = start;
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      const newName = applyNumbering(file.newName || file.name, currentNumber, digits, position);
      currentNumber++;
      return { ...file, newName };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `일련번호 추가 적용 (시작: ${start}, 자릿수: ${digits})`
        : `Applied numbering (start: ${start}, digits: ${digits})`,
      "info",
    );
    this.requestUpdate();
  }

  private handleApplyExtension(
    e: CustomEvent<{ mode: "keep" | "remove" | "change"; newExt: string }>,
  ) {
    const { mode, newExt } = e.detail;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applyExtension(file.newName || file.name, mode, newExt) };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `확장자 변경 적용 (모드: ${mode}${newExt ? `, 새 확장자: ${newExt}` : ""})`
        : `Applied extension operation (mode: ${mode}${newExt ? `, ext: ${newExt}` : ""})`,
      "info",
    );
    this.requestUpdate();
  }

  private handleApplyClearFilename() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applyClearFilename(file.newName || file.name) };
    });
    this.addLog(
      this.currentLang === "ko" ? "파일명 전체 삭제 적용" : "Applied clear entire filename",
      "info",
    );
    this.requestUpdate();
  }

  private handleChangeFileNewName(e: CustomEvent<{ relativePath: string; newName: string }>) {
    const { relativePath, newName } = e.detail;
    this.renameFiles = this.renameFiles.map((file) => {
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
            file.relativePath === relativePath ? { ...file, status, errorMsg } : file,
          );
        },
        onLog: (text, type) => {
          this.addLog(text, type);
        },
      });

      this.isConverting = false;

      if (result.canceled) {
        this.addLog(
          this.currentLang === "ko"
            ? "[작업 취소] 변경 사항 저장이 취소되었습니다."
            : "[Canceled] Save changes operation was canceled by user.",
          "info",
        );
        this.showAlert(
          this.currentLang === "ko" ? "작업이 취소되었습니다." : "Operation was canceled.",
          "info",
        );
        return;
      }

      if (result.successCount > 0) {
        this.showAlert(activeT.alertRenameSuccessText(result.isLocalDirMode), "success");

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
              status: "pending",
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
            file.relativePath === relativePath ? { ...file, status, errorMsg } : file,
          );
        },
        onLog: (text, type) => {
          this.addLog(text, type);
        },
      });

      this.isConverting = false;

      if (result.canceled) {
        this.addLog(
          this.currentLang === "ko"
            ? "[작업 취소] 변경 사항 저장이 취소되었습니다."
            : "[Canceled] Save changes operation was canceled by user.",
          "info",
        );
        this.showAlert(
          this.currentLang === "ko" ? "작업이 취소되었습니다." : "Operation was canceled.",
          "info",
        );
        return;
      }

      const deletedPaths = new Set(
        selectedFiles.filter((f) => f.status === "success").map((f) => f.relativePath),
      );
      this.renameFiles = this.renameFiles.filter((file) => !deletedPaths.has(file.relativePath));

      this.showAlert(
        activeT.alertDeleteSuccess(result.successCount, result.failCount),
        result.successCount > 0 ? "success" : "error",
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
    this.addLog(t[this.currentLang].startConversion(this.exportFormat, scaleObj.scale), "info");

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
            file.relativePath === relativePath ? { ...file, status, errorMsg } : file,
          );
        },
        onLog: (text, type) => {
          this.addLog(text, type);
        },
      });

      this.isConverting = false;
      if (result.canceled) {
        this.addLog(
          this.currentLang === "ko"
            ? "[작업 취소] 변경 사항 저장이 취소되었습니다."
            : "[Canceled] Save changes operation was canceled by user.",
          "info",
        );
        this.showAlert(
          this.currentLang === "ko" ? "작업이 취소되었습니다." : "Operation was canceled.",
          "info",
        );
        return;
      }

      const isLocalDirMode = !!(this.apiSupported && this.svgDirHandle && !this.useFallback);
      const hasOutputDir = this.svgOutputDirHandle !== null;

      if (result.successCount > 0) {
        this.showAlert(
          activeT.alertSuccessText(
            isLocalDirMode,
            hasOutputDir,
            this.svgOutputDirHandle ? this.svgOutputDirHandle.name : "",
          ),
          "success",
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
            file.relativePath === relativePath ? { ...file, status, errorMsg } : file,
          );
        },
        onLog: (text, type) => {
          this.addLog(text, type);
        },
      });

      this.isConverting = false;
      if (result.canceled) {
        this.addLog(
          this.currentLang === "ko"
            ? "[작업 취소] 변경 사항 저장이 취소되었습니다."
            : "[Canceled] Save changes operation was canceled by user.",
          "info",
        );
        this.showAlert(
          this.currentLang === "ko" ? "작업이 취소되었습니다." : "Operation was canceled.",
          "info",
        );
        return;
      }
      const isLocalDirMode = !!(this.apiSupported && this.audioDirHandle && !this.useFallback);
      const hasOutputDir = this.audioOutputDirHandle !== null;

      if (result.successCount > 0) {
        this.showAlert(
          activeT.alertAudioSuccessText(
            isLocalDirMode,
            hasOutputDir,
            this.audioOutputDirHandle ? this.audioOutputDirHandle.name : "",
          ),
          "success",
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
    this.activeFiles = this.activeFiles.map((file) =>
      file.relativePath === targetFile.relativePath ? { ...file, selected: !file.selected } : file,
    );
  }

  private handleToggleAllFiles(e: CustomEvent<boolean>) {
    const checked = e.detail;
    this.activeFiles = this.activeFiles.map((file) => ({
      ...file,
      selected: checked,
    }));
  }

  private handleDeleteFile(e: CustomEvent<BatchFile>) {
    const fileToDelete = e.detail;
    this.activeFiles = this.activeFiles.filter(
      (file) => file.relativePath !== fileToDelete.relativePath,
    );
    this.addLog(t[this.currentLang].queueRemoved(fileToDelete.name), "info");
  }

  private handleDeleteSelectedFromQueue(e: CustomEvent<BatchFile[]>) {
    const filesToDelete = e.detail;
    const pathsToDelete = new Set(filesToDelete.map((f) => f.relativePath));

    this.activeFiles = this.activeFiles.filter((file) => !pathsToDelete.has(file.relativePath));

    this.addLog(
      this.currentLang === "ko"
        ? `선택한 ${filesToDelete.length}개의 파일을 대기열에서 삭제했습니다.`
        : `Removed ${filesToDelete.length} selected files from the queue.`,
      "info",
    );
  }

  private async handleDownloadOriginals(e: CustomEvent<{ files: BatchFile[]; flat: boolean }>) {
    const { files, flat } = e.detail;
    if (!files || files.length === 0) return;

    this.isConverting = true;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
    this.addLog(
      this.currentLang === "ko"
        ? "원본 파일 일괄 다운로드 압축 준비 중..."
        : "Preparing original files bulk download archive...",
      "info",
    );

    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (let i = 0; i < files.length; i++) {
        const fileItem = files[i];
        const originalFile = fileItem.file;

        if (flat) {
          // Flattened structure, need to handle naming collisions
          const name = originalFile.name;
          const extIndex = name.lastIndexOf(".");
          const baseName = extIndex !== -1 ? name.substring(0, extIndex) : name;
          const ext = extIndex !== -1 ? name.substring(extIndex) : "";

          let counter = 1;
          let finalName = name;
          while (usedNames.has(finalName.toLowerCase())) {
            finalName = `${baseName} (${counter})${ext}`;
            counter++;
          }
          usedNames.add(finalName.toLowerCase());
          zip.file(finalName, originalFile);
        } else {
          // Preserved folder structure
          const zipPath = fileItem.relativePath || originalFile.name;
          zip.file(zipPath, originalFile);
        }

        // Update progress
        this.conversionProgress = Math.round(((i + 1) / files.length) * 100);
        this.currentConversionIndex = i + 1;
      }

      this.addLog(
        this.currentLang === "ko" ? "ZIP 파일 압축 진행 중..." : "Compressing ZIP archive...",
        "info",
      );

      const content = await zip.generateAsync({ type: "blob" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);

      // Choose appropriate name based on tab
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const zipName = `original_files_${this.activeTab}_${dateStr}`;
      link.download = `${zipName}.zip`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      this.addLog(
        this.currentLang === "ko"
          ? `압축 파일 다운로드 완료: ${zipName}.zip`
          : `ZIP archive download complete: ${zipName}.zip`,
        "success",
      );
    } catch (err: any) {
      console.error("Failed to download original files:", err);
      this.addLog(
        this.currentLang === "ko"
          ? `원본 파일 다운로드 실패: ${err.message}`
          : `Failed to download original files: ${err.message}`,
        "error",
      );
    } finally {
      this.isConverting = false;
      this.conversionProgress = 0;
      this.currentConversionIndex = 0;
    }
  }

  private get resourcePathSegments(): string[] {
    if (this.resourceFiles.length === 0) {
      return this.resourceDirHandle ? [this.resourceDirHandle.name] : [];
    }
    const sampleFile =
      this.resourceFiles.find((f) => /\.(html|htm|css|js)$/i.test(f.name)) || this.resourceFiles[0];

    const parts = sampleFile.relativePath.split("/").filter(Boolean);
    parts.pop(); // Remove filename

    const segments: string[] = [];
    parts.forEach((p) => {
      if (!segments.includes(p)) segments.push(p);
    });

    if (this.resourceDirHandle && !segments.includes(this.resourceDirHandle.name)) {
      segments.unshift(this.resourceDirHandle.name);
    }

    return segments.slice(0, 8);
  }

  private handleSelectRootSegment(segment: string) {
    this.resourceSelectedRootSegment = segment;
    const rootName =
      this.resourceDirHandle?.name ||
      this.resourceFiles[0]?.relativePath?.split("/")[0] ||
      (this.currentLang === "ko" ? "전체 프로젝트" : "Entire Project");

    const targetName = segment || rootName;

    this.addLog(
      this.currentLang === "ko"
        ? `[스캔 타겟 지정] '${targetName}' 폴더가 타겟으로 지정되었습니다. [스캔 시작] 버튼을 눌러 스캔을 실행하세요.`
        : `[Target Selected] Set '${targetName}' as target. Click [Start Scan] when ready.`,
      "info",
    );
  }

  private async handleStartResourceScan() {
    if (!this.resourceDirHandle && this.resourceFiles.length === 0) {
      this.showAlert(
        this.currentLang === "ko"
          ? "분석할 파일이 존재하지 않습니다. 먼저 프로젝트 폴더를 선택해주세요."
          : "No files to scan. Please select a project folder first.",
        "error",
      );
      return;
    }

    // Reset scan result state immediately to clear stale lists
    this.resourceScanResult = null;
    this.isResourceScanning = true;

    const targetScope = this.resourceSelectedRootSegment;

    // Refresh file list directly from disk directory focusing on target subfolder scope
    if (this.resourceDirHandle) {
      try {
        const freshFiles: BatchFile[] = [];

        if (targetScope) {
          this.addLog(
            this.currentLang === "ko"
              ? `[타겟 스캔 시작] 선택된 타겟 폴더 '${targetScope}' 디스크 탐색 중...`
              : `[Target Scan] Scanning files in target '${targetScope}'...`,
            "info",
          );

          // 1. Scan target subfolder
          const targetHandle = await getNestedDirHandle(this.resourceDirHandle, targetScope, false);
          if (targetHandle) {
            await scanDirectory(targetHandle, targetScope, freshFiles, "*");
          } else {
            // Fallback: scan root if target handle lookup fails
            await scanDirectory(this.resourceDirHandle, "", freshFiles, "*");
          }

          // 2. ALSO scan any shared include/ folders across workspace (e.g. contents/include, include)
          const existingPaths = new Set(freshFiles.map((f) => f.relativePath));
          const scanIncludeFolders = async (
            dirHandle: FileSystemDirectoryHandle,
            currentPath = "",
            depth = 0,
          ) => {
            if (depth > 3) return;
            try {
              for await (const entry of dirHandle.values()) {
                if (entry.kind === "directory") {
                  const childPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                  if (entry.name.toLowerCase() === "include") {
                    const incFiles: BatchFile[] = [];
                    await scanDirectory(
                      entry as FileSystemDirectoryHandle,
                      childPath,
                      incFiles,
                      "*",
                    );
                    incFiles.forEach((incFile) => {
                      if (!existingPaths.has(incFile.relativePath)) {
                        freshFiles.push(incFile);
                        existingPaths.add(incFile.relativePath);
                      }
                    });
                  } else if (
                    entry.name !== ".svn" &&
                    entry.name !== ".git" &&
                    entry.name !== "node_modules"
                  ) {
                    await scanIncludeFolders(
                      entry as FileSystemDirectoryHandle,
                      childPath,
                      depth + 1,
                    );
                  }
                }
              }
            } catch (e) {
              // Ignore folder access errors
            }
          };

          await scanIncludeFolders(this.resourceDirHandle, "", 0);
        } else {
          // No subfolder scope selected: scan root
          this.addLog(
            this.currentLang === "ko"
              ? `[전체 정밀 검사] '${this.resourceDirHandle.name}' 전체 파일 탐색 중...`
              : `[Full Scan] Scanning folder '${this.resourceDirHandle.name}'...`,
            "info",
          );
          await scanDirectory(this.resourceDirHandle, "", freshFiles, "*");
        }

        this.resourceFiles = freshFiles;
      } catch (err: any) {
        console.warn("Failed to scan target directory handle from disk:", err);
      }
    }

    this.addLog(
      this.currentLang === "ko"
        ? `[정밀 검사 진행 중] 총 ${this.resourceFiles.length}개 대상 파일 연관성 분석 중...`
        : `[Analyzing Files] Checking ${this.resourceFiles.length} files...`,
      "info",
    );

    try {
      const result = await scanProjectResources(
        this.resourceFiles,
        this.resourceSelectedRootSegment,
      );
      this.resourceScanResult = result;

      this.addLog(
        this.currentLang === "ko"
          ? `[검사 완료] 사용하지 않는 파일: ${result.unusedFiles.length}개, 잘못 연결된 링크: ${result.brokenLinks.length}개`
          : `[Scan Complete] Unused files: ${result.unusedFiles.length}, Broken links: ${result.brokenLinks.length}`,
        "success",
      );
    } catch (err: any) {
      console.error(err);
      this.addLog(`[Scan Error] ${err.message}`, "error");
      this.showAlert(`Scan error: ${err.message}`, "error");
    } finally {
      this.isResourceScanning = false;
    }
  }

  private async handleConfirmResourceCleanup(detail: {
    selectedUnused: UnusedFileItem[];
    selectedBroken: BrokenLinkItem[];
  }) {
    const { selectedUnused, selectedBroken } = detail;
    this.isResourceExecuting = true;

    this.addLog(
      this.currentLang === "ko"
        ? `[정리 진행] 사용하지 않는 파일 ${selectedUnused.length}개 삭제, 잘못 연결된 링크 ${selectedBroken.length}개 정리 시작...`
        : `[Executing Cleanup] Deleting ${selectedUnused.length} files, updating ${selectedBroken.length} link entries...`,
      "info",
    );

    try {
      const res = await executeResourceCleanup({
        unusedFilesToDelete: selectedUnused,
        brokenLinksToClean: selectedBroken,
        codeCleanMode: this.resourceCodeCleanMode,
        dirHandle: this.resourceDirHandle,
        outputDirHandle: null,
        useFallback: this.useFallback,
        lang: this.currentLang,
        onLog: (text, type) => this.addLog(text, type),
        onProgress: (p) => {
          this.conversionProgress = p;
        },
      });

      if (res.canceled) {
        this.addLog(
          this.currentLang === "ko"
            ? "[작업 취소] 변경 사항 저장이 취소되었습니다."
            : "[Canceled] Save changes operation was canceled by user.",
          "info",
        );
        this.showAlert(
          this.currentLang === "ko" ? "작업이 취소되었습니다." : "Operation was canceled.",
          "info",
        );
        return;
      }

      this.addLog(
        this.currentLang === "ko"
          ? `[정리 완료] 사용하지 않는 파일 ${res.deletedFileCount}개 삭제 완료, 잘못 연결된 링크 ${res.cleanedCodeCount}개 정리 완료!`
          : `[Cleanup Complete] Deleted ${res.deletedFileCount} files, updated ${res.cleanedCodeCount} link entries!`,
        "success",
      );

      const msg =
        this.currentLang === "ko"
          ? `정리가 완벽하게 완료되었습니다!\n\n- 삭제된 물리 파일: ${res.deletedFileCount}개\n- 처리된 소스 코드: ${res.cleanedCodeCount}개`
          : `Cleanup Complete!\n\n- Deleted Files: ${res.deletedFileCount}\n- Cleaned Code: ${res.cleanedCodeCount}`;

      this.showAlert(msg, "success");

      // Fast re-scan target scope to refresh scan results
      await this.handleStartResourceScan();
    } catch (err: any) {
      console.error(err);
      this.addLog(`[Cleanup Error] ${err.message}`, "error");
      this.showAlert(`Cleanup error: ${err.message}`, "error");
    } finally {
      this.isResourceExecuting = false;
      this.conversionProgress = 0;
    }
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
    } else if (this.activeTab === "rename") {
      this.renameDirHandle = null;
      this.renameFiles = [];
      this.renameHistoryStack = [];
    } else {
      this.resourceDirHandle = null;
      this.resourceFiles = [];
      this.resourceScanResult = null;
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
    if (changedProperties.has("exportFormat")) {
      localStorage.setItem("batcher-svg-exportFormat", this.exportFormat);
    }
    if (changedProperties.has("selectedScale")) {
      localStorage.setItem("batcher-svg-selectedScale", String(this.selectedScale));
    }
    if (changedProperties.has("svgDeleteOriginal")) {
      localStorage.setItem("batcher-svg-deleteOriginal", String(this.svgDeleteOriginal));
    }
    if (changedProperties.has("scaleOptions")) {
      localStorage.setItem("batcher-svg-scaleOptions", JSON.stringify(this.scaleOptions));
    }
    if (changedProperties.has("audioBitrate")) {
      localStorage.setItem("batcher-audio-bitrate", String(this.audioBitrate));
    }
    if (changedProperties.has("audioDeleteOriginal")) {
      localStorage.setItem("batcher-audio-deleteOriginal", String(this.audioDeleteOriginal));
    }
  }

  protected override render() {
    const activeT = t[this.currentLang];
    const isSvg = this.activeTab === "svg";
    const isAudio = this.activeTab === "audio";
    const isRename = this.activeTab === "rename";
    const isResource = this.activeTab === "resource";

    const currentFiles = this.activeFiles;
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
      <div class="max-w-7xl mx-auto px-4 ${this.hideHeader ? "pt-2 pb-24" : "py-8 min-h-screen pb-32"} flex flex-col">
        <!-- Header -->
        ${this.hideHeader
          ? ""
          : html`
              <app-header
                .lang="${this.currentLang}"
                @change-lang="${(e: CustomEvent<"ko" | "en">) => this.handleLangChange(e.detail)}"
                @open-support="${() => {
                  this.showAlert(
                    "",
                    "support",
                    this.currentLang === "ko" ? "개발자 응원하기" : "Support Developer",
                  );
                }}"
              ></app-header>
            `}

        <!-- Tabs Navigation (Modern Pill Style) -->
        <div
          class="flex items-center gap-1.5 p-1.5 bg-surface-container-low border border-outline-variant/30 rounded-2xl w-full max-w-2xl mx-auto mb-8 shadow-xs overflow-x-auto"
        >
          <button
            @click="${() => this.handleTabChange("svg")}"
            ?disabled="${this.isConverting || this.isResourceScanning || this.isResourceExecuting}"
            class="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isSvg
              ? "bg-primary text-white shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"}"
          >
            <span class="material-symbols-outlined text-[18px]">view_in_ar</span>
            <span class="whitespace-nowrap">${locales[this.currentLang].tabs.svg}</span>
          </button>
          <button
            @click="${() => this.handleTabChange("audio")}"
            ?disabled="${this.isConverting || this.isResourceScanning || this.isResourceExecuting}"
            class="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isAudio
              ? "bg-primary text-white shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"}"
          >
            <span class="material-symbols-outlined text-[18px]">headphones</span>
            <span class="whitespace-nowrap">${locales[this.currentLang].tabs.audio}</span>
          </button>
          <button
            @click="${() => this.handleTabChange("rename")}"
            ?disabled="${this.isConverting || this.isResourceScanning || this.isResourceExecuting}"
            class="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isRename
              ? "bg-primary text-white shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"}"
          >
            <span class="material-symbols-outlined text-[18px]">edit_calendar</span>
            <span class="whitespace-nowrap">${locales[this.currentLang].tabs.rename}</span>
          </button>
          <button
            @click="${() => this.handleTabChange("resource")}"
            ?disabled="${this.isConverting || this.isResourceScanning || this.isResourceExecuting}"
            class="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isResource
              ? "bg-primary text-white shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"}"
          >
            <span class="material-symbols-outlined text-[18px]">cleaning_services</span>
            <span class="whitespace-nowrap">${locales[this.currentLang].tabs.resource}</span>
          </button>
        </div>

        <!-- Browser Compatibility Alert Banner -->
        ${!this.apiSupported
          ? html`
              <div
                class="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-sm flex items-start gap-3"
              >
                <i class="fa-solid fa-triangle-exclamation text-lg mt-0.5 shrink-0 font-sans"></i>
                <div class="font-sans">
                  <span class="font-bold">${activeT.compatBannerTitle}</span>
                  ${isRename
                    ? activeT.compatRenameBannerText
                    : activeT.compatBannerText(
                        isSvg
                          ? this.svgOutputDirHandle
                            ? this.svgOutputDirHandle.name
                            : "converted_images"
                          : this.audioOutputDirHandle
                            ? this.audioOutputDirHandle.name
                            : "converted_audio",
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
                    @drop-files="${this.handleDropFiles}"
                    @drop-folder="${(e: CustomEvent<FileSystemDirectoryHandle>) =>
                      this.handleDropFolder(e.detail)}"
                    @load-sample="${this.loadSampleFile}"
                    @change-format="${(e: CustomEvent<"png" | "jpg">) =>
                      (this.exportFormat = e.detail)}"
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
                      .isExtracting="${this.isExtractingTimestamps}"
                      .conversionProgress="${this.conversionProgress}"
                      .inputExts="${this.audioInputExts}"
                      @select-folder="${this.selectFolder}"
                      @select-output-folder="${this.selectOutputFolder}"
                      @reset-output-folder="${() => (this.audioOutputDirHandle = null)}"
                      @upload-files="${(e: CustomEvent) => this.handleFallbackUpload(e.detail)}"
                      @drop-files="${this.handleDropFiles}"
                      @drop-folder="${(e: CustomEvent<FileSystemDirectoryHandle>) =>
                        this.handleDropFolder(e.detail)}"
                      @load-sample="${this.loadSampleFile}"
                      @change-bitrate="${(e: CustomEvent<number>) =>
                        (this.audioBitrate = e.detail)}"
                      @toggle-delete="${() =>
                        (this.audioDeleteOriginal = !this.audioDeleteOriginal)}"
                      @change-input-exts="${this.handleChangeInputExts}"
                      @extract-timestamps="${this.handleExtractTimestamps}"
                    ></audio-settings-panel>
                  `
                : isRename
                  ? html`
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
                        @drop-files="${this.handleDropFiles}"
                        @drop-folder="${(e: CustomEvent<FileSystemDirectoryHandle>) =>
                          this.handleDropFolder(e.detail)}"
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
                    `
                  : html`
                      <cleaner-settings-panel
                        .lang="${this.currentLang}"
                        .apiSupported="${this.apiSupported}"
                        .dirHandle="${this.resourceDirHandle}"
                        .resourceFiles="${this.resourceFiles}"
                        .filesCount="${this.resourceFiles.length}"
                        .isScanning="${this.isResourceScanning}"
                        .codeCleanMode="${this.resourceCodeCleanMode}"
                        .samplePathSegments="${this.resourcePathSegments}"
                        .selectedRootSegment="${this.resourceSelectedRootSegment}"
                        @select-folder="${this.selectFolder}"
                        @select-folder-handle="${(
                          e: CustomEvent<{ handle: FileSystemDirectoryHandle }>,
                        ) => {
                          this.handleDropFolder(e.detail.handle);
                        }}"
                        @fallback-upload="${(e: CustomEvent) =>
                          this.handleFallbackUpload(e.detail)}"
                        @change-clean-mode="${(e: CustomEvent<{ mode: CodeCleanMode }>) =>
                          (this.resourceCodeCleanMode = e.detail.mode)}"
                        @select-root-segment="${(e: CustomEvent<{ segment: string }>) =>
                          this.handleSelectRootSegment(e.detail.segment)}"
                      ></cleaner-settings-panel>
                    `}
          </div>

          <!-- Right Real-Time Display & Logger Panel (cols-7) -->
          <div class="lg:col-span-7 space-y-6 flex flex-col">
            <!-- Main Right Card (File List Queue OR Scan Results Card) -->
            ${isResource
              ? html`
                  <cleaner-results-view
                    .lang="${this.currentLang}"
                    .scanResult="${this.resourceScanResult}"
                    .isExecuting="${this.isResourceExecuting}"
                    @confirm-cleanup="${(
                      e: CustomEvent<{
                        selectedUnused: UnusedFileItem[];
                        selectedBroken: BrokenLinkItem[];
                      }>,
                    ) => this.handleConfirmResourceCleanup(e.detail)}"
                  ></cleaner-results-view>
                `
              : html`
                  <file-queue
                    .lang="${this.currentLang}"
                    .files="${currentFiles}"
                    .isConverting="${this.isConverting}"
                    .activeTab="${this.activeTab}"
                    @toggle-file-selected="${this.handleToggleFileSelected}"
                    @toggle-all-files="${this.handleToggleAllFiles}"
                    @delete-file="${this.handleDeleteFile}"
                    @drop-files="${this.handleDropFiles}"
                    @drop-folder="${(e: CustomEvent<FileSystemDirectoryHandle>) =>
                      this.handleDropFolder(e.detail)}"
                    @load-sample="${this.loadSampleFile}"
                    @change-file-new-name="${this.handleChangeFileNewName}"
                    @delete-selected-from-queue="${this.handleDeleteSelectedFromQueue}"
                    @download-originals="${this.handleDownloadOriginals}"
                  ></file-queue>
                `}

            <!-- Logs Console -->
            <log-console
              .lang="${this.currentLang}"
              .conversionLogs="${this.conversionLogs}"
              @clear-logs="${() => (this.conversionLogs = [])}"
            ></log-console>
          </div>
        </div>
      </div>

      <!-- Modern Floating Action Pod -->
      <aside
        class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-4xl bg-surface-container-lowest/95 backdrop-blur-xl border border-outline-variant/30 py-3 px-6 z-40 rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.12)] transition-all duration-300"
        id="floating-action-pod"
      >
        <!-- Progress bar along the top inner edge -->
        ${this.isConverting || this.isResourceScanning || this.conversionProgress > 0
          ? html`
              <div
                class="absolute top-0 left-8 right-8 h-1 bg-surface-container-high rounded-full overflow-hidden"
              >
                <div
                  class="progress-bar-inner h-full bg-primary transition-all duration-300 shadow-sm"
                ></div>
              </div>
            `
          : ""}

        <div class="w-full flex flex-col md:flex-row items-center justify-between gap-3">
          <!-- Left side: dynamic info vs progress info -->
          ${this.isConverting || this.conversionProgress > 0
            ? html`
                <div
                  class="flex flex-wrap items-center gap-3 text-xs text-on-surface font-bold"
                >
                  <div class="flex items-center gap-2">
                    ${this.isConverting
                      ? html`
                          <span class="relative flex h-2.5 w-2.5">
                            <span
                              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"
                            ></span>
                            <span
                              class="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"
                            ></span>
                          </span>
                          <span class="text-on-surface font-bold tracking-wide"
                            >${isRename
                              ? this.currentLang === "ko"
                                ? "변경 진행 중..."
                                : "Renaming..."
                              : activeT.converting}</span
                          >
                        `
                      : html`
                          <span
                            class="inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-sm"
                          ></span>
                          <span class="text-emerald-600 dark:text-emerald-400 font-bold tracking-wide"
                            >${isRename
                              ? this.currentLang === "ko"
                                ? "변경 완료!"
                                : "Rename complete!"
                              : activeT.completed}</span
                          >
                        `}
                  </div>
                  <span class="text-outline-variant">|</span>
                  <span>
                    ${activeT.progress}
                    <strong class="text-primary font-mono text-xs"
                      >${this.conversionProgress}%</strong
                    >
                  </span>
                  <span class="text-outline-variant hidden sm:inline">|</span>
                  <span class="hidden sm:inline">
                    ${activeT.doneCount}
                    <strong class="text-primary font-mono"
                      >${this.currentConversionIndex}</strong
                    >
                    / ${currentFiles.filter((f) => f.selected).length}
                  </span>
                </div>
              `
            : html`
                <div
                  class="flex flex-wrap items-center gap-3 text-xs text-on-surface font-semibold"
                >
                  <div class="flex items-center gap-2">
                    <span
                      class="w-2.5 h-2.5 rounded-full ${isResource
                        ? this.resourceDirHandle || this.resourceFiles.length > 0
                          ? "bg-primary animate-ping"
                          : "bg-outline-variant"
                        : selectedFilesCount > 0
                          ? "bg-primary animate-ping"
                          : "bg-outline-variant"}"
                    ></span>
                    <span>
                      ${isResource
                        ? this.currentLang === "ko"
                          ? "대상 파일"
                          : "Target Files"
                        : activeT.waitingFiles}
                      <strong class="text-on-surface font-bold">
                        ${isResource
                          ? this.resourceFiles.length > 0
                            ? `${this.resourceFiles.length}개`
                            : this.resourceDirHandle
                              ? `${this.resourceSelectedRootSegment || this.resourceDirHandle.name}`
                              : "0개"
                          : selectedFilesCount}
                      </strong>
                      ${!isResource
                        ? html`
                            <span class="text-on-surface-variant font-normal">
                              / ${currentFiles.length}${this.currentLang === "ko" ? "개" : ""}
                            </span>
                          `
                        : ""}
                    </span>
                  </div>

                  ${isSvg
                    ? html`
                        <span class="text-outline-variant hidden md:inline">|</span>
                        <span>
                          ${activeT.exportFormat}
                          <strong
                            class="text-primary uppercase font-bold"
                            >${this.exportFormat}</strong
                          >
                        </span>
                        <span class="text-outline-variant hidden md:inline">|</span>
                        <span>
                          ${activeT.applyScale}
                          <strong class="text-on-surface font-mono font-bold"
                            >${this.selectedScale}x</strong
                          >
                        </span>
                        ${suffixTemplate}
                      `
                    : isAudio
                      ? html`
                          <span class="text-outline-variant hidden md:inline">|</span>
                          <span>
                            ${activeT.applyBitrate}
                            <strong
                              class="text-primary uppercase font-bold"
                              >${this.audioBitrate} kbps</strong
                            >
                          </span>
                        `
                      : isResource
                        ? html`
                            <span class="text-outline-variant hidden md:inline">|</span>
                            <span>
                              ${this.currentLang === "ko" ? "모드" : "Mode"}:
                              <strong class="text-primary uppercase font-bold"
                                >${this.currentLang === "ko"
                                  ? "미사용 파일 정리"
                                  : "Unused Files Cleaner"}</strong
                              >
                            </span>
                          `
                        : html`
                            <span class="text-outline-variant hidden md:inline">|</span>
                            <span>
                              ${this.currentLang === "ko" ? "모드" : "Mode"}:
                              <strong
                                class="text-primary uppercase font-bold"
                                >${this.currentLang === "ko"
                                  ? "파일 일괄 변경"
                                  : "Batch Rename"}</strong
                              >
                            </span>
                          `}
                </div>
              `}

          <div class="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end">
            ${currentFiles.length > 0 && !isResource
              ? html`
                  <button
                    @click="${this.resetAll}"
                    ?disabled="${this.isConverting}"
                    class="px-4 py-2 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 disabled:opacity-30 disabled:cursor-not-allowed text-on-surface-variant hover:text-on-surface rounded-full text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span class="material-symbols-outlined text-[15px]">rotate_left</span>
                    <span>${this.currentLang === "ko" ? "초기화" : "Reset"}</span>
                  </button>
                `
              : ""}
            ${isResource
              ? html`
                  <button
                    @click="${this.handleStartResourceScan}"
                    ?disabled="${this.isResourceScanning ||
                    (!this.resourceDirHandle && this.resourceFiles.length === 0)}"
                    class="px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xs tracking-wide rounded-full shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    ${this.isResourceScanning
                      ? html`
                          <svg
                            class="animate-spin h-3.5 w-3.5 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              class="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              stroke-width="4"
                            ></circle>
                            <path
                              class="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          <span
                            >${this.currentLang === "ko"
                              ? "파일 검사 중..."
                              : "Scanning files..."}</span
                          >
                        `
                      : html`
                          <span class="material-symbols-outlined text-[16px]">manage_search</span>
                          <span
                            >${this.resourceScanResult
                              ? this.currentLang === "ko"
                                ? "다시 검사하기"
                                : "Rescan Folder"
                              : this.currentLang === "ko"
                                ? "검사 시작"
                                : "Start Scan"}</span
                          >
                        `}
                  </button>
                `
              : html`
                  <button
                    @click="${this.startConversion}"
                    ?disabled="${this.isConverting || selectedFilesCount === 0}"
                    class="px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-surface-container-high disabled:text-outline disabled:cursor-not-allowed text-white font-bold text-xs tracking-wide rounded-full shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    ${this.isConverting
                      ? html`
                          <svg
                            class="animate-spin h-3.5 w-3.5 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              class="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              stroke-width="4"
                            ></circle>
                            <path
                              class="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          <span
                            >${isRename
                              ? this.currentLang === "ko"
                                ? "변경 중..."
                                : "Renaming..."
                              : activeT.btnConverting}</span
                          >
                        `
                      : html`
                          <span class="material-symbols-outlined text-[16px]">play_arrow</span>
                          <span
                            >${isRename
                              ? this.currentLang === "ko"
                                ? "이름 변경 적용"
                                : "Apply Rename"
                              : activeT.btnConvert}</span
                          >
                        `}
                  </button>
                `}
          </div>
        </div>
      </aside>

      <!-- Alert Modal Overlay -->
      <alert-modal
        .show="${this.showModal}"
        .message="${this.modalMessage}"
        .type="${this.modalType}"
        .lang="${this.currentLang}"
        .customTitle="${this.modalCustomTitle}"
        @close="${() => (this.showModal = false)}"
      ></alert-modal>

      <!-- Audio Timestamps Extractor Modal Overlay -->
      <audio-timestamp-modal
        .show="${this.showTimestampModal}"
        .items="${this.extractedAudioClips}"
        .lang="${this.currentLang}"
        @close="${() => (this.showTimestampModal = false)}"
      ></audio-timestamp-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "batcher-app": BatcherApp;
  }
}
