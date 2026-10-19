import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'
import AttachmentLinks from '../../components/AttachmentLinks.jsx'
import { ATT_LABEL, HW_LABEL, money, monthLabel } from '../../lib/teacherApi.js'

const TABS = [['sum', 'الملخص'], ['lessons', 'الحصص والتقارير'], ['exams', 'الاختبارات والتقييم'], ['fin', 'الحساب المالي']]
const fmt = d => (d ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: 'Africa/Cairo' }).format(new Date(d.length === 10 ? d + 'T12:00:00Z' : d)) : '—')
const chipCls = s => (s === 'absent' ? 'chip--cancelled' : '')

// بوابة ولي الأمر: قراءة فقط. كل البيانات تأتي مفلترة من قاعدة البيانات لأبنائه فقط.
export default function ParentHome() {
  const { profile } = useAuth()
  usePageTitle('بوابة ولي الأمر')
  const [kids, setKids] = useState(null)
  const [sid, setSid] = useState('')
  const [tab, setTab] = useState('sum')
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('students').select('id,full_name,student_code,grade,study_type').order('full_name').then(({ data, error }) => {
      if (error) return setErr('تعذّر تحميل البيانات.')
      setKids(data || []); if (data?.length) setSid(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!sid) return
    setD(null)
    const by = t => supabase.from(t).select('*').eq('student_id', sid)
    Promise.all([
      by('parent_lessons').order('lesson_date', { ascending: false }).limit(100),
      supabase.from('reports').select('lesson_id,report_type,teacher_notes,ai_guidance,attachments,saved_at').eq('student_id', sid),
      by('parent_upcoming').order('lesson_date').limit(5),
      by('exams').order('exam_date', { ascending: false }).limit(30),
      by('monthly_evaluations').order('month', { ascending: false }).limit(12),
      by('certificates').order('issued_at', { ascending: false }),
      by('package_progress').eq('status', 'active'),
      by('parent_balance'),
      by('parent_payments').order('paid_at', { ascending: false }).limit(50),
      supabase.from('announcements').select('id,title,body,published_at').eq('visible', true).in('audience', ['all', 'students']).lte('published_at', new Date().toISOString()).order('published_at', { ascending: false }).limit(5),
    ]).then(r => {
      if (r.some(x => x.error)) return setErr('تعذّر تحميل بعض البيانات.')
      setErr('')
      const [lessons, reports, upcoming, exams, evals, certs, pkg, bal, pays, ann] = r.map(x => x.data || [])
      setD({ lessons, reports: Object.fromEntries(reports.map(x => [x.lesson_id, x])), upcoming, exams, evals, certs, pkg: pkg[0], bal: bal[0], pays, ann })
    })
  }, [sid])

  const stats = useMemo(() => {
    if (!d) return null
    const att = d.lessons.filter(l => l.att_status !== 'absent').length
    return { att, abs: d.lessons.length - att, reports: Object.keys(d.reports).length }
  }, [d])

  if (err && !kids) return <section className="section"><div className="container"><p className="error">{err}</p></div></section>
  if (kids === null) return <section className="section"><div className="container"><p>جارٍ التحميل…</p></div></section>
  if (kids.length === 0) return (
    <section className="section"><div className="container"><div className="card card--accent">
      <h1 style={{ fontSize: '1.6rem' }}>بوابة ولي الأمر</h1><p>أهلاً {profile.full_name}.</p>
      <p className="muted" style={{ marginBottom: 0 }}>لم يُربط حسابك بأي طالب بعد. تواصل مع الأكاديمية لربط حسابك بابنك.</p>
    </div></div></section>)

  const kid = kids.find(k => k.id === sid)
  return (
    <section className="section"><div className="container stack">
      <div className="card card--accent">
        <h1 style={{ fontSize: '1.6rem' }}>بوابة ولي الأمر</h1>
        <p style={{ marginBottom: 0 }}>أهلاً {profile.full_name}.</p>
        {kids.length > 1 && (
          <div className="form-row" style={{ marginTop: 10 }}><label htmlFor="kid">الابن/الابنة</label>
            <select id="kid" className="field" value={sid} onChange={e => { setSid(e.target.value); setTab('sum') }}>{kids.map(k => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select></div>)}
        <p className="muted" style={{ margin: '8px 0 0' }}><strong>{kid.full_name}</strong> · {kid.student_code}{kid.grade ? ` · ${kid.grade}` : ''}</p>
      </div>
      <div className="cms-tabs" role="group" aria-label="أقسام البوابة">
        {TABS.map(([k, l]) => <button type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {!d ? <p>جارٍ التحميل…</p> : tab === 'sum' ? <Summary d={d} stats={stats} /> : tab === 'lessons' ? <Lessons d={d} /> : tab === 'exams' ? <Exams d={d} /> : <Finance d={d} />}
    </div></section>
  )
}

function Summary({ d, stats }) {
  const p = d.pkg
  return (<>
    <div className="stats" id="p-stats">
      <div className="stat"><b>{stats.att.toLocaleString('ar-EG')}</b><span>حصص حضرها</span></div>
      <div className="stat"><b>{stats.abs.toLocaleString('ar-EG')}</b><span>حصص غاب عنها</span></div>
      <div className="stat"><b>{stats.reports.toLocaleString('ar-EG')}</b><span>تقارير</span></div>
    </div>
    {p && <div className="card" id="p-package"><h2>الباقة الحالية</h2>
      <p style={{ marginBottom: 0 }}>{p.kind === 'lessons' ? `${p.used_lessons.toLocaleString('ar-EG')} من ${p.lessons_total.toLocaleString('ar-EG')} حصة` : `باقة شهرية حتى ${fmt(p.ends_on)} (${p.used_lessons.toLocaleString('ar-EG')} حصة مستهلكة)`}</p></div>}
    <div className="card" id="p-upcoming"><h2>الحصص القادمة</h2>
      {d.upcoming.length === 0 ? <p className="muted">لا توجد حصص مجدولة.</p> : d.upcoming.map(u => (
        <div className="cms-row__head" key={u.lesson_id}><span>{fmt(u.lesson_date)}{u.start_time ? ` · ${u.start_time.slice(0, 5)}` : ''}</span><span className="muted">{u.subject_name || u.group_name || ''}{u.teacher_name ? ` · ${u.teacher_name}` : ''}</span></div>))}</div>
    {d.ann.length > 0 && <div className="card" id="p-ann"><h2>إعلانات الأكاديمية</h2>
      {d.ann.map(a => <div className="cms-row" key={a.id}><strong>{a.title}</strong><span className="muted">{fmt(a.published_at)}</span><p style={{ whiteSpace: 'pre-line', margin: 0 }}>{a.body}</p></div>)}</div>}
  </>)
}

function Lessons({ d }) {
  if (d.lessons.length === 0) return <p className="muted">لا توجد حصص مسجّلة بعد.</p>
  return (<div className="card" id="p-lessons">
    {d.lessons.map(l => {
      const rep = d.reports[l.lesson_id]
      return (
        <details className="cms-row" key={l.lesson_id} data-lesson={l.lesson_id}>
          <summary><span className="cms-row__head" style={{ display: 'inline-flex', gap: 8 }}>
            <strong>{fmt(l.lesson_date)}</strong><span>{l.subject_name || l.group_name || l.title || 'حصة'}</span>
            <span className={`chip ${chipCls(l.att_status)}`}>{ATT_LABEL[l.att_status]}</span>
            {rep && <span className="chip">تقرير</span>}</span></summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <span className="muted">{l.teacher_name ? `المعلم: ${l.teacher_name}` : ''}{l.title ? ` · ${l.title}` : ''}</span>
            {l.hw_status && <span>الواجب: <strong>{HW_LABEL[l.hw_status]}</strong>{l.hw_score != null ? ` · الدرجة ${Number(l.hw_score).toLocaleString('ar-EG')}` : ''}{l.hw_note ? ` — ${l.hw_note}` : ''}</span>}
            {l.att_note && <span>ملاحظة الحضور: {l.att_note}</span>}
            {rep ? (<>
              {rep.teacher_notes && <div><strong>ملاحظات المعلم</strong><p style={{ whiteSpace: 'pre-line', margin: '4px 0' }}>{rep.teacher_notes}</p></div>}
              {rep.ai_guidance && <div><strong>توجيهات للمتابعة في البيت</strong><p style={{ whiteSpace: 'pre-line', margin: '4px 0' }}>{rep.ai_guidance}</p></div>}
              <AttachmentLinks items={rep.attachments} />
            </>) : <span className="muted">لا يوجد تقرير لهذه الحصة.</span>}
          </div>
        </details>)
    })}
  </div>)
}

function Exams({ d }) {
  return (<>
    <div className="card" id="p-exams"><h2>الاختبارات</h2>
      {d.exams.length === 0 ? <p className="muted">لا توجد اختبارات.</p> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>الاختبار</th><th>التاريخ</th><th>الدرجة</th></tr></thead>
          <tbody>{d.exams.map(e => <tr key={e.id}><td>{e.exam_name}</td><td>{fmt(e.exam_date)}</td><td>{e.score == null ? '—' : `${Number(e.score).toLocaleString('ar-EG')} / ${Number(e.max_score).toLocaleString('ar-EG')}`}</td></tr>)}</tbody></table></div>)}</div>
    <div className="card" id="p-evals"><h2>التقييم الشهري</h2>
      {d.evals.length === 0 ? <p className="muted">لم يُنشر تقييم شهري بعد.</p> : d.evals.map(e => (
        <details className="cms-row" key={e.id}><summary><strong>{monthLabel(e.month)}</strong>{e.commitment_level ? ` · الالتزام: ${e.commitment_level}` : ''}</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            {[['نقاط القوة', e.strengths], ['ما يحتاج تحسيناً', e.improvements], ['التقييم العام', e.overall], ['توصيات المعلم', e.teacher_recommendations], ['خطة الشهر القادم', e.next_month_plan]].filter(x => x[1]).map(([t, v]) => <div key={t}><strong>{t}</strong><p style={{ whiteSpace: 'pre-line', margin: '4px 0' }}>{v}</p></div>)}
          </div></details>))}</div>
    {d.certs.length > 0 && <div className="card" id="p-certs"><h2>الشهادات</h2>{d.certs.map(c => <div className="cms-row__head" key={c.id}><span>🏅 {c.title}</span><span className="muted">{fmt(c.issued_at)}</span></div>)}</div>}
  </>)
}

function Finance({ d }) {
  const b = d.bal
  if (!b) return <p className="muted">لا توجد بيانات مالية.</p>
  const bal = Number(b.balance)
  return (<>
    <div className="stats" id="p-fin">
      <div className="stat"><b>{money(b.total_paid)}</b><span>إجمالي المدفوع</span></div>
      <div className="stat"><b>{money(b.consumed)}</b><span>قيمة الحصص المستهلكة</span></div>
      <div className="stat"><b>{money(Math.abs(bal))}</b><span>{bal >= 0 ? 'رصيد لك' : 'مستحق عليك'}</span></div>
    </div>
    <div className="card" id="p-pays"><h2>المدفوعات</h2>
      {d.pays.length === 0 ? <p className="muted">لا توجد مدفوعات مسجّلة.</p> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>الإيصال</th></tr></thead>
          <tbody>{d.pays.map(p => <tr key={p.id}><td>{fmt(p.paid_at)}</td><td>{money(p.amount)}</td><td>{p.method || '—'}</td><td>{p.ref_code}</td></tr>)}</tbody></table></div>)}
      <p className="muted" style={{ marginBottom: 0 }}>الحصة التي غاب عنها الطالب لا تُحتسب. لأي استفسار تواصل مع الأكاديمية.</p></div>
  </>)
}
