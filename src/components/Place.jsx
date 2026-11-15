import { useState } from 'react'
import { Sheet } from './ui.jsx'

// ---------- Finding places (Photon: free OpenStreetMap search, no key needed) ----------

const PHOTON = 'https://photon.komoot.io'

// "Mount Tamalpais State Park" + "Marin, California" from a Photon result
function describe(p) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  const name = p.name || street || p.city || 'Pinned place'
  const area = [p.name && street ? street : '', p.city || p.county, p.state, p.countrycode === 'US' ? '' : p.country]
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i && x !== name)
    .join(', ')
  return { name, area }
}

const toPlace = (f) => {
  const { name, area } = describe(f.properties || {})
  const [lng, lat] = f.geometry?.coordinates || []
  return { name, area, lat, lng }
}

export async function searchPlaces(query, near) {
  const params = new URLSearchParams({ q: query, limit: '6' })
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lon', String(near.lng))
  }
  const res = await fetch(`${PHOTON}/api/?${params}`)
  if (!res.ok) throw new Error('search failed')
  const data = await res.json()
  return (data.features || []).map(toPlace).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
}

async function nameForPoint(lat, lng) {
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lng}&limit=1`)
    const data = await res.json()
    const f = data.features?.[0]
    if (f) return describe(f.properties || {}).name
  } catch {
    /* fall through */
  }
  return 'Pinned location'
}

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  })
}

// ---------- Opening directions ----------

const MAPS = {
  apple: {
    name: 'Apple Maps',
    url: (p) => `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`,
  },
  google: {
    name: 'Google Maps',
    url: (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`,
  },
  waze: {
    name: 'Waze',
    url: (p) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`,
  },
}
// a place with only a name (no map point) opens a search instead
const searchUrl = {
  apple: (p) => `https://maps.apple.com/?q=${encodeURIComponent(p.name)}`,
  google: (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}`,
  waze: (p) => `https://waze.com/ul?q=${encodeURIComponent(p.name)}&navigate=yes`,
}
const urlFor = (app, p) => (Number.isFinite(p.lat) ? MAPS[app].url(p) : searchUrl[app](p))

const PREF_KEY = 'rankr:maps-app'
export const MAPS_APPS = Object.entries(MAPS).map(([id, m]) => ({ id, name: m.name }))
export function getMapsApp() {
  try {
    return localStorage.getItem(PREF_KEY) || ''
  } catch {
    return ''
  }
}
export function setMapsApp(id) {
  try {
    if (id) localStorage.setItem(PREF_KEY, id)
    else localStorage.removeItem(PREF_KEY)
  } catch {
    /* ignore */
  }
}

function openMaps(app, place) {
  // a new tab on the web; in the iPhone app the link opens the maps app itself
  window.open(urlFor(app, place), '_blank', 'noopener')
}

// item -> { name, lat, lng } or null
export const placeOf = (item) =>
  item?.place_name ? { name: item.place_name, lat: item.place_lat ?? NaN, lng: item.place_lng ?? NaN } : null

// The 📍 chip on an item. Tapping it opens directions (asking which maps app the first time).
export function PlaceChip({ item }) {
  const [choosing, setChoosing] = useState(false)
  const [remember, setRemember] = useState(true)
  const place = placeOf(item)
  if (!place) return null

  function tap(e) {
    e.preventDefault()
    e.stopPropagation()
    const app = getMapsApp()
    if (app && MAPS[app]) openMaps(app, place)
    else setChoosing(true)
  }

  return (
    <>
      <button type="button" className="place-chip" onClick={tap} aria-label={`Directions to ${place.name}`}>
        <span aria-hidden="true">📍</span>
        <span className="place-chip-name">{place.name}</span>
      </button>
      <Sheet open={choosing} onClose={() => setChoosing(false)} title={`Directions to ${place.name}`}>
        <div className="pick-list">
          {MAPS_APPS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="pick-row action-row"
              onClick={() => {
                if (remember) setMapsApp(m.id)
                setChoosing(false)
                openMaps(m.id, place)
              }}
            >
              <span className="pick-title">{m.name}</span>
            </button>
          ))}
        </div>
        <label className="check-row place-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="small">Remember my choice (change it any time on the Me tab)</span>
        </label>
      </Sheet>
    </>
  )
}

// ---------- Picking a place in the item editor ----------

// onChange({ place_name, place_lat, place_lng }) saves it; pass nulls to remove.
export function PlaceField({ item, onChange, onError }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState('') // 'search' | 'here'
  const place = placeOf(item)

  async function search(e) {
    e?.preventDefault()
    const q = query.trim()
    if (q.length < 2 || busy) return
    setBusy('search')
    try {
      setResults(await searchPlaces(q))
    } catch {
      onError('Could not search for places. Check your connection.')
    } finally {
      setBusy('')
    }
  }

  async function useHere() {
    if (busy) return
    setBusy('here')
    try {
      const { lat, lng } = await currentPosition()
      const name = await nameForPoint(lat, lng)
      onChange({ place_name: name, place_lat: lat, place_lng: lng })
      setResults(null)
    } catch (err) {
      onError(err?.code === 1 ? 'Allow location access to use where you are' : 'Could not find your location')
    } finally {
      setBusy('')
    }
  }

  function pick(p) {
    onChange({ place_name: p.name.slice(0, 200), place_lat: p.lat, place_lng: p.lng })
    setResults(null)
    setQuery('')
  }

  return (
    <div className="field">
      <span className="label">Location (optional)</span>
      {place && (
        <div className="photo-row">
          <PlaceChip item={item} />
          <button type="button" className="btn small" onClick={() => onChange({ place_name: null, place_lat: null, place_lng: null })}>
            Remove
          </button>
        </div>
      )}
      {/* a div, not a form: this sits inside the item's edit form */}
      <div className="place-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search(e)
          }}
          placeholder={place ? 'Search for a different place' : 'Search for a place'}
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Search for a place"
        />
        <button type="button" className="btn small" onClick={search} disabled={query.trim().length < 2 || Boolean(busy)}>
          {busy === 'search' ? '...' : 'Search'}
        </button>
      </div>
      <button type="button" className="text-btn place-here" onClick={useHere} disabled={Boolean(busy)}>
        {busy === 'here' ? 'Finding you...' : '📍 Use my current location'}
      </button>
      {results && results.length === 0 && <p className="muted small">No places found. Try adding a city or state.</p>}
      {results && results.length > 0 && (
        <div className="pick-list">
          {results.map((p, i) => (
            <button key={`${p.lat},${p.lng},${i}`} type="button" className="pick-row place-result" onClick={() => pick(p)}>
              <span className="pick-title">
                {p.name}
                {p.area && <span className="muted small place-area">{p.area}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      <span className="muted small">Friends who can see this list can see the location.</span>
    </div>
  )
}
