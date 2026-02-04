'use server'

import webpush from 'web-push'

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:ops@starships.ai'

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

let subscription: webpush.PushSubscription | null = null

function assertVapidConfigured() {
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('Missing VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.')
  }
}

export async function subscribeUser(sub: webpush.PushSubscription) {
  assertVapidConfigured()
  subscription = sub
  // Persist this in your database for production usage.
  return { success: true }
}

export async function unsubscribeUser() {
  subscription = null
  // Remove the subscription from your database in production usage.
  return { success: true }
}

export async function sendNotification(message: string) {
  assertVapidConfigured()

  if (!subscription) {
    throw new Error('No subscription available')
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: 'Starships.ai',
        body: message,
        icon: '/web-app-manifest-512x512.png',
      })
    )
    return { success: true }
  } catch (error) {
    console.error('Error sending push notification:', error)
    return { success: false, error: 'Failed to send notification' }
  }
}
