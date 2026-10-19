import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { todayStr, fmtDate, money } from '../lib/teacherApi.js'

export const PAY_METHODS = { cash: 'نقدي', transfer: 'تحويل بنكي', wallet: 'محفظة إلكترونية', other: 'أخرى' }

// الشاشة المالية للطالب: الرصيد/المديونية تلقائياً + تسجيل الدفعات + الحصص المستهلكة.
// المعادلات: المستهلك = مجموع أسعار الحصص الحاضر/المتأخر (الغائب لا يُحتسب) — الرصيد = المدفوع − المستهلك.
// canFix: المدير أو المعلم المالك لطالبه الشخصي (تسعير الحصص السابقة). canEdit: المدير فقط (تصحيح دفعة).
export default function FinancePanel({ studentId, canFix = false, canEdit = false }) {
  const [data, setData] = useState(null)
  const [price, setPrice] = useState('')
  const [fix, setFix] = useState(false)
  const [pay, setPay] = useState({ amount: '', paid_at: todayStr(), method: 'cash', note: '' })
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  const load = useCallback(async () => {
    const [b, p, c] = await Promise.all([
      supabase.from('student_balances').select('*').eq('student_id', studentId).maybeSingle(),
      supabase.from('payments').select('id,ref_code,amount,paid_at,method,note').eq('student_id', studentId).order('paid_at', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('student_consumed_lessons').select('attendance_id,lesson_date,lesson_no,title,group_name,status,price').eq('student_id', studentId).order('lesson_date', { ascending: false }),
    ])
    setData({ bal: b.data || null, payments: p.data || [], lessons: c.data || [] })
    if (b.data) setPrice(String(Number(b.data.lesson_price)))
  }, [studentId])
  useEffect(() => { load() }, [load])

  if (!data) return <div className="card"><p className="muted">جارٍ تحميل البيانات المالية…</p></div>
  if (!data.bal) return <div className="card"><p className="muted">لا تملك صلاحية على الحساب المالي لهذا الطالب.</p></div>
  const { bal, payments, lessons } = data
  const balance = Number(bal.balance)
  const unpriced = lessons.filter(l => Number(l.price) === 0).length

  async function addPayment(e) {
    e.preventDefault(); if (busy) return
    const amount = Number(pay.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) return setMsg({ type: 'err', text: 'أدخل مبلغاً صحيحاً أكبر من صفر.' })
    if (!pay.paid_at || pay.paid_at > todayStr()) return setMsg({ type: 'err', text: 'تاريخ الدفعة غير صحيح.' })
    setBusy(true); setMsg({ type: '', text: '' })
    const { error } = await supabase.from('payments').insert({ student_id: studentId, amount, paid_at: pay.paid_at, method: pay.method, note: pay.note.trim() || null })
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: 'تعذّر تسجيل الدفعة. تأكد من صلاحيتك وحاول مرة أخرى.' })
    setPay({ amount: '', paid_at: todayStr(), method: pay.method, note: '' })
    setMsg({ type: 'ok', text: 'تم تسجيل الدفعة وتحديث الرصيد.' }); load()
  }

  async function savePrice(e) {
    e.preventDefault(); if (busy) return
    const v = Number(price)
    if (!Number.isFinite(v) || v < 0 || v > 100000) return setMsg({ type: 'err', text: 'سعر غير صالح.' })
    setBusy(true); setMsg({ type: '', text: '' })
    const { data: n, error } = await supabase.rpc('set_student_price', { sid: studentId, price: v, fix_unpriced: fix })
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: 'تعذّر حفظ السعر.' })
    setFix(false)
    setMsg({ type: 'ok', text: fix ? `تم حفظ السعر وتسعير ${n} حصة سابقة.` : 'تم حفظ السعر للحصص القادمة.' }); load()
  }

  async function saveEdit() {
    const amount = Number(edit.amount)
    if (!Number.isFinite(amount) || amount <= 0) return setMsg({ type: 'err', text: 'مبلغ غير صحيح.' })
    setBusy(true)
    const { error } = await supabase.from('payments').update({ amount, paid_at: edit.paid_at, method: edit.method, note: edit.note?.trim() || null }).eq('id', edit.id)
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: 'تعذّر تعديل الدفعة.' })
    setEdit(null); setMsg({ type: 'ok', text: 'تم تصحيح الدفعة.' }); load()
  }

  return (
    <div className="stack" data-finance={studentId}>
      <div className="card card--accent">
        <h2>الحساب المالي</h2>
        <div className="stats">
          <div className="stat"><b data-k="consumed">{money(bal.consumed)}</b><span>قيمة الحصص المستهلكة ({Number(bal.attended_lessons)} حصة)</span></div>
          <div className="stat"><b data-k="paid">{money(bal.total_paid)}</b><span>إجمالي المدفوع</span></div>
          <div className={`stat ${balance < 0 ? 'stat--debt' : 'stat--gold'}`}>
            <b data-k="balance">{money(Math.abs(balance))}</b>
            <span data-k="state">{balance < 0 ? 'مديونية على الطالب' : balance > 0 ? 'رصيد متبقٍّ للطالب' : 'الحساب متزن'}</span>
          </div>
        </div>
        <p className="ai-note" style={{ marginBottom: 0 }}>القاعدة: قيمة الحصص المستهلكة = عدد الحصص الحاضر/المتأخر × سعر الحصة وقت الحضور (الغائب لا يُحتسب). الرصيد = المدفوع − المستهلك، وتُحسب النتيجة تلقائياً.</p>
        {Number(bal.lesson_price) === 0 && <p className="error" role="alert">سعر حصة هذا الطالب غير محدد، فلا تُحتسب حصصه. حدّد السعر أدناه.</p>}
        {unpriced > 0 && Number(bal.lesson_price) > 0 && <p className="error">يوجد {unpriced} حصة مستهلكة بسعر صفر. {canFix ? 'استخدم خيار تسعير الحصص السابقة أدناه.' : 'اطلب من المدير تسعيرها.'}</p>}
      </div>

      {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}

      <form className="card" onSubmit={addPayment} aria-label="تسجيل دفعة">
        <h2>تسجيل دفعة</h2>
        <div className="form-grid">
          <div className="form-row"><label htmlFor="p-amt">المبلغ (ج)</label>
            <input id="p-amt" type="number" inputMode="decimal" min="0.01" step="0.01" className="field" required value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} /></div>
          <div className="form-row"><label htmlFor="p-date">التاريخ</label>
            <input id="p-date" type="date" className="field" max={todayStr()} required value={pay.paid_at} onChange={e => setPay(p => ({ ...p, paid_at: e.target.value }))} /></div>
          <div className="form-row"><label htmlFor="p-met">طريقة الدفع</label>
            <select id="p-met" className="field" value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))}>
              {Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div className="form-row"><label htmlFor="p-note">البيان (اختياري)</label>
          <input id="p-note" className="field" maxLength={200} value={pay.note} onChange={e => setPay(p => ({ ...p, note: e.target.value }))} /></div>
        <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'تسجيل الدفعة'}</button>
      </form>

      <form className="card" onSubmit={savePrice} aria-label="سعر الحصة">
        <h2>سعر الحصة</h2>
        <p className="muted">يُثبَّت السعر على كل حصة وقت حضور الطالب، فتغييره لا يمس الحصص السابقة.</p>
        <div className="form-row"><label htmlFor="pr">سعر الحصة الواحدة (ج)</label>
          <input id="pr" type="number" min="0" step="0.5" className="field" value={price} onChange={e => setPrice(e.target.value)} /></div>
        {canFix && <label className="check"><input type="checkbox" checked={fix} onChange={e => setFix(e.target.checked)} /> طبّق السعر أيضاً على الحصص السابقة التي سعرها صفر ({unpriced} حالياً)</label>}
        <button className="btn btn--light" disabled={busy}>حفظ السعر</button>
      </form>

      <div className="card">
        <h2>المدفوعات ({payments.length})</h2>
        {payments.length === 0 ? <p className="muted">لا توجد دفعات بعد.</p> : (
          <div className="table-wrap"><table className="table" id="payments-table">
            <thead><tr><th>الرقم</th><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>البيان</th>{canEdit && <th></th>}</tr></thead>
            <tbody>{payments.map(p => edit?.id === p.id ? (
              <tr key={p.id}>
                <td>{p.ref_code}</td>
                <td><input aria-label="تاريخ" type="date" className="field" max={todayStr()} value={edit.paid_at} onChange={e => setEdit(x => ({ ...x, paid_at: e.target.value }))} /></td>
                <td><input aria-label="مبلغ" type="number" step="0.01" className="field" value={edit.amount} onChange={e => setEdit(x => ({ ...x, amount: e.target.value }))} /></td>
                <td><select aria-label="طريقة" className="field" value={edit.method || 'other'} onChange={e => setEdit(x => ({ ...x, method: e.target.value }))}>{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td><input aria-label="بيان" className="field" value={edit.note || ''} onChange={e => setEdit(x => ({ ...x, note: e.target.value }))} /></td>
                <td className="actions"><button type="button" className="btn btn--sm" disabled={busy} onClick={saveEdit}>حفظ</button><button type="button" className="btn btn--light btn--sm" onClick={() => setEdit(null)}>إلغاء</button></td>
              </tr>
            ) : (
              <tr key={p.id} data-payment={p.id}>
                <td>{p.ref_code}</td><td>{fmtDate(p.paid_at)}</td><td>{money(p.amount)}</td><td>{PAY_METHODS[p.method] || p.method || '—'}</td><td>{p.note || '—'}</td>
                {canEdit && <td><button type="button" className="btn btn--light btn--sm" onClick={() => setEdit({ ...p, amount: String(Number(p.amount)) })}>تصحيح</button></td>}
              </tr>
            ))}</tbody>
          </table></div>)}
        {canEdit && <p className="muted" style={{ marginBottom: 0 }}>لا تُحذف الدفعات أبداً؛ يُصحَّح الخطأ بالتعديل فقط.</p>}
      </div>

      <div className="card">
        <h2>الحصص المستهلكة ({lessons.length})</h2>
        {lessons.length === 0 ? <p className="muted">لا توجد حصص مستهلكة.</p> : (
          <div className="table-wrap"><table className="table" id="consumed-table">
            <thead><tr><th>التاريخ</th><th>الحصة</th><th>الحالة</th><th>السعر</th></tr></thead>
            <tbody>{lessons.map(l => (
              <tr key={l.attendance_id}><td>{fmtDate(l.lesson_date)}</td><td>{l.group_name || 'فردي'}{l.lesson_no ? ` · #${l.lesson_no}` : ''}{l.title ? ` · ${l.title}` : ''}</td><td>{l.status === 'late' ? 'متأخر' : 'حاضر'}</td><td>{money(l.price)}</td></tr>
            ))}</tbody>
          </table></div>)}
      </div>
    </div>
  )
}
