import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, Paper, RansomText, Sparkle, Sticker } from '../components/Scrapbook'
import { missingSlots, OPTIONAL_SLOTS, randomLook, SLOT_ORDER, type Look, type Shape, type Slot } from '../lib/shuffle'
import { CATEGORY_NAMES } from '../lib/types'
import { useCloset } from '../state/ClosetContext'

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Shuffle() {
  const { items, imageUrl } = useCloset()
  const hasDresses = items.some((i) => i.category === 'dress')
  const [shape, setShape] = useState<Shape>('separates')
  const [enabled, setEnabled] = useState<Set<Slot>>(new Set(['jacket', 'accessory']))
  const [locked, setLocked] = useState<Look>({})
  const [look, setLook] = useState<Look>(() => randomLook(items, 'separates', new Set(['jacket', 'accessory']), {}, {}))
  const [spinning, setSpinning] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearInterval(timer.current), [])

  const shuffle = (nextShape = shape, nextEnabled = enabled) => {
    window.clearInterval(timer.current)
    const final = randomLook(items, nextShape, nextEnabled, locked, look)
    if (reduceMotion()) return setLook(final)
    // Flip through random pieces like a slot machine, then land on the final look.
    setSpinning(true)
    let ticks = 0
    timer.current = window.setInterval(() => {
      ticks++
      if (ticks >= 8) {
        window.clearInterval(timer.current)
        setLook(final)
        setSpinning(false)
      } else {
        setLook(randomLook(items, nextShape, nextEnabled, locked, {}))
      }
    }, 90)
  }

  const missing = missingSlots(items, shape)
  const slots = SLOT_ORDER[shape].filter((slot) => !OPTIONAL_SLOTS.includes(slot) || enabled.has(slot))

  return (
    <div className="shuffle-page">
      <h1 className="page-title">
        <RansomText text="OUTFIT ROULETTE" />
        <Icon name="crown" className="title-icon" />
      </h1>

      <div className="shuffle-controls">
        <div className="tabs" role="group" aria-label="Outfit shape">
          <button type="button" className="tab" aria-pressed={shape === 'separates'} onClick={() => (setShape('separates'), shuffle('separates'))}>
            Top + bottom
          </button>
          <button type="button" className="tab" aria-pressed={shape === 'dress'} disabled={!hasDresses} onClick={() => (setShape('dress'), shuffle('dress'))}>
            Dress
          </button>
        </div>
        {OPTIONAL_SLOTS.map((slot) => (
          <label key={slot} className="toggle">
            <input
              type="checkbox"
              checked={enabled.has(slot)}
              onChange={(e) => {
                const next = new Set(enabled)
                if (e.target.checked) next.add(slot)
                else next.delete(slot)
                setEnabled(next)
                shuffle(shape, next)
              }}
            />
            <span>Add {CATEGORY_NAMES[slot].toLowerCase()}</span>
          </label>
        ))}
      </div>

      {missing.length > 0 && (
        <p className="hint">
          Add some {missing.map((m) => CATEGORY_NAMES[m].toLowerCase()).join(' and ')} to your closet to complete the roulette. <Link to="/add">Add an outfit →</Link>
        </p>
      )}

      <ul className={`reels${spinning ? ' is-spinning' : ''}`} aria-live="polite">
        {slots.map((slot) => {
          const item = look[slot]
          const isLocked = Boolean(locked[slot])
          return (
            <li key={slot}>
              <Paper kind="card" label={CATEGORY_NAMES[slot]} seed={slot} className={isLocked ? 'is-kept' : ''}>
                <div className="reel">
                  {item ? (
                    <Link to={`/item/${item.id}`} className="reel-item">
                      <Sticker item={item} src={imageUrl(item.cutoutPath)} />
                      <span>{item.name || CATEGORY_NAMES[item.category]}</span>
                    </Link>
                  ) : (
                    <span className="reel-empty">no {CATEGORY_NAMES[slot].toLowerCase()} yet</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`lock${isLocked ? ' is-locked' : ''}`}
                  aria-pressed={isLocked}
                  disabled={!item}
                  onClick={() => setLocked((current) => ({ ...current, [slot]: isLocked ? undefined : item }))}
                >
                  {isLocked ? '♥ keeping this' : '♡ keep'}
                </button>
              </Paper>
            </li>
          )
        })}
      </ul>

      <div className="shuffle-go">
        <button type="button" className="cta-button big" onClick={() => shuffle()} disabled={spinning || items.length === 0}>
          <Sparkle className="btn-sparkle" /> Shuffle! <Sparkle className="btn-sparkle" />
        </button>
      </div>
    </div>
  )
}
