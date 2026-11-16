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
// scroll: false when the caller moves the page itself (e.g. the reorder replay follows one item).
// onTop: ids of rows that should slide over the others (the ones that were really moved).
export function playRows(before, prefix, focusId = null, duration = 420, scroll = true, onTop = null) {
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
    if (focus && scroll) {
      const r = focus.getBoundingClientRect()
      if (r.top < 120 || r.bottom > window.innerHeight - 90) focus.scrollIntoView({ block: 'center' })
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    for (const { el, dy, id } of moves) {
      const raise = onTop?.has(id)
      if (raise) {
        el.style.position = 'relative'
        el.style.zIndex = '3'
        el.classList.add('sliding-on-top')
      }
      const anim = el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
        duration,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      })
      if (raise) {
        anim.onfinish = anim.oncancel = () => {
          el.style.zIndex = ''
          el.style.position = ''
          el.classList.remove('sliding-on-top')
        }
      }
    }
  })
}

// Glide the page to a scroll position over `duration` ms, with the same easing as the row slides.
export function glideTo(y, duration = 420) {
  const start = window.scrollY
  const end = Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight))
  if (Math.abs(end - start) < 2) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return window.scrollTo(0, end)
  const t0 = performance.now()
  // cubic-bezier(0.2, 0.8, 0.2, 1) is close to this ease-out
  const ease = (t) => 1 - Math.pow(1 - t, 3)
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration)
    window.scrollTo(0, start + (end - start) * ease(t))
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export const pageTopOf = (id) => {
  const el = document.getElementById(id)
  return el ? el.getBoundingClientRect().top + window.scrollY : null
}
