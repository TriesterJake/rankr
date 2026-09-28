// "Similar vibe" matching: turns a short piece of text into a list of numbers so that
// related things ("eating", "food") end up close together. The word data is a small file
// (see public/vibes/README.txt) that is only downloaded when a comparison needs it.

const SKIP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'with', 'my', 'me', 'is', 'it', 'i', 'at', 'by',
  'best', 'favorite', 'favourite', 'fav', 'top',
])

// wordsText: one word per line. bytes: Int8Array with one row of numbers per word, same order.
export function createVibes(wordsText, bytes) {
  const words = wordsText.split('\n').filter(Boolean)
  const dim = bytes.length / words.length
  if (!Number.isInteger(dim) || dim < 8) throw new Error('Word data is not the expected shape')
  const index = new Map(words.map((w, i) => [w, i]))

  function lookup(token) {
    let j = index.get(token)
    if (j === undefined && token.length > 3) {
      // crude plural handling: burgers -> burger, cookies -> cooky
      for (const stem of [token.replace(/s$/, ''), token.replace(/es$/, ''), token.replace(/ies$/, 'y')]) {
        j = index.get(stem)
        if (j !== undefined) break
      }
    }
    return j
  }

  // Returns a unit-length vector for the text, or null when none of its words are known
  // (song titles and names usually aren't, which is fine: they only match by spelling).
  function embed(text) {
    const tokens =
      text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .match(/[a-z]+/g) || []
    const acc = new Float32Array(dim)
    let used = 0
    for (const t of tokens) {
      if (SKIP.has(t)) continue
      const j = lookup(t)
      if (j === undefined) continue
      const weight = Math.log(2 + j) // rarer words say more about the meaning
      const off = j * dim
      for (let k = 0; k < dim; k++) acc[k] += (bytes[off + k] / 127) * weight
      used++
    }
    if (!used) return null
    let norm = 0
    for (let k = 0; k < dim; k++) norm += acc[k] * acc[k]
    norm = Math.sqrt(norm) || 1
    for (let k = 0; k < dim; k++) acc[k] /= norm
    return acc
  }

  return { embed, size: words.length, dim }
}

let cached = null

// Downloads the word data once per visit (the browser keeps it afterwards).
export function loadVibes() {
  if (!cached) {
    const base = import.meta.env.BASE_URL
    cached = (async () => {
      const [wordsRes, vecRes] = await Promise.all([fetch(`${base}vibes/words.txt`), fetch(`${base}vibes/vectors.bin`)])
      if (!wordsRes.ok || !vecRes.ok) throw new Error('Word data unavailable')
      const wordsText = await wordsRes.text()
      const bytes = new Int8Array(await vecRes.arrayBuffer())
      return createVibes(wordsText, bytes)
    })().catch((err) => {
      cached = null // allow a retry next time
      throw err
    })
  }
  return cached
}
