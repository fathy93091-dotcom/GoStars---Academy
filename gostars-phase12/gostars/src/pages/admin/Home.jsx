import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { countOf } from '../../lib/adminData.js'
import { money } from '../../lib/teacherApi.js'
import usePageTitle from '../../hooks/usePageTitle.js'

// الصفحة الرئيسية للوحة الإدارة: بطاقات بحسب صلاحيات من دخل، كل بطاقة رابط للشاشة
export default function AdminHome() {
  const { profile, can } = useAuth()
  usePageTitle(profile.role === 'admin' ? 'لوحة المدير' : 'لوحة المشرف')
  const [n, setN] = useState({})

  useEffect(() => {
    const set = (k, v) => setN(x => ({ ...x, [k]: v }))
    if (can('manage_students')) countOf('students', q => q.eq('active', true)).then(v => set('students', v))
    if (can('manage_groups')) countOf('groups', q => q.eq('active', true)).then(v => set('groups', v))
    if (can('follow_reports')) countOf('report_feed', q => q.in('wa_status', ['pending', 'failed'])).then(v => set('pending', v))
    if (can('follow_teachers')) supabase.from('teacher_follow').select('overdue,status').then(r => {
      if (r.error) return
      set('teachers', r.data.filter(x => x.status === 'active').length); set('overdue', r.data.reduce((a, x) => a + x.overdue, 0))
    })
    if (can('manage_finance')) supabase.from('student_balances').select('debt').then(r => !r.error && set('debt', r.data.reduce((a, x) => a + Number(x.debt), 0)))
  }, [can])

  const cards = [
    ['manage_students', '/admin/students', 'الطلاب النشطون', n.students],
    ['manage_groups', '/admin/groups', 'المجموعات النشطة', n.groups],
    ['follow_teachers', '/admin/teachers', 'المعلمون النشطون', n.teachers],
    ['follow_teachers', '/admin/teachers', 'حصص مضت دون تقرير', n.overdue],
    ['follow_reports', '/admin/reports', 'تقارير بانتظار الإرسال/فاشلة', n.pending],
    ['manage_finance', '/admin/finance', 'إجمالي مديونيات الطلاب', n.debt == null ? undefined : money(n.debt)],
  ].filter(([perm]) => can(perm))

  return (
    <section className="section">
      <div className="container stack">
        <div className="card card--accent">
          <h1 style={{ fontSize: '1.8rem' }}>{profile.role === 'admin' ? 'لوحة المدير' : 'لوحة المشرف'}</h1>
          <p>أهلاً {profile.full_name}.</p>
          {profile.role === 'supervisor' && <p className="muted" style={{ marginBottom: 0 }}>تظهر لك الأقسام التي منحك المدير صلاحيتها فقط.</p>}
        </div>
        {cards.length > 0 && (
          <div className="stats">
            {cards.map(([, to, label, v]) => (
              <Link key={label} to={to} className="stat" data-card={label}><b>{v == null ? '…' : typeof v === 'number' ? v.toLocaleString('ar-EG') : v}</b><span>{label}</span></Link>
            ))}
          </div>
        )}
        {profile.role === 'admin' && <p className="muted">تعديل نصوص الموقع وصوره وإخفاء صفحاته بلا كود يُضاف في المرحلة 9 داخل هذه اللوحة.</p>}
      </div>
    </section>
  )
}
