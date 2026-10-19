import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { homeFor } from './permissions.js'

// ملاحظة أمنية: هذه الحماية للتجربة فقط (تنقل المستخدم للصفحة الصحيحة).
// الحماية الحقيقية للبيانات في الخادم: RLS في قاعدة البيانات + دالة /api/admin-users.
export default function ProtectedRoute({ roles, permission, children }) {
  const { configured, loading, profile, can } = useAuth()
  const loc = useLocation()

  if (!configured) {
    return (
      <section className="section"><div className="container"><div className="card">
        <h2>الإعداد غير مكتمل</h2>
        <p>لم يتم ربط الموقع بـ Supabase بعد. راجع الملف <code>supabase/README-phase3.md</code>.</p>
      </div></div></section>
    )
  }
  if (loading) return <div className="center-note">جارٍ التحميل…</div>
  if (!profile) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (roles && !roles.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />
  if (permission && !can(permission)) return <Navigate to={homeFor(profile.role)} replace />
  return children
}
