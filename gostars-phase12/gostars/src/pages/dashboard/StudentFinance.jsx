import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import FinancePanel from '../../components/FinancePanel.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'

// صفحة مستقلة للحساب المالي لطالب أكاديمية (المدير/المشرف بصلاحية manage_finance)
export default function StudentFinance() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [s, setS] = useState(undefined)
  usePageTitle(s?.full_name ? `مالية ${s.full_name}` : 'مالية الطالب')
  useEffect(() => { supabase.from('student_balances').select('student_id,full_name,student_code').eq('student_id', id).maybeSingle().then(r => setS(r.data || null)) }, [id])
  if (s === undefined) return <p className="center-note">جارٍ التحميل…</p>
  if (s === null) return <p className="center-note">الطالب غير موجود أو لا تملك صلاحية مالية عليه.</p>
  const admin = profile.role === 'admin'
  return (
    <section className="section">
      <div className="container stack">
        <div className="card">
          <div className="row-between">
            <div><h1 style={{ fontSize: '1.5rem' }}>{s.full_name}</h1><p className="muted" style={{ margin: 0 }}>{s.student_code}</p></div>
            <Link className="btn btn--light btn--sm" to="/admin/finance">‹ المالية</Link>
          </div>
        </div>
        <FinancePanel studentId={id} canFix={admin} canEdit={admin} />
      </div>
    </section>
  )
}
