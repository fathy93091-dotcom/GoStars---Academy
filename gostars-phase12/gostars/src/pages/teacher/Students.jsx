import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'
import { refreshPackages, money } from '../../lib/teacherApi.js'

const blank = { full_name: '', grade: '', curriculum: '', study_type: 'private', lesson_price: '' }

export default function Students() {
  usePageTitle('الطلاب')
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [pk, setPk] = useState({})
  const [q, setQ] = useState('')
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  async function load() {
    await refreshPackages()
    const [s, p] = await Promise.all([
      supabase.from('students').select('id,student_code,full_name,grade,curriculum,study_type,scope,active').order('full_name'),
      supabase.from('package_progress').select('student_id,kind,lessons_total,ends_on,used_lessons').eq('status', 'active'),
    ])
    if (s.error) { setMsg({ type: 'err', text: 'تعذّر تحميل الطلاب.' }); setRows([]); return }
    setRows(s.data); setPk(Object.fromEntries((p.data || []).map(x => [x.student_id, x])))
  }
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (rows || []).filter(r => !q.trim() || r.full_name.includes(q.trim())), [rows, q])
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function onAdd(e) {
    e.preventDefault()
    if (form.full_name.trim().length < 2) return setMsg({ type: 'err', text: 'اكتب اسم الطالب.' })
    setBusy(true); setMsg({ type: '', text: '' })
    const { error } = await supabase.from('students').insert({
      full_name: form.full_name.trim(), grade: form.grade.trim() || null, curriculum: form.curriculum.trim() || null,
      study_type: form.study_type, lesson_price: Number(form.lesson_price) || 0, scope: 'personal', owner_teacher_id: profile.id,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: 'تعذّرت إضافة الطالب.' })
    setForm(blank); setMsg({ type: 'ok', text: 'تمت إضافة الطالب الخاص.' }); load()
  }

  const progress = k => !k ? '—' : k.kind === 'lessons' ? `${k.used_lessons} / ${k.lessons_total} حصص` : `شهرية حتى ${k.ends_on}`

  return (
    <section className="section">
      <div className="container stack">
        <div className="card">
          <div className="row-between">
            <h1 style={{ fontSize: '1.5rem' }}>طلابي</h1>
            <input className="field" style={{ maxWidth: 260 }} placeholder="بحث بالاسم" aria-label="بحث" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {rows === null ? <p>جارٍ التحميل…</p> : shown.length === 0 ? <p className="muted">لا يوجد طلاب.</p> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>الكود</th><th>الاسم</th><th>المرحلة</th><th>النوع</th><th>الباقة الحالية</th><th></th></tr></thead>
              <tbody>{shown.map(s => (
                <tr key={s.id}>
                  <td><code>{s.student_code}</code></td>
                  <td>{s.full_name}{s.scope === 'personal' && <span className="chip chip--personal"> خاص</span>}</td>
                  <td>{s.grade || '—'}</td><td>{s.study_type === 'private' ? 'فردي' : 'مجموعة'}</td>
                  <td>{progress(pk[s.id])}</td>
                  <td><Link className="btn btn--sm" to={`/teacher/students/${s.id}`}>الملف</Link></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>

        <form className="card" onSubmit={onAdd} noValidate>
          <h2>إضافة طالب خاص بي</h2>
          <p className="muted">طلاب الأكاديمية يضيفهم المدير. هذا النموذج لطلابك الشخصيين فقط، وبياناتهم لا يراها غيرك.</p>
          <div className="form-grid">
            <div className="form-row"><label htmlFor="n">الاسم</label><input id="n" className="field" value={form.full_name} onChange={set('full_name')} /></div>
            <div className="form-row"><label htmlFor="g">المرحلة</label><input id="g" className="field" value={form.grade} onChange={set('grade')} /></div>
            <div className="form-row"><label htmlFor="c">المنهج</label><input id="c" className="field" value={form.curriculum} onChange={set('curriculum')} /></div>
            <div className="form-row"><label htmlFor="st">نوع الدراسة</label>
              <select id="st" className="field" value={form.study_type} onChange={set('study_type')}><option value="private">فردي</option><option value="group">مجموعة</option></select></div>
            <div className="form-row"><label htmlFor="p">سعر الحصة {form.lesson_price ? `(${money(form.lesson_price)})` : ''}</label>
              <input id="p" type="number" min="0" className="field" value={form.lesson_price} onChange={set('lesson_price')} /></div>
          </div>
          {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
          <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'إضافة'}</button>
        </form>
      </div>
    </section>
  )
}
