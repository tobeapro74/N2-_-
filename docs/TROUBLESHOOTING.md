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

*마지막 업데이트: 2026-01-01*
