import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { imageUrl } from '../images.js'
import { inkOn } from '../templates.js'
import { Modal } from './ui.jsx'

function ReorderRow({ list, rank, highlight, onPickRank }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
    '--list-color': list.color,
    '--list-ink': inkOn(list.color),
  }
  return (
    <li
      ref={setNodeRef}
      id={`reorder-${list.id}`}
      style={style}
      className={`row list-reorder-row${isDragging ? ' dragging' : ''}${highlight ? ' new-highlight' : ''}`}
    >
      <div className="row-main">
        <button
          type="button"
          className={`rank rank-${rank <= 3 ? rank : 'n'} rank-pick`}
          onClick={() => onPickRank(list, rank)}
          aria-label={`${list.title} is rank ${rank}. Tap to move it to a different rank`}
        >
          {rank}
        </button>
        <span className="list-card-icon small">
          {list.icon_path ? <img src={imageUrl(list.icon_path)} alt="" /> : list.icon || list.title.charAt(0).toUpperCase()}
        </span>
        <span className="row-text static">
          <span className="row-title">
            {list.title}
            {highlight && <span className="pill new-pill">New</span>}
          </span>
        </span>
        <button className="drag-handle" {...attributes} {...listeners} aria-label={`Drag to reorder ${list.title}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.7" />
            <circle cx="15" cy="6" r="1.7" />
            <circle cx="9" cy="12" r="1.7" />
            <circle cx="15" cy="12" r="1.7" />
            <circle cx="9" cy="18" r="1.7" />
            <circle cx="15" cy="18" r="1.7" />
          </svg>
        </button>
      </div>
    </li>
  )
}

// Drag your lists into the order you want. onChange gets the full new array.
// Tapping a rank number asks for a new rank and calls onMoveTo(id, rank). highlightId marks a just-made list.
export default function ListReorder({ lists, onChange, highlightId = null, onMoveTo }) {
  const [picking, setPicking] = useState(null) // { list, rank }
  const [value, setValue] = useState('')
  const pick = (list, rank) => {
    setPicking({ list, rank })
    setValue('')
  }
  const submitPick = (e) => {
    e?.preventDefault()
    const n = parseInt(value, 10)
    if (picking && n >= 1) onMoveTo(picking.list.id, n)
    setPicking(null)
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = lists.findIndex((l) => l.id === active.id)
    const to = lists.findIndex((l) => l.id === over.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(lists, from, to))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
      <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <ol className="rank-list">
          {lists.map((list, i) => (
            <ReorderRow key={list.id} list={list} rank={i + 1} highlight={list.id === highlightId} onPickRank={pick} />
          ))}
        </ol>
      </SortableContext>
      <Modal
        open={Boolean(picking)}
        title={picking ? `Move “${picking.list.title}”` : ''}
        onClose={() => setPicking(null)}
        actions={
          <>
            <button className="btn" onClick={() => setPicking(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={submitPick} disabled={!value}>
              Move
            </button>
          </>
        }
      >
        <form onSubmit={submitPick} className="field">
          <span className="label">
            New rank (1-{lists.length}), now #{picking?.rank}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={lists.length}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            aria-label="New rank"
          />
        </form>
      </Modal>
    </DndContext>
  )
}