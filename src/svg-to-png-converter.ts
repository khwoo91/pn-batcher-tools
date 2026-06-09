/// <reference types="wicg-file-system-access" />
import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import JSZip from 'jszip';

import type { SvgFile, ScaleOption, ConversionLog } from './types';
import { getSvgDimensions, convertSvgToImage } from './utils/svg-utils';

import './components/app-header';
import './components/settings-panel';
import './components/file-queue';
import './components/log-console';
import './components/alert-modal';

@customElement('svg-to-png-converter')
export class SvgToPngConverter extends LitElement {
  @state() private dirHandle: FileSystemDirectoryHandle | null = null;
  @state() private svgFiles: SvgFile[] = [];
  @state() private selectedScale = 1;
  @state() private exportFormat: 'png' | 'jpg' = 'png';
  @state() private deleteOriginal = false;
  @state() private outputSubFolderName = 'converted_images';
  @state() private isConverting = false;
  @state() private conversionProgress = 0;
  @state() private conversionLogs: ConversionLog[] = [];
  @state() private apiSupported: boolean = 'showDirectoryPicker' in window;
  @state() private useFallback: boolean = !('showDirectoryPicker' in window);
  
  @state() private modalMessage = '';
  @state() private showModal = false;
  @state() private modalType: 'info' | 'success' | 'error' = 'info';

  @state() private scaleOptions: ScaleOption[] = [
    { scale: 1, label: '1.0x (기본 배율)', suffix: '' },
    { scale: 1.5, label: '1.5x (중간 배율)', suffix: '@1.5x' },
    { scale: 2, label: '2.0x (고해상도)', suffix: '@2x' }
  ];

  protected override createRenderRoot() {
    return this;
  }

  private showAlert(message: string, type: 'info' | 'success' | 'error' = 'info') {
    this.modalMessage = message;
    this.modalType = type;
    this.showModal = true;
  }

  private addLog(text: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    this.conversionLogs = [{ timestamp, text, type }, ...this.conversionLogs];
  }

  private async getNestedDirHandle(rootHandle: FileSystemDirectoryHandle, relativePath: string): Promise<FileSystemDirectoryHandle> {
    const parts = relativePath.split('/').filter(Boolean);
    parts.pop(); // Remove filename
    
    let currentHandle = rootHandle;
    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
    }
    return currentHandle;
  }

  private handleChangeSuffix(scale: number, suffix: string) {
    this.scaleOptions = this.scaleOptions.map(opt =>
      opt.scale === scale ? { ...opt, suffix } : opt
    );
  }

  private async selectFolder() {
    if (!this.apiSupported) {
      this.showAlert('이 브라우저는 폴더 직접 선택 API를 지원하지 않습니다. 파일 탐색기 기반 업로드를 사용합니다.', 'info');
      return;
    }

    try {
      this.dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      
      this.svgFiles = [];
      this.conversionLogs = [];
      this.conversionProgress = 0;
      
      await this.scanDirectory(this.dirHandle);
      
      if (this.svgFiles.length === 0) {
        this.showAlert('선택한 폴더 안에 SVG 파일이 존재하지 않습니다.', 'error');
      } else {
        this.addLog(`폴더 스캔 완료: 총 ${this.svgFiles.length}개의 SVG 파일을 감지했습니다.`);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        this.showAlert(`폴더 접근 권한을 획득하지 못했습니다: ${err.message}`, 'error');
      }
    }
  }

  private async scanDirectory(dirHandle: FileSystemDirectoryHandle, path = '') {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.svg')) {
        const file = await (entry as FileSystemFileHandle).getFile();
        this.svgFiles = [...this.svgFiles, {
          name: entry.name,
          file: file,
          relativePath: path ? `${path}/${entry.name}` : entry.name,
          status: 'pending'
        }];
      } else if (entry.kind === 'directory') {
        if (entry.name !== this.outputSubFolderName) {
          await this.scanDirectory(entry as FileSystemDirectoryHandle, path ? `${path}/${entry.name}` : entry.name);
        }
      }
    }
  }

  private async handleFallbackUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    this.svgFiles = [];
    this.conversionLogs = [];
    this.conversionProgress = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.svg')) {
        this.svgFiles = [...this.svgFiles, {
          name: file.name,
          file: file,
          relativePath: file.webkitRelativePath || file.name,
          status: 'pending'
        }];
      }
    }

    if (this.svgFiles.length === 0) {
      this.showAlert('업로드된 폴더/파일 중 SVG 파일을 찾을 수 없습니다.', 'error');
    } else {
      this.addLog(`수동 파일 업로드 완료: 총 ${this.svgFiles.length}개의 SVG 파일을 준비했습니다.`);
    }
  }

  private async startConversion() {
    if (this.svgFiles.length === 0) {
      this.showAlert('변환할 SVG 파일이 존재하지 않습니다. 먼저 폴더를 선택하거나 업로드 해주세요.', 'error');
      return;
    }

    const scaleObj = this.scaleOptions.find(s => s.scale === this.selectedScale);
    if (!scaleObj) {
      this.showAlert('해당 배율 옵션이 올바르지 않습니다.', 'error');
      return;
    }

    this.isConverting = true;
    this.conversionProgress = 0;
    this.addLog(`변환 프로세스를 시작합니다... [포맷: ${this.exportFormat.toUpperCase()}, 배율: ${scaleObj.scale}x]`, 'info');

    let successCount = 0;
    let failCount = 0;
    const totalSteps = this.svgFiles.length;
    let currentStep = 0;

    let outputDirHandle: FileSystemDirectoryHandle | null = null;
    let zip: JSZip | null = null;

    const isLocalDirMode = this.apiSupported && this.dirHandle && !this.useFallback;
    const hasSubFolder = this.outputSubFolderName.trim() !== '';

    if (isLocalDirMode && this.dirHandle) {
      try {
        const opts = { mode: 'readwrite' as const };
        if ((await this.dirHandle.queryPermission(opts)) !== 'granted') {
          await this.dirHandle.requestPermission(opts);
        }
        if (hasSubFolder) {
          outputDirHandle = await this.dirHandle.getDirectoryHandle(this.outputSubFolderName, { create: true });
          this.addLog(`로컬 출력 폴더가 준비되었습니다: /${this.outputSubFolderName}`, 'success');
        } else {
          this.addLog(`출력 하위 폴더가 지정되지 않아 원본 SVG 파일 경로에 직접 변환 파일을 생성합니다.`, 'info');
        }
      } catch (err) {
        console.error('로컬 디렉토리 권한 문제, ZIP 다운로드 방식으로 선회합니다.', err);
        this.addLog('로컬 폴더 생성 실패. 브라우저 제한으로 인해 ZIP 보관함으로 변환 후 다운로드로 대체 진행합니다.', 'warning');
        zip = new JSZip();
      }
    } else {
      zip = new JSZip();
      this.addLog('ZIP 가상 아카이브 빌드를 개시합니다.', 'info');
    }

    for (let i = 0; i < this.svgFiles.length; i++) {
      const svgItem = this.svgFiles[i];
      svgItem.status = 'processing';
      this.svgFiles = [...this.svgFiles];

      try {
        const { width, height, text } = await getSvgDimensions(svgItem.file);
        const lastDotIndex = svgItem.name.lastIndexOf('.');
        const baseName = lastDotIndex !== -1 ? svgItem.name.substring(0, lastDotIndex) : svgItem.name;
        const extension = this.exportFormat;
        const outputFileName = `${baseName}${scaleObj.suffix}.${extension}`;

        try {
          const imageBlob = await convertSvgToImage(text, width, height, scaleObj.scale, this.exportFormat);

          if (isLocalDirMode && this.dirHandle) {
            let targetDirHandle: FileSystemDirectoryHandle;
            if (hasSubFolder && outputDirHandle) {
              targetDirHandle = outputDirHandle;
            } else {
              targetDirHandle = await this.getNestedDirHandle(this.dirHandle, svgItem.relativePath);
            }
            const fileHandle = await targetDirHandle.getFileHandle(outputFileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(imageBlob);
            await writable.close();
          } else if (zip) {
            if (hasSubFolder) {
              const zipFolderPath = this.outputSubFolderName || 'converted_images';
              zip.folder(zipFolderPath)?.file(outputFileName, imageBlob);
            } else {
              const relativeParts = svgItem.relativePath.split('/');
              relativeParts.pop(); // Remove filename
              const zipPath = relativeParts.join('/');
              if (zipPath) {
                zip.folder(zipPath)?.file(outputFileName, imageBlob);
              } else {
                zip.file(outputFileName, imageBlob);
              }
            }
          }

          successCount++;
          this.addLog(`성공: ${svgItem.relativePath} → ${outputFileName} (${Math.round(width * scaleObj.scale)}x${Math.round(height * scaleObj.scale)} px)`, 'success');

          if (this.deleteOriginal && this.dirHandle) {
            try {
              const targetDirHandle = await this.getNestedDirHandle(this.dirHandle, svgItem.relativePath);
              await targetDirHandle.removeEntry(svgItem.name);
              this.addLog(`원본 제거 완료: ${svgItem.relativePath}`, 'info');
            } catch (delErr: any) {
              this.addLog(`원본 제거 실패: ${svgItem.relativePath} (${delErr.message})`, 'warning');
            }
          }

          svgItem.status = 'success';
        } catch (scaleErr: any) {
          failCount++;
          svgItem.status = 'error';
          svgItem.errorMsg = scaleErr.message;
          this.addLog(`실패: ${svgItem.relativePath} - ${scaleErr.message}`, 'error');
        }

      } catch (fileErr: any) {
        svgItem.status = 'error';
        svgItem.errorMsg = fileErr.message;
        this.addLog(`구조적 파싱 에러: ${svgItem.relativePath} - ${fileErr.message}`, 'error');
        failCount++;
      }

      currentStep++;
      this.conversionProgress = Math.round((currentStep / totalSteps) * 100);
      this.svgFiles = [...this.svgFiles];
    }

    if (zip && successCount > 0) {
      try {
        this.addLog('ZIP 아카이브 압축 파일 구성 중...', 'info');
        const content = await zip.generateAsync({ type: 'blob' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${this.outputSubFolderName || 'converted_images'}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.addLog(`압축 파일 다운로드 완료: ${this.outputSubFolderName || 'converted_images'}.zip`, 'success');
      } catch (zipErr: any) {
        this.addLog(`ZIP 다운로드 압축 파일 빌드 실패: ${zipErr.message}`, 'error');
      }
    }

    this.isConverting = false;
    this.addLog(`변환이 종료되었습니다. (성공: ${successCount}건, 실패: ${failCount}건)`, successCount > 0 ? 'success' : 'error');
    
    if (successCount > 0) {
      let destinationText = '';
      if (isLocalDirMode) {
        destinationText = hasSubFolder 
          ? `선택한 로컬 폴더 내의 '/${this.outputSubFolderName}' 경로에 직접 개별 이미지들이 저장되었습니다.`
          : `선택한 로컬 폴더 내의 각 SVG 파일 위치에 직접 변환 이미지 파일들이 개별 저장되었습니다.`;
      } else {
        destinationText = `브라우저 제약(Safari/Firefox 등)으로 인해 이미지들이 가상 폴더 구조를 포함한 ZIP 다운로드로 제공되었습니다.`;
      }
      
      if (this.deleteOriginal && !isLocalDirMode) {
        destinationText += `\n\n(참고: 원본 파일 자동 삭제 기능은 파일 쓰기 API 권한이 제공되는 최신 브라우저 기반의 "로컬 디렉토리 지정" 환경에서만 동작합니다.)`;
      }

      this.showAlert(`전체 변환 완료!\n\n${destinationText}`, 'success');
    } else {
      this.showAlert('변환 작업을 마쳤으나 완료된 리소스가 없습니다. 로그 콘솔을 체크해주세요.', 'error');
    }
  }

  private resetAll() {
    this.dirHandle = null;
    this.svgFiles = [];
    this.isConverting = false;
    this.conversionProgress = 0;
    this.conversionLogs = [];
    this.addLog('데이터를 리셋하였습니다.', 'info');
  }

  protected override render() {
    return html`
      <div class="max-w-7xl mx-auto px-4 py-8 flex flex-col min-h-screen pb-32">
        <!-- Header -->
        <app-header 
          .hasFiles="${this.svgFiles.length > 0}" 
          @reset-all="${this.resetAll}"
        ></app-header>

        <!-- Browser Compatibility Alert Banner -->
        ${!this.apiSupported ? html`
          <div class="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-sm flex items-start gap-3">
            <i class="fa-solid fa-triangle-exclamation text-lg mt-0.5 shrink-0 font-sans"></i>
            <div class="font-sans">
              <span class="font-bold">브라우저 호환성 안내:</span> 현재 사용 중인 브라우저는 로컬 디렉토리에 직접 새 이미지 파일을 저장하거나 원본 파일을 제어하는 최신 API를 완벽히 지원하지 않습니다.
              대신, 변환이 끝난 파일들을 묶어 <strong>${this.outputSubFolderName}.zip</strong> 압축파일 형태로 일괄 안전하게 다운로드해 드립니다.
            </div>
          </div>
        ` : ''}

        <!-- Main Layout Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-1">
          
          <!-- Left Control Settings Panel (cols-5) -->
          <div class="lg:col-span-5">
            <settings-panel
              .apiSupported="${this.apiSupported}"
              .dirHandle="${this.dirHandle}"
              .svgFilesCount="${this.svgFiles.length}"
              .exportFormat="${this.exportFormat}"
              .selectedScale="${this.selectedScale}"
              .scaleOptions="${this.scaleOptions}"
              .outputSubFolderName="${this.outputSubFolderName}"
              .deleteOriginal="${this.deleteOriginal}"
              .isConverting="${this.isConverting}"
              .conversionProgress="${this.conversionProgress}"
              @select-folder="${this.selectFolder}"
              @upload-files="${(e: CustomEvent) => this.handleFallbackUpload(e.detail)}"
              @change-format="${(e: CustomEvent<'png' | 'jpg'>) => this.exportFormat = e.detail}"
              @change-scale="${(e: CustomEvent<number>) => this.selectedScale = e.detail}"
              @change-subfolder="${(e: CustomEvent<string>) => this.outputSubFolderName = e.detail.replace(/[^a-zA-Z0-9_\-]/g, '')}"
              @change-suffix="${(e: CustomEvent<{ scale: number; suffix: string }>) => this.handleChangeSuffix(e.detail.scale, e.detail.suffix)}"
              @toggle-delete="${() => this.deleteOriginal = !this.deleteOriginal}"
            ></settings-panel>
          </div>

          <!-- Right Real-Time Display & Logger Panel (cols-7) -->
          <div class="lg:col-span-7 space-y-6">
            <!-- Progress Indicator (Visible only during execution) -->
            ${this.isConverting || this.conversionProgress > 0 ? html`
              <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-semibold text-white font-sans">동작 수행 진행률</span>
                  <span class="text-sm font-bold text-indigo-400 font-mono">${this.conversionProgress}%</span>
                </div>
                <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div class="bg-indigo-500 h-full transition-all duration-300" style="width: ${this.conversionProgress}%"></div>
                </div>
              </div>
            ` : ''}

            <!-- File List Queue -->
            <file-queue .svgFiles="${this.svgFiles}"></file-queue>

            <!-- Logs Console -->
            <log-console 
              .conversionLogs="${this.conversionLogs}"
              @clear-logs="${() => this.conversionLogs = []}"
            ></log-console>
          </div>

        </div>
      </div>

      <!-- Sticky Bottom Action Bar -->
      <div class="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 py-5 px-6 z-40 shadow-2xl">
        <div class="max-w-7xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-4">
          <div class="flex flex-wrap items-center gap-4 text-xs md:text-sm text-slate-400 font-medium font-sans">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full ${this.svgFiles.length > 0 ? 'bg-indigo-500 animate-pulse' : 'bg-slate-700'}"></span>
              <span>대기 파일: <strong class="text-white">${this.svgFiles.length}개</strong></span>
            </div>
            <span class="text-slate-700 hidden md:inline">|</span>
            <span>내보내기 포맷: <strong class="text-indigo-400 uppercase font-bold">${this.exportFormat}</strong></span>
            <span class="text-slate-700 hidden md:inline">|</span>
            <span>적용 배율: <strong class="text-white font-mono">${this.selectedScale}x</strong></span>
            ${this.scaleOptions.find(o => o.scale === this.selectedScale)?.suffix ? html`
              <span class="text-slate-700 hidden md:inline">|</span>
              <span>접미사: <strong class="text-emerald-400 font-mono">${this.scaleOptions.find(o => o.scale === this.selectedScale)?.suffix}</strong></span>
            ` : ''}
          </div>
          
          <button 
            @click="${this.startConversion}" 
            ?disabled="${this.isConverting || this.svgFiles.length === 0}"
            class="w-full md:w-auto px-10 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 cursor-pointer shadow-md font-sans text-sm font-bold shrink-0"
          >
            ${this.isConverting ? html`
              <svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>배치 변환 진행 중 (${this.conversionProgress}%)</span>
            ` : html`
              <i class="fa-solid fa-play"></i>
              <span>배치 ${this.exportFormat.toUpperCase()} 변환 시작</span>
            `}
          </button>
        </div>
      </div>

      <!-- Alert Modal Overlay -->
      <alert-modal
        .show="${this.showModal}"
        .message="${this.modalMessage}"
        .type="${this.modalType}"
        @close="${() => this.showModal = false}"
      ></alert-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'svg-to-png-converter': SvgToPngConverter;
  }
}
