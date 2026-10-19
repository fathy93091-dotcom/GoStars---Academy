import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import { useContent } from '../content/ContentContext.jsx'

const links = [
  { to: '/', label: 'الرئيسية', end: true },
  { to: '/about', label: 'من نحن', slug: 'about' },
  { to: '/programs', label: 'البرامج', slug: 'programs' },
  { to: '/news', label: 'الأخبار', slug: 'news' },
  { to: '/contact', label: 'تواصل معنا', slug: 'contact' },
]

export default function PublicLayout() {
  const { c, pageOn } = useContent()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  // إغلاق القائمة عند التنقل والعودة لأعلى الصفحة
  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      <header className="header">
        <div className="container header__row">
          <Logo />
          <button
            className="menu-btn"
            onClick={() => setOpen(o => !o)}
            aria-label="القائمة"
            aria-expanded={open}
          >
            {open ? '✕' : '☰'}
          </button>
          <nav className={`nav ${open ? 'open' : ''}`}>
            {links.filter(l => !l.slug || pageOn(l.slug)).map(l => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {l.label}
              </NavLink>
            ))}
            <NavLink to="/login" className="nav__login">تسجيل الدخول</NavLink>
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer__row">
          <strong>{c('site.name')}</strong>
          <span className="footer__tag">{c('site.tagline')}</span>
          <span>{c('footer.text')}</span>
          <span>© {new Date().getFullYear()} جميع الحقوق محفوظة</span>
        </div>
      </footer>
    </>
  )
}
