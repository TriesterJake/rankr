import { useState } from 'react'
import { useToast } from '../toast.jsx'
import { blockUser, reportContent } from '../api.js'
import { Modal, Sheet } from './ui.jsx'

// The small "..." button that opens more options.
export function MoreButton({ onClick, label = 'More options', small = false }) {
  return (
    <button type="button" className={small ? 'icon-btn more-btn small' : 'icon-btn more-btn'} onClick={onClick} aria-label={label}>
      <svg width={small ? 18 : 22} height={small ? 18 : 22} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
    </button>
  )
}

// A sheet of options. actions: [{ label, onClick, danger }]
export function ActionSheet({ open, onClose, title = 'Options', actions }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="pick-list">
        {actions.filter(Boolean).map((a) => (
          <button
            key={a.label}
            className={a.danger ? 'pick-row action-row danger-text' : 'pick-row action-row'}
            onClick={() => {
              onClose()
              a.onClick()
            }}
          >
            <span className="pick-title">{a.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

const REASONS = [
  ['sexual', 'Sexual or not OK for kids'],
  ['bullying', 'Bullying or harassment'],
  ['hate', 'Hate speech or symbols'],
  ['violence', 'Violence or self-harm'],
  ['spam', 'Spam or scam'],
  ['other', 'Something else'],
]

// target: { type: 'list' | 'profile' | 'idea', id, title, name } (name is what we call it on screen)
// Starts fresh every time it opens.
export const ReportSheet = (props) => (props.target ? <ReportForm {...props} /> : null)

function ReportForm({ target, onClose, onDone }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!reason || busy) return
    setBusy(true)
    try {
      await reportContent({ type: target.type, id: target.id ?? null, title: target.title ?? '', reason, details: details.trim() })
      toast('Thanks. We review every report within 24 hours.')
      onDone?.()
      onClose()
    } catch {
      toast('Could not send the report. Try again.')
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Report ${target.name}`}>
      <p className="muted small report-intro">
        Reports are private. The person won&rsquo;t know it was you.
        {target.type === 'idea' && ' This idea will also be hidden for you.'}
      </p>
      <div className="pick-list">
        {REASONS.map(([key, label]) => (
          <button key={key} type="button" className={reason === key ? 'pick-row picked' : 'pick-row'} onClick={() => setReason(key)} aria-pressed={reason === key}>
            <span className="pick-title">{label}</span>
            {reason === key && <span aria-hidden="true">&#10003;</span>}
          </button>
        ))}
      </div>
      <label className="field report-details">
        <span className="label">More details (optional)</span>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={3} placeholder="Which item or photo, or anything else we should know" />
      </label>
      <button className="btn primary block" disabled={!reason || busy} onClick={send}>
        {busy ? 'Sending...' : 'Send report'}
      </button>
    </Sheet>
  )
}

// "Block @name?" confirmation. profile: { id, username }
export const BlockModal = (props) => (props.profile ? <BlockConfirm {...props} /> : null)

function BlockConfirm({ profile, onClose, onBlocked }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function block() {
    setBusy(true)
    try {
      await blockUser(profile.id)
      toast(`@${profile.username} is blocked`)
      onClose()
      onBlocked?.()
    } catch {
      toast('Could not block. Try again.')
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={`Block @${profile.username}?`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" onClick={block} disabled={busy}>
            {busy ? 'Blocking...' : 'Block'}
          </button>
        </>
      }
    >
      <p className="muted">
        You&rsquo;ll stop being friends, they can&rsquo;t send you friend requests, and you won&rsquo;t see each other in search,
        suggestions or Ideas. They aren&rsquo;t told. You can unblock them any time from the Me tab.
      </p>
    </Modal>
  )
}
