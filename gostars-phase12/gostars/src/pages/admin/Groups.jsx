import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'

export default function Groups() {
  usePageTitle('المجموعات')
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [opts, setOpts] = useState({ teachers: [], subjects: [] })
  const [f, setF] = useState({ name: '', teacher_id: '', subject_id: '', curriculum: '', link: '' })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('groups').select('id,name,active,curriculum,teachers(full_name),subjects(name)').order('name')
    setRows(data || [])
  }, [])
  useEffect(() => {
    load()
    Promise.all([supabase.from('teachers').select('id,full_name').order('full_name'), supabase.from('subjects').select('id,name').eq('active', true).order('name')])
      .then(([t, s]) => setOpts({ teachers: t.data || [], subjects: s.data || [] }))
  }, [load])
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))

  async function add(e) {
    e.preventDefault(); if (busy) return
    if (f.name.trim().length < 2) return setErr('اكتب اسم المجموعة.')
    if (!f.teacher_id) return setErr('اختر المعلم.')
    if (f.link.trim() && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(f.link.trim())) return setErr('رابط واتساب غير صحيح (يبدأ بـ https://chat.whatsapp.com/).')
    setBusy(true); setErr('')
    const { data, error } = await supabase.from('groups').insert({ name: f.name.trim(), teacher_id: f.teacher_id, subject_id: f.subject_id || null, curriculum: f.curriculum.trim() || null, scope: 'academy' }).select('id').single()
    if (error || !data?.id) { setBusy(false); return setErr('تعذّر إنشاء المجموعة.') }
    if (f.link.trim()) await supabase.from('group_whatsapp').upsert({ group_id: data.id, whatsapp_link: f.link.trim() }, { onConflict: 'group_id' })
    setBusy(false); nav(`/admin/groups/${data.id}`)
  }

  return (
    <section className="section"><div className="container stack">
      <form className="card" onSubmit={add} aria-label="إضافة مجموعة">
        <h1 style={{ fontSize: '1.5rem' }}>المجموعات</h1>
        <h2>إضافة مجموعة</h2>
        <div className="form-grid">
          <div className="form-row"><label htmlFor="g-name">اسم المجموعة</label><input id="g-name" className="field" maxLength={80} value={f.name} onChange={set('name')} /></div>
          <div className="form-row"><label htmlFor="g-teacher">المعلم</label>
            <select id="g-teacher" className="field" value={f.teacher_id} onChange={set('teacher_id')}><option value="">— اختر —</option>{opts.teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></div>
          <div className="form-row"><label htmlFor="g-sub">المادة</label>
            <select id="g-sub" className="field" value={f.subject_id} onChange={set('subject_id')}><option value="">— بلا —</option>{opts.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="form-row"><label htmlFor="g-cur">المنهج</label><input id="g-cur" className="field" value={f.curriculum} onChange={set('curriculum')} /></div>
          <div className="form-row"><label htmlFor="g-link">رابط مجموعة واتساب (يستعمله البوت فقط)</label><input id="g-link" dir="ltr" className="field" value={f.link} onChange={set('link')} /></div>
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'إنشاء وفتح المجموعة'}</button>
      </form>
      <div className="card">
        {rows === null ? <p>جارٍ التحميل…</p> : rows.length === 0 ? <p className="muted">لا توجد مجموعات بعد.</p> : (
          <div className="table-wrap"><table className="table" id="groups-table">
            <thead><tr><th>المجموعة</th><th>المعلم</th><th>المادة</th><th>الحالة</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} data-group={r.id}><td><Link to={`/admin/groups/${r.id}`}>{r.name}</Link></td><td>{r.teachers?.full_name || '—'}</td><td>{r.subjects?.name || '—'}</td>
                <td><span className={`chip ${r.active ? '' : 'chip--cancelled'}`}>{r.active ? 'نشطة' : 'معطّلة'}</span></td></tr>))}</tbody>
          </table></div>)}
      </div>
    </div></section>
  )
}
