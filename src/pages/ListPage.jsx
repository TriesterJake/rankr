import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { addItems, copyItems, createList, deleteItem, deleteList, getItems, getFavoriters, getLikers, getLikes, getList, getListsByOwner, getMyFavorite, getReactions, getReactors, reactToItem, reorderItems, updateItem, updateList } from '../api.js'
import { norm, findSimilarItem } from '../compare.js'
import { imageUrl, removeImages, resizeImage, uploadItemImage } from '../images.js'
import { Avatar, Empty, Modal, SearchBox, Sheet, Spinner, TopBar } from '../components/ui.jsx'
import ListForm from '../components/ListForm.jsx'
import LikeButton, { Heart } from '../components/LikeButton.jsx'
import FavoriteButton, { Star } from '../components/FavoriteButton.jsx'
import ReactionBar from '../components/ReactionBar.jsx'
import { inkOn } from '../templates.js'

const normalize = (arr) => arr.map((item, i) => ({ ...item, position: i }))

// "1. Song A" / "- Song B" / plain lines -> clean titles
const parseLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+\s*[.)\-:]|[-*\u2022])\s*/, '').trim())
    .filter(Boolean)

function EditPanel({ item, rank, total, photoBusy, onPhoto, onRemovePhoto, onSave, onDelete, onCancel }) {
  const [title, setTitle] = useState(item.title)
  const [note, setNote] = useState(item.note || '')
  const [moveTo, setMoveTo] = useState(String(rank))

  function submit(e) {
    e.preventDefault()
    onSave(item.id, { title: title.trim() || item.title, note: note.trim() }, parseInt(moveTo, 10))
  }

  return (
    <form className="edit-panel" onSubmit={submit}>
      <label className="field">
        <span className="label">Name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoComplete="off" />
      </label>
      <label className="field">
        <span className="label">Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it's here" maxLength={200} autoComplete="off" />
      </label>
      <div className="field">
        <span className="label">Photo (optional)</span>
        <div className="photo-row">
          {item.image_path && <img className="photo-thumb" src={imageUrl(item.image_path)} alt="" />}
          <label className={photoBusy ? 'btn small disabled' : 'btn small'}>
            {photoBusy ? 'Uploading...' : item.image_path ? 'Change photo' : 'Add photo'}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={photoBusy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onPhoto(item.id, file)
              }}
            />
          </label>
          {item.image_path && !photoBusy && (
            <button type="button" className="btn small" onClick={() => onRemovePhoto(item.id)}>
              Remove
            </button>
          )}
        </div>
      </div>
      <label className="field">
        <span className="label">Rank (1-{total})</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={total}
          value={moveTo}
          onChange={(e) => setMoveTo(e.target.value)}
        />
      </label>
      <div className="edit-actions">
        <button type="button" className="btn danger" onClick={() => onDelete(item.id)}>
          Delete
        </button>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary">Save</button>
      </div>
    </form>
  )
}

function SortableRow({ item, rank, total, editing, flash, filtering, photoBusy, reactions, userId, onReact, onWho, onToggle, onSave, onDelete, onPhoto, onRemovePhoto, onView }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: filtering })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined }
  return (
    <li
      id={`item-${item.id}`}
      ref={setNodeRef}
      style={style}
      className={`row${isDragging ? ' dragging' : ''}${editing ? ' editing' : ''}${flash ? ' flash' : ''}`}
    >
      <div className="row-main">
        <button className={`rank rank-${rank <= 3 ? rank : 'n'}`} onClick={onToggle} aria-label={`Rank ${rank}, edit ${item.title}`}>
          {rank}
        </button>
        {item.image_path && (
          <button className="row-thumb" onClick={() => onView(item)} aria-label={`View photo of ${item.title}`}>
            <img src={imageUrl(item.image_path)} alt="" loading="lazy" />
          </button>
        )}
        <button className="row-text" onClick={onToggle}>
          <span className="row-title">{item.title}</span>
          {item.note && <span className="row-note">{item.note}</span>}
        </button>
        {!filtering && (
        <button className="drag-handle" {...attributes} {...listeners} aria-label={`Drag to reorder ${item.title}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.7" />
            <circle cx="15" cy="6" r="1.7" />
            <circle cx="9" cy="12" r="1.7" />
            <circle cx="15" cy="12" r="1.7" />
            <circle cx="9" cy="18" r="1.7" />
            <circle cx="15" cy="18" r="1.7" />
          </svg>
        </button>
        )}
      </div>
      <ReactionBar reactions={reactions} userId={userId} isOwner onReact={onReact} onWho={onWho} />
      {editing && (
        <EditPanel
          item={item}
          rank={rank}
          total={total}
          photoBusy={photoBusy}
          onPhoto={onPhoto}
          onRemovePhoto={onRemovePhoto}
          onSave={onSave}
          onDelete={onDelete}
          onCancel={onToggle}
        />
      )}
    </li>
  )
}

export default function ListPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [list, setList] = useState(undefined) // undefined = loading, null = not found
  const [items, setItems] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [myLists, setMyLists] = useState(null)
  const [draft, setDraft] = useState('')
  const [rankDraft, setRankDraft] = useState('')
  const [rankError, setRankError] = useState('')
  const [flashIds, setFlashIds] = useState([])
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(null) // duplicate warning waiting for an answer
  const [photoBusyId, setPhotoBusyId] = useState(null)
  const [likes, setLikes] = useState(null) // user ids who liked this list; null until loaded
  const [likersOpen, setLikersOpen] = useState(false)
  const [likers, setLikers] = useState(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [viewing, setViewing] = useState(null) // item whose photo is enlarged
  const [favs, setFavs] = useState(null) // user ids who made this their favorite
  const [myFav, setMyFav] = useState(null) // my current favorite among this owner's lists: { id, title } | null
  const [reactions, setReactions] = useState([]) // { item_id, user_id, emoji }
  const [whoItem, setWhoItem] = useState(null) // item whose reactions are open
  const [whoRows, setWhoRows] = useState(null)
  const [likersMode, setLikersMode] = useState('likes')
  const [searchParams] = useSearchParams()
  const focusItem = searchParams.get('item')
  const focused = useRef(null)

  const itemsRef = useRef([])
  const queue = useRef(Promise.resolve())
  const inputRef = useRef(null)
  const endRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const commit = useCallback((next) => {
    const fixed = normalize(next)
    itemsRef.current = fixed
    setItems(fixed)
  }, [])

  // run server writes one at a time so quick edits can't trip over each other
  const enqueue = (fn) => {
    queue.current = queue.current.then(fn).catch(() => {})
    return queue.current
  }

  const load = useCallback(async () => {
    try {
      const found = await getList(id)
      setList(found)
      if (found) {
        commit(await getItems(id))
        getLikes(id)
          .then((rows) => setLikes(rows.map((r) => r.user_id)))
          .catch(() => setLikes([]))
        getFavoriters(id)
          .then((rows) => setFavs(rows.map((r) => r.user_id)))
          .catch(() => setFavs([]))
        getReactions(id)
          .then(setReactions)
          .catch(() => setReactions([]))
        if (found.owner_id !== user.id) {
          getMyFavorite(found.owner_id, user.id)
            .then((row) => setMyFav(row?.list ? { id: row.list.id, title: row.list.title } : null))
            .catch(() => setMyFav(null))
        }
      }
    } catch {
      toast('Could not load this list')
      setList(null)
    }
  }, [id, commit, toast, user.id])

  useEffect(() => {
    focused.current = null
    setList(undefined)
    setEditingId(null)
    load()
  }, [load])

  const isOwner = Boolean(list && list.owner_id === user.id)

  // coming from a "reacted" notification: scroll to that item and flash it once
  useEffect(() => {
    if (!focusItem || focused.current === focusItem || !items.some((i) => i.id === focusItem)) return
    focused.current = focusItem
    setFlashIds([focusItem])
    const t = setTimeout(() => setFlashIds([]), 2000)
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`item-${focusItem}`)?.scrollIntoView({ block: 'center' })))
    return () => clearTimeout(t)
  }, [focusItem, items])

  // ---------- editing actions (owner only) ----------

  function persistOrder(next) {
    const ids = next.map((i) => i.id)
    commit(next)
    enqueue(async () => {
      try {
        await reorderItems(id, ids)
      } catch {
        toast('Could not save the new order')
        load()
      }
    })
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const current = itemsRef.current
    const from = current.findIndex((i) => i.id === active.id)
    const to = current.findIndex((i) => i.id === over.id)
    if (from < 0 || to < 0) return
    persistOrder(arrayMove(current, from, to))
  }

  function saveItem(itemId, patch, targetRank) {
    const current = itemsRef.current
    const existing = current.find((i) => i.id === itemId)
    if (!existing) return
    setEditingId(null)

    let next = current
    if (patch.title !== existing.title || patch.note !== (existing.note || '')) {
      next = current.map((i) => (i.id === itemId ? { ...i, ...patch } : i))
      commit(next)
      enqueue(async () => {
        try {
          await updateItem(itemId, patch)
        } catch {
          toast('Could not save that change')
          load()
        }
      })
    }

    const from = next.findIndex((i) => i.id === itemId)
    const wanted = Number.isFinite(targetRank) ? targetRank : from + 1
    const to = Math.min(Math.max(wanted - 1, 0), next.length - 1)
    if (to !== from) persistOrder(arrayMove(next, from, to))
  }

  function removeItem(itemId) {
    setEditingId(null)
    const gone = itemsRef.current.find((i) => i.id === itemId)
    const remaining = itemsRef.current.filter((i) => i.id !== itemId)
    commit(remaining)
    const ids = remaining.map((i) => i.id)
    enqueue(async () => {
      try {
        await deleteItem(itemId)
        if (gone?.image_path) removeImages([gone.image_path])
        await reorderItems(id, ids)
      } catch {
        toast('Could not delete that item')
        load()
      }
    })
  }

  async function setPhoto(itemId, file) {
    setPhotoBusyId(itemId)
    try {
      const blob = await resizeImage(file)
      const path = await uploadItemImage(user.id, blob)
      const old = itemsRef.current.find((i) => i.id === itemId)?.image_path
      await updateItem(itemId, { image_path: path })
      commit(itemsRef.current.map((i) => (i.id === itemId ? { ...i, image_path: path } : i)))
      if (old) removeImages([old])
    } catch {
      toast('Could not add that photo')
    } finally {
      setPhotoBusyId(null)
    }
  }

  function removePhoto(itemId) {
    const old = itemsRef.current.find((i) => i.id === itemId)?.image_path
    if (!old) return
    commit(itemsRef.current.map((i) => (i.id === itemId ? { ...i, image_path: null } : i)))
    enqueue(async () => {
      try {
        await updateItem(itemId, { image_path: null })
        removeImages([old])
      } catch {
        toast('Could not remove the photo')
        load()
      }
    })
  }

  // atRank: optional 1-based rank the new item(s) should land at; anything else adds to the end
  function addTitles(titles, atRank = null) {
    const clean = titles.map((t) => t.trim().slice(0, 200)).filter(Boolean)
    if (clean.length === 0) return
    enqueue(async () => {
      try {
        const created = await addItems(id, clean, itemsRef.current.length)
        const latest = itemsRef.current
        const inMiddle = Number.isFinite(atRank) && atRank >= 1 && atRank <= latest.length
        const at = inMiddle ? atRank - 1 : latest.length
        const next = [...latest.slice(0, at), ...created, ...latest.slice(at)]
        commit(next)

        if (inMiddle) {
          // new rows were saved at the end; now save the order with them in the right spot
          await reorderItems(id, next.map((i) => i.id))
        }

        const newIds = created.map((i) => i.id)
        setFlashIds(newIds)
        setTimeout(() => setFlashIds((cur) => (cur === newIds ? [] : cur)), 1600)

        if (clean.length > 1) toast(inMiddle ? `Added ${clean.length} items starting at #${at + 1}` : `Added ${clean.length} items`)
        else if (inMiddle) toast(`Added at #${at + 1}`)

        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (inMiddle) document.getElementById(`item-${newIds[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            else endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
          }),
        )
      } catch {
        toast('Could not add that')
        load()
      }
    })
  }

  // Returns { ok, rank }. Empty means "add to the end"; otherwise it must be a whole number from 1 to (items + 1).
  function readRank() {
    const raw = rankDraft.trim()
    if (raw === '') return { ok: true, rank: null }
    const max = itemsRef.current.length + 1
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) {
      setRankError(`Invalid list number. Use 1 to ${max}, or leave it empty to add at the end.`)
      return { ok: false, rank: null }
    }
    return { ok: true, rank: Number(raw) }
  }

  // Look for items that already exist (same words, different capitals/punctuation, or a small typo).
  function findDuplicates(titles) {
    const out = []
    for (const t of titles) {
      const hit = findSimilarItem(t, itemsRef.current)
      if (hit) out.push({ title: t, existingTitle: hit.item.title, existingRank: hit.index + 1 })
    }
    return out
  }

  function finishAdd(titles, rank, fromDraft) {
    addTitles(titles, rank)
    if (fromDraft) setDraft('')
    setRankDraft('')
    setRankError('')
    // put the keyboard away
    inputRef.current?.blur()
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  function tryAdd(titles, rank, fromDraft) {
    const clean = titles.map((t) => t.trim()).filter(Boolean)
    const dupes = findDuplicates(clean)
    if (dupes.length) {
      setPending({ titles: clean, rank, fromDraft, dupes })
      return
    }
    finishAdd(clean, rank, fromDraft)
  }

  function handleAdd(e) {
    e.preventDefault()
    if (!draft.trim()) return
    const r = readRank()
    if (!r.ok) return
    tryAdd([draft], r.rank, true)
  }

  function handlePaste(e) {
    const text = e.clipboardData.getData('text')
    if (/\r?\n/.test(text.trim())) {
      e.preventDefault()
      const r = readRank()
      if (!r.ok) return
      tryAdd(parseLines(text), r.rank, false)
    }
  }

  function answerDuplicate(mode) {
    const p = pending
    setPending(null)
    if (!p || mode === 'cancel') return
    if (mode === 'skip') {
      const skip = new Set(p.dupes.map((d) => d.title))
      const rest = p.titles.filter((t) => !skip.has(t))
      if (rest.length === 0) {
        toast('Nothing new to add')
        return
      }
      finishAdd(rest, p.rank, p.fromDraft)
      return
    }
    finishAdd(p.titles, p.rank, p.fromDraft)
  }

  async function handleSettings(values) {
    try {
      const updated = await updateList(id, values)
      setList((prev) => ({ ...prev, ...updated }))
      setSettingsOpen(false)
      return true
    } catch {
      toast('Could not save settings')
      return false
    }
  }

  async function handleDeleteList() {
    if (!window.confirm(`Delete "${list.title}" and everything in it?`)) return
    const paths = [...itemsRef.current.map((i) => i.image_path), list.icon_path].filter(Boolean)
    try {
      await deleteList(id)
      removeImages(paths)
      navigate('/', { replace: true })
    } catch {
      toast('Could not delete the list')
    }
  }

  async function copyAsText() {
    const text = `${list.title}\n${items.map((it, i) => `${i + 1}. ${it.title}`).join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied to your clipboard')
    } catch {
      toast('Could not copy')
    }
  }

  // Make my own list out of this one (same title, color and items; photos are not copied).
  async function copyToMine() {
    if (copying) return
    setCopying(true)
    try {
      const mine = await getListsByOwner(user.id)
      const created = await createList({
        ownerId: user.id,
        title: list.title,
        icon: list.icon,
        color: list.color,
        visibility: 'friends',
        position: mine.length,
      })
      try {
        await copyItems(created.id, itemsRef.current)
      } catch (err) {
        await deleteList(created.id).catch(() => {})
        throw err
      }
      setCopyOpen(false)
      toast('Copied to your lists')
      navigate(`/list/${created.id}`)
    } catch {
      toast('Could not copy this list')
    } finally {
      setCopying(false)
    }
  }

  async function openLikers(mode = 'likes') {
    setLikersMode(mode)
    setLikersOpen(true)
    setLikers(null)
    try {
      setLikers(await (mode === 'favorites' ? getFavoriters(id) : getLikers(id)))
    } catch {
      setLikers([])
    }
  }

  async function react(itemId, emoji) {
    const before = reactions
    const had = reactions.find((r) => r.item_id === itemId && r.user_id === user.id)
    const without = reactions.filter((r) => !(r.item_id === itemId && r.user_id === user.id))
    setReactions(had?.emoji === emoji ? without : [...without, { item_id: itemId, user_id: user.id, emoji }])
    try {
      await reactToItem(itemId, emoji)
    } catch {
      setReactions(before)
      toast('Could not save your reaction')
    }
  }

  async function openWho(item) {
    setWhoItem(item)
    setWhoRows(null)
    try {
      setWhoRows(await getReactors(item.id))
    } catch {
      setWhoRows([])
    }
  }

  const reactionsFor = (itemId) => reactions.filter((r) => r.item_id === itemId)

  function onFavoriteChange(on) {
    setFavs((cur) => (cur ? (on ? [...cur.filter((u) => u !== user.id), user.id] : cur.filter((u) => u !== user.id)) : cur))
    setMyFav(on ? { id: list.id, title: list.title } : null)
  }

  async function openCompare() {
    setCompareOpen(true)
    if (myLists === null) {
      try {
        setMyLists(await getListsByOwner(user.id))
      } catch {
        setMyLists([])
      }
    }
  }

  // ---------- render ----------

  if (list === undefined) {
    return (
      <>
        <TopBar title="" back />
        <Spinner />
      </>
    )
  }

  if (list === null) {
    return (
      <>
        <TopBar title="List" back />
        <Empty title="List not found">It may be private, deleted, or shared with a different account.</Empty>
      </>
    )
  }

  const q = query.trim().toLowerCase()
  const filtering = q.length > 0
  const shown = filtering
    ? items.map((item, i) => ({ item, rank: i + 1 })).filter(({ item }) => `${item.title} ${item.note || ''}`.toLowerCase().includes(q))
    : items.map((item, i) => ({ item, rank: i + 1 }))

  const matchesTitle = (mine) => norm(mine.title) === norm(list.title)
  const sortedMine = myLists ? [...myLists].sort((a, b) => Number(matchesTitle(b)) - Number(matchesTitle(a))) : []

  return (
    <div className="list-page" style={{ '--list-color': list.color, '--list-ink': inkOn(list.color) }}>
      <TopBar
        back
        title={list.title}
        subtitle={isOwner ? `${items.length} ${items.length === 1 ? 'item' : 'items'}` : `by @${list.owner?.username ?? 'friend'}`}
        right={
          isOwner ? (
            <>
              <button className="icon-btn" onClick={copyAsText} aria-label="Copy list as text">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V6a2 2 0 012-2h9" />
                </svg>
              </button>
              <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="List settings">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
            </>
          ) : null
        }
      />

      {isOwner && ((likes !== null && likes.length > 0) || (favs !== null && favs.length > 0)) && (
        <div className="like-row">
          {likes !== null && likes.length > 0 && (
            <button className="like-btn on" onClick={() => openLikers('likes')}>
              <Heart filled />
              <span>
                {likes.length} {likes.length === 1 ? 'like' : 'likes'}
              </span>
            </button>
          )}
          {favs !== null && favs.length > 0 && (
            <button className="like-btn fav on" onClick={() => openLikers('favorites')}>
              <Star filled />
              <span>
                {favs.length} {favs.length === 1 ? 'favorite' : 'favorites'}
              </span>
            </button>
          )}
        </div>
      )}

      {!isOwner && (
        <div className="like-row">
          {likes !== null && (
            <LikeButton key={list.id} listId={list.id} userId={user.id} initialLiked={likes.includes(user.id)} initialCount={likes.length} />
          )}
          {favs !== null && (
            <FavoriteButton
              key={`fav-${list.id}`}
              list={{ id: list.id, title: list.title }}
              ownerName={`@${list.owner?.username ?? 'friend'}`}
              isFavorite={favs.includes(user.id)}
              other={myFav && myFav.id !== list.id ? myFav : null}
              onChange={onFavoriteChange}
            />
          )}
          <span className="spacer" />
          <button className="btn small" onClick={() => setCopyOpen(true)}>
            Copy
          </button>
          <button className="btn small primary" onClick={openCompare}>
            Compare
          </button>
        </div>
      )}

      {items.length > 3 && (
        <div className="toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Search this list" />
        </div>
      )}

      {items.length === 0 ? (
        <Empty title={isOwner ? 'Nothing here yet' : 'This list is empty'}>
          {isOwner && 'Add your first item below. Tip: paste a whole list (one item per line) to add many at once.'}
        </Empty>
      ) : shown.length === 0 ? (
        <Empty title="No matches">Nothing in this list matches &ldquo;{query.trim()}&rdquo;.</Empty>
      ) : isOwner ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ol className="rank-list">
              {shown.map(({ item, rank }) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  rank={rank}
                  total={items.length}
                  editing={editingId === item.id}
                  flash={flashIds.includes(item.id)}
                  filtering={filtering}
                  photoBusy={photoBusyId === item.id}
                  reactions={reactionsFor(item.id)}
                  userId={user.id}
                  onReact={() => {}}
                  onWho={() => openWho(item)}
                  onToggle={() => setEditingId(editingId === item.id ? null : item.id)}
                  onSave={saveItem}
                  onDelete={removeItem}
                  onPhoto={setPhoto}
                  onRemovePhoto={removePhoto}
                  onView={setViewing}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <ol className="rank-list">
          {shown.map(({ item, rank }) => (
            <li key={item.id} id={`item-${item.id}`} className={flashIds.includes(item.id) ? 'row flash' : 'row'}>
              <div className="row-main">
                <span className={`rank rank-${rank <= 3 ? rank : 'n'}`}>{rank}</span>
                {item.image_path && (
                  <button className="row-thumb" onClick={() => setViewing(item)} aria-label={`View photo of ${item.title}`}>
                    <img src={imageUrl(item.image_path)} alt="" loading="lazy" />
                  </button>
                )}
                <div className="row-text static">
                  <span className="row-title">{item.title}</span>
                  {item.note && <span className="row-note">{item.note}</span>}
                </div>
              </div>
              <ReactionBar reactions={reactionsFor(item.id)} userId={user.id} onReact={(e) => react(item.id, e)} onWho={() => {}} />
            </li>
          ))}
        </ol>
      )}

      <div ref={endRef} className="list-end" />

      {isOwner && (
        <form className="addbar" onSubmit={handleAdd} noValidate>
          {rankError && (
            <p className="error rank-error" role="alert">
              {rankError}
            </p>
          )}
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handlePaste}
            placeholder="Add an item..."
            enterKeyHint="done"
            autoComplete="off"
            maxLength={200}
            aria-label="Add an item"
          />
          <label className={rankError ? 'rank-field bad' : 'rank-field'} title="Optional: the rank to insert at. Leave empty to add at the end.">
            <span aria-hidden="true">#</span>
            <input
              inputMode="numeric"
              value={rankDraft}
              onChange={(e) => {
                setRankDraft(e.target.value)
                setRankError('')
              }}
              aria-invalid={Boolean(rankError)}
              placeholder="Rank"
              aria-label="Rank to insert at (leave empty to add at the end)"
            />
          </label>
          <button className="btn primary" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      )}

      <Modal
        open={Boolean(pending)}
        title={pending?.dupes.length > 1 ? 'Some of these are already here' : 'Already in your list'}
        onClose={() => answerDuplicate('cancel')}
        actions={
          pending && (
            <>
              <button className="btn" onClick={() => answerDuplicate('cancel')}>
                Cancel
              </button>
              {pending.titles.length > 1 && (
                <button className="btn" onClick={() => answerDuplicate('skip')}>
                  Skip duplicates
                </button>
              )}
              <button className="btn primary" onClick={() => answerDuplicate('add')}>
                {pending.titles.length > 1 ? 'Add all anyway' : 'Add anyway'}
              </button>
            </>
          )
        }
      >
        {pending && pending.titles.length === 1 && (
          <p>
            You already have <b>&ldquo;{pending.dupes[0].existingTitle}&rdquo;</b> in spot <b>#{pending.dupes[0].existingRank}</b>. Would
            you still like to insert <b>&ldquo;{pending.titles[0]}&rdquo;</b> at{' '}
            <b>#{pending.rank ?? items.length + 1}</b>?
          </p>
        )}
        {pending && pending.titles.length > 1 && (
          <>
            <p>These look like items you already have:</p>
            <ul className="dupe-list">
              {pending.dupes.slice(0, 6).map((d) => (
                <li key={d.title}>
                  &ldquo;{d.title}&rdquo; is like <b>&ldquo;{d.existingTitle}&rdquo;</b> (#{d.existingRank})
                </li>
              ))}
              {pending.dupes.length > 6 && <li className="muted">and {pending.dupes.length - 6} more</li>}
            </ul>
          </>
        )}
      </Modal>

      <Modal
        open={copyOpen}
        title="Copy to my lists?"
        onClose={() => !copying && setCopyOpen(false)}
        actions={
          <>
            <button className="btn" disabled={copying} onClick={() => setCopyOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={copying} onClick={copyToMine}>
              {copying ? 'Copying...' : 'Copy list'}
            </button>
          </>
        }
      >
        <p>
          This makes your own copy of <b>&ldquo;{list.title}&rdquo;</b> by @{list.owner?.username ?? 'friend'} with its {items.length}{' '}
          {items.length === 1 ? 'item' : 'items'}, in the same order. You can then re-rank, add and remove whatever you like. Their list
          won&rsquo;t change.
        </p>
      </Modal>

      {viewing && (
        <div className="lightbox" onClick={() => setViewing(null)} role="dialog" aria-label={viewing.title}>
          <img src={imageUrl(viewing.image_path)} alt={viewing.title} />
          <p>{viewing.title}</p>
        </div>
      )}

      <Sheet open={likersOpen} onClose={() => setLikersOpen(false)} title={likersMode === 'favorites' ? 'Favorited by' : 'Liked by'}>
        {likers === null && <Spinner />}
        {likers && likers.length === 0 && <p className="muted">{likersMode === 'favorites' ? 'No favorites yet.' : 'No likes yet.'}</p>}
        {likers && likers.length > 0 && (
          <div className="pick-list">
            {likers.map((l) => (
              <div key={l.user_id} className="pick-row static">
                <Avatar profile={l.profile} size={32} />
                <span className="pick-title">{l.profile?.display_name || l.profile?.username || 'A friend'}</span>
                {l.profile?.username && <span className="muted small">@{l.profile.username}</span>}
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet open={Boolean(whoItem)} onClose={() => setWhoItem(null)} title={whoItem ? `Reactions to ${whoItem.title}` : 'Reactions'}>
        {whoRows === null && <Spinner />}
        {whoRows && whoRows.length === 0 && <p className="muted">No reactions yet.</p>}
        {whoRows && whoRows.length > 0 && (
          <div className="pick-list">
            {whoRows.map((r) => (
              <div key={r.user_id} className="pick-row static">
                <Avatar profile={r.profile} size={32} />
                <span className="pick-title">{r.profile?.display_name || r.profile?.username || 'A friend'}</span>
                <span style={{ fontSize: 22 }}>{r.emoji}</span>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="List settings">
        <ListForm initial={list} submitLabel="Save" onSubmit={handleSettings} onDelete={handleDeleteList} />
      </Sheet>

      <Sheet open={compareOpen} onClose={() => setCompareOpen(false)} title="Compare with which of your lists?">
        {myLists === null && <Spinner />}
        {myLists && myLists.length === 0 && (
          <Empty title="You have no lists yet">
            <Link className="btn primary" to="/">
              Create one
            </Link>
          </Empty>
        )}
        {myLists && myLists.length > 0 && (
          <div className="pick-list">
            {sortedMine.map((mine) => (
              <button key={mine.id} className="pick-row" onClick={() => navigate(`/compare/${mine.id}/${list.id}`)}>
                <span className="pick-dot" style={{ background: mine.color }} />
                <span className="pick-title">{mine.title}</span>
                {matchesTitle(mine) && <span className="pill">Same topic</span>}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  )
}