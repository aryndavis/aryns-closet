import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Paper, Polaroid, Sparkle, Sticker, Tape } from '../components/Scrapbook'
import { formatDate } from '../lib/dates'
import { CATEGORIES, CATEGORY_NAMES, type Category } from '../lib/types'
import { useCloset } from '../state/ClosetContext'
import { useToasts } from '../state/Toasts'
import NotFound from './NotFound'

export default function ItemPage() {
  const { id } = useParams()
  const { items, imageUrl, outfitsWithItem, updateItem, deleteItem, removeCutout, canEdit } = useCloset()
  const { notify } = useToasts()
  const navigate = useNavigate()
  const item = items.find((i) => i.id === id)
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState<Category>(item?.category ?? 'top')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmSwatch, setConfirmSwatch] = useState(false)

  if (!item) return <NotFound what="item" />
  const worn = outfitsWithItem(item.id).sort((a, b) => b.wornOn.localeCompare(a.wornOn))
  const dirty = name !== item.name || category !== item.category || notes !== item.notes

  const save = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await updateItem(item.id, { name: name.trim().slice(0, 120), category, notes: notes.trim().slice(0, 1000) })
      notify({ tone: 'info', title: 'Saved', message: `${name.trim() || CATEGORY_NAMES[category]} updated.` })
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t save changes', message: (e as Error).message })
    }
  }

  return (
    <article className="item-page" aria-labelledby="item-title">
      <p className="breadcrumb">
        <Link to="/closet">← Closet</Link>
      </p>
      <div className="item-layout">
        <div className="item-hero">
          <Sticker item={item} src={imageUrl(item.cutoutPath)} size="lg" />
          <Sparkle className="hero-sparkle" />
        </div>
        <div>
          <h1 id="item-title" className="item-title">
            {item.name || CATEGORY_NAMES[item.category]}
          </h1>
          <p className="item-meta">
            {CATEGORY_NAMES[item.category]} · {item.colorName && `${item.colorName} · `}worn {worn.length}×
          </p>
          {!canEdit ? (
            item.notes && (
              <p className="note-card">
                <Tape variant={1} />
                {item.notes}
              </p>
            )
          ) : (
            <Paper kind="note" label="edit this piece">
              <form className="edit-form" onSubmit={save}>
                <label>
                  <span>Name</span>
                  <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  <span>Category</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_NAMES[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Notes</span>
                  <textarea value={notes} maxLength={1000} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="thrifted! dry clean only. goes with everything." />
                </label>
                <div className="form-buttons">
                  <button type="submit" className="cta-button" disabled={!dirty}>
                    Save
                  </button>
                  {confirmDelete ? (
                    <span className="confirm">
                      Remove from your closet?
                      <button
                        type="button"
                        className="danger-button"
                        onClick={async () => {
                          try {
                            await deleteItem(item)
                            navigate('/closet', { replace: true })
                          } catch (e) {
                            notify({ tone: 'error', title: 'Couldn’t remove it', message: (e as Error).message })
                          }
                        }}
                      >
                        Yes, remove
                      </button>
                      <button type="button" className="soft-button" onClick={() => setConfirmDelete(false)}>
                        Keep it
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="soft-button" onClick={() => setConfirmDelete(true)}>
                      Remove item
                    </button>
                  )}
                </div>
              </form>
              {item.cutoutPath && (
                <div className="cutout-fix">
                  {confirmSwatch ? (
                    <span className="confirm">
                      Delete this cutout and show a color swatch instead?
                      <button
                        type="button"
                        className="danger-button"
                        onClick={async () => {
                          try {
                            await removeCutout(item)
                            setConfirmSwatch(false)
                            notify({ tone: 'info', title: 'Cutout removed', message: 'This piece shows as a color swatch now.' })
                          } catch (e) {
                            notify({ tone: 'error', title: 'Couldn’t remove the cutout', message: (e as Error).message })
                          }
                        }}
                      >
                        Yes, use a swatch
                      </button>
                      <button type="button" className="soft-button" onClick={() => setConfirmSwatch(false)}>
                        Keep it
                      </button>
                    </span>
                  ) : (
                    <>
                      <p>If the scanner made a mess of this cutout (dark clothes on a dark background are tricky), you can show a color swatch instead.</p>
                      <button type="button" className="soft-button" onClick={() => setConfirmSwatch(true)}>
                        Use a color swatch instead
                      </button>
                    </>
                  )}
                </div>
              )}
            </Paper>
          )}
        </div>
      </div>

      <section aria-labelledby="worn-title" className="worn-section">
        <h2 id="worn-title" className="section-title">
          Outfits with this piece
        </h2>
        {worn.length === 0 ? (
          <p>Not tagged in any outfits yet.</p>
        ) : (
          <ul className="mini-polaroids">
            {worn.map((outfit) => (
              <li key={outfit.id}>
                <Link to={`/outfit/${outfit.id}`}>
                  <Polaroid src={imageUrl(outfit.photoPath)} alt={`Outfit worn ${formatDate(outfit.wornOn)}`} seed={outfit.id} caption={formatDate(outfit.wornOn)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
