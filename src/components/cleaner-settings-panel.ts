import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { CodeCleanMode, BatchFile } from "../types";
import "./folder-tree-view";

@customElement("cleaner-settings-panel")
export class CleanerSettingsPanel extends LitElement {
  @property({ type: String }) lang: "ko" | "en" = "ko";
  @property({ type: Boolean }) apiSupported = false;
  @property({ type: Object }) dirHandle: FileSystemDirectoryHandle | null = null;
  @property({ type: Array }) resourceFiles: BatchFile[] = [];
  @property({ type: Number }) filesCount = 0;
  @property({ type: Boolean }) isScanning = false;
  @property({ type: String }) codeCleanMode: CodeCleanMode = "comment";
  @property({ type: String }) selectedRootSegment = "";

  @state() private isDraggingFolder = false;
  @state() private isSettingsOpen = (() => {
    const saved = localStorage.getItem("pn-batcher-cleaner-settings-open");
    return saved !== "false";
  })();
  @state() private isOptionsOpen = (() => {
    const saved = localStorage.getItem("pn-batcher-cleaner-options-open");
    return saved !== "false";
  })();

  protected override createRenderRoot() {
    return this;
  }

  private handleDetailsToggle(e: Event, key: "settings" | "options" = "settings") {
    e.preventDefault();
    const summary = e.currentTarget as HTMLElement;
    const details = summary.parentElement as HTMLDetailsElement;
    if (!details) return;

    const content = summary.nextElementSibling as HTMLElement;
    if (!content) return;

    if (details.dataset.transitioning === "true") return;

    const storageKey =
      key === "settings"
        ? "pn-batcher-cleaner-settings-open"
        : "pn-batcher-cleaner-options-open";

    if (details.open) {
      details.dataset.transitioning = "true";
      const startHeight = content.scrollHeight;
      content.style.height = `${startHeight}px`;
      content.offsetHeight; // force reflow

      content.style.transition = "height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-out";
      content.style.height = "0px";
      content.style.opacity = "0";

      const onEnd = (event: TransitionEvent) => {
        if (event.propertyName === "height") {
          content.removeEventListener("transitionend", onEnd);
          details.removeAttribute("open");
          content.style.height = "";
          content.style.opacity = "";
          content.style.transition = "";
          delete details.dataset.transitioning;
          if (key === "settings") {
            this.isSettingsOpen = false;
          } else {
            this.isOptionsOpen = false;
          }
          localStorage.setItem(storageKey, "false");
        }
      };
      content.addEventListener("transitionend", onEnd);
    } else {
      details.dataset.transitioning = "true";
      details.setAttribute("open", "");
      const endHeight = content.scrollHeight;

      content.style.height = "0px";
      content.style.opacity = "0";
      content.offsetHeight; // force reflow

      content.style.transition =
        "height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease-out";
      content.style.height = `${endHeight}px`;
      content.style.opacity = "1";

      const onEnd = (event: TransitionEvent) => {
        if (event.propertyName === "height") {
          content.removeEventListener("transitionend", onEnd);
          content.style.height = "";
          content.style.opacity = "";
          content.style.transition = "";
          delete details.dataset.transitioning;
          if (key === "settings") {
            this.isSettingsOpen = true;
          } else {
            this.isOptionsOpen = true;
          }
          localStorage.setItem(storageKey, "true");
        }
      };
      content.addEventListener("transitionend", onEnd);
    }
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (this.isScanning) return;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  private handleDragEnter(e: DragEvent) {
    e.preventDefault();
    if (this.isScanning) return;
    this.isDraggingFolder = true;
  }

  private handleDragLeave(e: DragEvent) {
    e.preventDefault();
    if (this.isScanning) return;
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

  private async scanEntryRecursively(entry: any, path = ""): Promise<File[]> {
    if (!entry) return [];

    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file(
          (file: File) => {
            const relPath = path ? `${path}/${file.name}` : file.name;
            try {
              Object.defineProperty(file, "webkitRelativePath", {
                value: relPath,
                writable: false,
                configurable: true,
              });
            } catch (e) {
              (file as any).customRelativePath = relPath;
            }
            resolve([file]);
          },
          () => resolve([]),
        );
      });
    }

    if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const allEntries: any[] = [];

      const readBatch = (): Promise<any[]> =>
        new Promise((resolve) => {
          dirReader.readEntries(
            (entries: any[]) => resolve(entries || []),
            () => resolve([]),
          );
        });

      let batch: any[];
      do {
        batch = await readBatch();
        allEntries.push(...batch);
      } while (batch.length > 0);

      const currentPath = path ? `${path}/${entry.name}` : entry.name;
      const childPromises = allEntries.map((child) =>
        this.scanEntryRecursively(child, currentPath),
      );
      const childFiles = await Promise.all(childPromises);
      return childFiles.flat();
    }

    return [];
  }

  private async handleDrop(e: DragEvent) {
    e.preventDefault();
    if (this.isScanning) return;
    this.isDraggingFolder = false;

    if (!e.dataTransfer) return;

    const items = e.dataTransfer.items;
    const files = e.dataTransfer.files;

    // 1. Try File System Access API (getAsFileSystemHandle)
    if (items && items.length > 0 && this.apiSupported) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && typeof (item as any).getAsFileSystemHandle === "function") {
          try {
            const handle = await (item as any).getAsFileSystemHandle();
            if (handle && handle.kind === "directory") {
              this.dispatchEvent(
                new CustomEvent("select-folder-handle", {
                  detail: { handle },
                  bubbles: true,
                  composed: true,
                }),
              );
              return;
            }
          } catch (err) {
            console.warn("getAsFileSystemHandle failed, trying webkitGetAsEntry:", err);
          }
        }
      }
    }

    // 2. Fallback: webkitGetAsEntry to recursively extract all files & subfolders
    if (items && items.length > 0) {
      const entryPromises: Promise<File[]>[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && typeof item.webkitGetAsEntry === "function") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entryPromises.push(this.scanEntryRecursively(entry));
          }
        }
      }

      if (entryPromises.length > 0) {
        const fileBatches = await Promise.all(entryPromises);
        const extractedFiles = fileBatches.flat();

        if (extractedFiles.length > 0) {
          this.dispatchEvent(
            new CustomEvent("fallback-upload", {
              detail: { files: extractedFiles },
              bubbles: true,
              composed: true,
            }),
          );
          return;
        }
      }
    }

    // 3. Fallback: standard file list
    if (files && files.length > 0) {
      this.dispatchEvent(
        new CustomEvent("fallback-upload", {
          detail: { files },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private selectMode(mode: CodeCleanMode) {
    this.dispatchEvent(
      new CustomEvent("change-clean-mode", {
        detail: { mode },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleSelectFolderScope(path: string) {
    this.dispatchEvent(
      new CustomEvent("select-root-segment", {
        detail: { segment: path },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const isKo = this.lang === "ko";

    const optionsList: {
      mode: CodeCleanMode;
      labelKo: string;
      labelEn: string;
      descKo: string;
      descEn: string;
      icon: string;
      tagKo: string;
      tagEn: string;
    }[] = [
      {
        mode: "comment",
        labelKo: "미사용 파일 삭제 및 미연결 URL에 주석 추가",
        labelEn: "Delete Unused Files & Note Unlinked URLs",
        descKo:
          "사용하지 않는 파일은 삭제하고 사용하지 않는 코드 옆에 [연결되지 않은 URL] 주석을 추가합니다.",
        descEn:
          "Deletes files that are not used and adds a comment [Unlinked URL] next to unused code.",
        icon: "fa-code",
        tagKo: "추천",
        tagEn: "Recommended",
      },
      {
        mode: "none",
        labelKo: "사용하지 않는 파일만 안전하게 삭제",
        labelEn: "Delete Unused Files Only",
        descKo: "문서 내용은 전혀 수정하지 않고, 사용하지 않은 파일만 제거합니다.",
        descEn: "Keeps document text untouched and only deletes unused files.",
        icon: "fa-shield-halved",
        tagKo: "안전",
        tagEn: "Safe",
      },
      {
        mode: "remove",
        labelKo: "사용하지 않는 파일 및 링크 전부 삭제",
        labelEn: "Remove Unused Links and Files",
        descKo: "사용하지 않는 파일 및 문서 내 연결되지 않은 링크들을 전부 삭제합니다.",
        descEn: "Completely removes unused links and files.",
        icon: "fa-trash-can",
        tagKo: "주의",
        tagEn: "Caution",
      },
    ];

    return html`
      <!-- Card 1: Target Folder & Folder Structure Explorer -->
      <details
        class="group bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-0 mb-4 shadow-xl text-slate-200 overflow-hidden [&_summary::-webkit-details-marker]:hidden"
        ?open="${this.isSettingsOpen}"
      >
        <!-- Panel Header (Summary) -->
        <summary
          class="flex items-center justify-between cursor-pointer select-none p-5 transition-colors hover:bg-slate-800/30 list-none focus:outline-none"
          @click="${this.handleDetailsToggle}"
        >
          <div class="flex items-center space-x-3">
            <div
              class="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-400"
            >
              <i class="fa-solid fa-broom text-lg"></i>
            </div>
            <div>
              <h2 class="font-bold text-slate-100 text-base tracking-wide">
                ${isKo ? "대상 폴더 디렉토리(경로) 설정" : "Target Folder Directory(Path) Setting"}
              </h2>
              <p class="text-xs text-slate-400">
                ${isKo
                  ? "해당 폴더 내 사용하지 않는 파일과 잘못 연결된 링크를 찾아 정리합니다."
                  : "Find and clean unlinked files and broken links in your folder"}
              </p>
            </div>
          </div>
          <button
            class="text-slate-400 hover:text-slate-200 transition-transform duration-200 group-open:rotate-180"
          >
            <i class="fa-solid fa-chevron-down cursor-pointer"></i>
          </button>
        </summary>

        <!-- Collapsible Content Wrapper with Smooth Height & Opacity Animation -->
        <div class="overflow-hidden">
          <div class="px-5 pb-5 pt-2 border-t border-slate-800/80 space-y-4">
            <!-- Folder Selection Area -->
            ${this.dirHandle || this.resourceFiles.length > 0
              ? html`
                  <!-- Compact Folder Status Banner when folder is selected -->
                  <div
                    class="relative border border-slate-800 rounded-xl p-4 bg-slate-950/60 transition-all ${this
                      .isDraggingFolder
                      ? "border-emerald-400 bg-emerald-500/10 scale-[1.01]"
                      : ""}"
                    @dragover="${this.handleDragOver}"
                    @dragenter="${this.handleDragEnter}"
                    @dragleave="${this.handleDragLeave}"
                    @drop="${this.handleDrop}"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div class="flex items-center space-x-3">
                        <div
                          class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shadow-inner"
                        >
                          <i class="fa-solid fa-folder-open text-lg"></i>
                        </div>
                        <div>
                          <div class="flex items-center space-x-2">
                            <span class="text-sm font-bold text-slate-100"
                              >${this.dirHandle
                                ? this.dirHandle.name
                                : this.resourceFiles[0]?.relativePath?.split("/")[0] ||
                                  (isKo ? "선택된 폴더" : "Selected Folder")}</span
                            >
                            <span
                              class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                            >
                              ${isKo ? "폴더 선택됨" : "Folder Selected"}
                            </span>
                          </div>
                          <p class="text-xs text-slate-400 mt-0.5">
                            ${isKo
                              ? `감지된 총 파일: ${this.filesCount}개`
                              : `Detected files: ${this.filesCount}`}
                          </p>
                        </div>
                      </div>

                      <div>
                        ${this.apiSupported
                          ? html`
                              <button
                                @click="${() =>
                                  this.dispatchEvent(
                                    new CustomEvent("select-folder", {
                                      bubbles: true,
                                      composed: true,
                                    }),
                                  )}"
                                class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-200 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer shadow-sm"
                              >
                                <i class="fa-solid fa-folder-plus text-xs"></i>
                                <span>${isKo ? "다른 폴더 선택" : "Change Folder"}</span>
                              </button>
                            `
                          : html`
                              <label
                                class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer shadow-sm"
                              >
                                <i class="fa-solid fa-upload text-xs"></i>
                                <span>${isKo ? "폴더 변경 업로드" : "Change Folder"}</span>
                                <input
                                  type="file"
                                  webkitdirectory
                                  directory
                                  multiple
                                  class="hidden"
                                  @change="${(e: Event) => {
                                    const input = e.target as HTMLInputElement;
                                    if (input.files) {
                                      this.dispatchEvent(
                                        new CustomEvent("fallback-upload", {
                                          detail: { files: input.files },
                                          bubbles: true,
                                          composed: true,
                                        }),
                                      );
                                    }
                                  }}"
                                />
                              </label>
                            `}
                      </div>
                    </div>
                  </div>

                  <!-- Full-width spacious Folder Tree View Component -->
                  <folder-tree-view
                    .files="${this.resourceFiles}"
                    .dirHandle="${this.dirHandle}"
                    .rootName="${this.dirHandle
                      ? this.dirHandle.name
                      : this.resourceFiles[0]?.relativePath?.split("/")[0] || ""}"
                    .selectedPath="${this.selectedRootSegment}"
                    .lang="${this.lang}"
                    @select-folder-scope="${(e: CustomEvent<{ path: string }>) =>
                      this.handleSelectFolderScope(e.detail.path)}"
                  ></folder-tree-view>
                `
              : html`
                  <!-- Initial Large Dropzone Box when no folder is selected -->
                  <div
                    class="relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${this
                      .isDraggingFolder
                      ? "border-emerald-400 bg-emerald-500/10 scale-[1.01]"
                      : "border-slate-700/40 hover:border-slate-600 bg-slate-950/40"}"
                    @dragover="${this.handleDragOver}"
                    @dragenter="${this.handleDragEnter}"
                    @dragleave="${this.handleDragLeave}"
                    @drop="${this.handleDrop}"
                  >
                    <div class="flex flex-col items-center justify-center space-y-3">
                      <div
                        class="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-500/10 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shadow-inner"
                      >
                        <i class="fa-solid fa-folder-open text-2xl"></i>
                      </div>
                      <div>
                        <p class="text-sm font-semibold text-slate-200">
                          ${isKo
                            ? "정리할 대상 폴더를 선택하거나 여기에 드래그 하세요."
                            : "Select or drop folder to scan."}
                        </p>
                        <p class="text-xs text-slate-400 mt-1">
                          ${isKo
                            ? "웹사이트 또는 프로젝트 폴더를 연동하여 검사를 시작합니다."
                            : "Select your project folder to start scanning."}
                        </p>
                      </div>

                      <div class="pt-2">
                        ${this.apiSupported
                          ? html`
                              <button
                                @click="${() =>
                                  this.dispatchEvent(
                                    new CustomEvent("select-folder", {
                                      bubbles: true,
                                      composed: true,
                                    }),
                                  )}"
                                class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all flex items-center space-x-2 cursor-pointer"
                              >
                                <i class="fa-solid fa-folder-plus text-sm"></i>
                                <span>${isKo ? "작업 폴더 선택" : "Select Target Folder"}</span>
                              </button>
                            `
                          : html`
                              <label
                                class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 cursor-pointer transition-all flex items-center space-x-2"
                              >
                                <i class="fa-solid fa-upload text-sm"></i>
                                <span>${isKo ? "작업 폴더 업로드" : "Upload Target Folder"}</span>
                                <input
                                  type="file"
                                  webkitdirectory
                                  directory
                                  multiple
                                  class="hidden"
                                  @change="${(e: Event) => {
                                    const input = e.target as HTMLInputElement;
                                    if (input.files) {
                                      this.dispatchEvent(
                                        new CustomEvent("fallback-upload", {
                                          detail: { files: input.files },
                                          bubbles: true,
                                          composed: true,
                                        }),
                                      );
                                    }
                                  }}"
                                />
                              </label>
                            `}
                      </div>
                    </div>
                  </div>
                `}
          </div>
        </div>
      </details>

      <!-- Card 2: Collapsible Options Card for Cleanup Method Selection -->
      <details
        class="group bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-0 mb-6 shadow-xl text-slate-200 overflow-hidden [&_summary::-webkit-details-marker]:hidden"
        ?open="${this.isOptionsOpen}"
      >
        <!-- Card 2 Header (Summary) -->
        <summary
          class="flex items-center justify-between cursor-pointer select-none p-5 transition-colors hover:bg-slate-800/30 list-none focus:outline-none"
          @click="${(e: Event) => this.handleDetailsToggle(e, "options")}"
        >
          <div class="flex items-center space-x-3">
            <div
              class="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-400"
            >
              <i class="fa-solid fa-sliders text-lg"></i>
            </div>
            <div>
              <h3 class="font-bold text-slate-100 text-base tracking-wide">
                ${isKo ? "정리 방식 선택" : "Cleanup Method"}
              </h3>
              <p class="text-xs text-slate-400">
                ${isKo
                  ? "프로젝트 분석 후 수행할 정리 작업 방식을 선택합니다."
                  : "Select the action strategy to execute after analysis"}
              </p>
            </div>
          </div>
          <button
            class="text-slate-400 hover:text-slate-200 transition-transform duration-200 group-open:rotate-180"
          >
            <i class="fa-solid fa-chevron-down cursor-pointer"></i>
          </button>
        </summary>

        <!-- Card 2 Collapsible Content -->
        <div class="overflow-hidden">
          <div class="px-5 pb-5 pt-2 border-t border-slate-800/80 space-y-2.5">
            ${optionsList.map((opt) => {
              const isSelected = this.codeCleanMode === opt.mode;
              return html`
                <div
                  @click="${() => this.selectMode(opt.mode)}"
                  class="p-3.5 rounded-xl border transition-colors duration-150 cursor-pointer select-none flex items-start space-x-3 ${isSelected
                    ? "bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/50 shadow-md shadow-emerald-950/10 dark:shadow-emerald-950/20"
                    : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950/70"}"
                >
                  <div
                    class="mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-150 ${isSelected
                      ? "border-emerald-600 bg-emerald-600 dark:border-emerald-400 dark:bg-emerald-500 text-white dark:text-slate-950"
                      : "border-slate-700 bg-slate-900 text-transparent"}"
                  >
                    <i class="fa-solid fa-check text-[10px]"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <span
                        class="text-xs font-bold transition-colors duration-150 truncate ${isSelected
                          ? "text-emerald-800 dark:text-emerald-300"
                          : "text-slate-200"}"
                      >
                        <i class="fa-solid ${opt.icon} mr-1.5 opacity-70"></i>
                        ${isKo ? opt.labelKo : opt.labelEn}
                      </span>
                      <span
                        class="px-2 py-0.5 rounded text-[10px] font-bold border transition-colors duration-150 shrink-0 ${isSelected
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30"
                          : "bg-slate-800 text-slate-400 border-transparent"}"
                      >
                        ${isKo ? opt.tagKo : opt.tagEn}
                      </span>
                    </div>
                    <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      ${isKo ? opt.descKo : opt.descEn}
                    </p>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      </details>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cleaner-settings-panel": CleanerSettingsPanel;
  }
}
