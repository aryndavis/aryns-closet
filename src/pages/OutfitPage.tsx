import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon, Paper, Polaroid, Sticker, Tape } from '../components/Scrapbook'
import { formatDate, today } from '../lib/dates'
import { CATEGORY_NAMES } from '../lib/types'
import { useCloset } from '../state/ClosetContext'
import { useToasts } from '../state/Toasts'
import NotFound from './NotFound'

export default function OutfitPage() {
  const { id } = useParams()
  const { outfits, imageUrl, itemsInOutfit, updateOutfit, deleteOutfit } = useCloset()
  const { notify } = useToasts()
  const navigate = useNavigate()
  const outfit = outfits.find((o) => o.id === id)
  const [editing, setEditing] = useState(false)
  const [wornOn, setWornOn] = useState(outfit?.wornOn ?? today())
  const [caption, setCaption] = useState(outfit?.caption ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!outfit) return <NotFound what="outfit" />
  const pieces = itemsInOutfit(outfit.id)

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!wornOn || wornOn > today()) return notify({ tone: 'error', title: 'Check the date', message: 'Pick the day you wore it (not in the future).' })
    try {
      await updateOutfit(outfit.id, { wornOn, caption: caption.trim().slice(0, 500) })
      setEditing(false)
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t save changes', message: (e as Error).message })
    }
  }

  return (
    <article className="outfit-page" aria-labelledby="outfit-title">
      <p className="breadcrumb">
        <Link to="/">← Lookbook</Link>
      </p>
      <div className="outfit-layout">
        <div className="outfit-photo">
          <Polaroid src={imageUrl(outfit.photoPath)} alt={`Outfit worn ${formatDate(outfit.wornOn)}`} seed={outfit.id} className="polaroid-large" caption={outfit.caption || 'fit check'} />
          <Icon name="heart" className="corner-icon" />
        </div>

        <div className="outfit-info">
          <h1 id="outfit-title" className="ticket">
            <span className="ticket-label">worn on</span>
            {formatDate(outfit.wornOn)}
          </h1>

          {editing ? (
            <form className="edit-form" onSubmit={save}>
              <label>
                <span>Worn on</span>
                <input type="date" value={wornOn} max={today()} onChange={(e) => setWornOn(e.target.value)} required />
              </label>
              <label>
                <span>Caption</span>
                <input value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} />
              </label>
              <div className="form-buttons">
                <button type="submit" className="cta-button">
                  Save
                </button>
                <button type="button" className="soft-button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <p className="note-card">
              <Tape variant={2} />
              {outfit.caption || 'No caption yet.'}
            </p>
          )}

          <Paper kind="note" label="pieces in this fit">
            {pieces.length === 0 ? (
              <p>No pieces tagged in this outfit.</p>
            ) : (
              <ul className="piece-list">
                {pieces.map((item) => (
                  <li key={item.id}>
                    <Link to={`/item/${item.id}`}>
                      <Sticker item={item} src={imageUrl(item.cutoutPath)} size="sm" />
                      <span>
                        <strong>{item.name || CATEGORY_NAMES[item.category]}</strong>
                        <small>{CATEGORY_NAMES[item.category]}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Paper>

          <div className="form-buttons">
            {!editing && (
              <button type="button" className="soft-button" onClick={() => setEditing(true)}>
                ✎ Edit date & caption
              </button>
            )}
            {confirmDelete ? (
              <span className="confirm">
                Delete this outfit photo? (Pieces stay in your closet.)
                <button
                  type="button"
                  className="danger-button"
                  onClick={async () => {
                    try {
                      await deleteOutfit(outfit)
                      navigate('/', { replace: true })
                    } catch (e) {
                      notify({ tone: 'error', title: 'Couldn’t delete it', message: (e as Error).message })
                    }
                  }}
                >
                  Yes, delete
                </button>
                <button type="button" className="soft-button" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
              </span>
            ) : (
              <button type="button" className="soft-button" onClick={() => setConfirmDelete(true)}>
                Delete outfit
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
