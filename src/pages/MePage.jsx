import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { updateProfile } from '../api.js'
import { Avatar, TopBar } from '../components/ui.jsx'

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export default function MePage() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [busy, setBusy] = useState(false)

  // the profile can finish loading after this page first renders
  useEffect(() => {
    setName(profile?.display_name ?? '')
  }, [profile?.display_name])

  async function save(e) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean || !profile) return
    setBusy(true)
    try {
      await updateProfile(profile.id, { display_name: clean })
      await refreshProfile()
      toast('Saved')
    } catch {
      toast('Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title="Me" />

      <div className="profile-head">
        <Avatar profile={profile} size={64} />
        <div>
          <b>{profile?.display_name || profile?.username}</b>
          <p className="muted small">@{profile?.username}</p>
          <p className="muted small">{user?.email}</p>
        </div>
      </div>

      <form className="form card" onSubmit={save}>
        <label className="field">
          <span className="label">Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" />
        </label>
        <button className="btn primary block" disabled={busy || !name.trim() || name.trim() === profile?.display_name}>
          {busy ? 'Saving...' : 'Save name'}
        </button>
      </form>

      {!isStandalone() && (
        <div className="card install-tip">
          <b>Put it on your home screen</b>
          <p className="muted small">
            On iPhone, open this page in Safari, tap the Share button, then choose &ldquo;Add to Home Screen.&rdquo; It will open full
            screen like a regular app.
          </p>
        </div>
      )}

      <button className="btn block spaced" onClick={signOut}>
        Sign out
      </button>
    </>
  )
}
