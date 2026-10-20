import type { ReactNode } from 'react'
import Login from '../pages/Login'
import { useCloset } from '../state/ClosetContext'

/** Pages only the owner can use. Visitors get the sign-in note instead; the page appears once signed in. */
export default function OwnerOnly({ children, reason = 'Only Aryn can do that. Sign in to continue.' }: { children: ReactNode; reason?: string }) {
  const { canEdit } = useCloset()
  return canEdit ? children : <Login embedded reason={reason} />
}
