# N2골프 시스템 아키텍처

## 목차
1. [기술 스택 선택 배경](#1-기술-스택-선택-배경)
2. [이미지 저장소 전략](#2-이미지-저장소-전략)
3. [데이터베이스 아키텍처](#3-데이터베이스-아키텍처)
4. [Vercel 서버리스 환경 대응](#4-vercel-서버리스-환경-대응)
5. [보안 설정 (CSP)](#5-보안-설정-csp)
6. [URL 미리보기 시스템](#6-url-미리보기-시스템)
7. [성능 최적화](#7-성능-최적화)
8. [실시간 교통 현황](#8-실시간-교통-현황)
9. [전역 로딩 인디케이터](#9-전역-로딩-인디케이터)
10. [Pull-to-Refresh (당겨서 새로고침)](#10-pull-to-refresh-당겨서-새로고침)
11. [커뮤니티 리액션 시각화](#11-커뮤니티-리액션-시각화)

---

## 1. 기술 스택 선택 배경

### 호스팅: Vercel (무료)
- **선택 이유**: 무료 서버리스 호스팅, GitHub 자동 배포
- **제약**: 함수 실행 시간 10초(무료), 메모리 기반 세션 사용 불가
- **대응**: cookie-session 사용, 함수 타임아웃 30초로 설정

### 데이터베이스: MongoDB Atlas (무료 M0)
- **선택 이유**: 무료 512MB, JSON 구조와 호환성 좋음
- **제약**: 512MB 저장 공간, 연결 수 제한
- **대응**: 연결 풀링, 이미지는 외부 저장소 사용

### 이미지 저장: Cloudinary (무료)
- **선택 이유**: 무료 25GB 대역폭/월, 자동 이미지 최적화
- **제약**: 용량 제한, 월간 대역폭 제한
- **대응**: MongoDB Base64 폴백 구현

---

## 2. 이미지 저장소 전략

### 2.1 왜 Cloudinary를 선택했나?

#### MongoDB에 이미지 직접 저장의 문제점
```
❌ 문제점:
- 512MB 무료 용량에서 이미지가 빠르게 공간 소모
- Base64 인코딩 시 33% 용량 증가
- 문서당 16MB 제한
- 이미지 로드 시 서버 부하 증가
```

#### Cloudinary 장점
```
✅ 장점:
- 무료 25GB 대역폭/월
- CDN 기반 빠른 이미지 로드
- 자동 이미지 최적화 (WebP 변환, 리사이징)
- MongoDB 용량 절약
```

### 2.2 하이브리드 저장 전략

```
이미지 업로드 요청
        │
        ▼
┌─────────────────────┐
│ Cloudinary 설정됨?  │
└─────────────────────┘
        │
   ┌────┴────┐
   │ Yes     │ No
   ▼         ▼
┌─────────┐ ┌──────────────┐
│Cloudinary│ │ MongoDB      │
│ 업로드   │ │ Base64 저장  │
└─────────┘ └──────────────┘
   │              │
   │   실패 시    │
   └──────────────┘
        │
        ▼
   URL 반환
```

### 2.3 구현 코드 (routes/schedules.js)

```javascript
// 1. Cloudinary 시도
if (isCloudinaryConfigured()) {
  try {
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(base64Data, {
      folder: 'n2golf/comments',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good' }
      ]
    });
    imageUrl = result.secure_url;
    storageType = 'cloudinary';
  } catch (error) {
    // Cloudinary 실패 시 MongoDB로 폴백
  }
}

// 2. Cloudinary 실패 시 MongoDB Base64 저장
if (!imageUrl) {
  if (req.file.size > 2 * 1024 * 1024) {
    return res.status(400).json({ error: '2MB 이하 이미지만 가능' });
  }
  imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  storageType = 'mongodb';
}
```

### 2.4 환경 변수 설정

```env
# .env 또는 Vercel 환경 변수
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

---

## 3. 데이터베이스 아키텍처

### 3.1 로컬 vs 프로덕션 환경

```
┌─────────────────────────────────────────────────────┐
│                    로컬 개발 환경                    │
│  ┌─────────────┐                                    │
│  │ JSON 파일   │  data/n2golf.json                  │
│  │ (동기 I/O)  │  빠른 개발, Git 추적 가능           │
│  └─────────────┘                                    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   Vercel 프로덕션                    │
│  ┌─────────────┐    ┌─────────────┐                 │
│  │ MongoDB     │◄──►│ 메모리 캐시 │                 │
│  │ Atlas M0    │    │ (mongoCache)│                 │
│  └─────────────┘    └─────────────┘                 │
└─────────────────────────────────────────────────────┘
```

### 3.2 MongoDB 무료 플랜(M0) 활용

#### 장점
- **무료 512MB**: 소규모 동호회 운영에 충분
- **자동 백업**: 일일 스냅샷 제공
- **글로벌 클러스터**: AWS/GCP/Azure 선택 가능
- **Vercel과 호환**: 서버리스 환경에서 연결 가능

#### 제약과 대응
| 제약 | 대응 방법 |
|------|-----------|
| 512MB 용량 | 이미지는 Cloudinary 사용 |
| 동시 연결 500개 | 연결 풀링으로 관리 |
| 낮은 IOPS | 캐시 활용 |

### 3.3 데이터 구조

```javascript
// 컬렉션 구조
{
  members: [...],           // 회원 정보
  schedules: [...],         // 일정
  reservations: [...],      // 예약
  finances: [...],          // 회비/재정
  schedule_comments: [...], // 댓글 (image_url 필드 포함)
  comment_reactions: [...], // 좋아요/싫어요
  golf_courses: [...]       // 골프장 정보
}

// 댓글 문서 예시
{
  id: 123,
  schedule_id: 45,
  member_id: 1,
  content: "좋은 라운딩이었습니다!",
  image_url: "https://res.cloudinary.com/...",  // Cloudinary URL
  created_at: "2024-12-30T10:00:00Z"
}
```

---

## 4. Vercel 서버리스 환경 대응

### 4.1 서버리스의 특성

```
전통적 서버:
┌────────────────────────────────┐
│  Node.js 프로세스 (지속 실행)   │
│  ┌────────────────────────┐   │
│  │ 메모리 캐시 (공유)      │   │
│  └────────────────────────┘   │
└────────────────────────────────┘

서버리스 (Vercel):
┌──────────┐ ┌──────────┐ ┌──────────┐
│ 인스턴스A │ │ 인스턴스B │ │ 인스턴스C │
│ 캐시A    │ │ 캐시B    │ │ 캐시C    │ ← 각자 독립된 메모리
└──────────┘ └──────────┘ └──────────┘
     │            │            │
     └────────────┼────────────┘
                  ▼
           ┌──────────┐
           │ MongoDB  │ ← 공유 데이터 소스
           └──────────┘
```

### 4.2 캐시 불일치 문제

**문제 상황:**
1. 사용자 A가 인스턴스 1에서 댓글 삭제
2. 인스턴스 1의 캐시만 업데이트
3. 사용자 B가 인스턴스 2에서 조회
4. 인스턴스 2의 오래된 캐시에서 삭제된 댓글 반환

### 4.3 해결: 동기/비동기 조회 분리

```javascript
// models/database.js

// 동기 조회 (캐시 사용) - 읽기 전용 페이지에 적합
getTable(name) {
  if (useMongoDb && this.mongoCache[name]) {
    return this.mongoCache[name];
  }
  return this.data[name] || [];
}

// 비동기 조회 (MongoDB 직접) - 데이터 정합성 중요할 때
async getTableAsync(name) {
  if (useMongoDb) {
    const collection = await this.getCollection(name);
    const data = await collection.find({}).toArray();
    this.mongoCache[name] = data;  // 캐시도 갱신
    return data;
  }
  return this.data[name] || [];
}
```

### 4.4 사용 가이드

| 상황 | 메서드 | 이유 |
|------|--------|------|
| 목록 페이지 렌더링 | `getTable()` | 약간의 지연 허용 |
| 댓글 삭제/수정 전 조회 | `getTableAsync()` | 정확한 데이터 필요 |
| 리액션 처리 | `getTableAsync()` | 중복 방지 |

---

## 5. 보안 설정 (CSP)

### 5.1 Content Security Policy란?

브라우저가 허용하지 않은 외부 리소스 로드를 차단하는 보안 정책.

### 5.2 현재 CSP 설정 (app.js)

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],

      // JavaScript 로드 허용
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],

      // 인라인 이벤트 핸들러 (onclick 등)
      scriptSrcAttr: ["'unsafe-inline'"],

      // CSS 로드 허용
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],

      // 폰트 로드 허용
      fontSrc: ["'self'", "cdn.jsdelivr.net", "data:"],

      // 이미지 로드 허용 ★
      imgSrc: [
        "'self'",
        "data:",                        // Base64 이미지
        "https://res.cloudinary.com",   // Cloudinary
        "https://*.cloudinary.com"
      ],

      // fetch/XHR 요청 허용 ★
      connectSrc: [
        "'self'",
        "cdn.jsdelivr.net",
        "https://res.cloudinary.com",   // Service Worker용
        "https://*.cloudinary.com"
      ],
    },
  },
}));
```

### 5.3 외부 서비스 추가 시 체크리스트

새로운 외부 서비스(예: AWS S3, 다른 CDN) 추가 시:

1. [ ] `imgSrc`에 이미지 도메인 추가
2. [ ] `connectSrc`에도 추가 (Service Worker 사용 시)
3. [ ] `scriptSrc`에 스크립트 도메인 추가 (필요 시)
4. [ ] `styleSrc`에 CSS 도메인 추가 (필요 시)

### 5.4 Service Worker와 CSP

Service Worker가 `fetch()`로 리소스를 가져올 때 `connect-src` 정책을 따름.
외부 이미지도 Service Worker가 가로채면 `connect-src`에 도메인이 있어야 함.

**권장: 외부 요청은 Service Worker가 처리하지 않도록 설정**

```javascript
// public/sw.js
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 외부 도메인은 브라우저가 직접 처리
  if (url.origin !== self.location.origin) {
    return;
  }

  // 내부 요청만 Service Worker가 처리
  event.respondWith(...);
});
```

---

## 6. URL 미리보기 시스템

### 6.1 Open Graph 파싱

댓글에 URL을 붙여넣으면 해당 페이지의 미리보기(썸네일, 제목, 설명)를 자동으로 가져옵니다.

```
사용자가 URL 입력
      │
      ▼
┌─────────────────────┐
│ /api/url-preview    │
│ (서버에서 처리)      │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│ 유튜브 URL인가?      │
└─────────────────────┘
      │
   ┌──┴──┐
   │ Yes │ No
   ▼     ▼
┌─────────┐ ┌──────────────┐
│직접 생성 │ │ HTML 파싱    │
│썸네일 URL│ │ og:image 등  │
└─────────┘ └──────────────┘
```

### 6.2 유튜브 특별 처리

유튜브는 서버 IP를 차단하므로 HTML 파싱이 불가능합니다.
비디오 ID를 추출하여 썸네일 URL을 직접 생성합니다.

**지원 형식:** 일반 영상, 쇼츠, 공유 링크, 임베드

```javascript
const youtubeMatch = targetUrl.match(
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
);

if (youtubeMatch) {
  const videoId = youtubeMatch[1];
  return res.json({
    image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    title: 'YouTube 동영상',
    siteName: 'YouTube'
  });
}
```

### 6.3 틱톡 oEmbed API

틱톡은 oEmbed API를 통해 실제 썸네일을 가져옵니다.

```javascript
const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl)}`;
const oembedData = await fetch(oembedUrl).then(r => r.json());
// oembedData.thumbnail_url 사용
```

### 6.4 기타 SNS 플랫폼 (로고 표시)

서버에서 봇 차단하는 플랫폼은 각 플랫폼 로고를 표시합니다:
- **Instagram**: 게시물, 릴스
- **Facebook**: 모든 링크, fb.watch
- **Threads**: 프로필, 게시물
- **X (Twitter)**: 트윗

### 6.5 User-Agent 설정

일부 사이트(다음, 네이버 등)는 봇 User-Agent를 차단합니다.
Chrome 브라우저 User-Agent를 사용하여 우회합니다.

```javascript
const response = await fetch(targetUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...',
    'Accept': 'text/html,application/xhtml+xml...',
    'Accept-Language': 'ko-KR,ko;q=0.9'
  }
});
```

### 6.6 CSP 설정

외부 이미지를 표시하려면 CSP에서 허용해야 합니다.

```javascript
// app.js
imgSrc: ["'self'", "data:", "https:", "http:"],
```

---

## 부록: 환경 변수 전체 목록

```env
# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/n2golf

# Cloudinary (이미지 저장)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# 카카오 API (지도/교통)
KAKAO_REST_API_KEY=your_kakao_key

# 세션
SESSION_SECRET=random_secure_string

# 앱 설정
NODE_ENV=production
PORT=3000
```

Vercel에서 환경 변수 설정:
```bash
vercel env pull .env.local
```

---

## 7. 성능 최적화

### 7.1 gzip 압축

응답 데이터를 gzip으로 압축하여 네트워크 전송량을 60-70% 감소시킵니다.

```javascript
// app.js
const compression = require('compression');

app.use(compression({
  level: 6,              // 압축 레벨 (1-9, 6이 균형점)
  threshold: 1024,       // 1KB 이상만 압축
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
```

### 7.2 정적 파일 캐싱

브라우저가 정적 파일(CSS, JS, 이미지)을 캐시하도록 설정합니다.

```javascript
// app.js
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',       // 1일 캐싱
  etag: true,         // ETag 헤더로 변경 감지
  lastModified: true  // Last-Modified 헤더 포함
}));
```

**캐싱 동작:**
- 첫 요청: 200 OK + 파일 전체 전송
- 재요청: 304 Not Modified (파일 미변경 시)

### 7.3 MongoDB 연결 풀 최적화

```javascript
// models/database.js
mongoClient = new MongoClient(MONGODB_URI, {
  maxPoolSize: 50,           // 최대 연결 수 (기존 10 → 50)
  minPoolSize: 5,            // 최소 연결 유지
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxIdleTimeMS: 30000,      // 유휴 연결 30초 후 정리
});
```

**연결 풀의 효과:**
```
연결 풀 없이:
요청1 → 연결 생성 → 쿼리 → 연결 종료
요청2 → 연결 생성 → 쿼리 → 연결 종료  (매번 연결 오버헤드)

연결 풀 사용:
요청1 → 풀에서 연결 획득 → 쿼리 → 풀에 반환
요청2 → 풀에서 연결 획득 → 쿼리 → 풀에 반환  (재사용)
```

### 7.4 MongoDB 인덱스

자주 조회되는 필드에 인덱스를 생성하여 쿼리 속도를 O(n) → O(log n)으로 개선합니다.

**생성된 인덱스:**

| 컬렉션 | 인덱스 | 용도 |
|--------|--------|------|
| reservations | schedule_id | 일정별 예약 조회 |
| reservations | member_id | 회원별 예약 조회 |
| reservations | schedule_id + member_id (unique) | 중복 예약 방지 |
| schedule_comments | schedule_id | 일정별 댓글 조회 |
| schedule_comments | schedule_id + parent_id | 대댓글 조회 |
| schedule_comments | created_at (desc) | 최신순 정렬 |
| comment_reactions | comment_id | 댓글별 리액션 조회 |
| comment_reactions | comment_id + member_id (unique) | 중복 리액션 방지 |
| schedules | golf_course_id + play_date | 골프장+날짜 조회 |
| schedules | play_date | 날짜별 일정 조회 |
| finances | transaction_date (desc) | 최신 거래 조회 |
| finances | type + transaction_date | 유형별 거래 조회 |
| members | name | 이름 검색 |
| members | department | 부서별 회원 조회 |

**인덱스 생성 스크립트:**
```bash
node scripts/create-indexes.js
```

### 7.5 Cloudinary 이미지 최적화

업로드 및 표시 시 자동으로 최적화된 포맷(WebP/AVIF)과 품질을 적용합니다.

```javascript
// 업로드 시 (routes/schedules.js)
cloudinary.uploader.upload(base64Data, {
  transformation: [
    { width: 1200, height: 1200, crop: 'limit' },
    { quality: 'auto:good', fetch_format: 'auto' }  // 자동 최적화
  ]
});

// 표시 시 URL 변환 (utils/validator.js)
function optimizeCloudinaryUrl(url) {
  if (!url.includes('res.cloudinary.com')) return url;
  if (url.includes('f_auto') || url.includes('q_auto')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
}
```

### 7.6 이미지 Lazy Loading

화면에 보이는 이미지만 먼저 로드하여 초기 페이지 속도를 개선합니다.

```html
<img src="..." loading="lazy" alt="...">
```

적용 위치:
- 댓글/대댓글 첨부 이미지
- URL 미리보기 썸네일
- 홀 레이아웃 이미지

### 7.7 쿼리 최적화

**Projection**: 필요한 필드만 조회하여 네트워크 전송량 감소

```javascript
// 모든 필드 조회 (비효율)
const members = await db.getTableAsync('members');

// 필요한 필드만 조회 (최적화)
const members = await db.getTableAsync('members', {
  projection: { id: 1, name: 1 }
});
```

**Promise.all**: 여러 쿼리를 병렬로 실행

```javascript
// 순차 실행 (느림)
const comments = await db.getTableAsync('schedule_comments');
const reactions = await db.getTableAsync('comment_reactions');
const members = await db.getTableAsync('members');

// 병렬 실행 (빠름)
const [comments, reactions, members] = await Promise.all([
  db.getTableAsync('schedule_comments'),
  db.getTableAsync('comment_reactions'),
  db.getTableAsync('members', { projection: { id: 1, name: 1 } })
]);
```

### 7.8 성능 최적화 체크리스트

새로운 기능 개발 시 확인사항:

- [ ] 자주 조회되는 필드에 인덱스가 있는가?
- [ ] N+1 쿼리 문제가 없는가?
- [ ] Promise.all로 병렬 처리 가능한가?
- [ ] projection으로 필요한 필드만 조회하는가?
- [ ] 이미지에 lazy loading이 적용되어 있는가?
- [ ] 불필요한 캐시 갱신을 하고 있지 않은가?

### 7.9 추가 최적화 방안 (향후)

1. **Redis 캐싱**: 자주 조회되는 데이터를 Redis에 캐시
2. **번들 최적화**: JavaScript/CSS 번들 크기 최소화
3. **CDN 활용**: 정적 파일을 CDN에서 서빙

---

## 8. 실시간 교통 현황

### 8.1 개요

대시보드에서 출발지(을지로)부터 각 골프장까지의 실시간 교통 정보를 표시합니다.
카카오 모빌리티 API를 활용하여 예상 소요 시간과 거리를 제공합니다.

### 8.2 시스템 구성

```
┌─────────────┐        ┌──────────────────┐        ┌─────────────────────┐
│   클라이언트  │──────▶│  /api/traffic    │──────▶│ 카카오 모빌리티 API   │
│  (index.ejs) │        │  (routes/traffic) │        │  길찾기 API          │
└─────────────┘        └──────────────────┘        └─────────────────────┘
       │                        │
       │                        ▼
       │                ┌──────────────┐
       │                │   MongoDB    │
       │                │ golf_courses │
       │                └──────────────┘
       ▼
┌─────────────────┐
│ 교통 정보 카드   │
│ (소요시간/거리)  │
└─────────────────┘
```

### 8.3 API 구현 (routes/traffic.js)

```javascript
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const ORIGIN = { lat: 37.5663, lng: 126.9817 };  // 을지로

router.get('/traffic/:courseId', async (req, res) => {
  const course = await db.findById('golf_courses', courseId);

  const response = await fetch(
    `https://apis-navi.kakaomobility.com/v1/directions?` +
    `origin=${ORIGIN.lng},${ORIGIN.lat}&` +
    `destination=${course.longitude},${course.latitude}&` +
    `priority=RECOMMEND`,
    {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
    }
  );

  const data = await response.json();
  const route = data.routes[0];

  res.json({
    duration: route.summary.duration,      // 초 단위
    distance: route.summary.distance,      // 미터 단위
    fare: route.summary.fare?.toll || 0    // 톨비
  });
});
```

### 8.4 클라이언트 표시 (views/index.ejs)

```javascript
async function loadTrafficInfo() {
  const golfCourseId = getCurrentGolfCourseId();
  const response = await fetch(`/api/traffic/${golfCourseId}`);
  const data = await response.json();

  // 소요시간 포맷: 초 → "1시간 30분"
  const hours = Math.floor(data.duration / 3600);
  const minutes = Math.ceil((data.duration % 3600) / 60);

  // 거리 포맷: 미터 → "45.2km"
  const distance = (data.distance / 1000).toFixed(1);

  document.getElementById('trafficInfo').innerHTML = `
    <span class="text-primary">${hours}시간 ${minutes}분</span>
    <span class="text-muted">(${distance}km)</span>
  `;
}
```

### 8.5 환경 변수

```env
# 카카오 API (지도/교통)
KAKAO_REST_API_KEY=your_kakao_rest_api_key
```

**카카오 개발자 콘솔 설정:**
1. https://developers.kakao.com 접속
2. 애플리케이션 생성 또는 선택
3. 카카오 모빌리티 API 활성화
4. REST API 키 복사

### 8.6 CSP 설정

카카오 모빌리티 API 호출을 위해 CSP 설정 필요:

```javascript
// app.js
connectSrc: [
  "'self'",
  "https://apis-navi.kakaomobility.com"  // 카카오 모빌리티 API
],
```

---

## 9. 전역 로딩 인디케이터

### 9.1 개요

페이지 이동 시 "조회중..." 로딩 오버레이를 표시하여 사용자에게 피드백을 제공합니다.
모바일 터치 이벤트와 데스크톱 클릭 이벤트 모두 지원합니다.

### 9.2 시스템 구성

```
┌──────────────────────────────────────────────────────────┐
│                    전역 로딩 오버레이                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │              ● (스피너)                              │  │
│  │              조회중...                               │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
    ┌─────────┐      ┌──────────┐      ┌──────────┐
    │ 링크 클릭 │      │ 폼 제출   │      │ 터치 탭  │
    └─────────┘      └──────────┘      └──────────┘
```

### 9.3 HTML 구조 (views/partials/header.ejs)

```html
<!-- 전역 로딩 오버레이 -->
<div id="globalLoadingOverlay" class="loading-overlay" style="display: none;">
  <div class="loading-content">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">로딩중...</span>
    </div>
    <div class="loading-text mt-2">조회중...</div>
  </div>
</div>
```

### 9.4 JavaScript 구현

```javascript
(function() {
  var loadingOverlay = document.getElementById('globalLoadingOverlay');
  var isLoading = false;
  var loadingTimeout;

  function showLoading() {
    if (isLoading || !loadingOverlay) return;
    isLoading = true;
    loadingOverlay.style.display = 'flex';
    // 5초 후 자동 숨김 (안전장치)
    loadingTimeout = setTimeout(hideLoading, 5000);
  }

  function hideLoading() {
    isLoading = false;
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    clearTimeout(loadingTimeout);
  }

  // 전역 함수로 노출
  window.showGlobalLoading = showLoading;
  window.hideGlobalLoading = hideLoading;

  // 페이지 이동 시 자동 숨김
  window.addEventListener('pageshow', hideLoading);
  window.addEventListener('load', hideLoading);
})();
```

### 9.5 자동 로딩 트리거

**링크 클릭:**
```javascript
document.addEventListener('click', function(e) {
  var link = e.target.closest('a');
  if (isValidNavigationLink(link)) {
    showLoading();
  }
});

function isValidNavigationLink(element) {
  if (!element) return false;
  var href = element.getAttribute('href');
  // 제외 조건: #, javascript:, tel:, mailto:, target="_blank", data-bs-toggle 등
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
    return false;
  }
  return href.startsWith('/') || href.startsWith(window.location.origin);
}
```

**폼 제출:**
```javascript
document.addEventListener('submit', function(e) {
  if (!e.target.classList.contains('no-loading')) {
    showLoading();
  }
});
```

### 9.6 모바일 터치 이벤트 통합

모바일에서는 터치 이벤트를 별도로 처리하여 스크롤과 탭을 구분합니다.

```javascript
// 예: 날씨 카드 터치
el.addEventListener('touchstart', function(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  isTap = true;
}, { passive: true });

el.addEventListener('touchmove', function(e) {
  var deltaX = Math.abs(e.touches[0].clientX - touchStartX);
  var deltaY = Math.abs(e.touches[0].clientY - touchStartY);
  if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
    isTap = false;  // 스크롤로 판단
  }
}, { passive: true });

el.addEventListener('touchend', function(e) {
  if (isTap) {
    e.preventDefault();
    if (window.showGlobalLoading) window.showGlobalLoading();
    window.location.href = el.getAttribute('href');
  }
}, { passive: false });
```

### 9.7 제외 클래스

로딩 인디케이터를 표시하지 않을 요소에 사용:

```html
<!-- 로딩 표시 안 함 -->
<a href="/some-page" class="no-loading">빠른 링크</a>
<form action="/api/save" class="no-loading">...</form>
```

### 9.8 CSS 스타일 (public/css/style.css)

```css
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  text-align: center;
}

.loading-text {
  color: #198754;
  font-weight: 500;
}
```

### 9.9 Service Worker 캐시 갱신

로딩 인디케이터 관련 변경 시 Service Worker 캐시 버전을 업데이트해야 합니다.

```javascript
// public/sw.js
const CACHE_NAME = 'n2golf-v10';  // 버전 증가
```

### 9.10 체크리스트

로딩 인디케이터 추가/수정 시 확인:

- [ ] `showGlobalLoading()` 호출 후 페이지 이동 코드 실행
- [ ] `e.preventDefault()` 사용하여 기본 동작 방지
- [ ] `window.location.href`로 직접 이동 (기본 링크 동작에 의존하지 않음)
- [ ] 모바일 터치 이벤트에서 스크롤 vs 탭 구분
- [ ] Service Worker 캐시 버전 업데이트

---

## 10. Pull-to-Refresh (당겨서 새로고침)

### 10.1 개요

홈 화면에서 아래로 당겨서 페이지를 새로고침하는 모바일 네이티브 앱 스타일의 UX를 제공합니다.
터치 이벤트를 감지하여 임계값(80px) 이상 당기면 페이지를 새로고침합니다.

### 10.2 동작 조건

- **홈 화면(`/`)에서만** 동작
- **모바일 기기**에서만 동작 (`'ontouchstart' in window`)
- **스크롤이 최상단**일 때만 동작 (`window.scrollY <= 0`)

### 10.3 HTML 구조 (views/partials/header.ejs)

```html
<!-- Pull-to-Refresh 인디케이터 -->
<div id="pullToRefreshIndicator" class="pull-to-refresh-indicator">
  <i class="bi bi-arrow-down-circle pull-to-refresh-icon"></i>
  <span class="pull-to-refresh-text">당겨서 새로고침</span>
</div>
```

### 10.4 CSS 스타일 (public/css/style.css)

```css
.pull-to-refresh-indicator {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%) translateY(-100%);  /* 기본: 화면 위에 숨김 */
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  background: hsl(var(--card));
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: transform 0.2s ease-out;
  pointer-events: none;
}

/* 당기는 중 */
.pull-to-refresh-indicator.pulling {
  transform: translateX(-50%) translateY(0);
}

/* 새로고침 중 */
.pull-to-refresh-indicator.refreshing {
  transform: translateX(-50%) translateY(0);
}

/* 아이콘 회전 애니메이션 */
.pull-to-refresh-indicator.pulling .pull-to-refresh-icon {
  transform: rotate(180deg);
}

.pull-to-refresh-indicator.refreshing .pull-to-refresh-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

### 10.5 JavaScript 구현 (views/partials/header.ejs)

```javascript
(function() {
  // 홈 페이지에서만 동작 (모바일만)
  if (window.location.pathname !== '/' || !('ontouchstart' in window)) return;

  var indicator = document.getElementById('pullToRefreshIndicator');
  var textEl = indicator.querySelector('.pull-to-refresh-text');

  var startY = 0;
  var currentY = 0;
  var pulling = false;
  var refreshing = false;
  var PULL_THRESHOLD = 80;   // 새로고침 트리거 거리 (px)
  var MAX_PULL = 120;

  function isAtTop() {
    return window.scrollY <= 0;
  }

  // 터치 시작
  document.addEventListener('touchstart', function(e) {
    if (refreshing || !isAtTop()) return;
    startY = e.touches[0].clientY;
    pulling = false;
  }, { passive: true });

  // 터치 이동
  document.addEventListener('touchmove', function(e) {
    if (refreshing || !isAtTop() || startY === 0) return;

    currentY = e.touches[0].clientY;
    var deltaY = currentY - startY;

    // 아래로 당기는 경우만 처리
    if (deltaY > 20) {
      pulling = true;
      indicator.classList.add('pulling');

      if (deltaY >= PULL_THRESHOLD) {
        textEl.textContent = '놓으면 새로고침';
      } else {
        textEl.textContent = '당겨서 새로고침';
      }
    }
  }, { passive: true });

  // 터치 종료
  document.addEventListener('touchend', function(e) {
    if (!pulling || refreshing) {
      startY = 0;
      return;
    }

    var deltaY = currentY - startY;

    if (deltaY >= PULL_THRESHOLD) {
      // 새로고침 실행
      refreshing = true;
      indicator.classList.remove('pulling');
      indicator.classList.add('refreshing');
      textEl.textContent = '조회중...';

      // 전역 로딩 인디케이터와 연동
      if (window.showGlobalLoading) window.showGlobalLoading();

      setTimeout(function() {
        window.location.reload();
      }, 300);
    } else {
      // 임계값 미달 - 원래 상태로
      indicator.classList.remove('pulling');
    }

    startY = 0;
    currentY = 0;
    pulling = false;
  }, { passive: true });

  // 터치 취소
  document.addEventListener('touchcancel', function() {
    indicator.classList.remove('pulling');
    startY = 0;
    currentY = 0;
    pulling = false;
  }, { passive: true });
})();
```

### 10.6 전역 로딩 인디케이터 연동

Pull-to-Refresh는 전역 로딩 인디케이터와 연동되어 동작합니다:

1. 사용자가 화면을 아래로 당김
2. 임계값(80px) 이상 당기면 "놓으면 새로고침" 텍스트 표시
3. 손을 떼면:
   - Pull-to-Refresh 인디케이터: "조회중..." 표시
   - 전역 로딩 인디케이터: 화면 중앙에 표시
4. 300ms 후 페이지 새로고침

### 10.7 Service Worker 캐시 고려

Pull-to-Refresh 관련 CSS/JS 변경 시 Service Worker 캐시 버전을 업데이트해야 합니다:

```javascript
// public/sw.js
const CACHE_NAME = 'n2golf-v11';  // 버전 증가
```

### 10.8 체크리스트

Pull-to-Refresh 구현/수정 시 확인:

- [ ] 홈 화면(`/`)에서만 동작하는지 확인
- [ ] 모바일에서만 동작하는지 확인 (`'ontouchstart' in window`)
- [ ] 스크롤 최상단에서만 동작하는지 확인
- [ ] 인디케이터 텍스트가 상태에 따라 변경되는지 확인
- [ ] 전역 로딩 인디케이터와 연동되는지 확인
- [ ] Service Worker 캐시 버전 업데이트

---

## 11. 커뮤니티 리액션 시각화

### 11.1 개요

커뮤니티 댓글에서 사용자가 누른 좋아요/싫어요 버튼을 시각적으로 구분합니다.
내가 누른 버튼은 **채워진 아이콘**으로 표시되어 한눈에 확인할 수 있습니다.

### 11.2 아이콘 상태

| 상태 | 좋아요 버튼 | 싫어요 버튼 |
|------|-------------|-------------|
| 누르지 않음 | `bi-hand-thumbs-up` (빈 아이콘) | `bi-hand-thumbs-down` (빈 아이콘) |
| **내가 누름** | `bi-hand-thumbs-up-fill` (파란색 채워진 아이콘) | `bi-hand-thumbs-down-fill` (빨간색 채워진 아이콘) |

### 11.3 데이터 구조

서버에서 댓글 조회 시 `my_reaction` 필드를 포함하여 반환합니다:

```javascript
{
  id: 1,
  content: "좋은 라운딩이었습니다!",
  member_name: "홍길동",
  likes: 5,
  dislikes: 1,
  my_reaction: "like"  // 'like', 'dislike', 또는 null
}
```

### 11.4 클라이언트 구현 (views/schedules/community.ejs)

**초기 렌더링 시:**
```javascript
// 좋아요/싫어요 상태 반영
const likeBtn = card.querySelector('.like-btn');
const dislikeBtn = card.querySelector('.dislike-btn');
const likeIcon = likeBtn.querySelector('i');
const dislikeIcon = dislikeBtn.querySelector('i');

if (comment.my_reaction === 'like') {
  likeBtn.classList.add('text-primary');
  likeIcon.classList.remove('bi-hand-thumbs-up');
  likeIcon.classList.add('bi-hand-thumbs-up-fill');
} else if (comment.my_reaction === 'dislike') {
  dislikeBtn.classList.add('text-danger');
  dislikeIcon.classList.remove('bi-hand-thumbs-down');
  dislikeIcon.classList.add('bi-hand-thumbs-down-fill');
}
```

**버튼 클릭 시:**
```javascript
async function handleReaction(commentId, reactionType, card) {
  const response = await fetch(`/schedules/comments/${commentId}/reaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ reaction_type: reactionType })
  });

  const data = await response.json();

  if (data.success) {
    const likeBtn = card.querySelector('.like-btn');
    const dislikeBtn = card.querySelector('.dislike-btn');
    const likeIcon = likeBtn.querySelector('i');
    const dislikeIcon = dislikeBtn.querySelector('i');

    // 카운트 업데이트
    card.querySelector('.likes-count').textContent = data.likes;
    card.querySelector('.dislikes-count').textContent = data.dislikes;

    // 모든 버튼 초기화
    likeBtn.classList.remove('text-primary');
    dislikeBtn.classList.remove('text-danger');
    likeIcon.classList.remove('bi-hand-thumbs-up-fill');
    likeIcon.classList.add('bi-hand-thumbs-up');
    dislikeIcon.classList.remove('bi-hand-thumbs-down-fill');
    dislikeIcon.classList.add('bi-hand-thumbs-down');

    // 현재 상태에 맞게 스타일 적용
    if (data.my_reaction === 'like') {
      likeBtn.classList.add('text-primary');
      likeIcon.classList.remove('bi-hand-thumbs-up');
      likeIcon.classList.add('bi-hand-thumbs-up-fill');
    } else if (data.my_reaction === 'dislike') {
      dislikeBtn.classList.add('text-danger');
      dislikeIcon.classList.remove('bi-hand-thumbs-down');
      dislikeIcon.classList.add('bi-hand-thumbs-down-fill');
    }
  }
}
```

### 11.5 토글 동작

- 같은 버튼을 다시 누르면 리액션이 취소됨 (아이콘이 빈 상태로 돌아감)
- 다른 버튼을 누르면 기존 리액션이 새 리액션으로 대체됨

### 11.6 CSS 스타일

```css
/* 좋아요 버튼 - 활성화 시 파란색 */
.like-btn.text-primary i {
  color: #0d6efd;
}

/* 싫어요 버튼 - 활성화 시 빨간색 */
.dislike-btn.text-danger i {
  color: #dc3545;
}
```

### 11.7 Service Worker 캐시

리액션 시각화 관련 변경 시 캐시 버전 업데이트:

```javascript
// public/sw.js
const CACHE_NAME = 'n2golf-v12';  // 버전 증가
```
