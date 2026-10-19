// Cloudflare Pages Function — POST /api/admin-users
// يعمل على الخادم فقط، ويستخدم مفتاح service_role المحفوظ كمتغير سرّي في Cloudflare.
// المتغيرات المطلوبة: SUPABASE_URL ، SUPABASE_SERVICE_ROLE_KEY ، (اختياري) SITE_URL
//
// الإجراءات:
//   create               إنشاء معلم/مشرف (رابط تفعيل) أو ولي أمر (اسم مستخدم + كلمة مرور)
//   set-status           إيقاف/تفعيل حساب
//   reset-parent-password  كلمة مرور جديدة لولي أمر

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })

// من يستطيع إنشاء/إدارة أي دور
const MANAGEABLE = {
  admin: ['teacher', 'supervisor', 'parent'],
  supervisor: ['teacher', 'parent'],
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USERNAME = /^[a-z0-9._-]{3,30}$/
export const PARENT_DOMAIN = 'parent.gostars.local'

function randomPassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' // بلا أحرف ملتبسة
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

export async function onRequestPost({ request, env }) {
  const base = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return json({ error: 'server_not_configured' }, 500)

  const admin = (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { apikey: key, ...(key.startsWith('sb_') ? {} : { authorization: `Bearer ${key}` }), 'content-type': 'application/json', ...(init.headers || {}) },
    })
  const rest = (path, init = {}) => admin(`/rest/v1/${path}`, init)

  // ---- 1) من المتصل؟ ----
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` } })
  if (!who.ok) return json({ error: 'unauthorized' }, 401)
  const caller = await who.json()
  if (!caller?.id || !UUID.test(caller.id)) return json({ error: 'unauthorized' }, 401)

  // ---- 2) دوره وحالته وصلاحيته (من قاعدة البيانات لا من الطلب) ----
  const profRes = await rest(`profiles?id=eq.${caller.id}&select=role,status,full_name`)
  const [me] = profRes.ok ? await profRes.json() : []
  if (!me || me.status !== 'active' || !MANAGEABLE[me.role]) return json({ error: 'forbidden' }, 403)

  if (me.role === 'supervisor') {
    const pr = await rest(`permissions?user_id=eq.${caller.id}&permission_key=eq.manage_users&allowed=eq.true&select=id`)
    const rows = pr.ok ? await pr.json() : []
    if (!rows.length) return json({ error: 'forbidden' }, 403)
  }
  const canManage = role => MANAGEABLE[me.role].includes(role)
  // سجل العمليات: يُسجَّل باسم المتصل (محاولة أفضل جهد؛ لا يُفشل الإجراء نفسه)
  const audit = (action, rowId, changes) => rest('audit_log', {
    method: 'POST', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ actor: caller.id, actor_name: me.full_name || null, action, table_name: 'profiles', row_id: rowId, changes }),
  }).catch(() => null)

  let body
  try { body = await request.json() } catch { return json({ error: 'bad_request' }, 400) }

  // ================= create =================
  if (body.action === 'create') {
    const role = body.role
    const fullName = String(body.full_name || '').trim()
    if (!canManage(role)) return json({ error: 'forbidden_role' }, 403)
    if (fullName.length < 2 || fullName.length > 80) return json({ error: 'invalid_name' }, 400)

    let userId, loginId, result

    if (role === 'parent') {
      const username = String(body.username || '').trim().toLowerCase()
      if (!USERNAME.test(username)) return json({ error: 'invalid_username' }, 400)
      loginId = username
      const password = randomPassword()
      const r = await admin('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: `${username}@${PARENT_DOMAIN}`, password, email_confirm: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) return json({ error: /exist|registered/i.test(JSON.stringify(d)) ? 'exists' : 'auth_failed' }, r.status === 422 ? 409 : 502)
      userId = d.id
      result = { username, password }
    } else {
      const email = String(body.email || '').trim().toLowerCase()
      if (!EMAIL.test(email)) return json({ error: 'invalid_email' }, 400)
      loginId = email
      const origin = env.SITE_URL || new URL(request.url).origin
      const r = await admin('/auth/v1/admin/generate_link', {
        method: 'POST',
        body: JSON.stringify({ type: 'invite', email, redirect_to: `${origin}/activate` }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) return json({ error: /exist|registered/i.test(JSON.stringify(d)) ? 'exists' : 'auth_failed' }, r.status === 422 ? 409 : 502)
      userId = d.id || d.user?.id
      result = { action_link: d.action_link }
    }

    if (!userId) return json({ error: 'auth_failed' }, 502)

    const ins = await rest('profiles', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ id: userId, role, full_name: fullName, login_id: loginId, status: 'active' }),
    })
    if (!ins.ok) {
      // تراجع: لا نترك مستخدم Auth بلا ملف
      await admin(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' })
      return json({ error: 'profile_failed' }, 500)
    }
    // المرحلة 4: صف مقابل في teachers/supervisors (إن كان الجدول غير موجود بعد = 404 نتجاوز، ليعمل اختبار المرحلة 3)
    if (role === 'teacher' || role === 'supervisor') {
      const ex = await rest(role === 'teacher' ? 'teachers' : 'supervisors', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ id: userId, full_name: fullName }),
      })
      if (!ex.ok && ex.status !== 404) {
        await admin(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' })   // يحذف profile بالتتابع
        return json({ error: 'profile_failed' }, 500)
      }
    }
    await audit('user.create', userId, { role, full_name: fullName, login_id: loginId })
    return json({ ok: true, id: userId, role, ...result })
  }

  // ======== أفعال على حساب موجود ========
  const targetId = body.id
  if (!UUID.test(String(targetId || ''))) return json({ error: 'bad_request' }, 400)
  if (targetId === caller.id) return json({ error: 'cannot_modify_self' }, 400)
  const tr = await rest(`profiles?id=eq.${targetId}&select=role,status`)
  const [target] = tr.ok ? await tr.json() : []
  if (!target) return json({ error: 'not_found' }, 404)
  if (!canManage(target.role)) return json({ error: 'forbidden_role' }, 403)

  // ================= set-status =================
  if (body.action === 'set-status') {
    const status = body.status
    if (!['active', 'disabled'].includes(status)) return json({ error: 'bad_request' }, 400)
    const up = await rest(`profiles?id=eq.${targetId}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status }),
    })
    if (!up.ok) return json({ error: 'update_failed' }, 500)
    // حظر تجديد الجلسة في Auth (القاعدة نفسها ترفض بياناته فورًا عبر RLS)
    await admin(`/auth/v1/admin/users/${targetId}`, {
      method: 'PUT',
      body: JSON.stringify({ ban_duration: status === 'disabled' ? '876000h' : 'none' }),
    })
    await audit('user.status', targetId, { status: { old: target.status, new: status } })
    return json({ ok: true, status })
  }

  // ================= reset-parent-password =================
  if (body.action === 'reset-parent-password') {
    if (target.role !== 'parent') return json({ error: 'forbidden_role' }, 403)
    const password = randomPassword()
    const r = await admin(`/auth/v1/admin/users/${targetId}`, { method: 'PUT', body: JSON.stringify({ password }) })
    if (!r.ok) return json({ error: 'update_failed' }, 500)
    await audit('user.reset_password', targetId, {})
    return json({ ok: true, password })
  }

  return json({ error: 'bad_request' }, 400)
}

// أي طريقة أخرى غير POST
export const onRequest = () => json({ error: 'method_not_allowed' }, 405)
