import { useState } from 'react'
import { clearFavorite, setFavorite } from '../api.js'
import { useToast } from '../toast.jsx'
import { Modal } from './ui.jsx'

export function Star({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  )
}

// Your ONE favorite among a friend's lists. Picking another asks first, then switches.
// list: { id, title }   other: { id, title } | null (your current favorite of this friend, if it is a different list)
export default function FavoriteButton({ list, ownerName, isFavorite, other, onChange }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function run(next) {
    setBusy(true)
    try {
      if (next) await setFavorite(list.id)
      else await clearFavorite(list.id)
      onChange?.(next)
      toast(next ? `Favorited "${list.title}"` : 'Favorite removed')
    } catch {
      toast('Could not save your favorite')
    } finally {
      setBusy(false)
    }
  }

  function click() {
    if (busy) return
    if (isFavorite) run(false)
    else if (other) setConfirm(true)
    else run(true)
  }

  return (
    <>
      <button
        type="button"
        className={isFavorite ? 'like-btn fav on' : 'like-btn fav'}
        onClick={click}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? 'Remove as your favorite' : `Make this your favorite of ${ownerName}'s lists`}
      >
        <Star filled={isFavorite} />
        <span>{isFavorite ? 'Favorite' : 'Favorite?'}</span>
      </button>
      <Modal
        open={confirm}
        title="Switch your favorite?"
        onClose={() => setConfirm(false)}
        actions={
          <>
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={() => {
                setConfirm(false)
                run(true)
              }}
            >
              Switch
            </button>
          </>
        }
      >
        <p>
          You can have one favorite per friend, and <b>&ldquo;{other?.title}&rdquo;</b> is your favorite of {ownerName}&rsquo;s lists right
          now. Make <b>&ldquo;{list.title}&rdquo;</b> your favorite instead?
        </p>
      </Modal>
    </>
  )
}