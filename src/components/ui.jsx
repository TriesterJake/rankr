import { useNavigate } from 'react-router-dom'

const AVATAR_COLORS = ['#7c5cff', '#ff5c8a', '#ff9f43', '#5ac86a', '#2ec4b6', '#4dabf7', '#ef476f']

export function Avatar({ profile, size = 40 }) {
  const name = profile?.display_name || profile?.username || '?'
  const seed = [...(profile?.username || name)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: AVATAR_COLORS[seed % AVATAR_COLORS.length],
      }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase()}
    </div>
  )
}

export function TopBar({ title, subtitle, back, right }) {
  const navigate = useNavigate()
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
  return (
    <header className="topbar">
      <div className="topbar-side">
        {back && (
          <button className="icon-btn" onClick={goBack} aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
      </div>
      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="topbar-side topbar-right">{right}</div>
    </header>
  )
}

export function Sheet({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="text-btn" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="center-note" role="status">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}

// Search field with a clear button.
export function SearchBox({ value, onChange, placeholder = 'Search' }) {
  return (
    <div className="searchbox">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="search"
      />
      {value && (
        <button type="button" className="searchbox-clear" onClick={() => onChange('')} aria-label="Clear search">
          &times;
        </button>
      )}
    </div>
  )
}

// A centered popup for quick questions.
export function Modal({ open, title, onClose, children, actions }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}