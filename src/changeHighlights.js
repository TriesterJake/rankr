// Tapping an "updated" notification opens the list with ?changes=added.3,edited.1,... and the list
// shows what changed: new/edited items are highlighted and a small banner explains the rest.

const KINDS = ['items_added', 'items_edited', 'items_removed', 'reordered', 'title', 'icon', 'color']
const SHORT = { items_added: 'added', items_edited: 'edited', items_removed: 'removed', reordered: 'reordered', title: 'title', icon: 'icon', color: 'color' }
const LONG = Object.fromEntries(Object.entries(SHORT).map(([k, v]) => [v, k]))

// notification rows -> "added.3,reordered.1"  (counts of the same kind are added up)
export function changesParam(rows) {
  const sums = new Map()
  for (const r of rows) {
    if (!r.edit_kind || !KINDS.includes(r.edit_kind)) continue
    sums.set(r.edit_kind, (sums.get(r.edit_kind) || 0) + (r.item_count || 1))
  }
  return [...sums].map(([k, n]) => `${SHORT[k]}.${n}`).join(',')
}

export function parseChanges(param) {
  const out = {}
  for (const part of String(param || '').split(',')) {
    const [short, n] = part.split('.')
    const kind = LONG[short]
    if (kind) out[kind] = Math.max(1, Math.min(200, parseInt(n, 10) || 1))
  }
  return out
}

const WEEK = 7 * 24 * 3600 * 1000

// Which items to highlight: the N newest added items and the N most recently edited ones.
// Returns { ids, labels } where labels[id] is 'New' or 'Edited'.
export function pickChanged(items, changes, now = Date.now()) {
  const ids = []
  const labels = {}
  const t = (v) => (v ? new Date(v).getTime() : 0)
  if (changes.items_added) {
    const fresh = [...items].filter((i) => now - t(i.created_at) < WEEK).sort((a, b) => t(b.created_at) - t(a.created_at))
    for (const i of fresh.slice(0, changes.items_added)) {
      ids.push(i.id)
      labels[i.id] = 'New'
    }
  }
  if (changes.items_edited) {
    const edited = [...items]
      .filter((i) => i.updated_at && !ids.includes(i.id) && now - t(i.updated_at) < WEEK)
      .sort((a, b) => t(b.updated_at) - t(a.updated_at))
    for (const i of edited.slice(0, changes.items_edited)) {
      ids.push(i.id)
      labels[i.id] = 'Edited'
    }
  }
  return { ids, labels }
}

// "3 new items, 1 edited, the order changed"
export function changeSummary(changes) {
  const n = (c, one, many) => `${c} ${c === 1 ? one : many}`
  const parts = []
  if (changes.items_added) parts.push(`${n(changes.items_added, 'new item', 'new items')}`)
  if (changes.items_edited) parts.push(`${changes.items_edited} edited`)
  if (changes.items_removed) parts.push(`${changes.items_removed} removed`)
  if (changes.reordered) parts.push('the order changed')
  if (changes.title) parts.push('a new name')
  if (changes.icon) parts.push('a new icon')
  if (changes.color) parts.push('a new color')
  return parts.join(', ')
}