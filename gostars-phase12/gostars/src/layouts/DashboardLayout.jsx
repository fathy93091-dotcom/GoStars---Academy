import { NavLink, Outlet } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { homeFor, roleLabel } from '../auth/permissions.js'

export default function DashboardLayout() {
  const { profile, can, signOut } = useAuth()
  const links = [{ to: homeFor(profile.role), label: 'الرئيسية', end: true }]
  if (profile.role === 'teacher') {
    links.push({ to: '/teacher/schedule', label: 'الجدول' }, { to: '/teacher/students', label: 'الطلاب' }, { to: '/teacher/earnings', label: 'أرباحي' })
  }
  if (['admin', 'supervisor'].includes(profile.role)) {
    const staffLinks = [
      ['manage_users', '/admin/users', 'المستخدمون'], ['manage_students', '/admin/students', 'الطلاب'], ['manage_groups', '/admin/groups', 'المجموعات'],
      ['manage_groups', '/admin/subjects', 'المواد'], ['manage_students', '/admin/packages', 'الباقات'], ['manage_finance', '/admin/finance', 'المالية'],
      ['follow_reports', '/admin/reports', 'التقارير'], ['follow_teachers', '/admin/teachers', 'المعلمون'],
      ['manage_content', '/admin/content', 'إدارة الموقع'], ['add_announcements', '/admin/announcements', 'الإعلانات'], ['manage_students', '/admin/messages', 'الرسائل'],
    ]
    for (const [perm, to, label] of staffLinks) if (can(perm)) links.push({ to, label })
    if (profile.role === 'admin') links.push({ to: '/admin/bot', label: 'إعدادات البوت' }, { to: '/admin/audit', label: 'سجل العمليات' })
    links.push({ to: '/admin/security', label: 'الأمان' })
  }

  return (
    <>
      <header className="header">
        <div className="container header__row">
          <Logo />
          <div className="dash-user">
            <span className="badge">{roleLabel(profile.role)}</span>
            <span className="dash-user__name">{profile.full_name}</span>
            <button className="btn btn--light btn--sm" onClick={signOut}>خروج</button>
          </div>
        </div>
      </header>
      <nav className="subnav">
        <div className="container subnav__row">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>{l.label}</NavLink>
          ))}
        </div>
      </nav>
      <main><Outlet /></main>
    </>
  )
}
