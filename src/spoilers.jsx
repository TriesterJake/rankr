import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from './AuthContext.jsx'
import { getSeenSpoilers, setSpoilerSeen } from './api.js'
import { Modal } from './components/ui.jsx'

// Same rule as idea_key() in the database: "Attack on Titan!" = "attack on titan".
export const spoilerKey = (t) => (t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const SpoilersContext = createContext({ isHidden: () => false, isSeen: () => false, setSeen: () => {} })
export const useSpoilers = () => useContext(SpoilersContext)

// Knows which things you've seen, so spoilers for them aren't hidden from you.
export function SpoilersProvider({ children }) {
  const { user } = useAuth()
  const [seen, setSeenKeys] = useState(() => new Map()) // key -> label, newest first

  useEffect(() => {
    if (!user) return
    getSeenSpoilers()
      .then((rows) => setSeenKeys(new Map(rows.map((r) => [r.k, r.label || r.k]))))
      .catch(() => {}) // before update-18.sql: nothing is marked seen
  }, [user])

  const isSeen = useCallback((topic) => seen.has(spoilerKey(topic)), [seen])

  const setSeen = useCallback(
    (topic, on) => {
      const k = spoilerKey(topic)
      if (!k || !user) return
      setSeenKeys((cur) => {
        const next = new Map(cur)
        next.delete(k)
        return on ? new Map([[k, topic.trim()], ...next]) : next
      })
      setSpoilerSeen(user.id, k, on, topic.trim()).catch(() => {})
    },
    [user],
  )

  const value = useMemo(
    () => ({
      isSeen,
      setSeen,
      seenList: [...seen.entries()].map(([k, label]) => ({ k, label })), // for the Me tab
      // should this friend's item (or whole list) be covered for me?
      isHidden: (topic, ownerId) => Boolean(spoilerKey(topic)) && ownerId !== user?.id && !seen.has(spoilerKey(topic)),
    }),
    [isSeen, setSeen, seen, user?.id],
  )

  return <SpoilersContext.Provider value={value}>{children}</SpoilersContext.Provider>
}

// The topic hiding an item for me, or '' (the list's own warning counts for every item on it).
export function useHiddenTopic() {
  const { isHidden } = useSpoilers()
  return (list, item) => {
    if (!list) return ''
    if (isHidden(list.spoiler, list.owner_id)) return list.spoiler
    if (item && isHidden(item.spoiler, list.owner_id)) return item.spoiler
    return ''
  }
}

// "Spoiler for Naruto": I've seen it (shows all of them, everywhere) / Show just this one / Cancel.
// Drawn over the page, so it works even inside a tappable card.
export function SpoilerAsk({ topic, onShowOne, onClose }) {
  const { setSeen } = useSpoilers()
  if (!topic) return null
  return createPortal(
    <div onClick={(e) => e.stopPropagation()}>
      <Modal
        open
        title={`Spoiler for ${topic}`}
        onClose={onClose}
        actions={
          <div className="spoiler-ask-actions">
            <button
              className="btn primary block"
              onClick={() => {
                setSeen(topic, true)
                onClose()
              }}
            >
              I&rsquo;ve seen {topic}
            </button>
            <button
              className="btn block"
              onClick={() => {
                onShowOne()
                onClose()
              }}
            >
              Show just this one
            </button>
            <button className="btn block" onClick={onClose}>
              Cancel
            </button>
          </div>
        }
      >
        <p className="muted small">
          &ldquo;I&rsquo;ve seen it&rdquo; shows every {topic} spoiler on your friends&rsquo; lists. You can change it later on the Me tab.
        </p>
      </Modal>
    </div>,
    document.body,
  )
}

// A striped "Spoiler: Naruto" block in place of the text. Tapping it asks what to do.
export function SpoilerMask({ topic, onShowOne, note }) {
  const [asking, setAsking] = useState(false)
  const open = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setAsking(true)
  }
  return (
    <>
      <span
        className="spoiler-mask"
        role="button"
        tabIndex={0}
        aria-label={`Spoiler for ${topic}. Tap for options`}
        onClick={open}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open(e)}
      >
        <span className="spoiler-label">Spoiler: {topic}</span>
      </span>
      {note}
      {asking && <SpoilerAsk topic={topic} onShowOne={onShowOne} onClose={() => setAsking(false)} />}
    </>
  )
}

// Text that stays covered while it's a spoiler for you.
export function SpoilerText({ topic, children }) {
  const [shown, setShown] = useState(false)
  if (!topic || shown) return children
  return <SpoilerMask topic={topic} onShowOne={() => setShown(true)} />
}
