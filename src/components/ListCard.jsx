import { Link } from 'react-router-dom'
import { topItems } from '../api.js'
import { inkOn } from '../templates.js'

// A list summary card: color stripe, title, item count and the current top 3.
export default function ListCard({ list, footer }) {
  const count = list.list_items?.length ?? 0
  const top = topItems(list, 3)
  return (
    <div className="list-card" style={{ '--list-color': list.color, '--list-ink': inkOn(list.color) }}>
      <Link to={`/list/${list.id}`} className="list-card-link">
        <div className="list-card-icon">{list.icon || list.title.charAt(0).toUpperCase()}</div>
        <div className="list-card-body">
          <div className="list-card-title">
            <h3>{list.title}</h3>
            {list.visibility === 'private' && <span className="pill">Private</span>}
          </div>
          <p className="muted small">{count === 0 ? 'Empty' : `${count} ${count === 1 ? 'item' : 'items'}`}</p>
          {top.length > 0 && (
            <ol className="mini-top">
              {top.map((item, i) => (
                <li key={item.id}>
                  <b>{i + 1}</b>
                  <span>{item.title}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Link>
      {footer}
    </div>
  )
}
