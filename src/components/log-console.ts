import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ConversionLog } from "../types";

@customElement("log-console")
export class LogConsole extends LitElement {
  @property({ type: Array }) conversionLogs: ConversionLog[] = [];
  @property({ type: String }) lang: "ko" | "en" = "ko";

  protected override createRenderRoot() {
    return this;
  }

  private handleClearLogs() {
    this.dispatchEvent(new CustomEvent("clear-logs", { bubbles: true, composed: true }));
  }

  protected override render() {
    const title = this.lang === "ko" ? "작업 내역" : "Terminal Logs";
    const clearBtnText = this.lang === "ko" ? "비우기" : "Clear";
    const emptyText =
      this.lang === "ko"
        ? "실행 내역과 처리 상태가 여기에 표시됩니다."
        : "Execution history and status will be displayed here.";

    return html`
      <div class="bg-surface-container-lowest rounded-2xl border border-surface-container-high shadow-xs p-5 sm:p-6 flex flex-col min-h-36 max-h-60">
        <div class="flex items-center justify-between border-b border-surface-container pb-3 mb-3">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary text-base">terminal</span>
            <span class="text-sm font-bold text-on-surface tracking-wide font-sans">${title}</span>
            <!-- Window Control Dots -->
            <div class="flex gap-1.5 mr-1 shrink-0">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            </div>
          </div>
          <button
            @click="${this.handleClearLogs}"
            class="text-xs text-on-surface-variant hover:text-primary transition-colors uppercase tracking-wider font-sans font-bold cursor-pointer"
          >
            ${clearBtnText}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto space-y-1.5 font-mono text-xs pr-1 leading-relaxed">
          ${this.conversionLogs.length === 0
            ? html`
                <div
                  class="h-24 flex items-center justify-center text-on-surface-variant/70 font-sans tracking-wide"
                >
                  ${emptyText}
                </div>
              `
            : this.conversionLogs.map(
                (log) =>
                  html` <div class="flex items-start gap-2">
                    <span class="text-outline shrink-0 font-sans">${log.timestamp}</span>
                    <span
                      class="font-medium ${log.type === "success"
                        ? "text-emerald-600 dark:text-emerald-400 font-bold"
                        : log.type === "error"
                          ? "text-rose-600 dark:text-rose-400 font-bold"
                          : log.type === "warning"
                            ? "text-amber-600 dark:text-amber-400 font-bold"
                            : "text-on-surface"}"
                      >${log.text}</span
                    >
                  </div>`,
              )}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "log-console": LogConsole;
  }
}
