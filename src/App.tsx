import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import OwnerOnly from './components/OwnerOnly'
import { CraftDesk, Icon, Paper } from './components/Scrapbook'
import AddOutfit from './pages/AddOutfit'
import Closet from './pages/Closet'
import ItemPage from './pages/ItemPage'
import Login from './pages/Login'
import Lookbook from './pages/Lookbook'
import NotFound from './pages/NotFound'
import OutfitPage from './pages/OutfitPage'
import Shuffle from './pages/Shuffle'
import SignIn from './pages/SignIn'
import { ClosetProvider, useCloset } from './state/ClosetContext'
import { ToastProvider } from './state/Toasts'

/** Shows the login, loading, or error screen until the closet is ready. */
function Gate() {
  const { status, error, reload, signOut, mode } = useCloset()
  if (status === 'signed-out') return <Login />
  if (status === 'loading') {
    return (
      <main className="loading-page" id="main" aria-busy="true">
        <Icon name="heart" className="spin-heart" />
        <p>Opening your closet…</p>
      </main>
    )
  }
  if (status === 'error') {
    return (
      <main className="loading-page" id="main">
        <Paper kind="sticky" tone="pink" label="uh oh!" className="narrow">
          <p>Couldn’t open your closet: {error}</p>
          <div className="form-buttons">
            <button type="button" className="cta-button" onClick={reload}>
              Try again
            </button>
            {mode === 'cloud' && (
              <button type="button" className="soft-button" onClick={() => signOut()}>
                Sign out
              </button>
            )}
          </div>
        </Paper>
      </main>
    )
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Lookbook />} />
        <Route
          path="add"
          element={
            <OwnerOnly reason="Only Aryn can add outfits. Sign in to continue.">
              <AddOutfit />
            </OwnerOnly>
          }
        />
        <Route path="outfit/:id" element={<OutfitPage />} />
        <Route path="closet" element={<Closet />} />
        <Route path="item/:id" element={<ItemPage />} />
        <Route path="shuffle" element={<Shuffle />} />
        <Route path="signin" element={<SignIn />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <CraftDesk />
      <ToastProvider>
        <ClosetProvider>
          <Gate />
        </ClosetProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
