import { Link, useSearchParams } from 'react-router-dom'
import { RansomText, Sticker, Y2KWindow } from '../components/Scrapbook'
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../lib/types'
import { useCloset } from '../state/ClosetContext'

export default function Closet() {
  const { items, links, imageUrl } = useCloset()
  const [params, setParams] = useSearchParams()
  const raw = params.get('show')
  const show: Category | 'all' = raw && (CATEGORIES as readonly string[]).includes(raw) ? (raw as Category) : 'all'
  const wornCount = (itemId: string) => links.filter((l) => l.itemId === itemId).length
  const shown = items.filter((i) => show === 'all' || i.category === show)

  return (
    <div className="closet-page">
      <h1 className="page-title">
        <RansomText text="MY CLOSET" />
      </h1>

      <div className="tabs" role="group" aria-label="Show">
        {(['all', ...CATEGORIES] as const).map((key) => {
          const count = key === 'all' ? items.length : items.filter((i) => i.category === key).length
          return (
            <button
              key={key}
              type="button"
              className="tab"
              aria-pressed={show === key}
              onClick={() => setParams(key === 'all' ? {} : { show: key }, { replace: true })}
            >
              {key === 'all' ? 'Everything' : CATEGORY_LABELS[key]} <span className="count">{count}</span>
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <Y2KWindow title="empty.txt" tone="blue" className="narrow">
          <p>{items.length === 0 ? 'Your closet is empty. Add an outfit photo and the pieces will show up here as stickers.' : 'Nothing in this section yet.'}</p>
          <Link to="/add" className="cta-button">
            + Add an outfit
          </Link>
        </Y2KWindow>
      ) : (
        <ul className="sticker-board">
          {shown.map((item) => {
            const worn = wornCount(item.id)
            return (
              <li key={item.id}>
                <Link to={`/item/${item.id}`} className="board-item">
                  <Sticker item={item} src={imageUrl(item.cutoutPath)} />
                  <span className="label-tape">{item.name || CATEGORY_LABELS[item.category]}</span>
                  <span className="worn">
                    worn {worn}× {item.colorHex && <i className="dot" style={{ background: item.colorHex }} aria-hidden="true" />}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
