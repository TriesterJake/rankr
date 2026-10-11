import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { getFriendsLists } from '../api.js'
import { sameTopic } from '../compare.js'
import { Avatar, Sheet, Spinner } from './ui.jsx'

const MAX = 5

// Pick which friends' lists to line up next to one of yours.
export default function MultiCompareSheet({ open, list, onClose }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lists, setLists] = useState(null)
  const [picked, setPicked] = useState([])

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLists(null)
    getFriendsLists(user.id)
      .then((rows) => {
        if (cancelled) return
        const marked = rows.map((r) => ({ ...r, same: sameTopic(list.title, r.title), count: r.list_items?.[0]?.count ?? 0 }))
        marked.sort((a, b) => Number(b.same) - Number(a.same) || (a.owner?.username || '').localeCompare(b.owner?.username || ''))
        setLists(marked)
        setPicked(marked.filter((m) => m.same).slice(0, MAX).map((m) => m.id)) // same-topic lists start ticked
      })
      .catch(() => !cancelled && setLists([]))
    return () => {
      cancelled = true
    }
  }, [open, list.title, user.id])

  const toggle = (id) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX ? cur : [...cur, id]))

  return (
    <Sheet open={open} onClose={onClose} title="Compare with friends">
      <p className="muted small">
        Line up <b>{list.title}</b> with friends&rsquo; lists. Pick up to {MAX}.
      </p>
      {lists === null && <Spinner />}
      {lists && lists.length === 0 && <p className="muted">None of your friends have shared a list yet.</p>}
      {lists && lists.length > 0 && (
        <>
          <div className="pick-list">
            {lists.map((l) => {
              const on = picked.includes(l.id)
              return (
                <button key={l.id} type="button" className={on ? 'pick-row picked' : 'pick-row'} onClick={() => toggle(l.id)} aria-pressed={on}>
                  <span className={on ? 'check on' : 'check'} aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                  <Avatar profile={l.owner} size={32} />
                  <span className="pick-title">
                    {l.title}
                    <span className="muted small"> @{l.owner?.username}</span>
                  </span>
                  {l.same && <span className="pill">Same topic</span>}
                </button>
              )
            })}
          </div>
          <button
            className="btn primary block spaced"
            disabled={picked.length === 0}
            onClick={() => navigate(`/compare-many?lists=${[list.id, ...picked].join(',')}`)}
          >
            {picked.length === 0 ? 'Pick at least one list' : `Compare ${picked.length + 1} lists`}
          </button>
        </>
      )}
    </Sheet>
  )
}