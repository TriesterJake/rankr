import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { imageUrl } from '../images.js'
import { inkOn } from '../templates.js'

function ReorderRow({ list, rank }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
    '--list-color': list.color,
    '--list-ink': inkOn(list.color),
  }
  return (
    <li ref={setNodeRef} style={style} className={`row list-reorder-row${isDragging ? ' dragging' : ''}`}>
      <div className="row-main">
        <span className={`rank rank-${rank <= 3 ? rank : 'n'}`}>{rank}</span>
        <span className="list-card-icon small">
          {list.icon_path ? <img src={imageUrl(list.icon_path)} alt="" /> : list.icon || list.title.charAt(0).toUpperCase()}
        </span>
        <span className="row-text static">
          <span className="row-title">{list.title}</span>
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
export default function ListReorder({ lists, onChange }) {
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
            <ReorderRow key={list.id} list={list} rank={i + 1} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}