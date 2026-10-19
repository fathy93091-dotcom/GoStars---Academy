import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { StudyType, cleanPhone, phoneOk } from '../../lib/adminData.js'
import usePageTitle from '../../hooks/usePageTitle.js'

// ملف الطالب في الإدارة: البيانات، بيانات الاتصال (لا يراها المعلم أبداً)، ربط حساب ولي الأمر، الإسناد للمجموعات والمعلمين
export default function StudentEdit() {
  const { id } = useParams()
  const { can } = useAuth()
  const [st, setSt] = useState(undefined)
  const [f, setF] = useState(null)
  const [c, setC] = useState({ student_phone: '', parent_name: '', parent_phone: '' })
  const [parents, setParents] = useState([])
  const [enr, setEnr] = useState([])
  const [opts, setOpts] = useState({ groups: [], teachers: [], subjects: [] })
  const [add, setAdd] = useState({ kind: 'group', group_id: '', teacher_id: '', subject_id: '' })
  const [msg, setMsg] = useState({ type: '', text: '' }); const [busy, setBusy] = useState(false)
  usePageTitle(st?.full_name || 'ملف الطالب')
  const ok = text => setMsg({ type: 'ok', text }); const bad = text => setMsg({ type: 'err', text })

  const load = useCallback(async () => {
    const s = await supabase.from('students').select('*').eq('id', id).maybeSingle()
    if (!s.data || !s.data.id) return setSt(null)
    setSt(s.data)
    setF({ full_name: s.data.full_name, grade: s.data.grade || '', curriculum: s.data.curriculum || '', study_type: s.data.study_type, lesson_price: String(Number(s.data.lesson_price)), active: s.data.active, parent_user_id: s.data.parent_user_id || '' })
    const [ct, en] = await Promise.all([
      supabase.from('student_contacts').select('student_phone,parent_name,parent_phone').eq('student_id', id).maybeSingle(),
      supabase.from('enrollments').select('id,status,group_id,teacher_id,subject_id,groups(name),subjects(name),teachers(full_name)').eq('student_id', id).order('created_at', { ascending: false }),
    ])
    setC({ student_phone: ct.data?.student_phone || '', parent_name: ct.data?.parent_name || '', parent_phone: ct.data?.parent_phone || '' })
    setEnr(en.data || [])
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (can('manage_users')) supabase.from('profiles').select('id,full_name,login_id').eq('role', 'parent').order('full_name').then(r => setParents(r.data || []))
    if (can('manage_groups')) Promise.all([
      supabase.from('groups').select('id,name,teacher_id,subject_id').eq('active', true).order('name'),
      supabase.from('teachers').select('id,full_name').order('full_name'),
      supabase.from('subjects').select('id,name').eq('active', true).order('name'),
    ]).then(([g, t, s]) => setOpts({ groups: g.data || [], teachers: t.data || [], subjects: s.data || [] }))
  }, [can])

  if (st === undefined) return <p className="center-note">جارٍ التحميل…</p>
  if (st === null) return <p className="center-note">الطالب غير موجود أو لا تملك صلاحية عليه.</p>
  const set = k => e => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function saveBasic(e) {
    e.preventDefault(); if (busy) return
    const price = Number(f.lesson_price)
    if (f.full_name.trim().length < 2) return bad('الاسم قصير.')
    if (!Number.isFinite(price) || price < 0 || price > 100000) return bad('سعر الحصة غير صالح.')
    setBusy(true)
    const row = { full_name: f.full_name.trim(), grade: f.grade.trim() || null, curriculum: f.curriculum.trim() || null, study_type: f.study_type, lesson_price: price, active: f.active }
    if (can('manage_users')) row.parent_user_id = f.parent_user_id || null
    const { error } = await supabase.from('students').update(row).eq('id', id)
    setBusy(false)
    if (error) return bad('تعذّر حفظ البيانات.')
    ok('تم حفظ بيانات الطالب. (تغيير السعر يسري على الحصص القادمة فقط.)'); load()
  }

  async function saveContacts(e) {
    e.preventDefault(); if (busy) return
    const row = { student_id: id, student_phone: cleanPhone(c.student_phone), parent_name: c.parent_name.trim(), parent_phone: cleanPhone(c.parent_phone) }
    if (!phoneOk(row.student_phone) || !phoneOk(row.parent_phone)) return bad('رقم الهاتف: أرقام فقط (8 إلى 15 رقماً) ويمكن أن يبدأ بـ +.')
    setBusy(true)
    const { error } = await supabase.from('student_contacts').upsert({ ...row, student_phone: row.student_phone || null, parent_name: row.parent_name || null, parent_phone: row.parent_phone || null }, { onConflict: 'student_id' })
    setBusy(false)
    if (error) return bad('تعذّر حفظ بيانات الاتصال.')
    ok('تم حفظ بيانات الاتصال (لا يراها المعلمون).'); load()
  }

  async function enroll(e) {
    e.preventDefault(); if (busy) return
    let row
    if (add.kind === 'group') {
      const g = opts.groups.find(x => x.id === add.group_id)
      if (!g) return bad('اختر المجموعة.')
      row = { student_id: id, group_id: g.id, teacher_id: g.teacher_id, subject_id: g.subject_id }
    } else {
      if (!add.teacher_id) return bad('اختر المعلم.')
      row = { student_id: id, group_id: null, teacher_id: add.teacher_id, subject_id: add.subject_id || null }
    }
    setBusy(true); const { error } = await supabase.from('enrollments').insert(row); setBusy(false)
    if (error) return bad(/duplicate|unique/i.test(error.message || '') ? 'الطالب مسجّل بهذا الإسناد من قبل.' : 'تعذّر الإسناد.')
    ok('تم الإسناد.'); load()
  }
  async function endEnroll(en) {
    if (!window.confirm('إنهاء هذا الإسناد؟ لن يرى المعلم الطالب بعد الآن.')) return
    const { error } = await supabase.from('enrollments').update({ status: 'ended' }).eq('id', en.id)
    if (error) return bad('تعذّر الإنهاء.'); ok('تم إنهاء الإسناد.'); load()
  }

  const active = enr.filter(x => x.status === 'active'); const ended = enr.filter(x => x.status !== 'active')
  return (
    <section className="section"><div className="container stack">
      <div className="card card--accent">
        <div className="row-between">
          <div><h1 style={{ fontSize: '1.5rem' }}>{st.full_name}</h1><p className="muted" style={{ margin: 0 }}>{st.student_code}</p></div>
          <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {can('manage_finance') && <Link className="btn btn--light btn--sm" to={`/admin/finance/${id}`}>الحساب المالي</Link>}
            <Link className="btn btn--light btn--sm" to="/admin/students">‹ الطلاب</Link>
          </div>
        </div>
      </div>
      {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}

      <form className="card" onSubmit={saveBasic} aria-label="بيانات الطالب">
        <h2>بيانات الطالب</h2>
        <div className="form-grid">
          <div className="form-row"><label htmlFor="e-name">الاسم</label><input id="e-name" className="field" maxLength={80} value={f.full_name} onChange={set('full_name')} /></div>
          <div className="form-row"><label htmlFor="e-grade">الصف</label><input id="e-grade" className="field" value={f.grade} onChange={set('grade')} /></div>
          <div className="form-row"><label htmlFor="e-cur">المنهج</label><input id="e-cur" className="field" value={f.curriculum} onChange={set('curriculum')} /></div>
          <div className="form-row"><label htmlFor="e-type">نوع الدراسة</label>
            <select id="e-type" className="field" value={f.study_type} onChange={set('study_type')}>{Object.entries(StudyType).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="form-row"><label htmlFor="e-price">سعر الحصة (ج)</label><input id="e-price" type="number" min="0" step="0.5" className="field" value={f.lesson_price} onChange={set('lesson_price')} /></div>
          {can('manage_users') && (
            <div className="form-row"><label htmlFor="e-par">حساب ولي الأمر (للبوابة)</label>
              <select id="e-par" className="field" value={f.parent_user_id} onChange={set('parent_user_id')}>
                <option value="">— غير مرتبط —</option>{parents.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.login_id})</option>)}</select></div>)}
        </div>
        <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> الطالب نشط (إلغاء التفعيل يوقفه دون حذف سجلاته)</label>
        <button className="btn" disabled={busy}>حفظ البيانات</button>
      </form>

      <form className="card" onSubmit={saveContacts} aria-label="بيانات الاتصال">
        <h2>بيانات الاتصال</h2>
        <p className="muted">يستخدمها البوت وحده للإرسال. لا تظهر للمعلمين ولا لأولياء الأمور.</p>
        <div className="form-grid">
          <div className="form-row"><label htmlFor="c-sp">هاتف الطالب</label><input id="c-sp" dir="ltr" className="field" inputMode="tel" value={c.student_phone} onChange={e => setC({ ...c, student_phone: e.target.value })} /></div>
          <div className="form-row"><label htmlFor="c-pn">اسم ولي الأمر</label><input id="c-pn" className="field" value={c.parent_name} onChange={e => setC({ ...c, parent_name: e.target.value })} /></div>
          <div className="form-row"><label htmlFor="c-pp">هاتف ولي الأمر (واتساب)</label><input id="c-pp" dir="ltr" className="field" inputMode="tel" value={c.parent_phone} onChange={e => setC({ ...c, parent_phone: e.target.value })} /></div>
        </div>
        <button className="btn" disabled={busy}>حفظ بيانات الاتصال</button>
      </form>

      <div className="card" id="enrollments">
        <h2>الإسناد (المجموعات والمعلمون)</h2>
        {active.length === 0 ? <p className="muted">غير مُسنَد لأي معلم أو مجموعة بعد، فلن يظهر عند أي معلم.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>الإسناد</th><th>المعلم</th><th>المادة</th>{can('manage_groups') && <th></th>}</tr></thead>
            <tbody>{active.map(x => (
              <tr key={x.id} data-enrollment={x.id}><td>{x.group_id ? `مجموعة: ${x.groups?.name || '—'}` : 'حصص فردية'}</td><td>{x.teachers?.full_name || '—'}</td><td>{x.subjects?.name || '—'}</td>
                {can('manage_groups') && <td><button type="button" className="btn btn--light btn--sm" onClick={() => endEnroll(x)}>إنهاء</button></td>}</tr>))}</tbody>
          </table></div>)}
        {ended.length > 0 && <p className="muted">إسنادات منتهية: {ended.length}</p>}
        {can('manage_groups') && (
          <form onSubmit={enroll} aria-label="إسناد جديد" style={{ marginTop: 12 }}>
            <div className="form-grid">
              <div className="form-row"><label htmlFor="a-kind">نوع الإسناد</label>
                <select id="a-kind" className="field" value={add.kind} onChange={e => setAdd({ ...add, kind: e.target.value })}><option value="group">إلى مجموعة</option><option value="private">حصص فردية مع معلم</option></select></div>
              {add.kind === 'group' ? (
                <div className="form-row"><label htmlFor="a-group">المجموعة</label>
                  <select id="a-group" className="field" value={add.group_id} onChange={e => setAdd({ ...add, group_id: e.target.value })}><option value="">— اختر —</option>{opts.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
              ) : (<>
                <div className="form-row"><label htmlFor="a-teacher">المعلم</label>
                  <select id="a-teacher" className="field" value={add.teacher_id} onChange={e => setAdd({ ...add, teacher_id: e.target.value })}><option value="">— اختر —</option>{opts.teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></div>
                <div className="form-row"><label htmlFor="a-subject">المادة</label>
                  <select id="a-subject" className="field" value={add.subject_id} onChange={e => setAdd({ ...add, subject_id: e.target.value })}><option value="">— بلا —</option>{opts.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </>)}
            </div>
            <button className="btn btn--light" disabled={busy}>إسناد</button>
          </form>)}
      </div>
    </div></section>
  )
}
