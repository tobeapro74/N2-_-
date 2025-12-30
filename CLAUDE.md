# Claude Code 프로젝트 규칙

이 문서는 Claude Code가 이 프로젝트에서 작업할 때 따라야 할 규칙을 정의합니다.

## 언어 및 커뮤니케이션 규칙

### 기본 응답 언어
- **모든 응답은 한국어로 작성합니다.**

### 코드 주석
- 모든 코드 주석은 **한국어**로 작성합니다.
- 예시:
  ```javascript
  // 사용자 인증 확인
  const requireAuth = (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/auth/login');
    }
    next();
  };
  ```

### 커밋 메시지
- Git 커밋 메시지는 **한국어**로 작성합니다.
- 형식: `[타입] 제목`
- 타입 예시:
  - `[기능]` - 새로운 기능 추가
  - `[수정]` - 버그 수정
  - `[개선]` - 기존 기능 개선
  - `[문서]` - 문서 관련 변경
  - `[리팩토링]` - 코드 리팩토링
  - `[스타일]` - 코드 스타일 변경 (포맷팅 등)
- 예시: `[기능] 회비 납부 3자리 콤마 포맷 적용`

### 문서화
- README.md, ROADMAP.md 등 모든 문서는 **한국어**로 작성합니다.
- 기술 용어는 영어 원문을 병기할 수 있습니다.
  - 예: PWA(Progressive Web App)

### 변수명 및 함수명
- 변수명과 함수명은 **영어**로 작성합니다. (국제 코드 표준 준수)
- camelCase 규칙을 따릅니다.
- 예시:
  ```javascript
  const memberList = [];           // 좋음
  const 회원목록 = [];              // 나쁨

  function calculateTotalAmount() {} // 좋음
  function 총금액계산() {}           // 나쁨
  ```

## 코드 스타일

### JavaScript
- ES6+ 문법 사용
- 세미콜론 필수
- 들여쓰기: 2 스페이스
- 문자열: 작은따옴표(`'`) 사용

### EJS 템플릿
- HTML 속성: 큰따옴표(`"`) 사용
- Bootstrap 5 클래스 사용
- 반응형 디자인 고려 (mobile-first)

### CSS
- BEM 명명 규칙 권장
- Bootstrap 유틸리티 클래스 우선 사용

## 프로젝트 구조

```
N2골프_자금관리/
├── app.js              # 메인 애플리케이션 파일
├── package.json        # 프로젝트 설정
├── CLAUDE.md           # Claude Code 규칙 (이 파일)
├── ROADMAP.md          # 프로젝트 로드맵
├── README.md           # 프로젝트 설명
├── data/               # JSON 데이터베이스
│   └── n2golf.json
├── models/             # 데이터 모델
│   ├── database.js
│   └── weather.js      # 날씨 서비스 (Open-Meteo API)
├── routes/             # Express 라우터
│   ├── auth.js
│   ├── finance.js
│   ├── members.js
│   ├── reservations.js
│   ├── schedules.js
│   └── weather.js      # 날씨 API 라우터
├── views/              # EJS 템플릿
│   ├── partials/
│   ├── auth/
│   ├── finance/
│   ├── members/
│   ├── reservations/
│   ├── schedules/
│   └── weather/        # 날씨 상세 화면
├── public/             # 정적 파일
│   ├── css/
│   ├── js/
│   ├── icons/
│   ├── manifest.json
│   └── sw.js
└── scripts/            # 유틸리티 스크립트
    └── init-db.js
```

## 작업 시 주의사항

1. **데이터 보존**: `data/n2golf.json` 파일의 기존 데이터를 임의로 초기화하지 않습니다.
2. **보안**: 비밀번호, API 키 등 민감한 정보를 코드에 하드코딩하지 않습니다.
3. **백업**: 중요한 변경 전 데이터 백업을 고려합니다.
4. **테스트**: 변경 후 주요 기능이 정상 작동하는지 확인합니다.

## 기술 문서

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)**: 시스템 아키텍처, 기술 스택 선택 배경, Cloudinary/MongoDB 사용 전략
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**: 자주 발생하는 문제와 해결 방법 (CSP, 캐시, 배포 에러 등)

## 연락처

- 프로젝트 관리자: NH투자증권 N2골프 동호회
