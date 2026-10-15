import { Link } from 'react-router-dom'
import { Y2KWindow } from '../components/Scrapbook'

export default function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <Y2KWindow title="error.exe" tone="pink" className="narrow">
      <p className="error-line">
        <span className="error-badge" aria-hidden="true">
          ×
        </span>
        Oops! That {what} isn’t here.
      </p>
      <Link to="/" className="cta-button">
        Back to the lookbook
      </Link>
    </Y2KWindow>
  )
}
