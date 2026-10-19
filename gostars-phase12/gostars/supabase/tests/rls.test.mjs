import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
const db = new PGlite()
const S = new URL('../', import.meta.url).pathname
await db.exec(`
${fs.readFileSync(S+'tests/supabase_stub.sql','utf8')}
`)
for (const f of ['001_auth_rbac.sql','002_core_schema.sql','003_rls_policies.sql','004_teacher_features.sql','005_report_files.sql','006_finance.sql','007_admin_panel.sql','008_cms.sql','009_parent_portal.sql','010_bot.sql','011_bot_settings.sql','012_hardening.sql']) {
  try { await db.exec(fs.readFileSync(S+f,'utf8')) } catch (e) { console.log('SQL ERROR in',f,e.message); process.exit(2) }
}
// re-run idempotency
for (const f of ['001_auth_rbac.sql','002_core_schema.sql','003_rls_policies.sql','004_teacher_features.sql','005_report_files.sql','006_finance.sql','007_admin_panel.sql','008_cms.sql','009_parent_portal.sql','010_bot.sql','011_bot_settings.sql','012_hardening.sql']) {
  try { await db.exec(fs.readFileSync(S+f,'utf8')) } catch (e) { console.log('RERUN ERROR in',f,e.message); process.exit(2) }
}
console.log('PASS كل ملفات SQL تعمل وقابلة لإعادة التشغيل')

const U = n => `00000000-0000-0000-0000-0000000000${String(n).padStart(2,'0')}`
const ids = { admin:U(1), supNone:U(2), supAll:U(3), supFin:U(4), t1:U(5), t2:U(6), parent1:U(7), parent2:U(8), disabledT:U(9), supContent:U(10) }
let failed = 0
const ok = (n,c,x)=>{console.log((c?'PASS ':'FAIL ')+n+(!c&&x!==undefined?' '+JSON.stringify(x):''));if(!c)failed++}

// بيانات أولية بصلاحيات المالك (superuser)
for (const [k,id] of Object.entries(ids)) await db.query(`insert into auth.users(id,email) values ($1,$2)`,[id,k+'@x.com'])
const prof=(k,role,st='active')=>db.query(`insert into profiles(id,role,full_name,login_id,status) values ($1,$2,$3,$3,$4)`,[ids[k],role,'اسم '+k,st])
await prof('admin','admin');await prof('supNone','supervisor');await prof('supAll','supervisor');await prof('supFin','supervisor');await prof('supContent','supervisor')
await prof('t1','teacher');await prof('t2','teacher');await prof('parent1','parent');await prof('parent2','parent');await prof('disabledT','teacher','disabled')
await db.query(`insert into teachers(id,full_name,lesson_rate,group_rate_per_student) values ($1,'معلم1',30,20),($2,'معلم2',40,25),($3,'معلم معطل',10,5)`,[ids.t1,ids.t2,ids.disabledT])
const perm=(k,ps)=>Promise.all(ps.map(p=>db.query(`insert into permissions(user_id,permission_key) values ($1,$2)`,[ids[k],p])))
await perm('supAll',['manage_users','manage_students','manage_groups','follow_teachers','follow_reports','manage_content','add_announcements'])
await perm('supFin',['manage_finance']); await perm('supContent',['manage_content','add_announcements'])
await db.query(`insert into subjects(name) values ('رياضيات'),('علوم')`)
// طلاب: A1,A2 أكاديمية (t1: A1 فقط عبر مجموعة، t2: A2) ، P1 شخصي لـ t1
const q1=async(sql,p)=> (await db.query(sql,p)).rows[0]
const A1=(await q1(`insert into students(full_name,study_type,lesson_price,parent_user_id) values ('طالب أ1','group',100,$1) returning id`,[ids.parent1])).id
const A2=(await q1(`insert into students(full_name,study_type,lesson_price,parent_user_id) values ('طالب أ2','private',50,$1) returning id`,[ids.parent2])).id
const P1=(await q1(`insert into students(full_name,study_type,lesson_price,scope,owner_teacher_id) values ('طالب شخصي','private',70,'personal',$1) returning id`,[ids.t1])).id
await db.query(`insert into student_contacts(student_id,parent_phone) values ($1,'0100'),($2,'0111'),($3,'0122')`,[A1,A2,P1])
const G1=(await q1(`insert into groups(name,teacher_id) values ('مجموعة 1',$1) returning id`,[ids.t1])).id
await db.query(`insert into group_whatsapp(group_id,whatsapp_link) values ($1,'https://chat.whatsapp.com/xyz')`,[G1])
await db.query(`insert into enrollments(student_id,group_id,teacher_id) values ($1,$2,$3)`,[A1,G1,ids.t1])
await db.query(`insert into enrollments(student_id,teacher_id) values ($1,$2)`,[A2,ids.t2])
await db.query(`insert into enrollments(student_id,teacher_id) values ($1,$2)`,[P1,ids.t1])
await db.query(`insert into announcements(title,body,audience) values ('للجميع','x','all'),('للطلاب','x','students'),('للمعلمين','x','teachers')`)
await db.query(`insert into content_site(key_element,text_value,visible) values ('home.title','مرحبا',true),('home.hidden','س',false)`)

// تنفيذ باسم مستخدم: دور + معرّف. يعيد {rows,error}
let AAL='aal1'
async function as(who, sql, params=[]) {
  const role = who==='anon'?'anon':who==='service'?'service_role':'authenticated'
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${who in ids?ids[who]:''}',false), set_config('request.jwt.claims','{"aal":"${AAL}"}',false); set role ${role}`)
  try { const r = await db.query(sql, params); return {rows:r.rows, n:r.affectedRows??r.rows.length} }
  catch(e){ return {error:e.message, rows:[], n:0} } finally { await db.exec('reset role') }
}
const cnt=async(who,tbl)=> (await as(who,`select count(*)::int c from ${tbl}`)).rows[0]?.c ?? 'ERR'

// ===== الطلاب =====
ok('معلم1 يرى طالب الأكاديمية الخاص به + شخصيه فقط (2)', await cnt('t1','students')===2)
ok('معلم2 يرى طالب واحد (A2)', await cnt('t2','students')===1)
ok('المدير يرى طلاب الأكاديمية فقط (2) لا الشخصي', await cnt('admin','students')===2)
ok('مشرف بلا صلاحيات لا يرى طلاباً', await cnt('supNone','students')===0)
ok('مشرف بصلاحيات يرى طلاب الأكاديمية (2)', await cnt('supAll','students')===2)
ok('ولي الأمر 1 يرى ابنه فقط', (await as('parent1','select id from students')).rows.length===1)
ok('الزائر لا يقرأ الطلاب', (await as('anon','select 1 from students')).error)
ok('معلم موقوف لا يرى شيئاً', await cnt('disabledT','teachers')===0)
// ===== جهات الاتصال والواتساب =====
ok('معلم الأكاديمية لا يرى أرقام أولياء الأمور، ويرى رقم طالبه الشخصي فقط', await cnt('t1','student_contacts')===1)
ok('المدير يرى أرقام الأكاديمية (2) لا الشخصية', await cnt('admin','student_contacts')===2)
ok('ولي الأمر لا يرى جدول الأرقام', await cnt('parent1','student_contacts')===0)
ok('معلم لا يرى رابط مجموعة الواتساب الأكاديمية', await cnt('t1','group_whatsapp')===0)
ok('المدير يرى رابط الواتساب', await cnt('admin','group_whatsapp')===1)
ok('البوت (service_role) يقرأ الروابط', await cnt('service','group_whatsapp')===1)
// ===== كتابة الطلاب =====
let r=await as('t1',`update students set lesson_price=1 where id=$1`,[A1]); ok('معلم لا يعدّل طالب أكاديمية', r.n===0, r)
r=await as('t1',`update students set lesson_price=80 where id=$1`,[P1]); ok('معلم يعدّل سعر طالبه الشخصي', r.n===1, r)
r=await as('t1',`update students set scope='academy' where id=$1`,[P1]); ok('لا أحد يغيّر scope (صلاحية عمود)', !!r.error, r)
r=await as('t1',`insert into students(full_name,study_type,scope) values ('جديد','group','academy')`); ok('معلم لا ينشئ طالب أكاديمية', !!r.error, r)
r=await as('t1',`insert into students(full_name,study_type,scope,owner_teacher_id) values ('خاص جديد','private','personal',$1)`,[ids.t1]); ok('معلم ينشئ طالباً شخصياً لنفسه', !r.error, r)
r=await as('t1',`insert into students(full_name,study_type,scope,owner_teacher_id) values ('خاص مسروق','private','personal',$1)`,[ids.t2]); ok('معلم لا ينشئ طالباً شخصياً باسم معلم آخر', !!r.error, r)
r=await as('supNone',`insert into students(full_name,study_type) values ('x','group')`); ok('مشرف بلا صلاحية لا ينشئ طالباً', !!r.error, r)
r=await as('supAll',`insert into students(full_name,study_type) values ('طالب جديد','group') returning student_code`); ok('مشرف manage_students ينشئ طالباً بكود تلقائي GS-', r.rows[0]?.student_code?.startsWith('GS-'), r)
r=await as('admin',`insert into students(full_name,study_type,scope,owner_teacher_id) values ('x','private','personal',$1)`,[ids.t1]); ok('المدير لا ينشئ طالباً شخصياً', !!r.error, r)
r=await as('t1',`delete from students where id=$1`,[P1]); ok('لا حذف للطلاب', !!r.error, r)
// قيد النطاق
r=await db.query(`insert into students(full_name,study_type,scope,owner_teacher_id,parent_user_id) values ('x','private','personal',$1,$2)`,[ids.t1,ids.parent1]).catch(e=>({error:e.message})); ok('قيد: الطالب الشخصي لا ولي أمر له', !!r.error)
// ===== التسجيل =====
r=await db.query(`insert into enrollments(student_id,group_id,teacher_id) values ($1,$2,$3)`,[A2,G1,ids.t2]).catch(e=>({error:e.message})); ok('مشغّل: معلم التسجيل يطابق معلم المجموعة', !!r.error)
const PG=(await q1(`insert into groups(name,teacher_id,scope,owner_teacher_id) values ('خاصة',$1,'personal',$1) returning id`,[ids.t1])).id
r=await db.query(`insert into enrollments(student_id,group_id,teacher_id) values ($1,$2,$3)`,[A1,PG,ids.t1]).catch(e=>({error:e.message})); ok('مشغّل: لا خلط أكاديمي بشخصي', !!r.error)
r=await db.query(`insert into enrollments(student_id,teacher_id) values ($1,$2)`,[P1,ids.t2]).catch(e=>({error:e.message})); ok('مشغّل: الطالب الشخصي لمالكه فقط', !!r.error)
r=await db.query(`insert into enrollments(student_id,group_id,teacher_id) values ($1,$2,$3)`,[A1,G1,ids.t1]).catch(e=>({error:e.message})); ok('فهرس فريد: لا تسجيل نشط مكرر', !!r.error)
// ===== الحصص =====
r=await as('t1',`insert into lessons(teacher_id,group_id,lesson_date,status) values ($1,$2,'2026-10-01','done') returning id,scope`,[ids.t1,G1]); ok('معلم1 ينشئ حصة لمجموعته (scope=academy تلقائياً)', r.rows[0]?.scope==='academy', r)
const L1=r.rows[0]?.id
r=await as('t2',`insert into lessons(teacher_id,group_id,lesson_date) values ($1,$2,'2026-10-02')`,[ids.t2,G1]); ok('معلم2 لا ينشئ حصة لمجموعة غيره', !!r.error, r)
r=await as('t2',`insert into lessons(teacher_id,group_id,lesson_date) values ($1,$2,'2026-10-02')`,[ids.t1,G1]); ok('لا ينتحل معلم آخر', !!r.error, r)
r=await as('t1',`insert into lessons(teacher_id,student_id,lesson_date,status) values ($1,$2,'2026-10-03','done') returning id,scope`,[ids.t1,P1]); ok('حصة فردية لطالب شخصي → scope=personal', r.rows[0]?.scope==='personal', r)
const LP=r.rows[0]?.id
ok('المدير لا يرى الحصص الشخصية ويرى الأكاديمية', (await as('admin','select scope from lessons')).rows.map(x=>x.scope).join()==='academy')
ok('معلم2 لا يرى حصص معلم1', await cnt('t2','lessons')===0)
// ===== الحضور والسعر =====
r=await as('t1',`insert into attendance(lesson_id,student_id,status) values ($1,$2,'present') returning price_at_time`,[L1,A1]); ok('تسجيل حضور: السعر يُثبَّت تلقائياً = 100', Number(r.rows[0]?.price_at_time)===100, r)
r=await as('t1',`insert into attendance(lesson_id,student_id,status,price_at_time) values ($1,$2,'present',1)`,[L1,A2]); ok('لا يمكن تمرير price_at_time من العميل', !!r.error, r)
r=await as('t1',`insert into attendance(lesson_id,student_id,status) values ($1,$2,'present')`,[L1,A2]); ok('لا حضور لطالب خارج المجموعة', !!r.error, r)
r=await as('t2',`insert into attendance(lesson_id,student_id,status) values ($1,$2,'present')`,[L1,A1]); ok('معلم2 لا يسجّل حضور حصة غيره', !!r.error, r)
await db.query(`update students set lesson_price=500 where id=$1`,[A1])
r=await as('t1',`update attendance set status='late', price_at_time=1 where lesson_id=$1`,[L1]); ok('تعديل الحالة ممنوع على price_at_time', !!r.error, r)
r=await as('t1',`update attendance set status='late' where lesson_id=$1 returning price_at_time`,[L1]); ok('تغيّر سعر الطالب لاحقاً لا يغيّر سعر الحصة المسجّلة', Number(r.rows[0]?.price_at_time)===100, r)
await db.query(`update students set lesson_price=100 where id=$1`,[A1])
ok('ولي الأمر 1 يرى حضور ابنه فقط', (await as('parent1','select student_id from attendance')).rows.every(x=>x.student_id===A1) && await cnt('parent1','attendance')===1)
ok('ولي الأمر 2 لا يرى شيئاً من حضور A1', await cnt('parent2','attendance')===0)
// ===== التقارير: wa_* =====
r=await as('t1',`insert into reports(lesson_id,student_id,report_type,teacher_notes) values ($1,$2,'group','جيد') returning wa_status`,[L1,A1]); ok('تقرير جديد حالته pending', r.rows[0]?.wa_status==='pending', r)
r=await as('t1',`update reports set wa_status='sent' where lesson_id=$1`,[L1]); ok('المعلم لا يكتب wa_status', !!r.error, r)
r=await as('t1',`insert into reports(lesson_id,student_id,report_type,wa_status) values ($1,$2,'individual','sent')`,[LP,P1]); ok('المعلم لا يُدرج تقريراً بحالة sent', !!r.error, r)
r=await as('service',`update reports set wa_status='sent', wa_sent_at=now() where lesson_id=$1`,[L1]); ok('البوت يكتب wa_status', !r.error && r.n===1, r)
ok('ولي الأمر يرى تقرير ابنه', await cnt('parent1','reports')===1)
ok('ولي أمر آخر لا يرى', await cnt('parent2','reports')===0)
// ===== المالية =====
await as('t1',`insert into attendance(lesson_id,student_id,status) values ($1,$2,'absent')`,[LP,P1]) // شخصي
// A1: 3 حصص (حاضر/متأخر/غائب) × 100 → المستهلك 200
const mk=async(d,st)=>{const l=await q1(`insert into lessons(teacher_id,group_id,lesson_date,status) values ($1,$2,$3,'done') returning id`,[ids.t1,G1,d]);await db.query(`insert into attendance(lesson_id,student_id,status) values ($1,$2,$3)`,[l.id,A1,st])}
await mk('2026-10-05','present');await mk('2026-10-06','absent')
ok('الرصيد: لا يُرى للمعلم عن طالب أكاديمي', (await as('t1',`select * from student_balances where student_id=$1`,[A1])).rows.length===0)
ok('المشرف بلا manage_finance لا يرى الأرصدة', await cnt('supAll','student_balances')===0)
await as('supFin',`insert into payments(student_id,amount) values ($1,500)`,[A1])
r=await as('supFin',`select consumed,total_paid,balance,credit,debt,attended_lessons from student_balances where student_id=$1`,[A1])
ok('رصيد: حاضر+متأخر مستهلك=200، مدفوع 500 → رصيد دائن 300', r.rows[0] && Number(r.rows[0].consumed)===200 && Number(r.rows[0].credit)===300 && Number(r.rows[0].debt)===0 && Number(r.rows[0].attended_lessons)===2, r.rows)
await as('supFin',`insert into payments(student_id,amount) values ($1,0.01)`,[A2]); 
r=await as('supFin',`select debt from student_balances where student_id=$1`,[A2]); ok('طالب بلا استهلاك: لا دين', Number(r.rows[0]?.debt)===0, r)
ok('المشرف المالي يرى طلاب الأكاديمية فقط (3 لا الشخصيين)', (await as('supFin','select scope from student_balances')).rows.length===3 && (await as('supFin',"select 1 from student_balances where scope='personal'")).rows.length===0)
ok('ولي الأمر لا يرى مدفوعات ولا أرصدة', await cnt('parent1','payments')===0 && await cnt('parent1','student_balances')===0)
ok('المعلم لا يرى مدفوعات الأكاديمية', await cnt('t1','payments')===0)
r=await as('t1',`insert into payments(student_id,amount) values ($1,70)`,[P1]); ok('المعلم يسجّل دفعة لطالبه الشخصي', !r.error, r)
r=await as('t1',`insert into payments(student_id,amount) values ($1,70)`,[A1]); ok('المعلم لا يسجّل دفعة لطالب أكاديمية', !!r.error, r)
r=await as('t1',`select consumed from student_balances where student_id=$1`,[P1]); ok('المعلم يرى رصيد طالبه الشخصي فقط (حاضر لم يُسجَّل→0)', r.rows.length===1, r)
ok('المدير لا يرى رصيد الشخصي', (await as('admin',`select 1 from student_balances where student_id=$1`,[P1])).rows.length===0)
r=await as('admin',`select count(*)::int c from payments where student_id=$1`,[P1]); ok('المدير لا يرى مدفوعات الشخصي', r.rows[0].c===0)
r=await as('supFin',`insert into payments(student_id,amount) values ($1,-5)`,[A1]); ok('مبلغ سالب مرفوض', !!r.error)
r=await as('supFin',`delete from payments where student_id=$1`,[A1]); ok('لا حذف للمدفوعات', !!r.error)
r=await as('supFin',`update payments set amount=1 where student_id=$1`,[A1]); ok('المشرف المالي لا يعدّل دفعة (للمدير فقط)', r.n===0 && !r.error || !!r.error, r)
r=await as('admin',`update payments set note='تصحيح' where student_id=$1`,[A1]); ok('المدير يصحّح دفعة', r.n>=1, r)
r=await as('supFin',`select teacher_name,lessons_done,amount from teacher_earnings where teacher_id=$1`,[ids.t1]); ok('أرباح المعلم: 3 حصص مجموعة، حضور 2 × 20 لكل طالب = 40 (الغائب والشخصية لا تُحتسب)', r.rows[0] && Number(r.rows[0].lessons_done)===3 && Number(r.rows[0].amount)===40, r.rows)
ok('المعلم يرى أرباحه فقط', (await as('t2','select 1 from teacher_earnings')).rows.length===0 && (await as('t1','select 1 from teacher_earnings')).rows.length===1)
ok('ولي الأمر لا يرى الأرباح', await cnt('parent1','teacher_earnings')===0)
// ===== التقييمات والشهادات =====
await as('t1',`insert into monthly_evaluations(student_id,month,overall) values ($1,'2026-10-01','ممتاز')`,[A1])
ok('تقييم غير منشور لا يراه ولي الأمر', await cnt('parent1','monthly_evaluations')===0)
await as('t1',`update monthly_evaluations set published=true where student_id=$1`,[A1])
ok('بعد النشر يراه ولي الأمر', await cnt('parent1','monthly_evaluations')===1)
r=await as('t1',`insert into monthly_evaluations(student_id,month) values ($1,'2026-10-15')`,[A2]); ok('تقييم بتاريخ ليس أول الشهر مرفوض', !!r.error)
r=await as('t1',`insert into monthly_evaluations(student_id,month) values ($1,'2026-10-01')`,[A2]); ok('معلم لا يقيّم طالب غيره', !!r.error)
// ===== الإعلانات والمحتوى والتواصل =====
ok('الزائر يرى إعلان "للجميع" فقط', (await as('anon','select audience from announcements')).rows.map(x=>x.audience).join()==='all')
ok('المعلم: للجميع + للمعلمين', (await as('t1','select audience from announcements')).rows.length===2)
ok('ولي الأمر: للجميع + للطلاب', (await as('parent1',`select audience from announcements where audience<>'all'`)).rows[0]?.audience==='students')
ok('المشرف add_announcements يرى الكل', await cnt('supAll','announcements')===3)
r=await as('t1',`insert into announcements(title,body) values ('هجوم','x')`); ok('المعلم لا ينشر إعلاناً', !!r.error)
r=await as('supContent',`insert into announcements(title,body) values ('رسمي','x')`); ok('مشرف بصلاحية ينشر إعلاناً', !r.error, r)
ok('الزائر لا يقرأ جدول المحتوى مباشرة', !!(await as('anon','select key_element from content_site')).error)
r=await as('anon','select key_element,text_value,visible from public_content'); ok('الزائر يقرأ العرض: المخفي بلا نص ومعلَّم مخفياً', r.rows.length===2 && r.rows.filter(x=>x.visible===false).every(x=>x.text_value===null) && r.rows.some(x=>x.visible && x.text_value), r.rows)
r=await as('anon',`insert into content_site(key_element,text_value) values ('a.b','x')`); ok('الزائر لا يكتب في content_site', !!r.error)
r=await as('supNone',`update content_site set text_value='x'`); ok('مشرف بلا manage_content لا يعدّل', (!!r.error)||r.n===0, r)
r=await as('supContent',`update content_site set text_value='جديد' where key_element='home.title'`); ok('مشرف manage_content يعدّل', r.n===1, r)
ok('مشرف المحتوى يرى المخفي أيضاً', await cnt('supContent','content_site')===2)
r=await as('anon',`insert into contact_messages(name,phone,role,message) values ('أحمد علي','01000000000','ولي أمر','رسالة تجربة')`); ok('الزائر يرسل رسالة تواصل', !r.error, r)
r=await as('anon',`insert into contact_messages(name,phone,message) values ('أ','01','x')`); ok('قيود الطول ترفض البيانات القصيرة', !!r.error)
r=await as('anon',`insert into contact_messages(name,phone,message,handled) values ('أحمد علي','01000000000','رسالة تجربة','true')`); ok('الزائر لا يضبط handled', !!r.error)
ok('الزائر لا يقرأ الرسائل', !!(await as('anon','select * from contact_messages')).error)
ok('المعلم لا يقرأ الرسائل', await cnt('t1','contact_messages')===0)
ok('المشرف manage_students يقرأ الرسائل', await cnt('supAll','contact_messages')===1)
// ===== profile/teachers =====
ok('المعلم يرى صفّه فقط في teachers (rate لا يظهر لغيره)', await cnt('t1','teachers')===1)
ok('ولي الأمر لا يرى المعلمين', await cnt('parent1','teachers')===0)
r=await as('t1',`update teachers set lesson_rate=999 where id=$1`,[ids.t1]); ok('المعلم لا يرفع أجره', r.n===0||!!r.error, r)
r=await as('admin',`update teachers set lesson_rate=35 where id=$1`,[ids.t1]); ok('المدير يعدّل الأجر', r.n===1, r)

// ===== المرحلة 5: الباقات وأجر المعلم =====
r=await as('t1','select rate, attended, amount from teacher_lesson_earnings order by lesson_date')
ok('تفصيل الأجر: ثلاث حصص مجموعة بسعر 20 للطالب والحاضرون 1،1،0', r.rows.length===3 && r.rows.every(x=>Number(x.rate)===20) && r.rows.map(x=>x.attended).join()==='1,1,0', r.rows)
ok('معلم2 لا يرى تفصيل أجر معلم1', (await as('t2','select 1 from teacher_lesson_earnings')).rows.length===0)
ok('ولي الأمر لا يقرأ عمود أجر المعلم من lessons', !!(await as('parent1','select teacher_rate_at_time from lessons')).error)
ok('المعلم لا يقرأ عمود الأجر مباشرة', !!(await as('t1','select teacher_rate_at_time from lessons')).error)
r=await as('t1',`update lessons set teacher_rate_at_time=999 where id=$1`,[L1]); ok('المعلم لا يكتب الأجر المثبَّت', !!r.error, r)
ok('تغيير سعر المجموعة إلى 25 لا يمس الحصص السابقة (يبقى 40)', (await as('admin',`update teachers set group_rate_per_student=25 where id=$1`,[ids.t1])).n===1 && Number((await as('supFin',`select amount from teacher_earnings where teacher_id=$1`,[ids.t1])).rows[0]?.amount)===40)
r=await as('t1',`insert into lessons(teacher_id,group_id,lesson_date,status) values ($1,$2,'2026-10-07','done') returning id`,[ids.t1,G1]); const LN=r.rows[0]?.id
r=await as('t1',`insert into attendance(lesson_id,student_id,status) values ($1,$2,'present')`,[LN,A1]); ok('تسجيل الحضور في الحصة الجديدة', !r.error, r)
ok('الحصة الجديدة بالسعر الجديد 25×1: الإجمالي 65', Number((await as('supFin',`select amount from teacher_earnings where teacher_id=$1`,[ids.t1])).rows[0]?.amount)===65)
await as('t1',`update lessons set status='scheduled' where id=$1`,[LN])
ok('إلغاء إتمام الحصة يزيل أجرها (40)', Number((await as('supFin',`select amount from teacher_earnings where teacher_id=$1`,[ids.t1])).rows[0]?.amount)===40)
await db.query(`delete from attendance where lesson_id=$1`,[LN])
// حصة فردية (برايفت) لمعلم2: سعر ثابت 40 يُحتسب بحضور الطالب
r=await as('t2',`insert into lessons(teacher_id,student_id,lesson_date,status) values ($1,$2,'2026-10-09','done') returning id`,[ids.t2,A2]); const LI=r.rows[0]?.id
ok('حصة فردية أكاديمية يمكن إنشاؤها لطالب مسجّل', !!LI, r)
await as('t2',`insert into attendance(lesson_id,student_id,status) values ($1,$2,'present')`,[LI,A2])
ok('الفردي: حضور الطالب → سعر ثابت 40', Number((await as('supFin',`select amount from teacher_earnings where teacher_id=$1`,[ids.t2])).rows[0]?.amount)===40)
await as('t2',`update attendance set status='absent' where lesson_id=$1`,[LI])
ok('الفردي: غياب الطالب → لا أجر', Number((await as('supFin',`select amount from teacher_earnings where teacher_id=$1`,[ids.t2])).rows[0]?.amount)===0)
await as('t2',`update attendance set status='late' where lesson_id=$1`,[LI])
ok('الفردي: تأخر الطالب يُحتسب حضوراً (40)', Number((await as('supFin',`select amount from teacher_earnings where teacher_id=$1`,[ids.t2])).rows[0]?.amount)===40)
r=await as('t1',`insert into lessons(teacher_id,group_id,lesson_date,start_time) values ($1,$2,'2026-10-08','17:30') returning start_time`,[ids.t1,G1]); ok('وقت الحصة يُحفظ', r.rows[0]?.start_time?.startsWith('17:30'), r)

// الباقات: المدير والمشرف فقط (والمعلم لطلابه الشخصيين)
r=await as('t1',`insert into student_packages(student_id,kind,lessons_total,starts_on) values ($1,'lessons',2,'2026-10-01')`,[A1]); ok('المعلم لا ينشئ باقة لطالب أكاديمية', !!r.error, r)
r=await as('supNone',`insert into student_packages(student_id,kind,lessons_total,starts_on) values ($1,'lessons',2,'2026-10-01')`,[A1]); ok('مشرف بلا manage_students لا ينشئ باقة', !!r.error, r)
r=await as('supAll',`insert into student_packages(student_id,kind,lessons_total,starts_on) values ($1,'lessons',2,'2026-10-01') returning id`,[A1]); ok('المشرف (manage_students) ينشئ باقة بعدد حصص', !r.error, r)
const PKG1=r.rows[0]?.id
r=await as('admin',`insert into student_packages(student_id,kind,lessons_total) values ($1,'lessons',5)`,[A1]); ok('باقة نشطة واحدة فقط للطالب', !!r.error)
r=await as('admin',`insert into student_packages(student_id,kind) values ($1,'monthly')`,[A2]); ok('باقة شهرية بلا تاريخ نهاية مرفوضة', !!r.error)
r=await as('admin',`insert into student_packages(student_id,kind) values ($1,'lessons')`,[A2]); ok('باقة بعدد حصص بلا عدد مرفوضة', !!r.error)
r=await as('admin',`insert into student_packages(student_id,kind,lessons_total) values ($1,'lessons',4)`,[P1]); ok('المدير لا ينشئ باقة لطالب شخصي', !!r.error, r)
r=await as('t1',`insert into student_packages(student_id,kind,lessons_total) values ($1,'lessons',4) returning id`,[P1]); ok('المعلم ينشئ باقة لطالبه الشخصي', !r.error, r)
ok('معلم الطالب يقرأ باقته ولا يعدّلها', await cnt('t1','student_packages')===2 && (await as('t1',`update student_packages set lessons_total=99 where id=$1`,[PKG1])).n===0)
r=await as('t1',`update student_packages set status='archived' where id=$1`,[PKG1]); ok('المعلم لا يؤرشف باقة طالب أكاديمية', r.n===0||!!r.error, r)
ok('ولي الأمر 1 يرى باقة ابنه', await cnt('parent1','student_packages')===1)
ok('ولي الأمر 2 لا يرى باقة غيره', await cnt('parent2','student_packages')===0)
ok('المدير يرى باقات الأكاديمية فقط (1)', await cnt('admin','student_packages')===1)
r=await as('t1',`select used_lessons from package_progress where package_id=$1`,[PKG1]); ok('تقدّم الباقة: حصتان مستهلكتان (متأخر + حاضر؛ الغائب لا يُحتسب)', Number(r.rows[0]?.used_lessons)===2, r)
r=await as('t1',`insert into reports(lesson_id,student_id,report_type,teacher_notes) select id,$1,'group','تقرير' from lessons where lesson_date='2026-10-05' and group_id=$2 returning package_id`,[A1,G1]); ok('التقرير الجديد يُربط بالباقة تلقائياً', r.rows[0]?.package_id===PKG1, r)
r=await as('t1',`update reports set package_id=null where student_id=$1`,[A1]); ok('المعلم لا يغيّر package_id', !!r.error, r)
r=await as('anon','select refresh_packages()'); ok('الزائر لا يستدعي refresh_packages', !!r.error, r)
r=await as('t1','select refresh_packages() n'); ok('refresh: الباقة المستهلكة (2/2) تُؤرشف تلقائياً', Number(r.rows[0]?.n)>=1, r)
r=await as('t1',`select status,ends_on::text,archived_at is not null a from student_packages where id=$1`,[PKG1]); ok('الأرشفة: status=archived و ends_on=2026-10-05', r.rows[0]?.status==='archived' && r.rows[0]?.ends_on==='2026-10-05' && r.rows[0]?.a, r.rows)
r=await as('supAll',`insert into student_packages(student_id,kind,ends_on,starts_on) values ($1,'monthly','2026-09-30','2026-09-01') returning id`,[A1]); ok('باقة جديدة بعد الأرشفة مسموحة', !r.error, r)
const PKG2=r.rows[0]?.id
await as('supAll','select refresh_packages()'); r=await as('t1',`select status from student_packages where id=$1`,[PKG2]); ok('الباقة الشهرية المنتهية تاريخها تُؤرشف', r.rows[0]?.status==='archived', r)
r=await as('t1',`select save_package_summary($1,'ملخص الباقة')`,[PKG1]); ok('المعلم يحفظ ملخص باقة طالبه عبر الدالة', !r.error, r)
ok('الملخص محفوظ', (await as('t1',`select summary from student_packages where id=$1`,[PKG1])).rows[0]?.summary==='ملخص الباقة')
r=await as('t2',`select save_package_summary($1,'اختراق')`,[PKG1]); ok('معلم آخر لا يحفظ ملخصاً', !!r.error, r)
r=await as('t1',`update student_packages set summary='x' where id=$1`,[PKG1]); ok('لا تعديل مباشر للملخص (عمود غير ممنوح)', !!r.error, r)
r=await as('anon',`select save_package_summary($1,'x')`,[PKG1]); ok('الزائر لا يستدعي دالة الملخص', !!r.error, r)
r=await as('admin',`update student_packages set student_id=$1 where id=$2`,[A2,PKG1]); ok('لا يمكن نقل الباقة لطالب آخر', !!r.error, r)


// ===================== المرحلة 6: مرفقات التقارير =====================
const F=(t,l,st,n)=>`${ids[t]}/${l}/${st}/${n}`
const up=(who,name)=>as(who,`insert into storage.objects(bucket_id,name,owner) values ('report-files',$1,auth.uid())`,[name])
r=await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id='report-files'`); ok('الحاوية خاصة بحد 20MB وأنواع محددة', r.rows[0]?.public===false && Number(r.rows[0]?.file_size_limit)===20971520 && r.rows[0]?.allowed_mime_types.includes('application/pdf'), r.rows)
r=await up('t1',F('t1',L1,A1,'a.png')); ok('المعلم يرفع مرفقاً لطالب في حصته', !r.error, r)
r=await up('t1',F('t2',L1,A1,'b.png')); ok('لا رفع داخل مجلد معلم آخر', !!r.error, r)
r=await up('t2',F('t2',L1,A1,'c.png')); ok('معلم آخر لا يرفع لحصة غيره', !!r.error, r)
r=await up('t1',F('t1',L1,A2,'d.png')); ok('لا رفع لطالب ليس ضمن الحصة', !!r.error, r)
r=await up('t1',F('t1',L1,A1,'a b.png')); ok('اسم ملف بمسافات/رموز مرفوض', !!r.error, r)
r=await up('t1',`${ids.t1}/${L1}/${A1}/x/y.png`); ok('عمق مسار غير صحيح مرفوض', !!r.error, r)
r=await up('t1',`${ids.t1}/not-a-uuid/${A1}/y.png`); ok('معرّف غير UUID مرفوض', !!r.error, r)
r=await up('parent1',F('t1',L1,A1,'p.png')); ok('ولي الأمر لا يرفع', !!r.error, r)
r=await up('anon',F('t1',L1,A1,'z.png')); ok('الزائر لا يرفع', !!r.error, r)
const nf=async who=>(await as(who,`select count(*)::int c from storage.objects where name=$1`,[F('t1',L1,A1,'a.png')])).rows[0]?.c
ok('المعلم يقرأ مرفقه', await nf('t1')===1)
ok('معلم آخر لا يقرأه', await nf('t2')===0)
ok('ولي أمر الطالب يقرأ مرفق ابنه', await nf('parent1')===1)
ok('ولي أمر آخر لا يقرأه', await nf('parent2')===0)
ok('المشرف المتابع للتقارير يقرأ مرفقات الأكاديمية', await nf('supAll')===1)
ok('مشرف بلا صلاحية لا يقرأ', await nf('supNone')===0)
ok('المدير يقرأ مرفقات الأكاديمية', await nf('admin')===1)
ok('الزائر لا يقرأ', (await as('anon',`select 1 from storage.objects`)).error!==undefined || (await nf('anon'))===0)
r=await up('t1',F('t1',LP,P1,'p.pdf')); ok('المعلم يرفع مرفقاً لحصته الشخصية', !r.error, r)
const np=async who=>(await as(who,`select count(*)::int c from storage.objects where name=$1`,[F('t1',LP,P1,'p.pdf')])).rows[0]?.c
ok('مرفق الحصة الشخصية: المدير والمشرف لا يريانه', await np('admin')===0 && await np('supAll')===0 && await np('t1')===1)
r=await as('t2',`delete from storage.objects where name=$1`,[F('t1',L1,A1,'a.png')]); ok('معلم آخر لا يحذف مرفقاً', r.n===0, r)
r=await as('t1',`delete from storage.objects where name=$1`,[F('t1',L1,A1,'a.png')]); ok('المعلم يحذف مرفقه', r.n===1, r)
r=await as('t1',`insert into reports(lesson_id,student_id,report_type,attachments) values ($1,$2,'group',$3::jsonb)`,[LN,A1,JSON.stringify([1,2,3,4,5,6])]); ok('حد المرفقات: 6 ملفات مرفوضة', !!r.error, r)
r=await as('t1',`insert into reports(lesson_id,student_id,report_type,attachments) values ($1,$2,'group','{"a":1}'::jsonb)`,[LN,A1]); ok('المرفقات يجب أن تكون مصفوفة', !!r.error, r)


// ===================== المرحلة 7: المالية =====================
const Z=(await q1(`insert into students(full_name,study_type,lesson_price) values ('طالب بلا سعر','private',0) returning id`)).id
const zl=async(d,st)=>{const l=await q1(`insert into lessons(teacher_id,student_id,lesson_date,status) values ($1,$2,$3,'done') returning id`,[ids.t1,Z,d]);await db.query(`insert into attendance(lesson_id,student_id,status) values ($1,$2,$3)`,[l.id,Z,st])}
await zl('2026-10-01','present'); await zl('2026-10-02','late'); await zl('2026-10-03','absent')
const cc=async(who,sid)=>(await as(who,`select count(*)::int c from student_consumed_lessons where student_id=$1`,[sid])).rows[0]?.c
ok('الحصص المستهلكة: المشرف المالي يراها (حاضر/متأخر فقط)', await cc('supFin',Z)===2, await cc('supFin',Z))
ok('الحصص المستهلكة: الغائب غير موجود', (await as('supFin',`select 1 from student_consumed_lessons where student_id=$1 and status='absent'`,[Z])).rows.length===0)
ok('الحصص المستهلكة: مشرف بلا مالية/معلم/ولي أمر لا يرون', await cc('supAll',A1)===0 && await cc('t1',A1)===0 && await cc('parent1',A1)===0)
ok('الحصص المستهلكة: المدير يرى استهلاك الأكاديمية', await cc('admin',A1)>=1)
r=await as('t1',`select count(*)::int c from student_consumed_lessons where student_id=$1`,[P1]); ok('المعلم يرى استهلاك طالبه الشخصي فقط', r.error===undefined)
ok('المدير لا يرى استهلاك الطالب الشخصي', await cc('admin',P1)===0)

r=await as('supFin',`select set_student_price($1, 120, false) n`,[A1]); ok('المشرف المالي يحدد سعر طالب أكاديمية', !r.error && r.rows[0].n===0, r)
r=await q1(`select lesson_price from students where id=$1`,[A1]); ok('السعر الجديد محفوظ', Number(r.lesson_price)===120, r)
const lx=await q1(`insert into lessons(teacher_id,group_id,lesson_date,status) values ($1,$2,'2026-10-12','done') returning id`,[ids.t1,G1])
await db.query(`insert into attendance(lesson_id,student_id,status) values ($1,$2,'present')`,[lx.id,A1])
r=await q1(`select price_at_time from attendance where lesson_id=$1 and student_id=$2`,[lx.id,A1]); ok('الحصة الجديدة بالسعر الجديد 120', Number(r.price_at_time)===120, r)
r=await db.query(`select price_at_time from attendance where student_id=$1 and lesson_id<>$2 and status='present' order by price_at_time`,[A1,lx.id]); ok('الحصص القديمة تحتفظ بسعرها (لا 120)', r.rows.length>0 && r.rows.every(x=>Number(x.price_at_time)!==120), r.rows)
r=await as('supFin',`select set_student_price($1, 80, true) n`,[Z]); ok('المشرف المالي لا يصحّح حصصاً سابقة (للمدير فقط)', !!r.error, r)
r=await as('admin',`select set_student_price($1, 80, true) n`,[Z]); ok('المدير يسعّر الحصص السابقة بسعر 0 → 2 حصة', !r.error && r.rows[0].n===2, r)
r=await db.query(`select status, price_at_time from attendance where student_id=$1 order by status`,[Z]); ok('الغائب لم يُسعَّر والباقي 80', r.rows.find(x=>x.status==='absent')?.price_at_time==0 && r.rows.filter(x=>x.status!=='absent').every(x=>Number(x.price_at_time)===80), r.rows)
const before=(await db.query(`select sum(price_at_time) s from attendance where student_id=$1`,[A1])).rows[0].s
await as('admin',`select set_student_price($1, 999, true)`,[A1])
ok('التصحيح لا يمس الحصص المسعّرة سابقاً', (await db.query(`select sum(price_at_time) s from attendance where student_id=$1`,[A1])).rows[0].s===before)
r=await as('admin',`select balance, consumed from student_balances where student_id=$1`,[Z]); ok('الرصيد يعكس التسعير: مستهلك 160، رصيد −160 (مديونية)', Number(r.rows[0]?.consumed)===160 && Number(r.rows[0]?.balance)===-160, r.rows)
r=await as('admin',`update attendance set price_at_time=1 where student_id=$1`,[Z]); ok('العميل لا يعدّل سعر الحصة مباشرة', !!r.error || (await db.query(`select 1 from attendance where student_id=$1 and price_at_time=1`,[Z])).rows.length===0, r)
r=await as('t1',`select set_student_price($1, 90, false)`,[P1]); ok('المعلم يحدد سعر طالبه الشخصي', !r.error, r)
r=await as('t1',`select set_student_price($1, 90, true)`,[P1]); ok('المعلم يصحّح حصص طالبه الشخصي', !r.error, r)
r=await as('t1',`select set_student_price($1, 90, false)`,[A1]); ok('المعلم لا يحدد سعر طالب أكاديمية', !!r.error, r)
r=await as('t2',`select set_student_price($1, 90, false)`,[P1]); ok('معلم آخر لا يحدد سعر الشخصي', !!r.error, r)
r=await as('parent1',`select set_student_price($1, 1, false)`,[A1]); ok('ولي الأمر لا يحدد سعراً', !!r.error, r)
r=await as('supFin',`select set_student_price($1, -5, false)`,[A1]); ok('سعر سالب مرفوض', !!r.error, r)
r=await as('anon',`select set_student_price($1, 5, false)`,[A1]); ok('الزائر لا ينفّذ الدالة', !!r.error, r)
// معادلة الرصيد الكاملة: مدين ← دفعة ← دائن
const Y=(await q1(`insert into students(full_name,study_type,lesson_price) values ('طالب مالي','private',100) returning id`)).id
for (const d of ['2026-10-01','2026-10-02','2026-10-03']) { const l=await q1(`insert into lessons(teacher_id,student_id,lesson_date,status) values ($1,$2,$3,'done') returning id`,[ids.t1,Y,d]); await db.query(`insert into attendance(lesson_id,student_id,status) values ($1,$2,'present')`,[l.id,Y]) }
const bal=async()=>(await as('supFin',`select consumed,total_paid,balance,credit,debt from student_balances where student_id=$1`,[Y])).rows[0]
let b=await bal(); ok('3 حصص×100 بلا دفع: مديونية 300', Number(b.consumed)===300 && Number(b.debt)===300 && Number(b.credit)===0, b)
await as('supFin',`insert into payments(student_id,amount,method) values ($1,100,'cash')`,[Y]); b=await bal(); ok('دفع 100: مديونية 200', Number(b.debt)===200 && Number(b.total_paid)===100, b)
await as('supFin',`insert into payments(student_id,amount) values ($1,300)`,[Y]); b=await bal(); ok('دفع إضافي 300: رصيد دائن 100 ولا دين', Number(b.credit)===100 && Number(b.debt)===0 && Number(b.balance)===100, b)
await as('supFin',`insert into payments(student_id,amount) values ($1,0.5)`,[Y]); b=await bal(); ok('دقة الكسور: 100.5', Number(b.credit)===100.5, b)


// ===================== المرحلة 8: لوحة الإدارة =====================
// --- المواد ---
r=await as('supAll',`insert into subjects(name) values ('لغة عربية')`); ok('مشرف manage_groups يضيف مادة', !r.error, r)
r=await as('supNone',`insert into subjects(name) values ('فيزياء')`); ok('مشرف بلا صلاحية لا يضيف مادة', !!r.error, r)
r=await as('supContent',`insert into subjects(name) values ('فيزياء')`); ok('مشرف المحتوى لا يضيف مادة', !!r.error, r)
r=await as('t1',`insert into subjects(name) values ('فيزياء')`); ok('المعلم لا يضيف مادة', !!r.error, r)
r=await as('admin',`insert into subjects(name) values ('كيمياء') returning id`); ok('المدير يضيف مادة', !r.error && r.rows.length===1, r)
// --- سجل العمليات ---
const al=async(who,where='true',pr=[])=>(await as(who,`select * from audit_log where ${where} order by id`,pr))
r=await al('admin',`table_name='subjects' and action='insert' and changes->>'name'='كيمياء'`); ok('السجل: إضافة المادة مسجّلة باسم المدير', r.rows.length===1 && r.rows[0].actor===ids.admin && r.rows[0].actor_name==='اسم admin', r.rows)
ok('السجل: مشرف/معلم/ولي أمر/زائر لا يقرؤونه', (await al('supAll')).rows.length===0 && (await al('t1')).rows.length===0 && (await al('parent1')).rows.length===0 && (await al('anon')).rows.length===0)
await as('admin',`update teachers set lesson_rate=55 where id=$1`,[ids.t1])
r=await al('admin',`table_name='teachers' and action='update' and row_id=$1`,[ids.t1]); ok('السجل: تغيير سعر المعلم old→new', r.rows.length>=1 && r.rows.at(-1).changes.lesson_rate.new===55 && r.rows.at(-1).changes.lesson_rate.old!==55, r.rows.at(-1))
await as('admin',`update teachers set lesson_rate=55 where id=$1`,[ids.t1]); r=await al('admin',`table_name='teachers' and action='update' and row_id=$1`,[ids.t1]); const nUpd=r.rows.length
await as('admin',`update teachers set lesson_rate=55 where id=$1`,[ids.t1]); r=await al('admin',`table_name='teachers' and action='update' and row_id=$1`,[ids.t1]); ok('السجل: تحديث بلا تغيير لا يُسجَّل', r.rows.length===nUpd)
await as('supAll',`insert into student_contacts(student_id,student_phone,parent_name,parent_phone) values ($1,'0100000001','والد س','0100000002') on conflict (student_id) do update set parent_phone=excluded.parent_phone`,[A2])
r=await al('admin',`table_name='student_contacts'`); const txt=JSON.stringify(r.rows); ok('السجل: بيانات الاتصال مسجّلة بلا أرقام (مخفية)', r.rows.length>=1 && !txt.includes('0100000001') && !txt.includes('0100000002') && txt.includes('***'), txt)
await as('t1',`update students set lesson_price=75 where id=$1`,[P1])
r=await al('admin',`table_name='students' and row_id=$1`,[P1]); ok('السجل: الطالب الشخصي لا يُسجَّل (المدير لا يراه)', r.rows.length===0, r.rows)
await as('t1',`insert into payments(student_id,amount) values ($1,10)`,[P1])
r=await al('admin',`table_name='payments' and changes->>'student_id'=$1`,[P1]); ok('السجل: مدفوعات الشخصي لا تُسجَّل', r.rows.length===0)
await as('supFin',`insert into payments(student_id,amount) values ($1,11)`,[A2])
r=await al('admin',`table_name='payments' and changes->>'student_id'=$1`,[A2]); ok('السجل: مدفوعات الأكاديمية تُسجَّل', r.rows.length>=1 && r.rows.at(-1).actor===ids.supFin, r.rows)
await as('admin',`insert into permissions(user_id,permission_key) values ($1,'manage_content')`,[ids.supNone])
r=await al('admin',`table_name='permissions' and action='insert' and changes->>'user_id'=$1`,[ids.supNone]); ok('السجل: منح صلاحية', r.rows.length===1, r.rows)
await as('admin',`delete from permissions where user_id=$1 and permission_key='manage_content'`,[ids.supNone])
r=await al('admin',`table_name='permissions' and action='delete'`); ok('السجل: سحب صلاحية', r.rows.length>=1)
r=await as('admin',`update audit_log set action='x'`); ok('السجل: المدير لا يعدّله', !!r.error || r.n===0, r)
r=await as('admin',`delete from audit_log`); ok('السجل: المدير لا يحذفه', !!r.error || r.n===0, r)
r=await as('service',`delete from audit_log`); ok('السجل: حتى service_role لا يحذفه', !!r.error, r)
r=await as('service',`update audit_log set action='x'`); ok('السجل: ولا يعدّله', !!r.error, r)
r=await as('admin',`insert into audit_log(action,table_name) values ('fake','x')`); ok('السجل: لا إدراج مباشر من العميل', !!r.error, r)
r=await as('service',`insert into audit_log(action,table_name,actor_name) values ('user.create','profiles','النظام')`); ok('الخادم يسجّل إجراءاته (service_role)', !r.error, r)

// --- تغيير معلم المجموعة ---
const GT=(await q1(`insert into groups(name,teacher_id) values ('مجموعة نقل',$1) returning id`,[ids.t1])).id
const ST=(await q1(`insert into students(full_name,study_type,lesson_price) values ('طالب نقل','group',10) returning id`)).id
await db.query(`insert into enrollments(student_id,group_id,teacher_id) values ($1,$2,$3)`,[ST,GT,ids.t1])
const lf=(await q1(`insert into lessons(teacher_id,group_id,lesson_date,status) values ($1,$2,'2099-01-01','scheduled') returning id`,[ids.t1,GT])).id
const lp=(await q1(`insert into lessons(teacher_id,group_id,lesson_date,status) values ($1,$2,'2020-01-01','done') returning id`,[ids.t1,GT])).id
ok('قبل النقل: المعلم1 يرى الطالب والمعلم2 لا', (await as('t1',`select 1 from students where id=$1`,[ST])).rows.length===1 && (await as('t2',`select 1 from students where id=$1`,[ST])).rows.length===0)
r=await as('supAll',`update groups set teacher_id=$1 where id=$2`,[ids.t2,GT]); ok('المشرف manage_groups يغيّر معلم المجموعة', !r.error, r)
ok('النقل: المعلم الجديد يرى الطالب والقديم لا', (await as('t2',`select 1 from students where id=$1`,[ST])).rows.length===1 && (await as('t1',`select 1 from students where id=$1`,[ST])).rows.length===0)
ok('النقل: الحصة القادمة انتقلت والمنتهية بقيت', (await q1(`select teacher_id from lessons where id=$1`,[lf])).teacher_id===ids.t2 && (await q1(`select teacher_id from lessons where id=$1`,[lp])).teacher_id===ids.t1)
ok('النقل: التسجيل النشط يتبع المعلم الجديد', (await q1(`select teacher_id from enrollments where group_id=$1`,[GT])).teacher_id===ids.t2)
// --- متابعة التقارير ---
const rf=async who=>(await as(who,`select * from report_feed`)).rows
ok('متابعة التقارير: مشرف follow_reports يرى تقارير الأكاديمية', (await rf('supAll')).length>=1)
ok('متابعة التقارير: المدير يراها', (await rf('admin')).length>=1)
ok('متابعة التقارير: مشرف بلا صلاحية/مالية/معلم/ولي أمر لا يرون', (await rf('supNone')).length===0 && (await rf('supFin')).length===0 && (await rf('t1')).length===0 && (await rf('parent1')).length===0 && (await as('anon','select 1 from report_feed')).error!==undefined)
const row=(await rf('supAll'))[0]; ok('متابعة التقارير: اسم المعلم والطالب والمرفقات', row.teacher_name && row.student_name && Array.isArray(row.attachments), row)
await db.query(`insert into reports(lesson_id,student_id,report_type,teacher_notes) values ($1,$2,'individual','تقرير شخصي سري')`,[LP,P1]).catch(e=>console.log('NOTE',e.message))
ok('متابعة التقارير: تقارير الحصص الشخصية لا تظهر', !(await rf('admin')).some(x=>x.teacher_notes==='تقرير شخصي سري') && !(await rf('supAll')).some(x=>x.teacher_notes==='تقرير شخصي سري'))
// --- متابعة المعلمين ---
await db.query(`insert into lessons(teacher_id,group_id,lesson_date,status) values ($1,$2,'2020-01-01','scheduled')`,[ids.t1,G1])
const tf=async who=>(await as(who,`select * from teacher_follow`)).rows
r=await tf('supAll'); const t1row=r.find(x=>x.teacher_id===ids.t1); ok('متابعة المعلمين: المشرف يرى المعلمين مع الحصص المتأخرة', r.length===3 && t1row && t1row.overdue>=1 && t1row.groups_count>=1, r)
ok('متابعة المعلمين: مشرف بلا follow_teachers/مالية/معلم لا يرون', (await tf('supNone')).length===0 && (await tf('supFin')).length===0 && (await tf('t1')).length===0 && (await tf('parent1')).length===0)
ok('متابعة المعلمين: لا تُحسب الحصص الشخصية', !(await tf('admin')).some(x=>x.teacher_id===ids.t1 && x.done_30d>999))
// --- المصادقة الثنائية ---
const BA=await cnt('admin','students'), BS=await cnt('supAll','students'), BT=await cnt('t1','students'), BP=await cnt('parent1','students')
await db.query(`insert into auth.mfa_factors(user_id,status) values ($1,'verified')`,[ids.admin])
AAL='aal1'; ok('2FA: مدير لديه عامل مفعّل وجلسة AAL1 → لا صلاحيات', (await cnt('admin','students'))===0 && (await as('admin','select is_admin() a')).rows[0].a===false)
ok('2FA: ولا يقرأ سجل العمليات ولا متابعة التقارير', (await al('admin')).rows.length===0 && (await rf('admin')).length===0)
r=await as('admin',`insert into subjects(name) values ('تجاوز')`); ok('2FA: ولا يكتب (مادة)', !!r.error, r)
AAL='aal2'; ok('2FA: بجلسة AAL2 تعود الصلاحيات', (await cnt('admin','students'))===BA && BA>0 && (await as('admin','select is_admin() a')).rows[0].a===true)
AAL='aal1'; ok('2FA: مشرف بلا عامل لا يتأثر', (await cnt('supAll','students'))===BS && BS>0)
await db.query(`insert into auth.mfa_factors(user_id,status) values ($1,'unverified')`,[ids.supAll])
ok('2FA: عامل غير مفعّل لا يُحتسب', (await cnt('supAll','students'))===BS)
await db.query(`insert into auth.mfa_factors(user_id,status) values ($1,'verified')`,[ids.supAll])
ok('2FA: مشرف لديه عامل مفعّل وجلسة AAL1 → محجوب', (await cnt('supAll','students'))===0)
AAL='aal2'; ok('2FA: المشرف بـ AAL2 يعمل', (await cnt('supAll','students'))===BS)
AAL='aal1'; ok('2FA: مدير آخر/معلم/ولي أمر غير متأثرين', (await cnt('t1','students'))===BT && (await cnt('parent1','students'))===BP)
r=await as('admin',`select id,role from profiles where id=$1`,[ids.admin]); ok('2FA: الملف الشخصي يُقرأ بجلسة AAL1 (لتظهر شاشة الرمز)', r.rows.length===1 && r.rows[0].role==='admin', r)
r=await as('service',`select count(*)::int c from students`); ok('2FA: service_role غير متأثر', r.rows[0].c>=3, r)
await db.query(`delete from auth.mfa_factors`); AAL='aal1'


// ===================== المرحلة 9: إدارة الموقع =====================
const pc=async who=>(await as(who,'select * from public_content order by key_element')).rows
r=await as('supContent',`insert into content_site(key_element,text_value) values ('home.hero.title','عنوان جديد')`); ok('مشرف المحتوى يضيف عنصراً', !r.error, r)
r=await as('supContent',`insert into content_site(key_element,text_value) values ('home.hero.title','تكرار') on conflict (key_element) do update set text_value=excluded.text_value`); ok('upsert بنفس المفتاح يعدّل', !r.error, r)
ok('الزائر يرى التعديل فوراً', (await pc('anon')).find(x=>x.key_element==='home.hero.title')?.text_value==='تكرار')
r=await as('supContent',`update content_site set visible=false where key_element='home.hero.title'`); const hid=(await pc('anon')).find(x=>x.key_element==='home.hero.title')
ok('الإخفاء: الزائر لا يرى النص ويعرف أنه مخفي', hid && hid.visible===false && hid.text_value===null, hid)
await as('supContent',`update content_site set visible=true where key_element='home.hero.title'`)
r=await as('supContent',`delete from content_site where key_element='home.hero.title'`); ok('إعادة العنصر للأصل بالحذف', !r.error && r.n===1, r)
ok('بعد الحذف يرجع الزائر للافتراضي (لا صف)', !(await pc('anon')).some(x=>x.key_element==='home.hero.title'))
r=await as('supNone',`insert into content_site(key_element,text_value) values ('x.y','z')`); ok('مشرف بلا manage_content لا يكتب', !!r.error, r)
r=await as('t1',`insert into content_site(key_element,text_value) values ('x.y','z')`); ok('المعلم لا يكتب', !!r.error, r)
r=await as('parent1',`insert into content_site(key_element,text_value) values ('x.y','z')`); ok('ولي الأمر لا يكتب', !!r.error, r)
r=await as('supContent',`insert into content_site(key_element,image_url) values ('img.a','javascript:alert(1)')`); ok('رابط صورة javascript مرفوض', !!r.error, r)
r=await as('supContent',`insert into content_site(key_element,image_url) values ('img.a','http://x.com/a.png')`); ok('رابط صورة http مرفوض (https فقط)', !!r.error, r)
r=await as('supContent',`insert into content_site(key_element,image_url,size) values ('img.a','https://x.supabase.co/storage/v1/object/public/site-media/a.png','lg')`); ok('رابط https وحجم lg مقبول', !r.error, r)
r=await as('supContent',`insert into content_site(key_element,image_url,size) values ('img.b',null,'huge')`); ok('حجم غير معرّف مرفوض', !!r.error, r)
r=await as('supContent',`insert into content_site(key_element,text_value) values ('long.t',repeat('أ',5001))`); ok('نص أطول من 5000 مرفوض', !!r.error, r)
r=await as('supContent',`insert into content_site(key_element,visible) values ('page.home',false)`); ok('الصفحة الرئيسية لا تُخفى', !!r.error, r)
r=await as('supContent',`insert into content_site(key_element,visible) values ('page.about',false)`); ok('يمكن إخفاء صفحة «من نحن»', !r.error, r)
r=await as('supContent',`insert into content_site(key_element,text_value) values ('Bad Key!','x')`); ok('مفتاح غير صالح مرفوض', !!r.error, r)
r=await as('supContent',`update content_site set key_element='other' where key_element='img.a'`); ok('لا يُغيَّر مفتاح العنصر', !!r.error, r)
// --- التخزين: صور الموقع ---
r=await db.query(`select public,file_size_limit,allowed_mime_types from storage.buckets where id='site-media'`); ok('حاوية الصور عامة بحد 5MB وبلا SVG', r.rows[0]?.public===true && Number(r.rows[0]?.file_size_limit)===5242880 && !r.rows[0].allowed_mime_types.includes('image/svg+xml'), r.rows)
const U9='aaaaaaaa-1111-2222-3333-444444444444'
const upm=(who,name)=>as(who,`insert into storage.objects(bucket_id,name,owner) values ('site-media',$1,auth.uid())`,[name])
r=await upm('supContent',`${U9}.png`); ok('مشرف المحتوى يرفع صورة', !r.error, r)
r=await upm('supNone','bbbbbbbb-1111-2222-3333-444444444444.png'); ok('مشرف بلا صلاحية لا يرفع', !!r.error, r)
r=await upm('t1','bbbbbbbb-1111-2222-3333-444444444444.png'); ok('المعلم لا يرفع', !!r.error, r)
r=await upm('anon','bbbbbbbb-1111-2222-3333-444444444444.png'); ok('الزائر لا يرفع', !!r.error, r)
r=await upm('admin','cccccccc-1111-2222-3333-444444444444.svg'); ok('اسم بامتداد svg مرفوض', !!r.error, r)
r=await upm('admin','shell.png'); ok('اسم غير UUID مرفوض', !!r.error, r)
r=await upm('admin','../cccccccc-1111-2222-3333-444444444444.png'); ok('تسلل المسار مرفوض', !!r.error, r)
r=await as('t1',`delete from storage.objects where name=$1`,[`${U9}.png`]); ok('المعلم لا يحذف صورة', r.n===0, r)
r=await as('supContent',`delete from storage.objects where name=$1`,[`${U9}.png`]); ok('مشرف المحتوى يحذف صورة', r.n===1, r)
// --- الإعلانات ---
r=await as('supContent',`insert into announcements(title,body,audience) values ('إعلان عام','نص','all') returning id`); ok('مشرف add_announcements ينشر', !r.error, r)
r=await as('supContent',`insert into announcements(title,body) values ('x',repeat('أ',5001))`); ok('نص إعلان أطول من 5000 مرفوض', !!r.error, r)
r=await as('anon',`select count(*)::int c from announcements where title='إعلان عام'`); ok('الزائر يرى الإعلان العام', r.rows[0].c===1, r)
await as('supContent',`update announcements set visible=false where title='إعلان عام'`)
r=await as('anon',`select count(*)::int c from announcements where title='إعلان عام'`); ok('الإعلان المخفي يختفي عن الزائر', r.rows[0].c===0, r)
r=await as('supContent',`insert into announcements(title,body,published_at) values ('مجدول','x', now() + interval '1 day')`); r=await as('anon',`select 1 from announcements where title='مجدول'`); ok('إعلان مجدول لا يظهر قبل موعده', r.rows.length===0)
// --- سجل العمليات ---
await as('supContent',`insert into content_site(key_element,text_value) values ('audit.long',repeat('ب',900))`)
r=await as('admin',`select changes from audit_log where table_name='content_site' and changes->>'key_element'='audit.long'`); ok('السجل: تعديل المحتوى مسجّل والنص الطويل مُختصر', r.rows.length===1 && r.rows[0].changes.text_value.length<=201, r.rows[0]?.changes?.text_value?.length)
r=await as('admin',`select 1 from audit_log where table_name='announcements'`); ok('السجل: الإعلانات مسجّلة', r.rows.length>=1)
// --- رسائل التواصل ---
r=await as('anon',`select * from contact_messages`); ok('الزائر لا يقرأ رسائل التواصل', !!r.error || r.rows.length===0, r)
r=await as('supAll',`select count(*)::int c from contact_messages`); ok('المشرف manage_students يقرأ الرسائل', r.rows[0].c>=1, r)
r=await as('supContent',`select count(*)::int c from contact_messages`); ok('مشرف المحتوى فقط لا يقرؤها', r.rows[0].c===0, r)


// ===================== المرحلة 10: بوابة ولي الأمر =====================
const pl=async who=>(await as(who,'select * from parent_lessons')).rows
ok('ولي الأمر 1 يرى حصص ابنه فقط', (await pl('parent1')).length>=1 && (await pl('parent1')).every(x=>x.student_id===A1))
ok('ولي الأمر 2 لا يرى حصص A1', (await pl('parent2')).every(x=>x.student_id===A2))
ok('الحصص: اسم المعلم والمجموعة ظاهران', (await pl('parent1'))[0]?.group_name==='مجموعة 1')
ok('العرض لا يكشف أعمدة حساسة (أجر/هاتف)', !Object.keys((await pl('parent1'))[0]||{}).some(k=>/rate|phone|whatsapp/.test(k)))
ok('المعلم/المشرف/الزائر لا يرون parent_lessons', (await pl('t1')).length===0 && (await pl('supAll')).length===0 && (await pl('admin')).length===0 && !!(await as('anon','select 1 from parent_lessons')).error)
const EXP=(await db.query(`select coalesce(sum(price_at_time),0) consumed from attendance where student_id=$1 and status in ('present','late')`,[A1])).rows[0]
r=await as('parent1','select * from parent_balance'); ok('رصيد ولي الأمر 1: ابنه فقط والحسابات صحيحة', r.rows.length===1 && r.rows[0].student_id===A1 && Number(r.rows[0].total_paid)===500 && Number(r.rows[0].consumed)===Number(EXP.consumed) && Number(r.rows[0].balance)===500-Number(EXP.consumed), [r.rows,EXP])
r=await as('parent2','select * from parent_balance'); ok('رصيد ولي الأمر 2: ابنه فقط', r.rows.length===1 && r.rows[0].student_id===A2, r.rows)
r=await as('parent1','select * from parent_payments'); ok('مدفوعات ولي الأمر 1: دفعته فقط بلا ملاحظات داخلية', r.rows.length===1 && Number(r.rows[0].amount)===500 && !('note' in r.rows[0]) && !('recorded_by' in r.rows[0]), r.rows)
ok('غير ولي الأمر لا يقرأ عروض الرصيد', (await as('t1','select * from parent_balance')).rows.length===0 && (await as('supFin','select * from parent_payments')).rows.length===0 && (await as('anon','select 1 from parent_balance')).error!==undefined)
r=await as('parent1',`insert into payments(student_id,amount) values ($1,10)`,[A1]); ok('ولي الأمر لا يسجل دفعة', !!r.error, r)
r=await as('parent1',`update parent_payments set amount=1`); ok('العروض للقراءة فقط', !!r.error, r)
r=await as('parent1',`update attendance set status='present'`); ok('ولي الأمر لا يعدّل الحضور', !!r.error || r.n===0, r)
r=await as('parent1',`update reports set teacher_notes='x'`); ok('ولي الأمر لا يعدّل التقارير', !!r.error || r.n===0, r)
await db.query(`insert into lessons(teacher_id,group_id,lesson_date,status,title) values ($1,$2,'2999-01-01','scheduled','قادمة')`,[ids.t1,G1])
r=await as('parent1','select * from parent_upcoming'); ok('الحصص القادمة: لابنه عبر المجموعة', r.rows.length===1 && r.rows[0].student_id===A1 && r.rows[0].group_name==='مجموعة 1', r.rows)
ok('ولي الأمر 2 لا يرى حصص مجموعة لا ينتمي لها', (await as('parent2','select * from parent_upcoming')).rows.length===0)


// ===================== المرحلة 11: بوت واتساب =====================
const mkL=async d=>(await q1(`insert into lessons(teacher_id,group_id,lesson_date,status) values ($1,$2,$3,'done') returning id`,[ids.t1,G1,d])).id
const mkR=async(l,sid,age='5 minutes')=>(await q1(`insert into reports(lesson_id,student_id,report_type,teacher_notes,updated_at) values ($1,$2,'group','ملاحظة', now()-interval '${age}') returning id`,[l,sid])).id
const claim=async(who='service')=>as(who,`select * from bot_claim_reports(10,'termux-test')`)
const aged=async(id,iv='1 hour')=>db.exec(`alter table reports disable trigger trg_reports_updated; update reports set updated_at=now()-interval '${iv}' where id='${id}'; alter table reports enable trigger trg_reports_updated`)
const st=async id=>(await q1(`select wa_status,wa_attempts,wa_error from reports where id=$1`,[id]))
await db.query(`update reports set wa_status='sent' where wa_status in ('pending','sending')`)   // تنظيف ما سبق
const LB1=await mkL('2026-10-10'), LB2=await mkL('2026-10-11'), LB3=await mkL('2026-10-12')
const RB1=await mkR(LB1,A1), RBnew=await mkR(LB2,A1,'5 seconds')
const LBp=(await q1(`insert into lessons(teacher_id,student_id,lesson_date,status) values ($1,$2,'2026-10-12','done') returning id`,[ids.t1,P1])).id
const RBp=await mkR(LBp,P1)
r=await claim(); ok('البوت يسحب التقرير الجاهز فقط', r.rows.length===1 && r.rows[0].report_id===RB1 && r.rows[0].phone==='0100' && r.rows[0].student_name==='طالب أ1', r.rows.map(x=>x.report_id))
ok('الحالة sending والمحاولة 1', (await st(RB1)).wa_status==='sending' && (await st(RB1)).wa_attempts===1)
ok('التقرير الحديث (أقل من 60 ثانية) لم يُسحب', (await st(RBnew)).wa_status==='pending')
ok('تقرير الطالب الشخصي لم يُسحب أبداً', (await st(RBp)).wa_status==='pending')
ok('سحب ثانٍ لا يكرر', (await claim()).rows.length===0)
ok('نبض البوت مسجّل ويقرؤه المدير فقط', (await as('admin','select info from bot_heartbeat')).rows[0]?.info==='termux-test' && (await as('t1','select * from bot_heartbeat')).rows.length===0 && (await as('parent1','select * from bot_heartbeat')).rows.length===0)
ok('الصف المسحوب لا يحوي أجراً ولا رابط مجموعة', !Object.keys((await (async()=>{await db.query(`update reports set wa_status='pending' where id=$1`,[RB1]); await aged(RB1); return (await claim()).rows[0]||{}})())).some(k=>/rate|whatsapp|link/.test(k)))
r=await as('service',`select bot_complete_report($1,true)`,[RB1]); ok('تأكيد الإرسال → sent', r.rows[0]?.bot_complete_report==='sent' && (await st(RB1)).wa_status==='sent')
r=await as('service',`select bot_complete_report($1,true)`,[RB1]); ok('تأكيد مكرر يُتجاهل', r.rows[0]?.bot_complete_report==='ignored')
// فشل مؤقت ثم إعادة بعد مهلة
await aged(RBnew)
r=await claim(); ok('التقرير يُسحب بعد مرور المهلة', r.rows.length===1 && r.rows[0].report_id===RBnew)
r=await as('service',`select bot_complete_report($1,false,'انقطاع الشبكة')`,[RBnew]); ok('فشل مؤقت → يعود pending ويحتفظ بالسبب', r.rows[0]?.bot_complete_report==='pending' && (await st(RBnew)).wa_error==='انقطاع الشبكة')
ok('بعد الفشل المؤقت: لا إعادة فورية (تأخير تدريجي)', (await claim()).rows.length===0)
await aged(RBnew)
await claim(); r=await as('service',`select bot_complete_report($1,false,'رقم غير مسجل',true)`,[RBnew]); ok('فشل دائم → failed فوراً', r.rows[0]?.bot_complete_report==='failed' && (await st(RBnew)).wa_status==='failed')
// استنفاد المحاولات
const RB3=await mkR(LB3,A1)
for (let i=0;i<3;i++){ await aged(RB3,'1 day'); await claim(); r=await as('service',`select bot_complete_report($1,false,'x')`,[RB3]) }
ok('3 محاولات فاشلة → failed', (await st(RB3)).wa_status==='failed' && (await st(RB3)).wa_attempts===3, await st(RB3))
// عالق
const RB4=await mkR(await mkL('2026-10-13'),A1)
await claim(); await db.query(`update reports set wa_claimed_at=now()-interval '20 minutes' where id=$1`,[RB4])
await claim(); ok('محاولة عالقة (بوت انقطع) تُعاد للطابور', ['pending','sending'].includes((await st(RB4)).wa_status) && (await st(RB4)).wa_attempts>=1)
// الصلاحيات
for (const who of ['admin','supAll','t1','parent1','anon']) { r=await claim(who); ok(`${who} لا يستدعي دوال البوت`, !!r.error, r) }
r=await as('admin',`select bot_complete_report($1,true)`,[RB4]); ok('المدير لا يؤكد إرسالاً من الواجهة', !!r.error)
// retry
r=await as('t1',`select retry_report($1)`,[RBnew]); ok('المعلم لا يعيد المحاولة', !!r.error, r)
r=await as('supNone',`select retry_report($1)`,[RBnew]); ok('مشرف بلا follow_reports لا يعيد', !!r.error, r)
r=await as('supAll',`select retry_report($1)`,[RBnew]); ok('مشرف المتابعة يعيد تقريراً فاشلاً', !r.error && (await st(RBnew)).wa_status==='pending' && (await st(RBnew)).wa_attempts===0, r)
r=await as('supAll',`select retry_report($1)`,[RB1]); ok('المرسَل لا يُعاد (لا تكرار للأهل)', !!r.error, r)
await db.query(`update reports set wa_status='failed' where id=$1`,[RBp])
r=await as('admin',`select retry_report($1)`,[RBp]); ok('الشخصي لا يُعاد من الإدارة', !!r.error, r)
r=await as('t1',`update reports set wa_attempts=0 where id=$1`,[RB3]); ok('المعلم لا يعدّل عداد المحاولات', !!r.error || r.n===0, r)


// ===================== إعدادات البوت (011) =====================
const bs=async who=>(await as(who,'select * from bot_settings')).rows
ok('الإعدادات: المدير يقرأ، غيره لا', (await bs('admin')).length===1 && (await bs('supAll')).length===0 && (await bs('t1')).length===0 && (await bs('parent1')).length===0 && !!(await as('anon','select 1 from bot_settings')).error)
r=await as('admin',`update bot_settings set hold_seconds=0, max_per_cycle=2`); ok('المدير يعدّل', !r.error && r.n===1, r)
r=await as('supAll',`update bot_settings set enabled=false`); ok('المشرف لا يعدّل', r.n===0 || !!r.error, r)
r=await as('t1',`update bot_settings set enabled=false`); ok('المعلم لا يعدّل', r.n===0 || !!r.error, r)
r=await as('admin',`insert into bot_settings(id) values (2)`); ok('لا صف ثانٍ', !!r.error, r)
r=await as('admin',`delete from bot_settings`); ok('لا حذف', !!r.error || r.n===0, r)
for (const [sql,name] of [[`delay_min=30, delay_max=10`,'الحد الأدنى أكبر من الأعلى'],[`max_per_cycle=50`,'دفعة أكبر من 10'],[`max_attempts=9`,'محاولات أكثر من 5'],[`header_text=''`,'عنوان فارغ'],[`quiet_from=3`,'ساعة صمت بلا نهاية'],[`quiet_from=25, quiet_to=1`,'ساعة غير صالحة'],[`hold_seconds=99999`,'مهلة هائلة'],[`footer_text=repeat('ا',301)`,'تذييل طويل']]) { r=await as('admin',`update bot_settings set ${sql}`); ok('مرفوض: '+name, !!r.error, r) }
r=await as('admin',`update bot_settings set updated_by=null`); ok('لا يعدّل عمود التدقيق', !!r.error, r)
// إيقاف
const mkRB=async(d,sid=A1)=>{const l=await mkL(d); return mkR(l,sid,'1 hour')}
await db.query(`update reports set wa_status='sent' where wa_status in ('pending','sending')`)
const Q1=await mkRB('2026-11-01'), Q2=await mkRB('2026-11-02'), Q3=await mkRB('2026-11-03')
await as('admin',`update bot_settings set enabled=false`)
r=await claim(); ok('البوت موقوف: لا يُسحب شيء', r.rows.length===0 && (await st(Q1)).wa_status==='pending')
ok('النبض يُسجَّل حتى أثناء الإيقاف', (await db.query(`select extract(epoch from now()-seen_at) s from bot_heartbeat`)).rows[0].s<5)
ok('الإعدادات للبوت: paused_now=true', (await as('service','select bot_get_settings() s')).rows[0].s.paused_now===true)
await as('admin',`update bot_settings set enabled=true`)
r=await claim(); ok('بعد التشغيل: سقف الدفعة 2 من الإعدادات', r.rows.length===2, r.rows.length)
for (const x of r.rows) await as('service',`select bot_complete_report($1,true)`,[x.report_id])
// الغائب
const Qa=await mkRB('2026-11-04'); await db.query(`insert into attendance(lesson_id,student_id,status) select lesson_id,student_id,'absent' from reports where id=$1 on conflict do nothing`,[Qa]).catch(()=>{})
await db.query(`update reports set wa_status='sent' where wa_status='pending' and id<>$1`,[Qa])
await as('admin',`update bot_settings set send_to_absent=false`)
r=await claim(); ok('send_to_absent=false: تقرير الغائب لا يُسحب', r.rows.length===0 && (await st(Qa)).wa_status==='pending', r.rows.length)
await as('admin',`update bot_settings set send_to_absent=true`)
r=await claim(); ok('send_to_absent=true: يُسحب', r.rows.length===1)
await as('service',`select bot_complete_report($1,true)`,[Qa])
// ساعات الصمت
const hr=(await db.query(`select extract(hour from now() at time zone 'Africa/Cairo')::int h`)).rows[0].h
await as('admin',`update bot_settings set quiet_from=$1, quiet_to=$2`,[hr,(hr+1)%24])
const Qq=await mkRB('2026-11-05')
r=await claim(); ok('ساعات الصمت الحالية: لا سحب', r.rows.length===0 && (await as('service','select bot_get_settings() s')).rows[0].s.paused_now===true)
await as('admin',`update bot_settings set quiet_from=$1, quiet_to=$2`,[(hr+3)%24,(hr+5)%24])
r=await claim(); ok('خارج ساعات الصمت: يُسحب', r.rows.length===1)
await as('service',`select bot_complete_report($1,true)`,[Qq])
await as('admin',`update bot_settings set quiet_from=null, quiet_to=null`)
// حد المحاولات
await as('admin',`update bot_settings set max_attempts=1`)
const Qm=await mkRB('2026-11-06'); await claim(); r=await as('service',`select bot_complete_report($1,false,'x')`,[Qm]); ok('max_attempts=1: أول فشل نهائي', r.rows[0].bot_complete_report==='failed')
await as('admin',`update bot_settings set max_attempts=3`)
ok('إعدادات البوت: التعديل مسجّل في سجل العمليات', (await as('admin',`select 1 from audit_log where table_name='bot_settings'`)).rows.length>=1)
r=await as('t1',`select bot_get_settings()`); ok('المعلم لا يستدعي bot_get_settings', !!r.error, r)


// ===================== المرحلة 12: تصليب الأمان =====================
r=await as('admin','select * from security_audit()'); ok('الفحص الذاتي: لا مشاكل', !r.error && r.rows.length===0, r.rows.length?r.rows:r.error)
for (const who of ['supAll','t1','parent1','anon']) { r=await as(who,'select * from security_audit()'); ok(`${who} لا يشغّل الفحص الذاتي`, !!r.error, r) }
// فحص مستقل عن الدالة (استعلام مباشر على الكتالوج)
const nors=(await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`)).rows
ok('كل جداول public مفعّل عليها RLS', nors.length===0, nors)
const anonG=(await db.query(`select table_name||':'||privilege_type g from information_schema.role_table_grants where table_schema='public' and grantee='anon' order by 1`)).rows.map(x=>x.g)
ok('صلاحيات الزائر على مستوى الجدول: قراءة الإعلانات والمحتوى العام فقط', anonG.join()==='announcements:SELECT,public_content:SELECT', anonG)
const anonC=(await db.query(`select distinct table_name||'.'||column_name||':'||privilege_type g from information_schema.column_privileges where table_schema='public' and grantee='anon' and table_name not in ('announcements','public_content') order by 1`)).rows.map(x=>x.g)
ok('صلاحيات أعمدة الزائر: إدراج 4 أعمدة في رسائل التواصل فقط', anonC.join()==='contact_messages.message:INSERT,contact_messages.name:INSERT,contact_messages.phone:INSERT,contact_messages.role:INSERT', anonC)
const dang=(await db.query(`select table_name||':'||privilege_type g from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')`)).rows
ok('لا TRUNCATE/REFERENCES/TRIGGER لأي دور تطبيقي', dang.length===0, dang.slice(0,5))
const wide=(await db.query(`select table_name g from information_schema.role_table_grants where table_schema='public' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE') and table_name in ('profiles','audit_log','reports','students','payments','lessons','attendance')`)).rows
ok('لا INSERT/UPDATE على مستوى الجدول للجداول الحساسة (أعمدة محددة فقط)', wide.length===0, wide)
const sd=(await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig::text ilike '%search_path%',false)`)).rows
ok('كل دوال SECURITY DEFINER بمسار بحث ثابت', sd.length===0, sd)
// دوال كاتبة لا يستدعيها الزائر
const fnAnon=async sql=>(await as('anon',sql)).error
ok('الزائر لا يستدعي دوال الكتابة/الإدارة', [`select retry_report(gen_random_uuid())`,`select save_package_summary(gen_random_uuid(),'x')`,`select set_student_price(gen_random_uuid(),1,false)`,`select refresh_packages()`,`select bot_get_settings()`,`select bot_claim_reports(1,'x')`,`select bot_complete_report(gen_random_uuid(),true)`,`select security_audit()`].every(async()=>true) && (await Promise.all([`select retry_report(gen_random_uuid())`,`select save_package_summary(gen_random_uuid(),'x')`,`select set_student_price(gen_random_uuid(),1,false)`,`select refresh_packages()`,`select bot_get_settings()`,`select bot_claim_reports(1,'x')`,`select bot_complete_report(gen_random_uuid(),true)`,`select security_audit()`].map(fnAnon))).every(Boolean))
// ---- محاولات اختراق وهمية ----
r=await as('t1',`update profiles set role='admin' where id=$1`,[ids.t1]); ok('اختراق: المعلم يرقّي نفسه لمدير', !!r.error || r.n===0, r)
r=await as('t1',`update profiles set status='active', role='teacher' where id=$1`,[ids.t1]); ok('اختراق: المعلم يعدّل ملفه الشخصي مباشرة', !!r.error || r.n===0, r)
r=await as('supNone',`insert into permissions(user_id,permission_key,allowed) values ($1,'manage_users',true)`,[ids.supNone]); ok('اختراق: المشرف يمنح نفسه صلاحية', !!r.error, r)
r=await as('supAll',`update permissions set allowed=true`); ok('اختراق: المشرف يعدّل الصلاحيات', !!r.error || r.n===0, r)
r=await as('parent1',`update students set parent_user_id=$1 where id=$2`,[ids.parent1,A2]); ok('اختراق: ولي أمر يربط نفسه بطالب غيره', !!r.error || r.n===0, r)
r=await as('parent1',`insert into student_contacts(student_id,parent_phone) values ($1,'1')`,[A2]); ok('اختراق: ولي أمر يكتب أرقاماً', !!r.error, r)
r=await as('t2',`select * from student_contacts`); ok('اختراق: المعلم يقرأ أرقام الأهل', r.rows.length===0, r)
r=await as('t2',`select whatsapp_link from group_whatsapp`); ok('اختراق: المعلم يقرأ روابط المجموعات', r.rows.length===0 || !!r.error, r)
r=await as('t2',`select * from audit_log`); ok('اختراق: المعلم يقرأ سجل العمليات', r.rows.length===0, r)
r=await as('admin',`update audit_log set action='x'`); ok('السجل لا يُعدَّل حتى من المدير', !!r.error, r)
r=await as('admin',`delete from audit_log`); ok('السجل لا يُحذف حتى من المدير', !!r.error, r)
r=await as('service',`delete from audit_log`); ok('السجل لا يُحذف حتى من service_role', !!r.error, r)
r=await as('anon',`select * from storage.objects`); ok('اختراق: الزائر يعدّد ملفات التخزين', r.rows.length===0, r.rows.length)
r=await as('parent2',`select name from storage.objects where bucket_id='report-files'`); ok('اختراق: ولي أمر غريب يعدّد مرفقات التقارير', r.rows.length===0, r.rows.length)
const inj=`x'); drop table students; --`
r=await as('admin',`insert into subjects(name) values ($1)`,[inj]); const tabs=(await db.query(`select count(*)::int c from students`)).rows[0].c
ok('حقن SQL: النص يُخزَّن حرفياً والجداول سليمة', !r.error && tabs>0)
r=await as('supContent',`insert into content_site(key_element,text_value) values ('xss.t', $1)`,[`<img src=x onerror=alert(1)>`]); ok('نص بـ HTML يُخزَّن كنص (العرض يهرّبه)', !r.error)
r=await as('supContent',`insert into content_site(key_element,image_url) values ('xss.i','data:text/html;base64,PHNjcmlwdD4=')`); ok('رابط صورة data: مرفوض', !!r.error)
// ---- حد معدّل التواصل ----
await db.query(`delete from contact_messages`)
const cm=(ph)=>as('anon',`insert into contact_messages(name,phone,message) values ('زائر تجريبي',$1,'رسالة اختبار') `,[ph])
r=await cm('0100000001'); ok('تواصل: أول رسالة تُقبل', !r.error, r)
r=await cm('0100000001'); ok('تواصل: الثانية من نفس الرقم تُقبل', !r.error, r)
r=await cm('0100000001'); ok('تواصل: الثالثة من نفس الرقم خلال 10 دقائق مرفوضة', !!r.error && /rate_limited/.test(r.error), r)
let okc=0; for (let i=0;i<12;i++) { const x=await cm('01111111'+String(i).padStart(2,'0')); if(!x.error) okc++ }
ok('تواصل: سقف 10 رسائل في الدقيقة لكل الموقع', okc===8, okc)   // 2 سبقت + 8 = 10
await db.query(`update contact_messages set created_at=now()-interval '2 hours'`)
r=await cm('0100000001'); ok('تواصل: بعد مرور المهلة تُقبل ثانية', !r.error, r)

// ===== إيقاف الحساب =====
await db.query(`update profiles set status='disabled' where id=$1`,[ids.t1])
ok('بعد إيقاف المعلم يفقد كل وصول فوراً', await cnt('t1','students')===0 && await cnt('t1','lessons')===0)
console.log('\n'+(failed?`FAILED: ${failed}`:'ALL PASSED')); process.exit(failed?1:0)
