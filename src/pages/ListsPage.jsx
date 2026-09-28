import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { createList, getListsByOwner } from '../api.js'
import { TopBar, Sheet, Spinner, Empty } from '../components/ui.jsx'
import ListCard from '../components/ListCard.jsx'
import ListForm from '../components/ListForm.jsx'

export default function ListsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [lists, setLists] = useState(null)
  const [creating, setCreating] = useState(false)

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
      const list = await createList({ ownerId: user.id, ...values })
      setCreating(false)
      navigate(`/list/${list.id}`)
    } catch {
      toast('Could not create the list')
    }
  }

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
        <div className="stack">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </div>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="New list">
        <ListForm showTemplates submitLabel="Create list" onSubmit={handleCreate} />
      </Sheet>
    </>
  )
}