import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'
import { LESSON_SELECT, fmtDate, fmtTime, lessonTarget, STATUS_LABEL, ATT_LABEL, HW_LABEL, saveRow, refreshPackages, aiReport, aiErrorMessage, ATTACH_MAX, checkAttachment, uploadReportFile, removeReportFiles } from '../../lib/teacherApi.js'

// التقرير اليومي = تسجيل الحضور: لكل طالب حالة الحضور + الواجب + ملاحظات + توجيه لولي الأمر (اختياري بالذكاء الاصطناعي)
export default function LessonPage() {
  usePageTitle('التقرير اليومي')
  const { id } = useParams()
  const { session } = useAuth()
  const [lesson, setLesson] = useState(null)
  const [roster, setRoster] = useState([])
  const [general, setGeneral] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [missing, setMissing] = useState(false)
  const [meta, setMeta] = useState({ subject_id: '', lesson_no: '', lesson_date: '' })
  const [subjects, setSubjects] = useState([])
  const [removed, setRemoved] = useState([])

  const load = useCallback(async () => {
    const { data: l } = await supabase.from('lessons').select(LESSON_SELECT).eq('id', id).maybeSingle()
    if (!l) return setMissing(true)
    setLesson(l); setGeneral(l.general_note || '')
    setMeta({ subject_id: l.subject_id || '', lesson_no: l.lesson_no ?? '', lesson_date: l.lesson_date })
    supabase.from('subjects').select('id,name').order('name').then(({ data }) => setSubjects(data || []))
    let students = []
    if (l.group_id) {
      const { data } = await supabase.from('enrollments').select('student_id,students(full_name)').eq('group_id', l.group_id).eq('status', 'active')
      students = (data || []).map(e => ({ student_id: e.student_id, full_name: e.students?.full_name || '—' }))
    } else if (l.student_id) students = [{ student_id: l.student_id, full_name: l.students?.full_name || '—' }]
    const [a, h, r] = await Promise.all([
      supabase.from('attendance').select('id,student_id,status,note').eq('lesson_id', id),
      supabase.from('homework').select('id,student_id,status,score,note').eq('lesson_id', id),
      supabase.from('reports').select('id,student_id,teacher_notes,ai_guidance,attachments,wa_status').eq('lesson_id', id),
    ])
    const by = rows => Object.fromEntries((rows.data || []).map(x => [x.student_id, x]))
    const am = by(a), hm = by(h), rm = by(r)
    setRoster(students.map(s => ({
      ...s,
      att: am[s.student_id] ? { ...am[s.student_id] } : { status: 'present', note: '' },
      hw: hm[s.student_id] ? { ...hm[s.student_id] } : { status: '', score: '' },
      rep: rm[s.student_id] ? { id: rm[s.student_id].id, notes: rm[s.student_id].teacher_notes || '', guide: rm[s.student_id].ai_guidance || '', files: rm[s.student_id].attachments || [], wa: rm[s.student_id].wa_status } : { notes: '', guide: '', files: [] },
    })))
  }, [id])
  useEffect(() => { load() }, [load])

  const upd = (i, kind, k, v) => setRoster(r => r.map((x, j) => j === i ? { ...x, [kind]: { ...x[kind], [k]: v } } : x))
  const patchIds = (i, kind, rowId) => setRoster(r => r.map((x, j) => j === i && !x[kind].id ? { ...x, [kind]: { ...x[kind], id: rowId } } : x))

  // حفظ الحضور والواجب لطالب (يحتاجهما الذكاء الاصطناعي من قاعدة البيانات)
  async function persistBasics(i) {
    const s = roster[i]
    const r1 = await saveRow('attendance', s.att.id, { lesson_id: id, student_id: s.student_id }, { status: s.att.status, note: s.att.note?.trim() || null })
    if (r1.error) throw r1.error
    patchIds(i, 'att', r1.data.id)
    if (s.hw.status) {
      const score = s.hw.score === '' || s.hw.score == null ? null : Number(s.hw.score)
      const r2 = await saveRow('homework', s.hw.id, { lesson_id: id, student_id: s.student_id }, { status: s.hw.status, score })
      if (r2.error) throw r2.error
      patchIds(i, 'hw', r2.data.id)
    }
  }

  async function addFile(i, file) {
    if (!file) return
    const bad = checkAttachment(file, roster[i].rep.files.length)
    if (bad) return setMsg({ type: 'err', text: bad })
    setBusy(true); setMsg({ type: '', text: '' })
    try {
      const a = await uploadReportFile(session.user.id, id, roster[i].student_id, file)
      upd(i, 'rep', 'files', [...roster[i].rep.files, a])
    } catch { setMsg({ type: 'err', text: 'تعذّر رفع الملف. تأكد من النوع والحجم وحاول مرة أخرى.' }) }
    setBusy(false)
  }
  const dropFile = (i, path) => {
    upd(i, 'rep', 'files', roster[i].rep.files.filter(f => f.path !== path))
    setRemoved(r => [...r, path])   // يُحذف من التخزين بعد حفظ التقرير
  }

  async function generate(i) {
    setBusy(true); setMsg({ type: '', text: '' })
    try {
      await persistBasics(i)
      const text = await aiReport(session.access_token, { mode: 'lesson', student_id: roster[i].student_id, lesson_id: id, teacher_notes: roster[i].rep.notes })
      upd(i, 'rep', 'guide', text)
      setMsg({ type: 'ok', text: 'تمت كتابة المسودة. راجعها ثم احفظ التقرير اليومي.' })
    } catch (e) { setMsg({ type: 'err', text: e.code || e.status ? aiErrorMessage(e) : 'تعذّر الحفظ قبل التوليد.' }) }
    setBusy(false)
  }

  async function saveAll() {
    setBusy(true); setMsg({ type: '', text: '' })
    try {
      for (let i = 0; i < roster.length; i++) {
        await persistBasics(i)
        const s = roster[i]
        const r3 = await saveRow('reports', s.rep.id, { lesson_id: id, student_id: s.student_id },
          { report_type: lesson.group_id ? 'group' : 'individual', teacher_notes: s.rep.notes?.trim() || null, ai_guidance: s.rep.guide?.trim() || null, attachments: s.rep.files })
        if (r3.error) throw r3.error
        patchIds(i, 'rep', r3.data.id)
      }
      const r4 = await supabase.from('lessons').update({ general_note: general.trim() || null, status: 'done', subject_id: meta.subject_id || null, lesson_no: meta.lesson_no === '' ? null : Number(meta.lesson_no), lesson_date: meta.lesson_date }).eq('id', id)
      if (r4.error) throw r4.error
      await removeReportFiles(removed); setRemoved([])
      await refreshPackages()
      setMsg({ type: 'ok', text: 'تم حفظ التقرير اليومي وتسجيل الحضور وإتمام الحصة.' })
      await load()
    } catch { setMsg({ type: 'err', text: 'تعذّر الحفظ. تحقق من البيانات وحاول مرة أخرى.' }) }
    setBusy(false)
  }

  if (missing) return <p className="center-note">الحصة غير موجودة أو لا تملك صلاحية عليها.</p>
  if (!lesson) return <p className="center-note">جارٍ التحميل…</p>

  return (
    <section className="section">
      <div className="container stack">
        <div className="card card--accent">
          <div className="row-between">
            <div>
              <h1 style={{ fontSize: '1.5rem' }}>{lesson.group_id ? 'تقرير المجموعة' : 'تقرير الحصة الفردية'} — {lessonTarget(lesson)}</h1>
              <p className="muted" style={{ margin: 0 }}>{fmtDate(lesson.lesson_date)} · {fmtTime(lesson.start_time)}{lesson.title ? ` · ${lesson.title}` : ''}</p>
            </div>
            <span className={`chip chip--${lesson.status}`}>{STATUS_LABEL[lesson.status]}</span>
          </div>
          <div className="form-grid" style={{ marginTop: 10 }}>
            <div className="form-row"><label htmlFor="m-sub">المادة</label>
              <select id="m-sub" className="field" value={meta.subject_id} onChange={e => setMeta(m => ({ ...m, subject_id: e.target.value }))}>
                <option value="">— اختر المادة —</option>{subjects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div className="form-row"><label htmlFor="m-no">رقم الحصة</label>
              <input id="m-no" type="number" min="1" className="field" value={meta.lesson_no} onChange={e => setMeta(m => ({ ...m, lesson_no: e.target.value }))} /></div>
            <div className="form-row"><label htmlFor="m-date">تاريخ الحصة</label>
              <input id="m-date" type="date" className="field" value={meta.lesson_date} onChange={e => setMeta(m => ({ ...m, lesson_date: e.target.value }))} /></div>
          </div>
          <p className="ai-note" style={{ marginBottom: 0 }}>التقرير اليومي هو سجل الحضور: حالة الطالب هنا تُحتسب في الباقة وفي أجرك. الغائب لا يُحتسب.</p>
        </div>

        {roster.length === 0 && <div className="card"><p className="muted">لا يوجد طلاب مسجّلون في هذه المجموعة.</p></div>}
        {roster.map((s, i) => (
          <div className="card" key={s.student_id} data-student={s.student_id}>
            <div className="row-between">
              <h2 style={{ marginBottom: 0 }}><Link to={`/teacher/students/${s.student_id}`}>{s.full_name}</Link></h2>
              {s.rep.wa && <span className="chip">{{ pending: 'بانتظار الإرسال', sending: 'جارٍ الإرسال', sent: 'أُرسل', failed: 'فشل الإرسال' }[s.rep.wa]}</span>}
            </div>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <div className="form-row"><label htmlFor={`a${i}`}>الحضور</label>
                <select id={`a${i}`} aria-label={`حضور ${s.full_name}`} className="field" value={s.att.status} onChange={e => upd(i, 'att', 'status', e.target.value)}>
                  {Object.entries(ATT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="form-row"><label htmlFor={`h${i}`}>الواجب</label>
                <select id={`h${i}`} aria-label={`واجب ${s.full_name}`} className="field" value={s.hw.status} onChange={e => upd(i, 'hw', 'status', e.target.value)}>
                  <option value="">—</option>{Object.entries(HW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="form-row"><label htmlFor={`s${i}`}>الدرجة</label>
                <input id={`s${i}`} aria-label={`درجة ${s.full_name}`} type="number" min="0" step="0.5" className="field" value={s.hw.score ?? ''} onChange={e => upd(i, 'hw', 'score', e.target.value)} /></div>
            </div>
            <div className="form-row"><label htmlFor={`n${i}`}>ملاحظاتك عن الطالب</label>
              <textarea id={`n${i}`} aria-label={`ملاحظات ${s.full_name}`} className="field" maxLength={2000} value={s.rep.notes} onChange={e => upd(i, 'rep', 'notes', e.target.value)} /></div>
            <div className="form-row"><label htmlFor={`g${i}`}>التقرير / التوجيه لولي الأمر</label>
              <textarea id={`g${i}`} aria-label={`توجيه ${s.full_name}`} className="field" style={{ minHeight: 120 }} value={s.rep.guide} onChange={e => upd(i, 'rep', 'guide', e.target.value)} /></div>
            <div className="form-row"><label htmlFor={`f${i}`}>مرفقات إيضاحية (اختياري — صور أو PDF حتى {ATTACH_MAX} ملفات، 20MB لكل ملف)</label>
              <input id={`f${i}`} aria-label={`مرفق ${s.full_name}`} type="file" className="field" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy || s.rep.files.length >= ATTACH_MAX}
                onChange={e => { addFile(i, e.target.files[0]); e.target.value = '' }} />
              {s.rep.files.length > 0 && <div className="attach-list">{s.rep.files.map(f => (
                <span className="attach-item" key={f.path}>
                  <span>{f.type === 'application/pdf' ? '📄' : '🖼️'} {f.name}</span>
                  <button type="button" aria-label={`حذف ${f.name}`} onClick={() => dropFile(i, f.path)}>×</button>
                </span>))}</div>}
            </div>
            <button type="button" className="btn btn--gold btn--sm" disabled={busy} onClick={() => generate(i)} aria-label={`توليد ${s.full_name}`}>✨ توليد بالذكاء الاصطناعي</button>
          </div>
        ))}

        {roster.length > 0 && (
          <div className="card">
            <div className="form-row"><label htmlFor="gn">ملاحظات عامة على الحصة</label>
              <textarea id="gn" className="field" value={general} onChange={e => setGeneral(e.target.value)} /></div>
            <p className="ai-note">الذكاء الاصطناعي يكتب مسودة من الحضور والواجب وملاحظاتك فقط؛ راجعها قبل الحفظ. الإرسال لولي الأمر يتم عبر البوت لاحقاً.</p>
            {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
            <button className="btn" disabled={busy} onClick={saveAll}>{busy ? 'جارٍ الحفظ…' : 'حفظ التقرير اليومي وإتمام الحصة'}</button>
          </div>
        )}
      </div>
    </section>
  )
}
