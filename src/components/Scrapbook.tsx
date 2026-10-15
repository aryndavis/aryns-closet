import type { CSSProperties, ReactNode } from 'react'
import { CATEGORY_LABELS, type Item } from '../lib/types'

/** Stable pseudo-random number in [0, 1) from a string, so layouts don't jump around between renders. */
export function seeded(seed: string, salt = 0) {
  let hash = 2166136261 ^ salt
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619)
  return ((hash >>> 0) % 10000) / 10000
}

/** Cut-out magazine letters, like a ransom note. Screen readers hear the plain text. */
export function RansomText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`ransom ${className}`} aria-label={text} role="img">
      {[...text].map((char, i) =>
        char === ' ' ? (
          <span key={i} className="ransom-space" aria-hidden="true" />
        ) : (
          <span key={i} aria-hidden="true" className={`ransom-letter rl-${Math.floor(seeded(text, i) * 6)}`} style={{ '--tilt': `${(seeded(text, i + 99) - 0.5) * 14}deg` } as CSSProperties}>
            {char}
          </span>
        ),
      )}
    </span>
  )
}

export function Tape({ variant = 0, className = '' }: { variant?: number; className?: string }) {
  return <span className={`tape tape-${variant % 4} ${className}`} aria-hidden="true" />
}

export function Star({ className = '', color = 'gold' }: { className?: string; color?: 'gold' | 'pink' }) {
  return (
    <svg className={`deco-star star-${color} ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6 5.6 21.1 7 14l-5.3-5 7.2-.9z" />
    </svg>
  )
}

export function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg className={`deco-sparkle ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 0c.8 6.4 5.6 11.2 12 12-6.4.8-11.2 5.6-12 12-.8-6.4-5.6-11.2-12-12C6.4 11.2 11.2 6.4 12 0z" />
    </svg>
  )
}

/** A Y2K desktop window with the little minimize/maximize/close boxes. */
export function Y2KWindow({ title, children, className = '', tone = 'pink' }: { title: string; children: ReactNode; className?: string; tone?: 'pink' | 'blue' | 'cream' }) {
  return (
    <section className={`y2k-window tone-${tone} ${className}`} aria-label={title}>
      <div className="window-bar">
        <span>{title}</span>
        <span className="window-boxes" aria-hidden="true">
          <i>_</i>
          <i>□</i>
          <i>×</i>
        </span>
      </div>
      <div className="window-body">{children}</div>
    </section>
  )
}

interface PolaroidProps {
  src?: string
  alt: string
  caption?: ReactNode
  seed: string
  className?: string
  children?: ReactNode
}

/** An instant photo with tape at the top and a handwritten caption. */
export function Polaroid({ src, alt, caption, seed, className = '', children }: PolaroidProps) {
  return (
    <figure className={`polaroid ${className}`} style={{ '--tilt': `${(seeded(seed) - 0.5) * 7}deg` } as CSSProperties}>
      <Tape variant={Math.floor(seeded(seed, 7) * 4)} className="polaroid-tape" />
      <div className="polaroid-photo">{src ? <img src={src} alt={alt} loading="lazy" /> : <span className="photo-missing">photo unavailable</span>}</div>
      {caption && <figcaption>{caption}</figcaption>}
      {children}
    </figure>
  )
}

/** A clothing item as a die-cut sticker. Falls back to a color swatch if there's no cut-out image. */
export function Sticker({ item, src, size = 'md' }: { item: Pick<Item, 'name' | 'category' | 'colorHex' | 'id'>; src?: string; size?: 'sm' | 'md' | 'lg' }) {
  const label = item.name || CATEGORY_LABELS[item.category]
  return (
    <span className={`sticker sticker-${size}`} style={{ '--tilt': `${(seeded(item.id) - 0.5) * 10}deg` } as CSSProperties}>
      {src ? <img src={src} alt={label} loading="lazy" /> : <span className="sticker-swatch" style={{ background: item.colorHex ?? '#f5b5d8' }} role="img" aria-label={label} />}
    </span>
  )
}
