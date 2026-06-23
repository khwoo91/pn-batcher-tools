import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("app-header")
export class AppHeader extends LitElement {
  @property({ type: String }) lang: "ko" | "en" = "ko";
  @state() private dropdownOpen = false;

  protected override createRenderRoot() {
    return this;
  }

  private handleDocumentClick = (e: MouseEvent) => {
    const path = e.composedPath();
    const isClickInside = path.some(
      (el) => el instanceof HTMLElement && el.classList.contains("custom-dropdown-container")
    );
    if (!isClickInside) {
      this.dropdownOpen = false;
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.handleDocumentClick);
  }

  override disconnectedCallback() {
    document.removeEventListener("click", this.handleDocumentClick);
    super.disconnectedCallback();
  }

  private selectLanguage(lang: "ko" | "en") {
    this.dropdownOpen = false;
    this.dispatchEvent(
      new CustomEvent("change-lang", {
        detail: lang,
        bubbles: true,
        composed: true,
      })
    );
  }

  protected override render() {
    const desc = this.lang === "ko"
      ? "SVG 이미지 배율 변환 및 WAV 오디오 MP3 대량 변환 도구"
      : "Bulk SVG image scale converter and WAV audio MP3 converter";

    return html`
      <header class="flex flex-col md:flex-row items-center justify-between border-b border-white/5 pb-6 mb-8 gap-4">
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-14 h-14 animate-logo-float">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="w-full h-full">
              <defs>
                <linearGradient id="header-primary-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#6366f1" />
                  <stop offset="100%" stop-color="#4f46e5" />
                </linearGradient>
                <linearGradient id="header-accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#a855f7" />
                  <stop offset="100%" stop-color="#6366f1" />
                </linearGradient>
                <linearGradient id="header-emerald-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#34d399" />
                  <stop offset="100%" stop-color="#059669" />
                </linearGradient>
                <filter id="header-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
      
              <!-- Stack Layer 3 (Background) -->
              <rect x="10" y="4" width="16" height="16" rx="4" fill="#1e293b" stroke="#334155" stroke-width="1.2"
                opacity="0.4" transform="rotate(-6 18 12)" />
      
              <!-- Stack Layer 2 (Middle) -->
              <rect x="8" y="6" width="16" height="16" rx="4" fill="url(#header-accent-grad)" stroke="#ffffff"
                stroke-width="0.8" stroke-opacity="0.15" opacity="0.8" transform="rotate(3 16 14)" />
      
              <!-- Stack Layer 1 (Foreground/Main) -->
              <g transform="translate(4, 8)">
                <rect x="0" y="0" width="18" height="18" rx="4.5" fill="url(#header-primary-grad)" stroke="#ffffff"
                  stroke-width="1" stroke-opacity="0.25" filter="url(#header-glow)" />
                <path d="M3 14 L7.5 8.5 L11 12.5 L13 10 L15.5 14 Z" fill="#ffffff" fill-opacity="0.95" />
                <circle cx="12.5" cy="5.5" r="2" fill="#34d399" />
              </g>
      
              <!-- Export Dynamic Arrow -->
              <path d="M21 17 L27 17 L27 23 M27 17 L18 26" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"
                stroke-linejoin="round" filter="url(#header-glow)" />
            </svg>
          </div>
          <div>
            <h1 class="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-linear-to-r from-white via-slate-100 to-indigo-200 flex items-center gap-2 font-sans">
              Batcher
            </h1>
            <p class="text-xs text-slate-400 font-medium tracking-wide">
              ${desc}
            </p>
          </div>
        </div>
        
        <div class="flex items-center gap-3 self-end md:self-center">
          <!-- Language Selector dropdown -->
          <div class="relative inline-block text-left w-[130px] custom-dropdown-container">
            <button
              @click="${() => this.dropdownOpen = !this.dropdownOpen}"
              class="flex items-center justify-start w-full pl-9 pr-8 py-2.5 bg-slate-950/60 backdrop-blur-xl border border-white/5 hover:border-indigo-500/30 hover:bg-slate-900/60 text-slate-200 rounded-xl text-xs cursor-pointer focus:outline-none transition-all font-sans font-medium shadow-sm hover:shadow-[0_0_15px_rgba(99,102,241,0.1)] focus:border-indigo-500 select-none relative"
            >
              <div class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <i class="fa-solid fa-globe text-xs"></i>
              </div>
              <span>${this.lang === "ko" ? "한국어" : "English"}</span>
              <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-[10px]">
                <i class="fa-solid fa-chevron-down transition-transform duration-200 ${this.dropdownOpen ? 'rotate-180' : ''}"></i>
              </div>
            </button>

            <!-- Custom Dropdown Menu -->
            ${this.dropdownOpen
              ? html`
                  <div
                    class="absolute right-0 mt-2 w-full bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.5)] z-50 py-1.5 focus:outline-none animate-fade-in font-sans"
                  >
                    <button
                      @click="${() => this.selectLanguage("ko")}"
                      class="w-full pl-9 pr-3 py-2 text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${this.lang === "ko" ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-300 hover:bg-slate-800/40 hover:text-white'}"
                    >
                      <span>한국어</span>
                      <div class="w-3.5 flex items-center justify-center shrink-0">
                        ${this.lang === "ko"
                          ? html`<i class="fa-solid fa-check text-indigo-400 text-[10px]"></i>`
                          : ""}
                      </div>
                    </button>
                    <button
                      @click="${() => this.selectLanguage("en")}"
                      class="w-full pl-9 pr-3 py-2 text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${this.lang === "en" ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-300 hover:bg-slate-800/40 hover:text-white'}"
                    >
                      <span>English</span>
                      <div class="w-3.5 flex items-center justify-center shrink-0">
                        ${this.lang === "en"
                          ? html`<i class="fa-solid fa-check text-indigo-400 text-[10px]"></i>`
                          : ""}
                      </div>
                    </button>
                  </div>
                `
              : ""}
          </div>
        </div>
      </header>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-header": AppHeader;
  }
}
