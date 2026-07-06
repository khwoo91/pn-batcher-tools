import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { locales } from "../locales";

const t = {
  ko: locales.ko.audioSettings,
  en: locales.en.audioSettings,
};

@customElement("audio-settings-panel")
export class AudioSettingsPanel extends LitElement {
  @property({ type: String }) lang: "ko" | "en" = "ko";
  @property({ type: Boolean }) apiSupported = false;
  @property({ type: Object }) dirHandle: FileSystemDirectoryHandle | null = null;
  @property({ type: Number }) filesCount = 0;
  @property({ type: Number }) bitrate = 192; // 128, 192, 256, 320
  @property({ type: Object }) outputDirHandle: FileSystemDirectoryHandle | null = null;
  @property({ type: Boolean }) deleteOriginal = false;
  @property({ type: Boolean }) isConverting = false;
  @property({ type: Number }) conversionProgress = 0;
  @property({ type: Array }) inputExts: string[] = [".wav", ".mp3"];

  protected override createRenderRoot() {
    return this;
  }

  private handleSelectFolder() {
    this.dispatchEvent(new CustomEvent("select-folder", { bubbles: true, composed: true }));
  }

  private handleTriggerFileInput() {
    const fileInput = this.renderRoot.querySelector("#individual-file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  private handleLoadSample() {
    this.dispatchEvent(new CustomEvent("load-sample", { bubbles: true, composed: true }));
  }

  private handleUploadFiles(e: Event) {
    this.dispatchEvent(
      new CustomEvent("upload-files", {
        detail: e,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleChangeBitrate(bitrate: number) {
    this.dispatchEvent(
      new CustomEvent("change-bitrate", {
        detail: bitrate,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleSelectOutputFolder() {
    this.dispatchEvent(
      new CustomEvent("select-output-folder", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleResetOutputFolder(e: Event) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("reset-output-folder", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleToggleDelete() {
    this.dispatchEvent(
      new CustomEvent("toggle-delete", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleToggleInputExt(ext: string) {
    if (this.isConverting) return;
    let nextExts = [...this.inputExts];
    if (nextExts.includes(ext)) {
      if (nextExts.length <= 1) {
        alert(t[this.lang].noExtSelectedAlert);
        return;
      }
      nextExts = nextExts.filter((e) => e !== ext);
    } else {
      nextExts.push(ext);
    }
    this.dispatchEvent(
      new CustomEvent("change-input-exts", {
        detail: nextExts,
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected override render() {
    const activeT = t[this.lang];
    const bitrates = [128, 192, 256, 320];

    return html`
      <div class="space-y-6">
        <!-- Step 1: Directory Picker Card -->
        <div class="glass-panel rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div
            class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-indigo-500 to-purple-600"
          ></div>
          <h2 class="text-md font-bold mb-5 text-slate-100 flex items-center gap-2.5 font-sans">
            <span
              class="bg-linear-to-r from-indigo-500 to-purple-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(99,102,241,0.3)]"
            >
              1
            </span>
            ${activeT.linkFolder}
          </h2>

          <!-- Hidden File Input for Individual Files -->
          <input
            type="file"
            id="individual-file-input"
            multiple
            accept="${this.inputExts.join(",")}"
            class="hidden"
            @change="${this.handleUploadFiles}"
            ?disabled="${this.isConverting}"
          />

          <!-- Extension Filter Options -->
          <div class="mb-5 flex flex-col gap-2.5">
            <span class="text-xs font-bold text-slate-400 font-sans tracking-wide">
              ${activeT.inputExtsLabel}
            </span>
            <div class="flex gap-2">
              ${[".wav", ".mp3"].map((ext) => {
                const isSelected = this.inputExts.includes(ext);
                return html`
                  <button
                    @click="${() => this.handleToggleInputExt(ext)}"
                    ?disabled="${this.isConverting}"
                    class="pl-3 pr-4 py-2 rounded-xl text-xs font-bold font-sans cursor-pointer transition-all border flex items-center gap-1.5 ${isSelected
                      ? "bg-brand-bg text-brand-text border-brand-border shadow-[0_0_12px_rgba(99,102,241,0.12)]"
                      : "bg-slate-950 text-slate-500 border-slate-800 hover:border-brand-primary/40 hover:text-slate-200"}"
                  >
                    ${isSelected
                      ? html`<i
                          class="fa-solid fa-square-check text-indigo-400 text-sm relative top-0.5"
                        ></i>`
                      : html`<i
                          class="fa-regular fa-square text-slate-600 text-sm relative top-0.5"
                        ></i>`}
                    <span>${ext.toUpperCase().replace(".", "")}</span>
                  </button>
                `;
              })}
            </div>
          </div>

          ${this.apiSupported
            ? html`
                <!-- Native Folder Selection API UI -->
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-3">
                    <button
                      @click="${this.handleSelectFolder}"
                      ?disabled="${this.isConverting}"
                      class="w-full py-4 px-4 bg-slate-950 hover:bg-brand-bg disabled:opacity-50 text-slate-100 rounded-2xl border border-dashed border-slate-800 hover:border-brand-primary hover:shadow-[0_0_20px_rgba(99,102,241,0.05)] transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer group font-sans active:scale-[0.98] text-center"
                    >
                      <i
                        class="fa-regular fa-folder-open text-2xl text-indigo-400 group-hover:scale-110 transition-transform duration-300"
                      ></i>
                      <span class="text-xs font-semibold text-slate-100">
                        ${activeT.localFolderSelect}
                      </span>
                    </button>

                    <button
                      @click="${this.handleTriggerFileInput}"
                      ?disabled="${this.isConverting}"
                      class="w-full py-4 px-4 bg-slate-950 hover:bg-brand-bg disabled:opacity-50 text-slate-100 rounded-2xl border border-dashed border-slate-800 hover:border-brand-primary hover:shadow-[0_0_20px_rgba(99,102,241,0.05)] transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer group font-sans active:scale-[0.98] text-center"
                    >
                      <i
                        class="fa-regular fa-file-image text-2xl text-emerald-400 group-hover:scale-110 transition-transform duration-300"
                      ></i>
                      <span class="text-xs font-semibold text-slate-100">
                        ${activeT.selectFiles}
                      </span>
                    </button>
                  </div>

                  ${this.dirHandle
                    ? html`
                        <div
                          class="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-xs flex items-center justify-between shadow-inner"
                        >
                          <div class="flex items-center gap-2 text-indigo-300 font-medium">
                            <i class="fa-regular fa-folder-open text-sm"></i>
                            <span
                              class="font-bold truncate max-w-50"
                              title="${this.dirHandle.name}"
                            >
                              ${this.dirHandle.name}
                            </span>
                          </div>
                          <span class="text-slate-400 font-mono">
                            ${activeT.filesLoaded(this.filesCount)}
                          </span>
                        </div>
                      `
                    : this.filesCount > 0
                      ? html`
                          <div
                            class="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-xs flex items-center justify-between shadow-inner"
                          >
                            <div class="flex items-center gap-2 text-indigo-300 font-medium">
                              <i class="fa-regular fa-file text-sm"></i>
                              <span class="font-bold truncate max-w-50">
                                ${this.lang === "ko" ? "선택된 개별 파일들" : "Selected Files"}
                              </span>
                            </div>
                            <span class="text-slate-400 font-mono">
                              ${activeT.filesLoaded(this.filesCount)}
                            </span>
                          </div>
                        `
                      : html`
                          <div class="text-center py-2">
                            <span class="text-xs text-slate-500 font-medium">
                              ${activeT.noFolderSelected}
                            </span>
                          </div>
                        `}
                </div>
              `
            : html`
                <!-- WebkitDirectory Standard Native Fallback UI -->
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-3">
                    <label
                      class="py-4 px-4 bg-slate-950 hover:bg-amber-bg text-slate-100 hover:text-amber-text rounded-2xl border border-dashed border-slate-800 hover:border-amber-border hover:shadow-[0_0_20px_rgba(217,119,6,0.05)] transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer group font-sans active:scale-[0.98] text-center"
                    >
                      <input
                        type="file"
                        webkitdirectory
                        directory
                        multiple
                        class="hidden"
                        @change="${this.handleUploadFiles}"
                        ?disabled="${this.isConverting}"
                        accept="${this.inputExts.join(",")}"
                      />
                      <i
                        class="fa-solid fa-cloud-arrow-up text-2xl text-amber-400 group-hover:scale-110 transition-transform duration-300"
                      ></i>
                      <span class="text-xs font-semibold text-slate-100">
                        ${activeT.fallbackUpload}
                      </span>
                    </label>

                    <button
                      @click="${this.handleTriggerFileInput}"
                      ?disabled="${this.isConverting}"
                      class="py-4 px-4 bg-slate-950 hover:bg-amber-bg disabled:opacity-50 text-slate-100 hover:text-amber-text rounded-2xl border border-dashed border-slate-800 hover:border-amber-border hover:shadow-[0_0_20px_rgba(217,119,6,0.05)] transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer group font-sans active:scale-[0.98] text-center"
                    >
                      <i
                        class="fa-regular fa-file text-2xl text-purple-primary group-hover:scale-110 transition-transform duration-300"
                      ></i>
                      <span class="text-xs font-semibold text-slate-100">
                        ${activeT.selectFiles}
                      </span>
                    </button>
                  </div>

                  ${this.filesCount > 0
                    ? html`
                        <div
                          class="p-3 bg-amber-bg border border-amber-border rounded-xl text-xs flex items-center justify-between shadow-inner"
                        >
                          <div class="flex items-center gap-2 text-amber-text font-medium">
                            <i class="fa-solid fa-folder-tree text-sm"></i>
                            <span class="font-bold truncate max-w-50">
                              ${this.lang === "ko"
                                ? "수동 로드된 임포트 셋"
                                : "Manually Imported Set"}
                            </span>
                          </div>
                          <span class="text-slate-400 font-mono">
                            ${activeT.filesDetected(this.filesCount)}
                          </span>
                        </div>
                      `
                    : html`
                        <div class="text-center py-2">
                          <span class="text-xs text-slate-500 font-medium">
                            ${activeT.waitingImport}
                          </span>
                        </div>
                      `}
                </div>
              `}

          <!-- Try with Sample File Button -->
          <div class="mt-4 pt-4 border-t border-slate-800">
            <button
              @click="${this.handleLoadSample}"
              ?disabled="${this.isConverting}"
              class="w-full py-3 px-4 bg-purple-bg hover:bg-purple-primary/20 text-purple-text border border-purple-border hover:border-purple-primary/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.97]"
            >
              <i class="fa-solid fa-wand-magic-sparkles text-xs animate-pulse"></i>
              <span>${activeT.trySample}</span>
            </button>
            <p class="text-xs text-slate-500 mt-1.5 text-center font-medium leading-relaxed">
              ${activeT.trySampleDesc}
            </p>
          </div>
        </div>

        <!-- Step 2: Settings Card -->
        <div class="glass-panel rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div
            class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-indigo-500 to-purple-600"
          ></div>
          <h2 class="text-md font-bold mb-5 text-slate-100 flex items-center gap-2.5 font-sans">
            <span
              class="bg-linear-to-r from-indigo-500 to-purple-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(99,102,241,0.3)]"
            >
              2
            </span>
            ${activeT.rulesHeader}
          </h2>

          <div class="space-y-4">
            <!-- 1. MP3 변환 품질 설정 -->
            <details
              class="group bg-slate-950 border border-slate-800 rounded-2xl [&_summary::-webkit-details-marker]:hidden"
            >
              <summary
                class="p-4 text-xs font-bold text-slate-300 flex items-center justify-between cursor-pointer list-none focus:outline-none select-none hover:text-slate-100 transition-colors duration-200"
              >
                <div class="flex items-center gap-1.5">
                  <i class="fa-solid fa-sliders text-indigo-400"></i>
                  <span>${activeT.bitrateLabel}</span>
                </div>
                <i
                  class="fa-solid fa-chevron-down text-slate-500 text-[10px] transition-transform duration-200 group-open:rotate-180"
                ></i>
              </summary>
              <div class="p-4 pt-0 border-t border-slate-800/50 space-y-4">
                <div class="mt-4">
                  <div class="grid grid-cols-2 gap-3">
                    ${bitrates.map(
                      (rate) => html`
                        <button
                          @click="${() => this.handleChangeBitrate(rate)}"
                          ?disabled="${this.isConverting}"
                          class="py-2.5 rounded-xl border text-xs font-bold transition-all font-sans cursor-pointer active:scale-95 ${this
                            .bitrate === rate
                            ? "bg-brand-bg border-brand-primary text-brand-text shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-brand-primary/40 hover:text-slate-200"}"
                        >
                          ${rate} kbps
                          ${rate === 192
                            ? this.lang === "ko"
                              ? "(권장)"
                              : "(Recommended)"
                            : rate === 320
                              ? this.lang === "ko"
                                ? "(고음질)"
                                : "(High)"
                              : ""}
                        </button>
                      `,
                    )}
                  </div>
                  <p class="text-xs text-slate-500 mt-2 font-medium tracking-wide leading-relaxed">
                    ${activeT.bitrateDesc}
                  </p>
                </div>
              </div>
            </details>

            <!-- 2. 저장 위치 지정 -->
            <details
              class="group bg-slate-950 border border-slate-800 rounded-2xl [&_summary::-webkit-details-marker]:hidden"
            >
              <summary
                class="p-4 text-xs font-bold text-slate-300 flex items-center justify-between cursor-pointer list-none focus:outline-none select-none hover:text-slate-100 transition-colors duration-200"
              >
                <div class="flex items-center gap-1.5">
                  <i class="fa-regular fa-folder-open text-brand-primary"></i>
                  <span>${this.lang === "ko" ? "내보낼 대상 폴더 (출력 경로)" : "Export Target Folder"}</span>
                </div>
                <i
                  class="fa-solid fa-chevron-down text-slate-500 text-[10px] transition-transform duration-200 group-open:rotate-180"
                ></i>
              </summary>
              <div class="p-4 pt-0 border-t border-slate-800/50 space-y-4">
                <div class="mt-4">
                  ${this.apiSupported
                    ? html`
                        <div class="space-y-3">
                          ${this.outputDirHandle
                            ? html`
                                <div
                                  class="p-3 bg-brand-bg border border-brand-border rounded-xl text-xs flex items-center justify-between shadow-inner"
                                >
                                  <div class="flex items-center gap-2 text-brand-text font-medium">
                                    <i class="fa-regular fa-folder-open text-sm"></i>
                                    <span
                                      class="font-bold truncate max-w-50"
                                      title="${this.outputDirHandle.name}"
                                    >
                                      ${this.outputDirHandle.name}
                                    </span>
                                  </div>
                                  <button
                                    @click="${this.handleResetOutputFolder}"
                                    ?disabled="${this.isConverting}"
                                    class="text-slate-400 hover:text-rose-400 font-sans transition-colors cursor-pointer text-xs flex items-center gap-1 font-bold disabled:opacity-50"
                                  >
                                    <i class="fa-solid fa-xmark"></i> ${activeT.resetDir}
                                  </button>
                                </div>
                              `
                            : html`
                                <button
                                  @click="${this.handleSelectOutputFolder}"
                                  ?disabled="${this.isConverting}"
                                  class="w-full py-3.5 px-4 bg-slate-950 hover:bg-slate-900 text-slate-300 rounded-xl border border-dashed border-slate-800 hover:border-brand-primary/30 transition-all flex items-center justify-center gap-2 cursor-pointer font-sans text-xs active:scale-[0.98]"
                                >
                                  <i class="fa-regular fa-folder-open text-base text-brand-primary"></i>
                                  <span class="font-semibold">${activeT.selectOutputDir}</span>
                                </button>
                              `}
                        </div>
                      `
                    : html`
                        <div
                          class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-500 font-sans leading-relaxed shadow-inner"
                        >
                          <i class="fa-solid fa-circle-info text-amber-500/80 mr-1"></i>
                          ${activeT.noOutputDirCompat}
                        </div>
                      `}
                  <p class="text-xs text-slate-500 mt-2 font-medium tracking-wide leading-relaxed">
                    ${activeT.outputDirDesc}
                  </p>
                </div>
              </div>
            </details>

            <!-- 3. 원본 파일 관리 옵션 -->
            <details
              class="group bg-slate-950 border border-slate-800 rounded-2xl [&_summary::-webkit-details-marker]:hidden"
            >
              <summary
                class="p-4 text-xs font-bold text-slate-300 flex items-center justify-between cursor-pointer list-none focus:outline-none select-none hover:text-slate-100 transition-colors duration-200"
              >
                <div class="flex items-center gap-1.5">
                  <i class="fa-regular fa-trash-can text-indigo-400"></i>
                  <span>${this.lang === "ko" ? "원본 파일 정리 옵션" : "Original File Cleanup"}</span>
                </div>
                <i
                  class="fa-solid fa-chevron-down text-slate-500 text-[10px] transition-transform duration-200 group-open:rotate-180"
                ></i>
              </summary>
              <div class="p-4 pt-0 border-t border-slate-800/50 space-y-4">
                <div class="mt-4 bg-slate-950 p-4.5 rounded-2xl border border-slate-800 shadow-inner">
                  <label class="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      ?checked="${this.deleteOriginal}"
                      ?disabled="${this.isConverting}"
                      @change="${this.handleToggleDelete}"
                      class="w-5 h-5 rounded-lg text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 focus:ring-offset-slate-950 cursor-pointer mt-0.5"
                    />
                    <div class="text-sm">
                      <span class="font-bold text-slate-100 block">
                        ${activeT.deleteOriginalLabel}
                      </span>
                      <span class="text-slate-500 block mt-1 font-sans leading-relaxed">
                        ${activeT.deleteOriginalDesc}
                      </span>
                    </div>
                  </label>

                  ${this.deleteOriginal && (!this.apiSupported || !this.dirHandle)
                    ? html`
                        <div
                          class="mt-2 text-xs text-rose-400 font-bold flex items-center gap-1.5 font-sans"
                        >
                          <i class="fa-solid fa-circle-exclamation"></i>
                          <span>${activeT.deleteOriginalAlert}</span>
                        </div>
                      `
                    : ""}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "audio-settings-panel": AudioSettingsPanel;
  }
}
