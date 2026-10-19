import { Link } from 'react-router-dom'
import usePageTitle from '../hooks/usePageTitle.js'

export default function NotFound() {
  usePageTitle('الصفحة غير موجودة')
  return (
    <section className="section">
      <div className="container">
        <div className="card" style={{ textAlign: 'center' }}>
          <h1>٤٠٤</h1>
          <p>الصفحة التي تبحث عنها غير موجودة.</p>
          <Link to="/" className="btn">العودة للرئيسية</Link>
        </div>
      </div>
    </section>
  )
}
