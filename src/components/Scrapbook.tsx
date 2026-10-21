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

export function Star({ className = '' }: { className?: string }) {
  return (
    <svg className={`deco-star star-gold ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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

export type IconName = 'heart' | 'lips' | 'butterfly' | 'crown' | 'heel'

/** Each icon's shapes, plus where its glossy highlight sits (inside the shape, top-left-ish). */
const ICONS: Record<IconName, { shape: ReactNode; shine: [number, number] }> = {
  heart: { shape: <path d="M32 57C10 41 4 29 8 18c4-10 18-12 24 0 6-12 20-10 24 0 4 11-2 23-24 39z" />, shine: [22, 20] },
  lips: {
    shape: (
      <>
        <path d="M4 31c10-13 20-13 28-7 8-6 18-6 28 7-10 4-20 4-28 2-8 2-18 2-28-2z" />
        <path d="M4 31c10 4 20 4 28 2 8 2 18 2 28-2-8 16-20 20-28 20S12 47 4 31z" />
        <path className="icon-line" d="M8 31c10 3 18 3 24 1 6 2 14 2 24-1" />
      </>
    ),
    shine: [19, 26],
  },
  butterfly: {
    shape: (
      <>
        <path d="M31 30C20 6 4 8 6 22c2 10 15 12 25 8z" />
        <path d="M33 30C44 6 60 8 58 22c-2 10-15 12-25 8z" />
        <path d="M31 33c-10 1-21 9-17 19 4 8 15-1 17-17z" />
        <path d="M33 33c10 1 21 9 17 19-4 8-15-1-17-17z" />
        <rect x="29.5" y="20" width="5" height="28" rx="2.5" />
        <path className="icon-line" d="M31 21c-2-6-6-9-9-10M33 21c2-6 6-9 9-10" />
      </>
    ),
    shine: [18, 19],
  },
  crown: {
    shape: (
      <>
        <path d="M8 46l4-28 12 14 8-20 8 20 12-14 4 28z" />
        <rect x="8" y="46" width="48" height="8" rx="3" />
        <circle cx="32" cy="38" r="3.5" className="icon-gem" />
      </>
    ),
    shine: [17, 37],
  },
  heel: { shape: <path d="M5 45c0-8 7-10 13-8 11 4 19-6 27-15 4-4 10-4 13 0v6c-6 0-8 4-8 12l-2 16h-4V42c-5 5-15 9-25 9H9c-3 0-4-2-4-6z" />, shine: [27, 43] },
}

/** Glossy, chrome-pink Bratz-style icons. Decorative unless given a label. */
export function Icon({ name, className = '', label }: { name: IconName; className?: string; label?: string }) {
  const gradient = useId()
  const { shape, shine } = ICONS[name]
  const [cx, cy] = shine
  return (
    <svg className={`bratz-icon icon-${name} ${className}`} viewBox="0 0 64 64" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffe0f0" />
          <stop offset="0.45" stopColor="#ff5fae" />
          <stop offset="1" stopColor="#c21f7a" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradient})`}>{shape}</g>
      <ellipse className="icon-shine" cx={cx} cy={cy} rx="6" ry="3.5" transform={`rotate(-30 ${cx} ${cy})`} />
    </svg>
  )
}

export type PaperKind = 'note' | 'sticky' | 'kraft' | 'card'

interface PaperProps {
  kind?: PaperKind
  /** Handwritten heading at the top of the paper. */
  label?: string
  children: ReactNode
  className?: string
  /** Sticky-note color. */
  tone?: 'pink' | 'yellow'
  seed?: string
}

/** A scrap of paper taped into the scrapbook: notebook page (no tape), sticky note, kraft paper, or cardstock. */
export function Paper({ kind = 'card', label, children, className = '', tone, seed = label ?? kind }: PaperProps) {
  return (
    <section className={`paper paper-${kind}${tone ? ` sticky-${tone}` : ''} ${className}`} style={tilt(seed, kind === 'sticky' ? 5 : 2.5)} aria-label={label}>
      {kind !== 'note' && <Tape variant={Math.floor(seeded(seed, 3) * 4)} className="paper-tape" />}
      {label && <p className="paper-label">{label}</p>}
      {children}
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
/** Glossy craft supplies on the desk. Gradient ids come from useId so several copies never clash. */
function Scissors({ className }: { className: string }) {
  const id = useId()
  return (
    <svg className={`craft scissors ${className}`} viewBox="0 0 220 124">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#cfd8e2" />
          <stop offset="1" stopColor="#8996a6" />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#ffc2e2" />
          <stop offset="0.45" stopColor="#ff4fa3" />
          <stop offset="1" stopColor="#c2186f" />
        </linearGradient>
        <radialGradient id={`${id}s`} cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff6c9" />
          <stop offset="0.5" stopColor="#f5c443" />
          <stop offset="1" stopColor="#b8860b" />
        </radialGradient>
      </defs>
      <path d="M92 66 L204 92 Q215 94 212 84 L104 54 Z" fill={`url(#${id}b)`} stroke="#2b1d2f" strokeWidth="3" strokeLinejoin="round" />
      <path d="M110 62 L200 84" stroke="#fff" strokeWidth="2" opacity="0.7" strokeLinecap="round" />
      <path d="M92 58 L204 30 Q215 28 212 38 L104 70 Z" fill={`url(#${id}b)`} stroke="#2b1d2f" strokeWidth="3" strokeLinejoin="round" />
      <path d="M110 58 L200 36" stroke="#fff" strokeWidth="2.4" opacity="0.85" strokeLinecap="round" />
      <path
        fill={`url(#${id}h)`}
        fillRule="evenodd"
        stroke="#2b1d2f"
        strokeWidth="3"
        strokeLinejoin="round"
        d="M100 56 C86 50 74 44 64 38 C60 18 42 8 26 12 C8 16 4 36 14 46 C24 56 46 54 58 46 C70 52 82 58 96 64 Z M24 24 C34 19 48 22 52 32 C54 40 40 44 30 42 C18 40 14 30 24 24 Z"
      />
      <path
        fill={`url(#${id}h)`}
        fillRule="evenodd"
        stroke="#2b1d2f"
        strokeWidth="3"
        strokeLinejoin="round"
        d="M100 66 C86 72 72 78 62 84 C58 104 40 118 22 114 C2 110 0 88 12 78 C24 68 46 70 58 78 C70 72 84 66 96 60 Z M20 86 C32 80 48 84 52 94 C54 104 38 108 26 106 C12 104 8 92 20 86 Z"
      />
      <path d="M14 30 C16 18 28 14 38 15" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M8 94 C10 82 22 76 34 78" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.8" />
      <circle cx="98" cy="62" r="7" fill={`url(#${id}s)`} stroke="#2b1d2f" strokeWidth="2.5" />
      <path d="M94 62 h8" stroke="#8a6408" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function LipGloss({ className }: { className: string }) {
  const id = useId()
  return (
    <svg className={`craft lip-gloss ${className}`} viewBox="0 0 60 200">
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5b3f63" />
          <stop offset="0.35" stopColor="#2b1d2f" />
          <stop offset="0.7" stopColor="#4a3352" />
          <stop offset="1" stopColor="#1c1220" />
        </linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffd6ec" />
          <stop offset="0.4" stopColor="#ff6fb8" />
          <stop offset="1" stopColor="#d81f7d" />
        </linearGradient>
      </defs>
      <rect x="16" y="4" width="28" height="66" rx="10" fill={`url(#${id}c)`} stroke="#2b1d2f" strokeWidth="3" />
      <path d="M16 20 h28 M16 28 h28" stroke="#6e5578" strokeWidth="1.5" />
      <rect x="21" y="9" width="4" height="56" rx="2" fill="#fff" opacity="0.45" />
      <rect x="11" y="68" width="38" height="128" rx="13" fill={`url(#${id}t)`} stroke="#2b1d2f" strokeWidth="3" />
      <rect x="11" y="68" width="38" height="12" rx="4" fill="#c2186f" opacity="0.5" />
      <rect x="16" y="84" width="7" height="104" rx="3.5" fill="#fff" opacity="0.6" />
      <g fill="#fff">
        <circle cx="35" cy="98" r="2.2" />
        <circle cx="29" cy="120" r="1.6" />
        <circle cx="39" cy="138" r="2" />
        <circle cx="31" cy="158" r="1.4" />
        <circle cx="40" cy="176" r="1.8" />
        <path d="M36 110l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
      </g>
    </svg>
  )
}

function PlatformHeel({ className }: { className: string }) {
  const id = useId()
  return (
    <svg className={`craft platform-heel ${className}`} viewBox="0 0 150 110">
      <defs>
        <linearGradient id={`${id}u`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#ffc2e2" />
          <stop offset="0.45" stopColor="#ff3d9a" />
          <stop offset="1" stopColor="#b3125f" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9a7ff" />
          <stop offset="1" stopColor="#8c5fe0" />
        </linearGradient>
      </defs>
      <path d="M104 62 L124 60 L120 104 L106 104 Z" fill={`url(#${id}s)`} stroke="#2b1d2f" strokeWidth="3" strokeLinejoin="round" />
      <path d="M6 88 Q6 104 22 104 L72 104 Q82 104 84 96 L86 86 Q60 92 6 88 Z" fill={`url(#${id}s)`} stroke="#2b1d2f" strokeWidth="3" strokeLinejoin="round" />
      <path
        d="M6 88 Q4 68 26 64 Q48 60 66 66 Q84 52 104 36 Q124 22 130 36 L128 62 L104 64 Q92 78 86 86 Q60 92 6 88 Z"
        fill={`url(#${id}u)`}
        stroke="#2b1d2f"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M104 36 Q118 6 134 22" fill="none" stroke="#2b1d2f" strokeWidth="7" strokeLinecap="round" />
      <path d="M104 36 Q118 6 134 22" fill="none" stroke="#ff4fa3" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M18 74 Q34 66 56 70" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.85" />
      <path d="M90 52 Q102 42 114 36" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M74 74c-5-4-6-8-3-10 2-2 4-1 5 1 1-2 3-3 5-1 3 2 2 6-5 10z" fill="#f5c443" stroke="#2b1d2f" strokeWidth="1.5" />
    </svg>
  )
}

function MiniScrapbook({ className }: { className: string }) {
  const id = useId()
  return (
    <svg className={`craft mini-scrapbook ${className}`} viewBox="0 0 130 110">
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9d8ff" />
          <stop offset="0.5" stopColor="#b38bff" />
          <stop offset="1" stopColor="#7b4fd6" />
        </linearGradient>
      </defs>
      <rect x="20" y="14" width="102" height="88" rx="8" fill="#fff8ec" stroke="#2b1d2f" strokeWidth="3" />
      <path d="M24 98 h94 M26 94 h92" stroke="#e7d9c2" strokeWidth="2" />
      <rect x="14" y="8" width="102" height="88" rx="8" fill={`url(#${id}c)`} stroke="#2b1d2f" strokeWidth="3" />
      <g fill="#fff8ec" stroke="#2b1d2f" strokeWidth="2.5">
        <circle cx="14" cy="22" r="5" />
        <circle cx="14" cy="40" r="5" />
        <circle cx="14" cy="58" r="5" />
        <circle cx="14" cy="76" r="5" />
      </g>
      <rect x="64" y="2" width="44" height="14" rx="2" fill="#9fe2c9" opacity="0.9" transform="rotate(12 86 9)" />
      <path d="M60 74C44 62 40 54 43 46c3-7 13-8 17 0 4-8 14-7 17 0 3 8-1 16-17 28z" fill="#ff4fa3" stroke="#2b1d2f" strokeWidth="2.5" />
      <ellipse cx="51" cy="51" rx="4" ry="2.4" fill="#fff" opacity="0.8" transform="rotate(-30 51 51)" />
      <path d="M96 64l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#ffd166" stroke="#2b1d2f" strokeWidth="2" />
      <path d="M24 16 Q30 12 44 12" stroke="#fff" strokeWidth="3" fill="none" opacity="0.7" strokeLinecap="round" />
    </svg>
  )
}

function GlueStick({ className }: { className: string }) {
  const id = useId()
  return (
    <svg className={`craft glue-stick ${className}`} viewBox="0 0 60 200">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#ffe3f2" />
          <stop offset="1" stopColor="#f3b6d6" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff9fd0" />
          <stop offset="0.5" stopColor="#ff3d9a" />
          <stop offset="1" stopColor="#c2186f" />
        </linearGradient>
      </defs>
      <rect x="10" y="4" width="40" height="56" rx="12" fill={`url(#${id}c)`} stroke="#2b1d2f" strokeWidth="3" />
      <rect x="15" y="9" width="5" height="44" rx="2.5" fill="#fff" opacity="0.6" />
      <rect x="7" y="56" width="46" height="138" rx="10" fill={`url(#${id}b)`} stroke="#2b1d2f" strokeWidth="3" />
      <rect x="7" y="84" width="46" height="70" fill="#ff4fa3" stroke="#2b1d2f" strokeWidth="2.5" />
      <text x="30" y="119" textAnchor="middle" fontFamily="Shrikhand, Georgia, serif" fontSize="13" fill="#fff" transform="rotate(-90 30 119)">
        GLUE ♡
      </text>
      <rect x="12" y="62" width="5" height="126" rx="2.5" fill="#fff" opacity="0.7" />
    </svg>
  )
}

function Paperclip({ className }: { className: string }) {
  const id = useId()
  const d = 'M14 34 V88 a8 8 0 0 0 16 0 V24 a12 12 0 0 0 -24 0 V92 a16 16 0 0 0 32 0 V38'
  return (
    <svg className={`craft paperclip ${className}`} viewBox="0 0 44 120">
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffb3d9" />
          <stop offset="0.5" stopColor="#ff4fa3" />
          <stop offset="1" stopColor="#c2186f" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="#2b1d2f" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={`url(#${id}p)`} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 30 V20 a10.5 10.5 0 0 1 12 -9" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      <path d="M7.5 60 V88" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

function Stapler({ className }: { className: string }) {
  const id = useId()
  return (
    <svg className={`craft stapler ${className}`} viewBox="0 0 170 84">
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0.1" y2="1">
          <stop offset="0" stopColor="#ffc2e2" />
          <stop offset="0.45" stopColor="#ff3d9a" />
          <stop offset="1" stopColor="#b3125f" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9a7ff" />
          <stop offset="1" stopColor="#7b4fd6" />
        </linearGradient>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#cfd8e2" />
          <stop offset="1" stopColor="#8996a6" />
        </linearGradient>
      </defs>
      <rect x="8" y="60" width="154" height="18" rx="9" fill={`url(#${id}b)`} stroke="#2b1d2f" strokeWidth="3" />
      <rect x="122" y="52" width="30" height="10" rx="3" fill={`url(#${id}m)`} stroke="#2b1d2f" strokeWidth="2.5" />
      <path d="M16 58 Q10 34 32 28 L146 20 Q160 19 159 32 L157 44 Q156 52 146 52 L26 60 Z" fill={`url(#${id}t)`} stroke="#2b1d2f" strokeWidth="3" strokeLinejoin="round" />
      <path d="M34 34 L144 26" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.85" />
      <circle cx="22" cy="58" r="9" fill={`url(#${id}m)`} stroke="#2b1d2f" strokeWidth="2.5" />
      <circle cx="22" cy="58" r="3" fill="#8996a6" />
      <path d="M96 40c-5-4-6-8-3-10 2-2 4-1 5 1 1-2 3-3 5-1 3 2 2 6-5 10z" fill="#f5c443" stroke="#2b1d2f" strokeWidth="1.5" />
      <path d="M20 66 H150" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

/** On phones, strips of desk directly above and below the scrapbook with a few supplies on them. */
export function DeskStrip({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div className={`desk-strip desk-strip-${position}`} aria-hidden="true">
      {position === 'top' ? (
        <>
          <Scissors className="strip-scissors" />
          <Paperclip className="strip-paperclip" />
          <Icon name="heart" className="craft strip-heart" />
          <LipGloss className="strip-gloss" />
        </>
      ) : (
        <>
          <PlatformHeel className="strip-heel" />
          <Stapler className="strip-stapler" />
          <Icon name="butterfly" className="craft strip-butterfly" />
          <GlueStick className="strip-glue" />
          <MiniScrapbook className="strip-scrapbook" />
        </>
      )}
    </div>
  )
}

/** Craft supplies scattered on the desk margins beside the scrapbook, on wider screens. */
export function CraftDesk() {
  return (
    <div className="craft-desk" aria-hidden="true">
      <GlueStick className="desk-glue" />
      <Paperclip className="desk-paperclip" />
      <Stapler className="desk-stapler" />
      <Scissors className="desk-scissors" />
      <LipGloss className="desk-gloss" />
      <PlatformHeel className="desk-heel" />
      <MiniScrapbook className="desk-scrapbook" />
      <Icon name="butterfly" className="craft desk-butterfly" />
      <Icon name="heart" className="craft desk-heart" />
    </div>
  )
}
