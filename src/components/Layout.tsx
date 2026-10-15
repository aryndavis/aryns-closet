import { Link, NavLink, Outlet } from 'react-router-dom'
import { useCloset } from '../state/ClosetContext'
import { RansomText, Sparkle, Star } from './Scrapbook'

export default function Layout() {
  const { mode, outfits, items } = useCloset()
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Skip to content
      </a>
      <p className="ticker" aria-hidden="true">
        <span>✦ free shipping on everything already in your closet ✦ no returns needed ✦ new arrivals every time you get dressed ✦</span>
      </p>
      {mode === 'demo' && (
        <p className="demo-banner">
          <strong>Demo mode:</strong> photos stay in this browser only. Add your Supabase settings to sync (see the README).
        </p>
      )}
      <header className="site-header">
        <Link to="/" className="logo" aria-label="Aryn’s Closet, lookbook">
          <Star className="logo-star" color="pink" />
          <RansomText text="ARYN'S" className="logo-ransom" />
          <span className="logo-script" aria-hidden="true">
            Closet
          </span>
          <Sparkle className="logo-sparkle" />
        </Link>
        <nav className="main-nav" aria-label="Main">
          <NavLink to="/" end>
            Lookbook <span className="count">{outfits.length}</span>
          </NavLink>
          <NavLink to="/closet">
            Closet <span className="count">{items.length}</span>
          </NavLink>
          <NavLink to="/shuffle">Shuffle</NavLink>
        </nav>
        <Link to="/add" className="cta-button">
          + Add an outfit
        </Link>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>xoxo, aryn’s closet ♡ est. 2026</span>
      </footer>
    </>
  )
}
