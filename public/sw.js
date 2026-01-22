const CACHE_NAME = 'n2golf-v16';
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

// 푸시 알림 수신
self.addEventListener('push', event => {
  console.log('푸시 알림 수신');

  let data = {
    title: 'N2골프',
    body: '새로운 알림이 있습니다.',
    url: '/',
    icon: '/icons/icon-192x192.svg'
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    console.error('푸시 데이터 파싱 오류:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192x192.svg',
    badge: '/icons/icon-72x72.svg',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: '열기' },
      { action: 'close', title: '닫기' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', event => {
  console.log('알림 클릭:', event.action);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // 이미 열린 창이 있으면 포커스
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // 열린 창이 없으면 새 창 열기
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// 알림 닫기 처리 (선택적)
self.addEventListener('notificationclose', event => {
  console.log('알림 닫힘');
});
