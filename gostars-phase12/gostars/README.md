# منصة وأكاديمية GoStars

منصة تعليمية سحابية: موقع عام + لوحات (مدير، مشرف، معلم، ولي أمر) + بوت واتساب.
التقنيات: React + Vite، Supabase (PostgreSQL + Auth + RLS)، Cloudflare Pages، Termux للبوت.

## حالة المراحل
| المرحلة | الحالة |
|---|---|
| 1. الهوية والهيكل | مكتملة |
| 2. الموقع العام | مكتملة |
| 3. الحسابات والصلاحيات | الكود جاهز، بانتظار اختبار القبول على Supabase الحقيقي |
| 4 | SQL جاهز ومُختبَر محلياً (غير مربوط بعد) — انظر supabase/README-phase4.md |
| 5 | لوحة المعلم جاهزة ومُختبَرة محلياً — انظر supabase/README-phase5.md |
| 6 | نظام التقارير (صفحات مستقلة + مرفقات خاصة) جاهز ومُختبَر محلياً — انظر supabase/README-phase6.md |
| 7 | النظام المالي جاهز ومُختبَر محلياً — انظر supabase/README-phase7.md |
| 8 | لوحة الإدارة المخفية `/admin` (+سجل العمليات +2FA) جاهزة ومُختبَرة محلياً — انظر supabase/README-phase8.md |
| 9 | إدارة الموقع بلا كود (نصوص، صور، إخفاء صفحات/كتل، إعلانات، رسائل التواصل) جاهزة ومُختبَرة محلياً — انظر supabase/README-phase9.md |
| 10 | بوابة ولي الأمر (أبناؤه، الحصص والتقارير والمرفقات، الحضور والواجب، الاختبارات، التقييم الشهري، الباقة، الرصيد والمدفوعات) جاهزة ومُختبَرة محلياً — انظر supabase/README-phase10.md |
| 11 | بوت واتساب (Termux): سحب التقارير المحفوظة وإرسالها لأولياء الأمور تلقائياً + حالة البوت وإعادة المحاولة — جاهز ومُختبَر محاكاةً؛ اختبار واتساب الفعلي عليك — انظر supabase/README-phase11.md و bot/README-TERMUX.md |
| 12 | الأمان والإطلاق: تصليب + ترويسات + نسخ/استعادة (مختبَرة على Postgres حقيقي) + فحص الإنتاج + دليل الإطلاق — انظر LAUNCH-CHECKLIST.md و supabase/README-phase12.md |

## التشغيل على الكمبيوتر
1. ثبّت Node.js (النسخة LTS) من nodejs.org
2. في مجلد المشروع:
   npm install
   npm run dev
3. افتح الرابط الظاهر (غالبًا http://localhost:5173)

لتفعيل الدخول والحسابات اتبع `supabase/README-phase3.md`.

## النشر على Cloudflare Pages (مجاني)
- Workers & Pages → Create → Pages → Connect to Git → هذا المستودع
- Build command: `npm run build`
- Build output directory: `dist`
- المتغيرات: `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` (كسرّ) و `SITE_URL`

## الهوية
الألوان والمقاسات في `src/styles/tokens.css`.
الشعار: `public/logo-mark.png` و `public/logo-wordmark.png` و `public/logo-full.png` و `public/favicon.png`.

## الأمان
- لا تضع أي مفتاح سرّي في الكود أو في هذا المستودع.
- مفتاح `service_role` يُحفظ في متغيرات Cloudflare فقط.
