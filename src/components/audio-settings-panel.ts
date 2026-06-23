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

  protected override createRenderRoot() {
    return this;
  }

  private handleSelectFolder() {
    this.dispatchEvent(
      new CustomEvent("select-folder", { bubbles: true, composed: true })
    );
  }

  private handleUploadFiles(e: Event) {
    this.dispatchEvent(
      new CustomEvent("upload-files", {
        detail: e,
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleChangeBitrate(bitrate: number) {
    this.dispatchEvent(
      new CustomEvent("change-bitrate", {
        detail: bitrate,
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleSelectOutputFolder() {
    this.dispatchEvent(
      new CustomEvent("select-output-folder", {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleResetOutputFolder(e: Event) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("reset-output-folder", {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleToggleDelete() {
    this.dispatchEvent(
      new CustomEvent("toggle-delete", {
        bubbles: true,
        composed: true,
      })
    );
  }

  protected override render() {
    const activeT = t[this.lang];
    const bitrates = [128, 192, 256, 320];

    return html`
      <div class="space-y-6">
        <!-- Step 1: Directory Picker Card -->
        <div class="glass-panel rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-indigo-500 to-purple-600"></div>
          <h2 class="text-md font-bold mb-5 text-white flex items-center gap-2.5 font-sans">
            <span class="bg-linear-to-r from-indigo-500 to-purple-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(99,102,241,0.3)]">
              1
            </span>
            ${activeT.linkFolder}
          </h2>

          ${this.apiSupported
            ? html`
                <!-- Native Folder Selection API UI -->
                <div class="space-y-4">
                  <button
                    @click="${this.handleSelectFolder}"
                    ?disabled="${this.isConverting}"
                    class="w-full py-6 px-6 bg-slate-950/40 hover:bg-indigo-950/15 disabled:opacity-50 text-white rounded-2xl border border-dashed border-slate-800/80 hover:border-indigo-500/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.05)] transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group font-sans active:scale-[0.98]"
                  >
                    <i class="fa-regular fa-folder-open text-3xl text-indigo-400 group-hover:scale-110 transition-transform duration-300"></i>
                    <span class="text-sm font-semibold tracking-wide text-slate-200">
                      ${activeT.localFolderSelect}
                    </span>
                    <span class="text-xs text-slate-500">
                      ${activeT.folderAutoFetch}
                    </span>
                  </button>

                  ${this.dirHandle
                    ? html`
                        <div class="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-xs flex items-center justify-between shadow-inner">
                          <div class="flex items-center gap-2 text-indigo-300 font-medium">
                            <i class="fa-regular fa-folder-open text-sm"></i>
                            <span class="font-bold truncate max-w-50" title="${this.dirHandle.name}">
                              ${this.dirHandle.name}
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
                  <label class="w-full py-6 px-6 bg-slate-950/40 hover:bg-amber-950/15 text-white rounded-2xl border border-dashed border-slate-800/80 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(245,158,11,0.05)] transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group font-sans active:scale-[0.98]">
                    <input
                      type="file"
                      webkitdirectory
                      directory
                      multiple
                      class="hidden"
                      @change="${this.handleUploadFiles}"
                      ?disabled="${this.isConverting}"
                      accept=".wav"
                    />
                    <i class="fa-solid fa-cloud-arrow-up text-3xl text-amber-400 group-hover:scale-110 transition-transform duration-300"></i>
                    <span class="text-sm font-semibold tracking-wide text-slate-200">
                      ${activeT.fallbackUpload}
                    </span>
                    <span class="text-xs text-slate-500">
                      ${activeT.fallbackUploadDesc}
                    </span>
                  </label>

                  ${this.filesCount > 0
                    ? html`
                        <div class="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl text-xs flex items-center justify-between shadow-inner">
                          <div class="flex items-center gap-2 text-amber-300 font-medium">
                            <i class="fa-solid fa-folder-tree text-sm"></i>
                            <span class="font-bold truncate max-w-50">
                              ${this.lang === "ko" ? "수동 로드된 임포트 셋" : "Manually Imported Set"}
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
        </div>

        <!-- Step 2: Settings Card -->
        <div class="glass-panel rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-indigo-500 to-purple-600"></div>
          <h2 class="text-md font-bold mb-5 text-white flex items-center gap-2.5 font-sans">
            <span class="bg-linear-to-r from-indigo-500 to-purple-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(99,102,241,0.3)]">
              2
            </span>
            ${activeT.rulesHeader}
          </h2>

          <div class="space-y-4">
            <!-- Bitrate selection (MP3 Quality) -->
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                ${activeT.bitrateLabel}
              </label>
              <div class="grid grid-cols-2 gap-3">
                ${bitrates.map(
                  (rate) => html`
                    <button
                      @click="${() => this.handleChangeBitrate(rate)}"
                      ?disabled="${this.isConverting}"
                      class="py-2.5 rounded-xl border text-xs font-bold transition-all font-sans cursor-pointer active:scale-95 ${this
                        .bitrate === rate
                        ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                        : "bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-300"}"
                    >
                      ${rate} kbps ${rate === 192 ? (this.lang === "ko" ? "(권장)" : "(Recommended)") : rate === 320 ? (this.lang === "ko" ? "(고음질)" : "(High)") : ""}
                    </button>
                  `
                )}
              </div>
              <p class="text-[10px] text-slate-500 mt-2 font-medium tracking-wide leading-relaxed">
                ${activeT.bitrateDesc}
              </p>
            </div>

            <div class="border-t border-white/5 my-4"></div>

            <!-- Output Folder settings -->
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                ${activeT.outputDirLabel}
              </label>

              ${this.apiSupported
                ? html`
                    <div class="space-y-3">
                      ${this.outputDirHandle
                        ? html`
                            <div class="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-xs flex items-center justify-between shadow-inner">
                              <div class="flex items-center gap-2 text-indigo-300 font-medium">
                                <i class="fa-regular fa-folder-open text-sm"></i>
                                <span class="font-bold truncate max-w-50" title="${this.outputDirHandle.name}">
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
                              class="w-full py-3.5 px-4 bg-slate-950/40 hover:bg-slate-900/50 text-slate-300 rounded-xl border border-dashed border-white/5 hover:border-indigo-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer font-sans text-xs active:scale-[0.98]"
                            >
                              <i class="fa-regular fa-folder-open text-base text-indigo-400"></i>
                              <span class="font-semibold">${activeT.selectOutputDir}</span>
                            </button>
                          `}
                    </div>
                  `
                : html`
                    <div class="p-3 bg-slate-950/40 rounded-xl border border-white/5 text-[11px] text-slate-500 font-sans leading-relaxed shadow-inner">
                      <i class="fa-solid fa-circle-info text-amber-500/80 mr-1"></i>
                      ${activeT.noOutputDirCompat}
                    </div>
                  `}
              <p class="text-[10px] text-slate-500 mt-2 font-medium tracking-wide leading-relaxed">
                ${activeT.outputDirDesc}
              </p>
            </div>

            <div class="border-t border-white/5 my-4"></div>

            <!-- Option: Delete Original WAV -->
            <div class="bg-slate-950/40 p-4.5 rounded-2xl border border-white/5 shadow-inner">
              <label class="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  ?checked="${this.deleteOriginal}"
                  ?disabled="${this.isConverting}"
                  @change="${this.handleToggleDelete}"
                  class="w-5 h-5 rounded-lg text-indigo-600 bg-slate-950 border-white/5 focus:ring-indigo-500 focus:ring-offset-slate-950 cursor-pointer mt-0.5"
                />
                <div class="text-xs">
                  <span class="font-bold text-slate-200 block">
                    ${activeT.deleteOriginalLabel}
                  </span>
                  <span class="text-slate-500 block mt-1 font-sans leading-relaxed">
                    ${activeT.deleteOriginalDesc}
                  </span>
                </div>
              </label>

              ${this.deleteOriginal && (!this.apiSupported || !this.dirHandle)
                ? html`
                    <div class="mt-2 text-[10px] text-rose-400 font-bold flex items-center gap-1.5 font-sans">
                      <i class="fa-solid fa-circle-exclamation"></i>
                      <span>${activeT.deleteOriginalAlert}</span>
                    </div>
                  `
                : ""}
            </div>
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
