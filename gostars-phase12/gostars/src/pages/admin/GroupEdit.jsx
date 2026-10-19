import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'

// صفحة المجموعة: البيانات، المعلم (تغييره ينقل الأعضاء والحصص القادمة تلقائياً)، رابط واتساب (للبوت فقط)، الأعضاء
export default function GroupEdit() {
  const { id } = useParams()
  const [g, setG] = useState(undefined)
  const [f, setF] = useState(null)
  const [link, setLink] = useState('')
  const [members, setMembers] = useState([])
  const [pool, setPool] = useState([])
  const [pick, setPick] = useState('')
  const [opts, setOpts] = useState({ teachers: [], subjects: [] })
  const [msg, setMsg] = useState({ type: '', text: '' }); const [busy, setBusy] = useState(false)
  usePageTitle(g?.name || 'المجموعة')
  const ok = text => setMsg({ type: 'ok', text }); const bad = text => setMsg({ type: 'err', text })

  const load = useCallback(async () => {
    const r = await supabase.from('groups').select('id,name,teacher_id,subject_id,curriculum,active').eq('id', id).maybeSingle()
    if (!r.data || !r.data.id) return setG(null)
    setG(r.data); setF({ name: r.data.name, teacher_id: r.data.teacher_id, subject_id: r.data.subject_id || '', curriculum: r.data.curriculum || '', active: r.data.active })
    const [w, m, s] = await Promise.all([
      supabase.from('group_whatsapp').select('whatsapp_link').eq('group_id', id).maybeSingle(),
      supabase.from('enrollments').select('id,student_id,students(full_name,student_code)').eq('group_id', id).eq('status', 'active'),
      supabase.from('students').select('id,full_name,student_code').eq('active', true).order('full_name'),
    ])
    setLink(w.data?.whatsapp_link || ''); setMembers(m.data || [])
    const inGroup = new Set((m.data || []).map(x => x.student_id))
    setPool((s.data || []).filter(x => !inGroup.has(x.id)))
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    Promise.all([supabase.from('teachers').select('id,full_name').order('full_name'), supabase.from('subjects').select('id,name').eq('active', true).order('name')])
      .then(([t, s]) => setOpts({ teachers: t.data || [], subjects: s.data || [] }))
  }, [])

  if (g === undefined) return <p className="center-note">جارٍ التحميل…</p>
  if (g === null) return <p className="center-note">المجموعة غير موجودة أو لا تملك صلاحية عليها.</p>
  const set = k => e => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function save(e) {
    e.preventDefault(); if (busy) return
    if (f.name.trim().length < 2) return bad('الاسم قصير.')
    if (link.trim() && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(link.trim())) return bad('رابط واتساب غير صحيح (يبدأ بـ https://chat.whatsapp.com/).')
    const moved = f.teacher_id !== g.teacher_id
    if (moved && !window.confirm('تغيير المعلم ينقل أعضاء المجموعة وحصصها القادمة إلى المعلم الجديد، وتبقى الحصص المنتهية باسم معلمها السابق. متابعة؟')) return
    setBusy(true)
    const u = await supabase.from('groups').update({ name: f.name.trim(), teacher_id: f.teacher_id, subject_id: f.subject_id || null, curriculum: f.curriculum.trim() || null, active: f.active }).eq('id', id)
    let w = { error: null }
    if (!u.error) w = link.trim() ? await supabase.from('group_whatsapp').upsert({ group_id: id, whatsapp_link: link.trim() }, { onConflict: 'group_id' }) : await supabase.from('group_whatsapp').delete().eq('group_id', id)
    setBusy(false)
    if (u.error || w.error) return bad('تعذّر حفظ المجموعة.')
    ok(moved ? 'تم الحفظ ونُقل الأعضاء والحصص القادمة للمعلم الجديد.' : 'تم حفظ المجموعة.'); load()
  }
  async function addMember(e) {
    e.preventDefault(); if (!pick || busy) return
    setBusy(true)
    const { error } = await supabase.from('enrollments').insert({ student_id: pick, group_id: id, teacher_id: g.teacher_id, subject_id: g.subject_id })
    setBusy(false)
    if (error) return bad('تعذّر إضافة الطالب.')
    setPick(''); ok('تمت إضافة الطالب للمجموعة.'); load()
  }
  async function remove(m) {
    if (!window.confirm(`إخراج ${m.students?.full_name} من المجموعة؟`)) return
    const { error } = await supabase.from('enrollments').update({ status: 'ended' }).eq('id', m.id)
    if (error) return bad('تعذّر الإخراج.'); ok('تم إخراج الطالب.'); load()
  }

  return (
    <section className="section"><div className="container stack">
      <div className="card card--accent"><div className="row-between"><h1 style={{ fontSize: '1.5rem' }}>{g.name}</h1><Link className="btn btn--light btn--sm" to="/admin/groups">‹ المجموعات</Link></div></div>
      {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
      <form className="card" onSubmit={save} aria-label="بيانات المجموعة">
        <h2>بيانات المجموعة</h2>
        <div className="form-grid">
          <div className="form-row"><label htmlFor="ge-name">الاسم</label><input id="ge-name" className="field" maxLength={80} value={f.name} onChange={set('name')} /></div>
          <div className="form-row"><label htmlFor="ge-teacher">المعلم</label>
            <select id="ge-teacher" className="field" value={f.teacher_id} onChange={set('teacher_id')}>{opts.teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></div>
          <div className="form-row"><label htmlFor="ge-sub">المادة</label>
            <select id="ge-sub" className="field" value={f.subject_id} onChange={set('subject_id')}><option value="">— بلا —</option>{opts.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="form-row"><label htmlFor="ge-cur">المنهج</label><input id="ge-cur" className="field" value={f.curriculum} onChange={set('curriculum')} /></div>
          <div className="form-row"><label htmlFor="ge-link">رابط مجموعة واتساب (للبوت فقط)</label><input id="ge-link" dir="ltr" className="field" value={link} onChange={e => setLink(e.target.value)} /></div>
        </div>
        <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> المجموعة نشطة</label>
        <button className="btn" disabled={busy}>حفظ</button>
      </form>
      <div className="card" id="members">
        <h2>الأعضاء ({members.length})</h2>
        {members.length === 0 ? <p className="muted">لا يوجد طلاب في المجموعة.</p> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>الطالب</th><th>الكود</th><th></th></tr></thead>
            <tbody>{members.map(m => (
              <tr key={m.id} data-member={m.student_id}><td><Link to={`/admin/students/${m.student_id}`}>{m.students?.full_name}</Link></td><td>{m.students?.student_code}</td>
                <td><button type="button" className="btn btn--light btn--sm" onClick={() => remove(m)}>إخراج</button></td></tr>))}</tbody></table></div>)}
        <form onSubmit={addMember} aria-label="إضافة عضو" style={{ marginTop: 12 }}>
          <div className="form-row"><label htmlFor="gm">إضافة طالب</label>
            <select id="gm" className="field" value={pick} onChange={e => setPick(e.target.value)}><option value="">— اختر الطالب —</option>{pool.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>)}</select></div>
          <button className="btn btn--light" disabled={busy || !pick}>إضافة للمجموعة</button>
        </form>
      </div>
    </div></section>
  )
}
