import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'
import { LESSON_SELECT, todayStr, weekStart, addDays, fmtDate, fmtTime, lessonTarget, STATUS_LABEL } from '../../lib/teacherApi.js'

export default function Schedule() {
  usePageTitle('جدول الحصص')
  const { profile } = useAuth()
  const today = todayStr()
  const [view, setView] = useState('week')           // today | week
  const [start, setStart] = useState(weekStart(today))
  const [rows, setRows] = useState(null)
  const [groups, setGroups] = useState([])
  const [students, setStudents] = useState([])
  const [form, setForm] = useState({ target: '', lesson_date: today, start_time: '', title: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  const range = view === 'today' ? [today, today] : [start, addDays(start, 6)]
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('lessons').select(LESSON_SELECT)
      .gte('lesson_date', range[0]).lte('lesson_date', range[1]).order('lesson_date').order('start_time')
    if (error) { setMsg({ type: 'err', text: 'تعذّر تحميل الجدول.' }); setRows([]) } else setRows(data)
  }, [range[0], range[1]])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRows(null); load() }, [load])

  useEffect(() => {
    ;(async () => {
      const [g, s] = await Promise.all([
        supabase.from('groups').select('id,name').eq('active', true).order('name'),
        supabase.from('students').select('id,full_name').eq('active', true).order('full_name'),
      ])
      setGroups(g.data || []); setStudents(s.data || [])
    })()
  }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  async function onAdd(e) {
    e.preventDefault()
    if (!form.target) return setMsg({ type: 'err', text: 'اختر المجموعة أو الطالب.' })
    setBusy(true); setMsg({ type: '', text: '' })
    const [kind, id] = form.target.split(':')
    const row = {
      teacher_id: profile.id, lesson_date: form.lesson_date, title: form.title.trim() || null,
      start_time: form.start_time || null, ...(kind === 'g' ? { group_id: id } : { student_id: id }),
    }
    const { error } = await supabase.from('lessons').insert(row)
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: 'تعذّر إضافة الحصة. تأكد أنك تدرّس هذه المجموعة/الطالب.' })
    setMsg({ type: 'ok', text: 'تمت إضافة الحصة.' }); setForm(f => ({ ...f, title: '' })); load()
  }

  async function setStatus(l, status) {
    if (status === 'cancelled' && !window.confirm('إلغاء هذه الحصة؟')) return
    const { error } = await supabase.from('lessons').update({ status }).eq('id', l.id)
    if (error) setMsg({ type: 'err', text: 'تعذّر تغيير الحالة.' }); else load()
  }

  const days = view === 'today' ? [today] : Array.from({ length: 7 }, (_, i) => addDays(start, i))

  return (
    <section className="section">
      <div className="container stack">
        <div className="card">
          <div className="row-between">
            <h1 style={{ fontSize: '1.5rem' }}>جدول الحصص</h1>
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={view === 'today'} className={view === 'today' ? 'on' : ''} onClick={() => setView('today')}>اليوم</button>
              <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>الأسبوع</button>
            </div>
          </div>
          {view === 'week' && (
            <div className="row-between" style={{ marginTop: 8 }}>
              <button className="btn btn--light btn--sm" onClick={() => setStart(addDays(start, -7))}>الأسبوع السابق ›</button>
              <span className="muted">{fmtDate(start)} → {fmtDate(addDays(start, 6))}</span>
              <button className="btn btn--light btn--sm" onClick={() => setStart(addDays(start, 7))}>‹ الأسبوع التالي</button>
            </div>
          )}
        </div>

        {rows === null ? <p className="center-note">جارٍ التحميل…</p> : days.map(d => {
          const list = rows.filter(r => r.lesson_date === d)
          return (
            <div className={`card ${d === today ? 'card--accent' : ''}`} key={d} data-day={d}>
              <h3>{fmtDate(d)} {d === today && <span className="badge">اليوم</span>}</h3>
              {list.length === 0 ? <p className="muted">لا حصص.</p> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>الوقت</th><th>المجموعة / الطالب</th><th>المادة</th><th>العنوان</th><th>الحالة</th><th></th></tr></thead>
                  <tbody>{list.map(l => (
                    <tr key={l.id}>
                      <td>{fmtTime(l.start_time)}</td><td>{lessonTarget(l)}{l.scope === 'personal' && <span className="chip chip--personal"> خاص</span>}</td>
                      <td>{l.subjects?.name || '—'}</td><td>{l.title || '—'}</td>
                      <td><span className={`chip chip--${l.status}`}>{STATUS_LABEL[l.status]}</span></td>
                      <td className="actions">
                        <Link className="btn btn--sm" to={`/teacher/lessons/${l.id}`}>{l.status === 'done' ? 'عرض التقرير' : 'التقرير اليومي'}</Link>
                        {l.status === 'scheduled' && <button className="btn btn--light btn--sm" onClick={() => setStatus(l, 'cancelled')}>إلغاء</button>}
                      </td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </div>)
        })}

        <form className="card" onSubmit={onAdd}>
          <h2>إضافة حصة</h2>
          <div className="form-grid">
            <div className="form-row"><label htmlFor="target">المجموعة / الطالب</label>
              <select id="target" className="field" value={form.target} onChange={set('target')}>
                <option value="">— اختر —</option>
                {groups.length > 0 && <optgroup label="مجموعات">{groups.map(g => <option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}</optgroup>}
                {students.length > 0 && <optgroup label="حصة فردية">{students.map(s => <option key={s.id} value={`s:${s.id}`}>{s.full_name}</option>)}</optgroup>}
              </select></div>
            <div className="form-row"><label htmlFor="d">التاريخ</label><input id="d" type="date" className="field" value={form.lesson_date} onChange={set('lesson_date')} required /></div>
            <div className="form-row"><label htmlFor="t">الوقت</label><input id="t" type="time" className="field" value={form.start_time} onChange={set('start_time')} /></div>
            <div className="form-row"><label htmlFor="ti">عنوان الحصة</label><input id="ti" className="field" value={form.title} onChange={set('title')} /></div>
          </div>
          {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
          <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'إضافة'}</button>
        </form>
      </div>
    </section>
  )
}
