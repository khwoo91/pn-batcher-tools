# SVG to PNG/JPG Batch Exporter 🖼️

Vite, Lit, TypeScript, 그리고 Tailwind CSS를 기반으로 제작된 대용량 SVG 이미지 로컬 배치(Batch) 변환기입니다. 
브라우저의 최신 File System Access API를 활용하여 로컬 폴더의 SVG 파일들을 원하는 배율과 포맷(PNG/JPG)으로 직접 변환하여 내보내거나, 미지원 브라우저의 경우 가상 ZIP 압축을 통해 일괄 다운로드해 드립니다.

이 프로젝트는 오픈소스 라이선스 제약이 없는 완전한 **상업용 사용 가능(Commercial-Friendly)** 프로젝트입니다.

---

## 🚀 주요 특징 및 기능 (Key Features)

### 1. 로컬 디렉토리(폴더) 구조 유지 및 유연한 저장
- 최신 브라우저의 **File System Access API**를 사용하여 로컬 폴더 안의 모든 SVG 파일을 자동으로 탐색하고 로드합니다.
- 크롬/에지 등 미지원 환경이나 기타 브라우저를 위해 **웹킷 디렉토리 업로드 기반의 Fallback** 기능을 완벽히 탑재하고 있습니다.
- **경로 미지정시 원본 위치 직접 생성 (기본값):** 출력 하위 폴더명을 입력하지 않고 비워두면, 각 SVG 파일이 들어있는 로컬 원본 서브디렉토리 경로 내에 직접 변환 파일을 생성합니다. 폴더 구조가 있는 경우 그 구조 그대로 변환 파일이 생성됩니다.

### 2. 다중 내보내기 포맷 지원
- **PNG:** 투명도를 지원하는 무손실 압축 포맷.
- **JPG:** 알파 채널(투명 영역)에 자동으로 흰색 배경을 채워 깔끔하게 변환하는 무손실 JPEG 압축 포맷.

### 3. 배율별 접미사 커스텀 설정 및 자동 적용
- 단일 이미지 배율 설정(1.0x, 1.5x, 2.0x)을 선택할 수 있습니다.
- **접미사 커스텀 에디팅:** 각 배율 우측의 입력 상자를 통해 원하는 텍스트 접미사(예: `@2x`, `@hd`)를 사용자가 직접 언제든 수정할 수 있습니다.

### 4. 원본 SVG 파일 자동 정리 (Experimental)
- 변환 프로세스가 성공적으로 완료되면 기존 로컬 디렉토리 내의 원본 `.svg` 파일을 자동으로 삭제하는 원본 정리 모드를 지원합니다. (원본 파일이 위치한 서브디렉토리 경로 내에서 정확히 매핑하여 원본을 소거합니다.)

### 5. 프리미엄 UI/UX 디자인
- **글라스모피즘 하단 액션 바**: 화면 하단에 고정된 액션 바는 반투명한 글라스 재질(`backdrop-blur-xl`)로 처리되어 시각적으로 매우 수려합니다.
- **트랜잭션 실시간 모니터링**: 파일 큐 대기열에서 개별 파일들의 진행률(대기 중, 렌더링 중, 완료됨, 에러)을 시각적으로 확인하고, 상세 작업 이력을 터미널 콘솔 로그 뷰어로 볼 수 있습니다.

---

## ⚖️ 라이선스 및 상업적 사용 권한 (License & Commercial Use)

이 프로젝트 및 포함된 모든 의존성 패키지는 상업적 사용에 제약이 없는 자유 라이선스를 따릅니다.

- **프로젝트 소스 코드**: 상업적 이용, 복제, 수정 및 유료 배포 가능
- **Lit** (`BSD-3-Clause`): 상업적 이용 및 재배포 가능
- **JSZip** (`MIT`): 제한 없이 상업적 용도로 사용 및 배포 가능
- **Tailwind CSS** (`MIT`): 상업적 이용 가능
- **FontAwesome (Free)** (`MIT` / `SIL OFL 1.1` / `CC BY 4.0` 혼합): 무료 버전 아이콘 및 웹 폰트 상업적 이용 가능

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

### 3. 프로덕션 빌드
```bash
npm run build
```

---

## 📁 프로젝트 폴더 구조 (Project Structure)

프로젝트는 모듈화 및 확장성을 극대화하기 위해 다음과 같이 비즈니스 로직, 타입 정의, UI 서브 컴포넌트로 구조적으로 분리되어 설계되었습니다:

```
src/
├── types/
│   └── index.ts                 # 공통 모델 타입 정의 (SvgFile, ScaleOption, ConversionLog)
├── utils/
│   └── svg-utils.ts             # SVG 수치 추출 및 Canvas 래스터라이제이션 (순수 비즈니스 로직)
├── components/
│   ├── alert-modal.ts           # 공용 모달 레이어 컴포넌트 (<alert-modal>)
│   ├── app-header.ts            # 로고 및 상단 헤더, 초기화 제어 (<app-header>)
│   ├── settings-panel.ts        # 옵션 커스텀 카드 및 폴더 지정/변환 트리거 (<settings-panel>)
│   ├── file-queue.ts            # 대기열 및 진행 상태 모니터 뷰 (<file-queue>)
│   └── log-console.ts           # 실시간 터미널 형태 로그 뷰어 (<log-console>)
├── index.css                    # 프리미엄 폰트(Inter/Outfit) 및 다크 스크롤바 스타일링
└── svg-to-png-converter.ts      # 상태 조율 및 파일 변환 루프를 제어하는 메인 컨트롤러 (<svg-to-png-converter>)
```

### 아키텍처 및 디자인 세부사항 (Architecture Highlights)
- **단일 상태 조율 (Single Source of Truth):** 상태의 파편화를 방지하기 위해 모든 리액티브 상태는 최상위 컴포넌트([svg-to-png-converter.ts](./src/svg-to-png-converter.ts))에서 관리하며, 하위 컴포넌트들은 프로퍼티 수신 및 커스텀 이벤트 버블링(`CustomEvent`)을 활용해 단방향으로 통신합니다.
- **순수 로직의 격리:** 파일 입출력 및 Canvas 그리기를 분리하여 [svg-utils.ts](./src/utils/svg-utils.ts)에 순수 헬퍼 함수로 담아 향후 단위 테스트 작성이 용이합니다.
- **Tailwind CSS Light DOM 렌더링:** `createRenderRoot() { return this; }` 구조를 통해 Shadow DOM을 우회하고 라이트 돔에서 스타일을 렌더링하므로, Tailwind의 전역 스타일링과 유틸리티 클래스가 완벽하게 녹아듭니다.
- **GitHub Actions 자동 배포**: `.github/workflows/deploy.yml` 파일이 구성되어 있어 `main` 브랜치에 코드를 푸시하면 자동으로 GitHub Pages에 빌드 및 배포가 완료됩니다.
