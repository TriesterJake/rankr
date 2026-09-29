// Comparing two ranked lists.
//
// 1. Items are matched even when capitalization, punctuation or small spelling mistakes differ.
// 2. Optionally (when word data is loaded) items with a similar meaning are matched too,
//    for example "eating" and "food". Those count as partial matches.
// 3. Ranks are compared by relative position (top of the list vs bottom), so a list of 9 and a
//    list of 5 can be compared fairly.

// Normalize titles so "The Office", "the office!" and "Office" count as the same item.
export function norm(title) {
  const cleaned = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/, '')
  return cleaned || title.toLowerCase().trim()
}

// How many typos are we willing to forgive, based on how long the item is?
const allowedTypos = (len) => (len <= 4 ? 0 : len <= 7 ? 1 : len <= 12 ? 2 : 3)

// Edit distance where swapping two neighbouring letters ("teh" vs "the") counts as one mistake.
function editDistance(a, b) {
  const al = a.length
  const bl = b.length
  if (!al) return bl
  if (!bl) return al
  let prev2 = null
  let prev = Array.from({ length: bl + 1 }, (_, j) => j)
  for (let i = 1; i <= al; i++) {
    const cur = [i]
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
    }
    prev2 = prev
    prev = cur
  }
  return prev[bl]
}

// Similar-meaning matches must be at least this alike (cosine, 0..1), and count for less than a real match.
// Tuned on real word data: 0.58 keeps clearly related pairs (eating/food, dogs/puppies, movies/films)
// while mostly filtering out unrelated words. Lower it for more matches, raise it for fewer.
export const SIMILAR_THRESHOLD = 0.58
const similarCredit = (sim) => 0.25 + 0.65 * Math.min(1, Math.max(0, (sim - SIMILAR_THRESHOLD) / (0.9 - SIMILAR_THRESHOLD)))

const dot = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

// Do two list titles mean the same topic? Ignores case, punctuation, spacing and small typos.
export function sameTopic(t1, t2) {
  const a = norm(t1).replace(/\s/g, '')
  const b = norm(t2).replace(/\s/g, '')
  if (!a || !b) return false
  if (a === b) return true
  const digits = (x) => (x.match(/\d+/g) || []).join(',')
  if (digits(a) !== digits(b) || a[0] !== b[0]) return false
  const allowed = Math.min(2, Math.floor(Math.max(a.length, b.length) / 8)) // stricter than items
  return allowed > 0 && Math.abs(a.length - b.length) <= allowed && editDistance(a, b) <= allowed
}

// Is this the same item as something already in a list? Ignores case, punctuation and small typos.
// Returns the first matching entry as { item, index } or null.
export function findSimilarItem(title, items) {
  const n = norm(title)
  const c = n.replace(/\s/g, '')
  const digits = (n.match(/\d+/g) || []).join(',')
  for (let index = 0; index < items.length; index++) {
    const n2 = norm(items[index].title)
    const c2 = n2.replace(/\s/g, '')
    if (c === c2) return { item: items[index], index }
    if (digits !== (n2.match(/\d+/g) || []).join(',') || c[0] !== c2[0]) continue
    const allowed = allowedTypos(Math.max(c.length, c2.length))
    if (allowed > 0 && Math.abs(c.length - c2.length) <= allowed && editDistance(c, c2) <= allowed) return { item: items[index], index }
  }
  return null
}

const relPos = (rank, n) => (n > 1 ? (rank - 1) / (n - 1) : 0)

// mine / theirs: arrays of items already sorted best-first.
// vibes (optional): { embed(text) -> unit vector | null } from vibes.js.
export function compareLists(mine, theirs, vibes = null) {
  const nA = mine.length
  const nB = theirs.length
  const prep = (items) =>
    items.map((it) => {
      const n = norm(it.title)
      return { c: n.replace(/\s/g, ''), digits: (n.match(/\d+/g) || []).join(',') }
    })
  const A = prep(mine)
  const B = prep(theirs)

  const usedA = new Set()
  const usedB = new Set()
  const matches = [] // { a, b, kind, sim }

  // Step 1: identical once cleaned up (ignores case, punctuation, spacing).
  const byKey = new Map()
  B.forEach((p, j) => {
    if (!byKey.has(p.c)) byKey.set(p.c, [])
    byKey.get(p.c).push(j)
  })
  A.forEach((p, i) => {
    const queue = byKey.get(p.c)
    if (queue && queue.length) {
      const j = queue.shift()
      usedA.add(i)
      usedB.add(j)
      matches.push({ a: i, b: j, kind: 'same', sim: 1 })
    }
  })

  // Step 2: same item with a small spelling mistake. Numbers must match exactly, so
  // "Toy Story 2" never matches "Toy Story 3".
  const fuzzy = []
  A.forEach((pa, i) => {
    if (usedA.has(i)) return
    B.forEach((pb, j) => {
      if (usedB.has(j)) return
      if (pa.digits !== pb.digits || pa.c[0] !== pb.c[0]) return
      const maxLen = Math.max(pa.c.length, pb.c.length)
      const allowed = allowedTypos(maxLen)
      if (allowed === 0 || Math.abs(pa.c.length - pb.c.length) > allowed) return
      const d = editDistance(pa.c, pb.c)
      if (d <= allowed) fuzzy.push({ a: i, b: j, d, sim: 1 - d / maxLen })
    })
  })
  fuzzy.sort((x, y) => x.d - y.d || Math.abs(x.a - x.b) - Math.abs(y.a - y.b))
  for (const f of fuzzy) {
    if (usedA.has(f.a) || usedB.has(f.b)) continue
    usedA.add(f.a)
    usedB.add(f.b)
    matches.push({ a: f.a, b: f.b, kind: 'same', sim: f.sim })
  }

  // Would word data help? Only if both lists still have items nobody matched.
  const canUseVibes = usedA.size < nA && usedB.size < nB

  // Step 3: similar meaning (only when word data is available).
  if (vibes && canUseVibes) {
    const embA = []
    const embB = []
    mine.forEach((it, i) => {
      if (!usedA.has(i)) {
        const v = vibes.embed(it.title)
        if (v) embA.push([i, v])
      }
    })
    theirs.forEach((it, j) => {
      if (!usedB.has(j)) {
        const v = vibes.embed(it.title)
        if (v) embB.push([j, v])
      }
    })
    const candidates = []
    for (const [i, va] of embA) {
      for (const [j, vb] of embB) {
        const sim = dot(va, vb)
        if (sim >= SIMILAR_THRESHOLD) candidates.push({ a: i, b: j, sim })
      }
    }
    candidates.sort((x, y) => y.sim - x.sim)
    for (const c of candidates) {
      if (usedA.has(c.a) || usedB.has(c.b)) continue
      usedA.add(c.a)
      usedB.add(c.b)
      matches.push({ a: c.a, b: c.b, kind: 'similar', sim: c.sim })
    }
  }

  // Turn matches into rows with ranks, credit and how far apart the two ranks are.
  const pairs = matches.map((m) => {
    const myRank = m.a + 1
    const theirRank = m.b + 1
    const pa = relPos(myRank, nA)
    const pb = relPos(theirRank, nB)
    return {
      aIndex: m.a,
      bIndex: m.b,
      kind: m.kind,
      sim: m.sim,
      credit: m.kind === 'same' ? 1 : similarCredit(m.sim),
      title: mine[m.a].title,
      theirTitle: theirs[m.b].title,
      myRank,
      theirRank,
      relGap: Math.abs(pa - pb),
      avgPos: (pa + pb) / 2,
    }
  })

  // Score: how much of the lists overlaps, softened by how close the rankings are.
  // Sharing items always earns something, even if you rank them differently.
  const credit = pairs.reduce((sum, p) => sum + p.credit, 0)
  const overlap = nA && nB ? Math.min(1, credit / Math.sqrt(nA * nB)) : 0
  const closeness = credit > 0 ? pairs.reduce((sum, p) => sum + p.credit * (1 - p.relGap), 0) / credit : 0
  const match = Math.round(100 * overlap * (0.4 + 0.6 * closeness))

  // Highlights: real matches come first. Similar-only pairs are used just when nothing is an exact match.
  // Closest call = same rank number wins, then the smallest gap by position in each list.
  const pool = pairs.some((p) => p.kind === 'same') ? pairs.filter((p) => p.kind === 'same') : pairs
  let closest = null
  let biggestGap = null
  for (const p of pool) {
    const d = Math.abs(p.myRank - p.theirRank)
    const cd = closest ? Math.abs(closest.myRank - closest.theirRank) : 0
    if (!closest || d < cd || (d === cd && (p.relGap < closest.relGap || (p.relGap === closest.relGap && p.avgPos < closest.avgPos)))) closest = p
    if (!biggestGap || p.relGap > biggestGap.relGap) biggestGap = p
  }

  const matchedA = new Map(pairs.map((p) => [p.aIndex, p.kind]))
  const matchedB = new Map(pairs.map((p) => [p.bIndex, p.kind]))

  return {
    pairs: [...pairs].sort((x, y) => x.avgPos - y.avgPos || x.myRank - y.myRank),
    matchedA,
    matchedB,
    sameCount: pairs.filter((p) => p.kind === 'same').length,
    similarCount: pairs.filter((p) => p.kind === 'similar').length,
    match,
    closest,
    biggestGap: biggestGap && biggestGap.relGap > 0.1 ? biggestGap : null,
    canUseVibes,
  }
}