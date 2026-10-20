import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Icon, Paper, RansomText, Sparkle } from '../components/Scrapbook'
import { useCloset } from '../state/ClosetContext'

/** The sign-in note. `embedded` puts it inside the scrapbook (for owner-only pages) instead of a full screen. */
export default function Login({ embedded = false, reason }: { embedded?: boolean; reason?: string }) {
  const Wrapper = embedded ? 'div' : 'main'
  const { signIn } = useCloset()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Wrapper className={`login-page${embedded ? ' embedded' : ''}`} id={embedded ? undefined : 'main'}>
      {!embedded && (
        <>
          <Icon name="butterfly" className="float-icon s1" />
          <Sparkle className="float-sparkle s2" />
          <h1 className="login-logo">
            <RansomText text="ARYN'S" />
            <span className="logo-script">Closet</span>
          </h1>
        </>
      )}
      <Paper kind="sticky" tone="pink" label="members only ♡" className="login-window">
        {reason && <p className="login-reason">{reason}</p>}
        <form onSubmit={submit}>
          <label>
            <span>Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="cta-button" disabled={busy}>
            {busy ? 'Opening…' : 'Open my closet'}
          </button>
        </form>
      </Paper>
      {embedded && <Link to="/">← Back to the lookbook</Link>}
    </Wrapper>
  )
}
