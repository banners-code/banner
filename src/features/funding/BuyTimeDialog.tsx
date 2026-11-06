import { useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { X } from 'lucide-react'
import ManualFundingPanel from './ManualFundingPanel'

export default function BuyTimeDialog({
  user,
  onClose,
}: {
  user: User
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    const previousFocus = document.activeElement as HTMLElement | null
    node?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      node?.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="buy-time-dialog"
      aria-labelledby="buy-time-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header className="buy-time-dialog-heading">
        <div>
          <p className="tool-eyebrow">KINETELLE / YOUR LIVE TIME</p>
          <h2 id="buy-time-title">Buy AI time</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Buy AI time">
          <X size={20} />
        </button>
      </header>
      <div className="buy-time-dialog-body">
        <ManualFundingPanel user={user} inDialog />
      </div>
    </dialog>
  )
}
