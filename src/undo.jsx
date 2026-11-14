import { useEffect, useRef, useState } from 'react'
import { Modal } from './components/ui.jsx'

// Shake to undo. The iPhone app tells the page about a shake (see ios/App/App/AppDelegate.swift);
// the screen you're on decides what "undo" means by calling useShakeUndo().

let current = null // { label, run } for the screen on display, or null

// handler: { label: 'Undo Move', run: () => ... } when there is something to undo, else null
export function useShakeUndo(handler) {
  const ref = useRef(null)
  ref.current = handler
  useEffect(() => {
    const entry = { get label() { return ref.current?.label }, run: () => ref.current?.run(), get active() { return Boolean(ref.current) } }
    current = entry
    return () => {
      if (current === entry) current = null
    }
  }, [])
}

// Shows the classic "Undo Move? Cancel / Undo" box after a shake.
export function ShakeToUndo() {
  const [label, setLabel] = useState(null)
  useEffect(() => {
    const onShake = () => {
      if (current?.active) setLabel(current.label)
    }
    window.addEventListener('rankr:shake', onShake)
    return () => window.removeEventListener('rankr:shake', onShake)
  }, [])
  return (
    <Modal
      open={Boolean(label)}
      title={label ? `${label}?` : ''}
      onClose={() => setLabel(null)}
      actions={
        <>
          <button className="btn" onClick={() => setLabel(null)}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setLabel(null)
              current?.run()
            }}
          >
            Undo
          </button>
        </>
      }
    />
  )
}
