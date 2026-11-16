const CACHE_NAME = 'exam-room-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/', '/icon.svg', '/manifest.webmanifest']).catch(() => undefined);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin requests and skip live API routes
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(req, clone))
            .catch(() => undefined);
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const root = await caches.match('/');
          if (root) return root;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const roomCode = event.notification?.data?.roomCode || '';
  const targetUrl =
    event.notification?.data?.url ||
    (roomCode ? `/?room=${encodeURIComponent(roomCode)}` : '/');

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            try {
              await client.focus();
            } catch {
              /* ignore */
            }
            if (roomCode && 'postMessage' in client) {
              client.postMessage({ type: 'OPEN_ROOM_INVITE', roomCode });
            }
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
