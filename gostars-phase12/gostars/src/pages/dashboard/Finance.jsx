import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'
import { todayStr, monthStart, addMonths, monthLabel, money } from '../../lib/teacherApi.js'

// المالية (المدير + المشرف بصلاحية manage_finance): أرصدة طلاب الأكاديمية ومستحقات المعلمين
export default function Finance() {
  usePageTitle('المالية')
  const [tab, setTab] = useState('students')
  return (
    <section className="section">
      <div className="container stack">
        <div className="card">
          <h1 style={{ fontSize: '1.5rem' }}>المالية</h1>
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={tab === 'students'} className={tab === 'students' ? 'on' : ''} onClick={() => setTab('students')}>أرصدة الطلاب</button>
            <button role="tab" aria-selected={tab === 'teachers'} className={tab === 'teachers' ? 'on' : ''} onClick={() => setTab('teachers')}>مستحقات المعلمين</button>
          </div>
        </div>
        {tab === 'students' ? <StudentsTab /> : <TeachersTab />}
      </div>
    </section>
  )
}

function StudentsTab() {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [f, setF] = useState('all')
  useEffect(() => { supabase.from('student_balances').select('*').order('full_name').then(r => setRows(r.data || [])) }, [])

  const t = useMemo(() => (rows || []).reduce((a, r) => ({ consumed: a.consumed + Number(r.consumed), paid: a.paid + Number(r.total_paid), debt: a.debt + Number(r.debt), credit: a.credit + Number(r.credit) }), { consumed: 0, paid: 0, debt: 0, credit: 0 }), [rows])
  const shown = (rows || []).filter(r => (f === 'all' || (f === 'debt' && Number(r.debt) > 0) || (f === 'credit' && Number(r.credit) > 0))
    && (!q.trim() || r.full_name.includes(q.trim()) || (r.student_code || '').toLowerCase().includes(q.trim().toLowerCase())))

  if (rows === null) return <p className="center-note">جارٍ التحميل…</p>
  return (<>
    <div className="card">
      <div className="stats">
        <div className="stat"><b data-k="t-consumed">{money(t.consumed)}</b><span>قيمة الحصص المستهلكة</span></div>
        <div className="stat"><b data-k="t-paid">{money(t.paid)}</b><span>إجمالي المدفوعات</span></div>
        <div className="stat stat--debt"><b data-k="t-debt">{money(t.debt)}</b><span>مديونيات الطلاب</span></div>
        <div className="stat stat--gold"><b data-k="t-credit">{money(t.credit)}</b><span>أرصدة متبقية للطلاب</span></div>
      </div>
    </div>
    <div className="card">
      <div className="form-grid">
        <div className="form-row"><label htmlFor="fq">بحث بالاسم أو الكود</label><input id="fq" className="field" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="form-row"><label htmlFor="ff">عرض</label>
          <select id="ff" className="field" value={f} onChange={e => setF(e.target.value)}>
            <option value="all">كل الطلاب</option><option value="debt">المدينون فقط</option><option value="credit">أصحاب الرصيد فقط</option></select></div>
      </div>
      {shown.length === 0 ? <p className="muted">لا توجد نتائج.</p> : (
        <div className="table-wrap"><table className="table" id="balances-table">
          <thead><tr><th>الطالب</th><th>الكود</th><th>الحصص</th><th>المستهلك</th><th>المدفوع</th><th>الحالة</th></tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.student_id} className="fin-row" data-student={r.student_id}>
              <td><Link to={`/admin/finance/${r.student_id}`}>{r.full_name}</Link></td><td>{r.student_code}</td><td>{Number(r.attended_lessons)}</td>
              <td>{money(r.consumed)}</td><td>{money(r.total_paid)}</td>
              <td>{Number(r.debt) > 0 ? <span className="chip chip--debt">مديونية {money(r.debt)}</span> : Number(r.credit) > 0 ? <span className="chip chip--credit">رصيد {money(r.credit)}</span> : <span className="chip">متزن</span>}</td>
            </tr>))}</tbody>
        </table></div>)}
    </div>
  </>)
}

function TeachersTab() {
  const [month, setMonth] = useState(monthStart(todayStr()))
  const [rows, setRows] = useState(null)
  useEffect(() => {
    setRows(null)
    supabase.from('teacher_earnings').select('*').eq('month', month).order('teacher_name').then(r => setRows(r.data || []))
  }, [month])
  const total = (rows || []).reduce((a, r) => a + Number(r.amount), 0)
  return (
    <div className="card">
      <div className="row-between">
        <button className="btn btn--light btn--sm" onClick={() => setMonth(m => addMonths(m, -1))}>‹ السابق</button>
        <strong>{monthLabel(month)}</strong>
        <button className="btn btn--light btn--sm" disabled={month >= monthStart(todayStr())} onClick={() => setMonth(m => addMonths(m, 1))}>التالي ›</button>
      </div>
      {rows === null ? <p>جارٍ التحميل…</p> : rows.length === 0 ? <p className="muted">لا حصص منتهية في هذا الشهر.</p> : (
        <div className="table-wrap"><table className="table" id="earnings-table">
          <thead><tr><th>المعلم</th><th>الحصص</th><th>مرات الحضور</th><th>سعر الفردي</th><th>سعر الطالب بالمجموعة</th><th>المستحق</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.teacher_id}><td>{r.teacher_name}</td><td>{r.lessons_done}</td><td>{r.attendances}</td><td>{money(r.lesson_rate)}</td><td>{money(r.group_rate_per_student)}</td><td>{money(r.amount)}</td></tr>))}</tbody>
          <tfoot><tr><th colSpan={5}>الإجمالي</th><th data-k="e-total">{money(total)}</th></tr></tfoot>
        </table></div>)}
      <p className="muted" style={{ marginBottom: 0 }}>الأجر = سعر الوحدة وقت إتمام الحصة × عدد الحاضرين (الفردي: سعر ثابت إن حضر الطالب). حصص المعلم الشخصية لا تظهر هنا.</p>
    </div>
  )
}
