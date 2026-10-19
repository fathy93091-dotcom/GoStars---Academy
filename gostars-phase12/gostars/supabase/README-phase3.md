# إعداد المرحلة 3 (خطوات تنفّذها أنت، مرة واحدة)

## 1) إنشاء مشروع Supabase
1. supabase.com ← New project (الخطة المجانية). اختر المنطقة الأقرب لك واحفظ كلمة مرور قاعدة البيانات.
2. انتظر حتى يكتمل إنشاء المشروع.

## 2) إغلاق التسجيل الحر (قاعدة رقم 2)
Authentication ← Sign In / Providers (أو Providers) ← أوقف خيار **Allow new users to sign up**.

## 3) عناوين الرجوع (لرابط تفعيل المعلم)
Authentication ← URL Configuration:
- Site URL: رابط موقعك المنشور (أو `http://localhost:5173` مؤقتًا)
- Redirect URLs: أضف `http://localhost:5173/activate` ورابط موقعك المنشور `/activate`

## 4) تنفيذ ملف SQL
SQL Editor ← New query ← الصق محتوى `supabase/001_auth_rbac.sql` كاملًا ← Run.
(مشروع جديد فارغ، فلا حاجة لنسخة احتياطية الآن. تبدأ النسخ الاحتياطية قبل المرحلة 4.)

## 5) إنشاء أول مدير
1. Authentication ← Users ← Add user ← Create new user: بريدك + كلمة مرور قوية، وفعّل **Auto Confirm User**.
2. SQL Editor: شغّل الأمر الموجود في آخر ملف SQL (بعد تغيير البريد).

## 6) ربط الواجهة
Project Settings ← API: انسخ **Project URL** و **anon public key**.
في مجلد المشروع انسخ `.env.example` إلى `.env.local` وضع القيمتين فيه، ثم `npm install` و `npm run dev`.
(لا تضع `service_role` في هذا الملف أبدًا.)

## 7) اختبار الدخول
افتح `/admin` وادخل بحساب المدير (تغيّر بعد المرحلة 8: لوحة الإدارة تُفتح من `/admin` فقط ولا يدخل المدير من `/login`).

## 8) تفعيل إنشاء المعلمين وأولياء الأمور (يحتاج نشرًا على Cloudflare Pages)
دالة الخادم `functions/api/admin-users.js` تعمل فقط على Cloudflare (لا تعمل مع `npm run dev`).
Cloudflare Pages ← مشروعك ← Settings ← Variables and Secrets، أضف:
- `SUPABASE_URL` = Project URL
- `SUPABASE_SERVICE_ROLE_KEY` = مفتاح service_role (كـ **Secret / Encrypt**)
- `SITE_URL` = رابط موقعك (اختياري)

### قبل النشر: إن أردت تجربة المعلم بدون Cloudflare
أنشئ المستخدم من لوحة Supabase، ثم أضفه إلى profiles بـ SQL:
```sql
insert into public.profiles (id, role, full_name, login_id)
select id, 'teacher', 'اسم المعلم', email from auth.users where email = 'teacher@example.com';
```

## قائمة اختبار القبول
- [ ] غير مسجّل يفتح `/teacher` فيُحوَّل إلى `/login`، ويفتح `/admin` فيرى نموذج دخول الإدارة فقط.
- [ ] المدير يدخل `/admin` و `/admin/users`.
- [ ] المعلم يدخل `/teacher` فقط، وإذا فتح `/admin` يرى صفحة 404 عادية.
- [ ] ولي الأمر يدخل `/parent` فقط.
- [ ] مشرف بلا صلاحية `manage_users` لا يرى `/admin/users`.
- [ ] تعطيل حساب معلم ← لا يستطيع الدخول، وتظهر رسالة الإيقاف.
- [ ] (اختبار الخادم) من حساب معلم، في Console المتصفح:
      `await supabase.from('profiles').select('*')` تُرجع صفّه وحده.
