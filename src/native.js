// True inside the iPhone app (Capacitor), false in a normal browser / home-screen web app.
export const isNative = () => Boolean(window.Capacitor?.isNativePlatform?.())
