// [CREATED BY ANTIGRAVITY CLI - 2026-05-27]
// Project: Fingas
// Purpose: PWA Service Worker handling asset caching & lock-screen Push Notifications.

const CACHE_NAME = 'fingas-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/manifest.json'
];

// Install Event — cache core static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event — cleanup old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — stale-while-revalidate for static files, bypass for Supabase API
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Bypass cache for Supabase / API requests and dynamic data
  if (url.origin !== self.location.origin || e.request.method !== 'GET') {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch new version in background to update cache
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => { /* ignore network error when offline */ });
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
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
    // iOS specific adjustments
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
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
