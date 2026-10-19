import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { roleLabel } from '../../auth/permissions.js'
import { adminUsers, errorMessage } from '../../lib/adminApi.js'
import usePageTitle from '../../hooks/usePageTitle.js'

const blank = { role: 'teacher', full_name: '', email: '', username: '' }

export default function Users() {
  usePageTitle('إدارة المستخدمين')
  const { session, profile } = useAuth()
  const [rows, setRows] = useState([])
  const [loadErr, setLoadErr] = useState('')
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // بيانات تُعرض مرة واحدة (رابط/كلمة مرور)
  const [copied, setCopied] = useState(false)
  const [rates, setRates] = useState({})   // teacher_id → سعر الحصة (يحدده المدير)
  const [rateMsg, setRateMsg] = useState('')

  const roles = profile.role === 'admin' ? ['teacher', 'supervisor', 'parent'] : ['teacher', 'parent']
  const token = session.access_token
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const reload = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('profiles').select('id,role,full_name,login_id,status,created_at').order('created_at', { ascending: false })
    if (e) setLoadErr('تعذّر تحميل المستخدمين.')
    else { setLoadErr(''); setRows(data) }
    if (profile.role === 'admin') {
      const t = await supabase.from('teachers').select('id,lesson_rate,group_rate_per_student')
      if (!t.error) setRates(Object.fromEntries(t.data.map(x => [x.id, { a: String(x.lesson_rate), b: String(x.group_rate_per_student) }])))
    }
  }, [])
  useEffect(() => { reload() }, [reload])

  async function onCreate(e) {
    e.preventDefault()
    setBusy(true); setError(''); setResult(null); setCopied(false)
    try {
      const payload = { action: 'create', role: form.role, full_name: form.full_name }
      if (form.role === 'parent') payload.username = form.username
      else payload.email = form.email
      const r = await adminUsers(token, payload)
      setResult(r); setForm(blank); reload()
    } catch (err) { setError(errorMessage(err)) }
    setBusy(false)
  }

  async function toggle(row) {
    const status = row.status === 'active' ? 'disabled' : 'active'
    if (status === 'disabled' && !window.confirm(`إيقاف حساب ${row.full_name}؟`)) return
    try { await adminUsers(token, { action: 'set-status', id: row.id, status }); reload() }
    catch (err) { setError(errorMessage(err)) }
  }

  async function resetPw(row) {
    if (!window.confirm(`إنشاء كلمة مرور جديدة لـ ${row.full_name}؟`)) return
    try {
      const r = await adminUsers(token, { action: 'reset-parent-password', id: row.id })
      setResult({ username: row.login_id, password: r.password })
    } catch (err) { setError(errorMessage(err)) }
  }

  async function saveRate(row) {
    setRateMsg('')
    const a = Number(rates[row.id].a), b = Number(rates[row.id].b)
    if (!Number.isFinite(a) || a < 0 || !Number.isFinite(b) || b < 0) return setRateMsg('أدخل أسعاراً صحيحة.')
    const { error: e } = await supabase.from('teachers').update({ lesson_rate: a, group_rate_per_student: b }).eq('id', row.id)
    setRateMsg(e ? 'تعذّر حفظ السعر. تأكد من تنفيذ ملف 002 وأن صف المعلم موجود.' : `تم حفظ سعر حصة ${row.full_name}. يسري على الحصص التي تُنهى بعد الآن فقط.`)
  }

  const copy = async text => { try { await navigator.clipboard.writeText(text); setCopied(true) } catch { /* تجاهل */ } }
  const manageable = r => r.id !== profile.id && roles.includes(r.role)

  return (
    <section className="section">
      <div className="container stack">
        <form className="card" onSubmit={onCreate} noValidate>
          <h2>إضافة مستخدم</h2>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="role">النوع</label>
              <select id="role" className="field" value={form.role} onChange={set('role')}>
                {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="fn">الاسم الكامل</label>
              <input id="fn" className="field" value={form.full_name} onChange={set('full_name')} />
            </div>
            {form.role === 'parent' ? (
              <div className="form-row">
                <label htmlFor="un">اسم المستخدم (إنجليزي)</label>
                <input id="un" className="field" dir="ltr" value={form.username} onChange={set('username')} placeholder="مثال: s1042" />
              </div>
            ) : (
              <div className="form-row">
                <label htmlFor="em">البريد الإلكتروني</label>
                <input id="em" className="field" dir="ltr" type="email" value={form.email} onChange={set('email')} />
              </div>
            )}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}</button>
        </form>

        {result && (
          <div className="card card--accent" role="status">
            <h3>تم. احفظ هذه البيانات الآن (لن تظهر مرة أخرى)</h3>
            {result.action_link ? (
              <>
                <p>أرسل هذا الرابط إلى المعلم ليضبط كلمة المرور ويفعّل حسابه:</p>
                <input className="field" dir="ltr" readOnly value={result.action_link} onFocus={e => e.target.select()} />
                <button className="btn btn--light" style={{ marginTop: 10 }} onClick={() => copy(result.action_link)}>
                  {copied ? 'تم النسخ ✓' : 'نسخ الرابط'}
                </button>
              </>
            ) : (
              <>
                <p>اسم المستخدم: <b dir="ltr">{result.username}</b></p>
                <p>كلمة المرور: <b dir="ltr">{result.password}</b></p>
                <button className="btn btn--light" onClick={() => copy(`${result.username} / ${result.password}`)}>
                  {copied ? 'تم النسخ ✓' : 'نسخ البيانات'}
                </button>
              </>
            )}
          </div>
        )}

        <div className="card">
          <h2>المستخدمون</h2>
          {loadErr && <p className="error">{loadErr}</p>}
          {rateMsg && <p role="status">{rateMsg}</p>}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>الاسم</th><th>النوع</th><th>الدخول</th><th>الحالة</th>{profile.role === 'admin' && <th>أجر المعلم: فردي / لكل طالب بالمجموعة</th>}<th></th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{r.full_name}</td>
                    <td>{roleLabel(r.role)}</td>
                    <td dir="ltr" style={{ textAlign: 'start' }}>{r.login_id}</td>
                    <td>{r.status === 'active' ? 'مفعّل' : 'موقوف'}</td>
                    {profile.role === 'admin' && (
                      <td>{r.role === 'teacher' && r.id in rates ? (
                        <span className="actions">
                          <input aria-label={`أجر حصة فردية ${r.full_name}`} type="number" min="0" step="0.5" className="field" style={{ width: 80 }}
                            value={rates[r.id].a} onChange={e => setRates(x => ({ ...x, [r.id]: { ...x[r.id], a: e.target.value } }))} />
                          <input aria-label={`أجر الطالب بالمجموعة ${r.full_name}`} type="number" min="0" step="0.5" className="field" style={{ width: 80 }}
                            value={rates[r.id].b} onChange={e => setRates(x => ({ ...x, [r.id]: { ...x[r.id], b: e.target.value } }))} />
                          <button className="btn btn--light btn--sm" onClick={() => saveRate(r)}>حفظ</button>
                        </span>) : '—'}</td>)}
                    <td className="actions">
                      {manageable(r) && <button className="btn btn--light btn--sm" onClick={() => toggle(r)}>{r.status === 'active' ? 'إيقاف' : 'تفعيل'}</button>}
                      {manageable(r) && r.role === 'parent' && <button className="btn btn--light btn--sm" onClick={() => resetPw(r)}>كلمة مرور جديدة</button>}
                    </td>
                  </tr>
                ))}
                {!rows.length && !loadErr && <tr><td colSpan="6">لا يوجد مستخدمون بعد.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
