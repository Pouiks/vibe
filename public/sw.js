// ── VibeSpot Service Worker ──

// Minimal fetch handler: network-first, required by some browsers for PWA installability
self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).catch(function() {
      if (event.request.mode === 'navigate') {
        return caches.match('/') || new Response('Hors ligne', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      return new Response('', { status: 503 });
    })
  );
});

self.addEventListener('push', function(event) {
  if (event.data) {
    var data = event.data.json();

    var options = {
      body: data.body,
      icon: '/vibeSpot-192x192.png',
      badge: '/vibeSpot-192x192.png',
      data: data.data || { url: '/' },
      vibrate: [200, 100, 200],
      tag: data.data && data.data.url ? 'vibe-' + data.data.url : 'vibe-default',
      renotify: true
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Notification VIBE', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      var urlToOpen = event.notification.data.url;

      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
