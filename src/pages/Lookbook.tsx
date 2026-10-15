import { Link } from 'react-router-dom'
import { Polaroid, RansomText, Sparkle, Star, Sticker, Y2KWindow } from '../components/Scrapbook'
import { formatDate, monthKey, monthLabel, yearOf } from '../lib/dates'
import type { Outfit } from '../lib/types'
import { useCloset } from '../state/ClosetContext'

export default function Lookbook() {
  const { outfits, imageUrl, itemsInOutfit } = useCloset()

  if (outfits.length === 0) {
    return (
      <div className="empty-page">
        <Y2KWindow title="welcome.exe" tone="blue" className="empty-window">
          <RansomText text="NEW LOOKBOOK" className="big-ransom" />
          <p>Snap a mirror pic, upload it, and the closet will cut out each piece into a sticker for you.</p>
          <Link to="/add" className="cta-button">
            + Add your first outfit
          </Link>
        </Y2KWindow>
        <Star className="float-star s1" />
        <Sparkle className="float-sparkle s2" />
      </div>
    )
  }

  // Group outfits into monthly spreads, newest first.
  const months = new Map<string, Outfit[]>()
  for (const outfit of [...outfits].sort((a, b) => b.wornOn.localeCompare(a.wornOn) || b.createdAt.localeCompare(a.createdAt))) {
    const key = monthKey(outfit.wornOn)
    months.set(key, [...(months.get(key) ?? []), outfit])
  }

  return (
    <div className="lookbook">
      <h1 className="sr-only">Lookbook</h1>
      {[...months.entries()].map(([key, list]) => (
        <section key={key} className="spread" aria-labelledby={`m-${key}`}>
          <Star className="spread-deco d1" />
          <Star className="spread-deco d2" color="pink" />
          <Sparkle className="spread-deco d3" />
          <Star className="spread-deco d4" />
          <h2 id={`m-${key}`} className="spread-title">
            <RansomText text={monthLabel(key).toUpperCase()} />
            <span className="spread-year">{yearOf(key)}</span>
          </h2>
          <ul className="spread-grid">
            {list.map((outfit) => {
              const pieces = itemsInOutfit(outfit.id)
              return (
                <li key={outfit.id}>
                  <Link to={`/outfit/${outfit.id}`} className="spread-link">
                    <Polaroid
                      src={imageUrl(outfit.photoPath)}
                      alt={`Outfit worn ${formatDate(outfit.wornOn)}${outfit.caption ? `: ${outfit.caption}` : ''}`}
                      seed={outfit.id}
                      caption={
                        <>
                          <span className="caption-text">{outfit.caption || 'fit check'}</span>
                          <span className="caption-date">{formatDate(outfit.wornOn)}</span>
                        </>
                      }
                    >
                      {pieces.length > 0 && (
                        <span className="peek-stickers" aria-hidden="true">
                          {pieces.slice(0, 3).map((item) => (
                            <Sticker key={item.id} item={item} src={imageUrl(item.cutoutPath)} size="sm" />
                          ))}
                        </span>
                      )}
                    </Polaroid>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
