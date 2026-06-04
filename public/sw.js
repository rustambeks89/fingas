// [UPDATED BY CLAUDE CLI - 2026-06-04]
// Project: Fingas
// Purpose: PWA Service Worker handling asset caching & lock-screen Push Notifications.
//
// Стратегия:
//   - Хешированные бандлы (/assets/*-XYZ.js, *.css) — cache-first, immutable.
//     Vite ставит уникальный хеш в имя файла, при деплое имя меняется,
//     старая запись больше не запрашивается — её сбрасываем в `activate`.
//   - HTML (`/`, `/index.html`) — network-first с фоллбэком на cache.
//     Так пользователь всегда получает свежий entry-point с правильными
//     именами бандлов после нового деплоя.
//   - Шрифты Google — cache-first (immutable).
//   - Всё прочее (Supabase API, иконки, фавиконки) — пропускаем без кэша.

const VERSION = 'v3-2026-06-04';
const HTML_CACHE = `fingas-html-${VERSION}`;
const ASSET_CACHE = `fingas-assets-${VERSION}`;
const FONT_CACHE  = `fingas-fonts-${VERSION}`;
const CORE_PRECACHE = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/apple-touch-icon.png'];

// Install — precache base shell so first offline open работает.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(HTML_CACHE)
      .then((cache) => cache.addAll(CORE_PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

// Activate — чистим всё кроме текущей версии. Старые хешированные бандлы
// уходят вместе с прошлой версией кэша.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![HTML_CACHE, ASSET_CACHE, FONT_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isAssetPath(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
}

function isHtmlRequest(req, url) {
  if (req.mode === 'navigate') return true;
  if (url.origin !== self.location.origin) return false;
  return url.pathname === '/' || url.pathname.endsWith('.html');
}

function isGoogleFont(url) {
  return url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com';
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase REST / Realtime / любые кросс-оригин API — оставляем браузеру.
  // Кэшировать их через SW опасно (RLS, права).
  if (
    !isAssetPath(url) &&
    !isHtmlRequest(req, url) &&
    !isGoogleFont(url)
  ) {
    return;
  }

  // Хешированные ассеты Vite — cache-first, immutable.
  if (isAssetPath(url)) {
    e.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      }),
    );
    return;
  }

  // Google Fonts — тоже cache-first (immutable URL'ы с хешем).
  if (isGoogleFont(url)) {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
        return fresh;
      }),
    );
    return;
  }

  // HTML — network-first, чтобы при деплое новой версии index.html всегда
  // приехал свежим (он ссылается на новые именa бандлов).
  if (isHtmlRequest(req, url)) {
    e.respondWith(
      fetch(req)
        .then((fresh) => {
          if (fresh && fresh.status === 200) {
            const copy = fresh.clone();
            caches.open(HTML_CACHE).then((cache) => cache.put(req, copy));
          }
          return fresh;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          // Fallback на любую закэшированную shell — даже /
          return caches.match('/index.html') || caches.match('/');
        }),
    );
    return;
  }
});

// Push Event — Listen for Web Push notifications sent by the backend / Supabase / Edge function
self.addEventListener('push', (e) => {
  let data = {
    title: 'Fingas',
    body: 'Новое уведомление',
    icon: '/apple-touch-icon.png',
    badge: '/favicon.svg',
    url: '/'
  };

  if (e.data) {
    try {
      const parsed = e.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = e.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    data: {
      url: data.url || '/'
    },
    vibrate: [100, 50, 100],
    actions: data.actions || []
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event — Open app or navigate when notification is clicked
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const targetUrl = e.notification.data?.url || '/';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl);
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
