import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { getItems, getList } from '../api.js'
import { compareLists, sameTopic as sameTopicTitles } from '../compare.js'
import { loadVibes } from '../vibes.js'
import { Empty, Spinner, TopBar } from '../components/ui.jsx'

const nameOf = (list, meId) => (list.owner_id === meId ? 'You' : `@${list.owner?.username ?? 'friend'}`)

// How far apart are the two ranks, measured by position in each list (top vs bottom)?
function gapLabel(gap, sameRank) {
  if (sameRank || gap < 0.005) return { text: 'Same spot', cls: 'diff same' }
  if (gap < 0.15) return { text: 'Close', cls: 'diff near' }
  if (gap < 0.4) return { text: 'Different', cls: 'diff mid' }
  return { text: 'Far apart', cls: 'diff far' }
}

export default function ComparePage() {
  const { mine: mineId, theirs: theirsId } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(undefined) // undefined loading, null failed
  const [tab, setTab] = useState('shared')
  const [vibes, setVibes] = useState(null)
  const [vibesState, setVibesState] = useState('idle') // idle | loading | ready | failed

  useEffect(() => {
    let cancelled = false
    setData(undefined)
    ;(async () => {
      try {
        const [a, b, aItems, bItems] = await Promise.all([getList(mineId), getList(theirsId), getItems(mineId), getItems(theirsId)])
        if (cancelled) return
        setData(a && b ? { a, b, aItems, bItems } : null)
      } catch {
        if (!cancelled) {
          toast('Could not load the comparison')
          setData(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mineId, theirsId, toast])

  // First pass: exact and misspelled matches only (instant).
  const base = useMemo(() => (data ? compareLists(data.aItems, data.bItems) : null), [data])
  const wantsVibes = Boolean(base?.canUseVibes)

  // If both lists still have unmatched items, fetch the small word file to look for similar meanings.
  useEffect(() => {
    if (!wantsVibes) return
    let cancelled = false
    setVibesState('loading')
    loadVibes()
      .then((v) => {
        if (cancelled) return
        setVibes(v)
        setVibesState('ready')
      })
      .catch(() => {
        if (!cancelled) setVibesState('failed')
      })
    return () => {
      cancelled = true
    }
  }, [wantsVibes])

  const result = useMemo(() => (data ? compareLists(data.aItems, data.bItems, vibes) : null), [data, vibes])

  if (data === undefined) {
    return (
      <>
        <TopBar title="Compare" back />
        <Spinner />
      </>
    )
  }
  if (data === null) {
    return (
      <>
        <TopBar title="Compare" back />
        <Empty title="Can't compare these lists">One of them may be private or no longer exists.</Empty>
      </>
    )
  }

  const { a, b, aItems, bItems } = data
  const left = nameOf(a, user.id)
  const right = nameOf(b, user.id)
  const leftWho = left === 'You' ? 'you' : left
  const sameTopic = sameTopicTitles(a.title, b.title)
  const total = result.pairs.length

  const summary =
    total === 0
      ? 'No items in common yet.'
      : `${result.sameCount} in common${result.similarCount ? ` + ${result.similarCount} similar` : ''}, out of ${aItems.length} and ${bItems.length} items.`

  const nameText = (p) => (p.kind === 'similar' ? `${p.title} / ${p.theirTitle}` : p.title)
  const rankText = (p) =>
    `#${p.myRank} of ${aItems.length} for ${leftWho}, #${p.theirRank} of ${bItems.length} for ${right}`

  return (
    <>
      <TopBar back title="Compare" subtitle={sameTopic ? a.title : `${a.title} vs ${b.title}`} />

      <section className="match-card">
        <div className="match-score">
          {result.match}
          <span>%</span>
        </div>
        <div>
          <b>Match</b>
          <p className="muted small">{summary}</p>
          {vibesState === 'loading' && <p className="muted small">Checking for similar vibes...</p>}
        </div>
      </section>

      {result.similarCount > 0 && (
        <p className="vibes-note muted small">
          &ldquo;Similar&rdquo; means the two items are related in meaning (like eating and food) even though they aren&rsquo;t the same
          word. They count for partial credit.
        </p>
      )}

      {total > 0 && (
        <section className="highlights">
          {result.closest && (
            <div className="highlight">
              <span className="label">Closest call</span>
              <b>{nameText(result.closest)}</b>
              <span className="muted small">{rankText(result.closest)}</span>
            </div>
          )}
          {result.biggestGap && (
            <div className="highlight">
              <span className="label">Biggest disagreement</span>
              <b>{nameText(result.biggestGap)}</b>
              <span className="muted small">{rankText(result.biggestGap)}</span>
            </div>
          )}
        </section>
      )}

      <div className="segmented tabs">
        <button className={tab === 'shared' ? 'seg on' : 'seg'} onClick={() => setTab('shared')}>
          In common
        </button>
        <button className={tab === 'side' ? 'seg on' : 'seg'} onClick={() => setTab('side')}>
          Side by side
        </button>
      </div>

      {tab === 'shared' &&
        (total === 0 ? (
          <Empty title="Nothing in common yet">When you both rank the same item, it shows up here with each of your ranks.</Empty>
        ) : (
          <div className="table">
            <div className="table-head">
              <span className="col-title">Item</span>
              <span className="col-rank">{left}</span>
              <span className="col-rank">{right}</span>
              <span className="col-diff" />
            </div>
            {result.pairs.map((p) => {
              const g = gapLabel(p.relGap, p.myRank === p.theirRank)
              const differs = p.theirTitle.trim().toLowerCase() !== p.title.trim().toLowerCase()
              return (
                <div className="table-row" key={`${p.aIndex}-${p.bIndex}`}>
                  <span className="col-title">
                    {p.title}
                    {p.kind === 'similar' && <span className="pill tag">Similar</span>}
                    {differs && (
                      <small className="alt">
                        {right}: {p.theirTitle}
                      </small>
                    )}
                  </span>
                  <span className="col-rank">#{p.myRank}</span>
                  <span className="col-rank">#{p.theirRank}</span>
                  <span className={`col-diff ${g.cls}`}>{g.text}</span>
                </div>
              )
            })}
          </div>
        ))}

      {tab === 'side' && (
        <div className="side-by-side">
          {[
            { name: left, items: aItems, matched: result.matchedA },
            { name: right, items: bItems, matched: result.matchedB },
          ].map((col) => (
            <div className="side-col" key={col.name}>
              <h3>{col.name}</h3>
              <ol>
                {col.items.map((item, i) => {
                  const kind = col.matched.get(i)
                  return (
                    <li key={item.id} className={kind === 'same' ? 'shared' : kind === 'similar' ? 'similar' : 'only'}>
                      <b>{i + 1}</b>
                      <span>{item.title}</span>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </>
  )
}