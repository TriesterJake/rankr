import { deleteApnsToken, deletePushSubscription, saveApnsToken, savePushSubscription } from './api.js'
import { isNative } from './native.js'

// ---------- iPhone app: notifications come from Apple (the website below keeps using web push) ----------

const NATIVE_OFF = 'rankr-native-push-off' // set when you tap "Turn off" (iOS can't take back its permission)
const nativeOff = () => {
  try {
    return localStorage.getItem(NATIVE_OFF) === '1'
  } catch {
    return false
  }
}
const setNativeOff = (off) => {
  try {
    if (off) localStorage.setItem(NATIVE_OFF, '1')
    else localStorage.removeItem(NATIVE_OFF)
  } catch {
    /* fine */
  }
}
const nativePush = async () => (await import('@capacitor/push-notifications')).PushNotifications

async function nativeStatus() {
  const { receive } = await (await nativePush()).checkPermissions()
  if (receive === 'denied') return 'blocked'
  if (receive !== 'granted') return 'off'
  return nativeOff() ? 'off' : 'on'
}

// Ask Apple for this iPhone's address ("device token") and save it for whoever is signed in.
async function registerNative() {
  const Push = await nativePush()
  const token = await new Promise((resolve, reject) => {
    const handles = []
    const done = (fn, v) => {
      clearTimeout(timer)
      handles.forEach((h) => h.then((x) => x.remove()))
      fn(v)
    }
    const timer = setTimeout(() => done(reject, new Error('no device token')), 15000)
    handles.push(Push.addListener('registration', (t) => done(resolve, t.value)))
    handles.push(Push.addListener('registrationError', (e) => done(reject, new Error(e?.error || 'registration failed'))))
    Push.register().catch((e) => done(reject, e))
  })
  await saveApnsToken(token)
  try {
    localStorage.setItem('rankr-apns-token', token)
  } catch {
    /* only needed for "Turn off" */
  }
}

// Called once at startup in the iPhone app: tapping a notification opens its page.
export async function setUpNativePush() {
  const Push = await nativePush()
  Push.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url = notification?.data?.url
    if (typeof url === 'string' && url.startsWith('/')) openFromNotification(url)
  })
}

// Pages are opened by NotificationsContext (it has the router). A tap that starts the app can arrive before
// that is ready, so it waits here until then.
let pendingOpen = null
function openFromNotification(url) {
  pendingOpen = url
  window.dispatchEvent(new CustomEvent('rankr:open', { detail: url }))
}
export function takePendingOpen() {
  const url = pendingOpen
  pendingOpen = null
  return url
}

// The number on the app icon in the iPhone app (MainViewController in AppDelegate.swift sets it).
export function setNativeBadge(count) {
  try {
    window.webkit?.messageHandlers?.rankrBadge?.postMessage(count)
  } catch {
    /* not in the app */
  }
}

// ---------- Website: web push ----------

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
    if (isNative()) return await nativeStatus()
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
  if (isNative()) {
    const Push = await nativePush()
    let { receive } = await Push.checkPermissions()
    if (receive !== 'granted' && receive !== 'denied') receive = (await Push.requestPermissions()).receive
    if (receive !== 'granted') return receive === 'denied' ? 'blocked' : 'off'
    await registerNative()
    setNativeOff(false)
    return 'on'
  }
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
  if (isNative()) {
    let token = null
    try {
      token = localStorage.getItem('rankr-apns-token')
    } catch {
      /* no saved token */
    }
    if (token) await deleteApnsToken(token)
    setNativeOff(true)
    return 'off'
  }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await deletePushSubscription(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
  return 'off'
}

// On sign-in: if this phone already allowed notifications, attach it to whoever is signed in now.
export async function syncPushSubscription(userId) {
  try {
    const mark = `rankr-push-${userId}`
    try {
      if (Date.now() - Number(localStorage.getItem(mark) || 0) < 24 * 3600 * 1000) return
    } catch {
      /* storage unavailable: just sync */
    }
    if ((await getPushStatus()) !== 'on') return
    if (isNative()) {
      await registerNative()
      try {
        localStorage.setItem(mark, String(Date.now()))
      } catch {
        /* fine */
      }
      return
    }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const json = sub.toJSON()
    await savePushSubscription(json.endpoint, json.keys.p256dh, json.keys.auth)
    try {
      localStorage.setItem(mark, String(Date.now()))
    } catch {
      /* fine */
    }
  } catch {
    /* try again next time */
  }
}

// Remove RankR's banners from the phone's notification list (used when you open Activity).
export async function clearDeliveredNotifications() {
  try {
    if (isNative()) return await (await nativePush()).removeAllDeliveredNotifications()
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const shown = await reg.getNotifications()
    shown.forEach((n) => n.close())
  } catch {
    /* not supported here: nothing to clear */
  }
}