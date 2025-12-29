# Claude Code로 앱 만들기 가이드

이 문서는 Claude Code를 활용하여 웹 애플리케이션을 처음부터 끝까지 개발하는 과정을 단계별로 안내합니다.

---

## 목차

1. [기획 및 프로젝트 초기화](#1-기획-및-프로젝트-초기화)
2. [프로젝트 구조 설정](#2-프로젝트-구조-설정)
3. [Git 초기화 및 설정](#3-git-초기화-및-설정)
4. [GitHub 연결](#4-github-연결)
5. [데이터베이스 설정 (MongoDB Atlas)](#5-데이터베이스-설정-mongodb-atlas)
6. [개발 진행](#6-개발-진행)
7. [배포 (Vercel)](#7-배포-vercel)
8. [유지보수 및 문서화](#8-유지보수-및-문서화)
9. [트러블슈팅 가이드](#9-트러블슈팅-가이드)

---

## 1. 기획 및 프로젝트 초기화

### 1.1 앱 기획하기

앱을 만들기 전에 다음 사항을 정리합니다:
- **목적**: 무엇을 위한 앱인가?
- **주요 기능**: 어떤 기능이 필요한가?
- **사용자**: 누가 사용하는가?
- **데이터**: 어떤 데이터를 저장하고 관리하는가?

### 1.2 Claude Code에 프로젝트 설명하기

#### Next.js 프로젝트 시작 프롬프트 예시

```
새로운 Next.js 프로젝트를 만들어줘.

프로젝트 개요:
- 프로젝트명: [프로젝트명]
- 목적: [앱의 목적 설명]
- 주요 기능:
  1. [기능1]
  2. [기능2]
  3. [기능3]

기술 스택:
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui (UI 컴포넌트)
- MongoDB Atlas (데이터베이스)
- NextAuth.js (인증)

프로젝트 폴더를 생성하고 기본 구조를 설정해줘.
```

#### Node.js + Express 프로젝트 시작 프롬프트 예시

```
새로운 Node.js Express 프로젝트를 만들어줘.

프로젝트 개요:
- 프로젝트명: [프로젝트명]
- 목적: [앱의 목적 설명]
- 주요 기능:
  1. [기능1]
  2. [기능2]
  3. [기능3]

기술 스택:
- Node.js + Express
- EJS 템플릿 (서버사이드 렌더링)
- Bootstrap 5 (UI 프레임워크)
- MongoDB Atlas (데이터베이스)
- express-session (세션 관리)

프로젝트 폴더를 생성하고 기본 구조를 설정해줘.
```

### 1.3 프로젝트 생성 명령어

#### Next.js 프로젝트 생성

```bash
npx create-next-app@latest 프로젝트명 --typescript --tailwind --eslint --app --src-dir
cd 프로젝트명

# shadcn/ui 초기화 (필수)
npx shadcn@latest init
```

#### shadcn/ui 컴포넌트 설치

```bash
# 자주 사용하는 컴포넌트 설치 예시
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add form
npx shadcn@latest add table
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add toast
```

#### Node.js + Express 프로젝트 생성

```bash
mkdir 프로젝트명
cd 프로젝트명
npm init -y
npm install express ejs express-session bcryptjs mongodb dotenv
```

---

## 2. 프로젝트 구조 설정

### 2.1 Next.js 프로젝트 구조

```
프로젝트명/
├── src/
│   ├── app/                    # App Router 페이지
│   │   ├── layout.tsx          # 공통 레이아웃
│   │   ├── page.tsx            # 홈페이지
│   │   ├── api/                # API 라우트
│   │   │   └── auth/
│   │   └── (routes)/           # 페이지 그룹
│   ├── components/             # React 컴포넌트
│   │   └── ui/                 # shadcn/ui 컴포넌트 (자동 생성)
│   ├── lib/                    # 유틸리티 함수
│   │   └── utils.ts            # shadcn/ui 유틸리티 (cn 함수)
│   └── styles/                 # 스타일 파일
├── public/                     # 정적 파일
├── components.json             # shadcn/ui 설정
├── .env.local                  # 환경 변수
├── next.config.js              # Next.js 설정
└── package.json
```

#### Next.js 구조 설정 프롬프트

```
다음과 같은 Next.js 프로젝트 구조를 만들어줘:

1. src/app 폴더에 App Router 기반 라우팅
2. src/components에 재사용 가능한 컴포넌트
3. src/lib에 데이터베이스 연결 및 유틸리티
4. API 라우트는 src/app/api 아래에 구성

기본 레이아웃과 홈페이지를 먼저 만들어줘.
```

### 2.2 Node.js + Express 프로젝트 구조

```
프로젝트명/
├── app.js                      # 메인 애플리케이션
├── config/                     # 설정 파일
│   └── index.js
├── models/                     # 데이터 모델
│   └── database.js
├── routes/                     # 라우터
│   ├── index.js
│   ├── auth.js
│   └── [기능별].js
├── views/                      # EJS 템플릿
│   ├── partials/
│   │   ├── header.ejs
│   │   └── footer.ejs
│   └── [페이지별].ejs
├── public/                     # 정적 파일
│   ├── css/
│   ├── js/
│   └── images/
├── middleware/                 # 미들웨어
│   └── auth.js
├── utils/                      # 유틸리티
├── .env                        # 환경 변수
└── package.json
```

#### Express 구조 설정 프롬프트

```
다음과 같은 Express 프로젝트 구조를 만들어줘:

1. app.js - 메인 애플리케이션 설정
2. routes/ - 기능별 라우터 분리
3. views/ - EJS 템플릿 (partials 포함)
4. models/ - 데이터베이스 모델
5. middleware/ - 인증 미들웨어
6. public/ - 정적 파일 (CSS, JS, 이미지)

기본 서버 설정과 홈페이지 라우트를 만들어줘.
```

### 2.3 환경 변수 설정

#### .env 파일 생성 프롬프트

```
프로젝트에 필요한 환경 변수 파일을 만들어줘.

필요한 환경 변수:
- PORT: 서버 포트
- SESSION_SECRET: 세션 암호화 키
- MONGODB_URI: MongoDB 연결 문자열
- NODE_ENV: 개발/프로덕션 환경

.env.example 파일도 함께 만들어줘 (실제 값은 비워두고).
```

---

## 3. Git 초기화 및 설정

### 3.1 Git 초기화

```bash
# 프로젝트 폴더에서 실행
git init
```

### 3.2 .gitignore 설정

#### .gitignore 생성 프롬프트

```
이 프로젝트에 맞는 .gitignore 파일을 만들어줘.

제외해야 할 항목:
- node_modules
- .env (환경 변수)
- 빌드 결과물
- IDE 설정 파일
- OS 시스템 파일
- 로그 파일
```

#### 기본 .gitignore 예시

```gitignore
# 의존성
node_modules/
.pnp
.pnp.js

# 환경 변수
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# 빌드 결과물
.next/
out/
build/
dist/

# 로그
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# 기타
*.log
coverage/
```

### 3.3 첫 번째 커밋

```bash
git add .
git commit -m "[초기] 프로젝트 초기 설정"
```

---

## 4. GitHub 연결

### 4.1 GitHub 가입 및 설정

1. **GitHub 가입**
   - https://github.com 접속
   - "Sign up" 클릭
   - 이메일, 비밀번호, 사용자명 입력
   - 이메일 인증 완료

2. **SSH 키 설정 (권장)**

```bash
# SSH 키 생성
ssh-keygen -t ed25519 -C "your_email@example.com"

# SSH 키 복사
cat ~/.ssh/id_ed25519.pub
```

3. **GitHub에 SSH 키 등록**
   - GitHub → Settings → SSH and GPG keys → New SSH key
   - 복사한 키 붙여넣기

### 4.2 GitHub 저장소 생성

1. GitHub에서 "New repository" 클릭
2. 저장소 이름 입력
3. Public/Private 선택
4. "Create repository" 클릭

### 4.3 로컬 저장소와 GitHub 연결

```bash
# GitHub 저장소와 연결
git remote add origin git@github.com:사용자명/저장소명.git

# 또는 HTTPS 사용 시
git remote add origin https://github.com/사용자명/저장소명.git

# 첫 번째 푸시
git branch -M main
git push -u origin main
```

#### GitHub 연결 관련 프롬프트

```
GitHub 저장소를 생성하고 현재 프로젝트와 연결해줘.
저장소 URL: https://github.com/[사용자명]/[저장소명].git
```

---

## 5. 데이터베이스 설정 (MongoDB Atlas)

### 5.1 MongoDB Atlas 가입

1. https://www.mongodb.com/atlas 접속
2. "Try Free" 클릭
3. 계정 생성 (Google 계정으로 가입 가능)

### 5.2 클러스터 생성

1. "Build a Database" 클릭
2. **FREE tier (M0)** 선택 (무료)
3. 클라우드 제공자 선택 (AWS 권장)
4. 리전 선택 (서울: ap-northeast-2)
5. 클러스터 이름 입력
6. "Create" 클릭

### 5.3 데이터베이스 사용자 생성

1. Security → Database Access
2. "Add New Database User" 클릭
3. 사용자명, 비밀번호 입력
4. 권한: "Read and write to any database"
5. "Add User" 클릭

### 5.4 네트워크 액세스 설정

1. Security → Network Access
2. "Add IP Address" 클릭
3. **"Allow Access from Anywhere"** 선택 (0.0.0.0/0)
   - 또는 특정 IP만 허용
4. "Confirm" 클릭

### 5.5 연결 문자열 가져오기

1. Deployment → Database → Connect
2. "Connect your application" 선택
3. Driver: Node.js, Version: 최신
4. 연결 문자열 복사

```
mongodb+srv://사용자명:비밀번호@클러스터명.xxxxx.mongodb.net/데이터베이스명?retryWrites=true&w=majority
```

### 5.6 프로젝트에 MongoDB 연결

#### MongoDB 연결 프롬프트

```
MongoDB Atlas와 연결하는 코드를 만들어줘.

연결 정보:
- URI: mongodb+srv://[사용자명]:[비밀번호]@[클러스터].mongodb.net/[DB명]
- 환경 변수 MONGODB_URI 사용
- 연결 풀링 설정 포함
- 에러 처리 포함

로컬 개발 시에는 JSON 파일을, 프로덕션에서는 MongoDB를 사용하도록
듀얼 모드로 구성해줘.
```

#### 데이터 마이그레이션 프롬프트

```
기존 JSON 데이터를 MongoDB Atlas로 마이그레이션하는 스크립트를 만들어줘.

scripts/migrate-to-mongodb.js 파일로 생성하고,
실행 방법도 알려줘.
```

---

## 6. 개발 진행

### 6.1 UI 프레임워크 (shadcn/ui)

개발 시 UI 컴포넌트는 **shadcn/ui**를 사용합니다. shadcn/ui는 Radix UI 기반의 재사용 가능한 컴포넌트 라이브러리입니다.

#### shadcn/ui 특징

- 복사-붙여넣기 방식으로 컴포넌트 소유
- Tailwind CSS 기반 스타일링
- Radix UI 기반 접근성 지원
- 완전한 커스터마이징 가능

#### shadcn/ui 초기 설정

```bash
# 프로젝트에서 shadcn/ui 초기화
npx shadcn@latest init

# 초기화 시 선택 옵션:
# - TypeScript: Yes
# - Style: Default
# - Base color: Slate (또는 원하는 색상)
# - CSS variables: Yes
# - tailwind.config.js 위치: 기본값
# - components.json 위치: 기본값
# - 컴포넌트 경로: @/components
# - 유틸리티 경로: @/lib/utils
```

#### 컴포넌트 설치 및 사용

```bash
# 버튼 컴포넌트 설치
npx shadcn@latest add button

# 사용 예시 (TSX)
import { Button } from "@/components/ui/button"

export function MyComponent() {
  return (
    <Button variant="default">클릭</Button>
    <Button variant="destructive">삭제</Button>
    <Button variant="outline">취소</Button>
  )
}
```

#### 자주 사용하는 컴포넌트 목록

| 컴포넌트 | 용도 | 설치 명령어 |
|---------|------|------------|
| Button | 버튼 | `npx shadcn@latest add button` |
| Card | 카드 레이아웃 | `npx shadcn@latest add card` |
| Input | 입력 필드 | `npx shadcn@latest add input` |
| Form | 폼 (react-hook-form 통합) | `npx shadcn@latest add form` |
| Table | 테이블 | `npx shadcn@latest add table` |
| Dialog | 모달/다이얼로그 | `npx shadcn@latest add dialog` |
| Dropdown Menu | 드롭다운 메뉴 | `npx shadcn@latest add dropdown-menu` |
| Toast | 알림 메시지 | `npx shadcn@latest add toast` |
| Select | 선택 박스 | `npx shadcn@latest add select` |
| Tabs | 탭 인터페이스 | `npx shadcn@latest add tabs` |
| Badge | 배지/태그 | `npx shadcn@latest add badge` |
| Avatar | 프로필 이미지 | `npx shadcn@latest add avatar` |

#### UI 개발 프롬프트 예시

```
[페이지명] UI를 shadcn/ui로 구현해줘.

사용할 컴포넌트:
- Card: 메인 컨테이너
- Table: 데이터 목록
- Button: 액션 버튼
- Dialog: 상세보기 모달

필요한 컴포넌트가 없으면 먼저 설치해줘.
```

---

### 6.2 기능 개발 프롬프트 패턴

#### 새로운 기능 추가

```
[기능명] 기능을 추가해줘.

요구사항:
1. [상세 요구사항 1]
2. [상세 요구사항 2]
3. [상세 요구사항 3]

관련 파일:
- 라우터: routes/[파일명].js
- 뷰: views/[폴더]/[파일명].ejs
- 모델: [필요한 데이터 구조]

UI/UX:
- [디자인 요구사항]
- [반응형 고려사항]
```

#### 버그 수정

```
[현상] 문제가 발생하고 있어.

재현 단계:
1. [단계 1]
2. [단계 2]
3. [단계 3]

예상 동작: [어떻게 동작해야 하는지]
실제 동작: [현재 어떻게 동작하는지]

원인을 분석하고 수정해줘.
```

#### UI 개선

```
[페이지/컴포넌트]의 UI를 개선해줘.

현재 문제점:
- [문제 1]
- [문제 2]

개선 방향:
- [개선 사항 1]
- [개선 사항 2]

모바일 환경도 고려해줘 (iPhone 14 기준 390px).
```

### 6.2 개발 서버 실행

```bash
# Next.js
npm run dev

# Node.js + Express
npm start
# 또는
node app.js
```

### 6.3 코드 품질 관리

#### 코드 리뷰 프롬프트

```
방금 작성한 코드를 리뷰해줘.

확인 사항:
- 보안 취약점
- 성능 이슈
- 코드 스타일
- 에러 처리
- 중복 코드
```

#### 테스트 시나리오 작성 프롬프트

```
[기능명]에 대한 테스트 시나리오를 작성해줘.

포함할 항목:
- 정상 케이스
- 에러 케이스
- 엣지 케이스
- 권한 검사
```

---

## 7. 배포 (Vercel)

### 7.1 Vercel 가입

1. https://vercel.com 접속
2. GitHub 계정으로 로그인
3. 권한 승인

### 7.2 프로젝트 배포

1. "New Project" 클릭
2. GitHub 저장소 선택
3. 프레임워크 자동 감지 확인
4. 환경 변수 설정
   - `MONGODB_URI`
   - `SESSION_SECRET`
   - 기타 필요한 변수
5. "Deploy" 클릭

### 7.3 배포 관련 프롬프트

```
Vercel 배포를 위한 설정을 확인해줘.

확인 사항:
- vercel.json 설정 (필요한 경우)
- 환경 변수 목록
- 빌드 명령어
- 출력 디렉토리
```

### 7.4 커스텀 도메인 설정

1. Vercel 프로젝트 → Settings → Domains
2. 도메인 입력
3. DNS 설정 안내에 따라 도메인 설정

---

## 8. 유지보수 및 문서화

### 8.1 커밋 전 필수 업데이트

개발 작업을 완료하고 커밋하기 전에 다음 항목을 업데이트해야 합니다:

#### 필수 업데이트 프롬프트

```
지금까지 수정된 부분들에 대하여 다음 파일들을 최신 업데이트 시켜줘:

1. docs/prompt.md - 프롬프트 기록 업데이트
2. docs/code-reviewer.md - 코드 리뷰 결과 반영
3. docs/test-scenario.md - 테스트 시나리오 업데이트
4. docs/ux-expert.md - UX 개선 사항 반영

업데이트 완료 후 커밋과 푸시를 진행해줘.
```

### 8.2 문서화 파일 목록

| 파일 | 용도 | 업데이트 시점 |
|------|------|--------------|
| `docs/prompt.md` | 프롬프트 명령 기록 | 매 작업 후 |
| `docs/code-reviewer.md` | 코드 리뷰 결과 | 주요 기능 완료 후 |
| `docs/test-scenario.md` | 테스트 시나리오 | 기능 추가/수정 후 |
| `docs/ux-expert.md` | UX 분석 및 개선 | UI 변경 후 |
| `README.md` | 프로젝트 개요 | 주요 변경 시 |
| `ROADMAP.md` | 개발 로드맵 | 마일스톤 완료 시 |

### 8.3 커밋 메시지 규칙

```
[타입] 제목

타입:
- [기능] 새로운 기능 추가
- [수정] 버그 수정
- [개선] 기존 기능 개선
- [문서] 문서 관련 변경
- [리팩토링] 코드 리팩토링
- [스타일] 코드 스타일 변경
- [초기] 초기 설정
```

### 8.4 커밋 및 푸시 프롬프트

```
현재 변경사항을 커밋하고 푸시해줘.

변경 내용 요약:
- [변경사항 1]
- [변경사항 2]

커밋 메시지는 한국어로 작성해줘.
```

---

## 9. 트러블슈팅 가이드

### 9.1 Vercel 서버리스 환경 이슈

#### 문제: 데이터가 저장되지 않음

**원인**: Vercel 서버리스 환경은 읽기 전용 파일 시스템을 사용합니다.

**해결 방법**:
1. MongoDB Atlas와 같은 외부 데이터베이스 사용
2. 모든 데이터 쓰기 작업을 외부 DB로 전환

**관련 프롬프트**:
```
Vercel 서버리스 환경에서 데이터가 저장되지 않아.
MongoDB Atlas와 연동해서 데이터 영속성 문제를 해결해줘.
```

#### 문제: 세션이 유지되지 않음

**원인**: 서버리스 환경에서 메모리 기반 세션은 인스턴스 간에 공유되지 않습니다.

**해결 방법**:
1. MongoDB 기반 세션 스토어 사용 (`connect-mongo`)
2. JWT 토큰 기반 인증으로 전환

### 9.2 MongoDB 연결 이슈

#### 문제: MongoDB 연결 실패

**확인 사항**:
1. 연결 문자열이 올바른지 확인
2. 비밀번호에 특수문자가 있다면 URL 인코딩
3. Network Access에서 IP 허용 확인
4. 사용자 권한 확인

**관련 프롬프트**:
```
MongoDB 연결이 실패해. 연결 문자열과 설정을 확인해줘.

에러 메시지: [에러 메시지]
```

#### 문제: 캐시와 DB 데이터 불일치

**원인**: 메모리 캐시와 DB 데이터가 동기화되지 않음

**해결 방법**:
```javascript
// 데이터 변경 후 캐시 새로고침
if (db.refreshCache) {
  await db.refreshCache('테이블명');
}
```

### 9.3 인증 관련 이슈

#### 문제: CSRF 토큰 오류

**원인**: POST 요청에 CSRF 토큰이 누락됨

**해결 방법**:
```javascript
// 폼에 CSRF 토큰 추가
<input type="hidden" name="_csrf" value="<%= csrfToken %>">

// AJAX 요청에 헤더 추가
headers: {
  'X-CSRF-Token': csrfToken
}
```

#### 문제: 로그인 세션 만료

**확인 사항**:
1. 세션 쿠키 설정 확인
2. 세션 유효 기간 확인
3. 도메인/경로 설정 확인

### 9.4 UI/반응형 이슈

#### 문제: 모바일에서 레이아웃 깨짐

**확인 사항**:
1. viewport meta 태그 확인
2. 미디어 쿼리 브레이크포인트 확인
3. 고정 너비 요소 확인

**관련 프롬프트**:
```
모바일에서 [페이지명] 레이아웃이 깨져.
iPhone 14 (390px) 기준으로 수정해줘.
```

### 9.5 Git 관련 이슈

#### 문제: push 거부됨

**원인**: 원격 저장소에 로컬에 없는 커밋이 있음

**해결 방법**:
```bash
git pull origin main --rebase
git push origin main
```

#### 문제: 충돌 발생

**해결 방법**:
```bash
# 충돌 파일 확인
git status

# 충돌 해결 후
git add .
git commit -m "[수정] 충돌 해결"
git push
```

### 9.6 성능 이슈

#### 문제: 페이지 로딩 속도 저하

**확인 사항**:
1. 이미지 최적화
2. 불필요한 JavaScript 제거
3. 데이터베이스 쿼리 최적화
4. 캐싱 전략 검토

**관련 프롬프트**:
```
[페이지명] 로딩 속도가 느려. 성능을 분석하고 최적화해줘.
```

---

## 부록: 유용한 프롬프트 모음

### A. 프로젝트 시작

```
# 프로젝트 개요 설명
이 프로젝트에 대해 파악하고 현재 상태를 요약해줘.

# 프로젝트 규칙 설정
CLAUDE.md 파일을 만들어서 이 프로젝트의 코딩 규칙을 정의해줘.
- 응답 언어: 한국어
- 코드 주석: 한국어
- 커밋 메시지: 한국어
- 변수명: 영어 (camelCase)
```

### B. 기능 개발

```
# 기능 목록 정리
앞으로 개발할 기능 목록을 ROADMAP.md에 정리해줘.

# 특정 기능 구현
[기능명]을 구현해줘. 구현 전에 계획을 먼저 세워줘.

# API 엔드포인트 추가
[기능]을 위한 REST API 엔드포인트를 만들어줘.
- GET /api/[리소스]
- POST /api/[리소스]
- PUT /api/[리소스]/:id
- DELETE /api/[리소스]/:id
```

### C. 디버깅

```
# 에러 분석
다음 에러를 분석하고 해결해줘:
[에러 메시지]

# 로그 추가
[기능] 관련 코드에 디버깅용 로그를 추가해줘.

# 문제 재현
[문제 상황]을 재현할 수 있는 테스트 코드를 만들어줘.
```

### D. 배포 및 운영

```
# 배포 전 체크리스트
배포 전에 확인해야 할 사항을 체크해줘.

# 환경 변수 정리
프로덕션 환경에 필요한 환경 변수 목록을 정리해줘.

# 보안 점검
코드의 보안 취약점을 점검해줘.
```

---

---

## 부록 B: API 엔드포인트 목록 (N2골프 예시)

### 예약 관리 API

| 메서드 | 엔드포인트 | 설명 | 권한 |
|--------|-----------|------|------|
| POST | /reservations/apply | 예약 신청 | 회원 |
| POST | /reservations/cancel | 예약 취소 | 회원 |
| POST | /reservations/admin/delete | 예약 소프트 삭제 | 관리자 |
| POST | /reservations/admin/hard-delete | 예약 완전 삭제 | 관리자 |
| POST | /reservations/admin/update-status | 예약 상태 변경 | 관리자 |
| POST | /reservations/admin/update-team | 팀/티타임 변경 | 관리자 |
| GET | /reservations/admin/team-balance/:scheduleId | 팀 균형 정보 조회 | 관리자 |
| POST | /reservations/admin/swap-team | 팀 멤버 교환 | 관리자 |
| POST | /reservations/admin/revert-swap | 팀 교환 원복 | 관리자 |
| DELETE | /reservations/admin/clear-admin-reservations | 관리자 예약 전체 삭제 | 관리자 |

### 일정 관리 API

| 메서드 | 엔드포인트 | 설명 | 권한 |
|--------|-----------|------|------|
| GET | /schedules | 일정 목록 | 공개 |
| GET | /schedules/:id | 일정 상세 | 공개 |
| POST | /schedules/create | 일정 생성 | 관리자 |
| POST | /schedules/:id/edit | 일정 수정 | 관리자 |
| POST | /schedules/:id/assign-teams | 팀 배정 | 관리자 |

---

*이 문서는 N2골프 자금관리 프로젝트 개발 경험을 바탕으로 작성되었습니다.*

*마지막 업데이트: 2024-12-29 23:30*
