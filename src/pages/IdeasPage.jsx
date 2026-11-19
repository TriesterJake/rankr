import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { createList, getHiddenIdeas, getListIdeas, getListsByOwner, hideIdea, localDay } from '../api.js'
import { TEMPLATES, randomColor } from '../templates.js'
import { markNewList } from '../newList.js'
import { Avatar, Empty, LoadFailed, Spinner, TopBar } from '../components/ui.jsx'
import { isOffline, useReloadOnReconnect } from '../online.js'
import { ActionSheet, MoreButton, ReportSheet } from '../components/Safety.jsx'

const IDEA_COUNT = 10 // keep in step with p_limit in getListIdeas (api.js)

// Same rule as idea_key() in the database: "Favorite Songs!" = "favorite songs".
const ideaKey = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() || t.toLowerCase().trim()

const nameOf = (p) => p.display_name || p.username

// "Jake", "Jake and Bob", "Jake, Bob and Michael"
function joinNames(parts) {
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && (i === parts.length - 1 ? ' and ' : ', ')}
      {part}
    </Fragment>
  ))
}

function WhoHasIt({ idea }) {
  if (idea.starter) return <span className="muted small">A starter idea</span>
  const parts = idea.friends.map((f) => (
    <Link key={f.id} to={`/list/${f.list_id}`} className="idea-friend">
      {nameOf(f)}
    </Link>
  ))
  if (idea.others > 0) {
    parts.push(idea.others === 1 ? 'someone you don’t know' : `${idea.others} people you don’t know`)
  }
  return <span className="muted small idea-who">Made by {joinNames(parts)}</span>
}

function IdeaFaces({ friends }) {
  const shown = friends.slice(0, 3)
  return (
    <div className="idea-faces" aria-hidden="true">
      {shown.length === 0 ? (
        <div className="avatar idea-unknown">?</div>
      ) : (
        shown.map((f) => <Avatar key={f.id} profile={f} size={shown.length > 1 ? 30 : 40} />)
      )}
    </div>
  )
}

export default function IdeasPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [ideas, setIdeas] = useState(null)
  const [making, setMaking] = useState(null) // title being created
  const [menuFor, setMenuFor] = useState(null) // idea whose "..." is open
  const [reporting, setReporting] = useState(null)
  const loadedDay = useRef('')

  const [failed, setFailed] = useState(false)
  const load = useCallback(async () => {
    setFailed(false)
    if (isOffline()) return setFailed(true)
    try {
      const [rows, mine, hidden] = await Promise.all([getListIdeas(), getListsByOwner(user.id), getHiddenIdeas().catch(() => [])])
      loadedDay.current = localDay()
      // fill a quiet day with starter ideas you don't have yet (and haven't hidden)
      const taken = new Set([...mine.map((l) => ideaKey(l.title)), ...rows.map((r) => ideaKey(r.title)), ...hidden])
      const starters = TEMPLATES.filter((t) => !taken.has(ideaKey(t)))
        .slice(0, Math.max(0, IDEA_COUNT - rows.length))
        .map((t) => ({ title: t, friends: [], others: 0, starter: true }))
      setIdeas([...rows, ...starters])
    } catch {
      setFailed(true)
    }
  }, [user.id])
  useReloadOnReconnect(load)

  useEffect(() => {
    load()
  }, [load])

  // an app left open overnight picks up the new day's ideas when you come back to it
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible' && loadedDay.current && loadedDay.current !== localDay()) load()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [load])

  const dropIdea = (title) => setIdeas((cur) => cur.filter((i) => i.title !== title))

  async function hide(title) {
    dropIdea(title)
    try {
      await hideIdea(user.id, ideaKey(title))
      toast('Hidden. You won’t see this idea again.')
    } catch {
      toast('Could not hide it')
    }
  }

  // Make an empty list with this title; you add your own items.
  async function makeIt(title) {
    if (making) return
    setMaking(title)
    try {
      const created = await createList({ ownerId: user.id, title, icon: '', color: randomColor(), visibility: 'friends' })
      toast('Added to your lists')
      markNewList(created.id)
      navigate(`/list/${created.id}`)
    } catch {
      toast('Could not make the list')
      setMaking(null)
    }
  }

  return (
    <>
      <TopBar title="Ideas" subtitle="New list ideas every day" />

      {ideas === null && (failed ? <LoadFailed what="ideas" onRetry={load} /> : <Spinner />)}

      {ideas && ideas.length === 0 && (
        <Empty title="You've made them all">There are no new list ideas right now. Check back tomorrow.</Empty>
      )}

      {ideas && ideas.length > 0 && (
        <section className="section">
          <p className="muted small pad">
            Tap <b>Make it</b> to start your own list with that title. Tap a friend&rsquo;s name to see their list and copy the whole thing.
          </p>
          {ideas.map((idea) => (
            <div key={idea.title} className="person-row idea-row">
              <IdeaFaces friends={idea.friends} />
              <div className="person-text idea-text">
                <b>
                  {idea.title}
                  {idea.popular && (
                    <span className="pill idea-popular" title={`${idea.owners} people made this list`}>
                      Popular
                    </span>
                  )}
                </b>
                <WhoHasIt idea={idea} />
              </div>
              <button className="btn small primary" disabled={Boolean(making)} onClick={() => makeIt(idea.title)}>
                {making === idea.title ? 'Making...' : 'Make it'}
              </button>
              <MoreButton small label={`More options for ${idea.title}`} onClick={() => setMenuFor(idea)} />
            </div>
          ))}
        </section>
      )}

      <ActionSheet
        open={Boolean(menuFor)}
        onClose={() => setMenuFor(null)}
        title={menuFor?.title}
        actions={
          menuFor
            ? [
                { label: 'Hide this idea', onClick: () => hide(menuFor.title) },
                !menuFor.starter && {
                  label: 'Report this idea',
                  onClick: () => setReporting({ type: 'idea', title: menuFor.title, name: 'this idea' }),
                },
              ]
            : []
        }
      />
      <ReportSheet
        target={reporting}
        onClose={() => setReporting(null)}
        onDone={() => dropIdea(reporting.title)}
      />
    </>
  )
}
