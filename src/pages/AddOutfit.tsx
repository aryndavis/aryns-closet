import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Paper, Polaroid, RansomText } from '../components/Scrapbook'
import { today } from '../lib/dates'
import { preparePhoto } from '../lib/images'
import { CATEGORIES, CATEGORY_NAMES, type Category } from '../lib/types'
import { useCloset } from '../state/ClosetContext'
import { useToasts } from '../state/Toasts'
import type { Detection } from '../vision/protocol'
import { scanOutfit, type ScanProgress } from '../vision/scanner'

type Draft = {
  key: string
  detection: Detection
  previewUrl: string
  include: boolean
  category: Category
  name: string
  /** '' = add as a new item; otherwise the id of an item already in the closet. */
  sameAs: string
}

type Step = { name: 'pick' } | { name: 'scanning'; progress: ScanProgress | null } | { name: 'review' }

export default function AddOutfit() {
  const { items, imageUrl, saveOutfit } = useCloset()
  const { notify } = useToasts()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [wornOn, setWornOn] = useState(today())
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const scanRun = useRef(0)

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : undefined), [photo])
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl])
  // Sticker previews are blob URLs; release them when a new photo is scanned or the page closes.
  const previewUrls = useRef<string[]>([])
  const releasePreviews = () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current = []
  }
  useEffect(() => releasePreviews, [])

  const start = async (file: File | undefined) => {
    if (!file) return
    const run = ++scanRun.current
    let prepared: Blob
    try {
      prepared = await preparePhoto(file)
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t use that photo', message: (e as Error).message })
      return
    }
    setPhoto(prepared)
    setDrafts([])
    setStep({ name: 'scanning', progress: null })
    try {
      const { detections, rejections } = await scanOutfit(prepared, (progress) => {
        if (run === scanRun.current) setStep({ name: 'scanning', progress })
      })
      if (run !== scanRun.current) return
      releasePreviews()
      setDrafts(
        detections.map((detection, i) => ({
          key: `${run}-${i}`,
          detection,
          previewUrl: (previewUrls.current[i] = URL.createObjectURL(detection.cutout)),
          include: true,
          category: detection.category,
          name: `${detection.colorName} ${detection.kind}`,
          sameAs: '',
        })),
      )
      for (const rejection of rejections) {
        notify({
          tone: 'error',
          title: `Couldn’t catalog the ${rejection.kind}`,
          message: `It’s ${rejection.reason}, so it wasn’t added to your closet. The full photo still goes in your lookbook.`,
        })
      }
      if (detections.length === 0 && rejections.length === 0) {
        notify({ tone: 'info', title: 'No clothes spotted', message: 'The scanner didn’t find any pieces, but you can still save the photo to your lookbook.' })
      }
    } catch (e) {
      if (run !== scanRun.current) return
      notify({ tone: 'error', title: 'The clothing scanner hit a snag', message: `${(e as Error).message} You can still save the photo to your lookbook.` })
    }
    setStep({ name: 'review' })
  }

  const update = (key: string, patch: Partial<Draft>) => setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)))

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!photo) return
    if (!wornOn || wornOn > today()) return notify({ tone: 'error', title: 'Check the date', message: 'Pick the day you wore it (not in the future).' })
    const chosen = drafts.filter((d) => d.include)
    setSaving(true)
    try {
      const outfit = await saveOutfit({
        photo,
        wornOn,
        caption: caption.trim().slice(0, 500),
        newItems: chosen
          .filter((d) => !d.sameAs)
          .map((d) => ({
            category: d.category,
            name: d.name.trim().slice(0, 120),
            colorHex: d.detection.colorHex,
            colorName: d.detection.colorName,
            cutout: d.detection.cutout,
          })),
        existingItemIds: [...new Set(chosen.filter((d) => d.sameAs).map((d) => d.sameAs))],
      })
      const added = chosen.filter((d) => !d.sameAs).length
      notify({ tone: 'info', title: 'Saved to your lookbook!', message: added ? `${added} new ${added === 1 ? 'piece' : 'pieces'} added to your closet.` : 'Outfit saved.' })
      navigate(`/outfit/${outfit.id}`)
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t save the outfit', message: (e as Error).message })
      setSaving(false)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    start(event.dataTransfer.files[0])
  }

  return (
    <div className="add-page">
      <h1 className="page-title">
        <RansomText text="NEW FIT" />
        <Icon name="heel" className="title-icon" />
      </h1>

      {step.name === 'pick' && (
        <Paper kind="kraft" label="paste a new fit in here" className="upload-window">
          <label
            className={`dropzone${dragging ? ' is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => start(e.target.files?.[0])} />
            <span className="dropzone-icon" aria-hidden="true">
              ⇪
            </span>
            <strong>Choose an outfit photo</strong>
            <span>or drag it here. Full-length mirror pics work best!</span>
          </label>
          <p className="fineprint">Photos are scanned right here on your device. Location data is removed before saving.</p>
        </Paper>
      )}

      {step.name === 'scanning' && (
        <Paper kind="note" label="cutting out your pieces…" className="scan-window">
          <div className="scan-row">
            {photoUrl && <Polaroid src={photoUrl} alt="Your outfit photo" seed="scan" className="scan-polaroid is-scanning" />}
            <div className="scan-status" role="status">
              <p className="scan-label">
                {step.progress?.stage === 'loading-model'
                  ? 'Loading the clothing scanner… (first time only)'
                  : 'Scanning your outfit……'}
              </p>
              <div className="progress" aria-hidden="true">
                <span
                  className={`progress-fill${step.progress?.percent == null ? ' indeterminate' : ''}`}
                  style={step.progress?.percent != null ? { width: `${Math.round(step.progress.percent)}%` } : undefined}
                />
              </div>
            </div>
          </div>
        </Paper>
      )}

      {step.name === 'review' && (
        <form className="review" onSubmit={save}>
          <div className="review-photo">
            {photoUrl && <Polaroid src={photoUrl} alt="Your outfit photo" seed="review" caption={caption || 'fit check'} />}
            <label>
              <span>Worn on</span>
              <input type="date" value={wornOn} max={today()} onChange={(e) => setWornOn(e.target.value)} required />
            </label>
            <label>
              <span>Caption</span>
              <input value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} placeholder="brunch w/ the girls ♡" />
            </label>
          </div>

          <div className="review-items">
            <h2 className="section-title">
              {drafts.length ? `Found ${drafts.length} ${drafts.length === 1 ? 'piece' : 'pieces'}` : 'No pieces to add'}
            </h2>
            {drafts.length > 0 && <p className="hint">Fix anything the scanner got wrong. It can’t tell a jacket from a top, so double-check those!</p>}
            <ul className="draft-list">
              {drafts.map((draft, i) => {
                const sameCategory = items.filter((item) => item.category === draft.category)
                return (
                  <li key={draft.key} className={draft.include ? '' : 'is-skipped'}>
                    <Paper kind="card" label={`piece #${i + 1}`} seed={draft.key}>
                      <div className="draft">
                        <span className="sticker sticker-md">
                          <img src={draft.previewUrl} alt="" />
                        </span>
                        <div className="draft-fields">
                          <label>
                            <span>What is it?</span>
                            <select value={draft.category} onChange={(e) => update(draft.key, { category: e.target.value as Category, sameAs: '' })} disabled={!draft.include}>
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {CATEGORY_NAMES[c]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Already in your closet?</span>
                            <select value={draft.sameAs} onChange={(e) => update(draft.key, { sameAs: e.target.value })} disabled={!draft.include}>
                              <option value="">No, it’s new</option>
                              {sameCategory.map((item) => (
                                <option key={item.id} value={item.id}>
                                  Yes: {item.name || item.colorName}
                                </option>
                              ))}
                            </select>
                          </label>
                          {!draft.sameAs && (
                            <label>
                              <span>Name</span>
                              <input value={draft.name} maxLength={120} onChange={(e) => update(draft.key, { name: e.target.value })} disabled={!draft.include} />
                            </label>
                          )}
                          {draft.sameAs && (
                            <p className="same-as">
                              {imageUrl(items.find((x) => x.id === draft.sameAs)?.cutoutPath ?? null) && (
                                <img src={imageUrl(items.find((x) => x.id === draft.sameAs)?.cutoutPath ?? null)} alt="" />
                              )}
                              Will be tagged in this outfit.
                            </p>
                          )}
                          <label className="toggle">
                            <input type="checkbox" checked={!draft.include} onChange={(e) => update(draft.key, { include: !e.target.checked })} />
                            <span>Skip this one</span>
                          </label>
                        </div>
                      </div>
                    </Paper>
                  </li>
                )
              })}
            </ul>
            <div className="form-buttons">
              <button type="submit" className="cta-button" disabled={saving}>
                {saving ? 'Saving…' : '♡ Save to lookbook'}
              </button>
              <button
                type="button"
                className="soft-button"
                disabled={saving}
                onClick={() => {
                  scanRun.current++
                  setPhoto(null)
                  setDrafts([])
                  setStep({ name: 'pick' })
                }}
              >
                Use a different photo
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
