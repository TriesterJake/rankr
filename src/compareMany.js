// Compare the same kind of list across several people at once.
// lists: [{ items: [{ title }, ...] }, ...]  (each already sorted best-first; the first list is "yours")
// Items that match (same wording, ignoring capitals/punctuation/small typos) across any two lists are treated as one item.
import { compareLists } from './compare.js'

export function compareMany(lists) {
  const n = lists.length

  // union-find over every item of every list
  const parent = new Map()
  const key = (li, i) => `${li}:${i}`
  const find = (x) => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)
    while (parent.get(x) !== r) {
      const next = parent.get(x)
      parent.set(x, r)
      x = next
    }
    return r
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  lists.forEach((l, li) => l.items.forEach((_, i) => parent.set(key(li, i), key(li, i))))

  // how alike each pair of lists is, and which items line up
  const pairs = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const r = compareLists(lists[a].items, lists[b].items)
      pairs.push({ a, b, match: r.match, shared: r.sameCount })
      for (const p of r.pairs) if (p.kind === 'same') union(key(a, p.aIndex), key(b, p.bIndex))
    }
  }

  // gather clusters
  const clusters = new Map()
  lists.forEach((l, li) =>
    l.items.forEach((item, i) => {
      const root = find(key(li, i))
      if (!clusters.has(root)) clusters.set(root, { title: item.title, ranks: Array(n).fill(null), firstList: li })
      const c = clusters.get(root)
      if (c.ranks[li] === null) c.ranks[li] = i + 1
    }),
  )

  const rel = (rank, len) => (len > 1 ? (rank - 1) / (len - 1) : 0)
  const rows = [...clusters.values()].map((c) => {
    const present = c.ranks.filter((r) => r !== null).length
    const positions = c.ranks.map((r, li) => (r === null ? null : rel(r, lists[li].items.length))).filter((x) => x !== null)
    const avgPos = positions.reduce((s, x) => s + x, 0) / positions.length
    const spread = Math.max(...positions) - Math.min(...positions)
    return { ...c, present, avgPos, spread }
  })

  const everyone = rows.filter((r) => r.present === n).sort((x, y) => x.avgPos - y.avgPos)
  const some = rows.filter((r) => r.present > 1 && r.present < n).sort((x, y) => y.present - x.present || x.avgPos - y.avgPos)
  const single = rows.filter((r) => r.present === 1).sort((x, y) => x.firstList - y.firstList || x.ranks[x.firstList] - y.ranks[y.firstList])

  const divisive = [...everyone].sort((x, y) => y.spread - x.spread)[0]
  return {
    n,
    pairs: pairs.sort((x, y) => y.match - x.match),
    everyone,
    some,
    single,
    groupFavorite: everyone[0] || null,
    mostDivisive: divisive && divisive.spread > 0.25 ? divisive : null,
  }
}