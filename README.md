# N2골프 동호회 관리 시스템

NH투자증권 N2골프 동호회를 위한 자금 및 예약 관리 웹 애플리케이션입니다.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Express](https://img.shields.io/badge/Express-4.18-blue)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-purple)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 주요 기능

### 회원 관리
- 76명 회원 정보 관리
- 부서별 분류
- 회원 상태 관리 (활동/휴면/탈퇴)

### 일정 관리
- 2025/2026년 연간 일정 자동 생성
- 3개 골프장 지원
  - 양지파인GC (매월 3째주 토요일)
  - 대영힐스GC (홀수달 1째주 토요일)
  - 대영베이스GC (짝수달 1째주 토요일)
- 일정 상태 관리 (오픈전/예약가능/마감/완료/취소)
- 관리자용 일괄 상태 변경 도구

### 예약 관리
- 온라인 예약 신청/취소
- 예약 현황 실시간 확인
- 팀 구성 관리

### 자금 관리
- 회비 납부 관리
- 입출금 내역 관리
- 카테고리별 수입/지출 통계
- 월별 현황 대시보드

### 코스 가이드
- 골프장별 코스 정보
- 홀별 상세 정보 (파/거리/핸디캡)
- 공략 포인트 및 추천 클럽

### 골프장 날씨
- 실시간 날씨 정보 (Open-Meteo API)
- 1주일 예보
- 골프 플레이 적합도 평가
- 라운딩 조언 (복장/클럽/준비사항)

### 실시간 교통 현황
- 카카오 모빌리티 API 연동
- 여의도역/잠실역 출발 소요시간
- 교통 상태 표시 (원활/보통/정체)
- 하루 1회 자동 조회 + 수동 새로고침

### 커뮤니티 (일정별 댓글)
- 일정별 댓글 작성/수정/삭제
- 이미지 첨부 (Cloudinary 저장)
- URL 링크 미리보기 (Open Graph)
- 좋아요/싫어요 리액션
- 실시간 시간 표시 (방금 전, n시간 전 등)

### PWA 지원
- 모바일 홈 화면 추가
- 오프라인 캐싱
- 앱처럼 사용 가능

## 빠른 시작

### 요구 사항
- Node.js 18 이상
- npm 또는 yarn

### 설치

```bash
# 저장소 클론
git clone [repository-url]
cd N2골프_자금관리

# 의존성 설치
npm install

# 데이터베이스 초기화 (최초 1회)
npm run init-db

# 개발 서버 실행
npm run dev
```

### 접속

브라우저에서 http://localhost:3000 으로 접속합니다.

## 기본 계정

| 역할 | 이름 | 비밀번호 |
|------|------|----------|
| 관리자 | 관리자 | admin123 |
| 일반 회원 | (회원 이름) | 1234 |

## 프로젝트 구조

```
N2골프_자금관리/
├── app.js              # 메인 애플리케이션
├── package.json        # 프로젝트 설정
├── CLAUDE.md           # Claude Code 규칙
├── ROADMAP.md          # 프로젝트 로드맵
├── README.md           # 이 파일
├── data/               # JSON 데이터베이스
├── models/             # 데이터 모델 (날씨 서비스 포함)
├── routes/             # Express 라우터 (날씨 API 포함)
├── views/              # EJS 템플릿 (날씨 상세 화면 포함)
├── public/             # 정적 파일 (CSS, JS, 아이콘)
└── scripts/            # 유틸리티 스크립트
```

## 기술 스택

- **백엔드**: Node.js, Express.js
- **프론트엔드**: EJS, Bootstrap 5, Chart.js
- **데이터베이스**: MongoDB Atlas (프로덕션) / JSON 파일 (로컬)
- **이미지 저장**: Cloudinary CDN
- **배포**: Vercel (서버리스)
- **인증**: cookie-session, bcryptjs
- **교통 API**: 카카오 모빌리티
- **분석**: Vercel Analytics

## 스크립트

```bash
npm start       # 프로덕션 모드 실행
npm run dev     # 개발 모드 실행 (nodemon)
npm run init-db # 데이터베이스 초기화
```

## 바탕화면 바로가기 추가

### PC (Chrome)
1. 웹사이트 접속
2. 주소창 오른쪽의 설치 아이콘 클릭
3. "설치" 버튼 클릭

### 모바일 (Android)
1. Chrome에서 웹사이트 접속
2. 메뉴(⋮) → "홈 화면에 추가" 클릭

### 모바일 (iPhone)
1. Safari에서 웹사이트 접속
2. 공유 버튼(□↑) → "홈 화면에 추가" 클릭

## 기술 문서

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)**: 시스템 아키텍처, 기술 스택 선택 배경
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**: 자주 발생하는 문제와 해결 방법

## 라이선스

MIT License

## 연락처

NH투자증권 N2골프 동호회

---

*N2골프 - 함께하는 즐거운 라운딩!*
