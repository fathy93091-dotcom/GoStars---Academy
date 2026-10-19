import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { StudyType } from '../../lib/adminData.js'
import { money } from '../../lib/teacherApi.js'
import usePageTitle from '../../hooks/usePageTitle.js'

const blank = { full_name: '', grade: '', curriculum: '', study_type: 'group', lesson_price: '0' }

export default function Students() {
  usePageTitle('الطلاب')
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState(''); const [show, setShow] = useState('active')
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('students').select('id,student_code,full_name,grade,curriculum,study_type,lesson_price,active').order('full_name')
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function add(e) {
    e.preventDefault(); if (busy) return
    const name = form.full_name.trim(); const price = Number(form.lesson_price)
    if (name.length < 2) return setErr('اكتب اسم الطالب (حرفان على الأقل).')
    if (!Number.isFinite(price) || price < 0 || price > 100000) return setErr('سعر الحصة غير صالح.')
    setBusy(true); setErr('')
    const { data, error } = await supabase.from('students').insert({
      full_name: name, grade: form.grade.trim() || null, curriculum: form.curriculum.trim() || null,
      study_type: form.study_type, lesson_price: price, scope: 'academy',
    }).select('id').single()
    setBusy(false)
    if (error || !data?.id) return setErr('تعذّر إضافة الطالب.')
    nav(`/admin/students/${data.id}`)
  }

  const shown = (rows || []).filter(r => (show === 'all' || (show === 'active') === r.active)
    && (!q.trim() || r.full_name.includes(q.trim()) || r.student_code.toLowerCase().includes(q.trim().toLowerCase())))

  return (
    <section className="section"><div className="container stack">
      <form className="card" onSubmit={add} aria-label="إضافة طالب">
        <h1 style={{ fontSize: '1.5rem' }}>الطلاب</h1>
        <h2>إضافة طالب</h2>
        <div className="form-grid">
          <div className="form-row"><label htmlFor="n-name">الاسم</label><input id="n-name" className="field" maxLength={80} value={form.full_name} onChange={set('full_name')} /></div>
          <div className="form-row"><label htmlFor="n-grade">الصف</label><input id="n-grade" className="field" value={form.grade} onChange={set('grade')} /></div>
          <div className="form-row"><label htmlFor="n-cur">المنهج</label><input id="n-cur" className="field" value={form.curriculum} onChange={set('curriculum')} /></div>
          <div className="form-row"><label htmlFor="n-type">نوع الدراسة</label>
            <select id="n-type" className="field" value={form.study_type} onChange={set('study_type')}>{Object.entries(StudyType).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="form-row"><label htmlFor="n-price">سعر الحصة (ج)</label><input id="n-price" type="number" min="0" step="0.5" className="field" value={form.lesson_price} onChange={set('lesson_price')} /></div>
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'إضافة وفتح الملف'}</button>
      </form>

      <div className="card">
        <div className="form-grid">
          <div className="form-row"><label htmlFor="sq">بحث بالاسم أو الكود</label><input id="sq" className="field" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="form-row"><label htmlFor="ss">عرض</label>
            <select id="ss" className="field" value={show} onChange={e => setShow(e.target.value)}><option value="active">النشطون</option><option value="inactive">المعطّلون</option><option value="all">الكل</option></select></div>
        </div>
        {rows === null ? <p>جارٍ التحميل…</p> : shown.length === 0 ? <p className="muted">لا توجد نتائج.</p> : (
          <div className="table-wrap"><table className="table" id="students-table">
            <thead><tr><th>الطالب</th><th>الكود</th><th>الصف</th><th>النوع</th><th>سعر الحصة</th><th>الحالة</th></tr></thead>
            <tbody>{shown.map(r => (
              <tr key={r.id} data-student={r.id}>
                <td><Link to={`/admin/students/${r.id}`}>{r.full_name}</Link></td><td>{r.student_code}</td><td>{r.grade || '—'}</td>
                <td>{StudyType[r.study_type]}</td><td>{money(r.lesson_price)}</td>
                <td><span className={`chip ${r.active ? '' : 'chip--cancelled'}`}>{r.active ? 'نشط' : 'معطّل'}</span></td>
              </tr>))}</tbody>
          </table></div>)}
      </div>
    </div></section>
  )
}
