import { Suspense, type ReactNode } from 'react'
import Login from '../pages/Login'
import { useCloset } from '../state/ClosetContext'

/** Pages only the owner can use. Visitors get the sign-in note instead; the page appears once signed in (and loaded). */
export default function OwnerOnly({ children, reason = 'Only Aryn can do that. Sign in to continue.' }: { children: ReactNode; reason?: string }) {
  const { canEdit } = useCloset()
  if (!canEdit) return <Login embedded reason={reason} />
  return (
    <Suspense
      fallback={
        <p className="page-loading" role="status">
          Loading…
        </p>
      }
    >
      {children}
    </Suspense>
  )
}
