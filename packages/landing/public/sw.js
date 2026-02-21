function parsePushData(event) {
  if (!event.data) {
    return null
  }
  try {
    return event.data.json()
  } catch (error) {
    return {
      title: 'Starships.ai',
      body: event.data.text(),
    }
  }
}

self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', function (event) {
  const data = parsePushData(event)
  if (!data) {
    return
  }
  const options = {
    body: data.body || '',
    icon: data.icon || '/web-app-manifest-512x512.png',
    badge: '/web-app-manifest-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 'starships-pwa',
    },
  }

  const title = data.title || 'Starships.ai'
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  event.waitUntil(clients.openWindow('/'))
})
