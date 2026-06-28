import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { locales } from "../locales";

const t = {
  ko: locales.ko.renameSettings,
  en: locales.en.renameSettings,
};

@customElement("renamer-settings-panel")
export class RenamerSettingsPanel extends LitElement {
  @property({ type: String }) lang: "ko" | "en" = "ko";
  @property({ type: Boolean }) apiSupported = false;
  @property({ type: Object }) dirHandle: FileSystemDirectoryHandle | null = null;
  @property({ type: Number }) filesCount = 0;
  @property({ type: Boolean }) isConverting = false;
  @property({ type: Number }) conversionProgress = 0;
  @property({ type: String }) extFilter = "";

  @state() private extMode: "keep" | "remove" | "change" = "keep";

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

  private handleUploadFiles(e: Event) {
    this.dispatchEvent(
      new CustomEvent("upload-files", {
        detail: e,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleLoadSample() {
    this.dispatchEvent(new CustomEvent("load-sample", { bubbles: true, composed: true }));
  }

  private handleExtFilterChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.dispatchEvent(
      new CustomEvent("change-ext-filter", {
        detail: target.value,
        bubbles: true,
        composed: true,
      }),
    );
  }

  // Operation event dispatchers
  private applyReplace() {
    const findInput = this.renderRoot.querySelector("#replace-find") as HTMLInputElement;
    const replaceInput = this.renderRoot.querySelector("#replace-replace") as HTMLInputElement;
    if (!findInput) return;

    this.dispatchEvent(
      new CustomEvent("apply-replace", {
        detail: { find: findInput.value, replace: replaceInput.value || "" },
        bubbles: true,
        composed: true,
      }),
    );
    findInput.value = "";
    replaceInput.value = "";
  }

  private applyPrefix() {
    const prefixInput = this.renderRoot.querySelector("#prefix-text") as HTMLInputElement;
    if (!prefixInput || !prefixInput.value) return;

    this.dispatchEvent(
      new CustomEvent("apply-prefix", {
        detail: { text: prefixInput.value },
        bubbles: true,
        composed: true,
      }),
    );
    prefixInput.value = "";
  }

  private applySuffix() {
    const suffixInput = this.renderRoot.querySelector("#suffix-text") as HTMLInputElement;
    if (!suffixInput || !suffixInput.value) return;

    this.dispatchEvent(
      new CustomEvent("apply-suffix", {
        detail: { text: suffixInput.value },
        bubbles: true,
        composed: true,
      }),
    );
    suffixInput.value = "";
  }

  private applyRemove() {
    const startInput = this.renderRoot.querySelector("#remove-start") as HTMLInputElement;
    const lenInput = this.renderRoot.querySelector("#remove-len") as HTMLInputElement;
    if (!startInput || !lenInput) return;

    const startVal = parseInt(startInput.value, 10);
    const lenVal = parseInt(lenInput.value, 10);
    if (isNaN(startVal) || isNaN(lenVal) || startVal < 1 || lenVal < 1) {
      alert(
        this.lang === "ko"
          ? "시작 위치와 지울 글자 수는 1 이상의 숫자여야 합니다."
          : "Start position and length must be numbers greater than or equal to 1.",
      );
      return;
    }

    this.dispatchEvent(
      new CustomEvent("apply-remove", {
        detail: { start: startVal, len: lenVal },
        bubbles: true,
        composed: true,
      }),
    );
    startInput.value = "";
    lenInput.value = "";
  }

  private applyKeepNumbers() {
    this.dispatchEvent(new CustomEvent("apply-keep-numbers", { bubbles: true, composed: true }));
  }

  private applyRemoveBrackets() {
    this.dispatchEvent(new CustomEvent("apply-remove-brackets", { bubbles: true, composed: true }));
  }

  private applyClearFilename() {
    this.dispatchEvent(new CustomEvent("apply-clear-filename", { bubbles: true, composed: true }));
  }

  private applyNumbering() {
    const startInput = this.renderRoot.querySelector("#num-start") as HTMLInputElement;
    const digitsInput = this.renderRoot.querySelector("#num-digits") as HTMLInputElement;
    const posSelect = this.renderRoot.querySelector("#num-position") as HTMLSelectElement;
    if (!startInput || !digitsInput || !posSelect) return;

    const startVal = parseInt(startInput.value, 10);
    const digitsVal = parseInt(digitsInput.value, 10);
    if (isNaN(startVal) || isNaN(digitsVal) || startVal < 0 || digitsVal < 1) {
      alert(this.lang === "ko" ? "올바른 숫자를 입력해 주세요." : "Please enter valid numbers.");
      return;
    }

    this.dispatchEvent(
      new CustomEvent("apply-numbering", {
        detail: { start: startVal, digits: digitsVal, position: posSelect.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private applyExtension() {
    const newExtInput = this.renderRoot.querySelector("#ext-new") as HTMLInputElement;
    const newExt = newExtInput ? newExtInput.value.trim() : "";

    if (this.extMode === "change" && !newExt) {
      alert(this.lang === "ko" ? "변경할 새 확장자를 입력해 주세요." : "Please enter the new extension.");
      return;
    }

    this.dispatchEvent(
      new CustomEvent("apply-extension", {
        detail: { mode: this.extMode, newExt },
        bubbles: true,
        composed: true,
      }),
    );
    if (newExtInput) newExtInput.value = "";
  }

  private handleUndo() {
    this.dispatchEvent(new CustomEvent("undo-rename", { bubbles: true, composed: true }));
  }

  private handleResetNames() {
    this.dispatchEvent(new CustomEvent("reset-names", { bubbles: true, composed: true }));
  }

  private handleDeleteSelected() {
    this.dispatchEvent(new CustomEvent("delete-selected", { bubbles: true, composed: true }));
  }

  protected override render() {
    const activeT = t[this.lang];

    return html`
      <div class="space-y-6">
        <!-- Step 1: Directory Picker Card -->
        <div class="glass-panel rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-indigo-500 to-purple-600"></div>
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
            class="hidden"
            @change="${this.handleUploadFiles}"
            ?disabled="${this.isConverting}"
          />

          <!-- Extension Filter Options -->
          <div class="mb-5 flex flex-col gap-2.5">
            <span class="text-xs font-bold text-slate-400 font-sans tracking-wide"> ${activeT.inputExtsLabel} </span>
            <input
              type="text"
              .value="${this.extFilter}"
              @input="${this.handleExtFilterChange}"
              placeholder="예: html, css, js (비워두면 전체)"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-primary/50 transition-all font-sans"
              ?disabled="${this.isConverting}"
            />
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
                      <i class="fa-regular fa-folder-open text-2xl text-brand-primary group-hover:scale-110 transition-transform duration-300"></i>
                      <span class="text-xs font-semibold text-slate-100"> ${activeT.localFolderSelect} </span>
                    </button>

                    <button
                      @click="${this.handleTriggerFileInput}"
                      ?disabled="${this.isConverting}"
                      class="w-full py-4 px-4 bg-slate-950 hover:bg-brand-bg disabled:opacity-50 text-slate-100 rounded-2xl border border-dashed border-slate-800 hover:border-brand-primary hover:shadow-[0_0_20px_rgba(99,102,241,0.05)] transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer group font-sans active:scale-[0.98] text-center"
                    >
                      <i class="fa-regular fa-file text-2xl text-purple-primary group-hover:scale-110 transition-transform duration-300"></i>
                      <span class="text-xs font-semibold text-slate-100"> ${activeT.selectFiles} </span>
                    </button>
                  </div>

                  ${this.dirHandle
                    ? html`
                        <div class="p-3 bg-brand-bg border border-brand-border rounded-xl text-xs flex items-center justify-between shadow-inner">
                          <div class="flex items-center gap-2 text-brand-text font-medium">
                            <i class="fa-regular fa-folder-open text-sm"></i>
                            <span class="font-bold truncate max-w-50" title="${this.dirHandle.name}"> ${this.dirHandle.name} </span>
                          </div>
                          <span class="text-slate-400 font-mono"> ${activeT.filesLoaded(this.filesCount)} </span>
                        </div>
                      `
                    : this.filesCount > 0
                      ? html`
                          <div class="p-3 bg-brand-bg border border-brand-border rounded-xl text-xs flex items-center justify-between shadow-inner">
                            <div class="flex items-center gap-2 text-brand-text font-medium">
                              <i class="fa-regular fa-file text-sm"></i>
                              <span class="font-bold"> ${this.lang === "ko" ? "개별 업로드됨" : "Uploaded files"} </span>
                            </div>
                            <span class="text-slate-400 font-mono"> ${activeT.filesLoaded(this.filesCount)} </span>
                          </div>
                        `
                      : html`
                          <div
                            class="text-center py-2.5 px-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-500 font-sans tracking-wide"
                          >
                            <i class="fa-solid fa-circle-info mr-1 text-slate-600"></i>
                            ${activeT.noFolderSelected}
                          </div>
                        `}
                </div>
              `
            : html`
                <!-- Fallback File Input Interface -->
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-3">
                    <button
                      @click="${() => this.renderRoot.querySelector("#folder-upload-input")?.dispatchEvent(new MouseEvent("click"))}"
                      ?disabled="${this.isConverting}"
                      class="w-full py-4 px-4 bg-slate-950 hover:bg-brand-bg disabled:opacity-50 text-slate-100 rounded-2xl border border-dashed border-slate-800 hover:border-brand-primary hover:shadow-[0_0_20px_rgba(99,102,241,0.05)] transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer group font-sans active:scale-[0.98] text-center"
                    >
                      <i class="fa-regular fa-folder-open text-2xl text-indigo-400 group-hover:scale-110 transition-transform duration-300"></i>
                      <span class="text-xs font-semibold text-slate-100"> ${activeT.fallbackUpload} </span>
                    </button>
                    <input
                      type="file"
                      id="folder-upload-input"
                      webkitdirectory
                      directory
                      multiple
                      class="hidden"
                      @change="${this.handleUploadFiles}"
                      ?disabled="${this.isConverting}"
                    />

                    <button
                      @click="${this.handleTriggerFileInput}"
                      ?disabled="${this.isConverting}"
                      class="w-full py-4 px-4 bg-slate-950 hover:bg-brand-bg disabled:opacity-50 text-slate-100 rounded-2xl border border-dashed border-slate-800 hover:border-brand-primary hover:shadow-[0_0_20px_rgba(99,102,241,0.05)] transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer group font-sans active:scale-[0.98] text-center"
                    >
                      <i class="fa-regular fa-file text-2xl text-purple-400 group-hover:scale-110 transition-transform duration-300"></i>
                      <span class="text-xs font-semibold text-slate-100"> ${activeT.selectFiles} </span>
                    </button>
                  </div>

                  ${this.filesCount > 0
                    ? html`
                        <div class="p-3 bg-brand-bg border border-brand-border rounded-xl text-xs flex items-center justify-between shadow-inner">
                          <div class="flex items-center gap-2 text-brand-text font-medium">
                            <i class="fa-regular fa-folder-open text-sm"></i>
                            <span class="font-bold truncate max-w-55"> ${activeT.fallbackUpload} </span>
                          </div>
                          <span class="text-slate-400 font-mono"> ${activeT.filesLoaded(this.filesCount)} </span>
                        </div>
                      `
                    : html`
                        <div
                          class="text-center py-2.5 px-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-500 font-sans tracking-wide"
                        >
                          <i class="fa-solid fa-circle-info mr-1 text-slate-600"></i>
                          ${activeT.noFolderSelected}
                        </div>
                      `}
                </div>
              `}

          <!-- Quick Test Link -->
          ${this.filesCount === 0
            ? html`
                <div class="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-2">
                  <div class="text-xs text-slate-500 font-sans">${activeT.trySampleDesc}</div>
                  <button
                    @click="${this.handleLoadSample}"
                    ?disabled="${this.isConverting}"
                    class="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans shadow-md active:scale-95"
                  >
                    <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                    <span>${activeT.trySample}</span>
                  </button>
                </div>
              `
            : ""}
        </div>

        <!-- Step 2: Configure Rename Rules Card -->
        <div class="glass-panel rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-purple-500 to-pink-600"></div>
          <h2 class="text-md font-bold mb-5 text-slate-100 flex items-center gap-2.5 font-sans justify-between">
            <div class="flex items-center gap-2.5">
              <span
                class="bg-linear-to-r from-purple-500 to-pink-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(168,85,247,0.3)]"
              >
                2
              </span>
              ${activeT.rulesHeader}
            </div>
            <button
              @click="${this.applyClearFilename}"
              ?disabled="${this.isConverting || this.filesCount === 0}"
              class="col-span-2 py-2.5 px-2 bg-slate-950 border border-slate-800 hover:border-rose-500/30 text-rose-600 hover:text-rose-500 dark:text-rose-400 dark:hover:text-rose-300 rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95 text-center flex items-center justify-center gap-1.5"
            >
              <i class="fa-regular fa-trash-can text-[10px]"></i>
              <span>${activeT.btnDeleteAllName}</span>
            </button>
          </h2>

          <div class="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            <!-- 1. 문자열 바꾸기 -->
            <details class="group p-4 bg-slate-950 border border-slate-800 rounded-2xl [&_summary::-webkit-details-marker]:hidden">
              <summary class="text-xs font-bold text-slate-300 flex items-center justify-between cursor-pointer list-none focus:outline-none select-none hover:text-slate-100 transition-colors duration-200">
                <div class="flex items-center gap-1.5">
                  <i class="fa-solid fa-arrows-rotate text-purple-primary"></i>
                  <span>${activeT.replaceHeader}</span>
                </div>
                <i class="fa-solid fa-chevron-down text-slate-500 text-[10px] transition-transform duration-200 group-open:rotate-180"></i>
              </summary>
              <div class="space-y-3 pt-4">
                <div class="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    id="replace-find"
                    placeholder="${activeT.replaceFind}"
                    class="bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                    ?disabled="${this.isConverting || this.filesCount === 0}"
                  />
                  <input
                    type="text"
                    id="replace-replace"
                    placeholder="${activeT.replaceReplace}"
                    class="bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                    ?disabled="${this.isConverting || this.filesCount === 0}"
                  />
                </div>
                <button
                  @click="${this.applyReplace}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="w-full py-2 bg-purple-primary hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans"
                >
                  ${activeT.btnApply}
                </button>
              </div>
            </details>

            <!-- 2. 앞이름 / 뒷이름 붙이기 -->
            <details class="group p-4 bg-slate-950 border border-slate-800 rounded-2xl [&_summary::-webkit-details-marker]:hidden">
              <summary class="text-xs font-bold text-slate-300 flex items-center justify-between cursor-pointer list-none focus:outline-none select-none hover:text-slate-100 transition-colors duration-200">
                <div class="flex items-center gap-1.5">
                  <i class="fa-solid fa-indent text-purple-primary"></i>
                  <span>${activeT.prefixHeader}</span>
                </div>
                <i class="fa-solid fa-chevron-down text-slate-500 text-[10px] transition-transform duration-200 group-open:rotate-180"></i>
              </summary>
              <div class="space-y-2 pt-4">
                <div class="flex gap-2">
                  <input
                    type="text"
                    id="prefix-text"
                    placeholder="${activeT.prefixLabel}"
                    class="flex-1 bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                    ?disabled="${this.isConverting || this.filesCount === 0}"
                  />
                  <button
                    @click="${this.applyPrefix}"
                    ?disabled="${this.isConverting || this.filesCount === 0}"
                    class="px-4 py-2 bg-purple-primary hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans"
                  >
                    ${activeT.btnApply}
                  </button>
                </div>
                <div class="flex gap-2">
                  <input
                    type="text"
                    id="suffix-text"
                    placeholder="${activeT.suffixLabel}"
                    class="flex-1 bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                    ?disabled="${this.isConverting || this.filesCount === 0}"
                  />
                  <button
                    @click="${this.applySuffix}"
                    ?disabled="${this.isConverting || this.filesCount === 0}"
                    class="px-4 py-2 bg-purple-primary hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans"
                  >
                    ${activeT.btnApply}
                  </button>
                </div>
              </div>
            </details>

            <!-- 3. 특정 위치 지우기 -->
            <details class="group p-4 bg-slate-950 border border-slate-800 rounded-2xl [&_summary::-webkit-details-marker]:hidden">
              <summary class="text-xs font-bold text-slate-300 flex items-center justify-between cursor-pointer list-none focus:outline-none select-none hover:text-slate-100 transition-colors duration-200">
                <div class="flex items-center gap-1.5">
                  <i class="fa-solid fa-scissors text-purple-primary"></i>
                  <span>${activeT.removeHeader}</span>
                </div>
                <i class="fa-solid fa-chevron-down text-slate-500 text-[10px] transition-transform duration-200 group-open:rotate-180"></i>
              </summary>
              <div class="space-y-3 pt-4">
                <div class="grid grid-cols-2 gap-2">
                  <div class="space-y-1">
                    <label class="text-[10px] text-slate-500 font-bold block">${activeT.removeStart}</label>
                    <input
                      type="number"
                      id="remove-start"
                      min="1"
                      placeholder="예: 3"
                      class="w-full bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                      ?disabled="${this.isConverting || this.filesCount === 0}"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] text-slate-500 font-bold block">${activeT.removeLen}</label>
                    <input
                      type="number"
                      id="remove-len"
                      min="1"
                      placeholder="예: 2"
                      class="w-full bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                      ?disabled="${this.isConverting || this.filesCount === 0}"
                    />
                  </div>
                </div>
                <button
                  @click="${this.applyRemove}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="w-full py-2 bg-purple-primary hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans"
                >
                  ${activeT.btnApply}
                </button>
              </div>
            </details>

            <!-- 4. 일괄 정리 및 지우기 -->
            <details class="group p-4 bg-slate-950 border border-slate-800 rounded-2xl [&_summary::-webkit-details-marker]:hidden">
              <summary class="text-xs font-bold text-slate-300 flex items-center justify-between cursor-pointer list-none focus:outline-none select-none hover:text-slate-100 transition-colors duration-200">
                <div class="flex items-center gap-1.5">
                  <i class="fa-solid fa-broom text-purple-primary"></i>
                  <span>${activeT.cleanHeader}</span>
                </div>
                <i class="fa-solid fa-chevron-down text-slate-500 text-[10px] transition-transform duration-200 group-open:rotate-180"></i>
              </summary>
              <div class="grid grid-cols-2 gap-2 pt-4">
                <button
                  @click="${this.applyKeepNumbers}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="py-2.5 px-2 bg-slate-950 border border-slate-800 hover:border-purple-primary/40 disabled:opacity-30 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95 text-center"
                >
                  ${activeT.btnKeepNumbers}
                </button>
                <button
                  @click="${this.applyRemoveBrackets}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="py-2.5 px-2 bg-slate-950 border border-slate-800 hover:border-purple-primary/40 disabled:opacity-30 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95 text-center"
                >
                  ${activeT.btnRemoveBrackets}
                </button>
              </div>
            </details>

            <!-- 5. 일련번호 붙이기 -->
            <details class="group p-4 bg-slate-950 border border-slate-800 rounded-2xl [&_summary::-webkit-details-marker]:hidden">
              <summary class="text-xs font-bold text-slate-300 flex items-center justify-between cursor-pointer list-none focus:outline-none select-none hover:text-slate-100 transition-colors duration-200">
                <div class="flex items-center gap-1.5">
                  <i class="fa-solid fa-list-ol text-purple-primary"></i>
                  <span>${activeT.numberingHeader}</span>
                </div>
                <i class="fa-solid fa-chevron-down text-slate-500 text-[10px] transition-transform duration-200 group-open:rotate-180"></i>
              </summary>
              <div class="space-y-3 pt-4">
                <div class="grid grid-cols-3 gap-2">
                  <div class="space-y-1">
                    <label class="text-[10px] text-slate-500 font-bold block">${activeT.numberingStart}</label>
                    <input
                      type="number"
                      id="num-start"
                      min="0"
                      value="1"
                      class="w-full bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition-all font-sans"
                      ?disabled="${this.isConverting || this.filesCount === 0}"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] text-slate-500 font-bold block">${activeT.numberingDigits}</label>
                    <input
                      type="number"
                      id="num-digits"
                      min="1"
                      value="2"
                      class="w-full bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition-all font-sans"
                      ?disabled="${this.isConverting || this.filesCount === 0}"
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] text-slate-500 font-bold block">${activeT.numberingPosition}</label>
                    <select
                      id="num-position"
                      class="w-full bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-2 py-2 text-[11px] text-slate-100 focus:outline-none transition-all font-sans cursor-pointer h-[34px]"
                      ?disabled="${this.isConverting || this.filesCount === 0}"
                    >
                      <option value="suffix" selected>${activeT.posSuffix}</option>
                      <option value="prefix">${activeT.posPrefix}</option>
                    </select>
                  </div>
                </div>
                <button
                  @click="${this.applyNumbering}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="w-full py-2 bg-purple-primary hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans"
                >
                  ${activeT.btnApply}
                </button>
              </div>
            </details>

            <!-- 6. 확장자 변경 및 추가 -->
            <details class="group p-4 bg-slate-950 border border-slate-800 rounded-2xl [&_summary::-webkit-details-marker]:hidden">
              <summary class="text-xs font-bold text-slate-300 flex items-center justify-between cursor-pointer list-none focus:outline-none select-none hover:text-slate-100 transition-colors duration-200">
                <div class="flex items-center gap-1.5">
                  <i class="fa-solid fa-file-signature text-purple-primary"></i>
                  <span>${activeT.extHeader}</span>
                </div>
                <i class="fa-solid fa-chevron-down text-slate-500 text-[10px] transition-transform duration-200 group-open:rotate-180"></i>
              </summary>
              <div class="space-y-3 pt-4">
                <div class="grid grid-cols-2 gap-2">
                  <div class="space-y-1">
                    <label class="text-[10px] text-slate-500 font-bold block">${activeT.extMode}</label>
                    <select
                      @change="${(e: Event) => (this.extMode = (e.target as HTMLSelectElement).value as any)}"
                      class="w-full bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-2 py-2 text-[11px] text-slate-100 focus:outline-none transition-all font-sans cursor-pointer h-[34px]"
                      ?disabled="${this.isConverting || this.filesCount === 0}"
                    >
                      <option value="keep" selected>${activeT.extModeKeep}</option>
                      <option value="remove">${activeT.extModeRemove}</option>
                      <option value="change">${activeT.extModeChange}</option>
                    </select>
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] text-slate-500 font-bold block">${activeT.extNew}</label>
                    <input
                      type="text"
                      id="ext-new"
                      placeholder=".txt"
                      class="w-full bg-slate-950 border border-slate-800 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                      ?disabled="${this.isConverting || this.filesCount === 0 || this.extMode !== "change"}"
                    />
                  </div>
                </div>
                <button
                  @click="${this.applyExtension}"
                  ?disabled="${this.isConverting || this.filesCount === 0 || this.extMode === "keep"}"
                  class="w-full py-2 bg-purple-primary hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans"
                >
                  ${activeT.btnApply}
                </button>
              </div>
            </details>
          </div>
        </div>

        <!-- Step 3: Rename History & Dangerous Actions Card -->
        <div class="glass-panel rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-pink-500 to-rose-600"></div>
          <h2 class="text-md font-bold mb-5 text-slate-100 flex items-center gap-2.5 font-sans">
            <span
              class="bg-linear-to-r from-pink-500 to-rose-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(244,63,94,0.3)]"
            >
              3
            </span>
            ${activeT.historyHeader}
          </h2>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <button
                @click="${this.handleUndo}"
                ?disabled="${this.isConverting || this.filesCount === 0}"
                class="w-full py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-purple-primary/40 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer font-sans active:scale-95"
              >
                <i class="fa-solid fa-arrow-rotate-left"></i>
                <span>${activeT.btnUndo}</span>
              </button>

              <button
                @click="${this.handleResetNames}"
                ?disabled="${this.isConverting || this.filesCount === 0}"
                class="w-full py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-purple-primary/40 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer font-sans active:scale-95"
              >
                <i class="fa-solid fa-trash-can-arrow-up"></i>
                <span>${activeT.btnResetNames}</span>
              </button>
            </div>

            <!-- Danger Zone (Delete Files) -->
            ${this.dirHandle
              ? html`
                  <div class="pt-4 border-t border-slate-800 space-y-3">
                    <h3 class="text-xs font-bold text-rose-400 flex items-center gap-1.5 font-sans">
                      <i class="fa-solid fa-circle-exclamation text-rose-500"></i>
                      ${activeT.deleteHeader}
                    </h3>
                    <p class="text-[11px] text-slate-500 leading-normal font-sans">${activeT.deleteWarning}</p>
                    <button
                      @click="${this.handleDeleteSelected}"
                      ?disabled="${this.isConverting || this.filesCount === 0}"
                      class="w-full py-3.5 bg-warning-bg hover:bg-rose-600 hover:text-white border border-warning-border hover:border-rose-600 disabled:opacity-30 disabled:hover:bg-warning-bg disabled:hover:text-warning-text text-warning-text rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer font-sans active:scale-95 shadow-[0_0_15px_rgba(244,63,94,0.03)]"
                    >
                      <i class="fa-regular fa-trash-can text-sm"></i>
                      <span>${activeT.btnDeleteSelected}</span>
                    </button>
                  </div>
                `
              : ""}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "renamer-settings-panel": RenamerSettingsPanel;
  }
}
