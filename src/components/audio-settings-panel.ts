import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
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

  @state() private isDraggingFolder = false;
  @state() private isSettingsOpen = true;

  override connectedCallback() {
    super.connectedCallback();
    const saved = localStorage.getItem("pn-batcher-audio-settings-open");
    if (saved !== null) {
      this.isSettingsOpen = saved === "true";
    } else {
      this.isSettingsOpen = true;
    }
  }

  protected override createRenderRoot() {
    return this;
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (this.isConverting) return;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  private handleDragEnter(e: DragEvent) {
    e.preventDefault();
    if (this.isConverting) return;
    this.isDraggingFolder = true;
  }

  private handleDragLeave(e: DragEvent) {
    e.preventDefault();
    if (this.isConverting) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX >= rect.right ||
      e.clientY < rect.top ||
      e.clientY >= rect.bottom
    ) {
      this.isDraggingFolder = false;
    }
  }

  private async handleDrop(e: DragEvent) {
    e.preventDefault();
    if (this.isConverting) return;
    this.isDraggingFolder = false;

    if (e.dataTransfer) {
      const files = e.dataTransfer.files;
      const items = e.dataTransfer.items;
      let directoryItem: DataTransferItem | null = null;

      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === "file") {
            if (typeof item.webkitGetAsEntry === "function") {
              const entry = item.webkitGetAsEntry();
              if (entry && entry.isDirectory) {
                directoryItem = item;
                break;
              }
            }
          }
        }
      }

      if (directoryItem) {
        if (typeof directoryItem.getAsFileSystemHandle === "function") {
          try {
            const handle = await directoryItem.getAsFileSystemHandle();
            if (handle && handle.kind === "directory") {
              this.dispatchEvent(
                new CustomEvent("drop-folder", {
                  detail: handle,
                  bubbles: true,
                  composed: true,
                }),
              );
              return;
            }
          } catch (err) {
            console.error("Error getting dropped directory handle:", err);
          }
        }
      }

      if (files && files.length > 0) {
        this.dispatchEvent(
          new CustomEvent("drop-files", {
            detail: files,
            bubbles: true,
            composed: true,
          }),
        );
      }
    }
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

  private handleDetailsToggle(e: Event) {
    e.preventDefault();
    const summary = e.currentTarget as HTMLElement;
    const details = summary.parentElement as HTMLDetailsElement;
    if (!details) return;

    const content = summary.nextElementSibling as HTMLElement;
    if (!content) return;

    if (details.dataset.transitioning === "true") return;

    if (details.open) {
      details.dataset.transitioning = "true";
      const startHeight = content.scrollHeight;
      content.style.height = `${startHeight}px`;
      content.offsetHeight; // force reflow

      content.style.transition = 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-out';
      content.style.height = '0px';
      content.style.opacity = '0';

      const onEnd = (event: TransitionEvent) => {
        if (event.propertyName === 'height') {
          content.removeEventListener('transitionend', onEnd);
          details.removeAttribute('open');
          content.style.height = '';
          content.style.opacity = '';
          content.style.transition = '';
          delete details.dataset.transitioning;
          this.isSettingsOpen = false;
          localStorage.setItem("pn-batcher-audio-settings-open", "false");
        }
      };
      content.addEventListener('transitionend', onEnd);
    } else {
      details.dataset.transitioning = "true";
      details.setAttribute('open', '');
      const endHeight = content.scrollHeight;

      content.style.height = '0px';
      content.style.opacity = '0';
      content.offsetHeight; // force reflow

      content.style.transition = 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease-out';
      content.style.height = `${endHeight}px`;
      content.style.opacity = '1';

      const onEnd = (event: TransitionEvent) => {
        if (event.propertyName === 'height') {
          content.removeEventListener('transitionend', onEnd);
          content.style.height = '';
          content.style.opacity = '';
          content.style.transition = '';
          delete details.dataset.transitioning;
          this.isSettingsOpen = true;
          localStorage.setItem("pn-batcher-audio-settings-open", "true");
        }
      };
      content.addEventListener('transitionend', onEnd);
    }
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
        <div
          class="glass-panel rounded-3xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 ${this
            .isDraggingFolder
            ? "ring-2 ring-indigo-500 bg-indigo-500/10"
            : ""}"
          @dragover="${this.handleDragOver}"
          @dragenter="${this.handleDragEnter}"
          @dragleave="${this.handleDragLeave}"
          @drop="${this.handleDrop}"
        >
          <!-- Drag Over Card Overlay -->
          ${this.isDraggingFolder
            ? html`
                <div
                  class="absolute inset-0 bg-indigo-950/85 backdrop-blur-md border-2 border-dashed border-indigo-500 rounded-3xl flex flex-col items-center justify-center text-indigo-300 z-30 transition-all duration-300"
                >
                  <i class="fa-solid fa-cloud-arrow-up text-3xl mb-2 animate-bounce"></i>
                  <span class="text-xs font-bold text-center px-4"
                    >${this.lang === "ko"
                      ? "여기에 폴더 또는 파일을 놓으세요"
                      : "Drop folder or files here"}</span
                  >
                </div>
              `
            : ""}
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
                          <div class="text-center">
                            <span class="text-xs text-slate-500 font-medium">
                              ${activeT.noFolderSelected}
                            </span>
                            <!-- Drag and Drop Hint -->
                            <div
                              class="text-center text-[10px] text-slate-500 font-sans select-none"
                            >
                              <i class="fa-solid fa-circle-info mr-1 text-slate-600"></i>
                              ${this.lang === "ko"
                                ? "여기에 드래그하여 바로 가져오세요."
                                : "Drag & drop here to import."}
                            </div>
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

                  <!-- Drag and Drop Hint -->
                  <div class="text-center text-[10px] text-slate-500 font-sans my-1 select-none">
                    <i class="fa-solid fa-circle-info mr-1 text-slate-600"></i>
                    ${this.lang === "ko"
                      ? "여기에 드래그하여 바로 가져오세요."
                      : "Drag & drop here to import."}
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
        <details
          class="group glass-panel rounded-3xl p-0 shadow-xl relative overflow-hidden [&_summary::-webkit-details-marker]:hidden"
          ?open="${this.isSettingsOpen}"
        >
          <summary
            @click="${this.handleDetailsToggle}"
            class="list-none focus:outline-none select-none cursor-pointer p-6"
          >
            <div
              class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-indigo-500 to-purple-600"
            ></div>
            <h2 class="text-md font-bold text-slate-100 flex items-center gap-2.5 font-sans justify-between">
              <div class="flex items-center gap-2.5">
                <span
                  class="bg-linear-to-r from-indigo-500 to-purple-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                >
                  2
                </span>
                ${activeT.rulesHeader}
              </div>
              <i
                class="fa-solid fa-chevron-down text-slate-500 text-[12px] transition-transform duration-200 group-open:rotate-180"
              ></i>
            </h2>
          </summary>
          <div class="overflow-hidden">
            <div class="px-6 pb-6 space-y-4 mt-2">
            <!-- 1. MP3 변환 품질 설정 -->
            <div
              class="bg-slate-950 border border-slate-800 rounded-2xl"
            >
              <div
                class="p-4 text-xs font-bold text-slate-300 flex items-center justify-between select-none"
              >
                <div class="flex items-center gap-1.5">
                  <i class="fa-solid fa-sliders text-indigo-400"></i>
                  <span>${activeT.bitrateLabel}</span>
                </div>
              </div>
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
            </div>

            <div
              class="bg-slate-950 border border-slate-800 rounded-2xl"
            >
              <div
                class="p-4 text-xs font-bold text-slate-300 flex items-center justify-between select-none"
              >
                <div class="flex items-center gap-1.5">
                  <i class="fa-regular fa-folder-open text-brand-primary"></i>
                  <span>${this.lang === "ko" ? "내보낼 대상 폴더 (출력 경로)" : "Export Target Folder"}</span>
                </div>
              </div>
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
                                  <i
                                    class="fa-regular fa-folder-open text-base text-brand-primary"
                                  ></i>
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
            </div>

            <!-- 3. 원본 파일 관리 옵션 -->
            <div
              class="bg-slate-950 border border-slate-800 rounded-2xl"
            >
              <div
                class="p-4 text-xs font-bold text-slate-300 flex items-center justify-between select-none"
              >
                <div class="flex items-center gap-1.5">
                  <i class="fa-regular fa-trash-can text-indigo-400"></i>
                  <span>${this.lang === "ko" ? "원본 파일 정리 옵션" : "Original File Cleanup"}</span>
                </div>
              </div>
              <div class="p-4 pt-0 border-t border-slate-800/50 space-y-4">
                <div
                  class="mt-4 bg-slate-950 p-4.5 rounded-2xl border border-slate-800 shadow-inner"
                >
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
            </div>
          </div>
        </details>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "audio-settings-panel": AudioSettingsPanel;
  }
}
