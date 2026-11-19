import { useState } from 'react'
import { useAuth } from '../AuthContext.jsx'
import { supabase, configured } from '../supabase.js'
import { acceptTerms, deleteMyAccount, isClean, usernameAvailable } from '../api.js'
import { LegalLinks, LegalSheet } from './LegalPage.jsx'

// A password box with an eye button to show or hide what you typed.
function PasswordInput(props) {
  const [show, setShow] = useState(false)
  return (
    <span className="password-box">
      <input {...props} type={show ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        className="password-eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  )
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/
const MIN_AGE = 13

// Whole years between a "YYYY-MM-DD" birthday and today.
function ageOn(birthday) {
  const [y, m, d] = birthday.split('-').map(Number)
  if (!y || !m || !d) return NaN
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1
  return age
}

const today = () => new Date().toISOString().slice(0, 10)

// A friendly message when the birthday can't be right, otherwise ''.
function birthdayProblem(birthday) {
  const age = ageOn(birthday || '')
  if (Number.isNaN(age)) return 'Enter your birthday.'
  if (age < 0) return 'That birthday is in the future. Double-check the year.'
  if (age > 120) return 'Over 120 years old? Impressive, but probably not. Double-check the year.'
  return ''
}

// Birthday + "I agree" checkbox. Used at sign-up, and once for accounts made before the terms existed.
function AgeAndTerms({ birthday, setBirthday, agreed, setAgreed }) {
  const [reading, setReading] = useState(null)
  return (
    <>
      <label className="field">
        <span className="label">Birthday</span>
        <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} max={today()} min="1900-01-01" required />
        <span className="muted small">Only used to check your age. It isn&rsquo;t saved.</span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
        <span className="small">
          I agree to the{' '}
          <button type="button" className="inline-link" onClick={() => setReading('terms')}>
            Terms of Use
          </button>{' '}
          and{' '}
          <button type="button" className="inline-link" onClick={() => setReading('privacy')}>
            Privacy Policy
          </button>
          .
        </span>
      </label>
      <LegalSheet page={reading} onClose={() => setReading(null)} />
    </>
  )
}

function TooYoung({ children }) {
  return (
    <>
      <h2>Sorry, you can&rsquo;t use RankR yet</h2>
      <p className="muted">RankR is for people {MIN_AGE} and older.</p>
      {children}
    </>
  )
}

// Accounts made before the Terms existed agree to them once.
export function TermsGate({ userId, onDone, onSignOut }) {
  const [birthday, setBirthday] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [young, setYoung] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    const problem = birthdayProblem(birthday)
    if (problem) return setError(problem)
    if (ageOn(birthday) < MIN_AGE) return setYoung(true)
    if (!agreed) return setError('Please agree to continue.')
    setBusy(true)
    try {
      await acceptTerms()
      await onDone()
    } catch {
      setError('Could not save. Try again.')
      setBusy(false)
    }
  }

  async function deleteAccount() {
    setBusy(true)
    try {
      await deleteMyAccount(userId)
    } catch {
      setError('Could not delete the account. Email us and we will do it.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card form" onSubmit={submit}>
        <h1 className="brand">RankR</h1>
        {young ? (
          <TooYoung>
            <p className="muted">Your account and everything in it will be deleted.</p>
            <button type="button" className="btn danger block" onClick={deleteAccount} disabled={busy}>
              {busy ? 'Deleting...' : 'Delete my account'}
            </button>
          </TooYoung>
        ) : (
          <>
            <h2>A quick update</h2>
            <p className="muted">
              RankR now has Terms of Use and a Privacy Policy, and is for people {MIN_AGE} and older. Please confirm to keep going. Your lists
              and friends are all still here.
            </p>
            <AgeAndTerms birthday={birthday} setBirthday={setBirthday} agreed={agreed} setAgreed={setAgreed} />
            {error && <p className="error">{error}</p>}
            <button className="btn primary block" disabled={busy}>
              {busy ? 'Saving...' : 'Continue'}
            </button>
          </>
        )}
        {error && young && <p className="error">{error}</p>}
        <div className="auth-links">
          <button type="button" className="text-btn muted" onClick={onSignOut}>
            Sign out
          </button>
        </div>
        <LegalLinks />
      </form>
    </div>
  )
}

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
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
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
  const { startRecovery, finishRecovery } = useAuth()
  const [mode, setMode] = useState('signin') // signin | signup | forgot | verify | resetcode
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [birthday, setBirthday] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [young, setYoung] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setInfo('')
    setCode('')
  }

  async function resendCode() {
    setError('')
    setInfo('')
    const { error: err } =
      mode === 'verify'
        ? await supabase.auth.resend({ type: 'signup', email: email.trim() })
        : await supabase.auth.resetPasswordForEmail(email.trim())
    if (err) return setError(err.message)
    setInfo('A new code is on its way.')
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!configured) return setError('Supabase is not configured yet.')
    setBusy(true)
    try {
      if (mode === 'verify') {
        // Proves the person owns this inbox. On success they are signed in automatically.
        const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'signup' })
        if (err) throw new Error('That code is wrong or has expired. Check it, or ask for a new one.')
      } else if (mode === 'resetcode') {
        startRecovery() // so the "choose a new password" screen shows as soon as the code checks out
        const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' })
        if (err) {
          finishRecovery()
          throw new Error('That code is wrong or has expired. Check it, or ask for a new one.')
        }
      } else if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (err) {
          if (/not confirmed/i.test(err.message)) {
            await supabase.auth.resend({ type: 'signup', email: email.trim() }).catch(() => {})
            setMode('verify')
            setInfo('Your email isn\'t confirmed yet. We sent you a code.')
            return
          }
          throw err
        }
      } else if (mode === 'signup') {
        const uname = username.trim().toLowerCase()
        if (!USERNAME_RE.test(uname)) throw new Error('Username must be 3-20 characters: letters, numbers or underscores.')
        if (password.length < 6) throw new Error('Password needs at least 6 characters.')
        const problem = birthdayProblem(birthday)
        if (problem) throw new Error(problem)
        if (ageOn(birthday) < MIN_AGE) {
          setYoung(true)
          return
        }
        if (!agreed) throw new Error('Please agree to the Terms of Use and Privacy Policy.')
        const allowed = await isClean(uname.replace(/_/g, ' ')).catch(() => true) // the database checks again
        if (!allowed) throw new Error('That username isn’t allowed. Please pick a different one.')
        const free = await usernameAvailable(uname)
        if (!free) throw new Error('That username is taken. Try another one.')
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: uname, display_name: uname, terms_accepted: true } },
        })
        if (err) {
          if (/database error/i.test(err.message)) throw new Error('That username isn’t allowed. Please pick a different one.')
          throw err
        }
        if (!data.session) {
          setMode('verify')
          setInfo(`We sent a code to ${email.trim()}. Enter it to finish creating your account.`)
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim())
        if (err) throw err
        setMode('resetcode')
        setInfo('If that email has an account, a code is on its way. Enter it below.')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (young) {
    return (
      <div className="auth-wrap">
        <div className="auth-card form">
          <h1 className="brand">RankR</h1>
          <TooYoung />
          <LegalLinks />
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card form" onSubmit={submit}>
        <h1 className="brand">RankR</h1>
        <p className="muted tagline">Rank your favorite things. Compare with friends.</p>

        <h2>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : mode === 'verify' ? 'Confirm your email' : 'Reset your password'}
        </h2>

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
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            disabled={mode === 'verify' || mode === 'resetcode'}
            required
          />
        </label>

        {(mode === 'verify' || mode === 'resetcode') && (
          <label className="field">
            <span className="label">Code from your email</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              required
            />
          </label>
        )}

        {mode !== 'forgot' && mode !== 'verify' && mode !== 'resetcode' && (
          <label className="field">
            <span className="label">Password</span>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
          </label>
        )}

        {mode === 'signup' && <AgeAndTerms birthday={birthday} setBirthday={setBirthday} agreed={agreed} setAgreed={setAgreed} />}

        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}

        <button className="btn primary block" disabled={busy}>
          {busy
            ? 'One sec...'
            : mode === 'signin'
              ? 'Sign in'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'verify'
                  ? 'Confirm email'
                  : mode === 'resetcode'
                    ? 'Check code'
                    : 'Email me a code'}
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
          {(mode === 'verify' || mode === 'resetcode') && (
            <button type="button" className="text-btn muted" onClick={resendCode}>
              Send a new code
            </button>
          )}
          {mode !== 'signin' && (
            <button type="button" className="text-btn" onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          )}
        </div>
        <LegalLinks />
      </form>
    </div>
  )
}
