import { useRef, useState } from 'react'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { imageUrl, removeImages, resizeImage, uploadItemImage } from '../images.js'
import { COLORS, TEMPLATES, randomColor, inkOn } from '../templates.js'

// Used both to create a list and to edit its settings.
export default function ListForm({ initial, submitLabel, showTemplates, onSubmit, onDelete }) {
  const { user } = useAuth()
  const toast = useToast()
  const [iconPath, setIconPath] = useState(initial?.icon_path ?? null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const unsaved = useRef(null) // a picture uploaded in this form that isn't saved to the list yet
  const [title, setTitle] = useState(initial?.title ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [color, setColor] = useState(() => initial?.color ?? randomColor())
  const [visibility, setVisibility] = useState(initial?.visibility ?? 'friends')
  const [busy, setBusy] = useState(false)
  const isCustom = !COLORS.includes(color)

  async function submit(e) {
    e.preventDefault()
    const clean = title.trim()
    if (!clean || busy) return
    setBusy(true)
    try {
      const ok = await onSubmit({ title: clean, icon: icon.trim().slice(0, 4), icon_path: iconPath, color, visibility })
      if (ok !== false) {
        unsaved.current = null
        // the old picture is no longer used once the change is saved
        if (initial?.icon_path && initial.icon_path !== iconPath) removeImages([initial.icon_path])
      }
    } finally {
      setBusy(false)
    }
  }

  function dropUnsaved() {
    if (unsaved.current && unsaved.current !== initial?.icon_path) removeImages([unsaved.current])
    unsaved.current = null
  }

  async function pickPhoto(file) {
    setPhotoBusy(true)
    try {
      const blob = await resizeImage(file, 900, 0.82)
      const path = await uploadItemImage(user.id, blob)
      dropUnsaved()
      unsaved.current = path
      setIconPath(path)
    } catch {
      toast('Could not add that picture')
    } finally {
      setPhotoBusy(false)
    }
  }

  function clearPhoto() {
    dropUnsaved()
    setIconPath(null)
  }

  return (
    <form className="form" onSubmit={submit}>
      {showTemplates && (
        <div className="field">
          <span className="label">Start from an idea</span>
          <div className="chips">
            {TEMPLATES.map((t) => (
              <button type="button" key={t} className={title === t ? 'chip on' : 'chip'} onClick={() => setTitle(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="field">
        <span className="label">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Favorite songs"
          maxLength={80}
          autoComplete="off"
          required
        />
      </label>

      <label className="field">
        <span className="label">Icon (optional)</span>
        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="A letter or emoji, e.g. a favorite emoji" maxLength={4} />
      </label>

      <div className="field">
        <span className="label">Icon picture (optional)</span>
        <div className="photo-row">
          {iconPath && (
            <span className="icon-preview" style={{ background: color, color: inkOn(color) }}>
              <img src={imageUrl(iconPath)} alt="" />
            </span>
          )}
          <label className={photoBusy ? 'btn small disabled' : 'btn small'}>
            {photoBusy ? 'Uploading...' : iconPath ? 'Change picture' : 'Add picture'}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={photoBusy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) pickPhoto(file)
              }}
            />
          </label>
          {iconPath && !photoBusy && (
            <button type="button" className="btn small" onClick={clearPhoto}>
              Remove
            </button>
          )}
        </div>
        {iconPath && <span className="muted small">A picture is used instead of the letter or emoji.</span>}
      </div>

      <div className="field">
        <span className="label">Color</span>
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={c === color ? 'swatch on' : 'swatch'}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={c === color}
            />
          ))}
          <label
            className={isCustom ? 'swatch custom on' : 'swatch custom'}
            style={isCustom ? { background: color } : undefined}
            title="Pick any color"
          >
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Pick a custom color" />
          </label>
        </div>
      </div>

      <div className="field">
        <span className="label">Who can see it</span>
        <div className="segmented">
          <button type="button" className={visibility === 'friends' ? 'seg on' : 'seg'} onClick={() => setVisibility('friends')}>
            Friends
          </button>
          <button type="button" className={visibility === 'private' ? 'seg on' : 'seg'} onClick={() => setVisibility('private')}>
            Only me
          </button>
        </div>
      </div>

      <button className="btn primary block" disabled={busy || photoBusy || !title.trim()}>
        {busy ? 'Saving...' : submitLabel}
      </button>

      {onDelete && (
        <button type="button" className="btn danger block" onClick={onDelete}>
          Delete this list
        </button>
      )}
    </form>
  )
}