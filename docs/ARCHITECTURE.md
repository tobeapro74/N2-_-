# N2골프 시스템 아키텍처

## 목차
1. [기술 스택 선택 배경](#1-기술-스택-선택-배경)
2. [이미지 저장소 전략](#2-이미지-저장소-전략)
3. [데이터베이스 아키텍처](#3-데이터베이스-아키텍처)
4. [Vercel 서버리스 환경 대응](#4-vercel-서버리스-환경-대응)
5. [보안 설정 (CSP)](#5-보안-설정-csp)

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
