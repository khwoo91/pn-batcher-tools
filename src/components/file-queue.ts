import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { BatchFile } from "../types";
import { locales } from "../locales";

const t = {
  ko: locales.ko.queue,
  en: locales.en.queue,
};

@customElement("file-queue")
export class FileQueue extends LitElement {
  @property({ type: Array }) files: BatchFile[] = [];
  @property({ type: Boolean }) isConverting = false;
  @property({ type: String }) lang: "ko" | "en" = "ko";
  @property({ type: String }) activeTab: "svg" | "audio" | "rename" = "svg";

  @state() private isDragging = false;
  @state() private editingPath: string | null = null;
  @state() private flatDownload = false;
  @state() private currentWidth = 200;
  @state() private newWidth = 200;

  private handleMouseDownCurrent(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = this.currentWidth;

    const doDrag = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      this.currentWidth = Math.max(120, startWidth + deltaX);
    };

    const stopDrag = () => {
      window.removeEventListener("mousemove", doDrag);
      window.removeEventListener("mouseup", stopDrag);
    };

    window.addEventListener("mousemove", doDrag);
    window.addEventListener("mouseup", stopDrag);
  }

  private handleMouseDownNew(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = this.newWidth;

    const doDrag = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      this.newWidth = Math.max(120, startWidth + deltaX);
    };

    const stopDrag = () => {
      window.removeEventListener("mousemove", doDrag);
      window.removeEventListener("mouseup", stopDrag);
    };

    window.addEventListener("mousemove", doDrag);
    window.addEventListener("mouseup", stopDrag);
  }

  private handleToggleFlatDownload(e: Event) {
    const input = e.target as HTMLInputElement;
    this.flatDownload = input.checked;
  }

  private handleDownloadSelected() {
    const selectedFiles = this.files.filter((f) => f.selected);
    if (selectedFiles.length === 0) return;
    this.dispatchEvent(
      new CustomEvent("download-originals", {
        detail: { files: selectedFiles, flat: this.flatDownload },
        bubbles: true,
        composed: true,
      }),
    );
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
    this.isDragging = true;
  }

  private handleDragLeave(e: DragEvent) {
    e.preventDefault();
    if (this.isConverting) return;

    // Only turn off if actually leaving the component area
    const rect = this.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX >= rect.right ||
      e.clientY < rect.top ||
      e.clientY >= rect.bottom
    ) {
      this.isDragging = false;
    }
  }

  private async handleDrop(e: DragEvent) {
    e.preventDefault();
    if (this.isConverting) return;
    this.isDragging = false;

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

  private handleLoadSample() {
    this.dispatchEvent(
      new CustomEvent("load-sample", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleGlobalKeyDown);
  }

  override disconnectedCallback() {
    window.removeEventListener("keydown", this.handleGlobalKeyDown);
    super.disconnectedCallback();
  }

  private handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (this.isConverting) return;

    // Ignore keypresses if user is currently typing in input/textarea/editable elements
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "SELECT" ||
        activeEl.tagName === "TEXTAREA" ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable))
    ) {
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      const selectedFiles = this.files.filter((f) => f.selected);
      if (selectedFiles.length > 0) {
        e.preventDefault();
        this.dispatchEvent(
          new CustomEvent("delete-selected-from-queue", {
            detail: selectedFiles,
            bubbles: true,
            composed: true,
          }),
        );
      }
    }
  };

  private handleToggleFile(file: BatchFile, e: Event) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("toggle-file-selected", {
        detail: file,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleRowClick(file: BatchFile, e: Event) {
    if (this.isConverting) return;

    const path = e.composedPath();
    for (const target of path) {
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        if (
          tagName === "input" ||
          tagName === "button" ||
          tagName === "select" ||
          (tagName === "i" && target.parentElement?.tagName.toLowerCase() === "button")
        ) {
          return;
        }
      }
    }

    this.dispatchEvent(
      new CustomEvent("toggle-file-selected", {
        detail: file,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleToggleAll(e: Event) {
    const target = e.target as HTMLInputElement;
    this.dispatchEvent(
      new CustomEvent("toggle-all-files", {
        detail: target.checked,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleDeleteFile(file: BatchFile, e: Event) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("delete-file", {
        detail: file,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleDeleteSelectedFromQueue() {
    if (this.isConverting) return;
    const selectedFiles = this.files.filter((f) => f.selected);
    if (selectedFiles.length > 0) {
      this.dispatchEvent(
        new CustomEvent("delete-selected-from-queue", {
          detail: selectedFiles,
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private handleKeyDown(file: BatchFile, e: KeyboardEvent) {
    if (this.isConverting) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.dispatchEvent(
        new CustomEvent("delete-file", {
          detail: file,
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private formatSize(bytes: number) {
    if (bytes > 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  // Inline editing handlers
  private handleStartEdit(relativePath: string, e: Event) {
    e.stopPropagation();
    if (this.isConverting) return;
    this.editingPath = relativePath;
    setTimeout(() => {
      const input = this.renderRoot.querySelector(".rename-input") as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  }

  private handleFinishEdit(relativePath: string, e: Event) {
    const input = e.target as HTMLInputElement;
    this.editingPath = null;
    this.dispatchEvent(
      new CustomEvent("change-file-new-name", {
        detail: { relativePath, newName: input.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleInputKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      const input = e.target as HTMLInputElement;
      input.blur();
    } else if (e.key === "Escape") {
      this.editingPath = null;
    }
  }

  protected override render() {
    const activeT = t[this.lang];
    const allSelected = this.files.length > 0 && this.files.every((f) => f.selected);
    const someSelected =
      this.files.length > 0 && this.files.some((f) => f.selected) && !allSelected;

    return html`
      <div
        class="glass-panel rounded-3xl p-6 shadow-xl flex flex-col min-h-50 max-h-100 relative overflow-hidden"
        @dragover="${this.handleDragOver}"
        @dragenter="${this.handleDragEnter}"
        @dragleave="${this.handleDragLeave}"
        @drop="${this.handleDrop}"
      >
        <!-- Drag Over Overlay -->
        ${this.isDragging
          ? html`
              <div
                class="absolute inset-0 bg-indigo-950/85 backdrop-blur-md border-2 border-dashed border-indigo-500 rounded-3xl flex flex-col items-center justify-center text-indigo-300 z-30 transition-all duration-300"
              >
                <i class="fa-solid fa-cloud-arrow-up text-4xl mb-3 animate-bounce"></i>
                <span class="text-sm font-bold text-center px-4"
                  >${activeT.dragOverActive(this.activeTab === "svg")}</span
                >
              </div>
            `
          : ""}

        <div class="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center h-5">
              <input
                type="checkbox"
                .checked="${allSelected}"
                .indeterminate="${someSelected}"
                ?disabled="${this.isConverting || this.files.length === 0}"
                @change="${this.handleToggleAll}"
                class="w-4.5 h-4.5 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 focus:ring-offset-slate-950 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="${activeT.selectAll}"
              />
            </div>
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-list-ul text-brand-primary text-sm"></i>
              <span class="text-sm font-bold text-slate-100 font-sans tracking-wide"
                >${activeT.fileList(this.files.length)}</span
              >
            </div>
          </div>
          ${this.files.some((f) => f.selected)
            ? html`
                <div class="flex items-center gap-2">
                  <!-- Download Flat Checkbox -->
                  <label class="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none font-sans mr-2">
                    <input
                      type="checkbox"
                      .checked="${this.flatDownload}"
                      @change="${this.handleToggleFlatDownload}"
                      ?disabled="${this.isConverting}"
                      class="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 focus:ring-offset-slate-950 cursor-pointer transition-all"
                    />
                    <span>${this.lang === "ko" ? "폴더 구조 제외" : "Download flat"}</span>
                  </label>

                  <!-- Download Button -->
                  <button
                    @click="${this.handleDownloadSelected}"
                    ?disabled="${this.isConverting}"
                    class="px-3 py-1.5 hover:bg-indigo-600 hover:text-white border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                  >
                    <i class="fa-solid fa-download text-[10px]"></i>
                    <span>${this.lang === "ko" ? "선택 원본 다운로드" : "Download Original"}</span>
                  </button>

                  <!-- Delete Button -->
                  <button
                    @click="${this.handleDeleteSelectedFromQueue}"
                    ?disabled="${this.isConverting}"
                    class="px-3 py-1.5 hover:bg-rose-600 hover:text-white border border-rose-500/20 hover:border-rose-500 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                  >
                    <i class="fa-regular fa-trash-can text-[10px]"></i>
                    <span>${this.lang === "ko" ? "선택 삭제" : "Delete Selected"}</span>
                  </button>
                </div>
              `
            : ""}
        </div>

        <div class="flex-1 overflow-auto pr-1">
          ${this.files.length === 0
            ? html`
                <div
                  class="h-full flex flex-col items-center justify-center text-slate-500 space-y-3 text-center"
                >
                  <i class="fa-solid fa-folder-open text-4xl text-slate-700 mb-0 mt-1"></i>
                  <p class="text-xs font-semibold tracking-wide leading-relaxed mb-3">
                    ${activeT.emptyQueue}
                  </p>
                  <button
                    @click="${this.handleLoadSample}"
                    ?disabled="${this.isConverting}"
                    class="px-4.5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-95
                      ${this.activeTab === "rename"
                      ? "bg-pink-600 hover:bg-pink-700"
                      : this.activeTab === "audio"
                        ? "bg-purple-600 hover:bg-purple-700"
                        : "bg-indigo-600 hover:bg-indigo-700"}"
                  >
                    <i class="fa-solid fa-wand-magic-sparkles text-[10px] animate-pulse"></i>
                    <span>${activeT.trySampleEmpty}</span>
                  </button>
                </div>
              `
            : this.activeTab === "rename"
              ? html`
                  <!-- Rename Mode Table View -->
                  <div class="w-full">
                    <table class="w-full text-left border-collapse text-xs" style="table-layout: fixed;">
                      <thead>
                        <tr class="border-b border-slate-800 pb-2">
                          <th class="py-2 pl-2 sticky top-0 z-20" style="width: 36px; background: var(--bg-card);"></th>
                          <th
                            style="width: ${this.currentWidth}px; background: var(--bg-card);"
                            class="py-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none pr-3 sticky top-0 z-20"
                          >
                            ${this.lang === "ko" ? "현재 파일명" : "Current Name"}
                            <div
                              class="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-brand-primary/30 active:bg-brand-primary z-10 transition-colors border-r border-slate-800/40 hover:border-brand-primary/50"
                              @mousedown="${this.handleMouseDownCurrent}"
                            ></div>
                          </th>
                          <th
                            style="width: ${this.newWidth}px; background: var(--bg-card);"
                            class="py-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none pr-3 sticky top-0 z-20"
                          >
                            ${this.lang === "ko" ? "변경할 파일명" : "New Name"}
                            <div
                              class="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-brand-primary/30 active:bg-brand-primary z-10 transition-colors border-r border-slate-800/40 hover:border-brand-primary/50"
                              @mousedown="${this.handleMouseDownNew}"
                            ></div>
                          </th>
                          <th
                            style="background: var(--bg-card); width: 120px; min-width: 120px;"
                            class="py-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center sticky top-0 z-20"
                          >
                            ${this.lang === "ko" ? "상태" : "Status"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.files.map((file) => {
                          const newName = file.newName || file.name;
                          const isChanged = newName !== file.name;
                          return html`
                            <tr
                              class="hover:bg-slate-900/40 border-b border-slate-800 transition-all group/row cursor-pointer"
                              @click="${(e: Event) => this.handleRowClick(file, e)}"
                            >
                              <td class="py-3 pl-2">
                                <input
                                  type="checkbox"
                                  .checked="${file.selected ?? false}"
                                  ?disabled="${this.isConverting}"
                                  @change="${(e: Event) => this.handleToggleFile(file, e)}"
                                  class="w-4.5 h-4.5 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 focus:ring-offset-slate-950 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                />
                              </td>
                              <td
                                class="py-3 pr-4 text-slate-400 truncate font-medium font-sans"
                                title="${file.relativePath}"
                              >
                                ${file.name}
                              </td>
                              <td class="py-3 pr-4 truncate font-sans">
                                ${this.editingPath === file.relativePath
                                  ? html`
                                      <input
                                        type="text"
                                        .value="${newName}"
                                        class="rename-input bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-primary w-full"
                                        @blur="${(e: Event) =>
                                          this.handleFinishEdit(file.relativePath, e)}"
                                        @keydown="${this.handleInputKeyDown}"
                                      />
                                    `
                                  : html`
                                      <span
                                        @dblclick="${(e: Event) =>
                                          this.handleStartEdit(file.relativePath, e)}"
                                        class="cursor-pointer ${isChanged
                                          ? "text-success-text font-bold"
                                          : "text-slate-100"} select-none flex items-center gap-1.5"
                                        title="${this.lang === "ko"
                                          ? "더블클릭하여 직접 변경"
                                          : "Double click to edit"}"
                                      >
                                        ${newName}
                                        <i
                                          class="fa-solid fa-pen text-[9px] text-slate-600 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                        ></i>
                                      </span>
                                    `}
                              </td>
                              <td class="py-3 text-center" style="width: 120px; min-width: 120px;">
                                <div class="flex items-center justify-center">
                                  <div class="shrink-0">
                                    ${file.status === "pending"
                                      ? html`<span
                                          class="px-2 py-0.5 border border-slate-800 bg-slate-950 text-slate-500 rounded-full text-[10px] font-bold tracking-wide whitespace-nowrap"
                                          >${activeT.statusPending}</span
                                        >`
                                      : ""}
                                    ${file.status === "processing"
                                      ? html`<span
                                          class="px-2 py-0.5 bg-brand-bg text-brand-text border border-brand-border rounded-full text-[10px] font-bold tracking-wide animate-pulse whitespace-nowrap"
                                          >${activeT.statusProcessing}</span
                                        >`
                                      : ""}
                                    ${file.status === "success"
                                      ? html` <span
                                          class="px-2 py-0.5 bg-success-bg text-success-text border border-success-border rounded-full text-[10px] font-bold tracking-wide inline-flex items-center gap-0.5 whitespace-nowrap"
                                        >
                                          <i class="fa-solid fa-check text-[9px]"></i>
                                          ${activeT.statusSuccess}
                                        </span>`
                                      : ""}
                                    ${file.status === "error"
                                      ? html` <span
                                          class="px-2 py-0.5 bg-warning-bg text-warning-text border border-warning-border rounded-full text-[10px] font-bold tracking-wide inline-flex items-center gap-0.5 whitespace-nowrap"
                                          title="${file.errorMsg || ""}"
                                        >
                                          <i class="fa-solid fa-exclamation text-[9px]"></i>
                                          ${activeT.statusError}
                                        </span>`
                                      : ""}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          `;
                        })}
                      </tbody>
                    </table>
                  </div>
                `
              : html`
                  <!-- List View (SVG / Audio) -->
                  <div class="space-y-2">
                    ${this.files.map((file) => {
                      const isAudio =
                        file.name.toLowerCase().endsWith(".wav") ||
                        file.name.toLowerCase().endsWith(".mp3");
                      const iconClass = isAudio
                        ? `fa-solid fa-music ${file.selected ? "text-purple-primary" : "text-slate-500"}`
                        : `fa-regular fa-file-image ${file.selected ? "text-brand-primary" : "text-slate-500"}`;

                      return html`
                        <div
                          class="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 hover:border-brand-primary/40 focus-within:border-brand-primary/50 transition-all text-xs group/item outline-none cursor-pointer rounded-xl animate-fade-in"
                          tabindex="0"
                          @keydown="${(e: KeyboardEvent) => this.handleKeyDown(file, e)}"
                          @click="${(e: Event) => this.handleRowClick(file, e)}"
                        >
                          <div class="flex items-center gap-3 min-w-0 font-sans flex-1">
                            <!-- Checkbox -->
                            <div class="flex items-center justify-center shrink-0">
                              <input
                                type="checkbox"
                                .checked="${file.selected ?? false}"
                                ?disabled="${this.isConverting}"
                                @change="${(e: Event) => this.handleToggleFile(file, e)}"
                                class="w-4.5 h-4.5 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 focus:ring-offset-slate-950 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                @click="${(e: Event) => e.stopPropagation()}"
                              />
                            </div>

                            <i class="${iconClass} text-lg shrink-0 transition-colors"></i>
                            <div class="min-w-0 flex-1">
                              <p
                                class="font-bold ${file.selected
                                  ? "text-slate-100"
                                  : "text-slate-500 line-through decoration-slate-700"} truncate"
                                title="${file.relativePath}"
                              >
                                ${file.name}
                              </p>
                              <p class="text-xs text-slate-500 font-mono mt-0.5">
                                ${this.formatSize(file.file.size)}
                              </p>
                            </div>
                          </div>

                          <div class="flex items-center gap-3 shrink-0 ml-3">
                            <!-- Status Badge -->
                            <div>
                              ${file.status === "pending"
                                ? html`<span
                                    class="px-2.5 py-0.5 ${file.selected
                                      ? "bg-slate-900/80 text-slate-400 border-slate-800"
                                      : "bg-slate-950/80 text-slate-600 border-slate-800"} border rounded-full text-[11px] font-bold tracking-wide transition-colors"
                                    >${activeT.statusPending}</span
                                  >`
                                : ""}
                              ${file.status === "processing"
                                ? html`<span
                                    class="px-2.5 py-0.5 bg-brand-bg text-brand-text border border-brand-border rounded-full text-[11px] font-bold tracking-wide animate-pulse"
                                    >${activeT.statusProcessing}</span
                                  >`
                                : ""}
                              ${file.status === "success"
                                ? html` <span
                                    class="px-2.5 py-0.5 bg-success-bg text-success-text border border-success-border rounded-full text-[11px] font-bold tracking-wide flex items-center gap-1 font-sans shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                                  >
                                    <i class="fa-solid fa-check text-[11px]"></i>
                                    ${activeT.statusSuccess}
                                  </span>`
                                : ""}
                              ${file.status === "error"
                                ? html` <span
                                    class="px-2.5 py-0.5 bg-warning-bg text-warning-text border border-warning-border rounded-full text-[11px] font-bold tracking-wide flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
                                    title="${file.errorMsg || ""}"
                                  >
                                    <i class="fa-solid fa-exclamation text-[11px]"></i>
                                    ${activeT.statusError}
                                  </span>`
                                : ""}
                            </div>

                            <!-- Delete Button (visible on hover) -->
                             <button
                               @click="${(e: Event) => { e.stopPropagation(); this.handleDeleteFile(file, e); }}"
                              ?disabled="${this.isConverting}"
                              class="text-slate-500 hover:text-rose-400 disabled:opacity-20 disabled:hover:text-slate-500 transition-all p-1 md:opacity-0 group-hover/item:opacity-100 focus:opacity-100 outline-none cursor-pointer animate-fade-in"
                              title="${activeT.deleteTooltip}"
                            >
                              <i class="fa-regular fa-trash-can text-xs"></i>
                            </button>
                          </div>
                        </div>
                      `;
                    })}
                  </div>
                `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "file-queue": FileQueue;
  }
}
