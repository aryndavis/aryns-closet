import { Link } from 'react-router-dom'
import { Paper } from '../components/Scrapbook'

export default function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <Paper kind="sticky" tone="yellow" label="oops!" className="narrow">
      <p className="error-line">
        <span className="error-badge" aria-hidden="true">
          ×
        </span>
        Oops! That {what} isn’t here.
      </p>
      <Link to="/" className="cta-button">
        Back to the lookbook
      </Link>
    </Paper>
  )
}
