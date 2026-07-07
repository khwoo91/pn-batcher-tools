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
  @state() private isDraggingFolder = false;
  @state() private isSettingsOpen = true;
  @state() private activePopup: "replace" | "prefix-suffix" | "remove-range" | "clean" | "numbering" | "extension" | null = null;

  private handleKeyDownGlobal = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.activePopup !== null) {
      this.closePopup();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    const saved = localStorage.getItem("pn-batcher-rename-settings-open");
    if (saved !== null) {
      this.isSettingsOpen = saved === "true";
    } else {
      this.isSettingsOpen = true;
    }
    window.addEventListener("keydown", this.handleKeyDownGlobal);
  }

  override disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDownGlobal);
    super.disconnectedCallback();
  }

  private openPopup(type: "replace" | "prefix-suffix" | "remove-range" | "clean" | "numbering" | "extension") {
    if (this.isConverting || this.filesCount === 0) return;
    this.activePopup = type;

    // Autofocus input in next tick
    setTimeout(() => {
      let inputElement: HTMLInputElement | HTMLSelectElement | null = null;
      if (type === "replace") {
        inputElement = this.renderRoot.querySelector("#replace-find") as HTMLInputElement;
      } else if (type === "prefix-suffix") {
        inputElement = this.renderRoot.querySelector("#prefix-text") as HTMLInputElement;
      } else if (type === "remove-range") {
        inputElement = this.renderRoot.querySelector("#remove-start") as HTMLInputElement;
      } else if (type === "numbering") {
        inputElement = this.renderRoot.querySelector("#num-start") as HTMLInputElement;
      } else if (type === "extension") {
        inputElement = this.renderRoot.querySelector("#ext-new") as HTMLInputElement;
      }
      if (inputElement) {
        inputElement.focus();
        if (inputElement instanceof HTMLInputElement) {
          inputElement.select();
        }
      }
    }, 100);
  }

  private closePopup() {
    this.activePopup = null;
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
    this.closePopup();
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
    this.closePopup();
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
    this.closePopup();
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
    this.closePopup();
  }

  private applyKeepNumbers() {
    this.dispatchEvent(new CustomEvent("apply-keep-numbers", { bubbles: true, composed: true }));
    this.closePopup();
  }

  private applyRemoveBrackets() {
    this.dispatchEvent(new CustomEvent("apply-remove-brackets", { bubbles: true, composed: true }));
    this.closePopup();
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
    this.closePopup();
  }

  private applyExtension() {
    const newExtInput = this.renderRoot.querySelector("#ext-new") as HTMLInputElement;
    const newExt = newExtInput ? newExtInput.value.trim() : "";

    if (this.extMode === "change" && !newExt) {
      alert(
        this.lang === "ko"
          ? "변경할 새 확장자를 입력해 주세요."
          : "Please enter the new extension.",
      );
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
    this.closePopup();
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
          localStorage.setItem("pn-batcher-rename-settings-open", "false");
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
          localStorage.setItem("pn-batcher-rename-settings-open", "true");
        }
      };
      content.addEventListener('transitionend', onEnd);
    }
  }



  protected override render() {
    const activeT = t[this.lang];

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
            class="hidden"
            @change="${this.handleUploadFiles}"
            ?disabled="${this.isConverting}"
          />

          <!-- Extension Filter Options -->
          <div class="mb-5 flex flex-col gap-2.5">
            <span class="text-xs font-bold text-slate-400 font-sans tracking-wide">
              ${activeT.inputExtsLabel}
            </span>
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
                      <i
                        class="fa-regular fa-folder-open text-2xl text-brand-primary group-hover:scale-110 transition-transform duration-300"
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
                        class="fa-regular fa-file text-2xl text-purple-primary group-hover:scale-110 transition-transform duration-300"
                      ></i>
                      <span class="text-xs font-semibold text-slate-100">
                        ${activeT.selectFiles}
                      </span>
                    </button>
                  </div>

                  ${this.dirHandle
                    ? html`
                        <div
                          class="p-3 bg-brand-bg border border-brand-border rounded-xl text-xs flex items-center justify-between shadow-inner"
                        >
                          <div class="flex items-center gap-2 text-brand-text font-medium">
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
                            class="p-3 bg-brand-bg border border-brand-border rounded-xl text-xs flex items-center justify-between shadow-inner"
                          >
                            <div class="flex items-center gap-2 text-brand-text font-medium">
                              <i class="fa-regular fa-file text-sm"></i>
                              <span class="font-bold">
                                ${this.lang === "ko" ? "개별 업로드됨" : "Uploaded files"}
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
                <!-- Fallback File Input Interface -->
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-3">
                    <button
                      @click="${() =>
                        this.renderRoot
                          .querySelector("#folder-upload-input")
                          ?.dispatchEvent(new MouseEvent("click"))}"
                      ?disabled="${this.isConverting}"
                      class="w-full py-4 px-4 bg-slate-950 hover:bg-brand-bg disabled:opacity-50 text-slate-100 rounded-2xl border border-dashed border-slate-800 hover:border-brand-primary hover:shadow-[0_0_20px_rgba(99,102,241,0.05)] transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer group font-sans active:scale-[0.98] text-center"
                    >
                      <i
                        class="fa-regular fa-folder-open text-2xl text-indigo-400 group-hover:scale-110 transition-transform duration-300"
                      ></i>
                      <span class="text-xs font-semibold text-slate-100">
                        ${activeT.fallbackUpload}
                      </span>
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
                      <i
                        class="fa-regular fa-file text-2xl text-purple-400 group-hover:scale-110 transition-transform duration-300"
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
                          class="p-3 bg-brand-bg border border-brand-border rounded-xl text-xs flex items-center justify-between shadow-inner"
                        >
                          <div class="flex items-center gap-2 text-brand-text font-medium">
                            <i class="fa-regular fa-folder-open text-sm"></i>
                            <span class="font-bold truncate max-w-55">
                              ${activeT.fallbackUpload}
                            </span>
                          </div>
                          <span class="text-slate-400 font-mono">
                            ${activeT.filesLoaded(this.filesCount)}
                          </span>
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
        <details
          class="group glass-panel rounded-3xl p-0 shadow-xl relative overflow-hidden [&_summary::-webkit-details-marker]:hidden"
          ?open="${this.isSettingsOpen}"
        >
          <summary
            @click="${this.handleDetailsToggle}"
            class="list-none focus:outline-none select-none cursor-pointer p-6"
          >
            <div
              class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-purple-500 to-pink-600"
            ></div>
            <h2
              class="text-md font-bold text-slate-100 flex items-center gap-2.5 font-sans justify-between"
            >
              <div class="flex items-center gap-2.5">
                <span
                  class="bg-linear-to-r from-purple-500 to-pink-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(168,85,247,0.3)]"
                >
                  2
                </span>
                ${activeT.rulesHeader}
              </div>
              <div class="flex items-center gap-2">
                <button
                  @click="${(e: Event) => { e.stopPropagation(); this.applyClearFilename(); }}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="py-1.5 px-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer font-sans active:scale-95"
                >
                  ${this.lang === "ko" ? "전체 이름 지우기" : "Clear filenames"}
                </button>
                <i
                  class="fa-solid fa-chevron-down text-slate-500 text-[12px] transition-transform duration-200 group-open:rotate-180 ml-2"
                ></i>
              </div>
            </h2>
          </summary>
          <div class="overflow-hidden">
            <div class="px-6 pb-6 space-y-4 mt-2">
              <!-- Compact Button Grid for Rename Rules -->
              <div class="grid grid-cols-2 gap-3 mt-4">
                <button
                  @click="${() => this.openPopup("replace")}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="py-3 px-4 bg-slate-950 hover:bg-purple-primary/10 border border-slate-800 hover:border-purple-primary/45 disabled:opacity-40 disabled:hover:bg-slate-950 disabled:hover:border-slate-800 text-slate-300 hover:text-slate-100 rounded-2xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer font-sans active:scale-95 shadow-[0_0_15px_rgba(168,85,247,0.02)] text-left min-w-0"
                >
                  <div class="w-7 h-7 rounded-lg bg-purple-primary/10 flex items-center justify-center text-purple-primary shrink-0">
                    <i class="fa-solid fa-arrows-rotate"></i>
                  </div>
                  <span class="truncate flex-1">${activeT.replaceHeader}</span>
                </button>

                <button
                  @click="${() => this.openPopup("prefix-suffix")}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="py-3 px-4 bg-slate-950 hover:bg-purple-primary/10 border border-slate-800 hover:border-purple-primary/45 disabled:opacity-40 disabled:hover:bg-slate-950 disabled:hover:border-slate-800 text-slate-300 hover:text-slate-100 rounded-2xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer font-sans active:scale-95 shadow-[0_0_15px_rgba(168,85,247,0.02)] text-left min-w-0"
                >
                  <div class="w-7 h-7 rounded-lg bg-purple-primary/10 flex items-center justify-center text-purple-primary shrink-0">
                    <i class="fa-solid fa-indent"></i>
                  </div>
                  <span class="truncate flex-1">${activeT.prefixHeader}</span>
                </button>

                <button
                  @click="${() => this.openPopup("remove-range")}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="py-3 px-4 bg-slate-950 hover:bg-purple-primary/10 border border-slate-800 hover:border-purple-primary/45 disabled:opacity-40 disabled:hover:bg-slate-950 disabled:hover:border-slate-800 text-slate-300 hover:text-slate-100 rounded-2xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer font-sans active:scale-95 shadow-[0_0_15px_rgba(168,85,247,0.02)] text-left min-w-0"
                >
                  <div class="w-7 h-7 rounded-lg bg-purple-primary/10 flex items-center justify-center text-purple-primary shrink-0">
                    <i class="fa-solid fa-scissors"></i>
                  </div>
                  <span class="truncate flex-1">${activeT.removeHeader}</span>
                </button>

                <button
                  @click="${() => this.openPopup("clean")}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="py-3 px-4 bg-slate-950 hover:bg-purple-primary/10 border border-slate-800 hover:border-purple-primary/45 disabled:opacity-40 disabled:hover:bg-slate-950 disabled:hover:border-slate-800 text-slate-300 hover:text-slate-100 rounded-2xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer font-sans active:scale-95 shadow-[0_0_15px_rgba(168,85,247,0.02)] text-left min-w-0"
                >
                  <div class="w-7 h-7 rounded-lg bg-purple-primary/10 flex items-center justify-center text-purple-primary shrink-0">
                    <i class="fa-solid fa-broom"></i>
                  </div>
                  <span class="truncate flex-1">${activeT.cleanHeader}</span>
                </button>

                <button
                  @click="${() => this.openPopup("numbering")}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="py-3 px-4 bg-slate-950 hover:bg-purple-primary/10 border border-slate-800 hover:border-purple-primary/45 disabled:opacity-40 disabled:hover:bg-slate-950 disabled:hover:border-slate-800 text-slate-300 hover:text-slate-100 rounded-2xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer font-sans active:scale-95 shadow-[0_0_15px_rgba(168,85,247,0.02)] text-left min-w-0"
                >
                  <div class="w-7 h-7 rounded-lg bg-purple-primary/10 flex items-center justify-center text-purple-primary shrink-0">
                    <i class="fa-solid fa-list-ol"></i>
                  </div>
                  <span class="truncate flex-1">${activeT.numberingHeader}</span>
                </button>

                <button
                  @click="${() => this.openPopup("extension")}"
                  ?disabled="${this.isConverting || this.filesCount === 0}"
                  class="py-3 px-4 bg-slate-950 hover:bg-purple-primary/10 border border-slate-800 hover:border-purple-primary/45 disabled:opacity-40 disabled:hover:bg-slate-950 disabled:hover:border-slate-800 text-slate-300 hover:text-slate-100 rounded-2xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer font-sans active:scale-95 shadow-[0_0_15px_rgba(168,85,247,0.02)] text-left min-w-0"
                >
                  <div class="w-7 h-7 rounded-lg bg-purple-primary/10 flex items-center justify-center text-purple-primary shrink-0">
                    <i class="fa-solid fa-file-signature"></i>
                  </div>
                  <span class="truncate flex-1">${activeT.extHeader}</span>
                </button>
              </div>

              <!-- Floating Lightbox Dialog Modal -->
              ${this.activePopup
                ? html`
                    <div
                      class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
                      @click="${this.closePopup}"
                    >
                      <div
                        class="bg-slate-900 border border-slate-850 rounded-3xl p-6 w-full max-w-sm shadow-[0_10px_50px_rgba(0,0,0,0.5)] relative animate-scale-in"
                        @click="${(e: Event) => e.stopPropagation()}"
                      >
                        <!-- Close Button -->
                        <button
                          @click="${this.closePopup}"
                          class="absolute top-4.5 right-4.5 text-slate-500 hover:text-slate-300 transition-all cursor-pointer w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-800/50"
                        >
                          <i class="fa-solid fa-xmark text-xs"></i>
                        </button>

                        <!-- Modal Content -->
                        ${this.activePopup === "replace"
                          ? html`
                              <h3 class="text-xs font-bold text-slate-100 flex items-center gap-2 mb-5">
                                <i class="fa-solid fa-arrows-rotate text-purple-primary text-sm"></i>
                                <span>${activeT.replaceHeader}</span>
                              </h3>
                              <div class="space-y-4">
                                <div class="grid grid-cols-2 gap-3">
                                  <div class="space-y-1">
                                    <label class="text-[10px] text-slate-500 font-bold block"
                                      >${this.lang === "ko" ? "찾을 글자" : "Find Text"}</label
                                    >
                                    <input
                                      type="text"
                                      id="replace-find"
                                      placeholder="${activeT.replaceFind}"
                                      class="w-full bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                                    />
                                  </div>
                                  <div class="space-y-1">
                                    <label class="text-[10px] text-slate-500 font-bold block"
                                      >${this.lang === "ko" ? "바꿀 글자" : "Replace Text"}</label
                                    >
                                    <input
                                      type="text"
                                      id="replace-replace"
                                      placeholder="${activeT.replaceReplace}"
                                      class="w-full bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                                    />
                                  </div>
                                </div>
                                <button
                                  @click="${this.applyReplace}"
                                  class="w-full py-2.5 bg-purple-primary hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95"
                                >
                                  ${activeT.btnApply}
                                </button>
                              </div>
                            `
                          : this.activePopup === "prefix-suffix"
                            ? html`
                                <h3 class="text-xs font-bold text-slate-100 flex items-center gap-2 mb-5">
                                  <i class="fa-solid fa-indent text-purple-primary text-sm"></i>
                                  <span>${activeT.prefixHeader}</span>
                                </h3>
                                <div class="space-y-4">
                                  <div class="flex gap-2">
                                    <input
                                      type="text"
                                      id="prefix-text"
                                      placeholder="${activeT.prefixLabel}"
                                      class="flex-1 bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                                    />
                                    <button
                                      @click="${this.applyPrefix}"
                                      class="px-4 py-2.5 bg-purple-primary hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95"
                                    >
                                      ${activeT.btnApply}
                                    </button>
                                  </div>
                                  <div class="border-t border-slate-800/50 my-1"></div>
                                  <div class="flex gap-2">
                                    <input
                                      type="text"
                                      id="suffix-text"
                                      placeholder="${activeT.suffixLabel}"
                                      class="flex-1 bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                                    />
                                    <button
                                      @click="${this.applySuffix}"
                                      class="px-4 py-2.5 bg-purple-primary hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95"
                                    >
                                      ${activeT.btnApply}
                                    </button>
                                  </div>
                                </div>
                              `
                            : this.activePopup === "remove-range"
                              ? html`
                                  <h3 class="text-xs font-bold text-slate-100 flex items-center gap-2 mb-5">
                                    <i class="fa-solid fa-scissors text-purple-primary text-sm"></i>
                                    <span>${activeT.removeHeader}</span>
                                  </h3>
                                  <div class="space-y-4">
                                    <div class="grid grid-cols-2 gap-3">
                                      <div class="space-y-1">
                                        <label class="text-[10px] text-slate-500 font-bold block"
                                          >${activeT.removeStart}</label
                                        >
                                        <input
                                          type="number"
                                          id="remove-start"
                                          min="1"
                                          placeholder="예: 3"
                                          class="w-full bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                                        />
                                      </div>
                                      <div class="space-y-1">
                                        <label class="text-[10px] text-slate-500 font-bold block"
                                          >${activeT.removeLen}</label
                                        >
                                        <input
                                          type="number"
                                          id="remove-len"
                                          min="1"
                                          placeholder="예: 2"
                                          class="w-full bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                                        />
                                      </div>
                                    </div>
                                    <button
                                      @click="${this.applyRemove}"
                                      class="w-full py-2.5 bg-purple-primary hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95"
                                    >
                                      ${activeT.btnApply}
                                    </button>
                                  </div>
                                `
                              : this.activePopup === "clean"
                                ? html`
                                    <h3 class="text-xs font-bold text-slate-100 flex items-center gap-2 mb-5">
                                      <i class="fa-solid fa-broom text-purple-primary text-sm"></i>
                                      <span>${activeT.cleanHeader}</span>
                                    </h3>
                                    <div class="grid grid-cols-2 gap-3">
                                      <button
                                        @click="${this.applyKeepNumbers}"
                                        class="py-3 px-2 bg-slate-950 border border-slate-800 hover:border-purple-primary/45 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95 text-center"
                                      >
                                        ${activeT.btnKeepNumbers}
                                      </button>
                                      <button
                                        @click="${this.applyRemoveBrackets}"
                                        class="py-3 px-2 bg-slate-950 border border-slate-800 hover:border-purple-primary/45 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95 text-center"
                                      >
                                        ${activeT.btnRemoveBrackets}
                                      </button>
                                    </div>
                                  `
                                : this.activePopup === "numbering"
                                  ? html`
                                      <h3 class="text-xs font-bold text-slate-100 flex items-center gap-2 mb-5">
                                        <i class="fa-solid fa-list-ol text-purple-primary text-sm"></i>
                                        <span>${activeT.numberingHeader}</span>
                                      </h3>
                                      <div class="space-y-4">
                                        <div class="grid grid-cols-3 gap-2">
                                          <div class="space-y-1">
                                            <label class="text-[10px] text-slate-500 font-bold block"
                                              >${activeT.numberingStart}</label
                                            >
                                            <input
                                              type="number"
                                              id="num-start"
                                              min="0"
                                              value="1"
                                              class="w-full bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition-all font-sans"
                                            />
                                          </div>
                                          <div class="space-y-1">
                                            <label class="text-[10px] text-slate-500 font-bold block"
                                              >${activeT.numberingDigits}</label
                                            >
                                            <input
                                              type="number"
                                              id="num-digits"
                                              min="1"
                                              value="2"
                                              class="w-full bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition-all font-sans"
                                            />
                                          </div>
                                          <div class="space-y-1">
                                            <label class="text-[10px] text-slate-500 font-bold block"
                                              >${activeT.numberingPosition}</label
                                            >
                                            <select
                                              id="num-position"
                                              class="w-full bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-2 py-2 text-[11px] text-slate-100 focus:outline-none transition-all font-sans cursor-pointer h-8.5"
                                            >
                                              <option value="suffix" selected>${activeT.posSuffix}</option>
                                              <option value="prefix">${activeT.posPrefix}</option>
                                            </select>
                                          </div>
                                        </div>
                                        <button
                                          @click="${this.applyNumbering}"
                                          class="w-full py-2.5 bg-purple-primary hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95"
                                        >
                                          ${activeT.btnApply}
                                        </button>
                                      </div>
                                    `
                                  : html`
                                      <h3 class="text-xs font-bold text-slate-100 flex items-center gap-2 mb-5">
                                        <i class="fa-solid fa-file-signature text-purple-primary text-sm"></i>
                                        <span>${activeT.extHeader}</span>
                                      </h3>
                                      <div class="space-y-4">
                                        <div class="grid grid-cols-2 gap-2">
                                          <div class="space-y-1">
                                            <label class="text-[10px] text-slate-500 font-bold block"
                                              >${activeT.extMode}</label
                                            >
                                            <select
                                              @change="${(e: Event) =>
                                                (this.extMode = (e.target as HTMLSelectElement).value as any)}"
                                              class="w-full bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-2 py-2 text-[11px] text-slate-100 focus:outline-none transition-all font-sans cursor-pointer h-8.5"
                                            >
                                              <option value="keep" ?selected="${this.extMode === "keep"}">${activeT.extModeKeep}</option>
                                              <option value="remove" ?selected="${this.extMode === "remove"}">${activeT.extModeRemove}</option>
                                              <option value="change" ?selected="${this.extMode === "change"}">${activeT.extModeChange}</option>
                                            </select>
                                          </div>
                                          <div class="space-y-1">
                                            <label class="text-[10px] text-slate-500 font-bold block"
                                              >${activeT.extNew}</label
                                            >
                                            <input
                                              type="text"
                                              id="ext-new"
                                              placeholder=".txt"
                                              class="w-full bg-slate-950 border border-slate-850 focus:border-purple-primary focus:ring-1 focus:ring-purple-primary/20 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all font-sans"
                                              ?disabled="${this.extMode !== "change"}"
                                            />
                                          </div>
                                        </div>
                                        <button
                                          @click="${this.applyExtension}"
                                          ?disabled="${this.extMode === "keep"}"
                                          class="w-full py-2.5 bg-purple-primary hover:opacity-90 text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-sans active:scale-95"
                                        >
                                          ${activeT.btnApply}
                                        </button>
                                      </div>
                                    `}
                      </div>
                    </div>
                  `
                : ""}
            </div>
        </details>

        <!-- Step 3: Rename History & Dangerous Actions Card -->
        <div class="glass-panel rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div
            class="absolute top-0 left-0 w-1.5 h-full bg-linear-to-b from-pink-500 to-rose-600"
          ></div>
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
                    <p class="text-[11px] text-slate-500 leading-normal font-sans">
                      ${activeT.deleteWarning}
                    </p>
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
