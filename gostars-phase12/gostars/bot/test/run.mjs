// اختبارات بلا شبكة ولا واتساب: node test/run.mjs
import { normalizePhone } from '../src/phone.js'
import { formatReport } from '../src/format.js'
import { processOnce } from '../src/worker.js'
import { createApi } from '../src/api.js'
import { onRequest, onRequestPost } from '../../functions/api/bot.js'

let failed = 0
const ok = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) failed++ }

// ---------- الأرقام ----------
const P = normalizePhone
ok('موبايل مصري بصفر', P('01012345678') === '201012345678')
ok('موبايل مصري بمسافات وشرطات', P('010 1234-5678') === '201012345678')
ok('موبايل مصري بلا صفر', P('1012345678') === '201012345678')
ok('+20 بصيغة دولية', P('+201012345678') === '201012345678')
ok('00 بادئة دولية', P('00966501234567') === '966501234567')
ok('سعودي بمفتاح الدولة', P('+966 50 123 4567') === '966501234567')
ok('أرقام هندية-عربية', P('٠١٠١٢٣٤٥٦٧٨') === '201012345678')
ok('محلي بصفر غير مصري مرفوض (غامض)', P('0501234567') === null)
ok('قصير/حروف/فارغ/null مرفوض', P('123') === null && P('abc') === null && P('') === null && P(null) === null)
ok('أطول من 15 مرفوض', P('1234567890123456') === null)

// ---------- الصيغة ----------
const R = { report_id: 'r1', student_name: 'أحمد', subject_name: 'رياضيات', group_name: 'مج 1', lesson_no: 4, lesson_date: '2026-10-12', teacher_name: 'أ. منى', att_status: 'late', hw_status: 'partial', hw_score: '7.50', hw_note: 'ناقص السؤال 3', teacher_notes: ' أداء جيد ', ai_guidance: 'راجع الجمع', phone: '01012345678', attachments: [] }
const t = formatReport(R)
ok('الصيغة: الاسم والمادة والتاريخ والمعلم', ['أحمد', 'رياضيات', '12/10/2026', 'أ. منى', 'الحصة رقم 4'].every(x => t.includes(x)), t)
ok('الصيغة: الحضور والواجب بالدرجة', t.includes('حاضر (متأخر)') && t.includes('أنجز بعضه (الدرجة 7.5)'), t)
ok('الصيغة: ملاحظات وتوجيهات', t.includes('أداء جيد') && t.includes('راجع الجمع'))
ok('الصيغة: لا رقم هاتف ولا رابط مجموعة', !/0101|2010|whatsapp\.com/.test(t), t)
const bare = formatReport({ student_name: 'س', teacher_notes: null, ai_guidance: null })
ok('الصيغة تتحمل الحقول الفارغة', bare.includes('س') && !bare.includes('undefined') && !bare.includes('null'), bare)
ok('الصيغة مقصوصة عند 3500', formatReport({ ...R, teacher_notes: 'ا'.repeat(9000) }).length <= 3500)

// ---------- العامل ----------
function env(reports, opts = {}) {
  const results = [], sentText = [], sentFiles = []
  const ids = new Set(opts.journal || [])
  const api = { claim: async () => ({ reports, settings: opts.settings || {} }), result: async (...a) => { if (opts.resultFails) throw new Error('net'); results.push(a) } }
  const sender = {
    ready: () => opts.ready !== false,
    exists: async p => (opts.missing || []).includes(p) ? false : true,
    sendText: async (p, x) => { if (opts.sendFails) throw new Error('boom'); sentText.push([p, x]) },
    sendFile: async (p, f) => { if (opts.fileFails) throw new Error('bad file'); sentFiles.push([p, f.name]) },
  }
  const journal = { has: i => ids.has(i), add: i => ids.add(i) }
  return { api, sender, journal, results, sentText, sentFiles, ids, sleep: async () => {}, log: () => {}, gap: opts.gap === undefined ? () => 0 : opts.gap }
}
let e = env([{ ...R, attachments: [{ name: 'a.png', type: 'image/png', url: 'u' }] }])
let o = await processOnce(e)
ok('إرسال ناجح: نص للرقم الدولي + مرفق + نتيجة ok', e.sentText[0]?.[0] === '201012345678' && e.sentFiles.length === 1 && e.results[0]?.[1] === true && o.sent === 1, [e.sentText.length, e.results])
ok('السجل المحلي يحفظ المرسَل', e.ids.has('r1'))
e = env([R], { journal: ['r1'] }); await processOnce(e)
ok('تقرير مسجّل مسبقاً لا يُرسل ثانية لكن يُؤكَّد', e.sentText.length === 0 && e.results[0]?.[1] === true)
e = env([{ ...R, phone: null }]); await processOnce(e)
ok('بلا رقم → فشل دائم بسبب واضح', e.results[0][1] === false && e.results[0][3] === true && /لا يوجد رقم/.test(e.results[0][2]) && e.sentText.length === 0)
e = env([{ ...R, phone: '0501234567' }]); await processOnce(e)
ok('رقم بلا مفتاح دولة → فشل دائم ولا إرسال', e.results[0][3] === true && /مفتاح الدولة/.test(e.results[0][2]) && e.sentText.length === 0)
e = env([R], { missing: ['201012345678'] }); await processOnce(e)
ok('رقم غير مسجّل في واتساب → فشل دائم', e.results[0][3] === true && /غير مسجّل/.test(e.results[0][2]))
e = env([R], { sendFails: true }); await processOnce(e)
ok('خطأ إرسال → فشل مؤقت (للإعادة) وليس في السجل', e.results[0][1] === false && e.results[0][3] !== true && !e.ids.has('r1'))
e = env([{ ...R, attachments: [{ name: 'x.pdf', type: 'application/pdf', url: 'u' }] }], { fileFails: true }); o = await processOnce(e)
ok('فشل مرفق لا يُسقط التقرير ولا يكرر النص', e.sentText.length === 1 && e.results[0][1] === true && o.sent === 1)
e = env([R], { ready: false }); o = await processOnce(e)
ok('واتساب غير متصل: لا سحب ولا إرسال', o.skipped && e.sentText.length === 0 && e.results.length === 0)
e = env([R, { ...R, report_id: 'r2', student_name: 'سارة' }, { ...R, report_id: 'r3', phone: null }]); o = await processOnce(e)
ok('دفعة: 2 مرسل و1 فاشل', o.sent === 2 && o.failed === 1 && e.sentText.length === 2)
e = env([R], { resultFails: true }); o = await processOnce(e)
ok('فشل تأكيد النتيجة بعد الإرسال: يبقى في السجل (لا تكرار عند إعادة السحب)', e.ids.has('r1') && e.sentText.length === 1)

// ---------- الإعدادات ----------
const S0 = (extra) => formatReport(R, extra)
ok('إعدادات: عنوان وتذييل مخصصان', S0({ header_text: 'أكاديمية النجوم', footer_text: 'شكراً لكم' }).includes('*أكاديمية النجوم*') && S0({ footer_text: 'شكراً لكم' }).endsWith('شكراً لكم'))
ok('إعدادات: إخفاء المعلم/الواجب/الملاحظات/التوجيه', (() => { const x = S0({ show_teacher: false, show_homework: false, show_notes: false, show_guidance: false }); return !x.includes('أ. منى') && !x.includes('الواجب') && !x.includes('أداء جيد') && !x.includes('راجع الجمع') && x.includes('أحمد') })())
ok('إعدادات: تذييل فارغ لا يظهر', !S0({ footer_text: '' }).includes('بوابة ولي الأمر'))
ok('إعدادات: قيم null تأخذ الافتراضي', S0({ header_text: null }).includes('*أكاديمية GoStars ⭐*'))
e = env([{ ...R, attachments: [{ name: 'a.png', type: 'image/png', url: 'u' }] }], { settings: { send_attachments: false } }); await processOnce(e)
ok('إعدادات: send_attachments=false لا يرسل مرفقات', e.sentText.length === 1 && e.sentFiles.length === 0)
e = env([R], { settings: { header_text: 'عنواني' } }); await processOnce(e)
ok('الرسالة المرسلة تستخدم إعدادات المدير', e.sentText[0][1].includes('*عنواني*'))
{ const waits = []; e = env([R, { ...R, report_id: 'z2' }], { settings: { delay_min: 7, delay_max: 7 }, gap: undefined }); e.gap = undefined; e.sleep = async ms => waits.push(ms); await processOnce({ ...e, gap: undefined })
  ok('الفاصل بين الرسائل من الإعدادات (7 ثوانٍ)', waits.length === 2 && waits.every(w => w === 7000), waits) }
e = env([], { settings: { paused_now: true } }); o = await processOnce(e); ok('البوت موقوف من الإدارة: لا شيء يُرسل ويُبلَّغ', o.paused === true && o.sent === 0)

// ---------- عميل الواجهة ----------
const calls = []
let n = 0
const f1 = async (u, i) => { calls.push([u, i.headers['x-bot-secret'], JSON.parse(i.body)]); n++; return n < 3 ? { ok: false, status: 503 } : { ok: true, status: 200, json: async () => ({ reports: [1] }) } }
let api = createApi({ url: 'https://x/api/bot', secret: 'S', fetchImpl: f1, wait: async () => {} })
ok('عميل الواجهة: يعيد المحاولة عند 503 ثم ينجح', (await api.claim(5, 'i')).reports.length === 1 && calls.length === 3 && calls[0][1] === 'S')
api = createApi({ url: 'u', secret: 'S', fetchImpl: async () => ({ ok: false, status: 401 }), wait: async () => {} })
let err; try { await api.claim(1) } catch (x) { err = x }
ok('401 خطأ قاتل بلا إعادة محاولة', err?.fatal === true)

// ---------- دالة Cloudflare /api/bot ----------
const SECRET = 'x'.repeat(40), URLB = 'https://proj.supabase.co'
const envv = { SUPABASE_URL: URLB, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_k', BOT_SECRET: SECRET }
let log = []
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); log.push([init.method, u.pathname, init.headers?.authorization, init.body && JSON.parse(init.body)])
  const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s })
  if (u.pathname === '/rest/v1/rpc/bot_claim_reports') return j([{ report_id: 'a'.repeat(8) + '-1111-2222-3333-' + '4'.repeat(12), phone: '0100', attachments: [{ path: 't/l/s/ملف 1.png', name: 'ملف.png', type: 'image/png' }, { path: 'bad/x.pdf', name: 'b.pdf' }] }])
  if (u.pathname.startsWith('/storage/v1/object/sign/report-files/')) return u.pathname.includes('bad') ? j({}, 404) : j({ signedURL: '/object/sign/report-files/t/l/s/x.png?token=T' })
  if (u.pathname === '/rest/v1/rpc/bot_get_settings') return j({ enabled: true, delay_min: 5, delay_max: 12, send_attachments: false })
  if (u.pathname === '/rest/v1/rpc/bot_complete_report') return j('sent')
  return j({}, 404)
}
const req = (body, headers = { 'x-bot-secret': SECRET }) => new Request('https://s/api/bot', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
let r = await onRequestPost({ request: req({ action: 'claim' }, {}), env: envv }); ok('بلا سرّ → 401', r.status === 401)
r = await onRequestPost({ request: req({ action: 'claim' }, { 'x-bot-secret': 'y'.repeat(40) }), env: envv }); ok('سرّ خاطئ → 401', r.status === 401)
r = await onRequestPost({ request: req({ action: 'claim' }), env: { ...envv, BOT_SECRET: 'short' } }); ok('سرّ قصير في الإعداد → الخادم غير مهيّأ', r.status === 500)
r = await onRequestPost({ request: req('not json'), env: envv }); ok('JSON تالف → 400', r.status === 400)
log = []; r = await onRequestPost({ request: req({ action: 'claim', max: 999, info: 'i' }), env: envv }); let b = await r.json()
ok('claim: سقف الدفعة 10', log[0][3].max_n === 10)
ok('claim: روابط موقّعة للمرفقات (والفاشل يُسقَط)', b.reports[0].attachments.length === 1 && b.reports[0].attachments[0].url === `${URLB}/storage/v1/object/sign/report-files/t/l/s/x.png?token=T`, b)
ok('claim: الإعدادات تُرسل مع الدفعة', b.settings?.delay_max === 12 && b.settings.send_attachments === false, b.settings)
ok('claim: مفتاح sb_ بلا Bearer', log[0][2] === undefined)
r = await onRequestPost({ request: req({ action: 'result', report_id: 'bad', ok: true }), env: envv }); ok('result: معرّف غير صالح → 400', r.status === 400)
log = []; r = await onRequestPost({ request: req({ action: 'result', report_id: 'a'.repeat(8) + '-1111-2222-3333-' + '4'.repeat(12), ok: false, error: 'ط'.repeat(900), permanent: 'yes' }), env: envv })
ok('result: خطأ مقصوص 300 وpermanent لا يُقبل إلا true حرفياً', (await r.json()).status === 'sent' && log[0][3].err.length === 300 && log[0][3].permanent === false)
r = await onRequestPost({ request: req({ action: 'drop_tables' }), env: envv }); ok('إجراء مجهول → 400', r.status === 400)
r = onRequest(); ok('غير POST → 405', r.status === 405)

console.log('\n' + (failed ? `FAILED: ${failed}` : 'ALL PASSED')); process.exit(failed ? 1 : 0)
