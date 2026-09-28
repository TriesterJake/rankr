import { useState } from 'react'
import { COLORS, TEMPLATES, randomColor } from '../templates.js'

// Used both to create a list and to edit its settings.
export default function ListForm({ initial, submitLabel, showTemplates, onSubmit, onDelete }) {
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
      await onSubmit({ title: clean, icon: icon.trim().slice(0, 4), color, visibility })
    } finally {
      setBusy(false)
    }
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

      <button className="btn primary block" disabled={busy || !title.trim()}>
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
