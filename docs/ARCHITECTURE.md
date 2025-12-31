# N2골프 시스템 아키텍처

## 목차
1. [기술 스택 선택 배경](#1-기술-스택-선택-배경)
2. [이미지 저장소 전략](#2-이미지-저장소-전략)
3. [데이터베이스 아키텍처](#3-데이터베이스-아키텍처)
4. [Vercel 서버리스 환경 대응](#4-vercel-서버리스-환경-대응)
5. [보안 설정 (CSP)](#5-보안-설정-csp)
6. [URL 미리보기 시스템](#6-url-미리보기-시스템)
7. [성능 최적화](#7-성능-최적화)

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
