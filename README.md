# Batcher Tools (배처 툴)

Vite, Lit, TypeScript, 그리고 Tailwind CSS를 기반으로 제작된 **100% 서버리스 로컬 브라우저 기반 대용량 파일 배치(Batch) 처리 툴킷**입니다. 
웹 브라우저의 최신 **File System Access API**와 **Web Workers & WebAssembly**를 활용하여 그래픽 이미지 변환, 오디오 인코딩 및 타임스탬프 추출, 대량 파일명 변경, 그리고 웹 프로젝트 미사용 리소스 정리를 서버 업로드 없이 사용자 기기 내부에서 직접 안전하고 신속하게 처리합니다.

이 프로젝트는 오픈소스 라이선스 제약이 없는 완전한 **상업용 사용 가능(Commercial-Friendly)** 프로젝트입니다.

---

## 🚀 주요 제공 도구 및 핵심 기능 (Key Tools & Features)

### 1. 🖼️ SVG 이미지 대량 변환기 (SVG to PNG/JPG)
- 대용량 SVG 벡터 이미지를 고화질 PNG 또는 JPG로 즉시 래스터라이즈 변환.
- **다양한 배율 지원:** 1.0x(기본), 1.5x, 2.0x(@2x 레티나), 3.0x(@3x 고밀도) 등 배율 및 사용자 정의 파일명 접미사 설정 지원.
- 투명 배경 보존(PNG) 및 깔끔한 백색 배경 채우기(JPG) 옵션.

### 2. 🎵 오디오 일괄 변환 및 타임스탬프 생성기 (WAV to MP3 Converter)
- WAV, FLAC, OGG, AAC 등의 음원 파일을 초고속 LAME MP3로 일괄 인코딩 (128k ~ 320k CBR/VBR).
- **SMIL 타임스탬프 자동 추출:** 오디오 구간 태그(`<audio src="..." clipBegin="..." clipEnd="..." />`) 및 JSON 데이터 즉시 생성 및 복사.
- 오디오 미리보기 재생 플레이어 제공.

### 3. 🏷️ 파일명 대량 일괄 변경기 (Batch File Renamer)
- 수천 개의 파일명을 직관적인 규칙 조합을 통해 일괄 변경:
  - 문자열 찾기 및 바꾸기 (대소문자 구분 및 정규식 지원)
  - 접두사(Prefix) / 접미사(Suffix) 추가
  - 특정 자릿수 지우기 및 괄호/특수문자 제거
  - 자릿수 패딩이 적용된 일련번호(Numbering) 순차 부여
  - 영문 대소문자 변환 및 확장자 일괄 변경

### 4. 🧹 웹 프로젝트 미사용 리소스 정리기 (Web Resource Cleaner)
- HTML, CSS, JavaScript 프로젝트 디렉토리를 깊이 탐색하여 깨진 링크(Broken Link) 및 참조되지 않는 미사용(Unused) 미디어 파일을 검출.
- 연결되지 않은 태그 주석 처리 또는 미사용 파일 자동 소거 기능 지원.

---

## 🔒 100% 브라우저 로컬 데이터 보안 (Zero-Server Architecture)
- 업로드된 모든 이미지, 오디오, 텍스트 파일은 **외부 서버로 일절 전송되지 않습니다.**
- 사용자의 로컬 브라우저 메모리 안에서만 처리된 후 즉시 소멸되므로, 기업 보안 데이터나 미공개 디자인 리소스도 안심하고 처리할 수 있습니다.

---

## 📁 프로젝트 구조 (Project Structure)

```
pn-batcher-tools/
├── index.html                     # 메인 통합 워크스페이스 허브 (전체 4종 도구 탭 제공)
├── svg-to-png.html                # SVG ➔ PNG/JPG 변환기 전용 랜딩 페이지
├── wav-to-mp3.html                # 오디오(WAV ➔ MP3) 변환기 전용 랜딩 페이지
├── batch-rename.html              # 파일명 대량 일괄 변경기 전용 랜딩 페이지
├── vite.config.ts                 # 다중 엔트리포인트 빌드 및 Tailwind v4 설정
├── tsconfig.json                  # TypeScript 컴파일러 옵션
├── package.json                   # 의존성 및 실행 스크립트
├── public/                        # 정적 에셋 및 SEO 가이드 문서
│   ├── favicon.ico / favicon.svg  # 파비콘 에셋
│   ├── og-image.png               # SNS 공유 오픈그래프 이미지
│   ├── robots.txt / sitemap.xml   # 검색엔진 색인 메타데이터
│   ├── about.html / contact.html  # 서비스 소개 및 문의
│   ├── privacy.html / terms.html  # 개인정보처리방침 및 이용약관
│   └── guides/                    # 포괄적인 기술 사용 가이드 문서 19종
└── src/
    ├── batcher-app.ts             # 메인 워크스페이스 오케스트레이션 컴포넌트 (<batcher-app>)
    ├── index.css                  # Tailwind v4, 커스텀 테마 토큰 및 디자인 유틸리티
    ├── components/                # UI 프레젠테이션 서브컴포넌트 (Lit 기반)
    │   ├── app-header.ts          # 상단 글로벌 내비게이션 및 다크모드/언어 전환
    │   ├── settings-panel.ts      # SVG 변환 옵션 제어 패널
    │   ├── audio-settings-panel.ts# 오디오 인코딩 및 비트레이트 제어 패널
    │   ├── renamer-settings-panel.ts # 파일 이름 변경 규칙 제어 패널
    │   ├── cleaner-settings-panel.ts # 리소스 스캐너 설정 패널
    │   ├── cleaner-results-view.ts   # 리소스 분석 결과 및 정리 뷰
    │   ├── file-queue.ts          # 드래그 앤 드롭 파일 대기열 및 실시간 상태 모니터
    │   ├── folder-tree-view.ts    # 폴더 구조 트리 탐색기
    │   ├── audio-timestamp-modal.ts  # SMIL/JSON 타임스탬프 모달 다이얼로그
    │   ├── alert-modal.ts         # 공용 알림/확인 모달 레이어
    │   └── log-console.ts         # 작업 실행 터미널 로그 뷰어
    ├── services/                  # 핵심 비즈니스 로직 및 일괄 처리 엔진
    │   ├── batch-converter.ts     # SVG 배치 변환 처리 서비스
    │   ├── audio-converter.ts     # Web Audio & LAME 기반 MP3 인코딩 서비스
    │   ├── file-renamer.ts        # 파일 이름 변경 및 정리 서비스
    │   └── resource-cleaner.ts    # HTML/CSS/JS 구문 분석 및 리소스 스캐너
    ├── utils/                     # 순수 유틸리티 및 헬퍼 함수
    │   ├── fs-utils.ts            # File System Access API 및 폴더 재귀 탐색
    │   ├── svg-utils.ts           # SVG Canvas 렌더링 및 해상도 계산
    │   ├── rename-rules.ts        # 파일명 변경 순수 함수 모음
    │   ├── audio-duration-utils.ts# 오디오 재생 길이 계산 및 SMIL 포맷터
    │   └── sample-generator.ts    # 원클릭 테스트용 샘플 파일 생성기
    ├── locales/                   # 다국어 리소스 (한국어/영어)
    │   ├── ko.ts                  # 한국어 번역 리소스
    │   ├── en.ts                  # 영어 번역 리소스
    │   └── index.ts               # 로케일 모듈 통합
    └── types/                     # TypeScript 인터페이스 및 타입 정의
        └── index.ts               # BatchFile, ScaleOption, CleanScanResult 등
```

---

## 🛠️ 설치 및 실행 방법 (Quick Start)

### 1. 패키지 설치
```bash
npm install
```

### 2. 로컬 개발 서버 시작 (Vite)
```bash
npm run dev
```

### 3. 프로덕션 빌드 (TypeScript 검사 및 번들링)
```bash
npm run build
```

### 4. GitHub 저장소 커밋 & 푸시
```bash
npm run gitpush
```

---

## ⚖️ 라이선스 및 상업적 사용 권한 (License & Commercial Use)

이 프로젝트 및 포함된 모든 의존성 패키지는 상업적 사용에 제약이 없는 자유 라이선스를 따릅니다.

- **Lit** (`BSD-3-Clause`): 상업적 이용 및 재배포 가능
- **JSZip** (`MIT`): 제한 없이 상업적 용도로 사용 및 배포 가능
- **@breezystack/lamejs** (`LGPL-3.0` / Web Worker 격리): 오디오 인코딩
- **Tailwind CSS** (`MIT`): 상업적 이용 가능
- **FontAwesome (Free)** (`MIT` / `SIL OFL 1.1` / `CC BY 4.0`): 무료 버전 웹 폰트 및 아이콘 상업적 이용 가능

