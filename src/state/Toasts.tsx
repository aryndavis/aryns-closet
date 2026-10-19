import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Icon, Tape } from '../components/Scrapbook'
import { newId } from '../lib/ids'

type Toast = { id: string; title: string; message: string; tone: 'error' | 'info' }

interface ToastValue {
  notify: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastValue | null>(null)

/** Sticky notes taped in the corner. They stay until you close them (× button, "Got it", or Esc). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = (id: string) => setToasts((list) => list.filter((t) => t.id !== id))
  const notify = useCallback((toast: Omit<Toast, 'id'>) => setToasts((list) => [...list, { ...toast, id: newId() }]), [])

  useEffect(() => {
    if (!toasts.length) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setToasts((list) => list.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toasts.length])

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        {toasts.length > 1 && (
          <button type="button" className="toast-clear" onClick={() => setToasts([])}>
            Dismiss all ({toasts.length})
          </button>
        )}
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
            <Tape variant={1} className="toast-tape" />
            <button type="button" className="toast-close" aria-label={`Dismiss: ${toast.title}`} onClick={() => dismiss(toast.id)}>
              ×
            </button>
            <div className="toast-body">
              <Icon name={toast.tone === 'error' ? 'lips' : 'butterfly'} className="toast-icon" />
              <div>
                <p className="toast-title">{toast.title}</p>
                <p>{toast.message}</p>
              </div>
            </div>
            <button type="button" className="toast-ok" onClick={() => dismiss(toast.id)}>
              Got it <span aria-hidden="true">♡</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToasts() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToasts must be used inside ToastProvider')
  return value
}
