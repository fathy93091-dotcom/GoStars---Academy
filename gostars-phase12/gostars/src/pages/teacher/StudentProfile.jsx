import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import AttachmentLinks from '../../components/AttachmentLinks.jsx'
import FinancePanel from '../../components/FinancePanel.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'
import { aiReport, aiErrorMessage, refreshPackages, saveRow, endPackageNow, saveSummary, todayStr, addDays, monthStart, monthEnd, fmtDate, ATT_LABEL } from '../../lib/teacherApi.js'

const WA = { pending: 'بانتظار الإرسال', sending: 'جارٍ الإرسال', sent: 'أُرسل', failed: 'فشل الإرسال' }
const pkgTitle = p => p.kind === 'monthly' ? `باقة شهرية ${p.starts_on} → ${p.ends_on}` : `باقة ${p.lessons_total} حصص من ${p.starts_on}${p.ends_on ? ` إلى ${p.ends_on}` : ''}`

export default function StudentProfile() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const { session } = useAuth()
  const [student, setStudent] = useState(undefined)
  const [packages, setPackages] = useState([])
  const [reports, setReports] = useState([])
  const [lessons, setLessons] = useState([])
  usePageTitle(student?.full_name || 'ملف الطالب')

  const load = useCallback(async () => {
    await refreshPackages()
    const [s, p, r, a] = await Promise.all([
      supabase.from('students').select('id,student_code,full_name,grade,curriculum,study_type,scope,lesson_price').eq('id', id).maybeSingle(),
      supabase.from('package_progress').select('*').eq('student_id', id).order('starts_on', { ascending: false }),
      supabase.from('reports').select('id,lesson_id,package_id,teacher_notes,ai_guidance,attachments,saved_at,wa_status,lessons(lesson_date,title)').eq('student_id', id).order('saved_at', { ascending: false }),
      supabase.from('attendance').select('lesson_id,status,lessons(lesson_date,title,group_id,groups(name))').eq('student_id', id),
    ])
    setStudent(s.data || null); setPackages(p.data || []); setReports(r.data || [])
    setLessons((a.data || []).filter(x => x.lessons).sort((x, y) => y.lessons.lesson_date.localeCompare(x.lessons.lesson_date)))
  }, [id])
  useEffect(() => { load() }, [load])

  if (student === undefined) return <p className="center-note">جارٍ التحميل…</p>
  if (student === null) return <p className="center-note">الطالب غير موجود أو لا تملك صلاحية عليه.</p>

  const active = packages.find(p => p.status === 'active')
  const archived = packages.filter(p => p.status === 'archived')
  const current = reports.filter(r => !r.package_id || r.package_id === active?.package_id)

  return (
    <section className="section">
      <div className="container stack">
        <div className="card card--accent">
          <div className="row-between">
            <div>
              <h1 style={{ fontSize: '1.6rem' }}>{student.full_name} {student.scope === 'personal' && <span className="chip chip--personal">خاص</span>}</h1>
              <p className="muted" style={{ margin: 0 }}>{student.student_code} · {student.grade || 'المرحلة غير محددة'} · {student.curriculum || 'المنهج غير محدد'} · {student.study_type === 'private' ? 'فردي' : 'مجموعة'}</p>
            </div>
            <Link className="btn btn--light btn--sm" to="/teacher/students">‹ كل الطلاب</Link>
          </div>
        </div>

        {student.scope === 'personal' && <FinancePanel studentId={student.id} canFix />}
        <PackageCard student={student} active={active} last={archived[0]} onChange={load} />
        <ReportWriter key={sp.get('lesson') || 'new'} student={student} lessons={lessons} reports={reports} initialLesson={sp.get('lesson')} token={session.access_token} onSaved={load} />

        <div className="card" id="reports-list">
          <h2>التقارير — الباقة الحالية</h2>
          {current.length === 0 ? <p className="muted">لا توجد تقارير بعد.</p> : current.map(r => <ReportItem key={r.id} r={r} />)}
        </div>

        <div className="card" id="archive">
          <h2>الأرشيف (باقات منتهية)</h2>
          {archived.length === 0 ? <p className="muted">لا توجد باقات مؤرشفة بعد. تُؤرشف الباقة تلقائياً عند اكتمال حصصها أو انتهاء شهرها.</p> : (
            <div className="stack">{archived.map(p => (
              <ArchivedPackage key={p.package_id} p={p} reports={reports.filter(r => r.package_id === p.package_id)} student={student} token={session.access_token} onSaved={load} />
            ))}</div>
          )}
        </div>
      </div>
    </section>
  )
}

function ReportItem({ r }) {
  return (
    <div className="report" data-report={r.id}>
      <strong>{r.lessons ? `${fmtDate(r.lessons.lesson_date)}${r.lessons.title ? ` — ${r.lessons.title}` : ''}` : 'تقرير'}</strong>{' '}
      <span className="chip">{WA[r.wa_status] || r.wa_status}</span>
      {r.teacher_notes && <p><b>ملاحظات المعلم:</b> {r.teacher_notes}</p>}
      {r.ai_guidance && <p><b>التوجيه:</b> {r.ai_guidance}</p>}
      <AttachmentLinks items={r.attachments} />
    </div>
  )
}

function PackageCard({ student, active, last, onChange }) {
  const today = todayStr()
  const startDefault = last?.ends_on ? addDays(last.ends_on, 1) : today
  const [kind, setKind] = useState('lessons')
  const [total, setTotal] = useState('8')
  const [starts, setStarts] = useState(startDefault)
  const [ends, setEnds] = useState(monthEnd(startDefault))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function create(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const row = { student_id: student.id, kind, starts_on: starts }
    if (kind === 'lessons') row.lessons_total = Number(total); else row.ends_on = ends
    const { error } = await supabase.from('student_packages').insert(row)
    setBusy(false)
    if (error) return setMsg('تعذّر إنشاء الباقة: تأكد من التواريخ وأن الباقة السابقة منتهية.')
    onChange()
  }
  async function archive() {
    if (!window.confirm('إنهاء هذه الباقة وأرشفتها الآن؟')) return
    const { error } = await endPackageNow(active)
    if (error) setMsg('تعذّرت الأرشفة.'); else onChange()
  }

  if (active) {
    const pct = active.kind === 'lessons' ? Math.min(100, Math.round(active.used_lessons / active.lessons_total * 100)) : null
    return (
      <div className="card" data-testid="package-card">
        <div className="row-between"><h2>الباقة الحالية</h2>{student.scope === 'personal' && <button className="btn btn--light btn--sm" onClick={archive}>إنهاء وأرشفة</button>}</div>
        <p>{pkgTitle(active)}</p>
        {active.kind === 'lessons' ? (<>
          <div className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
          <p className="muted">{active.used_lessons} من {active.lessons_total} حصص — المتبقي {Math.max(active.lessons_total - active.used_lessons, 0)}</p>
        </>) : <p className="muted">الحصص المحضورة في الفترة: {active.used_lessons}</p>}
        {msg && <p className="error" role="alert">{msg}</p>}
      </div>
    )
  }
  if (student.scope !== 'personal') {
    return (
      <div className="card" data-testid="package-card">
        <h2>لا توجد باقة نشطة</h2>
        <p className="muted">الباقات تُنشأ وتُنهى من المدير أو المشرف. تُؤرشف تقاريرها تلقائياً عند انتهائها.</p>
      </div>
    )
  }
  return (
    <form className="card" onSubmit={create}>
      <h2>لا توجد باقة نشطة</h2>
      <p className="muted">ابدأ باقة جديدة ليُنسب لها التقارير وتُؤرشف عند انتهائها.</p>
      <div className="form-grid">
        <div className="form-row"><label htmlFor="k">نوع الباقة</label>
          <select id="k" className="field" value={kind} onChange={e => setKind(e.target.value)}><option value="lessons">بعدد حصص</option><option value="monthly">شهرية</option></select></div>
        <div className="form-row"><label htmlFor="s">تبدأ في</label><input id="s" type="date" className="field" value={starts} onChange={e => setStarts(e.target.value)} required /></div>
        {kind === 'lessons'
          ? <div className="form-row"><label htmlFor="t">عدد الحصص</label><input id="t" type="number" min="1" className="field" value={total} onChange={e => setTotal(e.target.value)} required /></div>
          : <div className="form-row"><label htmlFor="e">تنتهي في</label><input id="e" type="date" className="field" value={ends} onChange={e => setEnds(e.target.value)} required /></div>}
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
      <button className="btn" disabled={busy}>بدء الباقة</button>
    </form>
  )
}

function ReportWriter({ student, lessons, reports, initialLesson, token, onSaved }) {
  const [lessonId, setLessonId] = useState(initialLesson || '')
  const existing = reports.find(r => r.lesson_id === lessonId)
  const [notes, setNotes] = useState(existing?.teacher_notes || '')
  const [guide, setGuide] = useState(existing?.ai_guidance || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  function pick(v) {
    setLessonId(v); setMsg({ type: '', text: '' })
    const r = reports.find(x => x.lesson_id === v)
    setNotes(r?.teacher_notes || ''); setGuide(r?.ai_guidance || '')
  }
  async function generate() {
    setBusy(true); setMsg({ type: '', text: '' })
    try { setGuide(await aiReport(token, { mode: 'lesson', student_id: student.id, lesson_id: lessonId, teacher_notes: notes })); setMsg({ type: 'ok', text: 'تمت كتابة المسودة. راجعها وعدّلها قبل الحفظ.' }) }
    catch (e) { setMsg({ type: 'err', text: aiErrorMessage(e) }) }
    setBusy(false)
  }
  async function save() {
    setBusy(true); setMsg({ type: '', text: '' })
    const l = lessons.find(x => x.lesson_id === lessonId)
    const { error } = await saveRow('reports', existing?.id, { lesson_id: lessonId, student_id: student.id },
      { report_type: l?.lessons?.group_id ? 'group' : 'individual', teacher_notes: notes.trim() || null, ai_guidance: guide.trim() || null })
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: 'تعذّر حفظ التقرير.' })
    setMsg({ type: 'ok', text: 'تم حفظ التقرير في ملف الطالب. يُرسل لولي الأمر عبر البوت.' }); onSaved()
  }

  return (
    <div className="card" id="reports">
      <h2>كتابة أو تعديل تقرير حصة</h2>
      {lessons.length === 0 ? <p className="muted">سجّل حضور الطالب في حصة أولاً ليظهر هنا.</p> : (<>
        <div className="form-row"><label htmlFor="ls">الحصة</label>
          <select id="ls" className="field" value={lessonId} onChange={e => pick(e.target.value)}>
            <option value="">— اختر الحصة —</option>
            {lessons.map(x => <option key={x.lesson_id} value={x.lesson_id}>{fmtDate(x.lessons.lesson_date)} — {x.lessons.groups?.name || 'فردي'} ({ATT_LABEL[x.status]}){reports.some(r => r.lesson_id === x.lesson_id) ? ' ✓' : ''}</option>)}
          </select></div>
        {lessonId && (<>
          <div className="form-row"><label htmlFor="tn">ملاحظاتك عن الطالب في هذه الحصة</label>
            <textarea id="tn" className="field" value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} /></div>
          <div className="form-row"><label htmlFor="ag">التوجيه / التقرير لولي الأمر</label>
            <textarea id="ag" className="field" style={{ minHeight: 140 }} value={guide} onChange={e => setGuide(e.target.value)} /></div>
          <p className="ai-note">يعتمد الذكاء الاصطناعي على بيانات الحضور والواجبات وملاحظاتك فقط، ولا يُرسل رقم الهاتف. المسودة تحتاج مراجعتك قبل الحفظ.</p>
          {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
          <div className="hero__actions" style={{ marginTop: 6 }}>
            <button type="button" className="btn btn--gold" disabled={busy} onClick={generate}>✨ توليد بالذكاء الاصطناعي</button>
            <button type="button" className="btn" disabled={busy || (!notes.trim() && !guide.trim())} onClick={save}>حفظ التقرير</button>
          </div>
        </>)}
      </>)}
    </div>
  )
}

function ArchivedPackage({ p, reports, student, token, onSaved }) {
  const [summary, setSummary] = useState(p.summary || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  async function gen() {
    setBusy(true); setMsg({ type: '', text: '' })
    try { setSummary(await aiReport(token, { mode: 'package', student_id: student.id, package_id: p.package_id })) }
    catch (e) { setMsg({ type: 'err', text: aiErrorMessage(e) }) }
    setBusy(false)
  }
  async function save() {
    setBusy(true)
    const { error } = await saveSummary(p.package_id, summary)
    setBusy(false)
    setMsg(error ? { type: 'err', text: 'تعذّر حفظ الملخص.' } : { type: 'ok', text: 'تم حفظ الملخص.' }); if (!error) onSaved()
  }
  return (
    <details className="archive" data-package={p.package_id}>
      <summary>{pkgTitle(p)} — {p.used_lessons} حصة · {reports.length} تقرير</summary>
      <div className="form-row" style={{ marginTop: 10 }}>
        <label htmlFor={`sm-${p.package_id}`}>الملخص الختامي للباقة</label>
        <textarea id={`sm-${p.package_id}`} className="field" value={summary} onChange={e => setSummary(e.target.value)} />
      </div>
      {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
      <div className="hero__actions" style={{ marginBottom: 10 }}>
        <button className="btn btn--gold btn--sm" disabled={busy} onClick={gen}>✨ توليد الملخص</button>
        <button className="btn btn--sm" disabled={busy} onClick={save}>حفظ الملخص</button>
      </div>
      {reports.map(r => <ReportItem key={r.id} r={r} />)}
    </details>
  )
}
