'use client'

import { useEffect, useState } from 'react'
import { sendNotification, subscribeUser, unsubscribeUser } from './actions'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream)
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches)
  }, [])

  if (isStandalone) {
    return null
  }

  return (
    <section className="space-y-2 rounded-lg border border-muted p-4">
      <h2 className="text-lg font-semibold">Install App</h2>
      <p className="text-sm text-muted-foreground">
        Add Starships.ai to your home screen for a full screen experience.
      </p>
      {isIOS ? (
        <p className="text-sm text-muted-foreground">
          On iOS, use the share menu in Safari, then select &ldquo;Add to Home Screen&rdquo;.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Most browsers will prompt you to install once you meet the PWA requirements.
        </p>
      )}
    </section>
  )
}

function PushNotificationManager({ publicKey }: { publicKey: string | null }) {
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true)
      registerServiceWorker().catch((err) => {
        console.error('Service worker registration failed:', err)
        setError('Failed to register service worker.')
      })
    }
  }, [])

  async function registerServiceWorker() {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    const sub = await registration.pushManager.getSubscription()
    setSubscription(sub)
  }

  async function subscribeToPush() {
    setError(null)
    if (!publicKey) {
      setError('Missing VAPID public key.')
      return
    }

    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
    setSubscription(sub)
    const serializedSub = JSON.parse(JSON.stringify(sub))
    await subscribeUser(serializedSub)
  }

  async function unsubscribeFromPush() {
    setError(null)
    await subscription?.unsubscribe()
    setSubscription(null)
    await unsubscribeUser()
  }

  async function sendTestNotification() {
    setError(null)
    if (!subscription) {
      setError('Please subscribe first.')
      return
    }
    await sendNotification(message)
    setMessage('')
  }

  if (!isSupported) {
    return (
      <section className="rounded-lg border border-muted p-4 text-sm text-muted-foreground">
        Push notifications are not supported in this browser.
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-muted p-4">
      <div>
        <h2 className="text-lg font-semibold">Push Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Subscribe to receive updates even when you are not actively using the app.
        </p>
      </div>
      {subscription ? (
        <div className="space-y-3">
          <p className="text-sm">You are subscribed to push notifications.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={unsubscribeFromPush}
              className="rounded-md border border-muted px-3 py-1.5 text-sm"
            >
              Unsubscribe
            </button>
            <button
              type="button"
              onClick={sendTestNotification}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              disabled={!message.trim()}
            >
              Send Test
            </button>
          </div>
          <input
            type="text"
            placeholder="Enter notification message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-md border border-muted bg-background px-3 py-2 text-sm"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">You are not subscribed to push notifications.</p>
          <button
            type="button"
            onClick={subscribeToPush}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            Subscribe
          </button>
        </div>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}

export default function PwaClient({ publicKey }: { publicKey: string | null }) {
  return (
    <div className="space-y-6">
      <PushNotificationManager publicKey={publicKey} />
      <InstallPrompt />
    </div>
  )
}
