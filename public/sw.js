const CACHE_NAME = 'n2golf-v19';

// 초기 캐시할 정적 파일
const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg'
];

// 캐시 전략 설정
const CACHE_STRATEGIES = {
  // 정적 파일: Cache-First (캐시 우선, 없으면 네트워크)
  static: {
    match: (url) => {
      const staticExtensions = ['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2'];
      return staticExtensions.some(ext => url.pathname.endsWith(ext)) || url.pathname === '/manifest.json';
    },
    ttl: 24 * 60 * 60 * 1000 // 1일
  },
  // API 캐시 대상: Stale-While-Revalidate (캐시 즉시 응답 + 백그라운드 갱신)
  api: {
    match: (url) => {
      const cachedApis = ['/api/weather', '/api/traffic'];
      return cachedApis.some(api => url.pathname.startsWith(api));
    },
    ttl: 5 * 60 * 1000 // 5분
  }
};

// 설치 이벤트
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 정적 파일 캐시 중...');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(err => {
        console.log('[SW] 캐시 실패:', err);
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
            console.log('[SW] 오래된 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 네트워크 요청 가로채기
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

  // 정적 파일: Cache-First 전략
  if (CACHE_STRATEGIES.static.match(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // 캐시 대상 API: Stale-While-Revalidate 전략
  if (CACHE_STRATEGIES.api.match(url)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // 그 외 (페이지 등): Network-First 전략
  event.respondWith(networkFirst(event.request));
});

/**
 * Cache-First 전략
 * 캐시에 있으면 즉시 반환, 없으면 네트워크 요청
 * 정적 파일에 적합
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] 네트워크 오류:', error);
    return new Response('오프라인 상태입니다.', { status: 503 });
  }
}

/**
 * Stale-While-Revalidate 전략
 * 캐시 있으면 즉시 반환 + 백그라운드에서 네트워크 갱신
 * API 응답에 적합 (빠른 체감 속도 + 최신 데이터 유지)
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // 백그라운드에서 네트워크 요청 및 캐시 갱신
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.status === 200) {
        cache.put(request, response.clone());
        console.log('[SW] 캐시 갱신:', request.url);
      }
      return response;
    })
    .catch(error => {
      console.log('[SW] 백그라운드 갱신 실패:', error);
      return null;
    });

  // 캐시가 있으면 즉시 반환, 없으면 네트워크 응답 대기
  if (cached) {
    console.log('[SW] Stale 캐시 반환:', request.url);
    return cached;
  }

  const response = await fetchPromise;
  return response || new Response(JSON.stringify({ error: '오프라인' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Network-First 전략
 * 네트워크 우선, 실패 시 캐시 반환
 * 동적 페이지에 적합
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] 오프라인 캐시 반환:', request.url);
      return cached;
    }
    return new Response('오프라인 상태입니다.', { status: 503 });
  }
}

// 푸시 알림 수신
self.addEventListener('push', event => {
  console.log('[SW] 푸시 알림 수신');

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
    console.error('[SW] 푸시 데이터 파싱 오류:', e);
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
  console.log('[SW] 알림 클릭:', event.action);

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

// 알림 닫기 처리
self.addEventListener('notificationclose', event => {
  console.log('[SW] 알림 닫힘');
});
