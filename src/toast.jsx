import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { isOffline } from './online.js'

const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

// toast('Saved')  or  toast('Moved to #3', { action: { label: 'Undo', onClick }, duration: 6000 })
export function ToastProvider({ children }) {
  const [current, setCurrent] = useState(null) // { text, action }
  const timer = useRef(null)

  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setCurrent(null)
  }, [])

  const toast = useCallback((text, { action = null, duration } = {}) => {
    // offline, every "Could not save / load / ..." has the same real reason: say that instead
    if (isOffline() && /^Could not\b/i.test(text)) text = 'You’re offline. Try again when you’re connected.'
    setCurrent({ text, action })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCurrent(null), duration ?? (action ? 6000 : 2600))
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {current && (
        <div className={current.action ? 'toast has-action' : 'toast'} role="status">
          <span>{current.text}</span>
          {current.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                hide()
                current.action.onClick()
              }}
            >
              {current.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}
