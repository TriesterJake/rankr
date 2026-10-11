import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { getItems, getList } from '../api.js'
import { compareMany } from '../compareMany.js'
import { Avatar, Empty, Spinner, TopBar } from '../components/ui.jsx'

const ID = /^[0-9a-f-]{36}$/i

export default function MultiComparePage() {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const toast = useToast()
  const ids = useMemo(() => (params.get('lists') || '').split(',').filter((x) => ID.test(x)).slice(0, 6), [params])
  const [data, setData] = useState(undefined) // undefined loading, null failed
  const [showSingles, setShowSingles] = useState(false)
  const [view, setView] = useState('table') // table | side

  useEffect(() => {
    if (ids.length < 2) {
      setData(null)
      return undefined
    }
    let cancelled = false
    setData(undefined)
    Promise.all(ids.map((id) => Promise.all([getList(id), getItems(id)])))
      .then((all) => {
        if (cancelled) return
        setData(all.every(([l]) => l) ? all.map(([list, items]) => ({ list, items })) : null)
      })
      .catch(() => {
        if (!cancelled) {
          toast('Could not load the comparison')
          setData(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [ids, toast])

  const result = useMemo(() => (data ? compareMany(data) : null), [data])

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
        <Empty title="Can't compare these lists">Pick at least two lists. Some may be private or no longer exist.</Empty>
      </>
    )
  }

  const who = data.map(({ list }) => (list.owner_id === user.id ? 'You' : list.owner?.display_name || list.owner?.username || 'Friend'))
  const short = (name) => (name.length > 7 ? `${name.slice(0, 6)}…` : name)
  const gridStyle = { '--n': data.length }

  const header = (
    <div className="mc-row mc-head" style={gridStyle}>
      <span className="muted small">Item</span>
      {data.map(({ list }, i) => (
        <span key={list.id} className="mc-col-head" title={`${who[i]}: ${list.title}`}>
          <Avatar profile={list.owner} size={26} />
          <span>{short(who[i])}</span>
        </span>
      ))}
    </div>
  )

  const section = (title, rows, note) =>
    rows.length > 0 && (
      <section className="section">
        <h2 className="section-title">
          {title} ({rows.length})
        </h2>
        {note && <p className="muted small pad">{note}</p>}
        <div className="mc-table">
          {header}
          {rows.map((r) => {
            const best = Math.min(...r.ranks.filter((x) => x !== null))
            const allSame = r.present > 1 && r.ranks.filter((x) => x !== null).every((x) => x === best)
            return (
              <div key={`${r.firstList}-${r.title}-${r.ranks.join('.')}`} className={allSame ? 'mc-row mc-same' : 'mc-row'} style={gridStyle}>
                <span className="mc-title">{r.title}</span>
                {r.ranks.map((rank, i) => (
                  <span key={i} className={rank === null ? 'mc-rank none' : rank === best && r.present > 1 ? 'mc-rank best' : 'mc-rank'}>
                    {rank === null ? '–' : `#${rank}`}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      </section>
    )

  const titles = [...new Set(data.map(({ list }) => list.title))]

  return (
    <>
      <TopBar back title="Compare" subtitle={titles.length === 1 ? `${titles[0]} · ${data.length} lists` : `${data.length} lists`} />

      <section className="section">
        <h2 className="section-title">Who matches who</h2>
        <div className="mc-pairs">
          {result.pairs.map((p) => (
            <div key={`${p.a}-${p.b}`} className="mc-pair">
              <span>
                {who[p.a]} &amp; {who[p.b]}
              </span>
              <b>{p.match}%</b>
            </div>
          ))}
        </div>
      </section>

      {(result.groupFavorite || result.mostDivisive) && (
        <section className="highlights">
          {result.groupFavorite && (
            <div className="highlight">
              <span className="label">Everyone&rsquo;s favorite</span>
              <b>{result.groupFavorite.title}</b>
              <span className="muted small">Highest on average across all {data.length} lists</span>
            </div>
          )}
          {result.mostDivisive && (
            <div className="highlight">
              <span className="label">Biggest disagreement</span>
              <b>{result.mostDivisive.title}</b>
              <span className="muted small">Ranked very differently by different people</span>
            </div>
          )}
        </section>
      )}

      <div className="segmented tabs">
        <button className={view === 'table' ? 'seg on' : 'seg'} onClick={() => setView('table')}>
          In common
        </button>
        <button className={view === 'side' ? 'seg on' : 'seg'} onClick={() => setView('side')}>
          Side by side
        </button>
      </div>

      {view === 'side' && (
        <>
          <p className="muted small pad">
            Darker means the item is on every list, dashed means some lists, faded means just one.
          </p>
          <div className="mc-side-scroll">
            <div className="mc-side" style={gridStyle}>
              {data.map(({ list, items }, li) => (
                <div className="side-col" key={list.id}>
                  <h3 className="mc-side-head">
                    <Avatar profile={list.owner} size={26} />
                    <span>{who[li]}</span>
                  </h3>
                  <ol>
                    {items.map((item, i) => {
                      const p = result.presence[li][i]
                      return (
                        <li key={item.id} className={p === data.length ? 'shared' : p > 1 ? 'similar' : 'only'}>
                          <b>{i + 1}</b>
                          <span>{item.title}</span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {view === 'table' && (
        <>
      {section(`On all ${data.length} lists`, result.everyone, 'Best average rank first. Gold means the highest rank for that item.')}
      {section('On some lists', result.some)}

      {result.single.length > 0 && (
        <section className="section">
          <button className="btn block" onClick={() => setShowSingles((v) => !v)}>
            {showSingles ? 'Hide' : 'Show'} items only one person has ({result.single.length})
          </button>
          {showSingles && <div className="spaced">{section('Only on one list', result.single)}</div>}
        </section>
      )}

      {view === "table" && result.everyone.length + result.some.length === 0 && <Empty title="Nothing in common yet">None of these lists share an item.</Empty>}
        </>
      )}

    </>
  )
}