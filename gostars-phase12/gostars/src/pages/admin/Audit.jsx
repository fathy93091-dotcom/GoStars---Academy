import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'

const TABLE = { subjects: 'المواد', teachers: 'المعلمون', students: 'الطلاب', student_contacts: 'بيانات الاتصال', groups: 'المجموعات', group_whatsapp: 'روابط واتساب',
  enrollments: 'الإسناد', payments: 'المدفوعات', student_packages: 'الباقات', permissions: 'الصلاحيات', profiles: 'الحسابات', content_site: 'محتوى الموقع', announcements: 'الإعلانات', bot_settings: 'إعدادات البوت' }
const ACTION = { insert: 'إضافة', update: 'تعديل', delete: 'حذف', 'user.create': 'إنشاء حساب', 'user.status': 'تغيير حالة حساب', 'user.reset_password': 'إعادة كلمة مرور' }
const PAGE = 50

const val = v => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
function summary(a) {
  const c = a.changes || {}
  if (a.action === 'update') return Object.entries(c).map(([k, v]) => `${k}: ${val(v?.old)} ← ${val(v?.new)}`).join('  |  ')
  return Object.entries(c).filter(([, v]) => v != null && v !== '').slice(0, 6).map(([k, v]) => `${k}: ${val(typeof v === 'object' && v && 'new' in v ? v.new : v)}`).join('  |  ')
}

// سجل العمليات: للمدير فقط، للقراءة فقط (لا يُعدَّل ولا يُحذف)، ولا يتضمن بيانات الحصص الشخصية
export default function Audit() {
  usePageTitle('سجل العمليات')
  const [rows, setRows] = useState(null)
  const [more, setMore] = useState(false)
  const [f, setF] = useState({ table: 'all', action: 'all' })
  const [busy, setBusy] = useState(false)

  const fetchPage = useCallback(async (offset, filters) => {
    let q = supabase.from('audit_log').select('id,at,actor_name,action,table_name,row_id,changes').order('at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + PAGE - 1)
    if (filters.table !== 'all') q = q.eq('table_name', filters.table)
    if (filters.action !== 'all') q = q.eq('action', filters.action)
    const { data } = await q
    return data || []
  }, [])
  useEffect(() => { setRows(null); fetchPage(0, f).then(d => { setRows(d); setMore(d.length === PAGE) }) }, [f, fetchPage])
  async function loadMore() { setBusy(true); const d = await fetchPage(rows.length, f); setRows(r => [...r, ...d]); setMore(d.length === PAGE); setBusy(false) }

  return (
    <section className="section"><div className="container stack">
      <div className="card">
        <h1 style={{ fontSize: '1.5rem' }}>سجل العمليات</h1>
        <p className="muted">كل إضافة أو تعديل أو حذف حساس مع اسم المنفّذ ووقته. السجل للقراءة فقط. أرقام الهواتف وروابط واتساب لا تُخزَّن في السجل (يُسجَّل أنها تغيّرت فقط).</p>
        <div className="form-grid">
          <div className="form-row"><label htmlFor="a-t">القسم</label>
            <select id="a-t" className="field" value={f.table} onChange={e => setF({ ...f, table: e.target.value })}><option value="all">الكل</option>{Object.entries(TABLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="form-row"><label htmlFor="a-a">العملية</label>
            <select id="a-a" className="field" value={f.action} onChange={e => setF({ ...f, action: e.target.value })}><option value="all">الكل</option>{Object.entries(ACTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
      </div>
      <div className="card">
        {rows === null ? <p>جارٍ التحميل…</p> : rows.length === 0 ? <p className="muted">لا توجد عمليات مسجّلة.</p> : (<>
          <div className="table-wrap"><table className="table" id="audit-table">
            <thead><tr><th>الوقت</th><th>المنفّذ</th><th>العملية</th><th>القسم</th><th>التفاصيل</th></tr></thead>
            <tbody>{rows.map(a => (
              <tr key={a.id} data-audit={a.id}>
                <td>{new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(a.at))}</td>
                <td>{a.actor_name || '—'}</td><td>{ACTION[a.action] || a.action}</td><td>{TABLE[a.table_name] || a.table_name}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 420, overflowWrap: 'anywhere' }}>{summary(a)}</td>
              </tr>))}</tbody>
          </table></div>
          {more && <button className="btn btn--light" disabled={busy} onClick={loadMore}>تحميل المزيد</button>}
        </>)}
      </div>
    </div></section>
  )
}
