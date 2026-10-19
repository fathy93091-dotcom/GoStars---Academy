import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'
import { todayStr, addDays, monthEnd, endPackageNow, refreshPackages } from '../../lib/teacherApi.js'

const title = p => p.kind === 'monthly' ? `شهرية ${p.starts_on} → ${p.ends_on}` : `${p.lessons_total} حصص من ${p.starts_on}${p.ends_on ? ` إلى ${p.ends_on}` : ''}`

// إدارة باقات طلاب الأكاديمية (المدير والمشرف بصلاحية manage_students)
export default function Packages() {
  usePageTitle('باقات الطلاب')
  const [students, setStudents] = useState([])
  const [sid, setSid] = useState('')
  const [list, setList] = useState([])
  const [form, setForm] = useState({ kind: 'lessons', total: '8', starts: todayStr(), ends: monthEnd(todayStr()) })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  useEffect(() => {
    supabase.from('students').select('id,student_code,full_name').eq('active', true).order('full_name')
      .then(r => setStudents(r.data || []))
  }, [])

  const load = useCallback(async () => {
    if (!sid) return setList([])
    await refreshPackages()
    const { data } = await supabase.from('package_progress').select('*').eq('student_id', sid).order('starts_on', { ascending: false })
    setList(data || [])
    const last = (data || []).find(p => p.ends_on)
    if (last?.ends_on) setForm(f => ({ ...f, starts: addDays(last.ends_on, 1), ends: monthEnd(addDays(last.ends_on, 1)) }))
  }, [sid])
  useEffect(() => { load() }, [load])

  const active = list.find(p => p.status === 'active')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function create(e) {
    e.preventDefault(); setBusy(true); setMsg({ type: '', text: '' })
    const row = { student_id: sid, kind: form.kind, starts_on: form.starts }
    if (form.kind === 'lessons') row.lessons_total = Number(form.total); else row.ends_on = form.ends
    const { error } = await supabase.from('student_packages').insert(row)
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: 'تعذّر إنشاء الباقة. تأكد من التواريخ وأن الباقة السابقة منتهية.' })
    setMsg({ type: 'ok', text: 'تم إنشاء الباقة.' }); load()
  }
  async function end() {
    if (!window.confirm('إنهاء الباقة الحالية وأرشفتها الآن؟')) return
    const { error } = await endPackageNow(active)
    if (error) setMsg({ type: 'err', text: 'تعذّر إنهاء الباقة.' }); else { setMsg({ type: 'ok', text: 'تمت الأرشفة.' }); load() }
  }

  return (
    <section className="section">
      <div className="container stack">
        <div className="card">
          <h1 style={{ fontSize: '1.5rem' }}>باقات الطلاب</h1>
          <p className="muted">الباقة شهرية أو بعدد حصص. تُنسب إليها تقارير الطالب وتُؤرشف عند انتهائها. هذه الصفحة للمدير والمشرف فقط.</p>
          <div className="form-row"><label htmlFor="st">الطالب</label>
            <select id="st" className="field" value={sid} onChange={e => { setSid(e.target.value); setMsg({ type: '', text: '' }) }}>
              <option value="">— اختر —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>)}
            </select></div>
        </div>

        {sid && (<>
          <div className="card">
            <h2>الباقات</h2>
            {list.length === 0 ? <p className="muted">لا توجد باقات لهذا الطالب.</p> : (
              <ul className="plain">{list.map(p => (
                <li key={p.package_id} data-package={p.package_id}>
                  <span className={`chip ${p.status === 'active' ? '' : 'chip--cancelled'}`}>{p.status === 'active' ? 'نشطة' : 'مؤرشفة'}</span>{' '}
                  {title(p)} — المستهلك {p.used_lessons}{p.kind === 'lessons' ? ` من ${p.lessons_total}` : ''}
                </li>))}</ul>
            )}
            {active && <button className="btn btn--light" style={{ marginTop: 12 }} onClick={end}>إنهاء الباقة الحالية وأرشفتها</button>}
          </div>

          {!active && (
            <form className="card" onSubmit={create}>
              <h2>باقة جديدة</h2>
              <div className="form-grid">
                <div className="form-row"><label htmlFor="k">النوع</label>
                  <select id="k" className="field" value={form.kind} onChange={set('kind')}><option value="lessons">بعدد حصص</option><option value="monthly">شهرية</option></select></div>
                <div className="form-row"><label htmlFor="s">تبدأ في</label><input id="s" type="date" className="field" value={form.starts} onChange={set('starts')} required /></div>
                {form.kind === 'lessons'
                  ? <div className="form-row"><label htmlFor="t">عدد الحصص</label><input id="t" type="number" min="1" className="field" value={form.total} onChange={set('total')} required /></div>
                  : <div className="form-row"><label htmlFor="e">تنتهي في</label><input id="e" type="date" className="field" value={form.ends} onChange={set('ends')} required /></div>}
              </div>
              <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'إنشاء الباقة'}</button>
            </form>
          )}
          {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
        </>)}
      </div>
    </section>
  )
}
