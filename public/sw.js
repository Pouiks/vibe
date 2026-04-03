self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    
    // Customize notification UI
    const options = {
      body: data.body,
      icon: '/file.svg', // Replace with real 192x192 PWA maskable icon later
      badge: '/file.svg',
      data: data.data || { url: '/' },
      vibrate: [200, 100, 200]
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
      const urlToOpen = event.notification.data.url;
      
      // If window already open, focus it
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Else open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
