import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { createList, getListsByOwner, reorderLists } from '../api.js'
import { TopBar, Sheet, Spinner, Empty, SearchBox } from '../components/ui.jsx'
import ListCard from '../components/ListCard.jsx'
import ListForm from '../components/ListForm.jsx'
import ListReorder from '../components/ListReorder.jsx'

export default function ListsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [lists, setLists] = useState(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [reordering, setReordering] = useState(false)
  const saveQueue = useRef(Promise.resolve())

  const load = useCallback(async () => {
    try {
      setLists(await getListsByOwner(user.id))
    } catch {
      toast('Could not load your lists')
      setLists([])
    }
  }, [user.id, toast])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreate(values) {
    try {
      const list = await createList({ ownerId: user.id, position: lists ? lists.length : 0, ...values })
      setCreating(false)
      navigate(`/list/${list.id}`)
      return true
    } catch {
      toast('Could not create the list')
      return false
    }
  }

  function handleReorder(next) {
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
      />

      {lists === null && <Spinner />}

      {lists && lists.length === 0 && (
        <Empty title="No lists yet">
          Start with something you have strong opinions about, like your favorite songs or the funniest people you know.
          <button className="btn primary" onClick={() => setCreating(true)}>
            Create your first list
          </button>
        </Empty>
      )}

      {lists && lists.length > 0 && (
        <div className="toolbar">
          {reordering ? (
            <>
              <p className="muted small toolbar-hint">Drag the handles to rank your lists.</p>
              <button className="btn small primary" onClick={() => setReordering(false)}>
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
      )}

      {lists && lists.length > 0 && reordering && <ListReorder lists={lists} onChange={handleReorder} />}

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