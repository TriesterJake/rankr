// Undo animation: rows slide from where they were to where they end up, instead of jumping.
// Call capture() BEFORE changing the order, then play() right after.
// prefix: the rows' DOM id prefix, e.g. 'item-' for <li id="item-123">.

const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY

export function captureRows(ids, prefix) {
  const before = new Map()
  for (const id of ids) {
    const el = document.getElementById(prefix + id)
    if (el) before.set(id, pageTop(el))
  }
  return before
}

// focusId: a row to bring on screen first (e.g. the one being put back). Otherwise the row that moves farthest.
export function playRows(before, prefix, focusId = null, duration = 420) {
  requestAnimationFrame(() => {
    const moves = []
    for (const [id, top] of before) {
      const el = document.getElementById(prefix + id)
      if (!el) continue
      const dy = top - pageTop(el)
      if (Math.abs(dy) >= 1) moves.push({ el, dy, id })
    }
    const focus =
      (focusId && document.getElementById(prefix + focusId)) ||
      moves.reduce((best, m) => (!best || Math.abs(m.dy) > Math.abs(best.dy) ? m : best), null)?.el
    if (focus) {
      const r = focus.getBoundingClientRect()
      if (r.top < 120 || r.bottom > window.innerHeight - 90) focus.scrollIntoView({ block: 'center' })
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    for (const { el, dy } of moves) {
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
        duration,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      })
    }
  })
}
