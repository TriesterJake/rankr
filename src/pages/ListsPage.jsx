import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { createList, getListsByOwner, reorderLists } from '../api.js'
import { TopBar, Sheet, Spinner, Empty, SearchBox, LoadFailed } from '../components/ui.jsx'
import { isOffline, useReloadOnReconnect } from '../online.js'
import ListCard from '../components/ListCard.jsx'
import ListForm from '../components/ListForm.jsx'
import ListReorder from '../components/ListReorder.jsx'
import { markNewList } from '../newList.js'
import { useShakeUndo } from '../undo.jsx'
import { captureRows, playRows } from '../flip.js'

export default function ListsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [lists, setLists] = useState(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [reordering, setReordering] = useState(false)
  const [newId, setNewId] = useState(null) // just-made list waiting to be ranked
  const [moveTo, setMoveTo] = useState('')
  const [params, setParams] = useSearchParams()
  const saveQueue = useRef(Promise.resolve())
  const history = useRef([]) // earlier orders while ranking, newest last
  const [undoCount, setUndoCount] = useState(0)

  const [failed, setFailed] = useState(false)
  const load = useCallback(async () => {
    setFailed(false)
    if (isOffline()) return setFailed(true) // don't wait for a request that can't work
    try {
      setLists(await getListsByOwner(user.id))
    } catch {
      setFailed(true) // shown below if nothing loaded yet; otherwise the lists already on screen stay
    }
  }, [user.id])
  useReloadOnReconnect(load)

  useEffect(() => {
    load()
  }, [load])

  // Arriving from a list you just made (/?rank=ID): open "Rank lists" with it highlighted.
  const rankParam = params.get('rank')
  useEffect(() => {
    if (!rankParam || !lists) return
    setParams({}, { replace: true })
    const made = lists.find((l) => l.id === rankParam)
    if (!made || lists.length < 2 || (made.list_items || []).length === 0) return // empty or only list: nothing to rank
    setQuery('')
    setNewId(made.id)
    setMoveTo('')
    setReordering(true)
    setTimeout(() => document.getElementById(`reorder-${made.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150)
  }, [rankParam, lists, setParams])

  // Send one list straight to a rank number (1 = top).
  function moveListTo(id, rank) {
    const from = lists.findIndex((l) => l.id === id)
    const to = Math.min(Math.max(rank, 1), lists.length) - 1
    if (from < 0 || from === to) return
    const next = [...lists]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    handleReorder(next)
    setTimeout(() => document.getElementById(`reorder-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }

  useShakeUndo(reordering && undoCount > 0 ? { label: 'Undo Move', run: undo } : null)

  function finishReordering() {
    setReordering(false)
    setNewId(null)
    history.current = []
    setUndoCount(0)
  }

  function undo() {
    const prev = history.current.pop()
    setUndoCount(history.current.length)
    if (!prev) return
    const before = captureRows(lists.map((l) => l.id), 'reorder-')
    handleReorder(prev, false)
    playRows(before, 'reorder-')
  }

  async function handleCreate(values) {
    try {
      const list = await createList({ ownerId: user.id, position: lists ? lists.length : 0, ...values })
      setCreating(false)
      markNewList(list.id)
      navigate(`/list/${list.id}`)
      return true
    } catch {
      toast('Could not create the list')
      return false
    }
  }

  function handleReorder(next, remember = true) {
    if (remember && lists) {
      history.current.push(lists)
      setUndoCount(history.current.length)
    }
    setLists(next)
    const ids = next.map((l) => l.id)
    // save one change at a time so quick drags can't overwrite each other
    saveQueue.current = saveQueue.current
      .then(() => reorderLists(ids))
      .catch(() => {
        toast('Could not save the new order')
        load()
      })
  }

  const q = query.trim().toLowerCase()
  const visible =
    lists && q
      ? lists
          .map((list) => {
            const titleHit = list.title.toLowerCase().includes(q)
            const itemHits = (list.list_items || [])
              .filter((it) => it.title.toLowerCase().includes(q))
              .sort((a, b) => a.position - b.position)
            return titleHit || itemHits.length ? { list, itemHits } : null
          })
          .filter(Boolean)
      : null

  return (
    <>
      <TopBar
        title={<span className="brand-title">RankR</span>}
        subtitle="My lists"
        right={
          <button className="btn small primary" onClick={() => setCreating(true)}>
            New list
          </button>
        }
        bottom={
          lists &&
          lists.length > 0 && (
            <div className="toolbar">
              {reordering ? (
                <>
                  <p className="muted small toolbar-hint">Drag the handles, or tap a number to send a list to a rank.</p>
                  {undoCount > 0 && (
                    <button className="btn small" onClick={undo}>
                      Undo
                    </button>
                  )}
                  <button className="btn small primary" onClick={finishReordering}>
                    Done
                  </button>
                </>
              ) : (
                <>
                  <SearchBox value={query} onChange={setQuery} placeholder="Search lists and items" />
                  {lists.length > 1 && (
                    <button
                      className="btn small"
                      onClick={() => {
                        setQuery('')
                        setReordering(true)
                      }}
                    >
                      Rank lists
                    </button>
                  )}
                </>
              )}
            </div>
          )
        }
      />

      {lists === null && (failed ? <LoadFailed what="your lists" onRetry={load} /> : <Spinner />)}

      {lists && lists.length === 0 && (
        <Empty title="No lists yet">
          Start with something you have strong opinions about, like your favorite songs or the funniest people you know.
          <button className="btn primary" onClick={() => setCreating(true)}>
            Create your first list
          </button>
        </Empty>
      )}

      {reordering && newId && lists.some((l) => l.id === newId) && (
        <form
          className="card new-rank-card"
          onSubmit={(e) => {
            e.preventDefault()
            const n = parseInt(moveTo, 10)
            if (n >= 1) moveListTo(newId, n)
            setMoveTo('')
          }}
        >
          <p className="small">
            <span className="pill new-pill">New</span> <b>{lists.find((l) => l.id === newId).title}</b> is ready to rank. Drag it into place,
            or send it straight to a rank.
          </p>
          <div className="new-rank-row">
            <span className="muted small">Move to rank</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={lists.length}
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              placeholder={`1-${lists.length}`}
              aria-label="Rank number"
            />
            <button className="btn small primary" disabled={!moveTo}>
              Move
            </button>
          </div>
        </form>
      )}

      {lists && lists.length > 0 && reordering && (
        <ListReorder lists={lists} onChange={handleReorder} highlightId={newId} onMoveTo={moveListTo} />
      )}

      {lists && lists.length > 0 && !reordering && visible && visible.length === 0 && (
        <Empty title="No matches">Nothing in your lists matches &ldquo;{query.trim()}&rdquo;.</Empty>
      )}

      {lists && lists.length > 0 && !reordering && (
        <div className="stack">
          {(visible || lists.map((list) => ({ list, itemHits: [] }))).map(({ list, itemHits }) => (
            <ListCard
              key={list.id}
              list={list}
              rank={lists.indexOf(list) + 1}
              footer={
                itemHits.length > 0 && (
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
                )
              }
            />
          ))}
        </div>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="New list">
        <ListForm showTemplates submitLabel="Create list" onSubmit={handleCreate} />
      </Sheet>
    </>
  )
}