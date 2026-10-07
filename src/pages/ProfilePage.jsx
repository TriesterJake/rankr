import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { getFriendships, getListsByOwner, getProfile, removeFriendship } from '../api.js'
import { sameTopic } from '../compare.js'
import { Avatar, Empty, SearchBox, Spinner, TopBar } from '../components/ui.jsx'
import ListCard from '../components/ListCard.jsx'

export default function ProfilePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(undefined)
  const [lists, setLists] = useState([])
  const [myLists, setMyLists] = useState([])
  const [friendship, setFriendship] = useState(null)
  const [ready, setReady] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      const [p, theirs, mine, friendships] = await Promise.all([
        getProfile(id),
        getListsByOwner(id),
        getListsByOwner(user.id),
        getFriendships(user.id),
      ])
      setProfile(p)
      setLists(theirs)
      setMyLists(mine)
      setFriendship(friendships.find((f) => f.requester_id === id || f.addressee_id === id) ?? null)
    } catch {
      toast('Could not load this profile')
      setProfile(null)
    } finally {
      setReady(true)
    }
  }, [id, user.id, toast])

  useEffect(() => {
    load()
  }, [load])

  async function unfriend() {
    if (!friendship) return
    if (!window.confirm(`Remove @${profile.username} from your friends?`)) return
    try {
      await removeFriendship(friendship.id)
      navigate('/friends', { replace: true })
    } catch {
      toast('Could not remove friend')
    }
  }

  if (!ready) {
    return (
      <>
        <TopBar title="" back />
        <Spinner />
      </>
    )
  }

  if (!profile) {
    return (
      <>
        <TopBar title="Profile" back />
        <Empty title="Person not found" />
      </>
    )
  }

  const isFriend = friendship?.status === 'accepted'
  const q = query.trim().toLowerCase()
  const visible = q
    ? lists
        .map((list) => {
          const titleHit = list.title.toLowerCase().includes(q)
          const itemHits = (list.list_items || []).filter((it) => it.title.toLowerCase().includes(q)).sort((a, b) => a.position - b.position)
          return titleHit || itemHits.length ? { list, itemHits } : null
        })
        .filter(Boolean)
    : null
  const myMatch = (list) => myLists.find((m) => sameTopic(m.title, list.title))

  return (
    <>
      <TopBar title={profile.display_name || profile.username} subtitle={`@${profile.username}`} back />

      <div className="profile-head">
        <Avatar profile={profile} size={64} zoom />
        <div>
          <b>{profile.display_name || profile.username}</b>
          <p className="muted small">
            {isFriend ? `${lists.length} shared ${lists.length === 1 ? 'list' : 'lists'}` : 'Not friends yet'}
          </p>
        </div>
      </div>

      {lists.length === 0 ? (
        <Empty title="No lists to show">
          {isFriend ? `@${profile.username} hasn't shared any lists yet.` : 'Once you are friends you can see the lists they share.'}
        </Empty>
      ) : (
        <>
          {lists.length > 0 && (
            <div className="toolbar">
              <SearchBox value={query} onChange={setQuery} placeholder={`Search @${profile.username}'s lists and items`} />
            </div>
          )}
          {visible && visible.length === 0 && <Empty title="No matches">Nothing here matches &ldquo;{query.trim()}&rdquo;.</Empty>}
          <div className="stack">
            {(visible || lists.map((list) => ({ list, itemHits: [] }))).map(({ list, itemHits }) => {
              const match = myMatch(list)
              return (
                <ListCard
                  key={list.id}
                  list={list}
                  rank={lists.indexOf(list) + 1}
                  likeUserId={isFriend ? user.id : undefined}
                  footer={
                    (itemHits.length > 0 || match) && (
                      <>
                        {itemHits.length > 0 && (
                          <div className="card-match">
                            <span className="muted">Found in this list:</span>{' '}
                            {itemHits.slice(0, 3).map((it, i) => (
                              <span key={it.id}>
                                {i > 0 && ', '}
                                <b>#{it.position + 1}</b> {it.title}
                              </span>
                            ))}
                            {itemHits.length > 3 && <span className="muted"> +{itemHits.length - 3} more</span>}
                          </div>
                        )}
                        {match && (
                          <Link className="card-footer-link" to={`/compare/${match.id}/${list.id}`}>
                            <span>You both have this list</span>
                            <b>Compare &rarr;</b>
                          </Link>
                        )}
                      </>
                    )
                  }
                />
              )
            })}
          </div>
        </>
      )}

      {isFriend && (
        <button className="btn danger block spaced" onClick={unfriend}>
          Remove friend
        </button>
      )}
    </>
  )
}