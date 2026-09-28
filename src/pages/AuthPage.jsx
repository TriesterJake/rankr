import { useState } from 'react'
import { supabase, configured } from '../supabase.js'
import { usernameAvailable } from '../api.js'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export function SetupNeeded() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="brand">RankR</h1>
        <h2>Almost there</h2>
        <p className="muted">
          The app can't find your Supabase project yet. Copy <code>.env.example</code> to <code>.env.local</code>, paste in your
          project URL and anon key, then restart the dev server. The README walks through it.
        </p>
      </div>
    </div>
  )
}

export function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (password.length < 6) return setError('Use at least 6 characters.')
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) return setError(err.message)
    onDone()
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card form" onSubmit={submit}>
        <h1 className="brand">RankR</h1>
        <h2>Choose a new password</h2>
        <label className="field">
          <span className="label">New password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Saving...' : 'Save password'}
        </button>
      </form>
    </div>
  )
}

export default function AuthPage() {
  const [mode, setMode] = useState('signin') // signin | signup | forgot
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setInfo('')
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!configured) return setError('Supabase is not configured yet.')
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (err) throw err
      } else if (mode === 'signup') {
        const uname = username.trim().toLowerCase()
        if (!USERNAME_RE.test(uname)) throw new Error('Username must be 3-20 characters: letters, numbers or underscores.')
        if (password.length < 6) throw new Error('Password needs at least 6 characters.')
        const free = await usernameAvailable(uname)
        if (!free) throw new Error('That username is taken. Try another one.')
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: uname, display_name: uname } },
        })
        if (err) throw err
        if (!data.session) {
          setInfo('Check your email for a confirmation link, then come back and sign in.')
          setMode('signin')
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        })
        if (err) throw err
        setInfo('If that email has an account, a reset link is on its way.')
        setMode('signin')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card form" onSubmit={submit}>
        <h1 className="brand">RankR</h1>
        <p className="muted tagline">Rank your favorite things. Compare with friends.</p>

        <h2>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset your password'}</h2>

        {mode === 'signup' && (
          <label className="field">
            <span className="label">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="how friends will find you"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              maxLength={20}
              required
            />
          </label>
        )}

        <label className="field">
          <span className="label">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>

        {mode !== 'forgot' && (
          <label className="field">
            <span className="label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
          </label>
        )}

        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}

        <button className="btn primary block" disabled={busy}>
          {busy ? 'One sec...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>

        <div className="auth-links">
          {mode === 'signin' && (
            <>
              <button type="button" className="text-btn" onClick={() => switchMode('signup')}>
                New here? Create an account
              </button>
              <button type="button" className="text-btn muted" onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            </>
          )}
          {mode !== 'signin' && (
            <button type="button" className="text-btn" onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
