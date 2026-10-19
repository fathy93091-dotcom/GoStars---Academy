-- =====================================================================
-- GoStars — المرحلة 4 (2/2): سياسات الأمان (RLS) والصلاحيات والعروض
-- يُنفَّذ بعد 002_core_schema.sql. قابل لإعادة التشغيل. لا يحتوي DROP TABLE.
--
-- المبادئ:
--  1) الرفض افتراضيًا: RLS مفعّل على كل الجداول، وتُسحب كل الصلاحيات ثم تُمنح صراحةً.
--  2) النطاق: بيانات الأكاديمية (academy) يراها المدير/المشرف حسب الصلاحية،
--     والبيانات الشخصية (personal) لا يراها إلا المعلم المالك — لا المدير ولا المشرف.
--  3) المعلم لا يرى أرقام أولياء الأمور ولا روابط مجموعات الواتساب (للأكاديمية).
--  4) حالة إرسال الواتساب (wa_*) و group_report_status تكتبها service_role فقط (البوت).
--  5) الحساب الموقوف لا يرى شيئًا (current_role_name() ترجع NULL).
--  6) الصلاحيات على مستوى الأعمدة تقيّد الكتابة فقط (القراءة select=* تعمل).
-- =====================================================================

-- ---------------------------------------------------------------------
-- دوال مساعدة (SECURITY DEFINER لتجنّب التكرار اللانهائي في RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'admin', false) $$;

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'teacher', false) $$;

create or replace function public.is_parent() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'parent', false) $$;

-- مدير، أو مشرف يملك هذه الصلاحية
create or replace function public.staff_can(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('admin','supervisor'), false)
         and public.has_permission(k) $$;

-- مدير، أو مشرف يملك أيًّا من هذه الصلاحيات
create or replace function public.staff_can_any(keys text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
      and (p.role = 'admin'
           or (p.role = 'supervisor' and exists (
                select 1 from public.permissions x
                where x.user_id = p.id and x.allowed and x.permission_key = any(keys))))
  ) $$;

-- من يحق له قراءة بيانات الأكاديمية الدراسية عمومًا
create or replace function public.staff_reads_academy() returns boolean
language sql stable security definer set search_path = public as $$
  select public.staff_can_any(array['manage_students','manage_groups','follow_teachers','follow_reports','manage_finance']) $$;

create or replace function public.student_scope(sid uuid) returns text
language sql stable security definer set search_path = public as $$
  select scope from public.students where id = sid $$;

create or replace function public.lesson_scope(lid uuid) returns text
language sql stable security definer set search_path = public as $$
  select scope from public.lessons where id = lid $$;

-- المعلم مالك هذا الطالب الشخصي
create or replace function public.owns_personal_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and exists (
    select 1 from public.students s
    where s.id = sid and s.scope = 'personal' and s.owner_teacher_id = auth.uid()) $$;

-- المعلم يدرّس هذا الطالب (تسجيل نشط) أو هو مالكه الشخصي
create or replace function public.teacher_has_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and (
    public.owns_personal_student(sid)
    or exists (select 1 from public.enrollments e
               where e.student_id = sid and e.teacher_id = auth.uid() and e.status = 'active')) $$;

-- ولي الأمر صاحب هذا الطالب
create or replace function public.parent_has_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_parent() and exists (
    select 1 from public.students s where s.id = sid and s.parent_user_id = auth.uid()) $$;

create or replace function public.parent_in_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_parent() and exists (
    select 1 from public.enrollments e join public.students s on s.id = e.student_id
    where e.group_id = gid and e.status = 'active' and s.parent_user_id = auth.uid()) $$;

create or replace function public.teacher_owns_lesson(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and exists (
    select 1 from public.lessons l where l.id = lid and l.teacher_id = auth.uid()) $$;

-- ولي الأمر يرى الحصة إذا كانت فردية لابنه أو سُجّل ابنه فيها
create or replace function public.parent_sees_lesson(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_parent() and (
    exists (select 1 from public.lessons l join public.students s on s.id = l.student_id
            where l.id = lid and s.parent_user_id = auth.uid())
    or exists (select 1 from public.attendance a join public.students s on s.id = a.student_id
               where a.lesson_id = lid and s.parent_user_id = auth.uid())) $$;

-- هل يستطيع المعلم الحالي التدريس لهذا الهدف (مجموعة أو طالب)؟
create or replace function public.can_teach_target(gid uuid, sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and (
    (gid is not null and exists (select 1 from public.groups g where g.id = gid and g.teacher_id = auth.uid()))
    or (gid is null and sid is not null and public.teacher_has_student(sid))) $$;

-- هل الطالب ضمن هذه الحصة؟ (الجماعية: مسجّل نشط في المجموعة، الفردية: هو نفسه)
create or replace function public.lesson_has_student(lid uuid, sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lessons l
    where l.id = lid and (
      l.student_id = sid
      or (l.group_id is not null and exists (
            select 1 from public.enrollments e
            where e.group_id = l.group_id and e.student_id = sid and e.status = 'active')))) $$;

-- المعلم يدير رابط واتساب مجموعته الشخصية فقط؛ الأكاديمية تُدار بصلاحية manage_groups
create or replace function public.manages_group_link(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g where g.id = gid and (
      (g.scope = 'academy' and public.staff_can('manage_groups'))
      or (g.scope = 'personal' and public.is_teacher() and g.owner_teacher_id = auth.uid()))) $$;

-- المالية: مدير/مشرف manage_finance لطلاب الأكاديمية، أو المعلم المالك لطلابه الشخصيين
create or replace function public.can_see_finance(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.staff_can('manage_finance') and public.student_scope(sid) = 'academy')
         or public.owns_personal_student(sid) $$;

-- ---------------------------------------------------------------------
-- تفعيل RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['subjects','teachers','supervisors','students','student_contacts','groups',
    'group_whatsapp','enrollments','lessons','attendance','homework','reports','exams','payments',
    'monthly_evaluations','certificates','announcements','content_site','contact_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant usage on sequence public.student_code_seq, public.payment_ref_seq to authenticated;

-- ---------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------
drop policy if exists subjects_select on public.subjects;
create policy subjects_select on public.subjects for select to authenticated
  using (public.current_role_name() is not null);
drop policy if exists subjects_write on public.subjects;
create policy subjects_write on public.subjects for all to authenticated
  using (public.staff_can('manage_groups')) with check (public.staff_can('manage_groups'));
grant select, insert, update, delete on public.subjects to authenticated;

-- ---------------------------------------------------------------------
-- teachers / supervisors  (الإنشاء عبر الخادم service_role؛ التعديل للمدير)
-- ---------------------------------------------------------------------
drop policy if exists teachers_select on public.teachers;
create policy teachers_select on public.teachers for select to authenticated
  using ((id = auth.uid() and public.is_teacher())
         or public.staff_can_any(array['manage_users','follow_teachers','manage_groups','manage_finance']));
drop policy if exists teachers_admin_write on public.teachers;
create policy teachers_admin_write on public.teachers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.teachers to authenticated;

drop policy if exists supervisors_select on public.supervisors;
create policy supervisors_select on public.supervisors for select to authenticated
  using ((id = auth.uid() and public.current_role_name() = 'supervisor') or public.is_admin());
drop policy if exists supervisors_admin_write on public.supervisors;
create policy supervisors_admin_write on public.supervisors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.supervisors to authenticated;

-- ---------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------
drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated
  using ((public.staff_reads_academy() and scope = 'academy')
         or public.teacher_has_student(id)
         or public.parent_has_student(id));

drop policy if exists students_insert on public.students;
create policy students_insert on public.students for insert to authenticated
  with check ((public.staff_can('manage_students') and scope = 'academy')
              or (public.is_teacher() and scope = 'personal' and owner_teacher_id = auth.uid()));

drop policy if exists students_update on public.students;
create policy students_update on public.students for update to authenticated
  using ((public.staff_can('manage_students') and scope = 'academy') or public.owns_personal_student(id))
  with check ((public.staff_can('manage_students') and scope = 'academy') or public.owns_personal_student(id));

grant select on public.students to authenticated;
grant insert (full_name, grade, curriculum, study_type, lesson_price, schedule, parent_user_id, scope, owner_teacher_id, active)
  on public.students to authenticated;
grant update (full_name, grade, curriculum, study_type, lesson_price, schedule, parent_user_id, active)
  on public.students to authenticated;
-- لا حذف: الطالب يُعطَّل (active=false) حفاظًا على السجلات المالية

-- ---------------------------------------------------------------------
-- student_contacts  (محجوبة عن معلمي الأكاديمية وعن أولياء الأمور)
-- ---------------------------------------------------------------------
drop policy if exists contacts_all on public.student_contacts;
create policy contacts_all on public.student_contacts for all to authenticated
  using ((public.staff_can('manage_students') and public.student_scope(student_id) = 'academy')
         or public.owns_personal_student(student_id))
  with check ((public.staff_can('manage_students') and public.student_scope(student_id) = 'academy')
              or public.owns_personal_student(student_id));
grant select, insert, update, delete on public.student_contacts to authenticated;

-- ---------------------------------------------------------------------
-- groups / group_whatsapp
-- ---------------------------------------------------------------------
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using ((public.staff_reads_academy() and scope = 'academy')
         or (public.is_teacher() and teacher_id = auth.uid())
         or public.parent_in_group(id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert to authenticated
  with check ((public.staff_can('manage_groups') and scope = 'academy')
              or (public.is_teacher() and scope = 'personal' and teacher_id = auth.uid() and owner_teacher_id = auth.uid()));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using ((public.staff_can('manage_groups') and scope = 'academy')
         or (public.is_teacher() and scope = 'personal' and owner_teacher_id = auth.uid()))
  with check ((public.staff_can('manage_groups') and scope = 'academy')
              or (public.is_teacher() and scope = 'personal' and owner_teacher_id = auth.uid()));

grant select on public.groups to authenticated;
grant insert (name, teacher_id, subject_id, curriculum, schedule, scope, owner_teacher_id, active) on public.groups to authenticated;
grant update (name, teacher_id, subject_id, curriculum, schedule, active) on public.groups to authenticated;

drop policy if exists group_whatsapp_all on public.group_whatsapp;
create policy group_whatsapp_all on public.group_whatsapp for all to authenticated
  using (public.manages_group_link(group_id)) with check (public.manages_group_link(group_id));
grant select, insert, update, delete on public.group_whatsapp to authenticated;

-- ---------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments for select to authenticated
  using ((public.staff_reads_academy() and public.student_scope(student_id) = 'academy')
         or (public.is_teacher() and teacher_id = auth.uid())
         or public.parent_has_student(student_id));

drop policy if exists enrollments_write on public.enrollments;
create policy enrollments_write on public.enrollments for all to authenticated
  using ((public.staff_can('manage_groups') and public.student_scope(student_id) = 'academy')
         or (public.is_teacher() and teacher_id = auth.uid() and public.owns_personal_student(student_id)))
  with check ((public.staff_can('manage_groups') and public.student_scope(student_id) = 'academy')
              or (public.is_teacher() and teacher_id = auth.uid() and public.owns_personal_student(student_id)));
grant select, delete on public.enrollments to authenticated;
grant insert (student_id, group_id, teacher_id, subject_id, status) on public.enrollments to authenticated;
grant update (group_id, teacher_id, subject_id, status) on public.enrollments to authenticated;

-- ---------------------------------------------------------------------
-- lessons  (scope يُشتق بالمشغّل قبل فحص WITH CHECK)
-- ---------------------------------------------------------------------
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select to authenticated
  using ((public.staff_reads_academy() and scope = 'academy')
         or (public.is_teacher() and teacher_id = auth.uid())
         or public.parent_sees_lesson(id));

drop policy if exists lessons_teacher_insert on public.lessons;
create policy lessons_teacher_insert on public.lessons for insert to authenticated
  with check (public.is_teacher() and teacher_id = auth.uid() and public.can_teach_target(group_id, student_id));

drop policy if exists lessons_teacher_update on public.lessons;
create policy lessons_teacher_update on public.lessons for update to authenticated
  using (public.is_teacher() and teacher_id = auth.uid())
  with check (public.is_teacher() and teacher_id = auth.uid() and public.can_teach_target(group_id, student_id));

drop policy if exists lessons_admin_all on public.lessons;
create policy lessons_admin_all on public.lessons for all to authenticated
  using (public.is_admin() and scope = 'academy') with check (public.is_admin() and scope = 'academy');

grant select on public.lessons to authenticated;
grant insert (teacher_id, group_id, student_id, subject_id, lesson_no, lesson_date, title, status, general_note)
  on public.lessons to authenticated;
grant update (subject_id, lesson_no, lesson_date, title, status, general_note) on public.lessons to authenticated;

-- ---------------------------------------------------------------------
-- attendance / homework / reports  (نفس النمط: معلم الحصة، أو المدير للأكاديمية)
-- ---------------------------------------------------------------------
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
  using ((public.staff_reads_academy() and public.student_scope(student_id) = 'academy')
         or public.teacher_owns_lesson(lesson_id)
         or public.parent_has_student(student_id));
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated
  with check (public.lesson_has_student(lesson_id, student_id)
              and (public.teacher_owns_lesson(lesson_id)
                   or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy')));
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using (public.teacher_owns_lesson(lesson_id) or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy'))
  with check (public.teacher_owns_lesson(lesson_id) or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy'));
drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance for delete to authenticated
  using (public.teacher_owns_lesson(lesson_id) or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy'));
grant select, delete on public.attendance to authenticated;
grant insert (lesson_id, student_id, status, note) on public.attendance to authenticated;   -- price_at_time يملؤه المشغّل
grant update (status, note) on public.attendance to authenticated;

drop policy if exists homework_select on public.homework;
create policy homework_select on public.homework for select to authenticated
  using ((public.staff_reads_academy() and public.student_scope(student_id) = 'academy')
         or public.teacher_owns_lesson(lesson_id)
         or public.parent_has_student(student_id));
drop policy if exists homework_insert on public.homework;
create policy homework_insert on public.homework for insert to authenticated
  with check (public.lesson_has_student(lesson_id, student_id)
              and (public.teacher_owns_lesson(lesson_id)
                   or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy')));
drop policy if exists homework_update on public.homework;
create policy homework_update on public.homework for update to authenticated
  using (public.teacher_owns_lesson(lesson_id) or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy'))
  with check (public.teacher_owns_lesson(lesson_id) or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy'));
drop policy if exists homework_delete on public.homework;
create policy homework_delete on public.homework for delete to authenticated
  using (public.teacher_owns_lesson(lesson_id) or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy'));
grant select, delete on public.homework to authenticated;
grant insert (lesson_id, student_id, status, score, note) on public.homework to authenticated;
grant update (status, score, note) on public.homework to authenticated;

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using ((public.staff_reads_academy() and public.student_scope(student_id) = 'academy')
         or public.teacher_owns_lesson(lesson_id)
         or public.parent_has_student(student_id));
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (public.lesson_has_student(lesson_id, student_id)
              and (public.teacher_owns_lesson(lesson_id)
                   or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy')));
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update to authenticated
  using (public.teacher_owns_lesson(lesson_id) or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy'))
  with check (public.teacher_owns_lesson(lesson_id) or (public.is_admin() and public.lesson_scope(lesson_id) = 'academy'));
grant select on public.reports to authenticated;
-- wa_status / wa_sent_at / wa_error: لا يكتبها إلا البوت عبر service_role
grant insert (lesson_id, student_id, report_type, teacher_notes, ai_guidance, attachments) on public.reports to authenticated;
grant update (teacher_notes, ai_guidance, attachments, report_type) on public.reports to authenticated;

-- ---------------------------------------------------------------------
-- exams / monthly_evaluations / certificates
-- ---------------------------------------------------------------------
drop policy if exists exams_select on public.exams;
create policy exams_select on public.exams for select to authenticated
  using ((public.staff_reads_academy() and public.student_scope(student_id) = 'academy')
         or public.teacher_has_student(student_id) or public.parent_has_student(student_id));
drop policy if exists exams_write on public.exams;
create policy exams_write on public.exams for all to authenticated
  using (public.teacher_has_student(student_id) or (public.is_admin() and public.student_scope(student_id) = 'academy'))
  with check (public.teacher_has_student(student_id) or (public.is_admin() and public.student_scope(student_id) = 'academy'));
grant select, delete on public.exams to authenticated;
grant insert (student_id, group_id, exam_name, max_score, score, exam_date) on public.exams to authenticated;
grant update (exam_name, max_score, score, exam_date) on public.exams to authenticated;

drop policy if exists evals_select on public.monthly_evaluations;
create policy evals_select on public.monthly_evaluations for select to authenticated
  using ((public.staff_reads_academy() and public.student_scope(student_id) = 'academy')
         or public.teacher_has_student(student_id)
         or (published and public.parent_has_student(student_id)));
drop policy if exists evals_write on public.monthly_evaluations;
create policy evals_write on public.monthly_evaluations for all to authenticated
  using (public.teacher_has_student(student_id) or (public.is_admin() and public.student_scope(student_id) = 'academy'))
  with check (public.teacher_has_student(student_id) or (public.is_admin() and public.student_scope(student_id) = 'academy'));
grant select on public.monthly_evaluations to authenticated;
grant insert (student_id, month, commitment_level, strengths, improvements, overall, teacher_recommendations, next_month_plan, published)
  on public.monthly_evaluations to authenticated;
grant update (commitment_level, strengths, improvements, overall, teacher_recommendations, next_month_plan, published)
  on public.monthly_evaluations to authenticated;

drop policy if exists certificates_select on public.certificates;
create policy certificates_select on public.certificates for select to authenticated
  using ((public.staff_reads_academy() and public.student_scope(student_id) = 'academy')
         or public.teacher_has_student(student_id)
         or (published and public.parent_has_student(student_id)));
drop policy if exists certificates_write on public.certificates;
create policy certificates_write on public.certificates for all to authenticated
  using (public.teacher_has_student(student_id) or (public.staff_can('manage_students') and public.student_scope(student_id) = 'academy'))
  with check (public.teacher_has_student(student_id) or (public.staff_can('manage_students') and public.student_scope(student_id) = 'academy'));
grant select, delete on public.certificates to authenticated;
grant insert (student_id, title, issued_at, file_path, published) on public.certificates to authenticated;
grant update (title, issued_at, file_path, published) on public.certificates to authenticated;

-- ---------------------------------------------------------------------
-- payments  (لا حذف أبدًا؛ التعديل للمدير فقط)
-- ---------------------------------------------------------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.can_see_finance(student_id));
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (public.can_see_finance(student_id));
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
  using (public.is_admin() and public.student_scope(student_id) = 'academy')
  with check (public.is_admin() and public.student_scope(student_id) = 'academy');
grant select on public.payments to authenticated;
grant insert (student_id, amount, paid_at, method, note) on public.payments to authenticated;
grant update (amount, paid_at, method, note) on public.payments to authenticated;

-- ---------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------
drop policy if exists announcements_anon on public.announcements;
create policy announcements_anon on public.announcements for select to anon
  using (visible and audience = 'all' and published_at <= now());
drop policy if exists announcements_auth on public.announcements;
create policy announcements_auth on public.announcements for select to authenticated
  using (public.staff_can('add_announcements')
         or (public.current_role_name() is not null and visible and published_at <= now()
             and (audience = 'all'
                  or (audience = 'students' and (public.is_parent() or public.current_role_name() = 'admin'))
                  or (audience = 'teachers' and public.is_teacher()))));
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
  using (public.staff_can('add_announcements')) with check (public.staff_can('add_announcements'));
grant select on public.announcements to anon;
grant select, delete on public.announcements to authenticated;
grant insert (title, body, audience, published_at, visible) on public.announcements to authenticated;
grant update (title, body, audience, published_at, visible) on public.announcements to authenticated;

-- ---------------------------------------------------------------------
-- content_site (CMS): الزائر يقرأ الظاهر فقط، والتعديل بصلاحية manage_content
-- ---------------------------------------------------------------------
drop policy if exists content_anon on public.content_site;
create policy content_anon on public.content_site for select to anon using (visible);
drop policy if exists content_auth on public.content_site;
create policy content_auth on public.content_site for select to authenticated
  using (visible or public.staff_can('manage_content'));
drop policy if exists content_write on public.content_site;
create policy content_write on public.content_site for all to authenticated
  using (public.staff_can('manage_content')) with check (public.staff_can('manage_content'));
grant select on public.content_site to anon;
grant select, delete on public.content_site to authenticated;
grant insert (key_element, text_value, image_url, size, model, visible) on public.content_site to authenticated;
grant update (text_value, image_url, size, model, visible) on public.content_site to authenticated;

-- ---------------------------------------------------------------------
-- contact_messages: الزائر يُدخل فقط (القيود الطولية في الجدول)، والقراءة للمدير/المشرف
-- ---------------------------------------------------------------------
drop policy if exists contact_insert on public.contact_messages;
create policy contact_insert on public.contact_messages for insert to anon, authenticated with check (true);
drop policy if exists contact_select on public.contact_messages;
create policy contact_select on public.contact_messages for select to authenticated
  using (public.staff_can('manage_students'));
drop policy if exists contact_update on public.contact_messages;
create policy contact_update on public.contact_messages for update to authenticated
  using (public.staff_can('manage_students')) with check (public.staff_can('manage_students'));
grant insert (name, phone, role, message) on public.contact_messages to anon, authenticated;
grant select on public.contact_messages to authenticated;
grant update (handled) on public.contact_messages to authenticated;

-- ---------------------------------------------------------------------
-- عروض مالية (محروسة بدوال الصلاحية داخل WHERE؛ تعمل بصلاحيات مالكها عمدًا
-- ليجمع المشرف الماليّ كل الحصص حتى لو لم تُظهرها له RLS)
-- ---------------------------------------------------------------------
drop view if exists public.student_balances;
create view public.student_balances as
select
  s.id                                   as student_id,
  s.student_code,
  s.full_name,
  s.scope,
  s.owner_teacher_id,
  s.lesson_price,
  coalesce(a.attended_lessons, 0)        as attended_lessons,
  coalesce(a.consumed, 0)                as consumed,
  coalesce(p.total_paid, 0)              as total_paid,
  coalesce(p.total_paid, 0) - coalesce(a.consumed, 0)               as balance,
  greatest(coalesce(p.total_paid, 0) - coalesce(a.consumed, 0), 0)  as credit,
  greatest(coalesce(a.consumed, 0) - coalesce(p.total_paid, 0), 0)  as debt
from public.students s
left join (
  select student_id,
         count(*)           as attended_lessons,
         sum(price_at_time) as consumed
  from public.attendance
  where status in ('present','late')            -- الغائب لا يُحتسب (قرار يُؤكَّد مع المدير)
  group by student_id
) a on a.student_id = s.id
left join (
  select student_id, sum(amount) as total_paid from public.payments group by student_id
) p on p.student_id = s.id
where public.can_see_finance(s.id);

drop view if exists public.teacher_earnings;
create view public.teacher_earnings as
select
  l.teacher_id,
  t.full_name                           as teacher_name,
  date_trunc('month', l.lesson_date)::date as month,
  count(*)                              as lessons_done,
  t.lesson_rate,
  count(*) * t.lesson_rate              as amount
from public.lessons l
join public.teachers t on t.id = l.teacher_id
where l.status = 'done' and l.scope = 'academy'
  and ((public.is_teacher() and l.teacher_id = auth.uid()) or public.staff_can('manage_finance'))
group by l.teacher_id, t.full_name, date_trunc('month', l.lesson_date), t.lesson_rate;

revoke all on public.student_balances, public.teacher_earnings from anon, authenticated;
grant select on public.student_balances, public.teacher_earnings to authenticated;
