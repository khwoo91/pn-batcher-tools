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
    this.dispatchEvent(
      new CustomEvent("clear-logs", { bubbles: true, composed: true }),
    );
  }

  protected override render() {
    const title = this.lang === "ko" ? "작업 내역" : "Terminal Logs";
    const clearBtnText = this.lang === "ko" ? "비우기" : "Clear";
    const emptyText = this.lang === "ko"
      ? "실행 내역과 처리 상태가 여기에 표시됩니다."
      : "Execution history and status will be displayed here.";

    return html`
      <div
        class="glass-panel rounded-3xl p-6 shadow-xl flex flex-col h-70">
        <div class="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
          <div class="flex items-center gap-3">
          <i class="fa-solid fa-terminal text-indigo-400 text-xs"></i>
          <span class="text-sm font-bold text-white tracking-wide font-sans">${title}</span>
          <!-- Window Control Dots -->
          <div class="flex gap-1.5 mr-1 shrink-0">
            <span class="w-2.5 h-2.5 rounded-full bg-rose-500/50"></span>
            <span class="w-2.5 h-2.5 rounded-full bg-amber-500/50"></span>
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/50"></span>
          </div>
        </div>
          <button
            @click="${this.handleClearLogs}"
            class="text-[12px] text-slate-500 hover:text-indigo-400 transition-colors uppercase tracking-widest font-sans font-bold cursor-pointer">
            ${clearBtnText}
          </button>
        </div>

        <div
          class="flex-1 overflow-y-auto space-y-1.5 font-mono text-[10px] pr-1 leading-relaxed"
        >
          ${this.conversionLogs.length === 0
        ? html`
                <div class="h-full flex items-center justify-center text-slate-600 font-sans tracking-wide">
                  ${emptyText}
                </div>
              `
        : this.conversionLogs.map(
          (log) => html`
                  <div class="flex items-start gap-2">
                    <span class="text-slate-600 shrink-0 font-sans">${log.timestamp}</span>
                    <span
                      class="font-bold ${log.type === "success"
              ? "text-emerald-400"
              : log.type === "error"
                ? "text-rose-400"
                : log.type === "warning"
                  ? "text-amber-400"
                  : "text-slate-300"}">${log.text}</span>
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
