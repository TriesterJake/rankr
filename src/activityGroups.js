// Turns the raw notification rows into fewer, tidier rows ("bursts" of the same kind are combined).
// rows: newest first. Returns [{ key, type, rows, actors, count, unread, newest }] newest first.

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

export function groupNotifications(rows) {
  const groups = []
  const byKey = new Map()
  for (const n of rows) {
    const key = groupKeyOf(n)
    let g = byKey.get(key)
    if (!g) {
      g = { key, type: n.type, rows: [], actors: [], newest: n.created_at }
      byKey.set(key, g)
      groups.push(g)
    }
    g.rows.push(n)
    if (n.actor && !g.actors.some((a) => a.id === n.actor.id)) g.actors.push(n.actor)
  }
  return groups.map((g) => ({ ...g, count: g.rows.length, unread: g.rows.some((r) => !r.read_at) }))
}

// "Mike", "Mike and Jeff", "Mike, Jeff and 2 others"
export function nameList(actors) {
  const names = actors.map((a) => a.display_name || a.username || 'A friend')
  if (names.length <= 1) return names[0] || 'A friend'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  const rest = names.length - 2
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'}`
}