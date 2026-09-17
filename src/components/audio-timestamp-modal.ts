import { LitElement, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { AudioClipItem } from "../types";
import { generateSmilXml, generateJsonData } from "../utils/audio-duration-utils";

@customElement("audio-timestamp-modal")
export class AudioTimestampModal extends LitElement {
  @property({ type: Boolean }) show = false;
  @property({ type: Array }) items: AudioClipItem[] = [];
  @property({ type: String }) lang: "ko" | "en" = "ko";

  @state() private activeTab: "table" | "smil" | "json" = "table";
  @state() private copiedToast = false;

  protected override createRenderRoot() {
    return this;
  }

  override updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("show")) {
      if (this.show) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
    }
  }

  override disconnectedCallback() {
    document.body.style.overflow = "";
    super.disconnectedCallback();
  }

  private handleClose() {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  private async handleCopyContent() {
    let contentToCopy = "";
    if (this.activeTab === "json") {
      contentToCopy = generateJsonData(this.items);
    } else if (this.activeTab === "smil") {
      contentToCopy = generateSmilXml(this.items);
    } else {
      // Default: SMIL Tags list
      contentToCopy = this.items.map((item) => item.smilTag).join("\n");
    }

    try {
      await navigator.clipboard.writeText(contentToCopy);
      this.copiedToast = true;
      setTimeout(() => {
        this.copiedToast = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  private handleDownloadSmil() {
    const xmlContent = generateSmilXml(this.items);
    const blob = new Blob([xmlContent], { type: "application/smil+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audio-clips-${Date.now()}.smil`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private handleDownloadJson() {
    const jsonContent = generateJsonData(this.items);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audio-clips-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  protected override render() {
    if (!this.show) return html``;

    const isKo = this.lang === "ko";
    const totalDurationSec = this.items.reduce((acc, item) => acc + item.durationSec, 0);
    const smilContent = generateSmilXml(this.items);
    const jsonContent = generateJsonData(this.items);

    return html`
      <div
        class="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6"
      >
        <div
          class="bg-surface-container-lowest rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-surface-container text-on-surface"
        >
          <!-- Header -->
          <div
            class="px-6 py-5 bg-surface-container-lowest border-b border-surface-container flex items-center justify-between shrink-0"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 text-lg shadow-2xs"
              >
                <i class="fa-solid fa-stopwatch"></i>
              </div>
              <div>
                <h3 class="text-base font-extrabold text-on-surface font-sans tracking-tight">
                  ${isKo
                    ? "오디오 타임스탬프 (clipBegin / clipEnd) 추출 결과"
                    : "Audio Timestamps (clipBegin / clipEnd) Extracted"}
                </h3>
                <p class="text-xs text-on-surface-variant font-sans mt-0.5 font-medium">
                  ${isKo
                    ? `총 ${this.items.length}개 파일 (전체 길이: ${totalDurationSec.toFixed(2)}초)`
                    : `Total ${this.items.length} files (Total duration: ${totalDurationSec.toFixed(2)}s)`}
                </p>
              </div>
            </div>
            <button
              @click="${this.handleClose}"
              class="w-8 h-8 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
            >
              <i class="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>

          <!-- Tab Bar & Action Toolbar -->
          <div
            class="px-6 py-3.5 bg-surface-container-lowest border-b border-surface-container flex flex-wrap items-center justify-between gap-3 shrink-0"
          >
            <!-- Tabs -->
            <div class="flex bg-surface-container-low p-1 rounded-xl border border-surface-container">
              <button
                @click="${() => (this.activeTab = "table")}"
                class="px-4 py-1.5 rounded-lg text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${this
                  .activeTab === "table"
                  ? "bg-primary text-on-primary shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-bold"}"
              >
                <i class="fa-solid fa-table-list text-xs"></i>
                <span>${isKo ? "목록 테이블" : "Table View"}</span>
              </button>
              <button
                @click="${() => (this.activeTab = "smil")}"
                class="px-4 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${this
                  .activeTab === "smil"
                  ? "bg-primary text-on-primary shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-bold"}"
              >
                <i class="fa-solid fa-code text-xs"></i>
                <span>SMIL / XML</span>
              </button>
              <button
                @click="${() => (this.activeTab = "json")}"
                class="px-4 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${this
                  .activeTab === "json"
                  ? "bg-primary text-on-primary shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-bold"}"
              >
                <i class="fa-solid fa-file-code text-xs"></i>
                <span>JSON</span>
              </button>
            </div>

            <!-- Top Download & Copy Actions -->
            <div class="flex items-center gap-2">
              <button
                @click="${this.handleCopyContent}"
                class="px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary rounded-xl text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
              >
                ${this.copiedToast
                  ? html`<i class="fa-solid fa-check text-xs"></i>
                      <span>${isKo ? "복사 완료!" : "Copied!"}</span>`
                  : html`<i class="fa-regular fa-copy text-xs"></i>
                      <span>${isKo ? "복사" : "Copy"}</span>`}
              </button>

              <button
                @click="${this.handleDownloadSmil}"
                class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
              >
                <i class="fa-solid fa-file-code text-xs"></i>
                <span>${isKo ? "SMIL 다운로드" : "Download .smil"}</span>
              </button>

              <button
                @click="${this.handleDownloadJson}"
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold font-sans transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
              >
                <i class="fa-solid fa-file-arrow-down text-xs"></i>
                <span>${isKo ? "JSON 다운로드" : "Download .json"}</span>
              </button>
            </div>
          </div>

          <!-- Main Content Body (Unified Fixed Height) -->
          <div class="p-6 font-sans bg-surface-container-lowest">
            <div
              class="h-105 overflow-y-auto rounded-2xl border border-surface-container bg-surface-container-low shadow-inner"
            >
              ${this.activeTab === "table"
                ? html`
                    <table class="w-full text-left text-xs text-on-surface border-collapse">
                      <thead
                        class="sticky top-0 bg-surface-container-low text-on-surface font-extrabold border-b border-surface-container z-10 shadow-2xs"
                      >
                        <tr>
                          <th class="py-3.5 px-4 whitespace-nowrap text-on-surface-variant">#</th>
                          <th class="py-3.5 px-4 whitespace-nowrap text-on-surface">
                            ${isKo ? "파일명" : "File Name"}
                          </th>
                          <th class="py-3.5 px-4 whitespace-nowrap text-emerald-600 dark:text-emerald-400 font-extrabold">
                            ${isKo ? "길이 (초)" : "Duration"}
                          </th>
                          <th
                            class="py-3.5 px-4 whitespace-nowrap font-mono text-sky-600 dark:text-sky-400 font-extrabold"
                          >
                            clipBegin
                          </th>
                          <th
                            class="py-3.5 px-4 whitespace-nowrap font-mono text-pink-600 dark:text-pink-400 font-extrabold"
                          >
                            clipEnd
                          </th>
                          <th class="py-3.5 px-4 whitespace-nowrap text-on-surface">
                            ${isKo ? "SMIL 태그" : "SMIL Tag"}
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-surface-container font-mono">
                        ${this.items.map(
                          (item, index) => html`
                            <tr class="hover:bg-surface-container/50 transition-colors">
                              <td class="py-3 px-4 whitespace-nowrap text-on-surface-variant font-sans">
                                ${index + 1}
                              </td>
                              <td
                                class="py-3 px-4 whitespace-nowrap font-sans font-extrabold text-on-surface max-w-xs truncate"
                                title="${item.relativePath}"
                              >
                                ${item.name}
                              </td>
                              <td
                                class="py-3 px-4 whitespace-nowrap text-emerald-600 dark:text-emerald-400 font-extrabold"
                              >
                                ${item.durationSec.toFixed(3)}s
                              </td>
                              <td class="py-3 px-4 whitespace-nowrap text-sky-600 dark:text-sky-300 font-bold">
                                ${item.clipBegin}
                              </td>
                              <td class="py-3 px-4 whitespace-nowrap text-pink-600 dark:text-pink-300 font-bold">
                                ${item.clipEnd}
                              </td>
                              <td
                                class="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-on-surface-variant font-semibold select-all"
                              >
                                ${item.smilTag}
                              </td>
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  `
                : ""}
              ${this.activeTab === "smil"
                ? html`
                    <pre
                      class="p-4 text-xs font-mono text-sky-600 dark:text-sky-300 leading-relaxed select-all"
                    ><code>${smilContent}</code></pre>
                  `
                : ""}
              ${this.activeTab === "json"
                ? html`
                    <pre
                      class="p-4 text-xs font-mono text-pink-600 dark:text-pink-300 leading-relaxed select-all"
                    ><code>${jsonContent}</code></pre>
                  `
                : ""}
            </div>
          </div>

          <!-- Footer -->
          <div
            class="bg-surface-container-lowest px-6 py-4 flex items-center justify-between border-t border-surface-container shrink-0"
          >
            <div class="text-xs text-on-surface-variant font-sans font-medium flex items-center gap-1.5">
              <i class="fa-solid fa-circle-info text-primary"></i>
              <span
                >${isKo
                  ? "브라우저 로컬 메모리에서 100% 안전하게 분석되었습니다."
                  : "Processed 100% locally in browser memory."}</span
              >
            </div>
            <button
              @click="${this.handleClose}"
              class="px-6 py-2.5 bg-primary hover:bg-primary/90 text-on-primary rounded-xl text-xs font-extrabold shadow-xs active:scale-95 transition-all cursor-pointer font-sans flex items-center gap-1.5"
            >
              ${isKo ? "닫기" : "Close"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "audio-timestamp-modal": AudioTimestampModal;
  }
}
