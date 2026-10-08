import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { useNotifications } from '../NotificationsContext.jsx'
import {
  acceptFriendRequest,
  clearNotifications,
  deleteNotification,
  getFriendships,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeFriendship,
} from '../api.js'
import { groupNotifications, nameList } from '../activityGroups.js'
import { disablePush, enablePush, getPushStatus } from '../push.js'
import { Avatar, Empty, Modal, Spinner, TopBar } from '../components/ui.jsx'

const GLYPH = { new_list: '📝', edited_list: '✏️', liked: '❤️', favorited: '⭐', friend_accepted: '🤝' }

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const uniq = (arr) => [...new Set(arr)]

function Message({ g }) {
  const first = g.rows[0]
  const who = <b>{nameList(g.actors)}</b>
  const list = <b>{first.list_title || 'a list'}</b>
  switch (g.type) {
    case 'new_list':
      return g.count > 1 ? (
        <>
          {who} made <b>{g.count} new lists</b>
        </>
      ) : (
        <>
          {who} made a new list {list}
        </>
      )
    case 'edited_list':
      return g.count > 1 ? (
        <>
          {who} updated <b>{g.count} lists</b>
        </>
      ) : (
        <>
          {who} updated {list}
        </>
      )
    case 'liked':
      return (
        <>
          {who} liked your list {list}
        </>
      )
    case 'favorited':
      return (
        <>
          {who} made {list} their favorite of your lists
        </>
      )
    case 'reacted':
      return g.count > 1 ? (
        <>
          {who} reacted {uniq(g.rows.map((r) => r.emoji)).slice(0, 4).join(' ')} to <b>{g.count} items</b> in {list}
        </>
      ) : (
        <>
          {who} reacted {first.emoji} to <b>{first.item_title || 'an item'}</b> in {list}
        </>
      )
    case 'friend_accepted':
      return <>{who} accepted your friend request</>
    default:
      return <>{who} did something</>
  }
}

// Where tapping a row goes.
function targetOf(g) {
  const first = g.rows[0]
  if (g.type === 'friend_accepted') return `/u/${first.actor?.id}`
  if ((g.type === 'new_list' || g.type === 'edited_list') && g.count > 1) return `/u/${first.actor?.id}`
  if (!first.list_id) return null
  if (g.type === 'reacted' && g.count === 1 && first.item_id) return `/list/${first.list_id}?item=${first.item_id}`
  return `/list/${first.list_id}`
}

function PushCard({ status, busy, onEnable, onDisable }) {
  if (status === 'off')
    return (
      <div className="push-card">
        <div>
          <b>Get notified on this device</b>
          <p className="muted small">Buzz me when friends like, react to or add lists, and when someone sends a friend request.</p>
        </div>
        <button className="btn primary small" disabled={busy} onClick={onEnable}>
          Turn on
        </button>
      </div>
    )
  if (status === 'needs-install')
    return (
      <div className="push-card">
        <div>
          <b>Want phone notifications?</b>
          <p className="muted small">
            On iPhone, tap the Share button in Safari, choose <b>Add to Home Screen</b>, then open RankR from your Home Screen and turn them on here.
          </p>
        </div>
      </div>
    )
  if (status === 'blocked')
    return (
      <div className="push-card">
        <div>
          <b>Notifications are blocked</b>
          <p className="muted small">Allow RankR in your phone&rsquo;s Settings &rarr; Notifications (or your browser&rsquo;s site settings), then come back.</p>
        </div>
      </div>
    )
  return null
}

export default function ActivityPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { setUnread, refreshUnread } = useNotifications()
  const [items, setItems] = useState(null)
  const [friendships, setFriendships] = useState(null)
  const [tab, setTab] = useState('updates')
  const [confirmClear, setConfirmClear] = useState(false)
  const [pushStatus, setPushStatus] = useState('hidden')
  const [pushBusy, setPushBusy] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const pickedTab = useRef(false)

  const load = useCallback(async () => {
    try {
      const rows = await getNotifications()
      setItems(rows)
      setUnread(rows.filter((r) => !r.read_at).length)
    } catch {
      toast('Could not load your notifications')
      setItems([])
    }
    try {
      setFriendships(await getFriendships(user.id))
    } catch {
      setFriendships([])
    }
  }, [setUnread, toast, user.id])

  useEffect(() => {
    load()
    getPushStatus().then(setPushStatus)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const incoming = (friendships || []).filter((f) => f.status === 'pending' && f.addressee_id === user.id)
  const outgoing = (friendships || []).filter((f) => f.status === 'pending' && f.requester_id === user.id)
  const updates = (items || []).filter((n) => n.type !== 'friend_request')
  const groups = groupNotifications(updates)

  // open on the Requests tab the first time, if someone is waiting on you
  useEffect(() => {
    if (friendships && !pickedTab.current) {
      pickedTab.current = true
      if (incoming.length > 0) setTab('requests')
    }
  }, [friendships, incoming.length])

  async function turnOn() {
    setPushBusy(true)
    try {
      const next = await enablePush()
      setPushStatus(next)
      if (next === 'on') toast('Notifications are on')
    } catch {
      toast('Could not turn on notifications')
    } finally {
      setPushBusy(false)
    }
  }

  async function turnOff() {
    setPushBusy(true)
    try {
      setPushStatus(await disablePush())
      toast('Notifications are off for this device')
    } catch {
      toast('Could not turn them off')
    } finally {
      setPushBusy(false)
    }
  }

  async function markRows(rows) {
    const unreadRows = rows.filter((r) => !r.read_at)
    if (unreadRows.length === 0) return
    const ids = new Set(unreadRows.map((r) => r.id))
    const stamp = new Date().toISOString()
    setItems((cur) => cur.map((x) => (ids.has(x.id) ? { ...x, read_at: stamp } : x)))
    setUnread((u) => Math.max(0, u - unreadRows.length))
    try {
      await Promise.all(unreadRows.map((r) => markNotificationRead(r.id)))
    } catch {
      refreshUnread()
    }
  }

  function open(g) {
    markRows(g.rows)
    const to = targetOf(g)
    if (to) navigate(to)
    else toast('That list is gone')
  }

  async function remove(g) {
    const ids = new Set(g.rows.map((r) => r.id))
    setItems((cur) => cur.filter((x) => !ids.has(x.id)))
    setUnread((u) => Math.max(0, u - g.rows.filter((r) => !r.read_at).length))
    try {
      await Promise.all(g.rows.map((r) => deleteNotification(r.id)))
    } catch {
      toast('Could not remove that')
      load()
    }
  }

  async function markAll() {
    const stamp = new Date().toISOString()
    setItems((cur) => cur.map((x) => (x.type === 'friend_request' ? x : { ...x, read_at: x.read_at || stamp })))
    try {
      await markAllNotificationsRead()
      await refreshUnread()
    } catch {
      toast('Could not mark them as read')
      load()
    }
  }

  async function clearAll() {
    setConfirmClear(false)
    const before = items
    setItems((cur) => cur.filter((x) => x.type === 'friend_request'))
    try {
      // friend requests stay: they are answered with Accept / Decline
      await Promise.all(updates.map((n) => deleteNotification(n.id)))
      await refreshUnread()
    } catch {
      toast('Could not clear your notifications')
      setItems(before)
      load()
    }
  }

  async function answer(f, accept) {
    setBusyId(f.id)
    try {
      if (accept) await acceptFriendRequest(f.id)
      else await removeFriendship(f.id)
      setFriendships((cur) => cur.filter((x) => x.id !== f.id))
      setItems((cur) => cur.filter((x) => !(x.type === 'friend_request' && x.actor?.id === f.requester_id)))
      const person = f.requester
      toast(accept ? `You and ${person?.display_name || person?.username} are now friends` : 'Request declined')
      refreshUnread()
    } catch {
      toast('Something went wrong, try again')
    } finally {
      setBusyId(null)
    }
  }

  async function cancel(f) {
    setBusyId(f.id)
    try {
      await removeFriendship(f.id)
      setFriendships((cur) => cur.filter((x) => x.id !== f.id))
    } catch {
      toast('Could not cancel that request')
    } finally {
      setBusyId(null)
    }
  }

  const hasUnread = groups.some((g) => g.unread)
  const loading = items === null || friendships === null

  return (
    <>
      <TopBar title="Activity" subtitle="What your friends have been up to" />

      <PushCard status={pushStatus} busy={pushBusy} onEnable={turnOn} onDisable={turnOff} />

      <div className="seg" role="tablist" aria-label="Activity sections">
        <button role="tab" aria-selected={tab === 'updates'} className={tab === 'updates' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTab('updates')}>
          Updates
        </button>
        <button role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTab('requests')}>
          Friend requests
          {incoming.length > 0 && <span className="seg-badge">{incoming.length}</span>}
        </button>
      </div>

      {loading && <Spinner />}

      {!loading && tab === 'requests' && (
        <>
          {incoming.length === 0 && outgoing.length === 0 && (
            <Empty title="No friend requests">
              When someone asks to be your friend, it shows up here. You can add people from the <Link to="/friends">Friends</Link> tab.
            </Empty>
          )}
          {incoming.length > 0 && (
            <ul className="request-list">
              {incoming.map((f) => (
                <li key={f.id} className="request-card">
                  <Link to={`/u/${f.requester_id}`} className="request-who">
                    <Avatar profile={f.requester} size={48} />
                    <span>
                      <b>{f.requester?.display_name || f.requester?.username}</b>
                      <span className="muted small"> @{f.requester?.username}</span>
                      <span className="activity-time">wants to be your friend &middot; {timeAgo(f.created_at)}</span>
                    </span>
                  </Link>
                  <div className="request-actions">
                    <button className="btn primary" disabled={busyId === f.id} onClick={() => answer(f, true)}>
                      Accept
                    </button>
                    <button className="btn" disabled={busyId === f.id} onClick={() => answer(f, false)}>
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {outgoing.length > 0 && (
            <>
              <h3 className="section-label">Waiting for a reply</h3>
              <ul className="request-list">
                {outgoing.map((f) => (
                  <li key={f.id} className="request-card muted-card">
                    <Link to={`/u/${f.addressee_id}`} className="request-who">
                      <Avatar profile={f.addressee} size={40} />
                      <span>
                        <b>{f.addressee?.display_name || f.addressee?.username}</b>
                        <span className="muted small"> @{f.addressee?.username}</span>
                      </span>
                    </Link>
                    <button className="btn small" disabled={busyId === f.id} onClick={() => cancel(f)}>
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {!loading && tab === 'updates' && (
        <>
          {groups.length === 0 && (
            <Empty title="All caught up">
              When friends make or update lists, like or favorite yours, or react to your items, it shows up here.
            </Empty>
          )}

          {groups.length > 0 && (
            <>
              <div className="activity-actions">
                <button className="btn small" disabled={!hasUnread} onClick={markAll}>
                  Mark all read
                </button>
                <span className="spacer" />
                <button className="btn small" onClick={() => setConfirmClear(true)}>
                  Clear all
                </button>
              </div>
              <ul className="activity-list">
                {groups.map((g) => (
                  <li key={g.key} className={g.unread ? 'activity-row new' : 'activity-row'}>
                    <button className="activity-main" onClick={() => open(g)}>
                      <span className="activity-avatar">
                        <Avatar profile={g.actors[0]} size={44} />
                        <span className="activity-glyph" aria-hidden="true">
                          {g.type === 'reacted' ? g.rows[0].emoji : GLYPH[g.type]}
                        </span>
                      </span>
                      <span className="activity-text">
                        <Message g={g} />
                        <span className="activity-time">{timeAgo(g.newest)}</span>
                      </span>
                      {g.unread && <span className="activity-dot" aria-label="Unread" />}
                    </button>
                    <button className="activity-x" onClick={() => remove(g)} aria-label="Remove notification">
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {pushStatus === 'on' && (
            <p className="push-foot muted small">
              Notifications are on for this device.{' '}
              <button className="text-btn" disabled={pushBusy} onClick={turnOff}>
                Turn off
              </button>
            </p>
          )}
        </>
      )}

      <Modal
        open={confirmClear}
        title="Clear all updates?"
        onClose={() => setConfirmClear(false)}
        actions={
          <>
            <button className="btn" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
            <button className="btn danger" onClick={clearAll}>
              Clear all
            </button>
          </>
        }
      >
        <p>This removes every update. Friend requests and your friends&rsquo; lists aren&rsquo;t affected.</p>
      </Modal>
    </>
  )
}