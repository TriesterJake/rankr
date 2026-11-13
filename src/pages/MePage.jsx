import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../toast.jsx'
import { deleteMyAccount, getMyBlocks, unblockUser, updateProfile } from '../api.js'
import { isNative } from '../native.js'
import { removeImages, resizeImage, uploadItemImage } from '../images.js'
import { Avatar, TopBar } from '../components/ui.jsx'
import { SUPPORT_EMAIL } from './LegalPage.jsx'

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export default function MePage() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [ideasBusy, setIdeasBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [pendingEmail, setPendingEmail] = useState('') // set while waiting for the code
  const [emailCode, setEmailCode] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [blocks, setBlocks] = useState(null) // loaded when "Blocked people" is opened

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
    } catch (err) {
      toast(/inappropriate_name/.test(err?.message || '') ? 'That name isn’t allowed. Try a different one.' : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function changePhoto(file) {
    if (!profile) return
    setPhotoBusy(true)
    try {
      const blob = await resizeImage(file, 900, 0.82)
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

  async function toggleIdeas(on) {
    if (!profile) return
    setIdeasBusy(true)
    try {
      await updateProfile(profile.id, { show_in_ideas: on })
      await refreshProfile()
      toast(on ? 'Your list titles can be suggested again' : 'Your list titles are hidden from Ideas')
    } catch {
      toast('Could not save')
    } finally {
      setIdeasBusy(false)
    }
  }

  // Moving the account to a different email keeps every list, friend and photo: it is the same account.
  async function startEmailChange(e) {
    e.preventDefault()
    const addr = newEmail.trim()
    if (!addr) return
    setEmailBusy(true)
    setEmailError('')
    const { error } = await supabase.auth.updateUser({ email: addr })
    setEmailBusy(false)
    if (error) return setEmailError(error.message)
    setPendingEmail(addr)
  }

  async function confirmEmailChange(e) {
    e.preventDefault()
    setEmailBusy(true)
    setEmailError('')
    const { error } = await supabase.auth.verifyOtp({ email: pendingEmail, token: emailCode.trim(), type: 'email_change' })
    if (error) {
      setEmailBusy(false)
      return setEmailError('That code is wrong or has expired. Check it, or start again.')
    }
    await supabase.auth.refreshSession().catch(() => {})
    setEmailBusy(false)
    setPendingEmail('')
    setNewEmail('')
    setEmailCode('')
    toast('Email updated')
  }

  async function deleteAccount() {
    if (!user) return
    if (!window.confirm('Permanently delete your account, lists and photos? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteMyAccount(user.id)
    } catch {
      toast('Could not delete your account. Try again.')
      setDeleting(false)
    }
  }

  async function loadBlocks() {
    try {
      setBlocks(await getMyBlocks(true))
    } catch {
      setBlocks([])
    }
  }

  async function unblock(b) {
    try {
      await unblockUser(user.id, b.blocked_id)
      setBlocks((cur) => cur.filter((x) => x.blocked_id !== b.blocked_id))
      toast(`@${b.profile?.username ?? 'them'} is unblocked`)
    } catch {
      toast('Could not unblock')
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
        <Avatar profile={profile} size={64} zoom />
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

      <div className="card">
        <b>Email</b>
        <p className="muted small">
          {user?.email}
          {user?.email_confirmed_at ? ' · confirmed' : ''}
        </p>
        {!pendingEmail ? (
          <form className="form" onSubmit={startEmailChange}>
            <label className="field">
              <span className="label">Move my account to a new email</span>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                placeholder="new@example.com"
              />
            </label>
            <button className="btn small" disabled={emailBusy || !newEmail.trim()}>
              {emailBusy ? 'Sending...' : 'Send me a code'}
            </button>
          </form>
        ) : (
          <form className="form" onSubmit={confirmEmailChange}>
            <p className="muted small">We sent a code to {pendingEmail}. Enter it to switch your login to that address.</p>
            <label className="field">
              <span className="label">Code</span>
              <input
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\s/g, ''))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
              />
            </label>
            <button className="btn small primary" disabled={emailBusy || !emailCode.trim()}>
              {emailBusy ? 'Checking...' : 'Confirm new email'}
            </button>{' '}
            <button type="button" className="btn small" onClick={() => { setPendingEmail(''); setEmailCode(''); setEmailError('') }}>
              Cancel
            </button>
          </form>
        )}
        {emailError && <p className="error">{emailError}</p>}
      </div>

      <div className="card">
        <label className="toggle-row">
          <span>
            <b>Suggest my list titles on Ideas</b>
            <p className="muted small">
              Lets other people get ideas from your list titles (never items, and never &ldquo;Only me&rdquo; lists). Friends see your
              name; everyone else sees &ldquo;someone you don&rsquo;t know.&rdquo; You can also turn this off for one list in its settings.
            </p>
          </span>
          <input
            type="checkbox"
            checked={profile?.show_in_ideas !== false}
            disabled={!profile || ideasBusy}
            onChange={(e) => toggleIdeas(e.target.checked)}
          />
        </label>
      </div>

      {!isStandalone() && !isNative() && (
        <div className="card install-tip">
          <b>Put it on your home screen</b>
          <p className="muted small">
            On iPhone, open this page in Safari, tap the Share button, then choose &ldquo;Add to Home Screen.&rdquo; It will open full
            screen like a regular app.
          </p>
        </div>
      )}

      <details className="card small-section" onToggle={(e) => e.currentTarget.open && blocks === null && loadBlocks()}>
        <summary>Blocked people</summary>
        {blocks === null && <p className="muted small">Loading...</p>}
        {blocks && blocks.length === 0 && <p className="muted small">You haven&rsquo;t blocked anyone.</p>}
        {blocks && blocks.length > 0 && (
          <div className="pick-list blocked-list">
            {blocks.map((b) => (
              <div key={b.blocked_id} className="pick-row static">
                <Avatar profile={b.profile} size={32} />
                <span className="pick-title">@{b.profile?.username ?? 'deleted'}</span>
                <button className="btn small" onClick={() => unblock(b)}>
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </details>

      <details className="card small-section">
        <summary>Help &amp; legal</summary>
        <div className="help-links">
          <Link to="/support">Help &amp; support</Link>
          <Link to="/terms">Terms of Use</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <p className="muted small">
            Questions or problems? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </div>
      </details>

      <button className="btn block spaced" onClick={signOut}>
        Sign out
      </button>

      <details className="card danger-zone">
        <summary className="muted small">Delete my account</summary>
           <p className="muted small" style={{ margin: '12px 0 16px' }}>
          Permanently deletes your login, profile picture, lists, items and photos, and removes you from your friends&rsquo; lists.
          This cannot be undone.
        </p>
        <button className="btn danger block" onClick={deleteAccount} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete account'}
        </button>
      </details>
    </>
  )
}