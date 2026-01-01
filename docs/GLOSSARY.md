# N2골프 자금관리 시스템 용어집

이 문서는 N2골프 자금관리 시스템에서 사용되는 개발 및 디자인 용어를 설명합니다.

---

## 1. 개발 (Development)

### 1.1 버전 관리 (Version Control)

#### Git
분산 버전 관리 시스템입니다. 코드의 변경 이력을 추적하고, 여러 개발자가 동시에 작업할 수 있게 해줍니다.
- **이 앱에서**: 모든 코드 변경사항을 Git으로 관리하며, GitHub에 원격 저장소를 두고 있습니다.

#### 커밋 (Commit)
코드 변경사항을 저장소에 기록하는 행위입니다. 각 커밋은 고유한 해시값(예: `658c62f`)을 가집니다.
- **이 앱에서**: 커밋 메시지는 한국어로 작성하며, `[기능]`, `[수정]`, `[개선]` 등의 태그를 사용합니다.
- **예시**: `[기능] 일상톡톡 커뮤니티 추가`

#### 푸시 (Push)
로컬 저장소의 커밋을 원격 저장소(GitHub)에 업로드하는 행위입니다.
- **이 앱에서**: `git push origin main` 명령으로 GitHub에 코드를 올립니다.

#### 브랜치 (Branch)
코드의 독립적인 개발 라인입니다. 메인 코드에 영향을 주지 않고 새로운 기능을 개발할 수 있습니다.
- **이 앱에서**: `main` 브랜치를 메인으로 사용합니다.

---

### 1.2 배포 및 호스팅 (Deployment & Hosting)

#### 호스팅 (Hosting)
웹사이트나 애플리케이션을 인터넷에서 접근할 수 있도록 서버에 올려두는 것입니다.
- **종류**:
  - **공유 호스팅**: 여러 사이트가 하나의 서버 공유 (저렴, 성능 제한)
  - **VPS (Virtual Private Server)**: 가상 전용 서버 (중간 비용)
  - **클라우드 호스팅**: AWS, GCP, Azure 등 (유연한 확장)
  - **PaaS (Platform as a Service)**: Vercel, Heroku, Netlify 등 (간편한 배포)
- **이 앱에서**: Vercel (PaaS)을 사용하여 호스팅합니다.

#### Vercel
프론트엔드 및 서버리스 애플리케이션을 위한 클라우드 플랫폼입니다. GitHub와 연동하여 자동 배포를 지원합니다.
- **이 앱에서**: GitHub에 푸시하면 Vercel이 자동으로 빌드하고 배포합니다.
- **특징**: 서버리스 함수(Serverless Functions)로 Node.js 백엔드를 실행합니다.
- **장점**: 무료 티어, 자동 HTTPS, 전역 CDN, 프리뷰 배포

#### Netlify
정적 사이트 및 서버리스 함수 호스팅 플랫폼입니다. Vercel과 유사한 서비스입니다.
- **특징**: 폼 처리, 인증, 서버리스 함수 지원
- **비교**: Vercel은 Next.js에 최적화, Netlify는 범용적

#### Heroku
PaaS(Platform as a Service) 플랫폼입니다. 다양한 언어와 프레임워크를 지원합니다.
- **특징**: 다양한 애드온(DB, 캐시 등), 쉬운 스케일링
- **비교**: Vercel보다 백엔드 중심, 유료 플랜 필요한 경우 많음

#### AWS (Amazon Web Services)
아마존의 클라우드 컴퓨팅 플랫폼입니다. 가장 광범위한 서비스를 제공합니다.
- **주요 서비스**:
  - EC2: 가상 서버
  - S3: 파일 저장소
  - Lambda: 서버리스 함수
  - RDS: 관계형 데이터베이스

#### 서버리스 (Serverless)
서버 관리 없이 코드를 실행하는 클라우드 컴퓨팅 모델입니다. 요청이 있을 때만 함수가 실행됩니다.
- **이 앱에서**: `app.js`가 Vercel 서버리스 함수로 실행됩니다.
- **장점**: 서버 관리 불필요, 사용한 만큼만 비용 지불, 자동 스케일링
- **단점**: 콜드 스타트 지연, 실행 시간 제한

#### 배포 (Deployment)
코드를 실제 서비스 환경에 적용하는 과정입니다.
- **이 앱에서**: `git push` → Vercel 자동 빌드 → 배포 완료 (약 1-2분 소요)

#### CI/CD (Continuous Integration / Continuous Deployment)
코드 변경 시 자동으로 테스트하고 배포하는 프로세스입니다.
- **이 앱에서**: GitHub에 푸시하면 Vercel이 자동으로 빌드/배포 (CD)
- **도구**: GitHub Actions, Jenkins, CircleCI, Vercel

#### 프리뷰 배포 (Preview Deployment)
Pull Request나 브랜치별로 독립적인 미리보기 환경을 제공하는 기능입니다.
- **이 앱에서**: Vercel이 브랜치별 프리뷰 URL 자동 생성

#### CDN (Content Delivery Network)
전 세계에 분산된 서버 네트워크로 콘텐츠를 빠르게 전달합니다.
- **이 앱에서**: Bootstrap CSS/JS, Bootstrap Icons를 CDN에서 로드합니다.
- **예시**: `https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css`
- **장점**: 빠른 로딩 속도, 서버 부하 감소, 캐싱

#### 도메인 (Domain)
웹사이트의 주소입니다. (예: `example.com`)
- **구성요소**:
  - TLD (Top Level Domain): `.com`, `.kr`, `.io` 등
  - 서브도메인: `www`, `api`, `blog` 등
- **이 앱에서**: Vercel이 기본 도메인(`*.vercel.app`) 제공, 커스텀 도메인 연결 가능

#### SSL/TLS (HTTPS)
웹 통신을 암호화하는 보안 프로토콜입니다.
- **이 앱에서**: Vercel이 자동으로 HTTPS 인증서 발급/갱신
- **중요성**: 데이터 보호, SEO 순위, 브라우저 경고 방지

---

### 1.3 프레임워크 및 라이브러리 (Frameworks & Libraries)

#### Next.js
React 기반의 풀스택 웹 프레임워크입니다. Vercel에서 개발했습니다.
- **특징**:
  - SSR (Server-Side Rendering) 지원
  - SSG (Static Site Generation) 지원
  - 파일 기반 라우팅
  - API Routes로 백엔드 구현
  - 이미지 최적화
- **비교**: 이 앱은 Express.js + EJS를 사용하지만, Next.js로 마이그레이션하면 React 기반 SPA로 전환 가능

#### React
Facebook(Meta)이 개발한 UI 라이브러리입니다. 컴포넌트 기반으로 UI를 구축합니다.
- **특징**:
  - Virtual DOM으로 효율적인 렌더링
  - JSX 문법 사용
  - 단방향 데이터 흐름
  - 풍부한 생태계 (Redux, React Router 등)

#### Vue.js
프로그레시브 JavaScript 프레임워크입니다. 점진적 도입이 가능합니다.
- **특징**:
  - 템플릿 기반 문법
  - 양방향 데이터 바인딩
  - 컴포넌트 시스템
  - 학습 곡선이 완만함

#### Angular
Google이 개발한 TypeScript 기반 프레임워크입니다.
- **특징**:
  - 완전한 프레임워크 (라우팅, HTTP 클라이언트 내장)
  - TypeScript 필수
  - 의존성 주입
  - 엔터프라이즈급 애플리케이션에 적합

#### SSR (Server-Side Rendering)
서버에서 HTML을 생성하여 클라이언트에 전송하는 방식입니다.
- **장점**: SEO 최적화, 빠른 초기 로딩
- **단점**: 서버 부하 증가
- **이 앱에서**: EJS 템플릿으로 서버에서 HTML 렌더링 (SSR 방식)

#### SSG (Static Site Generation)
빌드 시점에 HTML을 미리 생성하는 방식입니다.
- **장점**: 빠른 응답, CDN 캐싱 용이
- **단점**: 동적 콘텐츠 처리 제한
- **도구**: Next.js, Gatsby, Hugo, Jekyll

#### SPA (Single Page Application)
하나의 HTML 페이지에서 JavaScript로 동적 콘텐츠를 렌더링하는 방식입니다.
- **장점**: 빠른 페이지 전환, 앱 같은 경험
- **단점**: 초기 로딩 느림, SEO 불리
- **프레임워크**: React, Vue, Angular

#### MPA (Multi Page Application)
각 페이지가 별도의 HTML 파일로 구성되는 전통적인 방식입니다.
- **장점**: SEO 유리, 간단한 구조
- **단점**: 페이지 전환 시 깜빡임
- **이 앱에서**: Express.js + EJS로 MPA 방식 사용

#### TypeScript
JavaScript에 정적 타입을 추가한 프로그래밍 언어입니다.
- **장점**: 타입 안정성, IDE 자동완성, 리팩토링 용이
- **단점**: 학습 곡선, 컴파일 필요
- **비교**: 이 앱은 JavaScript를 사용하지만, 대규모 프로젝트에서는 TypeScript 권장

#### jQuery
DOM 조작을 쉽게 해주는 JavaScript 라이브러리입니다.
- **특징**: 간단한 문법, 크로스 브라우저 호환
- **현재 상태**: 모던 프레임워크(React, Vue)에 의해 대체되는 추세
- **이 앱에서**: 사용하지 않음 (Vanilla JavaScript 사용)

#### Tailwind CSS
유틸리티 우선(Utility-first) CSS 프레임워크입니다.
- **특징**: 미리 정의된 클래스 조합, 커스터마이징 용이
- **비교**: Bootstrap은 컴포넌트 중심, Tailwind는 유틸리티 중심
- **이 앱에서**: Bootstrap 사용 (유사한 역할)

#### Webpack
JavaScript 모듈 번들러입니다. 여러 파일을 하나로 묶어줍니다.
- **기능**: 코드 분할, 트리 쉐이킹, 로더(CSS, 이미지 처리)
- **대안**: Vite, Rollup, esbuild

#### Vite
차세대 프론트엔드 빌드 도구입니다. 빠른 개발 서버가 특징입니다.
- **장점**: 빠른 HMR (Hot Module Replacement), ES 모듈 기반
- **사용처**: Vue, React, Svelte 프로젝트

---

### 1.4 데이터베이스 (Database)

#### MongoDB Atlas
클라우드 기반 NoSQL 데이터베이스 서비스입니다. JSON과 유사한 문서(Document) 형태로 데이터를 저장합니다.
- **이 앱에서**: 프로덕션 환경(Vercel)에서 MongoDB Atlas를 사용합니다.
- **컬렉션**: members, schedules, reservations, community_posts 등

#### JSON 파일 데이터베이스
로컬 개발 환경에서 사용하는 간단한 데이터 저장 방식입니다.
- **이 앱에서**: `data/n2golf.json` 파일에 모든 데이터를 저장합니다 (로컬 개발용).

#### NoSQL
비관계형 데이터베이스입니다. 스키마가 유연하고 확장성이 좋습니다.
- **이 앱에서**: MongoDB는 NoSQL 데이터베이스로, 컬렉션(테이블)과 문서(행)로 구성됩니다.

---

### 1.5 백엔드 (Backend)

#### Node.js
JavaScript 런타임 환경입니다. 서버 측 애플리케이션을 JavaScript로 개발할 수 있습니다.
- **이 앱에서**: Express.js와 함께 사용하여 웹 서버를 구축합니다.

#### Express.js
Node.js 웹 애플리케이션 프레임워크입니다. 라우팅, 미들웨어 등을 쉽게 처리합니다.
- **이 앱에서**: `app.js`에서 Express 앱을 설정하고, `routes/` 폴더에 라우터를 정의합니다.

#### 라우팅 (Routing)
URL 경로에 따라 적절한 처리 함수를 연결하는 것입니다.
- **이 앱에서**:
  - `/` → 대시보드 (홈)
  - `/community` → 일상톡톡
  - `/schedules` → 골프 일정
  - `/members` → 회원 관리
  - `/finance` → 자금 관리

#### 미들웨어 (Middleware)
요청과 응답 사이에서 실행되는 함수입니다. 인증, 로깅, 에러 처리 등에 사용됩니다.
- **이 앱에서**:
  - `helmet`: 보안 헤더 설정
  - `compression`: 응답 압축
  - `express-session`: 세션 관리
  - `csurf`: CSRF 보호

#### API (Application Programming Interface)
프로그램 간 데이터를 주고받는 인터페이스입니다.
- **이 앱에서**:
  - `GET /community/posts` - 게시글 목록 조회
  - `POST /community/posts` - 게시글 작성
  - `PUT /community/posts/:id` - 게시글 수정
  - `DELETE /community/posts/:id` - 게시글 삭제

#### REST API
HTTP 메서드(GET, POST, PUT, DELETE)를 사용하여 리소스를 조작하는 API 설계 방식입니다.
- **이 앱에서**: 모든 API는 RESTful 방식으로 설계되어 있습니다.

---

### 1.6 프론트엔드 (Frontend)

#### EJS (Embedded JavaScript)
JavaScript 코드를 HTML에 삽입할 수 있는 템플릿 엔진입니다.
- **이 앱에서**: `views/` 폴더의 `.ejs` 파일들이 화면을 구성합니다.
- **문법**: `<%= 변수 %>`, `<% 코드 %>`, `<%- HTML %>`

#### Bootstrap
반응형 웹 디자인을 위한 CSS 프레임워크입니다.
- **이 앱에서**: Bootstrap 5를 사용하여 UI를 구성합니다.
- **클래스 예시**: `btn btn-success`, `card`, `d-flex`, `text-muted`

#### JavaScript (클라이언트)
웹 브라우저에서 실행되는 프로그래밍 언어입니다. 동적인 기능을 구현합니다.
- **이 앱에서**: 게시글 로드, 댓글 작성, 좋아요/싫어요, URL 미리보기 등

---

### 1.7 보안 (Security)

#### CSRF (Cross-Site Request Forgery)
사용자의 의도와 무관하게 공격자가 요청을 보내는 공격입니다.
- **이 앱에서**: `csurf` 미들웨어로 CSRF 토큰을 검증합니다.
- **구현**: `<meta name="csrf-token">`, 요청 시 `X-CSRF-Token` 헤더 전송

#### XSS (Cross-Site Scripting)
악성 스크립트를 웹 페이지에 삽입하는 공격입니다.
- **이 앱에서**: `escapeHtml()` 함수로 사용자 입력을 이스케이프합니다.

#### 세션 (Session)
사용자 로그인 상태를 서버에서 유지하는 방식입니다.
- **이 앱에서**: `express-session`으로 로그인 정보를 세션에 저장합니다.

#### Helmet
Express.js 보안 미들웨어입니다. 다양한 HTTP 헤더를 설정하여 보안을 강화합니다.
- **이 앱에서**: CSP, X-Frame-Options 등 보안 헤더를 설정합니다.

---

### 1.8 외부 서비스 연동

#### Cloudinary
클라우드 기반 이미지/동영상 관리 서비스입니다.
- **이 앱에서**: 게시글, 댓글에 첨부된 이미지를 Cloudinary에 업로드하고 URL을 저장합니다.
- **장점**: 자동 최적화, CDN 배포, 다양한 변환 기능

#### Open Graph
웹 페이지의 메타데이터를 표준화한 프로토콜입니다. 링크 공유 시 미리보기에 사용됩니다.
- **이 앱에서**: URL 미리보기 기능에서 Open Graph 태그를 파싱하여 썸네일, 제목, 설명을 표시합니다.

#### Open-Meteo API
무료 날씨 API 서비스입니다.
- **이 앱에서**: 골프장 날씨 정보를 조회합니다.

---

### 1.9 개발 도구

#### npm (Node Package Manager)
Node.js 패키지 관리자입니다. 라이브러리 설치, 스크립트 실행 등을 담당합니다.
- **명령어**:
  - `npm install` - 의존성 설치
  - `npm start` - 앱 실행
  - `npm run dev` - 개발 모드 실행 (nodemon)

#### package.json
프로젝트 설정 파일입니다. 의존성, 스크립트, 메타데이터 등을 정의합니다.
- **이 앱에서**: Express, MongoDB, EJS 등 의존성이 정의되어 있습니다.

#### nodemon
파일 변경을 감지하여 서버를 자동으로 재시작하는 개발 도구입니다.
- **이 앱에서**: `npm run dev`로 실행하면 nodemon이 동작합니다.

#### 환경 변수 (Environment Variables)
설정값을 코드 외부에서 관리하는 방식입니다. 보안 정보(API 키, DB 연결 문자열)에 사용됩니다.
- **이 앱에서**: `.env` 파일에 `MONGODB_URI`, `CLOUDINARY_*` 등을 저장합니다.

---

## 2. UI/UX (디자인)

### 2.1 사용자 경험 패턴

#### Pull-to-Refresh (당겨서 새로고침)
모바일에서 화면을 아래로 당기면 콘텐츠가 새로고침되는 패턴입니다.
- **이 앱에서**: 홈, 일상톡톡, 골프일정 톡톡에서 사용 가능합니다.
- **동작**: 화면 상단에서 80px 이상 당기면 → "놓으면 새로고침" → 새로고침 실행

#### 로딩 인디케이터 (Loading Indicator)
작업이 진행 중임을 사용자에게 알려주는 시각적 요소입니다.
- **이 앱에서**:
  - 전역 로딩 오버레이 (페이지 이동 시)
  - Pull-to-Refresh 인디케이터
  - 스피너 (데이터 로드 시)

#### 무한 스크롤 / 더보기 (Infinite Scroll / Load More)
콘텐츠를 페이지 단위로 점진적으로 로드하는 패턴입니다.
- **이 앱에서**: 일상톡톡에서 "더보기" 버튼으로 추가 게시글을 로드합니다.

#### 토스트 / 알림 (Toast / Notification)
일시적인 메시지를 표시하는 작은 팝업입니다.
- **이 앱에서**: 작업 완료, 오류 발생 시 알림 메시지를 표시합니다.

#### 모달 (Modal)
현재 화면 위에 떠오르는 대화상자입니다. 사용자의 주의를 집중시킵니다.
- **이 앱에서**: 삭제 확인, 상태 변경 확인 등에 사용됩니다.

---

### 2.2 레이아웃

#### 반응형 웹 디자인 (Responsive Web Design)
화면 크기에 따라 레이아웃이 자동으로 조정되는 디자인입니다.
- **이 앱에서**: Bootstrap 그리드 시스템 사용 (`col-12`, `col-md-6`, `col-lg-4`)
- **브레이크포인트**: sm(576px), md(768px), lg(992px), xl(1200px)

#### Mobile-First
모바일 화면을 기준으로 먼저 디자인하고, 큰 화면으로 확장하는 접근법입니다.
- **이 앱에서**: 모바일 화면에 최적화된 컴팩트한 UI를 기본으로 합니다.

#### 카드 (Card)
콘텐츠를 담는 컨테이너 UI 요소입니다. 그림자와 테두리로 구분됩니다.
- **이 앱에서**: 게시글, 댓글, 일정 정보 등을 카드로 표시합니다.
- **스타일**: `card border-0 shadow-sm`

#### 네비게이션 바 (Navigation Bar)
앱의 주요 메뉴를 제공하는 상단 바입니다.
- **이 앱에서**: 로고, 메뉴(예약, 일정, 자금, 회원), 사용자 정보가 표시됩니다.

---

### 2.3 인터랙션

#### 호버 효과 (Hover Effect)
마우스를 요소 위에 올렸을 때 변화하는 효과입니다.
- **이 앱에서**: 버튼, 링크에 호버 시 색상 변경 효과가 적용됩니다.

#### 클릭 피드백 (Click Feedback)
사용자가 클릭했을 때 시각적/촉각적 반응을 제공합니다.
- **이 앱에서**: 버튼 클릭 시 색상 변화, 좋아요 버튼 아이콘 변경 등

#### 스크롤 투 뷰 (Scroll Into View)
특정 요소가 화면에 보이도록 자동 스크롤하는 기능입니다.
- **이 앱에서**: 새 게시글 작성 후 해당 게시글로 스크롤합니다.

#### 접기/펼치기 (Collapse/Expand)
콘텐츠를 숨기거나 표시하는 토글 기능입니다.
- **이 앱에서**: 게시글의 댓글 섹션을 접거나 펼칠 수 있습니다.

---

### 2.4 폼 디자인

#### 입력 필드 (Input Field)
사용자가 텍스트를 입력하는 요소입니다.
- **이 앱에서**: 게시글 작성, 댓글 입력, 검색 등에 사용됩니다.
- **스타일**: `form-control`, `form-control-sm`

#### 텍스트에어리어 (Textarea)
여러 줄의 텍스트를 입력할 수 있는 요소입니다.
- **이 앱에서**: 게시글 작성 (최대 1000자), 댓글 작성 (최대 500자)

#### 버튼 (Button)
클릭하여 작업을 수행하는 요소입니다.
- **이 앱에서**:
  - `btn-success` (녹색) - 주요 액션 (저장, 게시)
  - `btn-outline-secondary` - 보조 액션 (취소)
  - `btn-danger` - 위험 액션 (삭제)

#### 파일 업로드 (File Upload)
이미지 등 파일을 선택하여 업로드하는 기능입니다.
- **이 앱에서**: 이미지 버튼 클릭 → 파일 선택 → Cloudinary 업로드

---

### 2.5 시각적 요소

#### 아이콘 (Icon)
작은 그래픽 요소로 의미를 전달합니다.
- **이 앱에서**: Bootstrap Icons 사용 (`bi-chat-heart`, `bi-hand-thumbs-up` 등)

#### 뱃지 (Badge)
상태나 개수를 표시하는 작은 라벨입니다.
- **이 앱에서**: 댓글 수, 새 글 표시, 관리자 표시 등

#### 구분선 (Divider)
콘텐츠를 시각적으로 구분하는 선입니다.
- **이 앱에서**: `border-top`, `border-start` 클래스 사용

#### 타임스탬프 (Timestamp)
시간 정보를 표시하는 텍스트입니다.
- **이 앱에서**: "방금 전", "5분 전", "2시간 전", "3일 전" 형식으로 표시

---

### 2.6 접근성 (Accessibility)

#### 스킵 링크 (Skip Link)
키보드 사용자가 반복되는 콘텐츠를 건너뛸 수 있는 링크입니다.
- **이 앱에서**: "본문으로 바로가기" 링크가 숨겨져 있다가 포커스 시 표시됩니다.

#### ARIA 속성
스크린 리더를 위한 접근성 속성입니다.
- **이 앱에서**: `aria-label`, `aria-hidden`, `role` 속성 사용

#### 포커스 스타일 (Focus Style)
키보드로 탐색할 때 현재 선택된 요소를 표시합니다.
- **이 앱에서**: 녹색 테두리로 포커스 요소를 표시합니다.

---

### 2.7 색상 시스템

#### 주요 색상 (Primary Color)
앱의 브랜드 색상입니다.
- **이 앱에서**: 녹색 (`#198754`, Bootstrap의 `success` 색상)

#### 보조 색상 (Secondary Color)
보조적인 UI 요소에 사용됩니다.
- **이 앱에서**: 회색 계열 (`#6c757d`)

#### 상태 색상 (Status Colors)
상태를 나타내는 색상입니다.
- **이 앱에서**:
  - 녹색 (success) - 확정, 성공
  - 노란색 (warning) - 대기, 주의
  - 빨간색 (danger) - 취소, 오류
  - 파란색 (primary) - 정보, 좋아요

---

## 3. PWA (Progressive Web App)

### 매니페스트 (Manifest)
웹 앱의 메타데이터를 정의하는 JSON 파일입니다. 홈 화면 추가 시 사용됩니다.
- **이 앱에서**: `public/manifest.json`에 앱 이름, 아이콘, 테마 색상 등이 정의됩니다.

### 서비스 워커 (Service Worker)
백그라운드에서 실행되는 스크립트입니다. 오프라인 지원, 푸시 알림 등에 사용됩니다.
- **이 앱에서**: `public/sw.js`에 캐싱 전략이 정의됩니다.

### 홈 화면 추가 (Add to Home Screen)
웹 앱을 네이티브 앱처럼 설치할 수 있는 기능입니다.
- **이 앱에서**: iOS Safari, Android Chrome에서 "홈 화면에 추가" 가능

---

## 4. 데이터 구조

### 컬렉션 (Collection)
MongoDB에서 문서들을 그룹화하는 단위입니다. 관계형 DB의 테이블과 유사합니다.
- **이 앱의 컬렉션**:
  - `members` - 회원 정보
  - `schedules` - 골프 일정
  - `reservations` - 예약 정보
  - `community_posts` - 일상톡톡 게시글
  - `community_comments` - 일상톡톡 댓글
  - `community_reactions` - 좋아요/싫어요

### 문서 (Document)
MongoDB에서 데이터의 기본 단위입니다. JSON 형태의 객체입니다.
- **예시** (게시글):
```json
{
  "id": 1,
  "member_id": 5,
  "content": "오늘 날씨가 좋네요!",
  "image_url": "https://...",
  "created_at": "2026-01-01T10:00:00Z"
}
```

---

*마지막 업데이트: 2026-01-01*
