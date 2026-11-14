import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { getSeenSpoilers, setSpoilerSeen } from './api.js'

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

// Shows a blurred "Spoiler" in place of text until you tap it.
export function SpoilerText({ topic, children }) {
  const [shown, setShown] = useState(false)
  if (!topic || shown) return children
  return (
    <span
      className="spoiler-mask"
      role="button"
      tabIndex={0}
      title={`Spoiler for ${topic}. Tap to show`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setShown(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setShown(true)
        }
      }}
    >
      <span className="spoiler-label">Spoiler: {topic}</span>
    </span>
  )
}
