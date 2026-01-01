const CACHE_NAME = 'n2golf-v14';
const urlsToCache = [
  '/',
  '/css/style.css',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg'
];

// 설치 이벤트
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('캐시 열림');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('캐시 실패:', err);
      })
  );
  self.skipWaiting();
});

// 활성화 이벤트
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('오래된 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 네트워크 요청 가로채기 (네트워크 우선 전략)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 외부 도메인 요청은 Service Worker가 처리하지 않음 (Cloudinary 등)
  if (url.origin !== self.location.origin) {
    return;
  }

  // POST 요청은 캐시할 수 없으므로 그대로 네트워크로 전달
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 성공적인 응답이면 캐시에 저장 (GET 요청만)
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
        // 네트워크 실패시 캐시에서 가져오기
        return caches.match(event.request);
      })
  );
});
