import { useId, type CSSProperties, type ReactNode } from 'react'
import { CATEGORY_LABELS, type Item } from '../lib/types'

/** Stable pseudo-random number in [0, 1) from a string, so layouts don't jump around between renders. */
export function seeded(seed: string, salt = 0) {
  let hash = 2166136261 ^ salt
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619)
  return ((hash >>> 0) % 10000) / 10000
}

const tilt = (seed: string, range: number) => ({ '--tilt': `${(seeded(seed) - 0.5) * range}deg` }) as CSSProperties

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

export type IconName = 'heart' | 'lips' | 'butterfly' | 'crown' | 'heel' | 'cherry'

const ICON_PATHS: Record<IconName, ReactNode> = {
  heart: <path d="M32 57C10 41 4 29 8 18c4-10 18-12 24 0 6-12 20-10 24 0 4 11-2 23-24 39z" />,
  lips: (
    <>
      <path d="M4 31c10-13 20-13 28-7 8-6 18-6 28 7-10 4-20 4-28 2-8 2-18 2-28-2z" />
      <path d="M4 31c10 4 20 4 28 2 8 2 18 2 28-2-8 16-20 20-28 20S12 47 4 31z" />
      <path className="icon-line" d="M8 31c10 3 18 3 24 1 6 2 14 2 24-1" />
    </>
  ),
  butterfly: (
    <>
      <path d="M31 30C20 6 4 8 6 22c2 10 15 12 25 8z" />
      <path d="M33 30C44 6 60 8 58 22c-2 10-15 12-25 8z" />
      <path d="M31 33c-10 1-21 9-17 19 4 8 15-1 17-17z" />
      <path d="M33 33c10 1 21 9 17 19-4 8-15-1-17-17z" />
      <rect x="29.5" y="20" width="5" height="28" rx="2.5" />
      <path className="icon-line" d="M31 21c-2-6-6-9-9-10M33 21c2-6 6-9 9-10" />
    </>
  ),
  crown: (
    <>
      <path d="M8 46l4-28 12 14 8-20 8 20 12-14 4 28z" />
      <rect x="8" y="46" width="48" height="8" rx="3" />
      <circle cx="32" cy="38" r="3.5" className="icon-gem" />
    </>
  ),
  heel: <path d="M5 45c0-8 7-10 13-8 11 4 19-6 27-15 4-4 10-4 13 0v6c-6 0-8 4-8 12l-2 16h-4V42c-5 5-15 9-25 9H9c-3 0-4-2-4-6z" />,
  cherry: (
    <>
      <path className="icon-line" d="M22 40c2-14 10-26 24-32M42 40c-2-10 0-22 4-32" />
      <circle cx="21" cy="46" r="11" />
      <circle cx="43" cy="44" r="11" />
    </>
  ),
}

/** Glossy, chrome-pink Bratz-style icons. Decorative unless given a label. */
export function Icon({ name, className = '', label }: { name: IconName; className?: string; label?: string }) {
  const gradient = useId()
  return (
    <svg className={`bratz-icon icon-${name} ${className}`} viewBox="0 0 64 64" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffe0f0" />
          <stop offset="0.45" stopColor="#ff5fae" />
          <stop offset="1" stopColor="#c21f7a" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradient})`}>{ICON_PATHS[name]}</g>
      <ellipse className="icon-shine" cx="22" cy="20" rx="6" ry="3.5" transform="rotate(-30 22 20)" />
    </svg>
  )
}

export type PaperKind = 'note' | 'sticky' | 'kraft' | 'card' | 'ticket'

interface PaperProps {
  kind?: PaperKind
  /** Handwritten heading at the top of the paper. */
  label?: string
  children: ReactNode
  className?: string
  /** Sticky-note color. */
  tone?: 'pink' | 'yellow' | 'blue' | 'mint'
  seed?: string
  tape?: boolean
  as?: 'section' | 'div' | 'article'
}

/** A scrap of paper taped into the scrapbook: notebook page, sticky note, kraft paper, cardstock, or ticket. */
export function Paper({ kind = 'card', label, children, className = '', tone, seed = label ?? kind, tape = true, as: Tag = 'section' }: PaperProps) {
  return (
    <Tag className={`paper paper-${kind}${tone ? ` sticky-${tone}` : ''} ${className}`} style={tilt(seed, kind === 'sticky' ? 5 : 2.5)} aria-label={Tag === 'section' ? label : undefined}>
      {tape && <Tape variant={Math.floor(seeded(seed, 3) * 4)} className="paper-tape" />}
      {label && <p className="paper-label">{label}</p>}
      {children}
    </Tag>
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
    <figure className={`polaroid ${className}`} style={tilt(seed, 7)}>
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
    <span className={`sticker sticker-${size}`} style={tilt(item.id, 10)}>
      {src ? <img src={src} alt={label} loading="lazy" /> : <span className="sticker-swatch" style={{ background: item.colorHex ?? '#f5b5d8' }} role="img" aria-label={label} />}
    </span>
  )
}

/** Craft supplies scattered around the edges of the screen. Purely decorative; hidden on small screens. */
export function CraftDesk() {
  return (
    <div className="craft-desk" aria-hidden="true">
      {/* Glue stick */}
      <svg className="craft glue-stick" viewBox="0 0 60 200">
        <rect x="14" y="4" width="32" height="34" rx="10" fill="#fff4b0" stroke="#2b1d2f" strokeWidth="3" />
        <rect x="10" y="34" width="40" height="18" rx="4" fill="#ff5fae" stroke="#2b1d2f" strokeWidth="3" />
        <rect x="8" y="50" width="44" height="140" rx="8" fill="#ffd1ea" stroke="#2b1d2f" strokeWidth="3" />
        <rect x="14" y="80" width="32" height="70" rx="4" fill="#fff" stroke="#2b1d2f" strokeWidth="2" />
        <text x="30" y="118" textAnchor="middle" fontFamily="Shrikhand, Georgia, serif" fontSize="11" fill="#ff3d9a" transform="rotate(-90 30 115)">
          GLUE ♡
        </text>
        <rect x="14" y="56" width="5" height="128" rx="2.5" fill="#fff" opacity="0.6" />
      </svg>
      {/* Scissors */}
      <svg className="craft scissors" viewBox="0 0 200 120">
        <path d="M70 58 L196 18 L198 26 L84 66 Z" fill="#dfe6ee" stroke="#2b1d2f" strokeWidth="3" strokeLinejoin="round" />
        <path d="M70 62 L196 102 L194 110 L84 70 Z" fill="#c9d3dd" stroke="#2b1d2f" strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="38" cy="36" rx="30" ry="22" fill="#ff5fae" stroke="#2b1d2f" strokeWidth="3" />
        <ellipse cx="38" cy="36" rx="16" ry="10" fill="#fff4fa" stroke="#2b1d2f" strokeWidth="2.5" />
        <ellipse cx="38" cy="86" rx="30" ry="22" fill="#ff5fae" stroke="#2b1d2f" strokeWidth="3" />
        <ellipse cx="38" cy="86" rx="16" ry="10" fill="#fff4fa" stroke="#2b1d2f" strokeWidth="2.5" />
        <circle cx="78" cy="62" r="6" fill="#f5c443" stroke="#2b1d2f" strokeWidth="2.5" />
        <path d="M22 24 q8-8 18-6" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7" />
      </svg>
      {/* Paper clip */}
      <svg className="craft paper-clip" viewBox="0 0 40 110">
        <path d="M14 30 V84 a8 8 0 0 0 16 0 V22 a12 12 0 0 0 -24 0 V88 a16 16 0 0 0 32 0 V34" fill="none" stroke="#9fd0ff" strokeWidth="5" strokeLinecap="round" />
        <path d="M14 30 V84 a8 8 0 0 0 16 0 V22 a12 12 0 0 0 -24 0 V88 a16 16 0 0 0 32 0 V34" fill="none" stroke="#2b1d2f" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
      {/* Lip gloss */}
      <svg className="craft lip-gloss" viewBox="0 0 60 180">
        <rect x="16" y="4" width="28" height="70" rx="12" fill="#2b1d2f" />
        <rect x="21" y="10" width="5" height="56" rx="2.5" fill="#fff" opacity="0.35" />
        <rect x="12" y="72" width="36" height="104" rx="10" fill="#ff7cc0" stroke="#2b1d2f" strokeWidth="3" />
        <rect x="18" y="80" width="6" height="88" rx="3" fill="#fff" opacity="0.55" />
        <circle cx="34" cy="110" r="3" fill="#fff" />
        <circle cx="28" cy="134" r="2" fill="#fff" />
        <circle cx="38" cy="150" r="2.5" fill="#fff" />
      </svg>
      <Icon name="butterfly" className="craft desk-butterfly" />
      <Icon name="heart" className="craft desk-heart" />
    </div>
  )
}
