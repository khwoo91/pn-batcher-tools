import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SvgFile } from "../types";

import { locales } from "../locales";

const t = {
  ko: locales.ko.queue,
  en: locales.en.queue,
};

@customElement("file-queue")
export class FileQueue extends LitElement {
  @property({ type: Array }) svgFiles: SvgFile[] = [];
  @property({ type: Boolean }) isConverting = false;
  @property({ type: String }) lang: "ko" | "en" = "ko";

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
    const activeT = t[this.lang];
    const allSelected = this.svgFiles.length > 0 && this.svgFiles.every(f => f.selected);
    const someSelected = this.svgFiles.length > 0 && this.svgFiles.some(f => f.selected) && !allSelected;

    return html`
      <div class="glass-panel rounded-3xl p-6 shadow-xl flex flex-col h-100">
        <div class="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center h-5">
              <input
                type="checkbox"
                .checked="${allSelected}"
                .indeterminate="${someSelected}"
                ?disabled="${this.isConverting || this.svgFiles.length === 0}"
                @change="${this.handleToggleAll}"
                class="w-4.5 h-4.5 rounded text-indigo-600 bg-slate-950 border-white/5 focus:ring-indigo-500 focus:ring-offset-slate-950 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="${activeT.selectAll}"/>
            </div>
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-list-ul text-indigo-400 text-sm"></i>
              <span class="text-sm font-bold text-white font-sans tracking-wide">${activeT.fileList(this.svgFiles.length)}</span>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto space-y-2 pr-1">
          ${this.svgFiles.length === 0
        ? html`
                <div
                  class="h-full flex flex-col items-center justify-center text-slate-500 space-y-3 py-10"
                >
                  <i class="fa-solid fa-images text-4xl text-slate-700"></i>
                  <p class="text-xs font-semibold tracking-wide">
                    ${activeT.emptyQueue}
                  </p>
                </div>
              `
        : this.svgFiles.map(
          (file) => html`
                  <div
                    class="flex items-center justify-between p-3 bg-slate-950/40 hover:bg-slate-900/60 rounded-xl border border-white/5 focus-within:border-indigo-500/50 hover:border-white/10 focus-within:shadow-[0_0_15px_rgba(99,102,241,0.08)] transition-all text-xs group/item outline-none cursor-pointer"
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
                          class="w-4.5 h-4.5 rounded text-indigo-600 bg-slate-950 border-white/5 focus:ring-indigo-500 focus:ring-offset-slate-950 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                          @click="${(e: Event) => e.stopPropagation()}"
                        />
                      </div>

                      <i class="fa-regular fa-file-image ${file.selected ? 'text-indigo-400' : 'text-slate-600'} text-lg shrink-0 transition-colors"></i>
                      <div class="min-w-0 flex-1">
                        <p class="font-bold ${file.selected ? 'text-slate-200' : 'text-slate-500 line-through decoration-slate-700'} truncate" title="${file.relativePath}">${file.name}</p>
                        <p class="text-[10px] text-slate-500 font-mono mt-0.5">${(file.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>

                    <div class="flex items-center gap-3 shrink-0 ml-3">
                      <!-- Status Badge -->
                      <div>
                        ${file.status === "pending"
              ? html`
                              <span class="px-2.5 py-0.5 ${file.selected ? 'bg-slate-900/80 text-slate-400 border-white/5' : 'bg-slate-950/80 text-slate-600 border-white/5'} border rounded-full text-[9px] font-bold tracking-wide transition-colors">${activeT.statusPending}</span>`
              : ""}
                        ${file.status === "processing"
              ? html`
                              <span class="px-2.5 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full text-[9px] font-bold tracking-wide animate-pulse">${activeT.statusProcessing}</span>`
              : ""}
                        ${file.status === "success"
              ? html`
                              <span class="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-full text-[9px] font-bold tracking-wide flex items-center gap-1 font-sans shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                <i class="fa-solid fa-check text-[9px]"></i> ${activeT.statusSuccess}
                              </span>`
              : ""}
                        ${file.status === "error"
              ? html`
                              <span class="px-2.5 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded-full text-[9px] font-bold tracking-wide flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.1)]" title="${file.errorMsg || ""}">
                                <i class="fa-solid fa-exclamation text-[9px]"></i> ${activeT.statusError}
                              </span>`
              : ""}
                      </div>

                      <!-- Delete Button (visible on hover) -->
                      <button
                        @click="${(e: Event) => this.handleDeleteFile(file, e)}"
                        ?disabled="${this.isConverting}"
                        class="text-slate-500 hover:text-rose-400 disabled:opacity-20 disabled:hover:text-slate-500 transition-all p-1 md:opacity-0 group-hover/item:opacity-100 focus:opacity-100 outline-none cursor-pointer animate-fade-in"
                        title="${activeT.deleteTooltip}">
                        <i class="fa-regular fa-trash-can text-xs"></i>
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
