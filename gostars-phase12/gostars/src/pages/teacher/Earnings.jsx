import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'
import { todayStr, monthStart, monthEnd, addMonths, monthLabel, fmtDate, fmtTime, money } from '../../lib/teacherApi.js'

export default function Earnings() {
  usePageTitle('أرباحي')
  const { profile } = useAuth()
  const [month, setMonth] = useState(monthStart(todayStr()))
  const [rows, setRows] = useState(null)
  const [history, setHistory] = useState([])
  const [personal, setPersonal] = useState(0)
  const [rate, setRate] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('teachers').select('lesson_rate,group_rate_per_student').eq('id', profile.id).maybeSingle().then(r => setRate(r.data || null))
    supabase.from('teacher_earnings').select('month,lessons_done,amount').order('month', { ascending: false }).limit(12).then(r => setHistory(r.data || []))
  }, [profile.id])

  useEffect(() => {
    setRows(null)
    ;(async () => {
      const [a, b] = await Promise.all([
        supabase.from('teacher_lesson_earnings').select('lesson_id,lesson_date,start_time,title,group_name,student_name,is_group,rate,attended,amount')
          .gte('lesson_date', month).lte('lesson_date', monthEnd(month)).order('lesson_date').order('start_time'),
        supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('status', 'done').eq('scope', 'personal')
          .gte('lesson_date', month).lte('lesson_date', monthEnd(month)),
      ])
      if (a.error) { setErr('تعذّر تحميل الأرباح.'); setRows([]); return }
      setErr(''); setRows(a.data); setPersonal(b.count || 0)
    })()
  }, [month])

  const total = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0)

  return (
    <section className="section">
      <div className="container stack">
        <div className="card card--accent">
          <div className="row-between">
            <h1 style={{ fontSize: '1.5rem' }}>أرباحي</h1>
            <div className="row-between" style={{ gap: 8 }}>
              <button className="btn btn--light btn--sm" onClick={() => setMonth(addMonths(month, -1))}>›</button>
              <strong>{monthLabel(month)}</strong>
              <button className="btn btn--light btn--sm" onClick={() => setMonth(addMonths(month, 1))}>‹</button>
            </div>
          </div>
          <div className="stats">
            <div className="stat stat--gold"><b data-testid="total">{rows ? money(total) : '…'}</b><span>إجمالي الشهر</span></div>
            <div className="stat"><b>{rows ? rows.length : '…'}</b><span>حصص الأكاديمية المنتهية</span></div>
            <div className="stat"><b>{rate ? money(rate.lesson_rate) : '—'}</b><span>الحصة الفردية (ثابت، يحدده المدير)</span></div>
            <div className="stat"><b>{rate ? money(rate.group_rate_per_student) : '—'}</b><span>المجموعة: لكل طالب حاضر</span></div>
            <div className="stat"><b>{personal}</b><span>حصص خاصة (لا تُحتسب هنا)</span></div>
          </div>
          <p className="ai-note">الفردي: سعر ثابت إن حضر الطالب. المجموعة: سعر الطالب × عدد الحاضرين (حاضر أو متأخر) في التقرير اليومي. يُحسب بسعر وقت إتمام الحصة؛ تغيير المدير للسعر لاحقاً لا يؤثر على الحصص السابقة.</p>
        </div>
        {err && <p className="error" role="alert">{err}</p>}

        <div className="card">
          <h2>تفاصيل الحصص</h2>
          {rows === null ? <p>جارٍ التحميل…</p> : rows.length === 0 ? <p className="muted">لا حصص منتهية في هذا الشهر.</p> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>التاريخ</th><th>الوقت</th><th>المجموعة / الطالب</th><th>النوع</th><th>الحاضرون</th><th>السعر</th><th>الأجر</th></tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.lesson_id}><td>{fmtDate(r.lesson_date)}</td><td>{fmtTime(r.start_time)}</td><td>{r.group_name || r.student_name || '—'}</td><td>{r.is_group ? 'مجموعة' : 'فردي'}</td><td>{r.attended}</td><td>{money(r.rate)}</td><td>{money(r.amount)}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>

        {history.length > 0 && (
          <div className="card">
            <h2>الأشهر السابقة</h2>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>الشهر</th><th>الحصص</th><th>الإجمالي</th></tr></thead>
              <tbody>{history.map(h => <tr key={h.month}><td>{monthLabel(h.month)}</td><td>{h.lessons_done}</td><td>{money(h.amount)}</td></tr>)}</tbody>
            </table></div>
          </div>
        )}
      </div>
    </section>
  )
}
