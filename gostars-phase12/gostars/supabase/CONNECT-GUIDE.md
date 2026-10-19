# دليل ربط المنصة بـ Supabase و Cloudflare

## 0) أمان المفاتيح
- `Publishable key` (sb_publishable_...) + `Project URL`: علنيان، مكانهما الواجهة (`VITE_*`).
- `Secret key` (sb_secret_...): سري. **فقط** في Cloudflare → متغير `SUPABASE_SERVICE_ROLE_KEY`. لا يُكتب في الكود ولا `.env` ولا GitHub ولا المحادثات.
- إن ظهر في أي مكان عام: Supabase → Settings → API Keys → أنشئ مفتاحًا جديدًا واحذف القديم.

## 1) تنفيذ SQL (Supabase → SQL Editor → New query)
نفّذ بالترتيب، كل ملف في استعلام مستقل، وتأكد من ظهور Success:
1. `001_auth_rbac.sql`  2. `002_core_schema.sql`  3. `003_rls_policies.sql`  4. `004_teacher_features.sql`  5. `005_report_files.sql`  6. `006_finance.sql`  7. `007_admin_panel.sql`  8. `008_cms.sql`  9. `009_parent_portal.sql`  10. `010_bot.sql`  11. `011_bot_settings.sql`  12. `012_hardening.sql`
(قاعدة جديدة فارغة: لا تحتاج نسخة احتياطية.)

## 2) إنشاء أول مدير
1. Authentication → Users → Add user → Create new user: بريدك + كلمة مرور قوية + فعّل Auto Confirm.
2. SQL Editor، نفّذ (بدّل البريد):
```
insert into public.profiles (id, role, full_name, login_id)
select id, 'admin', 'المدير', email from auth.users where email = 'بريدك@example.com';
```

## 3) إعدادات Auth
- Authentication → Sign In / Providers → عطّل **Allow new users to sign up** (لا تسجيل حر).
- Authentication → URL Configuration: Site URL = رابط موقعك (مثلاً `https://gostars.pages.dev`)، وأضف في Redirect URLs: `https://gostars.pages.dev/activate` و`http://localhost:5173/activate`.

## 4) التشغيل المحلي
أنشئ ملف `.env.local` بجانب `package.json` (مستبعد من Git):
```
VITE_SUPABASE_URL=https://rqiulahuycmekjoijqwf.supabase.co
VITE_SUPABASE_ANON_KEY=<الـ Publishable key>
```
ثم `npm install` و`npm run dev` وجرّب الدخول بحساب المدير من العنوان `/admin` (لوحة الإدارة مخفية: لا رابط لها في الموقع، ولا يدخل المدير من `/login`).
(إنشاء المستخدمين من `/admin/users` يحتاج Cloudflare Functions؛ محليًا للاختبار الكامل استخدم `npx wrangler pages dev` أو جرّبه بعد النشر.)

## 5) النشر على Cloudflare Pages
Workers & Pages → Create → Pages → Connect to Git → المستودع الخاص.
- Build command: `npm run build` ، Output: `dist`
- Settings → Variables and Secrets (Production):
  - `VITE_SUPABASE_URL` ، `VITE_SUPABASE_ANON_KEY` (نص عادي)
  - `SUPABASE_URL` = نفس الرابط (نص عادي)
  - `SUPABASE_SERVICE_ROLE_KEY` = الـ Secret key (اختر **Secret/Encrypt**)
  - `SITE_URL` = رابط موقعك
  - `GEMINI_API_KEY` = مفتاح Google AI Studio (**Secret**) — للمرحلة 5
- أعد النشر بعد إضافة المتغيرات.

## 6) اختبار القبول
- دخول المدير من `/admin` ✔
- `/admin/users` → أنشئ معلمًا → يظهر رابط تفعيل؛ افتحه في نافذة خفية وعيّن كلمة مرور → يدخل `/teacher` ✔
- أنشئ ولي أمر → يظهر اسم المستخدم وكلمة المرور مرة واحدة → يدخل `/parent` ✔
- في Table Editor: صف المعلم موجود في `teachers` ✔
