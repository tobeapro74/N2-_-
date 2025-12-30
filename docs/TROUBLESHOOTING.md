# 트러블슈팅 가이드

이 문서는 N2골프 자금관리 시스템 개발 중 발생한 문제와 해결 방법을 정리합니다.

## 목차
1. [이미지 로드 실패 (CSP 정책)](#1-이미지-로드-실패-csp-정책)
2. [Service Worker 외부 리소스 차단](#2-service-worker-외부-리소스-차단)
3. [Vercel 서버리스 캐시 불일치](#3-vercel-서버리스-캐시-불일치)
4. [Vercel 배포 에러 (functions/builds 충돌)](#4-vercel-배포-에러-functionsbuilds-충돌)

---

## 1. 이미지 로드 실패 (CSP 정책)

### 증상
```
Refused to load the image 'https://res.cloudinary.com/...' because it violates
the following Content Security Policy directive: "img-src 'self' data:"
```

브라우저 콘솔에서 위 에러가 발생하고, Cloudinary 이미지가 표시되지 않음.

### 원인
`app.js`의 Helmet CSP 설정에서 `img-src`에 Cloudinary 도메인이 허용되지 않음.

### 해결 방법

**app.js** 수정:
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // ... 기타 설정
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
    },
  },
}));
```

### 확인 방법
1. 브라우저 개발자 도구(F12) → Console 탭
2. CSP 관련 에러 메시지 확인
3. Network 탭에서 이미지 요청 상태 확인

---

## 2. Service Worker 외부 리소스 차단

### 증상
```
sw.js:46 Connecting to 'https://res.cloudinary.com/...' violates the following
Content Security Policy directive: "connect-src 'self' cdn.jsdelivr.net"
```

CSP `img-src`를 수정했는데도 이미지가 로드되지 않음.

### 원인
1. Service Worker가 모든 fetch 요청을 가로채서 처리
2. Service Worker의 `fetch()` 호출은 `connect-src` CSP 정책을 따름
3. 외부 도메인이 `connect-src`에 없으면 차단됨

### 해결 방법

**1단계: CSP connect-src 수정 (app.js)**
```javascript
connectSrc: ["'self'", "cdn.jsdelivr.net", "https://res.cloudinary.com", "https://*.cloudinary.com"],
```

**2단계: Service Worker에서 외부 요청 제외 (public/sw.js)**
```javascript
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 외부 도메인 요청은 Service Worker가 처리하지 않음
  if (url.origin !== self.location.origin) {
    return;  // 브라우저가 직접 처리하도록 함
  }

  event.respondWith(
    // ... 기존 로직
  );
});
```

**3단계: 캐시 버전 업데이트**
```javascript
const CACHE_NAME = 'n2golf-v2';  // v1 → v2
```

### 테스트 방법
1. 개발자 도구 → Application → Service Workers → Unregister
2. Application → Storage → Clear site data
3. 페이지 새로고침 (Ctrl+Shift+R)

---

## 3. Vercel 서버리스 캐시 불일치

### 증상
- 댓글 삭제 후 "댓글을 찾을 수 없습니다" 에러
- 새로 추가한 이미지가 보이지 않음
- 데이터 변경이 즉시 반영되지 않음

### 원인
Vercel 서버리스 환경에서 각 요청이 다른 인스턴스에서 처리됨.
- 인스턴스 A: 데이터 삭제 → 자체 캐시 업데이트
- 인스턴스 B: 삭제된 데이터 조회 → 오래된 캐시 반환

```
[인스턴스 A] ──삭제──> MongoDB (성공)
                         ↑
[인스턴스 B] ──조회──> 자체 캐시 (오래된 데이터)
```

### 해결 방법

**1. 비동기 직접 조회 메서드 추가 (models/database.js)**
```javascript
async getTableAsync(name) {
  if (useMongoDb) {
    try {
      const collection = await this.getCollection(name);
      const data = await collection.find({}).toArray();
      this.mongoCache[name] = data;  // 캐시도 업데이트
      return data;
    } catch (error) {
      return this.mongoCache[name] || [];
    }
  }
  return this.data[name] || [];
}
```

**2. 중요한 API에서 getTableAsync() 사용**
```javascript
// 변경 전 (캐시 사용 - 문제 발생)
const comments = db.getTable('schedule_comments');
const comment = db.findById('schedule_comments', commentId);

// 변경 후 (MongoDB 직접 조회)
const comments = await db.getTableAsync('schedule_comments');
const comment = comments.find(c => c.id === commentId);
```

### 적용 대상 API
- 댓글 목록 조회: `GET /:id/comments`
- 댓글 수정: `PUT /comments/:commentId`
- 댓글 삭제: `DELETE /comments/:commentId`
- 리액션 처리: `POST /comments/:commentId/reaction`

### 주의사항
- 읽기 전용 페이지는 `getTable()` 사용 가능 (성능상 이점)
- 데이터 변경이 중요한 API만 `getTableAsync()` 사용
- 너무 많이 사용하면 MongoDB 요청 증가로 비용 발생

---

## 4. Vercel 배포 에러 (functions/builds 충돌)

### 증상
```
Error: The `functions` property cannot be used in conjunction with the `builds` property.
```

### 원인
`vercel.json`에서 `functions`와 `builds` 속성을 동시에 사용할 수 없음.

### 해결 방법

**vercel.json 수정:**
```json
{
  "version": 2,
  "functions": {
    "api/index.js": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index.js"
    }
  ]
}
```

`builds` 대신 `functions`와 `rewrites` 조합 사용.

---

## 5. URL 미리보기 이미지 안 보임

### 증상
- 댓글에 링크를 붙여넣었는데 썸네일 이미지가 안 보임
- 일부 사이트만 이미지가 안 보임 (예: 유튜브)

### 원인별 해결

#### 5.1 User-Agent 차단

일부 사이트(다음, 네이버 등)는 봇 User-Agent를 차단합니다.

**해결: 브라우저 User-Agent 사용**
```javascript
const response = await fetch(targetUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...',
    'Accept': 'text/html,application/xhtml+xml...',
    'Accept-Language': 'ko-KR,ko;q=0.9'
  }
});
```

#### 5.2 유튜브/쇼츠 특별 처리

유튜브는 서버 IP를 차단하므로 썸네일 URL을 직접 생성합니다.

```javascript
// 유튜브 URL 감지 (일반 영상, 쇼츠, 공유링크, 임베드)
const youtubeMatch = targetUrl.match(
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
);
if (youtubeMatch) {
  const videoId = youtubeMatch[1];
  return { image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` };
}
```

#### 5.3 틱톡 oEmbed API

틱톡은 oEmbed API로 실제 썸네일을 가져옵니다.

```javascript
const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl)}`;
const data = await fetch(oembedUrl).then(r => r.json());
// data.thumbnail_url 사용
```

#### 5.4 기타 SNS (Instagram, Facebook, Threads, X)

서버에서 봇 차단하는 플랫폼은 각 플랫폼 로고를 표시합니다.
실제 썸네일은 가져올 수 없으므로 로고로 대체합니다.

#### 5.5 CSP에서 외부 이미지 차단

모든 외부 이미지를 허용하려면:
```javascript
imgSrc: ["'self'", "data:", "https:", "http:"],
```

### 진단 방법
1. Network 탭에서 `url-preview` 요청 확인
2. Response의 `image` 필드 값 확인
3. 비어있으면 파싱 문제, 있으면 CSP 문제

---

## 빠른 진단 체크리스트

### 이미지가 안 보일 때
1. [ ] 브라우저 콘솔에서 CSP 에러 확인
2. [ ] `img-src`에 이미지 도메인 추가
3. [ ] `connect-src`에도 추가 (Service Worker 사용 시)
4. [ ] Service Worker 캐시 삭제 후 재시작

### 데이터 동기화 문제
1. [ ] Vercel 서버리스 환경인지 확인
2. [ ] 해당 API가 `getTable()` 사용하는지 확인
3. [ ] `getTableAsync()`로 변경
4. [ ] 배포 후 테스트

### 배포 실패 시
1. [ ] `vercel.json` 문법 오류 확인
2. [ ] `functions`와 `builds` 동시 사용 여부 확인
3. [ ] 로컬에서 `npx vercel --prod` 실행하여 상세 에러 확인
