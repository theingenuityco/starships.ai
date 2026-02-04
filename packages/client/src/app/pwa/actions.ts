'use server'

import webpush from 'web-push'

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT

if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

let subscriptions: webpush.PushSubscription[] = []

function assertVapidConfigured() {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    if (!vapidSubject) {
      throw new Error('Missing VAPID_SUBJECT.')
    }
    if (!vapidPublicKey) {
      throw new Error('Missing VAPID_PUBLIC_KEY.')
    }
    if (!vapidPrivateKey) {
      throw new Error('Missing VAPID_PRIVATE_KEY.')
    }
  }
}

export async function subscribeUser(sub: webpush.PushSubscription) {
  assertVapidConfigured()
  // De-duplicate by endpoint
  console.log('[PWA] subscribeUser called for endpoint:', sub.endpoint)
  subscriptions = [
    ...subscriptions.filter((s) => s.endpoint !== sub.endpoint),
    sub,
  ]
  console.log('[PWA] Total subscriptions after subscribe:', subscriptions.length)
  // Persist this in your database for production usage.
  return { success: true }
}

export async function unsubscribeUser(sub: webpush.PushSubscription) {
  console.log('[PWA] unsubscribeUser called for endpoint:', sub.endpoint)
  subscriptions = subscriptions.filter((s) => s.endpoint !== sub.endpoint)
  console.log('[PWA] Total subscriptions after unsubscribe:', subscriptions.length)
  // Remove the subscription from your database in production usage.
  return { success: true }
}

export async function sendNotification(message: string) {
  assertVapidConfigured()

  if (!subscriptions.length) {
    console.warn('[PWA] sendNotification called with no active subscriptions')
    throw new Error('No subscriptions available')
  }

  try {
    const payload = JSON.stringify({
      title: 'Starships.ai',
      body: message,
      icon: '/web-app-manifest-512x512.png',
    })

    console.log('[PWA] Sending notification to subscriptions:', subscriptions.length)

    const results = await Promise.allSettled(
      subscriptions.map((sub) => webpush.sendNotification(sub, payload))
    )

    // Drop invalid subscriptions (410 Gone, 404 Not Found, etc.)
    const alive: webpush.PushSubscription[] = []
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        alive.push(subscriptions[index]!)
      } else {
        const status = (result.reason as any)?.statusCode
        console.warn(
          '[PWA] Error sending to endpoint',
          subscriptions[index]?.endpoint,
          'status:',
          status
        )
        if (status !== 410 && status !== 404) {
          console.error('Error sending push notification:', result.reason)
          alive.push(subscriptions[index]!)
        }
      }
    })
    subscriptions = alive
    console.log('[PWA] Subscriptions remaining after cleanup:', subscriptions.length)

    return { success: true }
  } catch (error) {
    console.error('Error sending push notification:', error)
    return { success: false, error: 'Failed to send notification' }
  }
}
