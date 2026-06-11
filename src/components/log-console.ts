import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ConversionLog } from "../types";

@customElement("log-console")
export class LogConsole extends LitElement {
  @property({ type: Array }) conversionLogs: ConversionLog[] = [];

  protected override createRenderRoot() {
    return this;
  }

  private handleClearLogs() {
    this.dispatchEvent(
      new CustomEvent("clear-logs", { bubbles: true, composed: true }),
    );
  }

  protected override render() {
    return html`
      <div
        class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-70">
        <div class="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-terminal text-indigo-400"></i>
            <span class="text-md font-semibold text-white font-sans">작업 내역</span>
          </div>
          <button
            @click="${this.handleClearLogs}"
            class="text-[10px] text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wider font-sans">
            비우기
          </button>
        </div>

        <div
          class="flex-1 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1"
        >
          ${this.conversionLogs.length === 0
            ? html`
                <div class="h-full flex items-center justify-center text-slate-600">
                  실행 내역과 처리 상태가 여기에 표시됩니다.
                </div>
              `
            : this.conversionLogs.map(
                (log) => html`
                  <div class="flex items-start gap-2 leading-relaxed">
                    <span class="text-slate-600 shrink-0">${log.timestamp}</span>
                    <span
                      class="font-semibold ${log.type === "success"
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
