import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("app-header")
export class AppHeader extends LitElement {
  @property({ type: String }) lang: "ko" | "en" = "ko";
  @state() private dropdownOpen = false;
  @state() private isDark = true;

  protected override createRenderRoot() {
    return this;
  }

  private handleDocumentClick = (e: MouseEvent) => {
    const path = e.composedPath();
    const isClickInside = path.some(
      (el) => el instanceof HTMLElement && el.classList.contains("custom-dropdown-container"),
    );
    if (!isClickInside && this.dropdownOpen) {
      this.dropdownOpen = false;
    }
  };

  private handleExternalLangChange = (e: Event) => {
    const customEvent = e as CustomEvent<"ko" | "en">;
    if (customEvent.detail && (customEvent.detail === "ko" || customEvent.detail === "en")) {
      if (this.lang !== customEvent.detail) {
        this.lang = customEvent.detail;
      }
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.handleDocumentClick);
    window.addEventListener("change-lang", this.handleExternalLangChange);

    // Initialize lang from localStorage or data-current-lang
    const savedLang = localStorage.getItem("batcher-lang");
    if (savedLang === "en" || savedLang === "ko") {
      this.lang = savedLang as "ko" | "en";
    } else {
      const docLang = document.documentElement.getAttribute("data-current-lang");
      if (docLang === "en" || docLang === "ko") {
        this.lang = docLang as "ko" | "en";
      }
    }

    // Initialize theme before first render to prevent double-update warning
    // Default to light unless user explicitly chose dark
    const savedTheme = localStorage.getItem("batcher-theme");
    const shouldBeDark = savedTheme === "dark";

    this.isDark = shouldBeDark;
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  }

  override disconnectedCallback() {
    document.removeEventListener("click", this.handleDocumentClick);
    window.removeEventListener("change-lang", this.handleExternalLangChange);
    super.disconnectedCallback();
  }

  private toggleTheme() {
    this.isDark = !this.isDark;
    if (this.isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      localStorage.setItem("batcher-theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("batcher-theme", "light");
    }
  }

  private selectLanguage(lang: "ko" | "en") {
    this.dropdownOpen = false;
    this.lang = lang;
    localStorage.setItem("batcher-lang", lang);
    document.documentElement.setAttribute("data-current-lang", lang);
    document.documentElement.lang = lang;
    window.dispatchEvent(
      new CustomEvent("change-lang", {
        detail: lang,
        bubbles: true,
        composed: true,
      }),
    );
    this.dispatchEvent(
      new CustomEvent("change-lang", {
        detail: lang,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleSupportClick(e: MouseEvent) {
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent("open-support", {
        bubbles: true,
        composed: true,
      }),
    );
    this.dispatchEvent(
      new CustomEvent("open-support", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected override render() {
    const desc = this.lang === "ko" ? "금융권 수준 안심 로컬 파일 변환 툴" : "100% Safe Local File Processor";

    return html`
      <header
        class="relative z-50 w-full bg-surface-container-lowest/90 backdrop-blur-xl rounded-3xl p-4 sm:px-6 shadow-sm border border-outline-variant/20 mb-8 transition-all"
      >
        <div class="flex items-center justify-between gap-4 w-full">
          <!-- Logo & Trust Badge -->
          <div class="flex items-center gap-3 sm:gap-4 shrink-0">
            <a href="/" class="flex items-center gap-2.5 sm:gap-3 group select-none shrink-0">
              <div
                class="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-primary flex items-center justify-center shadow-md shadow-primary/25 group-hover:scale-95 transition-transform shrink-0"
              >
                <span class="material-symbols-outlined text-white text-[22px] sm:text-[24px]">account_balance_wallet</span>
              </div>
              <div class="flex flex-col">
                <div class="font-title-md text-title-md text-on-surface tracking-tight font-extrabold flex items-center gap-1 whitespace-nowrap">
                  배처 <span class="text-primary font-black">Batcher</span>
                </div>
                <p class="text-[11px] text-on-surface-variant font-medium whitespace-nowrap">${desc}</p>
              </div>
            </a>

            <div
              class="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/25 whitespace-nowrap shrink-0"
            >
              <span class="material-symbols-outlined text-primary text-[16px] shrink-0">verified_user</span>
              <span class="text-xs text-on-surface-variant font-medium whitespace-nowrap">
                ${this.lang === "ko" ? "100% 브라우저 로컬 안전 처리" : "100% Browser Local Safe"}
              </span>
            </div>
          </div>

          <!-- Navigation & Quick Actions -->
          <div class="flex items-center gap-2 sm:gap-3 justify-end shrink-0">
            <!-- Nav Links -->
            <nav class="hidden lg:flex items-center gap-1 text-xs font-semibold text-on-surface-variant shrink-0">
              <a
                href="/svg-to-png.html"
                class="hover:text-primary hover:bg-surface-container-low px-2 sm:px-2.5 py-1.5 rounded-xl transition-colors whitespace-nowrap"
              >
                ${this.lang === "ko" ? "SVG 변환기" : "SVG Converter"}
              </a>
              <a
                href="/wav-to-mp3.html"
                class="hover:text-primary hover:bg-surface-container-low px-2 sm:px-2.5 py-1.5 rounded-xl transition-colors whitespace-nowrap"
              >
                ${this.lang === "ko" ? "오디오 변환기" : "Audio Converter"}
              </a>
              <a
                href="/batch-rename.html"
                class="hover:text-primary hover:bg-surface-container-low px-2 sm:px-2.5 py-1.5 rounded-xl transition-colors whitespace-nowrap"
              >
                ${this.lang === "ko" ? "대량 이름 바꾸기" : "Batch Rename"}
              </a>
              <a
                href="/guides/index.html"
                class="hover:text-primary hover:bg-surface-container-low px-2 sm:px-2.5 py-1.5 rounded-xl transition-colors whitespace-nowrap"
              >
                ${this.lang === "ko" ? "가이드" : "Guides"}
              </a>
            </nav>

            <!-- Support Button -->
            <button
              @click="${this.handleSupportClick}"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              title="${this.lang === "ko" ? "따뜻한 커피 한 잔으로 개발자를 응원해주세요! ☕" : "Support the developer! ☕"}"
            >
              <span class="text-xs">☕</span>
              <span class="hidden sm:inline whitespace-nowrap">${this.lang === "ko" ? "응원하기" : "Support"}</span>
            </button>

            <!-- Theme Toggle Switch -->
            <button
              @click="${this.toggleTheme}"
              class="flex items-center justify-center w-9 h-9 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-primary rounded-xl cursor-pointer focus:outline-none transition-all shadow-xs active:scale-95 shrink-0"
              title="${this.lang === "ko" ? "테마 변경" : "Change Theme"}"
            >
              <span class="material-symbols-outlined text-[18px]">
                ${this.isDark ? "light_mode" : "dark_mode"}
              </span>
            </button>

            <!-- Language Selector Dropdown -->
            <div class="relative inline-block text-left custom-dropdown-container shrink-0">
              <button
                type="button"
                @click="${(e: MouseEvent) => {
                  e.stopPropagation();
                  this.dropdownOpen = !this.dropdownOpen;
                }}"
                class="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl text-xs cursor-pointer focus:outline-none transition-all font-semibold shadow-xs select-none whitespace-nowrap"
                aria-haspopup="true"
                aria-expanded="${this.dropdownOpen}"
              >
                <span class="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">language</span>
                <span class="font-bold whitespace-nowrap">${this.lang === "ko" ? "한국어" : "English"}</span>
                <span
                  class="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform duration-200 shrink-0 ${this.dropdownOpen ? "rotate-180" : ""}"
                >expand_more</span>
              </button>

              <!-- Dropdown Menu -->
              ${this.dropdownOpen
                ? html`
                    <div
                      class="absolute right-0 mt-2 w-32 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl z-50 py-1 focus:outline-none animate-fade-in overflow-hidden"
                    >
                      <button
                        type="button"
                        @click="${() => this.selectLanguage("ko")}"
                        class="w-full px-3.5 py-2 text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${this.lang === "ko"
                          ? "text-primary bg-primary/10 font-bold"
                          : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}"
                      >
                        <span>한국어</span>
                        ${this.lang === "ko"
                          ? html`<span class="material-symbols-outlined text-[16px] text-primary">check</span>`
                          : ""}
                      </button>
                      <button
                        type="button"
                        @click="${() => this.selectLanguage("en")}"
                        class="w-full px-3.5 py-2 text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${this.lang === "en"
                          ? "text-primary bg-primary/10 font-bold"
                          : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}"
                      >
                        <span>English</span>
                        ${this.lang === "en"
                          ? html`<span class="material-symbols-outlined text-[16px] text-primary">check</span>`
                          : ""}
                      </button>
                    </div>
                  `
                : ""}
            </div>
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
