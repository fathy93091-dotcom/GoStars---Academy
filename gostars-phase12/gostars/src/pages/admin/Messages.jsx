import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'

const fmt = d => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(d))

// رسائل نموذج «تواصل معنا». تحوي هاتف الزائر، فهي لمن يملك manage_students فقط.
export default function Messages() {
  usePageTitle('رسائل التواصل')
  const [rows, setRows] = useState(null)
  const [only, setOnly] = useState(true)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    let q = supabase.from('contact_messages').select('id,name,phone,role,message,handled,created_at').order('created_at', { ascending: false }).limit(100)
    if (only) q = q.eq('handled', false)
    const { data, error } = await q
    if (error) setErr('تعذّر تحميل الرسائل.'); else { setErr(''); setRows(data || []) }
  }, [only])
  useEffect(() => { load() }, [load])
  async function mark(r) {
    const { error } = await supabase.from('contact_messages').update({ handled: !r.handled }).eq('id', r.id)
    if (error) return setErr('تعذّر التحديث.'); load()
  }
  return (
    <section className="section"><div className="container stack">
      <div className="card card--accent">
        <h1 style={{ fontSize: '1.5rem' }}>رسائل التواصل</h1>
        <label className="check"><input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)} /> غير المعالجة فقط</label>
        {err && <p className="error" role="alert">{err}</p>}
      </div>
      <div className="card">
        {rows === null ? <p>جارٍ التحميل…</p> : rows.length === 0 ? <p className="muted">لا توجد رسائل.</p> : rows.map(r => (
          <div className="cms-row" key={r.id} data-msg={r.id}>
            <div className="cms-row__head"><strong>{r.name}</strong><span className="muted">{fmt(r.created_at)}</span></div>
            <span><span className="chip">{r.role || '—'}</span> <bdi dir="ltr">{r.phone}</bdi></span>
            <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{r.message}</p>
            <div className="actions"><button type="button" className="btn btn--light btn--sm" onClick={() => mark(r)}>{r.handled ? 'إعادة لغير المعالجة' : 'تمت المعالجة'}</button></div>
          </div>))}
      </div>
    </div></section>
  )
}
