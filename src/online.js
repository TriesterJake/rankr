import { useEffect, useState } from 'react'

// The phone says it has no connection (airplane mode, no signal). When it says it's online, requests can still fail.
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

export function useOnline() {
  const [online, setOnline] = useState(() => !isOffline())
  useEffect(() => {
    const update = () => setOnline(!isOffline())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

// Run `reload` when the connection comes back (for pages that failed to load while offline).
export function useReloadOnReconnect(reload) {
  useEffect(() => {
    const on = () => reload()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [reload])
}
