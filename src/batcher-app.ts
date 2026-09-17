/// <reference types="wicg-file-system-access" />
import { LitElement, html, nothing } from "lit";
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
import {
  scanProjectResources,
  executeResourceCleanup,
} from "./services/resource-cleaner";
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
import "./components/folder-tree-view";

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
  @state() private audioOutputDirHandle: FileSystemDirectoryHandle | null =
    null;
  @state() private audioInputExts: string[] = [".wav", ".mp3"];
  @state() protected isExtractingTimestamps = false;
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
  @state() protected currentConversionIndex = 0;
  @state() private conversionLogs: ConversionLog[] = [];
  @state() private apiSupported: boolean = "showDirectoryPicker" in window;
  @state() private useFallback: boolean = !("showDirectoryPicker" in window);

  @state() private modalMessage = "";
  @state() private showModal = false;
  @state() private modalType: "info" | "success" | "error" | "support" = "info";
  @state() private modalCustomTitle = "";

  @state() private scaleOptions: ScaleOption[] = [
    { scale: 1, label: "1.0x (default)", suffix: "" },
    { scale: 1.5, label: "1.5x", suffix: "" },
    { scale: 2, label: "2.0x", suffix: "@2x" },
    { scale: 3, label: "3.0x", suffix: "@3x" },
  ];
  @state() private svgSettingsOpen = true;
  @state() private audioSettingsOpen = true;
  @state() private renameSettingsOpen = true;
  @state() private resourceSettingsOpen = true;
  @state() private resourceFolderOpen = true;
  @state() private flatDownload = false;

  // Audio detailed options
  @state() protected audioChannel: "stereo" | "mono" = "stereo";

  // Rename detailed options
  @state() protected renameMode:
    | "replace"
    | "prefix-suffix"
    | "remove-pos"
    | "cleanup"
    | "numbering"
    | "extension"
    | "regex" = "replace";
  @state() protected renameSearchTerm = "";
  @state() protected renameReplaceTerm = "";
  @state() protected renamePrefixTerm = "";
  @state() protected renameSuffixTerm = "";
  @state() protected renameNumberStart = 1;
  @state() protected renameNumberDigits = 2;
  @state() protected renameNumberPosition: "prefix" | "suffix" = "prefix";
  @state() protected renameRemovePosStart = 1;
  @state() protected renameRemovePosLen = 1;
  @state() protected renameRemovePosType: "start" | "end" | "custom" = "start";
  @state() protected renameNewExtension = "";
  @state() protected renameExtAction: "change" | "add" | "remove" = "change";

  // Cleaner detailed options
  @state() protected cleanExif = true;
  @state() protected cleanDuplicates = true;
  @state() protected cleanKeepQuality = true;

  private toggleAudioExt(ext: string) {
    const formatted = ext.startsWith(".")
      ? ext.toLowerCase()
      : `.${ext.toLowerCase()}`;
    if (this.audioInputExts.includes(formatted)) {
      if (this.audioInputExts.length > 1) {
        this.audioInputExts = this.audioInputExts.filter(
          (e) => e !== formatted,
        );
      }
    } else {
      this.audioInputExts = [...this.audioInputExts, formatted];
    }
  }

  protected handleExecuteRemovePos() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      const current = file.newName || file.name;
      const extIndex = current.lastIndexOf(".");
      const base = extIndex > 0 ? current.slice(0, extIndex) : current;
      const ext = extIndex > 0 ? current.slice(extIndex) : "";

      let newBase = base;
      if (this.renameRemovePosType === "start") {
        newBase = base.slice(this.renameRemovePosLen);
      } else if (this.renameRemovePosType === "end") {
        newBase = base.slice(
          0,
          Math.max(0, base.length - this.renameRemovePosLen),
        );
      } else {
        const start = Math.max(0, this.renameRemovePosStart - 1);
        newBase =
          base.slice(0, start) + base.slice(start + this.renameRemovePosLen);
      }
      return { ...file, newName: newBase + ext };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `특정 위치 지우기 적용 (${this.renameRemovePosLen}글자)`
        : `Applied remove characters (${this.renameRemovePosLen} chars)`,
      "info",
    );
    this.requestUpdate();
  }

  protected handleExecuteExtension() {
    this.saveRenameHistory();
    const action = this.renameExtAction;
    const cleanExt = this.renameNewExtension.trim().replace(/^\./, "");
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      const current = file.newName || file.name;
      const extIndex = current.lastIndexOf(".");
      const base = extIndex > 0 ? current.slice(0, extIndex) : current;

      let newName = current;
      if (action === "change") {
        newName = cleanExt ? `${base}.${cleanExt}` : base;
      } else if (action === "add") {
        newName = cleanExt ? `${current}.${cleanExt}` : current;
      } else if (action === "remove") {
        newName = base;
      }
      return { ...file, newName };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `확장자 변경 적용 (${action} ${cleanExt || "없음"})`
        : `Applied extension rule (${action} ${cleanExt || "none"})`,
      "info",
    );
    this.requestUpdate();
  }

  protected handleExecuteRenameRule() {
    if (this.renameMode === "replace") {
      if (!this.renameSearchTerm) return;
      this.handleApplyReplace(
        new CustomEvent("apply-replace", {
          detail: {
            find: this.renameSearchTerm,
            replace: this.renameReplaceTerm,
          },
        }),
      );
    } else if (this.renameMode === "prefix-suffix") {
      if (this.renamePrefixTerm) {
        this.handleApplyPrefix(
          new CustomEvent("apply-prefix", {
            detail: { text: this.renamePrefixTerm },
          }),
        );
      }
      if (this.renameSuffixTerm) {
        this.handleApplySuffix(
          new CustomEvent("apply-suffix", {
            detail: { text: this.renameSuffixTerm },
          }),
        );
      }
    } else if (this.renameMode === "numbering") {
      this.handleApplyNumbering(
        new CustomEvent("apply-numbering", {
          detail: {
            start: this.renameNumberStart,
            digits: this.renameNumberDigits,
            position: this.renameNumberPosition,
          },
        }),
      );
    } else if (this.renameMode === "remove-pos") {
      this.handleExecuteRemovePos();
    } else if (this.renameMode === "extension") {
      this.handleExecuteExtension();
    } else if (this.renameMode === "regex") {
      if (!this.renameSearchTerm) return;
      try {
        const regex = new RegExp(this.renameSearchTerm, "g");
        this.saveRenameHistory();
        this.renameFiles = this.renameFiles.map((file) => {
          if (!file.selected) return file;
          const current = file.newName || file.name;
          const extIndex = current.lastIndexOf(".");
          const base = extIndex > 0 ? current.slice(0, extIndex) : current;
          const ext = extIndex > 0 ? current.slice(extIndex) : "";
          const newBase = base.replace(regex, this.renameReplaceTerm);
          return { ...file, newName: newBase + ext };
        });
        this.addLog(
          this.currentLang === "ko"
            ? `정규식 치환 적용: /${this.renameSearchTerm}/g`
            : `Applied Regex: /${this.renameSearchTerm}/g`,
          "info",
        );
        this.requestUpdate();
      } catch (err: any) {
        this.showAlert(err?.message || "Invalid Regex", "error");
      }
    }
  }

  protected applyPresetBrackets = () => {
    this.handleRemoveBrackets();
  };

  protected applyPresetDate = () => {
    this.saveRenameHistory();
    const dateRegex = /(\d{4})[._](\d{2})[._](\d{2})/;
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      const current = file.newName || file.name;
      const newName = current.replace(dateRegex, "$1-$2-$3");
      return { ...file, newName };
    });
    this.addLog(
      this.currentLang === "ko"
        ? "날짜 형식 YYYY-MM-DD 통일 적용"
        : "Standardized date format to YYYY-MM-DD",
      "info",
    );
    this.requestUpdate();
  };

  protected applyPresetUnderscore = () => {
    this.handleApplyReplace(
      new CustomEvent("apply-replace", { detail: { find: " ", replace: "_" } }),
    );
  };

  protected applyPresetNumbering = () => {
    this.handleApplyNumbering(
      new CustomEvent("apply-numbering", {
        detail: { start: 1, digits: 3, position: "prefix" },
      }),
    );
  };

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

  private addLog(
    text: string,
    type: "info" | "success" | "error" | "warning" = "info",
  ) {
    const timestamp = new Date().toLocaleTimeString();
    this.conversionLogs = [{ timestamp, text, type }, ...this.conversionLogs];
  }

  private handleTabChange(tab: ActiveTabType) {
    if (
      this.isConverting ||
      this.isResourceScanning ||
      this.isResourceExecuting
    )
      return;
    this.activeTab = tab;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
  }

  protected handleChangeSuffix(scale: number, suffix: string) {
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
    if (
      customEvent.detail &&
      (customEvent.detail === "ko" || customEvent.detail === "en")
    ) {
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
    if (
      customEvent.detail &&
      ["svg", "audio", "rename", "resource"].includes(customEvent.detail)
    ) {
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
    } else if (
      path.includes("wav-to-mp3") ||
      hash === "#audio" ||
      tabParam === "audio"
    ) {
      this.activeTab = "audio";
    } else if (
      path.includes("batch-rename") ||
      hash === "#rename" ||
      tabParam === "rename"
    ) {
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
    const savedAudioDelete = localStorage.getItem(
      "batcher-audio-deleteOriginal",
    );
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

      await scanDirectory(
        handle,
        "",
        files,
        config.exts,
        config.outputDirHandle,
      );
      config.setFiles(files);

      if (files.length === 0) {
        this.showAlert(config.noFilesMessage, "error");
      } else {
        this.addLog(t[this.currentLang].folderScanDone(files.length));
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error(err);
        this.showAlert(
          t[this.currentLang].folderPermissionFail(err.message),
          "error",
        );
      }
    }
  }

  protected async selectOutputFolder() {
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
        this.addLog(
          t[this.currentLang].outputFolderSet(this.svgOutputDirHandle.name),
          "info",
        );
      } else {
        this.audioOutputDirHandle = handle;
        this.addLog(
          t[this.currentLang].outputFolderSet(this.audioOutputDirHandle.name),
          "info",
        );
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error(err);
        this.showAlert(
          t[this.currentLang].folderPermissionFail(err.message),
          "error",
        );
      }
    }
  }

  private appendFiles(files: FileList | File[], isDropped = false) {
    this.conversionProgress = 0;
    const isSvg = this.activeTab === "svg";
    const isAudio = this.activeTab === "audio";
    const exts = isSvg
      ? [".svg"]
      : isAudio
        ? this.audioInputExts
        : this.getRenameExtensions();
    const newBatchFiles: BatchFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const hasMatchedExt =
        exts.includes("*") ||
        exts.some((ext) => file.name.toLowerCase().endsWith(ext));
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
    const filteredNew = newBatchFiles.filter(
      (f) => !currentPaths.has(f.relativePath),
    );
    const mergedFiles = [...this.activeFiles, ...filteredNew];
    mergedFiles.sort((a, b) =>
      (a.relativePath || a.name).localeCompare(
        b.relativePath || b.name,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        },
      ),
    );
    this.activeFiles = mergedFiles;
    const count = filteredNew.length;
    if (count > 0) {
      this.addLog(
        isDropped
          ? activeT.filesDropped(count)
          : activeT.fallbackUploadDone(count),
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
        const relPath =
          file.webkitRelativePath ||
          (file as any).customRelativePath ||
          file.name;
        batchFiles.push({
          name: file.name,
          file: file,
          relativePath: relPath,
          status: "pending",
          selected: true,
        });
      }
      batchFiles.sort((a, b) =>
        (a.relativePath || a.name).localeCompare(
          b.relativePath || b.name,
          undefined,
          {
            numeric: true,
            sensitivity: "base",
          },
        ),
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

  protected handleDropFiles(e: CustomEvent<FileList>) {
    const files = e.detail;
    if (!files || files.length === 0) return;
    this.appendFiles(files, true);
  }

  protected async handleDropFolder(handle: FileSystemDirectoryHandle) {
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

      await scanDirectory(
        handle,
        "",
        files,
        config.exts,
        config.outputDirHandle,
      );
      config.setFiles(files);

      if (files.length === 0) {
        this.showAlert(config.noFilesMessage, "error");
      } else {
        this.addLog(t[this.currentLang].folderScanDone(files.length));
      }
    } catch (err: any) {
      console.error(err);
      this.showAlert(
        t[this.currentLang].folderPermissionFail(err.message),
        "error",
      );
    }
  }

  protected handleChangeInputExts(e: CustomEvent<string[]>) {
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
    const filesToProcess =
      targetFiles.length > 0 ? targetFiles : this.audioFiles;

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

  protected async reScanRenameDirectory() {
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
        ...this.renameFiles.filter(
          (f) => !newFiles.some((nf) => nf.name === f.name),
        ),
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

  protected handleUndoRename() {
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

  private handleApplyReplace(
    e: CustomEvent<{ find: string; replace: string }>,
  ) {
    const { find, replace } = e.detail;
    if (!find) return;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return {
        ...file,
        newName: applyReplace(file.newName || file.name, find, replace),
      };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `문자열 치환 적용: "${find}" → "${replace}"`
        : `Applied text replace: "${find}" → "${replace}"`,
      "info",
    );
    this.requestUpdate();
  }

  protected handleApplyPrefix(e: CustomEvent<{ text: string }>) {
    const { text } = e.detail;
    if (!text) return;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applyPrefix(file.newName || file.name, text) };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `앞이름 추가 적용: "${text}"`
        : `Applied prefix: "${text}"`,
      "info",
    );
    this.requestUpdate();
  }

  protected handleApplySuffix(e: CustomEvent<{ text: string }>) {
    const { text } = e.detail;
    if (!text) return;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applySuffix(file.newName || file.name, text) };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `뒷이름 추가 적용: "${text}"`
        : `Applied suffix: "${text}"`,
      "info",
    );
    this.requestUpdate();
  }

  protected handleApplyRemove(e: CustomEvent<{ start: number; len: number }>) {
    const { start, len } = e.detail;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return {
        ...file,
        newName: applyRemove(file.newName || file.name, start, len),
      };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `위치 기준 지우기 적용 (시작: ${start}, 길이: ${len})`
        : `Applied remove at index (start: ${start}, len: ${len})`,
      "info",
    );
    this.requestUpdate();
  }

  protected handleKeepNumbers() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return { ...file, newName: applyKeepNumbers(file.newName || file.name) };
    });
    this.addLog(
      this.currentLang === "ko"
        ? "숫자만 남기기 적용"
        : "Applied keep only numbers",
      "info",
    );
    this.requestUpdate();
  }

  protected handleRemoveBrackets() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return {
        ...file,
        newName: applyRemoveBrackets(file.newName || file.name),
      };
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
    e: CustomEvent<{
      start: number;
      digits: number;
      position: "prefix" | "suffix";
    }>,
  ) {
    const { start, digits, position } = e.detail;
    this.saveRenameHistory();
    let currentNumber = start;
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      const newName = applyNumbering(
        file.newName || file.name,
        currentNumber,
        digits,
        position,
      );
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

  protected handleApplyExtension(
    e: CustomEvent<{ mode: "keep" | "remove" | "change"; newExt: string }>,
  ) {
    const { mode, newExt } = e.detail;
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return {
        ...file,
        newName: applyExtension(file.newName || file.name, mode, newExt),
      };
    });
    this.addLog(
      this.currentLang === "ko"
        ? `확장자 변경 적용 (모드: ${mode}${newExt ? `, 새 확장자: ${newExt}` : ""})`
        : `Applied extension operation (mode: ${mode}${newExt ? `, ext: ${newExt}` : ""})`,
      "info",
    );
    this.requestUpdate();
  }

  protected handleApplyClearFilename() {
    this.saveRenameHistory();
    this.renameFiles = this.renameFiles.map((file) => {
      if (!file.selected) return file;
      return {
        ...file,
        newName: applyClearFilename(file.newName || file.name),
      };
    });
    this.addLog(
      this.currentLang === "ko"
        ? "파일명 전체 삭제 적용"
        : "Applied clear entire filename",
      "info",
    );
    this.requestUpdate();
  }

  protected handleChangeFileNewName(
    e: CustomEvent<{ relativePath: string; newName: string }>,
  ) {
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
            file.relativePath === relativePath
              ? { ...file, status, errorMsg }
              : file,
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
          this.currentLang === "ko"
            ? "작업이 취소되었습니다."
            : "Operation was canceled.",
          "info",
        );
        return;
      }

      if (result.successCount > 0) {
        this.showAlert(
          activeT.alertRenameSuccessText(result.isLocalDirMode),
          "success",
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

  protected async handleDeleteSelectedFiles() {
    const selectedFiles = this.renameFiles.filter((f) => f.selected);
    if (selectedFiles.length === 0) {
      this.showAlert(t[this.currentLang].noSelectedRename, "error");
      return;
    }

    const confirmed = confirm(
      t[this.currentLang].alertDeleteConfirm(selectedFiles.length),
    );
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
            file.relativePath === relativePath
              ? { ...file, status, errorMsg }
              : file,
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
          this.currentLang === "ko"
            ? "작업이 취소되었습니다."
            : "Operation was canceled.",
          "info",
        );
        return;
      }

      const deletedPaths = new Set(
        selectedFiles
          .filter((f) => f.status === "success")
          .map((f) => f.relativePath),
      );
      this.renameFiles = this.renameFiles.filter(
        (file) => !deletedPaths.has(file.relativePath),
      );

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

    const scaleObj = this.scaleOptions.find(
      (s) => s.scale === this.selectedScale,
    );
    if (!scaleObj) {
      this.showAlert(t[this.currentLang].invalidScale, "error");
      return;
    }

    this.isConverting = true;
    this.conversionProgress = 0;
    this.currentConversionIndex = 0;
    this.addLog(
      t[this.currentLang].startConversion(this.exportFormat, scaleObj.scale),
      "info",
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
            file.relativePath === relativePath
              ? { ...file, status, errorMsg }
              : file,
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
          this.currentLang === "ko"
            ? "작업이 취소되었습니다."
            : "Operation was canceled.",
          "info",
        );
        return;
      }

      const isLocalDirMode = !!(
        this.apiSupported &&
        this.svgDirHandle &&
        !this.useFallback
      );
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
    this.addLog(
      t[this.currentLang].startAudioConversion(this.audioBitrate),
      "info",
    );

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
            file.relativePath === relativePath
              ? { ...file, status, errorMsg }
              : file,
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
          this.currentLang === "ko"
            ? "작업이 취소되었습니다."
            : "Operation was canceled.",
          "info",
        );
        return;
      }
      const isLocalDirMode = !!(
        this.apiSupported &&
        this.audioDirHandle &&
        !this.useFallback
      );
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

  protected handleToggleFileSelected(e: CustomEvent<BatchFile> | BatchFile) {
    const targetFile = (e as any).detail || e;
    this.activeFiles = this.activeFiles.map((file) =>
      file.relativePath === targetFile.relativePath
        ? { ...file, selected: !file.selected }
        : file,
    );
  }

  protected handleToggleAllFiles(e: CustomEvent<boolean> | boolean) {
    const checked = typeof e === "boolean" ? e : (e as any).detail;
    this.activeFiles = this.activeFiles.map((file) => ({
      ...file,
      selected: checked,
    }));
  }

  private handleDeleteFile(e: CustomEvent<BatchFile> | BatchFile) {
    const fileToDelete = (e as any).detail || e;
    this.activeFiles = this.activeFiles.filter(
      (file) => file.relativePath !== fileToDelete.relativePath,
    );
    this.addLog(t[this.currentLang].queueRemoved(fileToDelete.name), "info");
  }

  protected handleDeleteSelectedFromQueue(
    e?: CustomEvent<BatchFile[]> | BatchFile[],
  ) {
    let filesToDelete: BatchFile[];
    if (Array.isArray(e)) {
      filesToDelete = e;
    } else if (e && "detail" in e) {
      filesToDelete = e.detail;
    } else {
      filesToDelete = this.activeFiles.filter((f) => f.selected);
    }
    const pathsToDelete = new Set(filesToDelete.map((f) => f.relativePath));

    this.activeFiles = this.activeFiles.filter(
      (file) => !pathsToDelete.has(file.relativePath),
    );

    this.addLog(
      this.currentLang === "ko"
        ? `선택한 ${filesToDelete.length}개의 파일을 대기열에서 삭제했습니다.`
        : `Removed ${filesToDelete.length} selected files from the queue.`,
      "info",
    );
  }

  private async handleDownloadOriginals(
    e: CustomEvent<{ files: BatchFile[]; flat: boolean }>,
  ) {
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
        this.currentLang === "ko"
          ? "ZIP 파일 압축 진행 중..."
          : "Compressing ZIP archive...",
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

  protected get resourcePathSegments(): string[] {
    if (this.resourceFiles.length === 0) {
      return this.resourceDirHandle ? [this.resourceDirHandle.name] : [];
    }
    const sampleFile =
      this.resourceFiles.find((f) => /\.(html|htm|css|js)$/i.test(f.name)) ||
      this.resourceFiles[0];

    const parts = sampleFile.relativePath.split("/").filter(Boolean);
    parts.pop(); // Remove filename

    const segments: string[] = [];
    parts.forEach((p) => {
      if (!segments.includes(p)) segments.push(p);
    });

    if (
      this.resourceDirHandle &&
      !segments.includes(this.resourceDirHandle.name)
    ) {
      segments.unshift(this.resourceDirHandle.name);
    }

    return segments.slice(0, 8);
  }

  protected handleSelectRootSegment(segment: string) {
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
          const targetHandle = await getNestedDirHandle(
            this.resourceDirHandle,
            targetScope,
            false,
          );
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
                  const childPath = currentPath
                    ? `${currentPath}/${entry.name}`
                    : entry.name;
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
          this.currentLang === "ko"
            ? "작업이 취소되었습니다."
            : "Operation was canceled.",
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
    if (
      changedProperties.has("conversionProgress") ||
      changedProperties.has("isConverting")
    ) {
      const progressBar = this.renderRoot.querySelector(
        ".progress-bar-inner",
      ) as HTMLElement;
      if (progressBar) {
        progressBar.style.width = `${this.conversionProgress}%`;
      }
    }
    if (changedProperties.has("exportFormat")) {
      localStorage.setItem("batcher-svg-exportFormat", this.exportFormat);
    }
    if (changedProperties.has("selectedScale")) {
      localStorage.setItem(
        "batcher-svg-selectedScale",
        String(this.selectedScale),
      );
    }
    if (changedProperties.has("svgDeleteOriginal")) {
      localStorage.setItem(
        "batcher-svg-deleteOriginal",
        String(this.svgDeleteOriginal),
      );
    }
    if (changedProperties.has("scaleOptions")) {
      localStorage.setItem(
        "batcher-svg-scaleOptions",
        JSON.stringify(this.scaleOptions),
      );
    }
    if (changedProperties.has("audioBitrate")) {
      localStorage.setItem("batcher-audio-bitrate", String(this.audioBitrate));
    }
    if (changedProperties.has("audioDeleteOriginal")) {
      localStorage.setItem(
        "batcher-audio-deleteOriginal",
        String(this.audioDeleteOriginal),
      );
    }
  }

  private triggerFileInput() {
    const input = this.querySelector("#nativeFileInput") as HTMLInputElement;
    if (input) {
      input.click();
    }
  }

  private handleDropOnZone(e: DragEvent) {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    if (target) {
      target.classList.remove("border-primary", "bg-primary/5");
    }
    if (
      e.dataTransfer &&
      e.dataTransfer.files &&
      e.dataTransfer.files.length > 0
    ) {
      if (this.activeTab === "resource") {
        this.handleFallbackUpload({ files: e.dataTransfer.files });
      } else {
        this.appendFiles(e.dataTransfer.files, true);
      }
    }
  }

  protected override render() {
    const activeT = t[this.currentLang];
    const isSvg = this.activeTab === "svg";
    const isAudio = this.activeTab === "audio";
    const isRename = this.activeTab === "rename";
    const isResource = this.activeTab === "resource";

    const currentFiles = this.activeFiles;
    const allSelected =
      currentFiles.length > 0 && currentFiles.every((f) => f.selected);
    const someSelected =
      currentFiles.length > 0 &&
      currentFiles.some((f) => f.selected) &&
      !allSelected;

    return html`
      <div
        class="w-full max-w-7xl mx-auto ${this.hideHeader
          ? "pt-1 pb-24"
          : "py-4 min-h-screen pb-28"} flex flex-col gap-4 sm:gap-5"
      >
        <!-- Optional Header -->
        ${this.hideHeader
          ? nothing
          : html`
              <app-header
                .lang="${this.currentLang}"
                @change-lang="${(e: CustomEvent<"ko" | "en">) =>
                  this.handleLangChange(e.detail)}"
                @open-support="${() => {
                  this.showAlert(
                    "",
                    "support",
                    this.currentLang === "ko"
                      ? "개발자 응원하기"
                      : "Support Developer",
                  );
                }}"
              ></app-header>
            `}

        <!-- Clean Segmented Pill Tab Bar (Matching Screenshot 2) -->
        <div class="flex justify-center">
          <div
            class="inline-flex p-1.5 bg-surface-container-lowest sm:bg-surface-container-low rounded-2xl border border-surface-container gap-1 sm:gap-2 shadow-xs overflow-x-auto max-w-full"
            id="toolTabs"
          >
            <button
              @click="${() => this.handleTabChange("svg")}"
              ?disabled="${this.isConverting ||
              this.isResourceScanning ||
              this.isResourceExecuting}"
              class="tool-tab-btn flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isSvg
                ? "bg-primary text-on-primary shadow-xs font-bold"
                : "text-on-surface hover:text-primary hover:bg-surface-container/60 font-semibold"}"
              id="tabBtn-svg"
              type="button"
            >
              <span class="material-symbols-outlined text-[18px]"
                >view_in_ar</span
              >
              <span>${locales[this.currentLang].tabs.svg}</span>
            </button>
            <button
              @click="${() => this.handleTabChange("audio")}"
              ?disabled="${this.isConverting ||
              this.isResourceScanning ||
              this.isResourceExecuting}"
              class="tool-tab-btn flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isAudio
                ? "bg-primary text-on-primary shadow-xs font-bold"
                : "text-on-surface hover:text-primary hover:bg-surface-container/60 font-semibold"}"
              id="tabBtn-audio"
              type="button"
            >
              <span class="material-symbols-outlined text-[18px]"
                >headphones</span
              >
              <span>${locales[this.currentLang].tabs.audio}</span>
            </button>
            <button
              @click="${() => this.handleTabChange("rename")}"
              ?disabled="${this.isConverting ||
              this.isResourceScanning ||
              this.isResourceExecuting}"
              class="tool-tab-btn flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isRename
                ? "bg-primary text-on-primary shadow-xs font-bold"
                : "text-on-surface hover:text-primary hover:bg-surface-container/60 font-semibold"}"
              id="tabBtn-rename"
              type="button"
            >
              <span class="material-symbols-outlined text-[18px]"
                >edit_calendar</span
              >
              <span>${locales[this.currentLang].tabs.rename}</span>
            </button>
            <button
              @click="${() => this.handleTabChange("resource")}"
              ?disabled="${this.isConverting ||
              this.isResourceScanning ||
              this.isResourceExecuting}"
              class="tool-tab-btn flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isResource
                ? "bg-primary text-on-primary shadow-xs font-bold"
                : "text-on-surface hover:text-primary hover:bg-surface-container/60 font-semibold"}"
              id="tabBtn-cleaner"
              type="button"
            >
              <span class="material-symbols-outlined text-[18px]"
                >cleaning_services</span
              >
              <span>${locales[this.currentLang].tabs.resource}</span>
            </button>
          </div>
        </div>

        <!-- Browser Compatibility Alert Banner -->
        ${!this.apiSupported
          ? html`
              <div
                class="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-xs flex items-start gap-3"
              >
                <span class="material-symbols-outlined text-base shrink-0"
                  >warning</span
                >
                <div>
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
          : nothing}

        <!-- 2-Column Responsive Workspace Grid (Left: 1 & 2, Right: 3 & 작업 내역) -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <!-- Left Column: Step 1 (Upload/Dropzone) + Audio SMIL + Step 2 (Detailed Options) -->
          <div class="flex flex-col gap-4 sm:gap-5 min-w-0">
            <!-- Step 1: Upload Dropzone Card -->
            <div
              class="bg-surface-container-lowest rounded-2xl border border-surface-container-high shadow-xs p-5 sm:p-6 space-y-3.5 sm:space-y-4 relative overflow-hidden"
              @dragover="${(e: DragEvent) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).classList.add(
                  "ring-2",
                  "ring-primary",
                );
              }}"
              @dragleave="${(e: DragEvent) => {
                (e.currentTarget as HTMLElement).classList.remove(
                  "ring-2",
                  "ring-primary",
                );
              }}"
              @drop="${(e: DragEvent) => {
                (e.currentTarget as HTMLElement).classList.remove(
                  "ring-2",
                  "ring-primary",
                );
                this.handleDropOnZone(e);
              }}"
            >
              <div class="flex items-center justify-between">
                ${isResource
                  ? html`
                      <div class="flex items-center gap-2.5 sm:gap-3">
                        <span
                          class="w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-xs font-bold shrink-0"
                          >1</span
                        >
                        <div>
                          <h3
                            class="font-bold text-sm sm:text-base text-on-surface"
                          >
                            ${this.currentLang === "ko"
                              ? "대상 폴더 디렉토리(경로) 설정"
                              : "Target Folder Directory Settings"}
                          </h3>
                        </div>
                      </div>
                    `
                  : html`
                      <div class="flex items-center gap-2.5">
                        <span
                          class="w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-xs font-bold"
                          >1</span
                        >
                        <span
                          class="font-bold text-sm sm:text-base text-on-surface"
                        >
                          ${isSvg
                            ? this.currentLang === "ko"
                              ? "대상 SVG 폴더 연동하기"
                              : "Link Target SVG Folder"
                            : isAudio
                              ? this.currentLang === "ko"
                                ? "대상 오디오 폴더 연동하기"
                                : "Link Target Audio Folder"
                              : this.currentLang === "ko"
                                ? "대상 작업 폴더 연동하기"
                                : "Link Target Working Folder"}
                        </span>
                      </div>
                    `}
              </div>

              <input
                id="nativeFileInput"
                type="file"
                multiple
                class="hidden"
                accept="${isSvg
                  ? ".svg"
                  : isAudio
                    ? ".wav,.mp3,.flac,.m4a,.ogg"
                    : "*"}"
                @change="${(e: Event) => this.handleFallbackUpload(e)}"
              />

              ${isSvg
                ? html`
                    <!-- SVG Specific Step 1 Controls (Exact Match to User Capture) -->
                    <div class="space-y-4">
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          @click="${this.selectFolder}"
                          class="py-4 px-4 bg-surface-container-low hover:bg-surface-container rounded-2xl border border-dashed border-surface-container-high hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group text-center active:scale-[0.99]"
                        >
                          <span
                            class="material-symbols-outlined text-[28px] text-primary group-hover:scale-110 transition-transform"
                            >folder_open</span
                          >
                          <span
                            class="text-xs sm:text-sm font-bold text-on-surface"
                            >${this.currentLang === "ko"
                              ? "로컬 디렉토리(폴더) 지정"
                              : "Select Local Folder"}</span
                          >
                        </button>

                        <button
                          type="button"
                          @click="${this.triggerFileInput}"
                          class="py-4 px-4 bg-surface-container-low hover:bg-surface-container rounded-2xl border border-dashed border-surface-container-high hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group text-center active:scale-[0.99]"
                        >
                          <span
                            class="material-symbols-outlined text-[28px] text-primary group-hover:scale-110 transition-transform"
                            >file_open</span
                          >
                          <span
                            class="text-xs sm:text-sm font-bold text-on-surface"
                            >${this.currentLang === "ko"
                              ? "개별 파일 선택"
                              : "Select Individual Files"}</span
                          >
                        </button>
                      </div>

                      <!-- Status Info Display -->
                      <div class="text-center py-1 select-none">
                        ${this.svgDirHandle
                          ? html`
                              <div
                                class="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs flex items-center justify-between shadow-2xs"
                              >
                                <div
                                  class="flex items-center gap-2 text-primary font-bold truncate"
                                >
                                  <span
                                    class="material-symbols-outlined text-base"
                                    >folder</span
                                  >
                                  <span
                                    class="truncate max-w-50 sm:max-w-xs"
                                    title="${this.svgDirHandle.name}"
                                    >${this.svgDirHandle.name}</span
                                  >
                                </div>
                                <div class="flex items-center gap-2">
                                  <span
                                    class="text-on-surface-variant font-mono text-[11px] font-bold"
                                    >${this.svgFiles.length}개 파일 로드됨</span
                                  >
                                  <button
                                    type="button"
                                    @click="${(e: Event) => {
                                      e.stopPropagation();
                                      this.svgDirHandle = null;
                                    }}"
                                    class="text-outline hover:text-rose-500 text-[11px] font-bold cursor-pointer transition-colors"
                                  >
                                    ${this.currentLang === "ko"
                                      ? "연동 해제"
                                      : "Unlink"}
                                  </button>
                                </div>
                              </div>
                            `
                          : this.svgFiles.length > 0
                            ? html`
                                <div
                                  class="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs flex items-center justify-between shadow-2xs"
                                >
                                  <div
                                    class="flex items-center gap-2 text-primary font-bold truncate"
                                  >
                                    <span
                                      class="material-symbols-outlined text-base"
                                      >file_present</span
                                    >
                                    <span class="truncate"
                                      >${this.currentLang === "ko"
                                        ? "선택된 개별 파일들"
                                        : "Selected Files"}</span
                                    >
                                  </div>
                                  <span
                                    class="text-on-surface-variant font-mono text-[11px] font-bold"
                                    >${this.svgFiles.length}개 파일 로드됨</span
                                  >
                                </div>
                              `
                            : html`
                                <div>
                                  <p
                                    class="text-xs text-on-surface-variant font-medium"
                                  >
                                    ${this.currentLang === "ko"
                                      ? "지정된 로컬 디렉토리가 없습니다."
                                      : "No local directory specified."}
                                  </p>
                                  <p
                                    class="text-[11px] text-outline flex items-center justify-center gap-1 mt-1"
                                  >
                                    <span
                                      class="material-symbols-outlined text-[13px]"
                                      >info</span
                                    >
                                    <span
                                      >${this.currentLang === "ko"
                                        ? "여기에 드래그하여 바로 가져오세요."
                                        : "Drag & drop files here to import directly."}</span
                                    >
                                  </p>
                                </div>
                              `}
                      </div>
                    </div>
                  `
                : isAudio
                  ? html`
                      <!-- Audio Specific Step 1 Controls (Screenshot 1) -->
                      <div class="space-y-4">
                        <!-- Audio Extension Checkbox Chips -->
                        <div>
                          <label
                            class="block text-xs font-bold text-on-surface-variant mb-2"
                          >
                            ${this.currentLang === "ko"
                              ? "가져올 오디오 확장자"
                              : "Audio Extensions to Import"}
                          </label>
                          <div class="flex items-center gap-2.5">
                            <button
                              type="button"
                              @click="${() => this.toggleAudioExt(".wav")}"
                              class="py-2 px-3.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${this.audioInputExts.includes(
                                ".wav",
                              )
                                ? "bg-primary-fixed text-on-primary-fixed border-primary/40 shadow-2xs"
                                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container border-surface-container"}"
                            >
                              <span
                                class="material-symbols-outlined text-[16px] ${this.audioInputExts.includes(
                                  ".wav",
                                )
                                  ? "text-primary"
                                  : "text-outline"}"
                              >
                                ${this.audioInputExts.includes(".wav")
                                  ? "check_box"
                                  : "check_box_outline_blank"}
                              </span>
                              <span>WAV</span>
                            </button>

                            <button
                              type="button"
                              @click="${() => this.toggleAudioExt(".mp3")}"
                              class="py-2 px-3.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${this.audioInputExts.includes(
                                ".mp3",
                              )
                                ? "bg-primary-fixed text-on-primary-fixed border-primary/40 shadow-2xs"
                                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container border-surface-container"}"
                            >
                              <span
                                class="material-symbols-outlined text-[16px] ${this.audioInputExts.includes(
                                  ".mp3",
                                )
                                  ? "text-primary"
                                  : "text-outline"}"
                              >
                                ${this.audioInputExts.includes(".mp3")
                                  ? "check_box"
                                  : "check_box_outline_blank"}
                              </span>
                              <span>MP3</span>
                            </button>
                          </div>
                        </div>

                        <!-- Dual Buttons: Folder / Files -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            @click="${this.selectFolder}"
                            class="py-4 px-4 bg-surface-container-low hover:bg-surface-container rounded-2xl border border-dashed border-surface-container-high hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group text-center active:scale-[0.99]"
                          >
                            <span
                              class="material-symbols-outlined text-[28px] text-primary group-hover:scale-110 transition-transform"
                              >folder_open</span
                            >
                            <span
                              class="text-xs sm:text-sm font-bold text-on-surface"
                              >${this.currentLang === "ko"
                                ? "로컬 디렉토리(폴더) 지정"
                                : "Select Local Folder"}</span
                            >
                          </button>

                          <button
                            type="button"
                            @click="${this.triggerFileInput}"
                            class="py-4 px-4 bg-surface-container-low hover:bg-surface-container rounded-2xl border border-dashed border-surface-container-high hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group text-center active:scale-[0.99]"
                          >
                            <span
                              class="material-symbols-outlined text-[28px] text-primary group-hover:scale-110 transition-transform"
                              >file_open</span
                            >
                            <span
                              class="text-xs sm:text-sm font-bold text-on-surface"
                              >${this.currentLang === "ko"
                                ? "개별 파일 선택"
                                : "Select Individual Files"}</span
                            >
                          </button>
                        </div>

                        <!-- Status Info Display -->
                        <div class="text-center py-1 select-none">
                          ${this.audioDirHandle
                            ? html`
                                <div
                                  class="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs flex items-center justify-between shadow-2xs"
                                >
                                  <div
                                    class="flex items-center gap-2 text-primary font-bold truncate"
                                  >
                                    <span
                                      class="material-symbols-outlined text-base"
                                      >folder</span
                                    >
                                    <span
                                      class="truncate max-w-50 sm:max-w-xs"
                                      title="${this.audioDirHandle.name}"
                                      >${this.audioDirHandle.name}</span
                                    >
                                  </div>
                                  <div class="flex items-center gap-2">
                                    <span
                                      class="text-on-surface-variant font-mono text-[11px] font-bold"
                                      >${this.audioFiles.length}개 파일
                                      로드됨</span
                                    >
                                    <button
                                      type="button"
                                      @click="${(e: Event) => {
                                        e.stopPropagation();
                                        this.audioDirHandle = null;
                                      }}"
                                      class="text-outline hover:text-rose-500 text-[11px] font-bold cursor-pointer transition-colors"
                                    >
                                      ${this.currentLang === "ko"
                                        ? "연동 해제"
                                        : "Unlink"}
                                    </button>
                                  </div>
                                </div>
                              `
                            : this.audioFiles.length > 0
                              ? html`
                                  <div
                                    class="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs flex items-center justify-between shadow-2xs"
                                  >
                                    <div
                                      class="flex items-center gap-2 text-primary font-bold truncate"
                                    >
                                      <span
                                        class="material-symbols-outlined text-base"
                                        >file_present</span
                                      >
                                      <span class="truncate"
                                        >${this.currentLang === "ko"
                                          ? "선택된 개별 오디오 파일들"
                                          : "Selected Audio Files"}</span
                                      >
                                    </div>
                                    <div class="flex items-center gap-2">
                                      <span
                                        class="text-on-surface-variant font-mono text-[11px] font-bold"
                                        >${this.audioFiles.length}개 파일
                                        로드됨</span
                                      >
                                      <button
                                        type="button"
                                        @click="${(e: Event) => {
                                          e.stopPropagation();
                                          this.audioFiles = [];
                                        }}"
                                        class="text-outline hover:text-rose-500 text-[11px] font-bold cursor-pointer transition-colors"
                                      >
                                        ${this.currentLang === "ko"
                                          ? "초기화"
                                          : "Clear"}
                                      </button>
                                    </div>
                                  </div>
                                `
                              : html`
                                  <div>
                                    <p
                                      class="text-xs text-on-surface-variant font-medium"
                                    >
                                      ${this.currentLang === "ko"
                                        ? "지정된 로컬 디렉토리가 없습니다."
                                        : "No local directory specified."}
                                    </p>
                                    <p
                                      class="text-[11px] text-outline flex items-center justify-center gap-1 mt-1"
                                    >
                                      <span
                                        class="material-symbols-outlined text-[13px]"
                                        >info</span
                                      >
                                      <span
                                        >${this.currentLang === "ko"
                                          ? "여기에 드래그하여 바로 가져오세요."
                                          : "Drag & drop files here to import directly."}</span
                                      >
                                    </p>
                                  </div>
                                `}
                        </div>
                      </div>
                    `
                  : isRename
                    ? html`
                        <!-- Rename Specific Step 1 Controls (Screenshot 4) -->
                        <div class="space-y-4">
                          <!-- Extension Filter Text Input -->
                          <div>
                            <label
                              class="block text-xs font-bold text-on-surface-variant mb-1.5"
                            >
                              ${this.currentLang === "ko"
                                ? "필터링할 파일 확장자 (비워두면 전체 가져오기)"
                                : "Filter File Extensions (Empty for all)"}
                            </label>
                            <input
                              type="text"
                              .value="${this.renameExtFilter}"
                              @input="${(e: any) =>
                                (this.renameExtFilter = e.target.value)}"
                              placeholder="${this.currentLang === "ko"
                                ? "예: html, css, js (비워두면 전체)"
                                : "e.g., html, css, js (empty for all)"}"
                              class="w-full py-2.5 px-3.5 rounded-xl border border-surface-container bg-surface-container-low text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary/60 transition-colors"
                            />
                          </div>

                          <!-- Dual Buttons: Folder / Files -->
                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                              type="button"
                              @click="${this.selectFolder}"
                              class="py-4 px-4 bg-surface-container-low hover:bg-surface-container rounded-2xl border border-dashed border-surface-container-high hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group text-center active:scale-[0.99]"
                            >
                              <span
                                class="material-symbols-outlined text-[28px] text-primary group-hover:scale-110 transition-transform"
                                >folder_open</span
                              >
                              <span
                                class="text-xs sm:text-sm font-bold text-on-surface"
                                >${this.currentLang === "ko"
                                  ? "로컬 디렉토리(폴더) 지정"
                                  : "Select Local Folder"}</span
                              >
                            </button>

                            <button
                              type="button"
                              @click="${this.triggerFileInput}"
                              class="py-4 px-4 bg-surface-container-low hover:bg-surface-container rounded-2xl border border-dashed border-surface-container-high hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group text-center active:scale-[0.99]"
                            >
                              <span
                                class="material-symbols-outlined text-[28px] text-primary group-hover:scale-110 transition-transform"
                                >file_open</span
                              >
                              <span
                                class="text-xs sm:text-sm font-bold text-on-surface"
                                >${this.currentLang === "ko"
                                  ? "개별 파일 선택"
                                  : "Select Individual Files"}</span
                              >
                            </button>
                          </div>

                          <!-- Status Info Display -->
                          <div class="text-center py-1 select-none">
                            ${this.renameDirHandle
                              ? html`
                                  <div
                                    class="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs flex items-center justify-between shadow-2xs"
                                  >
                                    <div
                                      class="flex items-center gap-2 text-primary font-bold truncate"
                                    >
                                      <span
                                        class="material-symbols-outlined text-base"
                                        >folder</span
                                      >
                                      <span
                                        class="truncate max-w-50 sm:max-w-xs"
                                        title="${this.renameDirHandle.name}"
                                        >${this.renameDirHandle.name}</span
                                      >
                                    </div>
                                    <div class="flex items-center gap-2">
                                      <span
                                        class="text-on-surface-variant font-mono text-[11px] font-bold"
                                        >${this.renameFiles.length}개 파일
                                        로드됨</span
                                      >
                                      <button
                                        type="button"
                                        @click="${(e: Event) => {
                                          e.stopPropagation();
                                          this.renameDirHandle = null;
                                        }}"
                                        class="text-outline hover:text-rose-500 text-[11px] font-bold cursor-pointer transition-colors"
                                      >
                                        ${this.currentLang === "ko"
                                          ? "연동 해제"
                                          : "Unlink"}
                                      </button>
                                    </div>
                                  </div>
                                `
                              : this.renameFiles.length > 0
                                ? html`
                                    <div
                                      class="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs flex items-center justify-between shadow-2xs"
                                    >
                                      <div
                                        class="flex items-center gap-2 text-primary font-bold truncate"
                                      >
                                        <span
                                          class="material-symbols-outlined text-base"
                                          >file_present</span
                                        >
                                        <span class="truncate"
                                          >${this.currentLang === "ko"
                                            ? "선택된 개별 파일들"
                                            : "Selected Files"}</span
                                        >
                                      </div>
                                      <div class="flex items-center gap-2">
                                        <span
                                          class="text-on-surface-variant font-mono text-[11px] font-bold"
                                          >${this.renameFiles.length}개 파일
                                          로드됨</span
                                        >
                                        <button
                                          type="button"
                                          @click="${(e: Event) => {
                                            e.stopPropagation();
                                            this.renameFiles = [];
                                          }}"
                                          class="text-outline hover:text-rose-500 text-[11px] font-bold cursor-pointer transition-colors"
                                        >
                                          ${this.currentLang === "ko"
                                            ? "초기화"
                                            : "Clear"}
                                        </button>
                                      </div>
                                    </div>
                                  `
                                : html`
                                    <div>
                                      <p
                                        class="text-xs text-on-surface-variant font-medium"
                                      >
                                        ${this.currentLang === "ko"
                                          ? "지정된 로컬 디렉토리가 없습니다."
                                          : "No local directory specified."}
                                      </p>
                                      <p
                                        class="text-[11px] text-outline flex items-center justify-center gap-1 mt-1"
                                      >
                                        <span
                                          class="material-symbols-outlined text-[13px]"
                                          >info</span
                                        >
                                        <span
                                          >${this.currentLang === "ko"
                                            ? "여기에 드래그하여 바로 가져오세요."
                                            : "Drag & drop files here to import directly."}</span
                                        >
                                      </p>
                                    </div>
                                  `}
                          </div>
                        </div>
                      `
                    : html`
                        <!-- Resource Cleaner Specific Step 1 Controls (Screenshot 5) -->
                        <div
                          class="${this.resourceFolderOpen
                            ? "space-y-4"
                            : "hidden"}"
                        >
                          <!-- Connected Folder Card -->
                          <div
                            class="p-4 rounded-2xl bg-surface-container-low border border-surface-container flex items-center justify-between gap-3 shadow-2xs"
                          >
                            <div class="flex items-center gap-3.5 min-w-0">
                              <div
                                class="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"
                              >
                                <span
                                  class="material-symbols-outlined text-[26px]"
                                  >folder</span
                                >
                              </div>
                              <div class="min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                  <span
                                    class="text-sm sm:text-base font-extrabold text-on-surface truncate"
                                    title="${this.resourceDirHandle?.name ||
                                    ""}"
                                  >
                                    ${this.resourceDirHandle
                                      ? this.resourceDirHandle.name
                                      : this.currentLang === "ko"
                                        ? "지정된 폴더 없음"
                                        : "No Folder Selected"}
                                  </span>
                                  ${this.resourceDirHandle
                                    ? html`
                                        <span
                                          class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20"
                                        >
                                          ${this.currentLang === "ko"
                                            ? "폴더 선택됨"
                                            : "Folder Selected"}
                                        </span>
                                      `
                                    : html`
                                        <span
                                          class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container text-on-surface-variant"
                                        >
                                          ${this.currentLang === "ko"
                                            ? "미연동"
                                            : "Not Linked"}
                                        </span>
                                      `}
                                </div>
                                <p
                                  class="text-xs text-on-surface-variant mt-0.5"
                                >
                                  ${this.currentLang === "ko"
                                    ? `감지된 총파일: ${this.resourceFiles.length}개`
                                    : `Total detected files: ${this.resourceFiles.length}`}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              @click="${this.selectFolder}"
                              class="py-2.5 px-3.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-on-surface border border-surface-container text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs active:scale-95"
                            >
                              <span
                                class="material-symbols-outlined text-[16px]"
                                >create_new_folder</span
                              >
                              <span
                                >${this.currentLang === "ko"
                                  ? "다른 폴더 선택"
                                  : "Change Folder"}</span
                              >
                            </button>
                          </div>

                          <!-- Embedded Folder Structure Explorer -->
                          ${this.resourceDirHandle ||
                          this.resourceFiles.length > 0
                            ? html`
                                <folder-tree-view
                                  .dirHandle="${this.resourceDirHandle}"
                                  .files="${this.resourceFiles}"
                                  .selectedPath="${this
                                    .resourceSelectedRootSegment}"
                                  .lang="${this.currentLang}"
                                  .rootName="${this.resourceDirHandle?.name ||
                                  ""}"
                                  @select-folder-scope="${(e: CustomEvent) =>
                                    this.handleSelectRootSegment(
                                      e.detail.path,
                                    )}"
                                ></folder-tree-view>
                              `
                            : html`
                                <div
                                  @click="${this.selectFolder}"
                                  class="p-8 rounded-2xl border-2 border-dashed border-surface-container-high hover:border-primary/50 bg-surface-container-low/50 hover:bg-surface-container-low text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group"
                                >
                                  <div
                                    class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform"
                                  >
                                    <span
                                      class="material-symbols-outlined text-[28px]"
                                      >folder_open</span
                                    >
                                  </div>
                                  <p
                                    class="text-xs sm:text-sm font-bold text-on-surface"
                                  >
                                    ${this.currentLang === "ko"
                                      ? "웹 프로젝트 로컬 디렉토리(폴더) 지정"
                                      : "Select Web Project Local Folder"}
                                  </p>
                                  <p
                                    class="text-[11px] text-on-surface-variant"
                                  >
                                    ${this.currentLang === "ko"
                                      ? "HTML, CSS, JS 및 이미지·폰트 리소스가 포함된 웹 프로젝트 폴더를 선택하세요."
                                      : "Select your web project folder containing HTML, CSS, JS and asset files."}
                                  </p>
                                </div>
                              `}
                        </div>
                      `}
            </div>

            ${isAudio
              ? html`
                  <!-- SMIL / 타임스탬프 (clipBegin & clipEnd) 추출 Card (Screenshot 1) -->
                  <div
                    class="bg-surface-container-lowest rounded-2xl border border-surface-container-high shadow-xs p-5 sm:p-6 space-y-3.5 sm:space-y-4 relative overflow-hidden"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div
                          class="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"
                        >
                          <span class="material-symbols-outlined text-[22px]"
                            >timer</span
                          >
                        </div>
                        <div class="flex items-center gap-2">
                          <h3
                            class="font-bold text-sm sm:text-base text-on-surface"
                          >
                            ${this.currentLang === "ko"
                              ? "SMIL / 타임스탬프 (clipBegin & clipEnd) 추출"
                              : "SMIL / Timestamp (clipBegin & clipEnd) Extraction"}
                          </h3>
                          <span
                            class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary uppercase"
                          >
                            EPUB / SMIL
                          </span>
                        </div>
                      </div>
                    </div>
                    <p class="text-xs text-on-surface-variant leading-relaxed">
                      ${this.currentLang === "ko"
                        ? "로드된 오디오 파일의 전체 재생 길이를 분석하여 EPUB/SMIL용 clipBegin과 clipEnd 타임스탬프를 일괄 생성합니다."
                        : "Analyzes total playback duration of loaded audio files to batch-generate clipBegin and clipEnd timestamps for EPUB/SMIL."}
                    </p>
                    <button
                      type="button"
                      @click="${this.handleExtractTimestamps}"
                      class="w-full py-3.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all active:scale-[0.99]"
                      id="btn-extract-smil"
                    >
                      <span class="material-symbols-outlined text-base"
                        >bolt</span
                      >
                      <span
                        >${this.currentLang === "ko"
                          ? "타임스탬프 추출 및 SMIL/JSON 생성"
                          : "Extract Timestamps & Generate SMIL/JSON"}</span
                      >
                    </button>
                  </div>
                `
              : nothing}

            <!-- Step 2: Detailed Option Settings Card (Stitch 4-tool Layout) -->
            <div
              class="bg-surface-container-lowest rounded-2xl border border-surface-container-high shadow-xs p-5 sm:p-6 space-y-3.5 sm:space-y-4 relative overflow-hidden"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <span
                    class="w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-xs font-bold shrink-0"
                    >2</span
                  >
                  <span class="font-bold text-sm sm:text-base text-on-surface">
                    ${isSvg
                      ? this.currentLang === "ko"
                        ? "내보내기 설정"
                        : "Export Settings"
                      : isAudio
                        ? this.currentLang === "ko"
                          ? "MP3 변환 품질 설정"
                          : "MP3 Quality Settings"
                        : isRename
                          ? this.currentLang === "ko"
                            ? "이름 변경 규칙 설정"
                            : "Rename Rule Settings"
                          : this.currentLang === "ko"
                            ? "미사용 리소스 정리 & 대상 범위 설정"
                            : "Unused Resource Cleanup Options"}
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  ${isRename
                    ? html`
                        <button
                          type="button"
                          @click="${this.handleApplyClearFilename}"
                          class="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-surface-container text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                        >
                          ${this.currentLang === "ko"
                            ? "전체 이름 지우기"
                            : "Clear All Names"}
                        </button>
                      `
                    : ""}

                  <button
                    type="button"
                    @click="${() => {
                      if (isSvg) this.svgSettingsOpen = !this.svgSettingsOpen;
                      else if (isAudio)
                        this.audioSettingsOpen = !this.audioSettingsOpen;
                      else if (isRename)
                        this.renameSettingsOpen = !this.renameSettingsOpen;
                      else
                        this.resourceSettingsOpen = !this.resourceSettingsOpen;
                    }}"
                    class="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                    title="${(isSvg && this.svgSettingsOpen) ||
                    (isAudio && this.audioSettingsOpen) ||
                    (isRename && this.renameSettingsOpen) ||
                    (isResource && this.resourceSettingsOpen)
                      ? "접기"
                      : "펼치기"}"
                  >
                    <span
                      class="material-symbols-outlined text-[20px] transition-transform duration-200 ${(isSvg &&
                        this.svgSettingsOpen) ||
                      (isAudio && this.audioSettingsOpen) ||
                      (isRename && this.renameSettingsOpen) ||
                      (isResource && this.resourceSettingsOpen)
                        ? ""
                        : "rotate-180"}"
                    >
                      expand_less
                    </span>
                  </button>
                </div>
              </div>

              <!-- SVG Options: 3 Clean Vertical Sub-sections -->
              ${isSvg
                ? html`
                    <div
                      class="${this.svgSettingsOpen ? "space-y-4" : "hidden"}"
                    >
                      <!-- 1. 출력 이미지 포맷 및 배율 -->
                      <div
                        class="bg-surface-container-low p-4 sm:p-5 rounded-xl border border-surface-container space-y-4"
                      >
                        <div
                          class="flex items-center justify-between border-b border-surface-container pb-2.5"
                        >
                          <div
                            class="flex items-center gap-2 text-xs sm:text-sm font-bold text-on-surface"
                          >
                            <span
                              class="material-symbols-outlined text-[18px] text-primary"
                              >tune</span
                            >
                            <span
                              >${this.currentLang === "ko"
                                ? "출력 이미지 포맷 및 배율"
                                : "Output Format & Scale"}</span
                            >
                          </div>
                        </div>

                        <!-- Format toggle -->
                        <div>
                          <label
                            class="block text-xs font-bold text-on-surface-variant mb-2"
                          >
                            ${this.currentLang === "ko"
                              ? "출력 이미지 포맷"
                              : "Output Image Format"}
                          </label>
                          <div class="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              @click="${() => (this.exportFormat = "png")}"
                              class="py-2.5 px-4 rounded-xl border text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${this
                                .exportFormat === "png"
                                ? "bg-primary-fixed text-on-primary-fixed border-primary/40 shadow-xs"
                                : "bg-surface-container-lowest text-on-surface hover:bg-surface-container border-surface-container"}"
                            >
                              <span class="material-symbols-outlined text-base"
                                >image</span
                              >
                              <span>PNG</span>
                            </button>
                            <button
                              type="button"
                              @click="${() => (this.exportFormat = "jpg")}"
                              class="py-2.5 px-4 rounded-xl border text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${this
                                .exportFormat === "jpg"
                                ? "bg-primary-fixed text-on-primary-fixed border-primary/40 shadow-xs"
                                : "bg-surface-container-lowest text-on-surface hover:bg-surface-container border-surface-container"}"
                            >
                              <span class="material-symbols-outlined text-base"
                                >photo</span
                              >
                              <span>JPG</span>
                            </button>
                          </div>
                        </div>

                        <!-- Scale single select list with custom suffix inputs -->
                        <div>
                          <label
                            class="block text-xs font-bold text-on-surface-variant mb-2"
                          >
                            ${this.currentLang === "ko"
                              ? "출력 이미지 배율 설정 (단일 선택)"
                              : "Output Scale Setting (Single Select)"}
                          </label>
                          <div class="space-y-2.5">
                            ${this.scaleOptions.map((item) => {
                              const itemLabel =
                                item.scale === 1
                                  ? this.currentLang === "ko"
                                    ? "1.0x (기본)"
                                    : "1.0x (Default)"
                                  : item.label;
                              const isSelected =
                                this.selectedScale === item.scale;
                              return html`
                                <div class="flex items-center gap-2.5">
                                  <button
                                    type="button"
                                    @click="${() =>
                                      (this.selectedScale = item.scale)}"
                                    class="flex-1 p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${isSelected
                                      ? "bg-primary-fixed text-on-primary-fixed font-bold border-primary/40 shadow-xs"
                                      : "bg-surface-container-lowest text-on-surface hover:bg-surface-container border-surface-container"}"
                                  >
                                    <span
                                      class="text-xs sm:text-sm font-bold whitespace-nowrap"
                                      >${itemLabel}</span
                                    >
                                    <div
                                      class="w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center ${isSelected
                                        ? "border-primary bg-primary/10 shadow-2xs"
                                        : "border-outline/50 bg-surface-container-lowest"}"
                                    >
                                      ${isSelected
                                        ? html`<div
                                            class="w-2 h-2 rounded-full bg-primary"
                                          ></div>`
                                        : ""}
                                    </div>
                                  </button>
                                  <div class="w-28 sm:w-36 shrink-0">
                                    <input
                                      type="text"
                                      .value="${item.suffix}"
                                      @input="${(e: any) =>
                                        this.handleChangeSuffix(
                                          item.scale,
                                          e.target.value,
                                        )}"
                                      placeholder="${this.currentLang === "ko"
                                        ? "접미사 없음"
                                        : "No suffix"}"
                                      class="w-full px-3 py-3 bg-surface-container-lowest border border-surface-container focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-xl text-on-surface text-xs outline-none transition-all font-mono shadow-2xs"
                                      title="${this.currentLang === "ko"
                                        ? "배율 적용 시 파일명 끝에 붙을 접미사"
                                        : "Suffix added to filename"}"
                                    />
                                  </div>
                                </div>
                              `;
                            })}
                          </div>
                        </div>
                      </div>

                      <!-- 2. 내보낼 대상 폴더 (출력 경로) -->
                      <div
                        class="bg-surface-container-low p-4 sm:p-5 rounded-xl border border-surface-container space-y-3"
                      >
                        <div
                          class="flex items-center justify-between border-b border-surface-container pb-2.5"
                        >
                          <div
                            class="flex items-center gap-2 text-xs sm:text-sm font-bold text-on-surface"
                          >
                            <span
                              class="material-symbols-outlined text-[18px] text-primary"
                              >folder_open</span
                            >
                            <span
                              >${this.currentLang === "ko"
                                ? "내보낼 대상 폴더 (출력 경로)"
                                : "Export Target Directory"}</span
                            >
                          </div>
                          ${this.svgOutputDirHandle
                            ? html`<span
                                class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold"
                                >${this.currentLang === "ko"
                                  ? "지정됨"
                                  : "Configured"}</span
                              >`
                            : ""}
                        </div>

                        ${this.svgOutputDirHandle
                          ? html`
                              <div
                                class="p-3 bg-surface-container-lowest rounded-xl border border-surface-container text-xs flex items-center justify-between shadow-2xs"
                              >
                                <div
                                  class="flex items-center gap-2 text-on-surface font-bold truncate"
                                >
                                  <span
                                    class="material-symbols-outlined text-base text-primary"
                                    >folder</span
                                  >
                                  <span
                                    class="truncate max-w-40 sm:max-w-xs"
                                    title="${this.svgOutputDirHandle.name}"
                                    >${this.svgOutputDirHandle.name}</span
                                  >
                                </div>
                                <div class="flex items-center gap-2">
                                  <button
                                    type="button"
                                    @click="${this.selectOutputFolder}"
                                    class="text-primary hover:underline text-[11px] font-bold cursor-pointer"
                                  >
                                    ${this.currentLang === "ko"
                                      ? "폴더 변경"
                                      : "Change"}
                                  </button>
                                  <button
                                    type="button"
                                    @click="${() =>
                                      (this.svgOutputDirHandle = null)}"
                                    class="text-outline hover:text-rose-500 text-[11px] font-bold cursor-pointer"
                                  >
                                    ${this.currentLang === "ko"
                                      ? "연동 해제"
                                      : "Unlink"}
                                  </button>
                                </div>
                              </div>
                            `
                          : html`
                              <button
                                type="button"
                                @click="${this.selectOutputFolder}"
                                class="w-full py-4 px-4 bg-surface-container-lowest hover:bg-surface-container rounded-xl border border-dashed border-surface-container-high hover:border-primary/50 text-xs sm:text-sm font-bold text-on-surface transition-all flex items-center justify-center gap-2 cursor-pointer group"
                              >
                                <span
                                  class="material-symbols-outlined text-base text-primary group-hover:scale-110 transition-transform"
                                  >folder_open</span
                                >
                                <span
                                  >${this.currentLang === "ko"
                                    ? "출력 디렉토리(폴더) 지정"
                                    : "Select Output Folder"}</span
                                >
                              </button>
                            `}
                        <p
                          class="text-[11px] text-on-surface-variant leading-relaxed"
                        >
                          ${this.currentLang === "ko"
                            ? "출력 폴더가 미지정된 경우 원본 파일 위치와 동일한 경로에 결과물이 개별 생성됩니다."
                            : "If not specified, converted files are generated in the original source location."}
                        </p>
                      </div>

                      <!-- 3. 원본 파일 정리 옵션 -->
                      <div
                        class="bg-surface-container-low p-4 sm:p-5 rounded-xl border border-surface-container space-y-3"
                      >
                        <div
                          class="flex items-center justify-between border-b border-surface-container pb-2.5"
                        >
                          <div
                            class="flex items-center gap-2 text-xs sm:text-sm font-bold text-on-surface"
                          >
                            <span
                              class="material-symbols-outlined text-[18px] text-rose-500"
                              >delete_sweep</span
                            >
                            <span
                              >${this.currentLang === "ko"
                                ? "원본 파일 정리 옵션"
                                : "Original File Cleanup"}</span
                            >
                          </div>
                        </div>

                        <div
                          class="bg-surface-container-lowest p-3.5 sm:p-4 rounded-xl border border-surface-container space-y-2"
                        >
                          <label
                            class="flex items-start gap-3 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              .checked="${this.svgDeleteOriginal}"
                              @change="${(e: any) =>
                                (this.svgDeleteOriginal = e.target.checked)}"
                              class="w-4.5 h-4.5 mt-0.5 text-primary rounded accent-primary cursor-pointer"
                            />
                            <div class="text-xs sm:text-sm">
                              <span class="font-bold text-on-surface block">
                                ${this.currentLang === "ko"
                                  ? "변환 후 원본 SVG 파일 자동 제거"
                                  : "Auto-delete original SVG files after conversion"}
                              </span>
                              <span
                                class="text-on-surface-variant block mt-0.5 text-[11px] leading-relaxed"
                              >
                                ${this.currentLang === "ko"
                                  ? "변환 프로세스가 완전히 정상 종료되면 해당 로컬 원본 파일(.svg)을 대상 폴더에서 삭제합니다."
                                  : "Permanently removes the original SVG file (.svg) from the local folder once converted successfully."}
                              </span>
                            </div>
                          </label>

                          ${this.svgDeleteOriginal &&
                          (!this.apiSupported || !this.svgDirHandle)
                            ? html`
                                <div
                                  class="mt-2 text-xs text-rose-500 font-bold flex items-center gap-1.5 pt-2 border-t border-surface-container"
                                >
                                  <span
                                    class="material-symbols-outlined text-[15px]"
                                    >error</span
                                  >
                                  <span
                                    >${this.currentLang === "ko"
                                      ? "로컬 디렉토리가 브라우저 상에 정상 연동되어 있어야 원본 제어가 가능합니다."
                                      : "Local folder connection required for original file deletion."}</span
                                  >
                                </div>
                              `
                            : ""}
                        </div>
                      </div>
                    </div>
                  `
                : ""}

              <!-- Audio Options: 3 Sub-sections matching Screenshot 2 -->
              ${isAudio
                ? html`
                    <div
                      class="${this.audioSettingsOpen ? "space-y-4" : "hidden"}"
                    >
                      <!-- 1. MP3 출력 비트레이트 (음질) -->
                      <div
                        class="bg-surface-container-low p-4 sm:p-5 rounded-xl border border-surface-container space-y-3"
                      >
                        <div
                          class="flex items-center justify-between border-b border-surface-container pb-2.5"
                        >
                          <div
                            class="flex items-center gap-2 text-xs sm:text-sm font-bold text-on-surface"
                          >
                            <span
                              class="material-symbols-outlined text-[18px] text-primary"
                              >equalizer</span
                            >
                            <span
                              >${this.currentLang === "ko"
                                ? "MP3 출력 비트레이트 (음질)"
                                : "MP3 Output Bitrate (Quality)"}</span
                            >
                          </div>
                        </div>

                        <!-- 2x2 Bitrate Grid -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          ${[
                            { rate: 128, label: "128 kbps" },
                            {
                              rate: 192,
                              label:
                                this.currentLang === "ko"
                                  ? "192 kbps (권장)"
                                  : "192 kbps (Rec)",
                            },
                            { rate: 256, label: "256 kbps" },
                            {
                              rate: 320,
                              label:
                                this.currentLang === "ko"
                                  ? "320 kbps (고음질)"
                                  : "320 kbps (HQ)",
                            },
                          ].map(
                            (item) => html`
                              <button
                                type="button"
                                @click="${() =>
                                  (this.audioBitrate = item.rate)}"
                                class="py-3 px-4 rounded-xl border text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center text-center ${this
                                  .audioBitrate === item.rate
                                  ? "bg-primary-fixed text-on-primary-fixed border-primary/50 shadow-xs ring-1 ring-primary/30"
                                  : "bg-surface-container-lowest text-on-surface hover:bg-surface-container border-surface-container"}"
                              >
                                ${item.label}
                              </button>
                            `,
                          )}
                        </div>
                        <p
                          class="text-[11px] text-on-surface-variant leading-relaxed"
                        >
                          ${this.currentLang === "ko"
                            ? "비트레이트가 높을수록 음질이 좋으나 파일 크기가 커집니다."
                            : "Higher bitrate delivers better audio fidelity with larger file sizes."}
                        </p>
                      </div>

                      <!-- 2. 내보낼 대상 폴더 (출력 경로) -->
                      <div
                        class="bg-surface-container-low p-4 sm:p-5 rounded-xl border border-surface-container space-y-3"
                      >
                        <div
                          class="flex items-center justify-between border-b border-surface-container pb-2.5"
                        >
                          <div
                            class="flex items-center gap-2 text-xs sm:text-sm font-bold text-on-surface"
                          >
                            <span
                              class="material-symbols-outlined text-[18px] text-primary"
                              >folder_special</span
                            >
                            <span
                              >${this.currentLang === "ko"
                                ? "내보낼 대상 폴더 (출력 경로)"
                                : "Export Target Directory"}</span
                            >
                          </div>
                        </div>

                        ${this.audioOutputDirHandle
                          ? html`
                              <div
                                class="p-3 bg-surface-container-lowest rounded-xl border border-surface-container text-xs flex items-center justify-between shadow-2xs"
                              >
                                <div
                                  class="flex items-center gap-2 text-on-surface font-bold truncate"
                                >
                                  <span
                                    class="material-symbols-outlined text-base text-primary"
                                    >folder</span
                                  >
                                  <span
                                    class="truncate max-w-50 sm:max-w-xs"
                                    title="${this.audioOutputDirHandle.name}"
                                    >${this.audioOutputDirHandle.name}</span
                                  >
                                </div>
                                <div class="flex items-center gap-2">
                                  <button
                                    type="button"
                                    @click="${this.selectOutputFolder}"
                                    class="text-primary hover:underline text-[11px] font-bold cursor-pointer"
                                  >
                                    ${this.currentLang === "ko"
                                      ? "폴더 변경"
                                      : "Change"}
                                  </button>
                                  <button
                                    type="button"
                                    @click="${() =>
                                      (this.audioOutputDirHandle = null)}"
                                    class="text-outline hover:text-rose-500 text-[11px] font-bold cursor-pointer"
                                  >
                                    ${this.currentLang === "ko"
                                      ? "연동 해제"
                                      : "Unlink"}
                                  </button>
                                </div>
                              </div>
                            `
                          : html`
                              <button
                                type="button"
                                @click="${this.selectOutputFolder}"
                                class="w-full py-4 px-4 bg-surface-container-lowest hover:bg-surface-container rounded-xl border border-dashed border-surface-container-high hover:border-primary/50 text-xs sm:text-sm font-bold text-on-surface transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <span
                                  class="material-symbols-outlined text-base text-primary"
                                  >folder_open</span
                                >
                                <span
                                  >${this.currentLang === "ko"
                                    ? "출력 디렉토리(폴더) 지정"
                                    : "Select Output Folder"}</span
                                >
                              </button>
                            `}
                        <p
                          class="text-[11px] text-on-surface-variant leading-relaxed"
                        >
                          ${this.currentLang === "ko"
                            ? "출력 폴더가 미지정된 경우 원본 파일 위치와 동일한 경로에 결과물이 개별 생성됩니다."
                            : "If not specified, converted files are generated in the original source location."}
                        </p>
                      </div>

                      <!-- 3. 원본 파일 정리 옵션 -->
                      <div
                        class="bg-surface-container-low p-4 sm:p-5 rounded-xl border border-surface-container space-y-3"
                      >
                        <div
                          class="flex items-center justify-between border-b border-surface-container pb-2.5"
                        >
                          <div
                            class="flex items-center gap-2 text-xs sm:text-sm font-bold text-on-surface"
                          >
                            <span
                              class="material-symbols-outlined text-[18px] text-rose-500"
                              >delete_sweep</span
                            >
                            <span
                              >${this.currentLang === "ko"
                                ? "원본 파일 정리 옵션"
                                : "Original File Cleanup"}</span
                            >
                          </div>
                        </div>

                        <div
                          class="bg-surface-container-lowest p-3.5 sm:p-4 rounded-xl border border-surface-container space-y-2"
                        >
                          <label
                            class="flex items-start gap-3 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              .checked="${this.audioDeleteOriginal}"
                              @change="${(e: any) =>
                                (this.audioDeleteOriginal = e.target.checked)}"
                              class="w-4.5 h-4.5 mt-0.5 text-primary rounded accent-primary cursor-pointer"
                            />
                            <div class="text-xs sm:text-sm">
                              <span class="font-bold text-on-surface block">
                                ${this.currentLang === "ko"
                                  ? "변환 후 원본 오디오 파일 자동 제거"
                                  : "Auto-delete original audio files after conversion"}
                              </span>
                              <span
                                class="text-on-surface-variant block mt-0.5 text-[11px] leading-relaxed"
                              >
                                ${this.currentLang === "ko"
                                  ? "변환 프로세스가 완전히 정상 종료되면 해당 로컬 원본 오디오 파일(.wav, .mp3)을 대상 폴더에서 삭제합니다."
                                  : "Permanently removes the original audio file (.wav, .mp3) from the local folder once converted successfully."}
                              </span>
                            </div>
                          </label>

                          ${this.audioDeleteOriginal &&
                          (!this.apiSupported || !this.audioDirHandle)
                            ? html`
                                <div
                                  class="mt-2 text-xs text-rose-500 font-bold flex items-center gap-1.5 pt-2 border-t border-surface-container"
                                >
                                  <span
                                    class="material-symbols-outlined text-[15px]"
                                    >error</span
                                  >
                                  <span
                                    >${this.currentLang === "ko"
                                      ? "로컬 디렉토리가 브라우저 상에 정상 연동되어 있어야 원본 제어가 가능합니다."
                                      : "Local folder connection required for original file deletion."}</span
                                  >
                                </div>
                              `
                            : ""}
                        </div>
                      </div>
                    </div>
                  `
                : ""}

              <!-- Rename Options: 6 Modes matching Screenshot 4 -->
              ${isRename
                ? html`
                    <div
                      class="${this.renameSettingsOpen
                        ? "space-y-4"
                        : "hidden"}"
                    >
                      <!-- 6 Rule Mode Buttons (2x3 Grid) -->
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        ${[
                          {
                            id: "replace",
                            icon: "sync",
                            label:
                              this.currentLang === "ko"
                                ? "문자열 바꾸기"
                                : "Replace String",
                          },
                          {
                            id: "prefix-suffix",
                            icon: "format_align_left",
                            label:
                              this.currentLang === "ko"
                                ? "앞이름 / 뒷이름 붙이기"
                                : "Prefix / Suffix",
                          },
                          {
                            id: "remove-pos",
                            icon: "content_cut",
                            label:
                              this.currentLang === "ko"
                                ? "특정 위치 지우기"
                                : "Remove by Position",
                          },
                          {
                            id: "cleanup",
                            icon: "cleaning_services",
                            label:
                              this.currentLang === "ko"
                                ? "일괄 정리 및 지우기"
                                : "Batch Cleanup & Remove",
                          },
                          {
                            id: "numbering",
                            icon: "format_list_numbered",
                            label:
                              this.currentLang === "ko"
                                ? "일련번호 붙이기"
                                : "Add Numbering",
                          },
                          {
                            id: "extension",
                            icon: "edit_document",
                            label:
                              this.currentLang === "ko"
                                ? "확장자 변경 및 추가"
                                : "Change / Add Extension",
                          },
                        ].map(
                          (btn) => html`
                            <button
                              type="button"
                              @click="${() =>
                                (this.renameMode = btn.id as any)}"
                              class="p-3.5 rounded-xl border text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-3 ${this
                                .renameMode === btn.id
                                ? "bg-primary-fixed text-on-primary-fixed border-primary/50 shadow-xs ring-1 ring-primary/30"
                                : "bg-surface-container-low text-on-surface hover:bg-surface-container border-surface-container"}"
                            >
                              <div
                                class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${this
                                  .renameMode === btn.id
                                  ? "bg-primary/20 text-primary"
                                  : "bg-surface-container text-on-surface-variant"}"
                              >
                                <span
                                  class="material-symbols-outlined text-[18px]"
                                  >${btn.icon}</span
                                >
                              </div>
                              <span class="truncate">${btn.label}</span>
                            </button>
                          `,
                        )}
                      </div>

                      <!-- Dynamic Active Rule Input Area -->
                      <div
                        class="p-4 sm:p-5 rounded-xl bg-surface-container-low border border-surface-container"
                      >
                        ${this.renameMode === "replace"
                          ? html`
                              <div class="space-y-3">
                                <div
                                  class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                                >
                                  <div class="sm:col-span-5 space-y-1">
                                    <label
                                      class="text-[11px] font-bold text-on-surface flex items-center justify-between"
                                    >
                                      <span
                                        >${this.currentLang === "ko"
                                          ? "찾을 문자열"
                                          : "Find String"}</span
                                      >
                                      <span class="text-primary text-[10px]"
                                        >${this.currentLang === "ko"
                                          ? "대소문자 구분"
                                          : "Exact match"}</span
                                      >
                                    </label>
                                    <div
                                      class="flex items-center px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container shadow-2xs"
                                    >
                                      <span
                                        class="material-symbols-outlined text-[16px] text-on-surface-variant mr-1.5"
                                        >search</span
                                      >
                                      <input
                                        class="w-full bg-transparent text-xs text-on-surface outline-none"
                                        .value="${this.renameSearchTerm}"
                                        @input="${(e: any) =>
                                          (this.renameSearchTerm =
                                            e.target.value)}"
                                        placeholder="${this.currentLang === "ko"
                                          ? "예: [vlog], (최종)"
                                          : "e.g., [vlog], (final)"}"
                                      />
                                    </div>
                                  </div>
                                  <div
                                    class="sm:col-span-1 flex justify-center text-on-surface-variant"
                                  >
                                    <span
                                      class="material-symbols-outlined text-[20px]"
                                      >arrow_forward</span
                                    >
                                  </div>
                                  <div class="sm:col-span-4 space-y-1">
                                    <label
                                      class="text-[11px] font-bold text-on-surface flex items-center justify-between"
                                    >
                                      <span
                                        >${this.currentLang === "ko"
                                          ? "바꿀 문자열"
                                          : "Replace With"}</span
                                      >
                                      <span
                                        class="text-on-surface-variant text-[10px]"
                                        >${this.currentLang === "ko"
                                          ? "빈칸 시 일치 내용 삭제"
                                          : "Empty to delete"}</span
                                      >
                                    </label>
                                    <div
                                      class="flex items-center px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container shadow-2xs"
                                    >
                                      <span
                                        class="material-symbols-outlined text-[16px] text-on-surface-variant mr-1.5"
                                        >edit_note</span
                                      >
                                      <input
                                        class="w-full bg-transparent text-xs text-on-surface outline-none"
                                        .value="${this.renameReplaceTerm}"
                                        @input="${(e: any) =>
                                          (this.renameReplaceTerm =
                                            e.target.value)}"
                                        placeholder="${this.currentLang === "ko"
                                          ? "(비워둘 경우 일치 내용 삭제)"
                                          : "(Leave blank to remove)"}"
                                      />
                                    </div>
                                  </div>
                                  <div class="sm:col-span-2 pt-2 sm:pt-4">
                                    <button
                                      type="button"
                                      @click="${this.handleExecuteRenameRule}"
                                      class="w-full py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                                    >
                                      <span
                                        class="material-symbols-outlined text-[16px]"
                                        >play_arrow</span
                                      >
                                      <span
                                        >${this.currentLang === "ko"
                                          ? "규칙 적용"
                                          : "Apply"}</span
                                      >
                                    </button>
                                  </div>
                                </div>
                              </div>
                            `
                          : this.renameMode === "prefix-suffix"
                            ? html`
                                <div
                                  class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                                >
                                  <div class="sm:col-span-5 space-y-1">
                                    <label
                                      class="text-[11px] font-bold text-on-surface"
                                      >${this.currentLang === "ko"
                                        ? "앞에 붙일 단어 (접두사)"
                                        : "Prefix Text"}</label
                                    >
                                    <input
                                      class="w-full px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container text-xs text-on-surface outline-none"
                                      .value="${this.renamePrefixTerm}"
                                      @input="${(e: any) =>
                                        (this.renamePrefixTerm =
                                          e.target.value)}"
                                      placeholder="${this.currentLang === "ko"
                                        ? "예: [완료]_"
                                        : "e.g., [Done]_"}"
                                    />
                                  </div>
                                  <div class="sm:col-span-5 space-y-1">
                                    <label
                                      class="text-[11px] font-bold text-on-surface"
                                      >${this.currentLang === "ko"
                                        ? "뒤에 붙일 단어 (접미사)"
                                        : "Suffix Text"}</label
                                    >
                                    <input
                                      class="w-full px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container text-xs text-on-surface outline-none"
                                      .value="${this.renameSuffixTerm}"
                                      @input="${(e: any) =>
                                        (this.renameSuffixTerm =
                                          e.target.value)}"
                                      placeholder="${this.currentLang === "ko"
                                        ? "예: _v2"
                                        : "e.g., _v2"}"
                                    />
                                  </div>
                                  <div class="sm:col-span-2 pt-2 sm:pt-4">
                                    <button
                                      type="button"
                                      @click="${this.handleExecuteRenameRule}"
                                      class="w-full py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                                    >
                                      <span
                                        class="material-symbols-outlined text-[16px]"
                                        >play_arrow</span
                                      >
                                      <span
                                        >${this.currentLang === "ko"
                                          ? "추가 적용"
                                          : "Apply"}</span
                                      >
                                    </button>
                                  </div>
                                </div>
                              `
                            : this.renameMode === "remove-pos"
                              ? html`
                                  <div class="space-y-3">
                                    <div
                                      class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                                    >
                                      <div class="sm:col-span-4 space-y-1">
                                        <label
                                          class="text-[11px] font-bold text-on-surface"
                                          >${this.currentLang === "ko"
                                            ? "지울 기준 위치"
                                            : "Remove Target"}</label
                                        >
                                        <div class="grid grid-cols-3 gap-1">
                                          ${[
                                            {
                                              id: "start",
                                              label:
                                                this.currentLang === "ko"
                                                  ? "앞에서"
                                                  : "Start",
                                            },
                                            {
                                              id: "end",
                                              label:
                                                this.currentLang === "ko"
                                                  ? "뒤에서"
                                                  : "End",
                                            },
                                            {
                                              id: "custom",
                                              label:
                                                this.currentLang === "ko"
                                                  ? "지정위치"
                                                  : "Custom",
                                            },
                                          ].map(
                                            (pos) => html`
                                              <button
                                                type="button"
                                                @click="${() =>
                                                  (this.renameRemovePosType =
                                                    pos.id as any)}"
                                                class="py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${this
                                                  .renameRemovePosType ===
                                                pos.id
                                                  ? "bg-primary text-white shadow-2xs"
                                                  : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-surface-container"}"
                                              >
                                                ${pos.label}
                                              </button>
                                            `,
                                          )}
                                        </div>
                                      </div>

                                      ${this.renameRemovePosType === "custom"
                                        ? html`
                                            <div
                                              class="sm:col-span-3 space-y-1"
                                            >
                                              <label
                                                class="text-[11px] font-bold text-on-surface"
                                                >${this.currentLang === "ko"
                                                  ? "시작 글자 위치"
                                                  : "Start Index"}</label
                                              >
                                              <input
                                                type="number"
                                                min="1"
                                                class="w-full px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container text-xs text-on-surface outline-none"
                                                .value="${this
                                                  .renameRemovePosStart}"
                                                @input="${(e: any) =>
                                                  (this.renameRemovePosStart =
                                                    Number(e.target.value))}"
                                              />
                                            </div>
                                          `
                                        : ""}

                                      <div
                                        class="${this.renameRemovePosType ===
                                        "custom"
                                          ? "sm:col-span-3"
                                          : "sm:col-span-6"} space-y-1"
                                      >
                                        <label
                                          class="text-[11px] font-bold text-on-surface"
                                          >${this.currentLang === "ko"
                                            ? "지울 글자 수"
                                            : "Number of Characters"}</label
                                        >
                                        <input
                                          type="number"
                                          min="1"
                                          class="w-full px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container text-xs text-on-surface outline-none"
                                          .value="${this.renameRemovePosLen}"
                                          @input="${(e: any) =>
                                            (this.renameRemovePosLen = Number(
                                              e.target.value,
                                            ))}"
                                        />
                                      </div>

                                      <div class="sm:col-span-2 pt-2 sm:pt-4">
                                        <button
                                          type="button"
                                          @click="${this
                                            .handleExecuteRemovePos}"
                                          class="w-full py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                                        >
                                          <span
                                            class="material-symbols-outlined text-[16px]"
                                            >content_cut</span
                                          >
                                          <span
                                            >${this.currentLang === "ko"
                                              ? "삭제 적용"
                                              : "Remove"}</span
                                          >
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                `
                              : this.renameMode === "cleanup"
                                ? html`
                                    <div class="space-y-3">
                                      <span
                                        class="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block"
                                      >
                                        ${this.currentLang === "ko"
                                          ? "일괄 정리 프리셋 선택"
                                          : "Select Cleanup Preset"}
                                      </span>
                                      <div class="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          @click="${this.applyPresetBrackets}"
                                          class="px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-surface-container text-xs font-semibold text-on-surface flex items-center gap-1.5 transition-all cursor-pointer hover:shadow-xs"
                                        >
                                          <span
                                            class="material-symbols-outlined text-[16px] text-primary"
                                            >check_circle</span
                                          >
                                          <span>[대괄호·특수문자 제거]</span>
                                        </button>
                                        <button
                                          type="button"
                                          @click="${this.applyPresetDate}"
                                          class="px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-surface-container text-xs font-semibold text-on-surface flex items-center gap-1.5 transition-all cursor-pointer hover:shadow-xs"
                                        >
                                          <span
                                            class="material-symbols-outlined text-[16px] text-primary"
                                            >calendar_today</span
                                          >
                                          <span>날짜형식 YYYY-MM-DD 통일</span>
                                        </button>
                                        <button
                                          type="button"
                                          @click="${this.applyPresetUnderscore}"
                                          class="px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-surface-container text-xs font-semibold text-on-surface flex items-center gap-1.5 transition-all cursor-pointer hover:shadow-xs"
                                        >
                                          <span
                                            class="material-symbols-outlined text-[16px] text-primary"
                                            >space_bar</span
                                          >
                                          <span>공백을 언더스코어(_)로</span>
                                        </button>
                                        <button
                                          type="button"
                                          @click="${this.handleKeepNumbers}"
                                          class="px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-surface-container text-xs font-semibold text-on-surface flex items-center gap-1.5 transition-all cursor-pointer hover:shadow-xs"
                                        >
                                          <span
                                            class="material-symbols-outlined text-[16px] text-primary"
                                            >pin</span
                                          >
                                          <span>숫자만 남기기</span>
                                        </button>
                                        <button
                                          type="button"
                                          @click="${this.handleResetNames}"
                                          class="px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-surface-container text-xs font-semibold text-rose-500 flex items-center gap-1.5 transition-all cursor-pointer hover:shadow-xs"
                                        >
                                          <span
                                            class="material-symbols-outlined text-[16px]"
                                            >restart_alt</span
                                          >
                                          <span
                                            >${this.currentLang === "ko"
                                              ? "원래 이름으로 복원"
                                              : "Reset to Original"}</span
                                          >
                                        </button>
                                      </div>
                                    </div>
                                  `
                                : this.renameMode === "numbering"
                                  ? html`
                                      <div
                                        class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                                      >
                                        <div class="sm:col-span-4 space-y-1">
                                          <label
                                            class="text-[11px] font-bold text-on-surface"
                                            >${this.currentLang === "ko"
                                              ? "시작 번호"
                                              : "Start Number"}</label
                                          >
                                          <input
                                            type="number"
                                            min="1"
                                            class="w-full px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container text-xs text-on-surface outline-none"
                                            .value="${this.renameNumberStart}"
                                            @input="${(e: any) =>
                                              (this.renameNumberStart = Number(
                                                e.target.value,
                                              ))}"
                                          />
                                        </div>
                                        <div class="sm:col-span-3 space-y-1">
                                          <label
                                            class="text-[11px] font-bold text-on-surface"
                                            >${this.currentLang === "ko"
                                              ? "자릿수"
                                              : "Digits"}</label
                                          >
                                          <select
                                            class="w-full px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container text-xs text-on-surface outline-none"
                                            .value="${this.renameNumberDigits}"
                                            @change="${(e: any) =>
                                              (this.renameNumberDigits = Number(
                                                e.target.value,
                                              ))}"
                                          >
                                            <option value="1">
                                              1자리 (1, 2, ...)
                                            </option>
                                            <option value="2">
                                              2자리 (01, 02, ...)
                                            </option>
                                            <option value="3">
                                              3자리 (001, 002, ...)
                                            </option>
                                          </select>
                                        </div>
                                        <div class="sm:col-span-3 space-y-1">
                                          <label
                                            class="text-[11px] font-bold text-on-surface"
                                            >${this.currentLang === "ko"
                                              ? "위치"
                                              : "Position"}</label
                                          >
                                          <select
                                            class="w-full px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container text-xs text-on-surface outline-none"
                                            .value="${this
                                              .renameNumberPosition}"
                                            @change="${(e: any) =>
                                              (this.renameNumberPosition =
                                                e.target.value)}"
                                          >
                                            <option value="prefix">
                                              ${this.currentLang === "ko"
                                                ? "파일명 앞 (01_file)"
                                                : "Prefix (01_file)"}
                                            </option>
                                            <option value="suffix">
                                              ${this.currentLang === "ko"
                                                ? "파일명 뒤 (file_01)"
                                                : "Suffix (file_01)"}
                                            </option>
                                          </select>
                                        </div>
                                        <div class="sm:col-span-2 pt-2 sm:pt-4">
                                          <button
                                            type="button"
                                            @click="${this
                                              .handleExecuteRenameRule}"
                                            class="w-full py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                                          >
                                            <span
                                              class="material-symbols-outlined text-[16px]"
                                              >play_arrow</span
                                            >
                                            <span
                                              >${this.currentLang === "ko"
                                                ? "번호 부여"
                                                : "Apply"}</span
                                            >
                                          </button>
                                        </div>
                                      </div>
                                    `
                                  : html`
                                      <!-- Extension Mode -->
                                      <div
                                        class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                                      >
                                        <div class="sm:col-span-4 space-y-1">
                                          <label
                                            class="text-[11px] font-bold text-on-surface"
                                            >${this.currentLang === "ko"
                                              ? "동작 선택"
                                              : "Action"}</label
                                          >
                                          <div class="grid grid-cols-3 gap-1">
                                            ${[
                                              {
                                                id: "change",
                                                label:
                                                  this.currentLang === "ko"
                                                    ? "변경"
                                                    : "Change",
                                              },
                                              {
                                                id: "add",
                                                label:
                                                  this.currentLang === "ko"
                                                    ? "추가"
                                                    : "Add",
                                              },
                                              {
                                                id: "remove",
                                                label:
                                                  this.currentLang === "ko"
                                                    ? "제거"
                                                    : "Remove",
                                              },
                                            ].map(
                                              (act) => html`
                                                <button
                                                  type="button"
                                                  @click="${() =>
                                                    (this.renameExtAction =
                                                      act.id as any)}"
                                                  class="py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${this
                                                    .renameExtAction === act.id
                                                    ? "bg-primary text-white shadow-2xs"
                                                    : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-surface-container"}"
                                                >
                                                  ${act.label}
                                                </button>
                                              `,
                                            )}
                                          </div>
                                        </div>

                                        <div
                                          class="${this.renameExtAction ===
                                          "remove"
                                            ? "hidden"
                                            : "sm:col-span-6"} space-y-1"
                                        >
                                          <label
                                            class="text-[11px] font-bold text-on-surface"
                                            >${this.currentLang === "ko"
                                              ? "새 확장자"
                                              : "New Extension"}</label
                                          >
                                          <input
                                            type="text"
                                            class="w-full px-3 py-2 bg-surface-container-lowest rounded-lg border border-surface-container text-xs text-on-surface outline-none"
                                            .value="${this.renameNewExtension}"
                                            @input="${(e: any) =>
                                              (this.renameNewExtension =
                                                e.target.value)}"
                                            placeholder="${this.currentLang ===
                                            "ko"
                                              ? "예: png, mp3, txt"
                                              : "e.g., png, mp3, txt"}"
                                          />
                                        </div>

                                        <div
                                          class="${this.renameExtAction ===
                                          "remove"
                                            ? "sm:col-span-8"
                                            : "sm:col-span-2"} pt-2 sm:pt-4"
                                        >
                                          <button
                                            type="button"
                                            @click="${this
                                              .handleExecuteExtension}"
                                            class="w-full py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                                          >
                                            <span
                                              class="material-symbols-outlined text-[16px]"
                                              >edit_document</span
                                            >
                                            <span
                                              >${this.currentLang === "ko"
                                                ? "확장자 적용"
                                                : "Apply"}</span
                                            >
                                          </button>
                                        </div>
                                      </div>
                                    `}
                      </div>
                    </div>
                  `
                : ""}

              <!-- Cleaner Options: Matching Screenshot 5 -->
              ${isResource
                ? html`
                    <div
                      class="${this.resourceSettingsOpen
                        ? "space-y-4"
                        : "hidden"}"
                    >
                      <!-- Project Scan Status Card -->
                      <div
                        class="p-4 rounded-xl bg-surface-container-low border border-surface-container space-y-3"
                      >
                        <div class="flex items-center justify-between">
                          <div
                            class="flex items-center gap-2 text-xs font-bold text-on-surface"
                          >
                            <span
                              class="material-symbols-outlined text-[18px] text-primary"
                              >folder_supervised</span
                            >
                            <span
                              >${this.currentLang === "ko"
                                ? "프로젝트 분석 상태"
                                : "Project Analysis Status"}</span
                            >
                          </div>
                          <span
                            class="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20"
                          >
                            ${this.resourceScanResult
                              ? this.currentLang === "ko"
                                ? "검사 완료"
                                : "Analysis Ready"
                              : this.currentLang === "ko"
                                ? "검사 대기 중"
                                : "Ready to Scan"}
                          </span>
                        </div>

                        <div class="grid grid-cols-3 gap-2">
                          <div
                            class="p-3 rounded-xl bg-surface-container-lowest border border-surface-container flex flex-col"
                          >
                            <span
                              class="text-[10px] text-on-surface-variant font-medium"
                              >${this.currentLang === "ko"
                                ? "인식된 리소스"
                                : "Total Resources"}</span
                            >
                            <span
                              class="text-sm font-extrabold text-on-surface mt-0.5"
                              >${this.resourceFiles.length > 0
                                ? `${this.resourceFiles.length}개`
                                : this.resourceDirHandle
                                  ? `${this.resourceDirHandle.name}`
                                  : "0개"}</span
                            >
                            <span class="text-[10px] text-outline"
                              >${this.currentLang === "ko"
                                ? "로컬 프로젝트"
                                : "Local Project"}</span
                            >
                          </div>
                          <div
                            class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/50 flex flex-col"
                          >
                            <span
                              class="text-[10px] text-rose-700 dark:text-rose-300 font-medium"
                              >${this.currentLang === "ko"
                                ? "미사용 리소스"
                                : "Unused Assets"}</span
                            >
                            <span
                              class="text-sm font-extrabold text-rose-600 mt-0.5"
                              >${this.resourceScanResult
                                ? `${this.resourceScanResult.unusedFiles.length}개`
                                : "0개"}</span
                            >
                            <span class="text-[10px] text-rose-500"
                              >${this.currentLang === "ko"
                                ? "삭제 대상"
                                : "To Delete"}</span
                            >
                          </div>
                          <div
                            class="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 flex flex-col"
                          >
                            <span class="text-[10px] text-primary font-medium"
                              >${this.currentLang === "ko"
                                ? "404 깨진 링크"
                                : "Broken Links"}</span
                            >
                            <span
                              class="text-sm font-extrabold text-primary mt-0.5"
                              >${this.resourceScanResult
                                ? `${this.resourceScanResult.brokenLinks.length}개`
                                : "0개"}</span
                            >
                            <span class="text-[10px] text-outline"
                              >${this.currentLang === "ko"
                                ? "코드 정리 대상"
                                : "To Clean Code"}</span
                            >
                          </div>
                        </div>
                      </div>

                      <!-- 정리 방식 선택 (Screenshot Image 4) -->
                      <div
                        class="bg-surface-container-low p-4 sm:p-5 rounded-2xl border border-surface-container space-y-3.5"
                      >
                        <div class="flex items-center justify-between pb-1">
                          <div class="flex items-center gap-3">
                            <div
                              class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"
                            >
                              <span
                                class="material-symbols-outlined text-[22px]"
                                >tune</span
                              >
                            </div>
                            <div>
                              <h4
                                class="text-xs sm:text-sm font-extrabold text-on-surface leading-tight"
                              >
                                ${this.currentLang === "ko"
                                  ? "정리 방식 선택"
                                  : "Select Cleanup Mode"}
                              </h4>
                              <p
                                class="text-[11px] text-on-surface-variant mt-0.5"
                              >
                                ${this.currentLang === "ko"
                                  ? "프로젝트 분석 후 수행할 정리 작업 방식을 선택합니다."
                                  : "Select the cleanup method to perform after project analysis."}
                              </p>
                            </div>
                          </div>
                          <span
                            class="material-symbols-outlined text-on-surface-variant text-[20px]"
                            >expand_less</span
                          >
                        </div>

                        <div class="space-y-2.5">
                          <!-- 1. comment (추천) -->
                          <div
                            @click="${() =>
                              (this.resourceCodeCleanMode = "comment")}"
                            class="p-3.5 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${this
                              .resourceCodeCleanMode === "comment"
                              ? "border-emerald-400 dark:border-emerald-500/60 bg-emerald-50/70 dark:bg-emerald-950/25 shadow-2xs"
                              : "border-surface-container bg-surface-container-lowest hover:bg-surface-container-low"}"
                          >
                            <div
                              class="flex items-center justify-between gap-2"
                            >
                              <div class="flex items-center gap-2.5 min-w-0">
                                <span
                                  class="material-symbols-outlined text-[20px] shrink-0 ${this
                                    .resourceCodeCleanMode === "comment"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-outline"}"
                                >
                                  ${this.resourceCodeCleanMode === "comment"
                                    ? "check_circle"
                                    : "radio_button_unchecked"}
                                </span>
                                <span
                                  class="material-symbols-outlined text-[18px] shrink-0 ${this
                                    .resourceCodeCleanMode === "comment"
                                    ? "text-emerald-700 dark:text-emerald-400 font-bold"
                                    : "text-on-surface-variant"}"
                                >
                                  code
                                </span>
                                <span
                                  class="text-xs sm:text-sm font-bold truncate ${this
                                    .resourceCodeCleanMode === "comment"
                                    ? "text-emerald-950 dark:text-emerald-100 font-extrabold"
                                    : "text-on-surface"}"
                                >
                                  ${this.currentLang === "ko"
                                    ? "미사용 파일 삭제 및 미연결 URL에 주석 추가"
                                    : "Delete unused files & comment out unlinked URLs"}
                                </span>
                              </div>
                              <span
                                class="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold ${this
                                  .resourceCodeCleanMode === "comment"
                                  ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700"
                                  : "bg-surface-container-high text-on-surface-variant"}"
                              >
                                ${this.currentLang === "ko"
                                  ? "추천"
                                  : "Recommended"}
                              </span>
                            </div>
                            <p
                              class="text-[11px] sm:text-xs mt-1.5 pl-7 sm:pl-7 leading-relaxed ${this
                                .resourceCodeCleanMode === "comment"
                                ? "text-emerald-800/90 dark:text-emerald-300/90"
                                : "text-on-surface-variant"}"
                            >
                              ${this.currentLang === "ko"
                                ? "사용하지 않는 파일은 삭제하고 사용하지 않는 코드 옆에 [연결되지 않은 URL] 주석을 추가합니다."
                                : "Deletes unused files and adds a comment next to unlinked references in the code."}
                            </p>
                          </div>

                          <!-- 2. none (안전) -->
                          <div
                            @click="${() =>
                              (this.resourceCodeCleanMode = "none")}"
                            class="p-3.5 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${this
                              .resourceCodeCleanMode === "none"
                              ? "border-emerald-400 dark:border-emerald-500/60 bg-emerald-50/70 dark:bg-emerald-950/25 shadow-2xs"
                              : "border-surface-container bg-surface-container-lowest hover:bg-surface-container-low"}"
                          >
                            <div
                              class="flex items-center justify-between gap-2"
                            >
                              <div class="flex items-center gap-2.5 min-w-0">
                                <span
                                  class="material-symbols-outlined text-[20px] shrink-0 ${this
                                    .resourceCodeCleanMode === "none"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-outline"}"
                                >
                                  ${this.resourceCodeCleanMode === "none"
                                    ? "check_circle"
                                    : "radio_button_unchecked"}
                                </span>
                                <span
                                  class="material-symbols-outlined text-[18px] shrink-0 ${this
                                    .resourceCodeCleanMode === "none"
                                    ? "text-emerald-700 dark:text-emerald-400 font-bold"
                                    : "text-on-surface-variant"}"
                                >
                                  shield
                                </span>
                                <span
                                  class="text-xs sm:text-sm font-bold truncate ${this
                                    .resourceCodeCleanMode === "none"
                                    ? "text-emerald-950 dark:text-emerald-100 font-extrabold"
                                    : "text-on-surface"}"
                                >
                                  ${this.currentLang === "ko"
                                    ? "사용하지 않는 파일만 안전하게 삭제"
                                    : "Safely delete unused files only"}
                                </span>
                              </div>
                              <span
                                class="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold ${this
                                  .resourceCodeCleanMode === "none"
                                  ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700"
                                  : "bg-surface-container-high text-on-surface-variant"}"
                              >
                                ${this.currentLang === "ko" ? "안전" : "Safe"}
                              </span>
                            </div>
                            <p
                              class="text-[11px] sm:text-xs mt-1.5 pl-7 sm:pl-7 leading-relaxed ${this
                                .resourceCodeCleanMode === "none"
                                ? "text-emerald-800/90 dark:text-emerald-300/90"
                                : "text-on-surface-variant"}"
                            >
                              ${this.currentLang === "ko"
                                ? "문서 내용은 전혀 수정하지 않고, 사용하지 않은 파일만 제거합니다."
                                : "Does not modify any document code, only removes unused files."}
                            </p>
                          </div>

                          <!-- 3. remove (주의) -->
                          <div
                            @click="${() =>
                              (this.resourceCodeCleanMode = "remove")}"
                            class="p-3.5 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${this
                              .resourceCodeCleanMode === "remove"
                              ? "border-amber-400 dark:border-amber-500/60 bg-amber-50/70 dark:bg-amber-950/25 shadow-2xs"
                              : "border-surface-container bg-surface-container-lowest hover:bg-surface-container-low"}"
                          >
                            <div
                              class="flex items-center justify-between gap-2"
                            >
                              <div class="flex items-center gap-2.5 min-w-0">
                                <span
                                  class="material-symbols-outlined text-[20px] shrink-0 ${this
                                    .resourceCodeCleanMode === "remove"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-outline"}"
                                >
                                  ${this.resourceCodeCleanMode === "remove"
                                    ? "check_circle"
                                    : "radio_button_unchecked"}
                                </span>
                                <span
                                  class="material-symbols-outlined text-[18px] shrink-0 ${this
                                    .resourceCodeCleanMode === "remove"
                                    ? "text-amber-700 dark:text-amber-400 font-bold"
                                    : "text-on-surface-variant"}"
                                >
                                  delete
                                </span>
                                <span
                                  class="text-xs sm:text-sm font-bold truncate ${this
                                    .resourceCodeCleanMode === "remove"
                                    ? "text-amber-950 dark:text-amber-100 font-extrabold"
                                    : "text-on-surface"}"
                                >
                                  ${this.currentLang === "ko"
                                    ? "사용하지 않는 파일 및 링크 전부 삭제"
                                    : "Delete both unused files and unlinked code"}
                                </span>
                              </div>
                              <span
                                class="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold ${this
                                  .resourceCodeCleanMode === "remove"
                                  ? "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700"
                                  : "bg-surface-container-high text-on-surface-variant"}"
                              >
                                ${this.currentLang === "ko"
                                  ? "주의"
                                  : "Caution"}
                              </span>
                            </div>
                            <p
                              class="text-[11px] sm:text-xs mt-1.5 pl-7 sm:pl-7 leading-relaxed ${this
                                .resourceCodeCleanMode === "remove"
                                ? "text-amber-800/90 dark:text-amber-300/90"
                                : "text-on-surface-variant"}"
                            >
                              ${this.currentLang === "ko"
                                ? "사용하지 않는 파일 및 문서 내 연결되지 않은 링크들을 전부 삭제합니다."
                                : "Deletes unused files and removes all unlinked code references in documents."}
                            </p>
                          </div>
                        </div>
                      </div>

                      <!-- Target Scope Path Segment Selector -->
                      ${this.resourcePathSegments.length > 0
                        ? html`
                            <div
                              class="p-3.5 rounded-xl bg-surface-container-low border border-surface-container space-y-2"
                            >
                              <div class="flex items-center justify-between">
                                <span
                                  class="text-[11px] font-bold text-on-surface"
                                >
                                  ${this.currentLang === "ko"
                                    ? "검사 대상 폴더 범위 (Scope)"
                                    : "Target Directory Scope"}
                                </span>
                                <span
                                  class="text-[10px] text-on-surface-variant font-mono"
                                >
                                  ${this.resourceSelectedRootSegment ||
                                  (this.currentLang === "ko"
                                    ? "전체 프로젝트"
                                    : "All")}
                                </span>
                              </div>
                              <div class="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  @click="${() =>
                                    this.handleSelectRootSegment("")}"
                                  class="px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${!this
                                    .resourceSelectedRootSegment
                                    ? "bg-primary text-on-primary shadow-xs"
                                    : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-surface-container"}"
                                >
                                  ${this.currentLang === "ko"
                                    ? "전체 프로젝트"
                                    : "Entire Project"}
                                </button>
                                ${this.resourcePathSegments.map(
                                  (seg) => html`
                                    <button
                                      type="button"
                                      @click="${() =>
                                        this.handleSelectRootSegment(seg)}"
                                      class="px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${this
                                        .resourceSelectedRootSegment === seg
                                        ? "bg-primary text-on-primary shadow-xs"
                                        : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border border-surface-container"}"
                                    >
                                      📁 ${seg}
                                    </button>
                                  `,
                                )}
                              </div>
                            </div>
                          `
                        : ""}
                    </div>
                  `
                : ""}
            </div>
          </div>

          <!-- Right Column: Step 3 (File Queue & Comparison) + Live Log Console (작업 내역) -->
          <div class="flex flex-col gap-4 sm:gap-5 min-w-0">
            <!-- Step 3: File Queue Card & Real-time Comparison -->
            <div
              class="bg-surface-container-lowest rounded-2xl border border-surface-container-high shadow-xs p-5 sm:p-6 space-y-3.5 sm:space-y-4"
            >
              <div
                class="flex items-center justify-between border-b border-surface-container pb-3"
              >
                <div class="flex items-center gap-3">
                  <span
                    class="w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-xs font-bold shrink-0"
                    >3</span
                  >

                  <div class="flex items-center gap-2">
                    <span
                      class="material-symbols-outlined text-primary text-[18px]"
                      >format_list_bulleted</span
                    >
                    <span
                      class="font-bold text-sm sm:text-base text-on-surface"
                    >
                      ${this.currentLang === "ko"
                        ? `파일 리스트 (${currentFiles.length}개)`
                        : `File List (${currentFiles.length})`}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    .checked="${allSelected}"
                    .indeterminate="${someSelected}"
                    ?disabled="${this.isConverting ||
                    currentFiles.length === 0}"
                    @change="${(e: any) =>
                      this.handleToggleAllFiles(e.target.checked)}"
                    class="w-4.5 h-4.5 rounded text-primary accent-primary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="${this.currentLang === "ko"
                      ? "전체 선택/해제"
                      : "Select All / None"}"
                  />
                </div>
                <div class="flex items-center gap-2">
                  ${currentFiles.some((f) => f.selected)
                    ? html`
                        <label
                          class="flex items-center gap-1.5 text-[11px] text-on-surface-variant cursor-pointer select-none mr-1"
                        >
                          <input
                            type="checkbox"
                            .checked="${this.flatDownload}"
                            @change="${(e: any) =>
                              (this.flatDownload = e.target.checked)}"
                            ?disabled="${this.isConverting}"
                            class="w-3.5 h-3.5 rounded text-primary accent-primary cursor-pointer transition-all"
                          />
                          <span
                            >${this.currentLang === "ko"
                              ? "폴더 구조 제외"
                              : "Flat"}</span
                          >
                        </label>
                        <button
                          type="button"
                          @click="${() =>
                            this.handleDownloadOriginals(
                              new CustomEvent("download", {
                                detail: {
                                  files: currentFiles.filter((f) => f.selected),
                                  flat: this.flatDownload,
                                },
                              }),
                            )}"
                          ?disabled="${this.isConverting}"
                          class="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <span class="material-symbols-outlined text-[14px]"
                            >download</span
                          >
                          <span
                            >${this.currentLang === "ko"
                              ? "선택 원본 다운로드"
                              : "Download Selected"}</span
                          >
                        </button>
                        <button
                          type="button"
                          @click="${() => this.handleDeleteSelectedFromQueue()}"
                          ?disabled="${this.isConverting}"
                          class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <span class="material-symbols-outlined text-[14px]"
                            >delete</span
                          >
                          <span
                            >${this.currentLang === "ko"
                              ? "선택 삭제"
                              : "Delete Selected"}</span
                          >
                        </button>
                      `
                    : ""}
                  ${currentFiles.length > 0
                    ? html`
                        <button
                          class="text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2 py-1 rounded cursor-pointer"
                          @click="${this.resetAll}"
                          type="button"
                        >
                          ${this.currentLang === "ko" ? "비우기" : "Clear"}
                        </button>
                        <button
                          class="px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          @click="${() =>
                            this.handleDownloadOriginals(
                              new CustomEvent("download", {
                                detail: {
                                  files: currentFiles,
                                  flat: this.flatDownload,
                                },
                              }),
                            )}"
                          type="button"
                        >
                          <span class="material-symbols-outlined text-[15px]"
                            >archive</span
                          >
                          <span
                            >${this.currentLang === "ko"
                              ? "모두 다운로드 (ZIP)"
                              : "Download All (ZIP)"}</span
                          >
                        </button>
                      `
                    : ""}
                </div>
              </div>

              <!-- Results for Cleaner if scanned -->
              ${isResource && this.resourceScanResult
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
                    <!-- File List Container -->
                    <div
                      class="bg-surface-container-lowest rounded-xl border border-surface-container-high divide-y divide-surface-container overflow-hidden shadow-2xs"
                      id="fileListContainer"
                    >
                      ${currentFiles.length === 0
                        ? html`
                            <div
                              class="p-8 text-center text-xs text-on-surface-variant"
                            >
                              ${isResource
                                ? html`
                                    <div
                                      class="py-4 flex flex-col items-center gap-3"
                                    >
                                      <div
                                        class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"
                                      >
                                        <span
                                          class="material-symbols-outlined text-[24px]"
                                          >search_check</span
                                        >
                                      </div>
                                      <div
                                        class="font-bold text-sm text-on-surface"
                                      >
                                        ${this.currentLang === "ko"
                                          ? "프로젝트 리소스 정밀 검사 대기 중"
                                          : "Ready to Scan Project Resources"}
                                      </div>
                                      <div
                                        class="text-xs text-on-surface-variant max-w-md whitespace-pre-line"
                                      >
                                        ${this.currentLang === "ko"
                                          ? "상단에서 프로젝트 폴더를 선택한 뒤 [🔍 프로젝트 검사 시작] 버튼을 누르면\n 미사용 파일과 깨진 링크를 찾아냅니다."
                                          : "Select a web project folder and click [Start Project Scan] to find unused files and broken links."}
                                      </div>
                                      <button
                                        type="button"
                                        @click="${this.handleStartResourceScan}"
                                        ?disabled="${this.isResourceScanning ||
                                        (!this.resourceDirHandle &&
                                          this.resourceFiles.length === 0)}"
                                        class="mt-2 px-5 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                                      >
                                        <span
                                          class="material-symbols-outlined text-[16px]"
                                          >search</span
                                        >
                                        <span
                                          >${this.currentLang === "ko"
                                            ? "프로젝트 검사 시작"
                                            : "Start Project Scan"}</span
                                        >
                                      </button>
                                    </div>
                                  `
                                : html`
                                    <div
                                      class="py-12 sm:py-16 flex flex-col items-center justify-center text-center space-y-3 select-none"
                                    >
                                      <span
                                        class="material-symbols-outlined text-5xl text-on-surface/40"
                                        >folder</span
                                      >
                                      <p
                                        class="text-xs text-on-surface-variant leading-relaxed max-w-fit"
                                      >
                                        ${this.currentLang === "ko"
                                          ? "대기열이 비어 있습니다. 대상 폴더를 연동하거나 개별 파일을 여기에 끌어다 놓으세요."
                                          : "The queue is empty. Link a target folder or drag and drop individual files here."}
                                      </p>
                                      <button
                                        type="button"
                                        @click="${this.loadSampleFile}"
                                        class="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
                                      >
                                        <span
                                          class="material-symbols-outlined text-[16px]"
                                          >auto_fix_high</span
                                        >
                                        <span
                                          >${this.currentLang === "ko"
                                            ? "샘플 파일로 테스트하기"
                                            : "Try with Sample Files"}</span
                                        >
                                      </button>
                                    </div>
                                  `}
                            </div>
                          `
                        : html`
                            <div
                              class="max-h-105 overflow-y-auto divide-y divide-surface-container"
                            >
                              ${currentFiles.map((file) => {
                                const isDone = file.status === "success";
                                const isProcessing =
                                  file.status === "processing";
                                const isErr = file.status === "error";

                                let iconName = "image";
                                let iconBg =
                                  "bg-blue-50 text-primary dark:bg-blue-950 dark:text-blue-300";
                                let subtext = "";

                                if (isSvg) {
                                  iconName = "image";
                                  iconBg =
                                    "bg-blue-50 text-primary dark:bg-blue-950 dark:text-blue-300";
                                  subtext = `SVG ➔ ${this.exportFormat.toUpperCase()} (${this.selectedScale}x ${this.selectedScale >= 2 ? "고화질" : "원본"})`;
                                } else if (isAudio) {
                                  iconName = "audiotrack";
                                  iconBg =
                                    "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300";
                                  subtext = `${this.audioBitrate}kbps MP3 인코딩 대기 (${this.audioChannel === "stereo" ? "스테레오" : "모노"})`;
                                } else if (isRename) {
                                  iconName = "label";
                                  iconBg =
                                    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
                                  subtext =
                                    file.originalName &&
                                    file.newName &&
                                    file.originalName !== file.newName
                                      ? `원래 파일명: ${file.originalName}`
                                      : "이름 변경 대기";
                                } else {
                                  iconName = "description";
                                  iconBg =
                                    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
                                  subtext = file.relativePath || file.name;
                                }

                                return html`
                                  <div
                                    class="p-3.5 sm:px-4 flex items-center justify-between gap-3 hover:bg-surface/50 transition-colors"
                                  >
                                    <div
                                      class="flex items-center gap-3 min-w-0"
                                    >
                                      <input
                                        type="checkbox"
                                        .checked="${file.selected}"
                                        @change="${() =>
                                          this.handleToggleFileSelected(file)}"
                                        class="w-4.5 h-4.5 rounded text-primary accent-primary cursor-pointer shrink-0"
                                      />
                                      <div
                                        class="w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0"
                                      >
                                        <span
                                          class="material-symbols-outlined text-[18px]"
                                          >${iconName}</span
                                        >
                                      </div>
                                      <div class="min-w-0">
                                        ${isRename &&
                                        file.originalName &&
                                        file.newName &&
                                        file.originalName !== file.newName
                                          ? html`
                                              <div
                                                class="flex items-center gap-1.5 flex-wrap"
                                              >
                                                <span
                                                  class="text-xs text-on-surface-variant line-through font-mono"
                                                  >${file.originalName}</span
                                                >
                                                <span
                                                  class="material-symbols-outlined text-[14px] text-primary"
                                                  >arrow_forward</span
                                                >
                                                <span
                                                  class="text-xs sm:text-sm font-bold text-primary font-mono"
                                                  >${file.newName}</span
                                                >
                                              </div>
                                            `
                                          : html`
                                              <p
                                                class="text-xs sm:text-sm font-semibold text-on-surface truncate"
                                              >
                                                ${file.newName || file.name}
                                              </p>
                                            `}
                                        <p
                                          class="text-[11px] text-on-surface-variant truncate"
                                        >
                                          ${subtext}
                                        </p>
                                      </div>
                                    </div>
                                    <div
                                      class="flex items-center gap-2.5 shrink-0"
                                    >
                                      ${isDone
                                        ? html`
                                            <span
                                              class="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                            >
                                              ${this.currentLang === "ko"
                                                ? "완료"
                                                : "Done"}
                                            </span>
                                          `
                                        : isProcessing
                                          ? html`
                                              <span
                                                class="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-primary animate-pulse"
                                              >
                                                ${this.currentLang === "ko"
                                                  ? "처리 중..."
                                                  : "Processing..."}
                                              </span>
                                            `
                                          : isErr
                                            ? html`
                                                <span
                                                  class="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                                                >
                                                  ${this.currentLang === "ko"
                                                    ? "오류"
                                                    : "Error"}
                                                </span>
                                              `
                                            : html`
                                                <span
                                                  class="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-container-high text-on-surface-variant"
                                                >
                                                  ${this.currentLang === "ko"
                                                    ? "대기"
                                                    : "Pending"}
                                                </span>
                                              `}

                                      <button
                                        class="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                                        title="${this.currentLang === "ko"
                                          ? "목록에서 제거"
                                          : "Remove from queue"}"
                                        @click="${() =>
                                          this.handleDeleteFile(file)}"
                                        type="button"
                                      >
                                        <span
                                          class="material-symbols-outlined text-[16px]"
                                          >close</span
                                        >
                                      </button>
                                    </div>
                                  </div>
                                `;
                              })}
                            </div>
                          `}
                    </div>
                  `}
            </div>

            <!-- Live Log Console -->
            <log-console
              .lang="${this.currentLang}"
              .conversionLogs="${this.conversionLogs}"
              @clear-logs="${() => (this.conversionLogs = [])}"
            ></log-console>
          </div>
        </div>

        <!-- Sticky Floating Action Bar (Exact match to user screenshot with accurate methods) -->
        <div
          class="fixed bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl bg-surface-container-lowest/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-full shadow-[0_16px_48px_rgba(0,0,0,0.18)] px-5 sm:px-7 py-3 flex items-center justify-between gap-4 transition-all duration-300"
          id="floatingActionBar"
        >
          <!-- Left: Circular check icon & Queue status text -->
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-50 dark:bg-blue-950/70 text-primary flex items-center justify-center shrink-0 shadow-2xs"
            >
              <span
                class="material-symbols-outlined text-[20px] sm:text-[22px]"
                style="font-variation-settings: 'FILL' 1;"
                >check_circle</span
              >
            </div>
            <div class="min-w-0">
              <div
                class="text-xs sm:text-sm font-bold text-on-surface flex items-center gap-1.5 truncate"
              >
                <span>
                  ${isResource
                    ? this.resourceScanResult
                      ? this.currentLang === "ko"
                        ? "검사 완료"
                        : "Scan Complete"
                      : this.resourceDirHandle || this.resourceFiles.length > 0
                        ? this.currentLang === "ko"
                          ? "프로젝트 폴더 로드됨"
                          : "Project Loaded"
                        : this.currentLang === "ko"
                          ? "프로젝트 폴더 검사 대기"
                          : "Ready to Scan Folder"
                    : this.currentLang === "ko"
                      ? `대기열 ${currentFiles.length}개 선택됨`
                      : `${currentFiles.length} files selected`}
                </span>
                <span class="text-primary font-extrabold">
                  ${isResource
                    ? this.resourceScanResult
                      ? `• 미사용 ${this.resourceScanResult.unusedFiles.length}개 / 링크 ${this.resourceScanResult.brokenLinks.length}개`
                      : this.resourceSelectedRootSegment ||
                          this.resourceDirHandle?.name
                        ? `• ${this.resourceSelectedRootSegment || this.resourceDirHandle?.name}`
                        : ""
                    : isSvg
                      ? `• ${this.selectedScale}x ${this.exportFormat.toUpperCase()}`
                      : isAudio
                        ? `• ${this.audioBitrate}kbps MP3`
                        : this.currentLang === "ko"
                          ? "• 실시간 동기화"
                          : "• Sync Active"}
                </span>
              </div>
              <div
                class="text-[11px] sm:text-xs text-on-surface-variant truncate mt-0.5"
              >
                ${isResource
                  ? this.currentLang === "ko"
                    ? "HTML/CSS/JS 미사용 리소스 및 404 깨진 링크 100% 로컬 탐색"
                    : "100% on-device code & asset analysis · Zero server upload"
                  : this.currentLang === "ko"
                    ? "100% 브라우저 로컬 안전 처리 · 서버 전송 0KB"
                    : "100% On-device local memory · Zero server upload"}
              </div>
            </div>
          </div>

          <!-- Right: Controls -->
          <div class="flex items-center gap-2.5 shrink-0">
            <button
              @click="${this.resetAll}"
              type="button"
              class="px-3.5 py-2.5 rounded-full border border-slate-200/80 dark:border-slate-800 hover:bg-surface-container text-xs font-semibold text-on-surface-variant transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span class="material-symbols-outlined text-[15px]"
                >restart_alt</span
              >
              <span>${this.currentLang === "ko" ? "초기화" : "Reset"}</span>
            </button>

            <button
              @click="${() => {
                if (isResource) {
                  if (!this.resourceScanResult) {
                    this.handleStartResourceScan();
                  } else {
                    const resultsEl = this.querySelector(
                      "cleaner-results-view",
                    ) as any;
                    if (resultsEl?.handleExecute) {
                      resultsEl.handleExecute();
                    }
                  }
                } else {
                  this.startConversion();
                }
              }}"
              ?disabled="${isResource
                ? this.isResourceScanning ||
                  this.isResourceExecuting ||
                  (!this.resourceDirHandle && this.resourceFiles.length === 0)
                : this.isConverting || currentFiles.length === 0}"
              class="w-fit sm:w-fit md:w-fit px-10 py-2.5 sm:py-3 rounded-full bg-primary hover:bg-primary/90 disabled:bg-surface-container-high disabled:text-outline disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm flex items-center justify-center text-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer shrink-0"
              id="floatingActionBtn"
              type="button"
            >
              ${this.isConverting ||
              this.isResourceScanning ||
              this.isResourceExecuting
                ? html`
                    <svg
                      class="animate-spin h-4 w-4 text-white"
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
                    <span>
                      ${this.isResourceScanning
                        ? this.currentLang === "ko"
                          ? "프로젝트 분석 중..."
                          : "Scanning..."
                        : this.isResourceExecuting
                          ? this.currentLang === "ko"
                            ? "리소스 정리 중..."
                            : "Cleaning..."
                          : this.conversionProgress > 0
                            ? `${this.conversionProgress}% 처리 중...`
                            : "처리 중..."}
                    </span>
                  `
                : html`
                    <span>
                      ${isResource
                        ? this.resourceScanResult
                          ? this.currentLang === "ko"
                            ? "🧹 선택 항목 일괄 정리 실행 →"
                            : "🧹 Clean Selected Resources →"
                          : this.currentLang === "ko"
                            ? "프로젝트 검사 시작 →"
                            : "Start Project Scan →"
                        : isSvg
                          ? this.currentLang === "ko"
                            ? "변환 시작 →"
                            : "Convert All →"
                          : isAudio
                            ? this.currentLang === "ko"
                              ? "압축 시작 →"
                              : "Compress Audio →"
                            : isRename
                              ? this.currentLang === "ko"
                                ? "파일명 일괄 변경 적용 →"
                                : "Apply All Renames →"
                              : this.currentLang === "ko"
                                ? "정리 및 저장 →"
                                : "Clean & Save All →"}
                    </span>
                  `}
            </button>
          </div>
        </div>

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
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "batcher-app": BatcherApp;
  }
}
