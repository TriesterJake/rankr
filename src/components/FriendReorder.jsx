import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { Avatar } from './ui.jsx'

function Row({ profile, rank }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: profile.id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined }
  const name = profile.display_name || profile.username
  return (
    <li ref={setNodeRef} style={style} className={`row friend-reorder-row${isDragging ? ' dragging' : ''}`}>
      <div className="row-main">
        <span className={`rank rank-${rank <= 3 ? rank : 'n'}`}>{rank}</span>
        <Avatar profile={profile} size={40} />
        <span className="row-text static">
          <span className="row-title">{name}</span>
          <span className="row-note">@{profile.username}</span>
        </span>
        <button className="drag-handle" {...attributes} {...listeners} aria-label={`Drag to reorder ${name}`}>
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

// Drag your friends into your own private order. profiles: best first. onChange gets the new array.
export default function FriendReorder({ profiles, onChange }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = profiles.findIndex((p) => p.id === active.id)
    const to = profiles.findIndex((p) => p.id === over.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(profiles, from, to))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
      <SortableContext items={profiles.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ol className="rank-list">
          {profiles.map((p, i) => (
            <Row key={p.id} profile={p} rank={i + 1} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}