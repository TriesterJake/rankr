import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { acceptFriendRequest, getFriendships, removeFriendship, searchProfiles, sendFriendRequest } from '../api.js'
import { Avatar, Empty, Spinner, TopBar } from '../components/ui.jsx'

function PersonRow({ profile, to, action }) {
  const inner = (
    <>
      <Avatar profile={profile} />
      <div className="person-text">
        <b>{profile.display_name || profile.username}</b>
        <span className="muted small">@{profile.username}</span>
      </div>
    </>
  )
  return (
    <div className="person-row">
      {to ? (
        <Link to={to} className="person-link">
          {inner}
        </Link>
      ) : (
        <div className="person-link">{inner}</div>
      )}
      {action}
    </div>
  )
}

export default function FriendsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [friendships, setFriendships] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const load = useCallback(async () => {
    try {
      setFriendships(await getFriendships(user.id))
    } catch {
      toast('Could not load friends')
      setFriendships([])
    }
  }, [user.id, toast])

  useEffect(() => {
    load()
  }, [load])

  // search as you type (after a short pause)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const found = await searchProfiles(q, user.id)
        if (!cancelled) setResults(found)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, user.id])

  const otherOf = (f) => (f.requester_id === user.id ? f.addressee : f.requester)
  const all = friendships ?? []
  const friends = all.filter((f) => f.status === 'accepted')
  const incoming = all.filter((f) => f.status === 'pending' && f.addressee_id === user.id)
  const outgoing = all.filter((f) => f.status === 'pending' && f.requester_id === user.id)
  const relationWith = (profileId) => all.find((f) => f.requester_id === profileId || f.addressee_id === profileId)

  async function run(action, failMessage, okMessage) {
    try {
      await action()
      if (okMessage) toast(okMessage)
      await load()
    } catch (err) {
      toast(err?.code === '23505' ? 'Already requested or friends' : failMessage)
    }
  }

  function resultAction(profile) {
    const rel = relationWith(profile.id)
    if (!rel) {
      return (
        <button className="btn small primary" onClick={() => run(() => sendFriendRequest(user.id, profile.id), 'Could not send request', 'Request sent')}>
          Add
        </button>
      )
    }
    if (rel.status === 'accepted') return <span className="pill">Friends</span>
    if (rel.addressee_id === user.id) {
      return (
        <button className="btn small primary" onClick={() => run(() => acceptFriendRequest(rel.id), 'Could not accept', 'You are now friends')}>
          Accept
        </button>
      )
    }
    return <span className="pill">Requested</span>
  }

  return (
    <>
      <TopBar title="Friends" />

      <div className="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find people by username"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          aria-label="Find people by username"
        />
      </div>

      {query.trim().length >= 2 && (
        <section className="section">
          <h2 className="section-title">Search results</h2>
          {searching && <p className="muted small pad">Searching...</p>}
          {!searching && results.length === 0 && <p className="muted small pad">No one found with that name.</p>}
          {results.map((p) => (
            <PersonRow key={p.id} profile={p} action={resultAction(p)} />
          ))}
        </section>
      )}

      {friendships === null && <Spinner />}

      {incoming.length > 0 && (
        <section className="section">
          <h2 className="section-title">Requests for you</h2>
          {incoming.map((f) => (
            <PersonRow
              key={f.id}
              profile={otherOf(f)}
              action={
                <div className="btn-row">
                  <button className="btn small" onClick={() => run(() => removeFriendship(f.id), 'Could not decline')}>
                    Decline
                  </button>
                  <button className="btn small primary" onClick={() => run(() => acceptFriendRequest(f.id), 'Could not accept', 'You are now friends')}>
                    Accept
                  </button>
                </div>
              }
            />
          ))}
        </section>
      )}

      {friendships && (
        <section className="section">
          <h2 className="section-title">Your friends{friends.length > 0 ? ` (${friends.length})` : ''}</h2>
          {friends.length === 0 ? (
            <Empty title="No friends yet">Search for a username above to send your first request.</Empty>
          ) : (
            friends.map((f) => {
              const p = otherOf(f)
              return <PersonRow key={f.id} profile={p} to={`/u/${p.id}`} />
            })
          )}
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="section">
          <h2 className="section-title">Sent requests</h2>
          {outgoing.map((f) => (
            <PersonRow
              key={f.id}
              profile={otherOf(f)}
              action={
                <button className="btn small" onClick={() => run(() => removeFriendship(f.id), 'Could not cancel', 'Request cancelled')}>
                  Cancel
                </button>
              }
            />
          ))}
        </section>
      )}
    </>
  )
}
