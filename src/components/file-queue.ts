import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SvgFile } from "../types";

@customElement("file-queue")
export class FileQueue extends LitElement {
  @property({ type: Array }) svgFiles: SvgFile[] = [];
  @property({ type: Boolean }) isConverting = false;

  protected override createRenderRoot() {
    return this;
  }

  private handleToggleFile(file: SvgFile, e: Event) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("toggle-file-selected", {
        detail: file,
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleToggleAll(e: Event) {
    const target = e.target as HTMLInputElement;
    this.dispatchEvent(
      new CustomEvent("toggle-all-files", {
        detail: target.checked,
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleDeleteFile(file: SvgFile, e: Event) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("delete-file", {
        detail: file,
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleKeyDown(file: SvgFile, e: KeyboardEvent) {
    if (this.isConverting) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.dispatchEvent(
        new CustomEvent("delete-file", {
          detail: file,
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  protected override render() {
    const allSelected = this.svgFiles.length > 0 && this.svgFiles.every(f => f.selected);
    const someSelected = this.svgFiles.length > 0 && this.svgFiles.some(f => f.selected) && !allSelected;

    return html`
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-100">
        <div class="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center h-5">
              <input
                type="checkbox"
                .checked="${allSelected}"
                .indeterminate="${someSelected}"
                ?disabled="${this.isConverting || this.svgFiles.length === 0}"
                @change="${this.handleToggleAll}"
                class="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="전체 선택 / 해제"/>
            </div>
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-list-ul text-indigo-400"></i>
              <span class="text-md font-semibold text-white font-sans">파일 리스트 (${this.svgFiles.length}개)</span>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto space-y-2 pr-1">
          ${this.svgFiles.length === 0
            ? html`
                <div
                  class="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 py-10"
                >
                  <i class="fa-solid fa-images text-4xl text-slate-700"></i>
                  <p class="text-sm">
                    대기열이 비어 있습니다. 대상 로컬 SVG 폴더를 연동해 주세요.
                  </p>
                </div>
              `
            : this.svgFiles.map(
                (file) => html`
                  <div
                    class="flex items-center justify-between p-3 bg-slate-950 hover:bg-slate-900/40 rounded-xl border border-slate-800 focus-within:border-indigo-500 hover:border-slate-700/60 focus:border-indigo-500 focus:outline-none transition-all text-xs group/item outline-none cursor-pointer"
                    tabindex="0"
                    @keydown="${(e: KeyboardEvent) => this.handleKeyDown(file, e)}">
                    <div class="flex items-center gap-3 min-w-0 font-sans flex-1">
                      <!-- Checkbox -->
                      <div class="flex items-center justify-center shrink-0">
                        <input
                          type="checkbox"
                          .checked="${file.selected ?? false}"
                          ?disabled="${this.isConverting}"
                          @change="${(e: Event) => this.handleToggleFile(file, e)}"
                          class="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-800 focus:ring-indigo-500 focus:ring-offset-slate-950 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                          @click="${(e: Event) => e.stopPropagation()}"
                        />
                      </div>

                      <i class="fa-regular fa-file-image ${file.selected ? 'text-indigo-400' : 'text-slate-600'} text-lg shrink-0 transition-colors"></i>
                      <div class="min-w-0 flex-1">
                        <p class="font-medium ${file.selected ? 'text-slate-200' : 'text-slate-500 line-through decoration-slate-700'} truncate" title="${file.relativePath}">${file.name}</p>
                        <p class="text-[10px] text-slate-500 font-mono">${(file.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>

                    <div class="flex items-center gap-3 shrink-0 ml-3">
                      <!-- Status Badge -->
                      <div>
                        ${file.status === "pending"
                          ? html`
                              <span class="px-2.5 py-1 ${file.selected ? 'bg-slate-900 text-slate-400 border-slate-800' : 'bg-slate-950 text-slate-600 border-slate-900'} border rounded-full text-[10px] font-semibold transition-colors">대기 중</span>`
                          : ""}
                        ${file.status === "processing"
                          ? html`
                              <span class="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-[10px] font-semibold animate-pulse">렌더링 중</span>`
                          : ""}
                        ${file.status === "success"
                          ? html`
                              <span class="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-semibold flex items-center gap-1 font-sans">
                                <i class="fa-solid fa-check text-[9px]"></i> 완료됨
                              </span>`
                          : ""}
                        ${file.status === "error"
                          ? html`
                              <span class="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full text-[10px] font-semibold flex items-center gap-1" title="${file.errorMsg || ""}">
                                <i class="fa-solid fa-exclamation text-[9px]"></i> 에러
                              </span>`
                          : ""}
                      </div>

                      <!-- Delete Button (visible on hover) -->
                      <button
                        @click="${(e: Event) => this.handleDeleteFile(file, e)}"
                        ?disabled="${this.isConverting}"
                        class="text-slate-600 hover:text-rose-400 disabled:opacity-20 disabled:hover:text-slate-600 transition-all p-1 md:opacity-0 group-hover/item:opacity-100 focus:opacity-100 outline-none cursor-pointer animate-fade-in"
                        title="대기열에서 삭제 (Del 키)">
                        <i class="fa-regular fa-trash-can text-sm"></i>
                      </button>
                    </div>
                  </div>
                `
              )}
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
