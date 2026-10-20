import { Navigate } from 'react-router-dom'
import { useCloset } from '../state/ClosetContext'
import Login from './Login'

/** The header's "sign in" link. Once signed in, back to the lookbook. */
export default function SignIn() {
  const { canEdit } = useCloset()
  return canEdit ? <Navigate to="/" replace /> : <Login embedded reason="Sign in to add and edit outfits." />
}
