import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("alert-modal")
export class AlertModal extends LitElement {
  @property({ type: String }) message = "";
  @property({ type: String }) type: "info" | "success" | "error" = "info";
  @property({ type: Boolean }) show = false;

  protected override createRenderRoot() {
    return this;
  }

  private handleClose() {
    this.dispatchEvent(
      new CustomEvent("close", { bubbles: true, composed: true }),
    );
  }

  protected override render() {
    if (!this.show) return html``;

    return html`
      <div
        class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
      >
        <div
          class="glass-panel rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-white/10"
        >
          <div class="p-6">
            <div class="flex items-center gap-4 mb-4">
              <div
                class="p-3 rounded-2xl shrink-0 ${this.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : this.type === "error"
                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"}"
              >
                ${this.type === "success"
                  ? html`<i class="fa-solid fa-circle-check text-2xl"></i>`
                  : ""}
                ${this.type === "error"
                  ? html`<i
                      class="fa-solid fa-circle-exclamation text-2xl"
                    ></i>`
                  : ""}
                ${this.type === "info"
                  ? html`<i class="fa-solid fa-circle-info text-2xl"></i>`
                  : ""}
              </div>
              <h3 class="text-md font-bold text-white tracking-wide">알림 메시지</h3>
            </div>
            <div
              class="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans font-medium"
            >
              ${this.message}
            </div>
          </div>
          <div class="bg-slate-950/50 px-6 py-4 flex justify-end border-t border-white/5">
            <button
              @click="${this.handleClose}"
              class="px-6 py-2.5 bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] active:scale-95 transition-all cursor-pointer font-sans"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "alert-modal": AlertModal;
  }
}
