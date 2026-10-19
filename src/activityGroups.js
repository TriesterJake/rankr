// Turns the raw notification rows into fewer, tidier rows ("bursts" of the same kind are combined).
// rows: newest first. Returns [{ key, type, rows, actors, count, lists, unread, newest }] newest first.
// A burst is only combined while the activity keeps going: a gap of more than GROUP_GAP_MS between
// two neighbouring events (same kind, same friend) starts a separate group.

export const GROUP_GAP_MS = 30 * 60 * 1000

const groupKeyOf = (n) => {
  switch (n.type) {
    case 'reacted':
      return `reacted|${n.list_id}|${n.actor?.id}` // one friend reacting to several items in a list
    case 'liked':
    case 'favorited':
      return `${n.type}|${n.list_id}` // several friends liking the same list
    case 'new_list':
    case 'edited_list':
      return `${n.type}|${n.actor?.id}` // one friend making/updating several lists
    default:
      return `single|${n.id}`
  }
}

export function groupNotifications(rows, gapMs = GROUP_GAP_MS) {
  const groups = []
  const open = new Map() // key -> the group still being filled (rows come newest first)
  for (const n of rows) {
    const key = groupKeyOf(n)
    let g = open.get(key)
    const t = new Date(n.created_at).getTime()
    if (g && g.oldestTime - t > gapMs) g = null // too long since the next-newer one: start a new group
    if (!g) {
      g = { key: `${key}|${n.id}`, type: n.type, rows: [], actors: [], newest: n.created_at, oldestTime: t }
      open.set(key, g)
      groups.push(g)
    }
    g.rows.push(n)
    g.oldestTime = t
    if (n.actor && !g.actors.some((a) => a.id === n.actor.id)) g.actors.push(n.actor)
  }
  return groups.map(({ oldestTime, ...g }) => ({
    ...g,
    count: g.rows.length,
    lists: [...new Set(g.rows.map((r) => r.list_id).filter(Boolean))].length,
    unread: g.rows.some((r) => !r.read_at),
  }))
}

// What one "edited" notification says, in pieces: { text, short }
// text: full sentence tail ("added 3 items to Pizza"), short: for a list of changes ("added 3 items")
export function describeEdit(n) {
  const list = n.list_title || 'a list'
  const c = n.item_count || 1
  const items = `${c} ${c === 1 ? 'item' : 'items'}`
  switch (n.edit_kind) {
    case 'title':
      return { text: n.item_title && n.item_title !== list ? { pre: 'renamed ', old: n.item_title, mid: ' to ', list } : { pre: 'renamed a list to ', list }, short: 'renamed it' }
    case 'icon':
      return { text: { pre: 'changed the icon of ', list }, short: 'changed the icon' }
    case 'color':
      return { text: { pre: 'changed the color of ', list }, short: 'changed the color' }
    case 'items_added':
      return { text: { pre: `added ${items} to `, list }, short: `added ${items}` }
    case 'items_removed':
      return { text: { pre: `removed ${items} from `, list }, short: `removed ${items}` }
    case 'items_edited':
      return { text: { pre: `edited ${items} in `, list }, short: `edited ${items}` }
    case 'reordered':
      return { text: { pre: 'changed the order of ', list }, short: 'changed the order' }
    default:
      return { text: { pre: 'updated ', list }, short: 'made changes' }
  }
}

// "Mike", "Mike and Jeff", "Mike, Jeff and 2 others"
export function nameList(actors) {
  const names = actors.map((a) => a.display_name || a.username || 'A friend')
  if (names.length <= 1) return names[0] || 'A friend'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  const rest = names.length - 2
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'}`
}

export { changesParam } from './changeHighlights.js'