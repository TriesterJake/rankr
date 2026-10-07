import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageUrl } from '../images.js'

const AVATAR_COLORS = ['#7c5cff', '#ff5c8a', '#ff9f43', '#5ac86a', '#2ec4b6', '#4dabf7', '#ef476f']

// Full-screen look at a picture. Tap anywhere (or press Escape) to close.
export function Lightbox({ src, caption, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label={caption || 'Picture'}>
      <img src={src} alt={caption || ''} />
      {caption && <p>{caption}</p>}
    </div>
  )
}

// zoom: tapping a profile picture opens it full size.
export function Avatar({ profile, size = 40, zoom = false }) {
  const [open, setOpen] = useState(false)
  const name = profile?.display_name || profile?.username || '?'
  const seed = [...(profile?.username || name)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const canZoom = zoom && Boolean(profile?.avatar_path)
  const circle = (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: AVATAR_COLORS[seed % AVATAR_COLORS.length],
      }}
      aria-hidden={canZoom ? undefined : 'true'}
    >
      {profile?.avatar_path ? <img src={imageUrl(profile.avatar_path)} alt="" loading="lazy" /> : name.trim().charAt(0).toUpperCase()}
    </div>
  )
  if (!canZoom) return circle
  return (
    <>
      <button type="button" className="avatar-zoom" onClick={() => setOpen(true)} aria-label={`View ${name}'s profile picture`}>
        {circle}
      </button>
      {open && <Lightbox src={imageUrl(profile.avatar_path)} caption={name} onClose={() => setOpen(false)} />}
    </>
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