# 트러블슈팅 가이드

이 문서는 N2골프 자금관리 시스템 개발 중 발생한 문제와 해결 방법을 정리합니다.

## 목차
1. [이미지 로드 실패 (CSP 정책)](#1-이미지-로드-실패-csp-정책)
2. [Service Worker 외부 리소스 차단](#2-service-worker-외부-리소스-차단)
3. [Vercel 서버리스 캐시 불일치](#3-vercel-서버리스-캐시-불일치)
4. [Vercel 배포 에러 (functions/builds 충돌)](#4-vercel-배포-에러-functionsbuilds-충돌)
5. [URL 미리보기 이미지 안 보임](#5-url-미리보기-이미지-안-보임)
6. [웹사이트 속도 느림](#6-웹사이트-속도-느림)
7. [모바일 터치 이벤트 문제](#7-모바일-터치-이벤트-문제)
8. [로딩 인디케이터 문제](#8-로딩-인디케이터-문제)
9. [이미지 업로드 실패 (Service Worker POST 캐싱)](#9-이미지-업로드-실패-service-worker-post-캐싱)
10. [커뮤니티 이미지 표시 안됨 (Template onload 이벤트)](#10-커뮤니티-이미지-표시-안됨-template-onload-이벤트)
11. [커뮤니티 입력창(Textarea) 크기 문제](#11-커뮤니티-입력창textarea-크기-문제)
12. [성능 최적화 마이그레이션 (캐싱 레이어)](#12-성능-최적화-마이그레이션-캐싱-레이어)

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

---

## 6. 웹사이트 속도 느림

### 증상
- 페이지 로딩이 2초 이상 걸림
- MongoDB 업그레이드(M0 → M10)에도 속도 개선 없음
- 첫 방문 시 특히 느림

### 원인별 해결

#### 6.1 gzip 압축 미적용

**확인 방법:**
```bash
curl -H "Accept-Encoding: gzip" -I https://your-site.vercel.app
```
응답 헤더에 `Content-Encoding: gzip`이 없으면 압축 미적용.

**해결:**
```javascript
// app.js
const compression = require('compression');
app.use(compression({
  level: 6,
  threshold: 1024
}));
```

#### 6.2 정적 파일 캐싱 없음

**확인 방법:**
Network 탭에서 CSS/JS 요청이 매번 200 OK인지 확인.
304 Not Modified가 나와야 캐싱 동작 중.

**해결:**
```javascript
// app.js
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));
```

#### 6.3 MongoDB 연결 풀 부족

**증상:**
- 동시 요청 시 응답 지연
- 간헐적인 타임아웃

**해결:**
```javascript
// models/database.js
mongoClient = new MongoClient(MONGODB_URI, {
  maxPoolSize: 50,   // 기존 10 → 50
  minPoolSize: 5,
  maxIdleTimeMS: 30000
});
```

#### 6.4 MongoDB 인덱스 없음

**확인 방법:**
MongoDB Atlas → 컬렉션 → Indexes 탭에서 인덱스 확인.
`_id` 외에 인덱스가 없으면 문제.

**해결:**
```bash
node scripts/create-indexes.js
```

**주요 인덱스:**
- `reservations.schedule_id`
- `schedule_comments.schedule_id`
- `schedules.play_date`
- `finances.transaction_date`

#### 6.5 Vercel Cold Start

**증상:**
- 한동안 접속 없다가 첫 요청 시 3-5초 소요
- 이후 요청은 빠름

**원인:**
서버리스 함수가 유휴 상태에서 깨어나는 시간.

**완화 방법:**
1. 정적 자산은 캐싱으로 빠르게 로드
2. 중요 API는 최소한의 연결로 응답
3. (유료) Vercel Pro의 Always On 기능 사용

#### 6.6 쿼리 최적화 미적용

**증상:**
- API 응답이 느림
- 여러 데이터를 조회하는 페이지가 특히 느림

**해결 1: Promise.all로 병렬 처리**
```javascript
// 순차 실행 (느림)
const comments = await db.getTableAsync('schedule_comments');
const reactions = await db.getTableAsync('comment_reactions');

// 병렬 실행 (빠름)
const [comments, reactions] = await Promise.all([
  db.getTableAsync('schedule_comments'),
  db.getTableAsync('comment_reactions')
]);
```

**해결 2: Projection으로 필요한 필드만 조회**
```javascript
// 모든 필드 조회 (비효율)
const members = await db.getTableAsync('members');

// 필요한 필드만 조회 (최적화)
const members = await db.getTableAsync('members', {
  projection: { id: 1, name: 1 }
});
```

#### 6.7 이미지 최적화 미적용

**증상:**
- 이미지가 많은 페이지 로딩 느림
- Cloudinary 이미지 용량이 큼

**해결 1: Cloudinary URL 최적화**
```javascript
// utils/validator.js의 optimizeCloudinaryUrl() 사용
// /upload/ → /upload/f_auto,q_auto/ 변환
```

**해결 2: Lazy Loading 적용**
```html
<img src="..." loading="lazy" alt="...">
```

### 성능 진단 체크리스트

1. [ ] Network 탭에서 가장 느린 요청 확인
2. [ ] gzip 압축 적용 여부 확인
3. [ ] 정적 파일 304 응답 확인
4. [ ] MongoDB Atlas Performance Advisor 확인
5. [ ] 인덱스 생성 여부 확인
6. [ ] Promise.all 병렬 처리 적용 여부 확인
7. [ ] 이미지 lazy loading 적용 여부 확인

### 성능 측정 도구

- **Lighthouse**: Chrome DevTools → Lighthouse 탭
- **WebPageTest**: https://www.webpagetest.org/
- **MongoDB Atlas**: Performance Advisor, Real-Time Performance Panel

---

## 7. 모바일 터치 이벤트 문제

### 7.1 스크롤 시 실수로 클릭됨

#### 증상
- 화면을 위아래로 스크롤하려고 터치했는데 버튼/카드가 클릭됨
- 골프장 카드를 터치해서 스크롤하면 가이드 페이지가 열림

#### 원인
`touchend` 이벤트에서 스크롤과 탭을 구분하지 않고 무조건 클릭 실행.

#### 해결 방법

**터치 시작/끝 위치 비교:**
```javascript
let touchStartY = 0;
let touchStartX = 0;
const SCROLL_THRESHOLD = 10; // 10px 이상 움직이면 스크롤로 판단

el.addEventListener('touchstart', function(e) {
  if (e.touches.length > 0) {
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  }
  el.classList.add('pressed');
}, { passive: true });

el.addEventListener('touchend', function(e) {
  el.classList.remove('pressed');

  if (e.changedTouches.length > 0) {
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndX = e.changedTouches[0].clientX;
    const deltaY = Math.abs(touchEndY - touchStartY);
    const deltaX = Math.abs(touchEndX - touchStartX);

    // 스크롤로 판단되면 클릭 실행 안 함
    if (deltaY > SCROLL_THRESHOLD || deltaX > SCROLL_THRESHOLD) {
      return;
    }
  }

  if (e.cancelable) e.preventDefault();
  handleClick(e);
}, { passive: false });
```

### 7.2 모바일에서 클릭이 안 됨

#### 증상
- PC에서는 클릭이 되는데 모바일에서 터치해도 반응 없음
- div 요소에 onclick 속성을 사용한 경우 발생

#### 원인
- 인라인 `onclick`은 모바일에서 신뢰성이 낮음
- 터치 이벤트와 클릭 이벤트의 처리 방식 차이

#### 해결 방법

**인라인 onclick 대신 이벤트 리스너 사용:**
```javascript
// 변경 전 (문제 발생)
<div onclick="handleClick()">...</div>

// 변경 후
<div class="clickable" data-id="123">...</div>

<script>
document.querySelectorAll('.clickable').forEach(function(el) {
  el.addEventListener('touchend', function(e) {
    if (e.cancelable) e.preventDefault();
    handleClick(el.dataset.id);
  }, { passive: false });

  el.addEventListener('click', function() {
    handleClick(el.dataset.id);
  });
});
</script>
```

### 7.3 터치 피드백 없음

#### 증상
- 버튼/카드를 터치해도 눌린 느낌이 없음
- 터치했는지 시각적으로 확인이 안 됨

#### 해결 방법

**CSS 터치 피드백:**
```css
.btn {
  -webkit-tap-highlight-color: transparent;
  transition: all 0.15s ease;
}

.btn:not(:disabled):active,
.btn:not(:disabled).pressed {
  transform: scale(0.95);
  opacity: 0.9;
}
```

**JavaScript pressed 클래스:**
```javascript
el.addEventListener('touchstart', function() {
  el.classList.add('pressed');
}, { passive: true });

el.addEventListener('touchend', function() {
  el.classList.remove('pressed');
}, { passive: true });

el.addEventListener('touchcancel', function() {
  el.classList.remove('pressed');
}, { passive: true });
```

### 7.4 동적으로 생성된 요소의 터치 피드백

#### 증상
- 페이지 로드 후 동적으로 생성된 카드(날씨, 교통 등)에 터치 피드백이 안 됨

#### 원인
- DOM 로드 시점에 요소가 없어서 이벤트 바인딩이 안 됨

#### 해결 방법

**동적 요소 생성 후 이벤트 바인딩:**
```javascript
// 동적 콘텐츠 생성 후 호출
function bindDynamicTouchEvents() {
  const SCROLL_THRESHOLD = 10;

  document.querySelectorAll('.dynamic-card-link').forEach(function(el) {
    let touchStartY = 0;
    let touchStartX = 0;

    el.addEventListener('touchstart', function(e) {
      if (e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
      }
      el.classList.add('pressed');
    }, { passive: true });

    el.addEventListener('touchend', function(e) {
      el.classList.remove('pressed');
      if (e.changedTouches.length > 0) {
        const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY);
        const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
        if (deltaY > SCROLL_THRESHOLD || deltaX > SCROLL_THRESHOLD) {
          e.preventDefault();
          return;
        }
      }
    }, { passive: false });

    el.addEventListener('touchcancel', function() {
      el.classList.remove('pressed');
    }, { passive: true });
  });
}

// 동적 콘텐츠 로드 후 호출
async function loadDynamicContent() {
  container.innerHTML = dynamicHtml;
  bindDynamicTouchEvents();  // 생성 후 바인딩
}
```

### 모바일 터치 체크리스트

1. [ ] 인라인 onclick 대신 이벤트 리스너 사용
2. [ ] touchstart/touchend/touchcancel 모두 처리
3. [ ] 스크롤 vs 탭 구분 (터치 이동 거리 체크)
4. [ ] 시각적 터치 피드백 (pressed 클래스)
5. [ ] `-webkit-tap-highlight-color: transparent` 설정
6. [ ] 동적 요소는 생성 후 이벤트 바인딩

---

## 8. 로딩 인디케이터 문제

### 8.1 로딩 표시 후 페이지 이동 안 됨

#### 증상
- "조회중..." 로딩 오버레이가 표시되고 5초 후 사라짐
- 페이지가 이동하지 않고 현재 페이지에 머무름
- 모바일에서 주로 발생

#### 원인
`showGlobalLoading()` 호출 후 기본 링크 동작(`<a href>`)에 의존했으나,
로딩 오버레이가 화면을 덮어 클릭 이벤트가 차단됨.

#### 해결 방법

**기본 동작 대신 직접 이동:**
```javascript
// 변경 전 (문제)
el.addEventListener('touchend', function(e) {
  if (window.showGlobalLoading) window.showGlobalLoading();
  // 기본 링크 동작에 의존 → 로딩 오버레이가 클릭을 차단
}, { passive: true });

// 변경 후 (해결)
el.addEventListener('touchend', function(e) {
  e.preventDefault();  // 기본 동작 방지
  if (window.showGlobalLoading) window.showGlobalLoading();
  window.location.href = el.getAttribute('href');  // 직접 이동
}, { passive: false });  // preventDefault 사용하려면 passive: false
```

### 8.2 로딩 인디케이터가 안 나옴

#### 증상
- 카드/버튼 터치 시 로딩 없이 바로 페이지 이동
- 데스크톱에서는 로딩이 나오는데 모바일에서만 안 나옴

#### 원인
1. 터치 이벤트 핸들러에서 `showGlobalLoading()` 호출 누락
2. `isTap` 플래그가 false로 설정되어 조건문 통과 못함

#### 해결 방법

**터치 이벤트에서 명시적 호출:**
```javascript
el.addEventListener('touchend', function(e) {
  el.classList.remove('pressed');
  if (isTap) {
    e.preventDefault();
    var href = el.getAttribute('href');
    if (href && href.startsWith('/')) {
      if (window.showGlobalLoading) window.showGlobalLoading();  // 명시적 호출
      window.location.href = href;
    }
  }
}, { passive: false });
```

### 8.3 스크롤할 때 로딩이 뜸

#### 증상
- 화면을 스크롤하려고 터치했는데 로딩 인디케이터가 나타남
- 카드/버튼 위에서 스크롤 시 원하지 않는 페이지 이동

#### 원인
`touchend`에서 스크롤과 탭을 구분하지 않음

#### 해결 방법

**touchmove에서 isTap 플래그 업데이트:**
```javascript
var isTap = false;
var touchStartX = 0;
var touchStartY = 0;
var SCROLL_THRESHOLD = 10;  // 10px 이상 움직이면 스크롤

el.addEventListener('touchstart', function(e) {
  if (e.touches.length > 0) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isTap = true;  // 터치 시작 시 true
  }
}, { passive: true });

el.addEventListener('touchmove', function(e) {
  if (e.touches.length > 0) {
    var deltaX = Math.abs(e.touches[0].clientX - touchStartX);
    var deltaY = Math.abs(e.touches[0].clientY - touchStartY);
    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
      isTap = false;  // 스크롤로 판단되면 false
    }
  }
}, { passive: true });

el.addEventListener('touchend', function(e) {
  if (isTap) {  // 탭일 때만 페이지 이동
    e.preventDefault();
    if (window.showGlobalLoading) window.showGlobalLoading();
    window.location.href = el.getAttribute('href');
  }
}, { passive: false });
```

### 8.4 로딩 인디케이터가 계속 남아있음

#### 증상
- 페이지 이동 후에도 로딩 오버레이가 안 사라짐
- 뒤로가기 시 로딩 오버레이가 남아있음

#### 원인
`pageshow` 이벤트 핸들러 미등록 또는 bfcache(뒤로-앞으로 캐시) 문제

#### 해결 방법

**pageshow 이벤트에서 숨김 처리:**
```javascript
// 뒤로가기/앞으로가기 시에도 동작
window.addEventListener('pageshow', function(e) {
  hideLoading();
});

// 페이지 로드 완료 시
window.addEventListener('load', function() {
  hideLoading();
});

// 탭 전환 시
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') {
    hideLoading();
  }
});
```

### 8.5 Service Worker 캐시 때문에 변경사항 반영 안 됨

#### 증상
- 코드를 수정했는데 모바일에서 이전 동작 유지
- 브라우저 캐시 삭제해도 안 됨
- "새 버전이 있습니다" 알림이 안 뜸

#### 원인
Service Worker가 이전 버전의 JavaScript를 캐시에서 제공

#### 해결 방법

**1단계: 캐시 버전 업데이트 (public/sw.js)**
```javascript
// 버전 번호 증가
const CACHE_NAME = 'n2golf-v10';  // v9 → v10
```

**2단계: 배포**
```bash
git add .
git commit -m "[수정] 로딩 인디케이터 수정 및 캐시 갱신"
git push
```

**3단계: 사용자 측 캐시 정리 (필요시)**
```
브라우저 설정 → 사이트 데이터 삭제 → 해당 사이트 선택 → 삭제
또는
개발자 도구 → Application → Storage → Clear site data
```

### 로딩 인디케이터 체크리스트

1. [ ] `showGlobalLoading()` 호출 직후 `window.location.href`로 이동
2. [ ] `e.preventDefault()` 사용하여 기본 링크 동작 방지
3. [ ] `passive: false` 설정 (preventDefault 사용 시 필수)
4. [ ] 스크롤/탭 구분을 위한 isTap 플래그 사용
5. [ ] SCROLL_THRESHOLD (10px) 이상 이동 시 스크롤로 판단
6. [ ] touchcancel 이벤트에서 pressed 클래스 제거
7. [ ] pageshow, load, visibilitychange에서 hideLoading 호출
8. [ ] Service Worker 캐시 버전 업데이트

---

## 9. 이미지 업로드 실패 (Service Worker POST 캐싱)

### 증상
```
sw.js:60 Uncaught (in promise) TypeError: Failed to execute 'put' on 'Cache':
Request method 'POST' is unsupported
```

이미지 업로드 시 스피너가 돌다가 멈추거나, 업로드가 실패하는 것처럼 보임.

### 원인
Service Worker의 fetch 이벤트 핸들러에서 **모든 요청**을 캐시하려고 시도.
HTTP Cache API는 GET 요청만 캐싱 가능하며, POST 요청을 캐싱하려고 하면 에러 발생.

```javascript
// 문제의 코드
event.respondWith(
  fetch(event.request)
    .then(response => {
      // POST 요청도 캐싱 시도 → 에러!
      cache.put(event.request, responseClone);
      return response;
    })
);
```

### 해결 방법

**public/sw.js 수정:**
```javascript
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 외부 도메인 요청은 Service Worker가 처리하지 않음
  if (url.origin !== self.location.origin) {
    return;
  }

  // POST 요청은 캐시할 수 없으므로 그대로 네트워크로 전달
  if (event.request.method !== 'GET') {
    return;  // 핵심: POST, PUT, DELETE 등은 처리하지 않음
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
```

**캐시 버전 업데이트:**
```javascript
const CACHE_NAME = 'n2golf-v13';  // 버전 증가
```

### 브라우저 캐시 정리 (사용자)

수정 후에도 문제가 지속되면 이전 Service Worker가 캐시되어 있음.

**방법 1: 개발자 도구**
1. F12 → Application 탭
2. Service Workers → Update on reload 체크
3. Storage → Clear site data

**방법 2: 콘솔에서 직접 해제**
```javascript
navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).then(() => location.reload())
```

**방법 3: 브라우저 설정**
설정 → 개인정보 → 사이트 데이터 → 해당 사이트 삭제

### 확인 방법
1. 개발자 도구 Console 탭에서 에러 확인
2. `Request method 'POST' is unsupported` 메시지가 없어야 함
3. 이미지 업로드 후 체크 아이콘(✓) 표시 확인

### 연관 이슈
- POST 외에도 PUT, DELETE 요청에서 동일한 문제 발생 가능
- 댓글 작성, 수정, 삭제 API 모두 영향받음

---

## 10. 커뮤니티 이미지 표시 안됨 (Template onload 이벤트)

### 증상
- 커뮤니티 댓글/게시글에 이미지 업로드는 성공 (Cloudinary URL 반환)
- 서버에 image_url이 정상 저장됨
- 하지만 화면에 이미지가 표시되지 않음
- 개발자 도구에서 확인하면 `d-none` 클래스가 그대로 남아있음

```html
<!-- 문제 상황: src는 설정되었지만 d-none이 제거되지 않음 -->
<div class="comment-image-container d-none mb-2">
  <img class="comment-image" src="https://res.cloudinary.com/...">
</div>
```

### 원인
HTML `<template>` 요소에서 `cloneNode()`로 복사한 요소는 **DocumentFragment** 상태입니다.
DocumentFragment는 실제 DOM에 추가되기 전까지 이미지의 `onload` 이벤트가 발생하지 않습니다.

```javascript
// 문제의 코드
function createCommentElement(comment) {
  const clone = commentTemplate.content.cloneNode(true);
  const card = clone.querySelector('.comment-card');

  // 이미지 표시
  if (comment.image_url) {
    const imageContainer = card.querySelector('.comment-image-container');
    const imageEl = card.querySelector('.comment-image');

    // onload 이벤트에 의존 → DocumentFragment에서는 발생 안 함!
    imageEl.onload = () => {
      imageContainer.classList.remove('d-none');
    };
    imageEl.src = comment.image_url;
  }

  return clone; // DOM에 추가되기 전이므로 onload 미발생
}
```

### 해결 방법
`onload` 이벤트에 의존하지 않고, `image_url`이 있으면 **즉시** `d-none`을 제거합니다.
에러 발생 시에만 `onerror`로 다시 숨깁니다.

```javascript
// 수정된 코드
if (comment.image_url) {
  const imageContainer = card.querySelector('.comment-image-container');
  const imageEl = card.querySelector('.comment-image');

  // 에러 핸들러만 설정 (로드 실패 시 숨김)
  imageEl.onerror = () => {
    console.error('이미지 로드 실패:', comment.image_url);
    imageContainer.classList.add('d-none');
  };

  // src 설정 및 즉시 표시 (onload 이벤트에 의존하지 않음)
  imageEl.src = comment.image_url;
  imageContainer.classList.remove('d-none');
}
```

### 적용 파일
- `views/schedules/community.ejs` - 골프일정 톡톡 (댓글/대댓글)
- `views/community/list.ejs` - 일상톡톡 (게시글)

### 디버깅 방법
콘솔에서 이미지 컨테이너 상태 확인:
```javascript
document.querySelectorAll('.comment-image-container').forEach((el, i) => {
  const img = el.querySelector('img');
  console.log(i, el.classList.contains('d-none'), img?.src);
});
```

### 관련 개념
- **DocumentFragment**: 메모리상에만 존재하는 가벼운 DOM 컨테이너
- **Template Element**: HTML5의 `<template>` 태그, 내용이 즉시 렌더링되지 않음
- **onload 이벤트 타이밍**: 이미지가 실제 DOM에 있어야 정상 발생

---

## 11. 커뮤니티 입력창(Textarea) 크기 문제

### 증상
- 커뮤니티 게시글/댓글 입력창이 너무 좁아서 글 작성이 불편함
- 모바일에서 특히 입력 공간이 부족함
- 일상톡톡과 일정>커뮤니티 입력창 크기가 서로 다름

### 원인
1. textarea의 `rows` 속성이 너무 작게 설정됨 (예: rows="2")
2. `min-height` CSS 값이 충분하지 않음
3. 여러 페이지에서 입력창 크기가 일관되지 않음

### 해결 방법

#### 11.1 적절한 rows와 min-height 설정

**수정 대상 파일:**
- `views/community/list.ejs` - 일상톡톡
- `views/schedules/community.ejs` - 일정>커뮤니티

**권장 설정값:**

| 입력창 유형 | rows | min-height | 용도 |
|------------|------|------------|------|
| 메인 입력창 | 10 | 240px | 게시글/댓글 작성 |
| 수정 입력창 | 8 | 180px | 게시글/댓글 수정 |
| 답글 입력창 | 4 | 100px | 대댓글/답글 작성 |

**코드 예시:**
```html
<!-- 메인 입력창 -->
<textarea class="form-control mb-2"
          rows="10"
          style="resize: vertical; min-height: 240px; font-size: 1rem; line-height: 1.7;">
</textarea>

<!-- 수정 입력창 -->
<textarea class="form-control edit-input mb-2"
          rows="8"
          style="resize: vertical; min-height: 180px; font-size: 0.9rem; line-height: 1.5;">
</textarea>

<!-- 답글 입력창 -->
<textarea class="form-control reply-input mb-2"
          rows="4"
          style="resize: vertical; min-height: 100px; font-size: 0.85rem; line-height: 1.5;">
</textarea>
```

#### 11.2 일관된 크기 유지

**중요:** 일상톡톡과 일정>커뮤니티 두 페이지의 입력창 크기를 동일하게 유지해야 함.

**체크 포인트:**
- 메인 게시글/댓글 입력창
- 수정 폼의 textarea
- 답글/대댓글 입력창

#### 11.3 resize 속성 설정

```css
/* 권장: 세로 방향으로만 크기 조절 가능 */
resize: vertical;

/* 크기 조절 불가 - 사용 지양 */
resize: none;
```

### 주의사항

1. **rows만 변경하면 안 됨**: min-height도 함께 조정해야 실제 높이가 변경됨
2. **모바일 테스트 필수**: 모바일에서 키보드가 올라왔을 때 입력창이 가려지지 않는지 확인
3. **과도한 크기 지양**: 너무 크면 다른 콘텐츠가 밀려서 사용성 저하

### 크기 조정 히스토리

| 날짜 | rows | min-height | 비고 |
|------|------|------------|------|
| 초기 | 2 | - | 너무 좁음 |
| 1차 수정 | 20 | 480px | 너무 큼 |
| 2차 수정 | 10 | 240px | 적정 크기 (현재) |

---

## 12. 성능 최적화 마이그레이션 (캐싱 레이어)

### 개요

2026-01-30 적용된 성능 최적화 마이그레이션입니다.
API 호출 최소화와 응답 속도 향상을 위한 다층 캐싱 전략을 구현했습니다.

### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `models/cache.js` | 신규 - 서버 사이드 캐시 매니저 |
| `routes/traffic.js` | 교통 API 캐싱 (5분 TTL) |
| `models/weather.js` | 날씨 API 캐싱 (30분 TTL) |
| `routes/schedules.js` | URL 미리보기 캐싱 (1시간 TTL) |
| `routes/community.js` | URL 미리보기 캐싱 (1시간 TTL) |
| `models/database.js` | MongoDB 증분 캐시 업데이트 |
| `public/sw.js` | Service Worker 전략 개선 (v17) |
| `public/js/main.js` | 클라이언트 캐싱 유틸리티 |

---

### 12.1 서버 사이드 캐시 매니저 (models/cache.js)

#### 기능
- TTL 기반 메모리 캐싱
- 자동 만료 처리
- 캐시 통계 (hit/miss율)
- 패턴 기반 캐시 무효화

#### 사용법

```javascript
const { cacheManager, TTL } = require('../models/cache');

// 기본 사용
cacheManager.set('key', data, TTL.FIVE_MINUTES);
const data = cacheManager.get('key');

// getOrSet 패턴 (캐시 없으면 자동 생성)
const data = await cacheManager.getOrSet('key', async () => {
  return await fetchDataFromAPI();
}, TTL.THIRTY_MINUTES);

// 패턴 기반 삭제
cacheManager.deleteByPattern('weather_');  // weather_로 시작하는 모든 캐시 삭제

// 통계 조회
console.log(cacheManager.getStats());
// { hits: 150, misses: 20, sets: 25, deletes: 5, size: 20, hitRate: '88.24%' }
```

#### TTL 상수

```javascript
const TTL = {
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  TEN_MINUTES: 10 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000
};
```

---

### 12.2 교통 API 캐싱 (routes/traffic.js)

#### 변경 전
```javascript
// 매 요청마다 카카오 API 6회 호출
router.get('/duration', async (req, res) => {
  for (const route of routes) {
    await fetch(kakaoMobilityAPI);  // 6회 반복
  }
});
```

#### 변경 후
```javascript
// 5분간 캐시 유지, 캐시 히트 시 API 호출 생략
router.get('/duration', async (req, res) => {
  const cached = cacheManager.get('traffic_duration');
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  // API 호출 후 캐시 저장
  cacheManager.set('traffic_duration', result, TTL.FIVE_MINUTES);
});
```

#### 효과
- 카카오 API 호출 **90% 감소**
- 응답 시간: 2초 → 즉시 (캐시 히트 시)

---

### 12.3 날씨 API 캐싱 (models/weather.js)

#### 캐시 키
- 일일 날씨: `weather_${골프장명}_${날짜}`
- 주간 예보: `weather_weekly_${골프장명}`

#### 효과
- Open-Meteo API 호출 **95% 감소**
- 동일 골프장 날씨 30분간 캐시

---

### 12.4 URL 미리보기 캐싱

#### 캐시 키
```javascript
const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 16);
const cacheKey = `url_preview_${urlHash}`;
```

#### 효과
- 동일 URL 재요청 시 즉시 응답 (8초 → 0초)
- 외부 서버 부하 감소

---

### 12.5 MongoDB 증분 캐시 최적화

#### 변경 전
```javascript
// INSERT/UPDATE 시 전체 컬렉션 다시 로드
await this.initMongoCache();  // 모든 데이터 재조회
```

#### 변경 후
```javascript
// INSERT: 새 레코드만 추가
this.mongoCache[table].push(insertedDoc);

// UPDATE: 해당 레코드만 수정
const index = this.mongoCache[table].findIndex(r => r.id === id);
this.mongoCache[table][index] = updatedDoc;

// DELETE: 해당 레코드만 제거 (기존과 동일)
this.mongoCache[table] = this.mongoCache[table].filter(r => r.id !== id);
```

#### 효과
- 데이터 변경 시 응답 시간 **70% 단축**
- 불필요한 MongoDB 조회 감소

---

### 12.6 Service Worker 전략 개선 (v17)

#### 캐시 전략

| 리소스 유형 | 전략 | 설명 |
|------------|------|------|
| 정적 파일 (.css, .js, .svg) | **Cache-First** | 캐시 우선, 없으면 네트워크 |
| API (/api/weather, /api/traffic) | **Stale-While-Revalidate** | 캐시 즉시 반환 + 백그라운드 갱신 |
| 페이지 (HTML) | **Network-First** | 네트워크 우선, 실패 시 캐시 |

#### 버전 업데이트
```javascript
const CACHE_NAME = 'n2golf-v17';  // v16 → v17
```

#### Stale-While-Revalidate 동작
1. 캐시에 데이터가 있으면 **즉시 반환** (체감 속도 향상)
2. **백그라운드에서** 네트워크 요청으로 캐시 갱신
3. 다음 요청 시 갱신된 데이터 제공

---

### 12.7 클라이언트 캐싱 유틸리티 (main.js)

#### 함수

```javascript
// 캐시된 API 호출
const data = await cachedApiCall('/api/members', CLIENT_CACHE_TTL.MEDIUM);

// 캐시 무효화 (데이터 변경 후)
invalidateCache('/api/members');

// 전체 캐시 삭제
clearClientCache();

// Debounce (검색 입력 등)
const debouncedSearch = debounce(handleSearch, 300);

// Throttle (스크롤 이벤트 등)
const throttledScroll = throttle(handleScroll, 1000);
```

#### TTL 상수

```javascript
const CLIENT_CACHE_TTL = {
  SHORT: 60 * 1000,       // 1분
  MEDIUM: 5 * 60 * 1000,  // 5분
  LONG: 30 * 60 * 1000    // 30분
};
```

---

### 12.8 캐시 관련 트러블슈팅

#### 증상: 데이터 변경이 반영 안 됨

**원인**: 캐시된 데이터가 아직 유효
**해결**:
```javascript
// 서버 사이드: 관련 캐시 무효화
cacheManager.deleteByPattern('weather_');

// 클라이언트: 관련 캐시 무효화
invalidateCache('/api/weather');
```

#### 증상: Service Worker 변경사항 미반영

**해결**:
1. `public/sw.js`의 `CACHE_NAME` 버전 증가 (v17 → v18)
2. 배포 후 브라우저 캐시 삭제
```javascript
// 콘솔에서 실행
navigator.serviceWorker.getRegistrations()
  .then(regs => regs.forEach(r => r.unregister()))
  .then(() => location.reload())
```

#### 증상: API 응답에 cached: true가 표시됨

**의미**: 캐시에서 반환된 응답
**확인 방법**:
```json
{
  "success": true,
  "data": { ... },
  "cached": true,
  "cacheExpiresIn": "287초"
}
```

---

### 12.9 성능 측정 결과

#### API 호출 감소

| API | 변경 전 (일) | 변경 후 (일) | 감소율 |
|-----|-------------|-------------|--------|
| 교통 API (카카오) | ~600회 | ~60회 | **90%↓** |
| 날씨 API (Open-Meteo) | ~500회 | ~25회 | **95%↓** |
| URL 미리보기 | 무제한 | 캐시 히트 | **대폭 감소** |

#### 응답 시간 개선

| 기능 | 변경 전 | 변경 후 (캐시 히트) |
|------|---------|-------------------|
| 교통 정보 조회 | 2~3초 | 즉시 |
| 날씨 정보 조회 | 1~2초 | 즉시 |
| URL 미리보기 | 3~8초 | 즉시 |
| 정적 파일 로드 | 네트워크 | 로컬 캐시 |

---

### 12.10 주의사항

1. **캐시 TTL 조정 시 주의**
   - 너무 길면 오래된 데이터 표시
   - 너무 짧으면 캐싱 효과 감소

2. **데이터 변경 시 캐시 무효화**
   - 관련 캐시를 명시적으로 삭제해야 함

3. **Service Worker 버전 관리**
   - 변경 시 반드시 버전 번호 증가
   - 사용자에게 캐시 삭제 안내 필요할 수 있음

4. **메모리 사용량**
   - 캐시 크기가 커지면 메모리 사용량 증가
   - 필요시 `cacheManager.clear()` 호출

---

*마지막 업데이트: 2026-01-30*
