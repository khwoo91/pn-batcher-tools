/// <reference types="wicg-file-system-access" />
import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";

import type { BatchFile, ScaleOption, ConversionLog } from "./types";
import { scanDirectory } from "./utils/fs-utils";
import { batchConvertSvg } from "./services/batch-converter";
import { batchConvertAudio } from "./services/audio-converter";
import { locales } from "./locales";

import "./components/app-header";
import "./components/settings-panel";
import "./components/audio-settings-panel";
import "./components/file-queue";
import "./components/log-console";
import "./components/alert-modal";

const t = {
  ko: locales.ko.main,
  en: locales.en.main,
};

@customElement("batcher-app")
export class BatcherApp extends LitElement {
  @state() private activeTab: "svg" | "audio" = "svg";
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

  private handleTabChange(tab: "svg" | "audio") {
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
    localStorage.setItem("svg-batcher-lang", lang);
    this.updateStaticElements(lang);
  }

  override firstUpdated() {
    const savedLang = localStorage.getItem("svg-batcher-lang");
    if (savedLang === "en" || savedLang === "ko") {
      this.currentLang = savedLang as "ko" | "en";
    }
    this.updateStaticElements(this.currentLang);
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
      } else {
        this.audioDirHandle = handle;
        this.audioFiles = [];
        await scanDirectory(this.audioDirHandle, "", files, ".wav", this.audioOutputDirHandle);
        this.audioFiles = files;

        if (this.audioFiles.length === 0) {
          this.showAlert(t[this.currentLang].noWavInFolder, "error");
        } else {
          this.addLog(t[this.currentLang].folderScanDone(this.audioFiles.length));
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

  private async handleFallbackUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    this.conversionProgress = 0;
    const filesList: BatchFile[] = [];

    if (this.activeTab === "svg") {
      this.svgFiles = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.toLowerCase().endsWith(".svg")) {
          filesList.push({
            name: file.name,
            file: file,
            relativePath: file.webkitRelativePath || file.name,
            status: "pending",
            selected: true,
          });
        }
      }
      this.svgFiles = filesList;

      if (this.svgFiles.length === 0) {
        this.showAlert(t[this.currentLang].noFallbackSvg, "error");
      } else {
        this.addLog(t[this.currentLang].fallbackUploadDone(this.svgFiles.length));
      }
    } else {
      this.audioFiles = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.toLowerCase().endsWith(".wav")) {
          filesList.push({
            name: file.name,
            file: file,
            relativePath: file.webkitRelativePath || file.name,
            status: "pending",
            selected: true,
          });
        }
      }
      this.audioFiles = filesList;

      if (this.audioFiles.length === 0) {
        this.showAlert(t[this.currentLang].noFallbackWav, "error");
      } else {
        this.addLog(t[this.currentLang].fallbackUploadDone(this.audioFiles.length));
      }
    }
  }

  private async startConversion() {
    if (this.activeTab === "svg") {
      await this.startSvgConversion();
    } else {
      await this.startAudioConversion();
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
    } else {
      this.audioFiles = this.audioFiles.map((file) =>
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
    } else {
      this.audioFiles = this.audioFiles.map((file) => ({
        ...file,
        selected: checked,
      }));
    }
  }

  private handleDeleteFile(e: CustomEvent<BatchFile>) {
    const fileToDelete = e.detail;
    if (this.activeTab === "svg") {
      this.svgFiles = this.svgFiles.filter((file) => file.relativePath !== fileToDelete.relativePath);
    } else {
      this.audioFiles = this.audioFiles.filter((file) => file.relativePath !== fileToDelete.relativePath);
    }
    this.addLog(t[this.currentLang].queueRemoved(fileToDelete.name), "info");
  }

  private resetAll() {
    if (this.activeTab === "svg") {
      this.svgDirHandle = null;
      this.svgOutputDirHandle = null;
      this.svgFiles = [];
    } else {
      this.audioDirHandle = null;
      this.audioOutputDirHandle = null;
      this.audioFiles = [];
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

    const currentFiles = isSvg ? this.svgFiles : this.audioFiles;
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
        <div class="flex items-center gap-2 p-1.5 bg-slate-900/40 border border-white/5 rounded-2xl w-full max-w-md mx-auto mb-8 shadow-inner backdrop-blur-md">
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
            class="flex-1 py-3 px-4 rounded-xl text-xs font-bold font-sans transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${!isSvg
              ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]"
              : "text-slate-400 hover:text-slate-200"}"
          >
            <i class="fa-solid fa-music"></i>
            <span>${locales[this.currentLang].tabs.audio}</span>
          </button>
        </div>

        <!-- Browser Compatibility Alert Banner -->
        ${!this.apiSupported
          ? html`
              <div class="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-sm flex items-start gap-3">
                <i class="fa-solid fa-triangle-exclamation text-lg mt-0.5 shrink-0 font-sans"></i>
                <div class="font-sans">
                  <span class="font-bold">${activeT.compatBannerTitle}</span>
                  ${activeT.compatBannerText(
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
                    @change-format="${(e: CustomEvent<"png" | "jpg">) => (this.exportFormat = e.detail)}"
                    @change-scale="${(e: CustomEvent<number>) => (this.selectedScale = e.detail)}"
                    @change-suffix="${(e: CustomEvent<{ scale: number; suffix: string }>) =>
                      this.handleChangeSuffix(e.detail.scale, e.detail.suffix)}"
                    @toggle-delete="${() => (this.svgDeleteOriginal = !this.svgDeleteOriginal)}"
                  ></settings-panel>
                `
              : html`
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
                    @select-folder="${this.selectFolder}"
                    @select-output-folder="${this.selectOutputFolder}"
                    @reset-output-folder="${() => (this.audioOutputDirHandle = null)}"
                    @upload-files="${(e: CustomEvent) => this.handleFallbackUpload(e.detail)}"
                    @change-bitrate="${(e: CustomEvent<number>) => (this.audioBitrate = e.detail)}"
                    @toggle-delete="${() => (this.audioDeleteOriginal = !this.audioDeleteOriginal)}"
                  ></audio-settings-panel>
                `}
          </div>

          <!-- Right Real-Time Display & Logger Panel (cols-7) -->
          <div class="lg:col-span-7 space-y-6 flex flex-col">
            <!-- File List Queue -->
            <file-queue
              .lang="${this.currentLang}"
              .files="${currentFiles}"
              .isConverting="${this.isConverting}"
              @toggle-file-selected="${this.handleToggleFileSelected}"
              @toggle-all-files="${this.handleToggleAllFiles}"
              @delete-file="${this.handleDeleteFile}"
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
      <div class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-5xl bg-slate-950/60 backdrop-blur-xl border border-white/10 py-4.5 px-6 z-40 rounded-3xl shadow-[0_15px_50px_rgba(0,0,0,0.6)] transition-all duration-300 hover:border-white/15">
        <!-- Progress bar along the top inner edge -->
        ${this.isConverting || this.conversionProgress > 0
          ? html`
              <div class="absolute top-0 left-6 right-6 h-1 bg-slate-950/40 rounded-full overflow-hidden">
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
                          <span class="text-white font-bold tracking-wide">${activeT.converting}</span>
                        `
                      : html`
                          <span class="inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                          <span class="text-emerald-400 font-bold tracking-wide">${activeT.completed}</span>
                        `}
                  </div>
                  <span class="text-slate-700">|</span>
                  <span>
                    ${activeT.progress}
                    <strong class="text-indigo-400 font-mono text-xs">${this.conversionProgress}%</strong>
                  </span>
                  <span class="text-slate-700 hidden sm:inline">|</span>
                  <span class="hidden sm:inline">
                    ${activeT.doneCount}
                    <strong class="text-emerald-400 font-mono">${this.currentConversionIndex}</strong> /
                    ${currentFiles.filter((f) => f.selected).length}
                  </span>
                </div>
              `
            : html`
                <div class="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-bold font-sans">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${selectedFilesCount > 0 ? "bg-indigo-400 animate-ping" : "bg-slate-700"}"></span>
                    <span>
                      ${activeT.waitingFiles}
                      <strong class="text-white font-extrabold">
                        ${selectedFilesCount}${this.currentLang === "ko" ? "개" : ""}
                      </strong>
                      <span class="text-slate-500 font-normal">
                        / ${currentFiles.length}${this.currentLang === "ko" ? "개" : ""}
                      </span>
                    </span>
                  </div>

                  ${isSvg
                    ? html`
                        <span class="text-slate-700 hidden md:inline">|</span>
                        <span>
                          ${activeT.exportFormat}
                          <strong class="text-indigo-400 uppercase font-extrabold">${this.exportFormat}</strong>
                        </span>
                        <span class="text-slate-700 hidden md:inline">|</span>
                        <span>
                          ${activeT.applyScale}
                          <strong class="text-white font-mono font-extrabold">${this.selectedScale}x</strong>
                        </span>
                        ${suffixTemplate}
                      `
                    : html`
                        <span class="text-slate-700 hidden md:inline">|</span>
                        <span>
                          ${activeT.applyBitrate}
                          <strong class="text-purple-400 uppercase font-extrabold">${this.audioBitrate} kbps</strong>
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
                    class="flex-1 md:flex-initial w-full md:w-auto px-6 py-3 border border-white/5 hover:border-indigo-500/20 bg-slate-950/60 hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-white rounded-xl text-xs transition-all flex items-center justify-center gap-2 font-sans cursor-pointer active:scale-95 hover:shadow-[0_0_15px_rgba(99,102,241,0.05)]"
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
                : "from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:via-fuchsia-500 hover:to-pink-500"} disabled:from-slate-900 disabled:via-slate-900 disabled:to-slate-900 disabled:text-slate-500 disabled:border-white/5 disabled:cursor-not-allowed disabled:shadow-none hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] active:scale-[0.97] text-white font-bold text-sm tracking-wide rounded-xl border border-white/20 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shrink-0"
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
                    <span>${activeT.btnConverting}</span>
                  `
                : html`
                    <i class="fa-solid fa-play text-[10px]"></i>
                    <span>${activeT.btnConvert}</span>
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
