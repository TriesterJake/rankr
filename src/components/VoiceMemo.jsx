import { useEffect, useRef, useState } from 'react'
import { imageUrl } from '../images.js'

export const MAX_MEMO_SECONDS = 60

export const canRecord = () => typeof window !== 'undefined' && Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia)

// iPhones record AAC (.m4a), which plays everywhere. Prefer it on other browsers too when they can make it.
function pickFormat() {
  const options = [
    ['audio/mp4', 'm4a'],
    ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
    ['audio/aac', 'aac'],
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
  ]
  for (const [type, ext] of options) if (window.MediaRecorder.isTypeSupported?.(type)) return { type, ext }
  return { type: '', ext: 'm4a' }
}

export const formatSeconds = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Only one memo plays at a time.
let playing = null

// Small play/stop button with the memo's length.
export function VoicePlay({ path, seconds, label = 'voice memo' }) {
  const [on, setOn] = useState(false)
  const audio = useRef(null)

  useEffect(
    () => () => {
      audio.current?.pause()
      if (playing === audio.current) playing = null
    },
    [],
  )

  function toggle(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!audio.current) {
      audio.current = new Audio(imageUrl(path))
      audio.current.onended = () => setOn(false)
      audio.current.onpause = () => setOn(false)
      audio.current.onplay = () => setOn(true)
    }
    if (on) {
      audio.current.pause()
      return
    }
    if (playing && playing !== audio.current) playing.pause()
    playing = audio.current
    audio.current.currentTime = 0
    audio.current.play().catch(() => setOn(false))
  }

  return (
    <button type="button" className={on ? 'voice-play on' : 'voice-play'} onClick={toggle} aria-label={on ? `Stop ${label}` : `Play ${label}`}>
      {on ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13a1 1 0 001.5.86l11-6.5a1 1 0 000-1.72l-11-6.5A1 1 0 008 5.5z" />
        </svg>
      )}
      <span>{seconds ? formatSeconds(seconds) : 'Memo'}</span>
    </button>
  )
}

// Record / stop / replace / remove, for the item edit panel.
// onSave(blob, seconds, { type, ext }) uploads it; onRemove() takes it off the item.
export function VoiceMemoField({ item, busy, onSave, onRemove, onError }) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const rec = useRef(null) // { recorder, stream, timer, started }

  useEffect(
    () => () => {
      // leaving mid-recording: stop the microphone, keep nothing
      const r = rec.current
      if (r) {
        r.cancelled = true
        clearInterval(r.timer)
        if (r.recorder.state !== 'inactive') r.recorder.stop()
        r.stream.getTracks().forEach((t) => t.stop())
      }
    },
    [],
  )

  async function start() {
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      onError(err?.name === 'NotAllowedError' ? 'Allow microphone access to record a voice memo' : 'Could not use the microphone')
      return
    }
    const format = pickFormat()
    let recorder
    try {
      recorder = format.type ? new MediaRecorder(stream, { mimeType: format.type }) : new MediaRecorder(stream)
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      onError('Recording isn’t supported here')
      return
    }
    const chunks = []
    const r = { recorder, stream, started: Date.now(), cancelled: false }
    rec.current = r
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.onstop = () => {
      clearInterval(r.timer)
      stream.getTracks().forEach((t) => t.stop())
      rec.current = null
      setRecording(false)
      if (r.cancelled) return
      const seconds = Math.min(MAX_MEMO_SECONDS, Math.max(1, Math.round((Date.now() - r.started) / 1000)))
      const type = recorder.mimeType || format.type || 'audio/mp4'
      const blob = new Blob(chunks, { type })
      if (blob.size < 500) return onError('That recording was too short')
      onSave(blob, seconds, { type: type.split(';')[0], ext: type.includes('webm') ? 'webm' : format.ext })
    }
    r.timer = setInterval(() => {
      const s = (Date.now() - r.started) / 1000
      setElapsed(s)
      if (s >= MAX_MEMO_SECONDS && recorder.state === 'recording') recorder.stop()
    }, 250)
    setElapsed(0)
    setRecording(true)
    recorder.start()
  }

  function stop() {
    if (rec.current?.recorder.state === 'recording') rec.current.recorder.stop()
  }

  if (!canRecord() && !item.audio_path) return null

  return (
    <div className="field">
      <span className="label">Voice memo (optional)</span>
      <div className="photo-row">
        {recording ? (
          <>
            <span className="rec-dot" aria-hidden="true" />
            <span className="rec-time">
              {formatSeconds(elapsed)} / {formatSeconds(MAX_MEMO_SECONDS)}
            </span>
            <button type="button" className="btn small primary" onClick={stop}>
              Stop
            </button>
          </>
        ) : busy ? (
          <span className="muted small">Saving...</span>
        ) : (
          <>
            {item.audio_path && <VoicePlay path={item.audio_path} seconds={item.audio_seconds} label={`voice memo for ${item.title}`} />}
            {canRecord() && (
              <button type="button" className="btn small" onClick={start}>
                {item.audio_path ? 'Re-record' : 'Record'}
              </button>
            )}
            {item.audio_path && (
              <button type="button" className="btn small" onClick={onRemove}>
                Remove
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
