import { useAuth } from '../../auth/AuthContext.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'

function Shell({ title, note }) {
  const { profile } = useAuth()
  usePageTitle(title)
  return (
    <section className="section">
      <div className="container">
        <div className="card card--accent">
          <h1 style={{ fontSize: '1.8rem' }}>{title}</h1>
          <p>أهلاً {profile.full_name}.</p>
          <p style={{ color: 'var(--ink-soft)' }}>{note}</p>
        </div>
      </div>
    </section>
  )
}

export const AdminHome = () => <Shell title="لوحة المدير" note="تُبنى أدوات الإدارة الكاملة في المرحلة 8. يمكنك الآن إدارة المستخدمين من تبويب «المستخدمون»." />
export const SupervisorHome = () => <Shell title="لوحة المشرف" note="تظهر هنا الأدوات التي منحها لك المدير (المرحلة 8)." />
export const ParentHome = () => <Shell title="بوابة ولي الأمر" note="التقارير والحضور والملخص الشهري في المرحلة 10." />
