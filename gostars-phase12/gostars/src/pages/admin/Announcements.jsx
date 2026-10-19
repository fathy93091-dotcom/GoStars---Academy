import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'

const AUD = { all: 'الجميع (تظهر في صفحة الأخبار)', students: 'الطلاب', teachers: 'المعلمون' }
const empty = { title: '', body: '', audience: 'all' }
const fmt = d => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: 'Africa/Cairo' }).format(new Date(d))

// الإعلانات: الإعلان العام يظهر في صفحة الأخبار. يمكن إخفاؤه أو حذفه.
export default function Announcements() {
  usePageTitle('الإعلانات')
  const [rows, setRows] = useState(null)
  const [f, setF] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('announcements').select('id,title,body,audience,visible,published_at').order('published_at', { ascending: false }).limit(100)
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault(); if (busy) return
    const title = f.title.trim(), body = f.body.trim()
    if (title.length < 2) return setMsg({ type: 'err', text: 'اكتب عنواناً (حرفان على الأقل).' })
    if (body.length < 2) return setMsg({ type: 'err', text: 'اكتب نص الإعلان.' })
    setBusy(true)
    const payload = { title, body, audience: f.audience }
    const { error } = editId ? await supabase.from('announcements').update(payload).eq('id', editId) : await supabase.from('announcements').insert(payload)
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: 'تعذّر الحفظ. تأكد من الطول (النص حتى 5000 حرف).' })
    setF(empty); setEditId(null); setMsg({ type: 'ok', text: editId ? 'تم تعديل الإعلان.' : 'تم نشر الإعلان.' }); load()
  }
  async function toggle(r) {
    const { error } = await supabase.from('announcements').update({ visible: !r.visible }).eq('id', r.id)
    if (error) return setMsg({ type: 'err', text: 'تعذّر التغيير.' }); load()
  }
  async function del(r) {
    if (!window.confirm('حذف الإعلان نهائياً؟ (يمكنك إخفاؤه بدلاً من ذلك)')) return
    const { error } = await supabase.from('announcements').delete().eq('id', r.id)
    if (error) return setMsg({ type: 'err', text: 'تعذّر الحذف.' }); setMsg({ type: 'ok', text: 'تم الحذف.' }); load()
  }

  return (
    <section className="section"><div className="container stack">
      <form className="card card--accent" onSubmit={save} aria-label="إعلان">
        <h1 style={{ fontSize: '1.5rem' }}>{editId ? 'تعديل إعلان' : 'إعلان جديد'}</h1>
        <div className="form-row"><label htmlFor="an-t">العنوان</label><input id="an-t" className="field" maxLength={150} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
        <div className="form-row"><label htmlFor="an-b">النص</label><textarea id="an-b" className="field" rows={4} maxLength={5000} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></div>
        <div className="form-row"><label htmlFor="an-a">الجمهور</label>
          <select id="an-a" className="field" value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}>{Object.entries(AUD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
        <div className="actions"><button className="btn" disabled={busy}>{editId ? 'حفظ التعديل' : 'نشر'}</button>
          {editId && <button type="button" className="btn btn--light" onClick={() => { setEditId(null); setF(empty) }}>إلغاء</button>}</div>
      </form>
      <div className="card">
        <h2>الإعلانات</h2>
        {rows === null ? <p>جارٍ التحميل…</p> : rows.length === 0 ? <p className="muted">لا توجد إعلانات.</p> : rows.map(r => (
          <div className="cms-row" key={r.id} data-ann={r.id}>
            <div className="cms-row__head"><strong>{r.title}</strong>
              <span className="actions"><span className="chip">{r.audience === 'all' ? 'عام' : AUD[r.audience]}</span><span className={`chip ${r.visible ? '' : 'chip--cancelled'}`}>{r.visible ? 'ظاهر' : 'مخفي'}</span></span></div>
            <span className="muted">{fmt(r.published_at)}</span>
            <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{r.body}</p>
            <div className="actions">
              <button type="button" className="btn btn--light btn--sm" onClick={() => { setEditId(r.id); setF({ title: r.title, body: r.body, audience: r.audience }); window.scrollTo(0, 0) }}>تعديل</button>
              <button type="button" className="btn btn--light btn--sm" onClick={() => toggle(r)}>{r.visible ? 'إخفاء' : 'إظهار'}</button>
              <button type="button" className="btn btn--light btn--sm" onClick={() => del(r)}>حذف</button>
            </div>
          </div>))}
      </div>
    </div></section>
  )
}
