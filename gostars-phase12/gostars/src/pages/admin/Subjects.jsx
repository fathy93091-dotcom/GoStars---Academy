import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'

// المواد الدراسية: تظهر فوراً في اختيار المادة للمجموعات والتقارير
export default function Subjects() {
  usePageTitle('المواد الدراسية')
  const [rows, setRows] = useState(null)
  const [name, setName] = useState('')
  const [edit, setEdit] = useState(null)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { const { data } = await supabase.from('subjects').select('id,name,active').order('name'); setRows(data || []) }, [])
  useEffect(() => { load() }, [load])
  const fail = e => setMsg({ type: 'err', text: /duplicate|unique/i.test(e.message || '') ? 'هذه المادة موجودة من قبل.' : 'تعذّر الحفظ. تأكد من الاسم (2 إلى 60 حرفاً).' })

  async function add(e) {
    e.preventDefault(); if (busy) return
    const v = name.trim(); if (v.length < 2) return setMsg({ type: 'err', text: 'اكتب اسم المادة (حرفان على الأقل).' })
    setBusy(true); const { error } = await supabase.from('subjects').insert({ name: v }); setBusy(false)
    if (error) return fail(error)
    setName(''); setMsg({ type: 'ok', text: 'تمت إضافة المادة.' }); load()
  }
  async function rename() {
    const v = edit.name.trim(); if (v.length < 2) return setMsg({ type: 'err', text: 'الاسم قصير.' })
    const { error } = await supabase.from('subjects').update({ name: v }).eq('id', edit.id)
    if (error) return fail(error)
    setEdit(null); setMsg({ type: 'ok', text: 'تم تعديل الاسم.' }); load()
  }
  async function toggle(r) {
    const { error } = await supabase.from('subjects').update({ active: !r.active }).eq('id', r.id)
    if (error) return setMsg({ type: 'err', text: 'تعذّر التغيير.' }); load()
  }

  return (
    <section className="section"><div className="container stack">
      <form className="card" onSubmit={add} aria-label="إضافة مادة">
        <h1 style={{ fontSize: '1.5rem' }}>المواد الدراسية</h1>
        <div className="form-row"><label htmlFor="sn">اسم المادة الجديدة</label>
          <input id="sn" className="field" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></div>
        {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
        <button className="btn" disabled={busy}>إضافة</button>
      </form>
      <div className="card">
        <h2>القائمة</h2>
        {rows === null ? <p>جارٍ التحميل…</p> : rows.length === 0 ? <p className="muted">لا توجد مواد بعد.</p> : (
          <div className="table-wrap"><table className="table" id="subjects-table">
            <thead><tr><th>المادة</th><th>الحالة</th><th></th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} data-subject={r.id}>
                <td>{edit?.id === r.id ? <input aria-label="الاسم" className="field" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /> : r.name}</td>
                <td><span className={`chip ${r.active ? '' : 'chip--cancelled'}`}>{r.active ? 'مفعّلة' : 'معطّلة'}</span></td>
                <td className="actions">
                  {edit?.id === r.id ? (<><button type="button" className="btn btn--sm" onClick={rename}>حفظ</button><button type="button" className="btn btn--light btn--sm" onClick={() => setEdit(null)}>إلغاء</button></>)
                    : (<><button type="button" className="btn btn--light btn--sm" onClick={() => setEdit({ id: r.id, name: r.name })}>تعديل</button><button type="button" className="btn btn--light btn--sm" onClick={() => toggle(r)}>{r.active ? 'تعطيل' : 'تفعيل'}</button></>)}
                </td>
              </tr>))}</tbody>
          </table></div>)}
        <p className="muted" style={{ marginBottom: 0 }}>لا تُحذف المواد (تُعطَّل) حفاظاً على سجلات الحصص والتقارير.</p>
      </div>
    </div></section>
  )
}
