import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ScaleOption } from '../types';

@customElement('settings-panel')
export class SettingsPanel extends LitElement {
  @property({ type: Boolean }) apiSupported = false;
  @property({ type: Object }) dirHandle: FileSystemDirectoryHandle | null = null;
  @property({ type: Number }) svgFilesCount = 0;
  @property({ type: String }) exportFormat: 'png' | 'jpg' = 'png';
  @property({ type: Number }) selectedScale = 1;
  @property({ type: Array }) scaleOptions: ScaleOption[] = [];
  @property({ type: String }) outputSubFolderName = '';
  @property({ type: Boolean }) deleteOriginal = false;
  @property({ type: Boolean }) isConverting = false;
  @property({ type: Number }) conversionProgress = 0;

  protected override createRenderRoot() {
    return this;
  }

  private handleSelectFolder() {
    this.dispatchEvent(new CustomEvent('select-folder', { bubbles: true, composed: true }));
  }

  private handleUploadFiles(e: Event) {
    this.dispatchEvent(new CustomEvent('upload-files', {
      detail: e,
      bubbles: true,
      composed: true
    }));
  }

  private handleChangeFormat(format: 'png' | 'jpg') {
    this.dispatchEvent(new CustomEvent('change-format', {
      detail: format,
      bubbles: true,
      composed: true
    }));
  }

  private handleChangeScale(scale: number) {
    this.dispatchEvent(new CustomEvent('change-scale', {
      detail: scale,
      bubbles: true,
      composed: true
    }));
  }

  private handleSubfolderChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.dispatchEvent(new CustomEvent('change-subfolder', {
      detail: target.value,
      bubbles: true,
      composed: true
    }));
  }

  private handleSuffixInput(scale: number, e: Event) {
    const target = e.target as HTMLInputElement;
    this.dispatchEvent(new CustomEvent('change-suffix', {
      detail: { scale, suffix: target.value },
      bubbles: true,
      composed: true
    }));
  }

  private handleToggleDelete() {
    this.dispatchEvent(new CustomEvent('toggle-delete', {
      bubbles: true,
      composed: true
    }));
  }


  protected override render() {
    return html`
      <div class="space-y-6">
        <!-- Step 1: Directory Picker Card -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div class="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <h2 class="text-lg font-semibold mb-4 text-white flex items-center gap-2">
            <span class="bg-indigo-500/10 text-indigo-400 w-6 h-6 rounded-md flex items-center justify-center text-xs">1</span>
            대상 SVG 폴더 연동하기
          </h2>
          
          ${this.apiSupported ? html`
            <!-- Native Folder Selection API UI -->
            <div class="space-y-4">
              <button 
                @click="${this.handleSelectFolder}" 
                ?disabled="${this.isConverting}"
                class="w-full py-4 px-6 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group font-sans"
              >
                <i class="fa-regular fa-folder-open text-3xl text-indigo-400 group-hover:scale-110 transition-transform"></i>
                <span class="text-sm font-medium">로컬 디렉토리(폴더) 지정</span>
                <span class="text-xs text-slate-500">폴더 내의 모든 SVG 파일을 자동으로 가져옵니다.</span>
              </button>

              ${this.dirHandle ? html`
                <div class="p-3.5 bg-indigo-950/20 border border-indigo-500/20 rounded-xl text-xs flex items-center justify-between">
                  <div class="flex items-center gap-2 text-indigo-300">
                    <i class="fa-regular fa-folder-open"></i>
                    <span class="font-semibold truncate max-w-50">${this.dirHandle.name}</span>
                  </div>
                  <span class="text-slate-400 font-mono">${this.svgFilesCount}개 파일 로드됨</span>
                </div>
              ` : html`
                <div class="text-center py-2">
                  <span class="text-xs text-slate-500">지정된 로컬 디렉토리가 없습니다.</span>
                </div>
              `}
            </div>
          ` : html`
            <!-- WebkitDirectory Standard Native Fallback UI -->
            <div class="space-y-4">
              <label 
                class="w-full py-4 px-6 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-dashed border-slate-700 hover:border-amber-500 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group font-sans"
              >
                <input 
                  type="file" 
                  webkitdirectory 
                  directory 
                  multiple 
                  class="hidden" 
                  @change="${this.handleUploadFiles}"
                  ?disabled="${this.isConverting}"
                />
                <i class="fa-solid fa-cloud-arrow-up text-3xl text-amber-400 group-hover:scale-110 transition-transform"></i>
                <span class="text-sm font-medium">작업 폴더 선택 업로드</span>
                <span class="text-xs text-slate-500">폴더 내부를 업로드 형식으로 가져옵니다.</span>
              </label>

              ${this.svgFilesCount > 0 ? html`
                <div class="p-3.5 bg-amber-950/20 border border-amber-500/20 rounded-xl text-xs flex items-center justify-between">
                  <div class="flex items-center gap-2 text-amber-300">
                    <i class="fa-solid fa-folder-tree"></i>
                    <span class="font-semibold truncate max-w-50">수동 로드된 임포트 셋</span>
                  </div>
                  <span class="text-slate-400 font-mono">${this.svgFilesCount}개 파일 감지됨</span>
                </div>
              ` : html`
                <div class="text-center py-2">
                  <span class="text-xs text-slate-500 font-medium">폴더 임포트 대기 중</span>
                </div>
              `}
            </div>
          `}
        </div>

        <!-- Step 2: Settings Card -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div class="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <h2 class="text-lg font-semibold mb-4 text-white flex items-center gap-2">
            <span class="bg-indigo-500/10 text-indigo-400 w-6 h-6 rounded-md flex items-center justify-center text-xs">2</span>
            내보내기 규칙 커스텀 설정
          </h2>

          <div class="space-y-4">
            <!-- Format selection (PNG / JPG) -->
            <div>
              <label class="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">출력 이미지 포맷</label>
              <div class="grid grid-cols-2 gap-3">
                <button 
                  @click="${() => this.handleChangeFormat('png')}"
                  ?disabled="${this.isConverting}"
                  class="py-2.5 rounded-xl border text-sm font-medium transition-all font-sans ${
                    this.exportFormat === 'png' 
                    ? 'bg-indigo-600 border-indigo-500 text-white font-semibold' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }"
                >
                  PNG (투명 지원)
                </button>
                <button 
                  @click="${() => this.handleChangeFormat('jpg')}"
                  ?disabled="${this.isConverting}"
                  class="py-2.5 rounded-xl border text-sm font-medium transition-all font-sans ${
                    this.exportFormat === 'jpg' 
                    ? 'bg-indigo-600 border-indigo-500 text-white font-semibold' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }"
                >
                  JPG (흰색 배경 자동 적용)
                </button>
              </div>
            </div>

            <div class="border-t border-slate-800 my-4"></div>

            <!-- Single scale selection like radio button (Up to 2x) -->
            <div>
              <label class="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">출력 이미지 배율 설정 (단일 선택)</label>
              <div class="space-y-3">
                ${this.scaleOptions.map((item) => html`
                  <div class="flex items-center gap-2">
                    <button 
                      @click="${() => this.handleChangeScale(item.scale)}"
                      ?disabled="${this.isConverting}"
                      class="flex-1 p-3.5 rounded-xl border text-left transition-all flex items-center justify-between font-sans ${
                        this.selectedScale === item.scale 
                        ? 'bg-indigo-950/40 border-indigo-500 text-white font-semibold' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }"
                    >
                      <span class="text-sm font-semibold">${item.label}</span>
                      <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        this.selectedScale === item.scale ? 'border-indigo-500' : 'border-slate-700'
                      }">
                        ${this.selectedScale === item.scale ? html`<div class="w-2 h-2 rounded-full bg-indigo-500"></div>` : ''}
                      </div>
                    </button>
                    
                    <div class="w-28 shrink-0 flex flex-col gap-1">
                      <span class="text-[9px] text-slate-500 uppercase tracking-wider pl-1 font-sans">접미사</span>
                      <input 
                        type="text" 
                        .value="${item.suffix}"
                        @input="${(e: Event) => this.handleSuffixInput(item.scale, e)}"
                        ?disabled="${this.isConverting}"
                        placeholder="접미사 없음"
                        class="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                        title="배율 적용 시 파일명 끝에 붙을 접미사"
                      />
                    </div>
                  </div>
                `)}
              </div>
            </div>

            <div class="border-t border-slate-800 my-4"></div>

            <!-- Directory root setting -->
            <div>
              <label class="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">출력 하위 폴더 경로 이름</label>
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 text-sm">
                  /
                </span>
                <input 
                  type="text" 
                  .value="${this.outputSubFolderName}" 
                  @input="${this.handleSubfolderChange}"
                  ?disabled="${this.isConverting}"
                  placeholder="(지정하지 않으면 원본 위치에 직접 저장)" 
                  class="w-full pl-6 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-sans"
                />
              </div>
              <p class="text-[11px] text-slate-500 mt-1">지정한 하위 폴더 안에 결과물이 모이게 됩니다. 비워둘 경우 원본 SVG 파일이 있는 동일한 경로에 직접 저장됩니다.</p>
            </div>

            <div class="border-t border-slate-800 my-4"></div>

            <!-- Option: Delete Original SVG (Highly experimental/depends on native handles) -->
            <div class="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <label class="flex items-start gap-3 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  ?checked="${this.deleteOriginal}"
                  ?disabled="${this.isConverting}"
                  @change="${this.handleToggleDelete}"
                  class="w-4.5 h-4.5 rounded text-indigo-600 bg-slate-900 border-slate-800 focus:ring-indigo-500 focus:ring-offset-slate-950 mt-0.5"
                />
                <div class="text-xs">
                  <span class="font-bold text-slate-200 block">변환 후 원본 SVG 파일 자동 제거</span>
                  <span class="text-slate-500 block mt-0.5 font-sans">변환 프로세스가 완전히 정상 종료되면 해당 로컬 원본 파일(.svg)을 대상 폴더에서 삭제합니다.</span>
                </div>
              </label>
              
              ${this.deleteOriginal && (!this.apiSupported || !this.dirHandle) ? html`
                <div class="mt-2 text-[10px] text-rose-400 font-medium flex items-center gap-1.5 font-sans">
                  <i class="fa-solid fa-circle-exclamation"></i>
                  <span>로컬 디렉토리가 브라우저 상에 정상 연동되어 있어야 원본 제어가 가능합니다.</span>
                </div>
              ` : ''}
            </div>

          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-panel': SettingsPanel;
  }
}
