import { useState, type FormEvent } from 'react'
import { Icon, Paper, RansomText, Sparkle } from '../components/Scrapbook'
import { useCloset } from '../state/ClosetContext'

export default function Login() {
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
    <main className="login-page" id="main">
      <Icon name="butterfly" className="float-icon s1" />
      <Sparkle className="float-sparkle s2" />
      <h1 className="login-logo">
        <RansomText text="ARYN'S" />
        <span className="logo-script">Closet</span>
      </h1>
      <Paper kind="sticky" tone="pink" label="members only ♡" className="login-window">
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
    </main>
  )
}
