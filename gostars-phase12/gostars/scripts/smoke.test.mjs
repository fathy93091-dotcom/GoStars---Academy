// اختبار سكربت الفحص نفسه بمحاكاة: موقع سليم يجب أن ينجح، وموقع به ثغرات يجب أن يفشل
import { smoke } from './smoke.mjs'
const goodHdr = { 'content-security-policy': "default-src 'self'; frame-ancestors 'none'", 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'strict-transport-security': 'max-age=31536000' }
const mk = ({ leak = false, signup = false, headers = goodHdr, apiOpen = false }) => async (url, init = {}) => {
  const u = new URL(url); const res = (status, body, h = {}) => ({ status, ok: status < 400, headers: new Map(Object.entries({ ...h })), json: async () => body, text: async () => JSON.stringify(body) })
  if (u.pathname.startsWith('/api/')) return init.method === 'POST' ? res(apiOpen ? 200 : 401, {}) : res(405, {})
  if (u.host === 'site.test') return res(200, '', headers)
  if (u.pathname === '/auth/v1/settings') return res(200, { disable_signup: !signup })
  if (u.pathname.includes('/rpc/security_audit')) return res(401, {})
  if (u.pathname.includes('/rest/v1/public_content')) return res(200, [{ key_element: 'a' }])
  if (u.pathname.includes('/rest/v1/students') && leak) return res(200, [{ id: 1 }])
  if (u.pathname.includes('/rest/v1/')) return res(200, [])
  if (u.pathname.includes('/storage/v1/object/list')) return res(200, [])
  return res(400, {})
}
let failed = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) failed++ }
const run = o => smoke({ site: 'https://site.test', supa: 'https://x.supabase.co', anon: 'k', fetchImpl: mk(o) })
let r = await run({}); ok('موقع سليم: كل الفحوص تنجح', r.every(x => x.pass) && r.length > 40)
r = await run({ leak: true }); ok('تسرّب جدول الطلاب يُكتشف', r.some(x => !x.pass && x.name.includes('students')))
r = await run({ signup: true }); ok('التسجيل الحر المفتوح يُكتشف', r.some(x => !x.pass && x.name.includes('التسجيل الحر')))
r = await run({ headers: {} }); ok('غياب ترويسات الأمان يُكتشف', r.filter(x => !x.pass).length >= 4)
r = await run({ apiOpen: true }); ok('دالة خادم مفتوحة بلا تصريح تُكتشف', r.some(x => !x.pass && x.name.includes('/api/bot')))
console.log(failed ? `FAILED: ${failed}` : 'ALL PASSED'); process.exit(failed ? 1 : 0)
