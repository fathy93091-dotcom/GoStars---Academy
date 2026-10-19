import { Link } from 'react-router-dom'
import { useContent } from '../content/ContentContext.jsx'

// شعار GoStars الرسمي. الملفات في public/ : logo-mark.png (الرمز) و logo-wordmark.png (الاسم)
export default function Logo() {
  const { img } = useContent()
  const custom = img('site.logo')
  return (
    <Link to="/" className="logo" aria-label="أكاديمية GoStars">
      {custom ? (
        <img src={custom} alt="GoStars" className="logo__custom" />
      ) : (
        <>
          <img src="/logo-mark.png" alt="" />
          <img src="/logo-wordmark.png" alt="GoStars" className="logo__word" />
        </>
      )}
    </Link>
  )
}
