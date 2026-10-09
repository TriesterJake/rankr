import { deletePushSubscription, savePushSubscription } from './api.js'

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

const urlBase64ToUint8Array = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

// 'hidden'        -> nothing to offer (not set up, or this browser can't do it)
// 'needs-install' -> iPhone/iPad: only works after "Add to Home Screen"
// 'blocked'       -> the person said no in the system prompt
// 'off' | 'on'    -> can be switched on / is on for this device
export async function getPushStatus() {
  try {
    if (!PUBLIC_KEY) return 'hidden'
    if (isIos() && !isInstalled()) return 'needs-install'
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'hidden'
    if (Notification.permission === 'denied') return 'blocked'
    if (Notification.permission !== 'granted') return 'off'
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
  } catch {
    return 'hidden'
  }
}

// Must be called from a tap (the phone only shows its permission question after one).
export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) }))
  const json = sub.toJSON()
  await savePushSubscription(json.endpoint, json.keys.p256dh, json.keys.auth)
  return 'on'
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await deletePushSubscription(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
  return 'off'
}

// On sign-in: if this phone already allowed notifications, attach it to whoever is signed in now.
export async function syncPushSubscription() {
  try {
    if ((await getPushStatus()) !== 'on') return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const json = sub.toJSON()
    await savePushSubscription(json.endpoint, json.keys.p256dh, json.keys.auth)
  } catch {
    /* try again next time */
  }
}

// Remove RankR's banners from the phone's notification list (used when you open Activity).
export async function clearDeliveredNotifications() {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const shown = await reg.getNotifications()
    shown.forEach((n) => n.close())
  } catch {
    /* not supported here: nothing to clear */
  }
}