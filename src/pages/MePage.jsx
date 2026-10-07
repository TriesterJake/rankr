import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { updateProfile } from '../api.js'
import { removeImages, resizeImage, uploadItemImage } from '../images.js'
import { Avatar, TopBar } from '../components/ui.jsx'

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export default function MePage() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)

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

  async function changePhoto(file) {
    if (!profile) return
    setPhotoBusy(true)
    try {
      const blob = await resizeImage(file, 512, 0.85, true)
      const path = await uploadItemImage(profile.id, blob)
      const old = profile.avatar_path
      await updateProfile(profile.id, { avatar_path: path })
      await refreshProfile()
      if (old) removeImages([old])
      toast('Profile picture updated')
    } catch {
      toast('Could not update your picture')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto() {
    if (!profile?.avatar_path) return
    setPhotoBusy(true)
    try {
      const old = profile.avatar_path
      await updateProfile(profile.id, { avatar_path: null })
      await refreshProfile()
      removeImages([old])
    } catch {
      toast('Could not remove your picture')
    } finally {
      setPhotoBusy(false)
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

      <div className="photo-row avatar-actions">
        <label className={photoBusy ? 'btn small disabled' : 'btn small'}>
          {photoBusy ? 'Saving...' : profile?.avatar_path ? 'Change picture' : 'Add profile picture'}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={photoBusy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) changePhoto(file)
            }}
          />
        </label>
        {profile?.avatar_path && !photoBusy && (
          <button type="button" className="btn small" onClick={removePhoto}>
            Remove
          </button>
        )}
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