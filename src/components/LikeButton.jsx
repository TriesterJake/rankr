import { useState } from 'react'
import { likeList, unlikeList } from '../api.js'
import { useToast } from '../toast.jsx'

export function Heart({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.8 6.4 4.8c2 0 3.7 1.1 4.6 2.7h2c.9-1.6 2.6-2.7 4.6-2.7 3.4 0 5.5 3.5 4 7C19.5 16.4 12 21 12 21z" />
    </svg>
  )
}

// Heart button for someone else's list. Updates right away, undoes itself if saving fails.
export default function LikeButton({ listId, userId, initialLiked, initialCount, onChange }) {
  const toast = useToast()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    const next = !liked
    setBusy(true)
    setLiked(next)
    setCount((c) => Math.max(0, c + (next ? 1 : -1)))
    try {
      if (next) await likeList(listId, userId)
      else await unlikeList(listId, userId)
      onChange?.(next)
    } catch {
      setLiked(!next)
      setCount((c) => Math.max(0, c + (next ? -1 : 1)))
      toast('Could not save your like')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={liked ? 'like-btn on' : 'like-btn'} onClick={toggle} aria-pressed={liked} aria-label={liked ? 'Unlike this list' : 'Like this list'}>
      <Heart filled={liked} />
      <span>{count > 0 ? count : 'Like'}</span>
    </button>
  )
}