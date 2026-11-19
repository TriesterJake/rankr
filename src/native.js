// True inside the iPhone app (Capacitor), false in a normal browser / home-screen web app.
export const isNative = () => Boolean(window.Capacitor?.isNativePlatform?.())

// iPhone app: mark the page while the keyboard is up (the tabs hide; see .keyboard-open in styles.css).
// The Keyboard plugin also shrinks the app to end at the keyboard, so the list doesn't show through behind it.
export async function setUpNative() {
  if (!isNative()) return
  const { Keyboard } = await import('@capacitor/keyboard')
  Keyboard.addListener('keyboardWillShow', () => document.body.classList.add('keyboard-open'))
  Keyboard.addListener('keyboardWillHide', () => document.body.classList.remove('keyboard-open'))
}

// Where you are right now. In the iPhone app this asks through iOS itself ("RankR would like to use your location"),
// instead of the web view's prompt, which names the app's internal address ("localhost").
export async function nativePosition() {
  const { Geolocation } = await import('@capacitor/geolocation')
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch (err) {
    // same shape as the browser's error: code 1 means permission was denied
    const denied = /denied|not authorized|permission/i.test(err?.message || '')
    throw Object.assign(new Error(err?.message || 'location failed'), { code: denied ? 1 : 2 })
  }
}
