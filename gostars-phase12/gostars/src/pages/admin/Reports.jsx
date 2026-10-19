import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import AttachmentLinks from '../../components/AttachmentLinks.jsx'
import { fmtDate } from '../../lib/teacherApi.js'
import usePageTitle from '../../hooks/usePageTitle.js'

const WA = { pending: 'بانتظار الإرسال', sending: 'جارٍ الإرسال', sent: 'أُرسل', failed: 'فشل الإرسال' }
const WA_CHIP = { sent: 'chip--credit', failed: 'chip--debt' }

// حالة البوت: يعدّ «متصلاً» إن سأل خلال آخر دقيقتين ونصف (دورة السحب كل 20 ثانية)
function BotStatus({ beat, pending }) {
  if (beat === undefined) return null
  const age = beat ? (Date.now() - new Date(beat.seen_at).getTime()) / 60000 : null
  const live = age != null && age <= 2.5
  return (
    <p id="bot-status" role="status" className={live ? 'notice--ok-inline' : 'error'}>
      {beat === null ? 'البوت لم يتصل بعد.' : live ? 'البوت متصل ويعمل.' : `البوت غير متصل منذ ${Math.floor(age).toLocaleString('ar-EG')} دقيقة.`}
      {!live && pending > 0 ? ` يوجد ${pending.toLocaleString('ar-EG')} تقرير ينتظر الإرسال.` : ''}
    </p>
  )
}

// متابعة التقارير (قراءة فقط): تقارير الأكاديمية بحالة إرسالها من البوت
export default function Reports() {
  usePageTitle('متابعة التقارير')
  const [rows, setRows] = useState(null)
  const [f, setF] = useState({ status: 'all', teacher: 'all', q: '', from: '', to: '' })
  const [beat, setBeat] = useState(undefined)   // undefined: يُحمَّل، null: لم يتصل قط
  const [msg, setMsg] = useState('')
  const load = () => supabase.from('report_feed').select('*').order('saved_at', { ascending: false }).limit(300).then(r => setRows(r.data || []))
  useEffect(() => {
    load()
    const b = () => supabase.from('bot_heartbeat').select('seen_at,info').maybeSingle().then(r => setBeat(r.error || !r.data?.seen_at ? null : r.data))
    b(); const t = setInterval(b, 30000); return () => clearInterval(t)
  }, [])
  async function retry(id) {
    const { error } = await supabase.rpc('retry_report', { rid: id })
    if (error) return setMsg('تعذّرت إعادة المحاولة.')
    setMsg('أُعيد التقرير إلى طابور البوت، وسيرسله خلال دقائق.'); load()
  }
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))

  const teachers = useMemo(() => [...new Map((rows || []).map(r => [r.teacher_id, r.teacher_name])).entries()], [rows])
  const shown = (rows || []).filter(r => (f.status === 'all' || r.wa_status === f.status) && (f.teacher === 'all' || r.teacher_id === f.teacher)
    && (!f.q.trim() || (r.student_name || '').includes(f.q.trim())) && (!f.from || r.lesson_date >= f.from) && (!f.to || r.lesson_date <= f.to))

  return (
    <section className="section"><div className="container stack">
      <div className="card">
        <h1 style={{ fontSize: '1.5rem' }}>متابعة التقارير</h1>
        <p className="muted">تقارير الأكاديمية فقط. الإرسال لأولياء الأمور يتم عبر البوت، ولا يوجد هنا أي زر إرسال.</p>
        <BotStatus beat={beat} pending={(rows || []).filter(r => r.wa_status === 'pending').length} />
        {msg && <p className="notice--ok-inline" role="status">{msg}</p>}
        <div className="form-grid">
          <div className="form-row"><label htmlFor="r-st">حالة الإرسال</label>
            <select id="r-st" className="field" value={f.status} onChange={set('status')}><option value="all">الكل</option>{Object.entries(WA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="form-row"><label htmlFor="r-t">المعلم</label>
            <select id="r-t" className="field" value={f.teacher} onChange={set('teacher')}><option value="all">الكل</option>{teachers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
          <div className="form-row"><label htmlFor="r-q">اسم الطالب</label><input id="r-q" className="field" value={f.q} onChange={set('q')} /></div>
          <div className="form-row"><label htmlFor="r-f">من تاريخ</label><input id="r-f" type="date" className="field" value={f.from} onChange={set('from')} /></div>
          <div className="form-row"><label htmlFor="r-to">إلى تاريخ</label><input id="r-to" type="date" className="field" value={f.to} onChange={set('to')} /></div>
        </div>
      </div>
      {rows === null ? <p className="center-note">جارٍ التحميل…</p> : shown.length === 0 ? <div className="card"><p className="muted">لا توجد تقارير مطابقة.</p></div> : (
        <div className="card" id="reports-feed">
          <h2>{shown.length} تقرير</h2>
          {shown.map(r => (
            <details className="report" key={r.id} data-report={r.id}>
              <summary>
                <strong>{r.student_name}</strong> — {fmtDate(r.lesson_date)} · {r.group_name || 'فردي'}{r.subject_name ? ` · ${r.subject_name}` : ''} · {r.teacher_name || '—'}{' '}
                <span className={`chip ${WA_CHIP[r.wa_status] || ''}`}>{WA[r.wa_status] || r.wa_status}</span>
                {Array.isArray(r.attachments) && r.attachments.length > 0 && <span className="chip">📎 {r.attachments.length}</span>}
              </summary>
              {r.teacher_notes && <p><b>ملاحظات المعلم:</b> {r.teacher_notes}</p>}
              {r.ai_guidance && <p><b>التوجيه:</b> {r.ai_guidance}</p>}
              {!r.teacher_notes && !r.ai_guidance && <p className="muted">تقرير بلا نص.</p>}
              {r.wa_status === 'failed' && r.wa_error && <p className="error">سبب الفشل: {r.wa_error}</p>}
              {r.wa_status === 'failed' && <button type="button" className="btn btn--light btn--sm" onClick={() => retry(r.id)}>إعادة المحاولة</button>}
              {r.wa_status === 'pending' && r.wa_error && <p className="muted">آخر محاولة فشلت ({r.wa_error}) وستُعاد تلقائياً.</p>}
              <AttachmentLinks items={r.attachments} />
            </details>))}
        </div>)}
    </div></section>
  )
}
