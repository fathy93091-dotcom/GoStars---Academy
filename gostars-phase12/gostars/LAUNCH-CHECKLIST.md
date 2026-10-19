# قائمة الإطلاق النهائي — منصة GoStars

افعلها بالترتيب. كل بند له «كيف أتأكد». لا تنتقل للتالي قبل نجاح السابق.

## أ) قبل أي شيء (10 دقائق)
- [ ] **غيّر مفتاح Supabase السري** الذي نُشر في المحادثة: Supabase ← Settings ← API Keys ← أنشئ Secret key جديداً واحذف القديم. *(تأكد: القديم لم يعد يظهر في القائمة.)*
- [ ] المستودع على GitHub **Private**. شغّل `node scripts/secret-scan.mjs` على المجلد: يجب أن يطبع «لا أسرار ظاهرة».
- [ ] **خذ نسخة احتياطية** من أي قاعدة فيها بيانات حقيقية قبل أي ترحيل.

## ب) Supabase
- [ ] مشروع جديد (أو الحالي). Authentication ← Sign In / Providers: **عطّل «Allow new users to sign up»** *(التأكد: الفحص النهائي أدناه)*.
- [ ] Authentication ← Providers ← Email: اجعل أقل طول لكلمة المرور 10، وفعّل «Secure password change».
- [ ] Authentication ← Multi-Factor: فعّل **TOTP**.
- [ ] نفّذ بالترتيب في SQL Editor (كل ملف على حدة، Success): `001` … `012` (انظر `supabase/CONNECT-GUIDE.md`).
- [ ] أنشئ المدير الأول وفعّل التحقق بخطوتين له من `/admin/security`. *(التأكد: تسجيل خروج ودخول يطلب رمز التطبيق.)*
- [ ] بحساب المدير شغّل في SQL Editor: `select * from security_audit();` ← **يجب ألا يرجع أي صف**.
- [ ] Authentication ← URL Configuration: Site URL = رابط موقعك، وRedirect URLs فيها `/activate`.

## ج) Cloudflare Pages
- [ ] مشروع Pages من المستودع الخاص. Build: `npm run build`، Output: `dist`.
- [ ] متغيرات (Production): نص عادي: `VITE_SUPABASE_URL`، `VITE_SUPABASE_ANON_KEY`، `SUPABASE_URL`، `SITE_URL`.
      **Secrets (مشفّرة):** `SUPABASE_SERVICE_ROLE_KEY`، `GEMINI_API_KEY`، `BOT_SECRET` (32 حرفاً فأكثر).
- [ ] أعد النشر بعد ضبط المتغيرات. تأكد أن `public/_headers` طُبّق (الفحص أدناه).
- [ ] (اختياري) نطاق خاص: Custom domains ← أضفه ← حدّث Site URL وRedirect URLs في Supabase.

## د) الفحص الآلي بعد النشر
```
node scripts/smoke.mjs https://موقعك.pages.dev https://xxxx.supabase.co مفتاح_anon_العلني
```
- [ ] **يجب أن تنجح كل الفحوص** (الصفحات، ترويسات الأمان، التسجيل الحر مغلق، الزائر لا يقرأ أي جدول حساس، دوال الخادم ترفض بلا تصريح).

## هـ) اختبار القبول لكل مرحلة (على الموقع الحقيقي)
| # | اختبر | النتيجة المتوقعة |
|---|---|---|
| 1-2 | افتح الموقع على الجوال والكمبيوتر بلا تسجيل دخول | كل الصفحات تعمل، نموذج التواصل يصل لـ `/admin/messages` |
| 3 | دخول بحساب معلم ثم اكتب `/admin` | ترى «غير موجودة» ولا تدخل |
| 4-5 | أنشئ طالباً ومجموعة من `/admin`، ثم ادخل كمعلم | المعلم يرى طلابه فقط، **بلا أرقام أولياء أمور ولا روابط مجموعات** |
| 6 | احفظ تقريراً بمرفق 15MB | يُحفظ ويظهر في `/admin/reports`، ولا زر إرسال عند المعلم |
| 7 | سجّل دفعة لطالب | الرصيد/المديونية تُحسب تلقائياً |
| 8 | أضف مادة ومعلماً | تظهر فوراً وتبقى بعد تحديث الصفحة |
| 9 | عدّل نصاً وارفع صورة من `/admin/content` | تظهر للزائر وتبقى بعد التحديث |
| 10 | ادخل بحساب ولي أمر | يرى أبناءه فقط، ولا يرى بيانات طالب آخر |
| 11 | شغّل البوت (`bot/README-TERMUX.md`) واحفظ تقريراً | يصل لولي الأمر خلال دقائق وتتحول الحالة إلى «أُرسل» |
| 12 | نفّذ «تمرين الاستعادة» أدناه | تنجح الاستعادة في مشروع تجريبي |

## و) تمرين النسخ الاحتياطي والاستعادة (مرة قبل الإطلاق ثم كل 3 أشهر)
1. على جهازك (يلزم `postgresql-client`): `DB_URL='…' ./scripts/backup.sh` ثم `node scripts/backup-storage.mjs`.
2. أنشئ مشروع Supabase **تجريبياً** فارغاً، وغيّر `DB_URL` إليه.
3. `./scripts/restore.sh --yes gostars-public-….dump gostars-auth-….dump gostars-storage-meta-….dump` ثم `node scripts/backup-storage.mjs --restore <المجلد>`.
4. بحساب المدير في المشروع التجريبي: `select * from security_audit();` (صفر صفوف) وافتح لوحة الإدارة.
5. احذف المشروع التجريبي. **احفظ النسخ خارج GitHub** (قرص خارجي/Drive خاص) ومشفّرة (`BACKUP_PASSPHRASE`).
- جدول النسخ المقترح: أسبوعياً، وقبل أي ترحيل جديد دائماً.

## ز) بعد الإطلاق
- [ ] راجع `/admin/audit` أسبوعياً (إنشاء حسابات، تغيير صلاحيات، مدفوعات).
- [ ] راقب مؤشر البوت في `/admin/reports`؛ إن ظهر «غير متصل» افتح Termux.
- [ ] كل ثلاثة أشهر: دوّر `BOT_SECRET` ومفتاح Gemini، وشغّل `smoke.mjs` و`security_audit()`.
- [ ] عند أي ملف SQL جديد: نسخة احتياطية أولاً، ثم نفّذه، ثم `security_audit()`.
- [ ] أولياء الأمور: عند إيقاف حساب (طالب غادر) من `/admin/users` تُلغى جلساته فوراً.
