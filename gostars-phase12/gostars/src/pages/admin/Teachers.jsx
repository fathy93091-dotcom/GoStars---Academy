import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fmtDate } from '../../lib/teacherApi.js'
import usePageTitle from '../../hooks/usePageTitle.js'

// متابعة المعلمين: نشاط كل معلم في الأكاديمية. «حصص مضت دون تقرير» = حصص مجدولة تاريخها فات ولم تُتمّ بتقرير يومي.
export default function Teachers() {
  usePageTitle('متابعة المعلمين')
  const [rows, setRows] = useState(null)
  useEffect(() => { supabase.from('teacher_follow').select('*').then(r => setRows((r.data || []).sort((a, b) => b.overdue - a.overdue || a.full_name.localeCompare(b.full_name, 'ar')))) }, [])
  return (
    <section className="section"><div className="container stack">
      <div className="card">
        <h1 style={{ fontSize: '1.5rem' }}>متابعة المعلمين</h1>
        {rows === null ? <p>جارٍ التحميل…</p> : rows.length === 0 ? <p className="muted">لا يوجد معلمون بعد.</p> : (
          <div className="table-wrap"><table className="table" id="teachers-table">
            <thead><tr><th>المعلم</th><th>الحالة</th><th>المجموعات</th><th>الطلاب</th><th>حصص منتهية (30 يوماً)</th><th>قادمة</th><th>مضت دون تقرير</th><th>آخر حصة</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.teacher_id} data-teacher={r.teacher_id}>
                <td>{r.full_name}</td><td><span className={`chip ${r.status === 'active' ? '' : 'chip--cancelled'}`}>{r.status === 'active' ? 'نشط' : 'موقوف'}</span></td>
                <td>{r.groups_count}</td><td>{r.students_count}</td><td>{r.done_30d}</td><td>{r.upcoming}</td>
                <td>{r.overdue > 0 ? <span className="chip chip--debt">{r.overdue}</span> : 0}</td><td>{r.last_done ? fmtDate(r.last_done) : '—'}</td>
              </tr>))}</tbody>
          </table></div>)}
      </div>
    </div></section>
  )
}
