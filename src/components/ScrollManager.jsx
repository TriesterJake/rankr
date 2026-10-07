import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Where each page (history entry) was scrolled to, for as long as the app stays open.
const saved = new Map()

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual' // we handle it ourselves below
}

// Going back returns you to the spot you left; opening a new page starts at the top.
export default function ScrollManager() {
  const { key } = useLocation()
  const type = useNavigationType()
  const restoring = useRef(false)

  // Remember the scroll position of the page we're on. (A layout effect so the old page stops
  // recording before the next page's shorter content can nudge the scroll position.)
  useLayoutEffect(() => {
    const onScroll = () => {
      if (!restoring.current) saved.set(key, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [key])

  useEffect(() => {
    const y = type === 'POP' ? saved.get(key) ?? 0 : 0
    if (!y) {
      window.scrollTo(0, 0)
      return undefined
    }
    // The page's content may still be loading (on a slow connection that can take several seconds),
    // so keep trying until the page is tall enough to scroll to the saved spot.
    restoring.current = true
    const startedAt = Date.now()
    let timer = 0
    const stop = () => {
      restoring.current = false
      clearInterval(timer)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
    }
    const attempt = () => {
      window.scrollTo(0, y)
      if (Math.abs(window.scrollY - y) < 2 || Date.now() - startedAt > 20000) stop()
    }
    // the person grabbing the screen means they want to scroll on their own
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('touchstart', stop, { passive: true })
    window.addEventListener('keydown', stop)
    attempt()
    timer = setInterval(attempt, 50)
    return stop
  }, [key, type])

  return null
}