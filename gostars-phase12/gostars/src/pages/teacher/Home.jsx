import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'
import { LESSON_SELECT, todayStr, weekStart, addDays, monthStart, monthEnd, fmtTime, fmtDate, lessonTarget, STATUS_LABEL, refreshPackages, money } from '../../lib/teacherApi.js'

export default function TeacherHome() {
  usePageTitle('لوحة المعلم')
  const { profile } = useAuth()
  const today = todayStr()
  const [lessons, setLessons] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [earn, setEarn] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let off = false
    ;(async () => {
      await refreshPackages()
      const ws = weekStart(today)
      const [l, p, s, e] = await Promise.all([
        supabase.from('lessons').select(LESSON_SELECT).gte('lesson_date', ws).lte('lesson_date', addDays(ws, 6)).neq('status', 'cancelled').order('lesson_date').order('start_time'),
        supabase.from('package_progress').select('student_id,kind,lessons_total,ends_on,used_lessons').eq('status', 'active'),
        supabase.from('students').select('id,full_name'),
        supabase.from('teacher_earnings').select('lessons_done,amount').eq('month', monthStart(today)),
      ])
      if (off) return
      if (l.error) { setErr('تعذّر تحميل الجدول.'); setLessons([]); return }
      setLessons(l.data)
      const names = Object.fromEntries((s.data || []).map(x => [x.id, x.full_name]))
      const out = []
      for (const k of p.data || []) {
        if (k.kind === 'lessons' && k.lessons_total - k.used_lessons <= 1) out.push({ id: k.student_id, name: names[k.student_id], msg: `متبقي ${Math.max(k.lessons_total - k.used_lessons, 0)} من ${k.lessons_total} حصص` })
        if (k.kind === 'monthly' && k.ends_on <= addDays(today, 3)) out.push({ id: k.student_id, name: names[k.student_id], msg: `تنتهي الباقة ${k.ends_on}` })
      }
      setAlerts(out)
      setEarn(e.data?.[0] || { lessons_done: 0, amount: 0 })
    })()
    return () => { off = true }
  }, [today])

  const todays = (lessons || []).filter(l => l.lesson_date === today)
  const weekDone = (lessons || []).filter(l => l.status === 'done').length

  return (
    <section className="section">
      <div className="container stack">
        <div className="card card--accent">
          <h1 style={{ fontSize: '1.6rem' }}>أهلاً {profile.full_name}</h1>
          <div className="stats">
            <div className="stat"><b>{lessons ? todays.length : '…'}</b><span>حصص اليوم</span></div>
            <div className="stat"><b>{lessons ? lessons.length : '…'}</b><span>حصص الأسبوع</span></div>
            <div className="stat"><b>{lessons ? weekDone : '…'}</b><span>تمت هذا الأسبوع</span></div>
            <Link className="stat stat--gold" to="/teacher/earnings"><b>{earn ? money(earn.amount) : '…'}</b><span>أرباح هذا الشهر</span></Link>
          </div>
        </div>
        {err && <p className="error" role="alert">{err}</p>}

        <div className="card">
          <div className="row-between"><h2>حصص اليوم</h2><Link className="btn btn--light btn--sm" to="/teacher/schedule">الجدول الكامل</Link></div>
          {lessons === null ? <p>جارٍ التحميل…</p> : todays.length === 0 ? <p className="muted">لا توجد حصص اليوم.</p> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>الوقت</th><th>المجموعة / الطالب</th><th>العنوان</th><th>الحالة</th><th></th></tr></thead>
              <tbody>{todays.map(l => (
                <tr key={l.id}>
                  <td>{fmtTime(l.start_time)}</td><td>{lessonTarget(l)}</td><td>{l.title || '—'}</td>
                  <td><span className={`chip chip--${l.status}`}>{STATUS_LABEL[l.status]}</span></td>
                  <td><Link className="btn btn--sm" to={`/teacher/lessons/${l.id}`}>{l.status === 'done' ? 'عرض التقرير' : 'التقرير اليومي'}</Link></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>

        {alerts.length > 0 && (
          <div className="card">
            <h2>باقات تحتاج متابعة</h2>
            <ul className="plain">{alerts.map((a, i) => (
              <li key={i}><Link to={`/teacher/students/${a.id}`}>{a.name}</Link> — {a.msg}</li>))}</ul>
          </div>
        )}
        <p className="muted" style={{ textAlign: 'center' }}>الأسبوع {fmtDate(weekStart(today))} → {fmtDate(addDays(weekStart(today), 6))}</p>
      </div>
    </section>
  )
}
