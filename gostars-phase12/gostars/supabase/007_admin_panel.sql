-- =====================================================================
-- GoStars — المرحلة 8: لوحة المدير والمشرف
-- يُنفَّذ بعد 006. قابل لإعادة التشغيل. لا DROP TABLE.
-- ⚠ خذ نسخة احتياطية قبل التنفيذ على قاعدة تحتوي بيانات.
-- ⚠ نفّذ هذا الملف دائمًا بعد 001 و003 (إن أعدت تنفيذهما أعد تنفيذ هذا الملف).
-- يضيف:
--   1) المصادقة الثنائية (TOTP): من يملك عامل تحقق مفعّلًا لا تعمل صلاحياته إلا بجلسة AAL2
--   2) سجل العمليات الحساس (Audit Log): إضافة/تعديل/حذف، للقراءة من المدير فقط، لا يُعدَّل ولا يُحذف
--   3) عرض متابعة التقارير وعرض متابعة المعلمين
-- =====================================================================

-- ---------- 1) المصادقة الثنائية مفروضة من قاعدة البيانات ----------
-- true إن لم يكن للمستخدم عامل تحقق مفعّل، أو كانت جلسته AAL2 (أدخل رمز التطبيق).
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') $$;

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active' and public.mfa_ok()
$$;

create or replace function public.has_permission(k text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and public.mfa_ok()
      and (p.role = 'admin'
           or exists (select 1 from public.permissions x where x.user_id = p.id and x.permission_key = k and x.allowed))
  ) $$;

create or replace function public.staff_can_any(keys text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and public.mfa_ok()
      and (p.role = 'admin'
           or (p.role = 'supervisor' and exists (
                select 1 from public.permissions x
                where x.user_id = p.id and x.allowed and x.permission_key = any(keys))))
  ) $$;

-- ---------- 2) سجل العمليات ----------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_name  text,
  action      text not null,                 -- insert | update | delete | أو إجراء مخصّص من الخادم
  table_name  text not null,
  row_id      text,
  changes     jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on public.audit_log(at desc);
create index if not exists audit_log_table_idx on public.audit_log(table_name, at desc);

alter table public.audit_log enable row level security;
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated using (public.is_admin());
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
revoke update, delete, truncate on public.audit_log from service_role;

-- لا تعديل ولا حذف لأي أحد (حتى service_role)
create or replace function public.audit_immutable() returns trigger
language plpgsql as $$ begin raise exception 'سجل العمليات لا يُعدَّل ولا يُحذف'; end $$;
drop trigger if exists trg_audit_immutable on public.audit_log;
create trigger trg_audit_immutable before update or delete on public.audit_log
  for each row execute function public.audit_immutable();

-- المشغّل العام: لا يسجّل بيانات الشخصي، ويخفي قيم الهواتف والروابط (يسجّل أنها تغيّرت فقط)
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  secret constant text[] := array['student_phone','parent_phone','parent_name','whatsapp_link'];
  o jsonb; n jsonb; ref jsonb; ch jsonb := '{}'::jsonb; k text; personal boolean := false; nm text;
begin
  if tg_op = 'DELETE' then o := to_jsonb(old); ref := o;
  elsif tg_op = 'INSERT' then n := to_jsonb(new); ref := n;
  else o := to_jsonb(old); n := to_jsonb(new); ref := n; end if;

  if tg_table_name in ('students', 'groups') then
    personal := ref ->> 'scope' = 'personal';
  elsif tg_table_name in ('enrollments', 'payments', 'student_contacts', 'student_packages') then
    personal := coalesce((select scope from public.students where id = (ref ->> 'student_id')::uuid), 'academy') = 'personal';
  elsif tg_table_name = 'group_whatsapp' then
    personal := coalesce((select scope from public.groups where id = (ref ->> 'group_id')::uuid), 'academy') = 'personal';
  end if;
  if personal then return null; end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k <> 'updated_at' and (n -> k) is distinct from (o -> k) then
        ch := ch || jsonb_build_object(k, jsonb_build_object(
          'old', case when k = any(secret) then to_jsonb('***'::text) else o -> k end,
          'new', case when k = any(secret) then to_jsonb('***'::text) else n -> k end));
      end if;
    end loop;
    if ch = '{}'::jsonb then return null; end if;
  else
    for k in select jsonb_object_keys(coalesce(n, o)) loop
      ch := ch || jsonb_build_object(k, case when k = any(secret) then to_jsonb('***'::text) else coalesce(n, o) -> k end);
    end loop;
  end if;

  select full_name into nm from public.profiles where id = auth.uid();
  insert into public.audit_log(actor, actor_name, action, table_name, row_id, changes)
  values (auth.uid(), coalesce(nm, 'النظام'), lower(tg_op), tg_table_name,
          coalesce(ref ->> 'id', ref ->> 'student_id', ref ->> 'group_id'), ch);
  return null;
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  -- profiles/supervisors تُكتب عبر الخادم فقط، وهو يسجّل إجراءاته بنفسه باسم المدير (admin-users.js)
  foreach t in array array['subjects','teachers','students','student_contacts','groups','group_whatsapp',
                           'enrollments','payments','student_packages','permissions'] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;
drop trigger if exists trg_audit on public.profiles;
drop trigger if exists trg_audit on public.supervisors;

-- ---------- 3) متابعة التقارير (المدير + مشرف follow_reports) — الأكاديمية فقط ----------
drop view if exists public.report_feed;
create view public.report_feed as
select r.id, r.lesson_id, r.student_id, r.report_type, r.teacher_notes, r.ai_guidance, r.attachments,
       r.wa_status, r.wa_error, r.wa_sent_at, r.saved_at,
       s.full_name as student_name, s.student_code,
       l.lesson_date, l.lesson_no, l.teacher_id, t.full_name as teacher_name,
       g.name as group_name, sb.name as subject_name
from public.reports r
join public.lessons l on l.id = r.lesson_id
join public.students s on s.id = r.student_id
left join public.teachers t on t.id = l.teacher_id
left join public.groups g on g.id = l.group_id
left join public.subjects sb on sb.id = l.subject_id
where l.scope = 'academy' and s.scope = 'academy' and public.staff_can('follow_reports');

-- ---------- 4) متابعة المعلمين (المدير + مشرف follow_teachers) — الأكاديمية فقط ----------
drop view if exists public.teacher_follow;
create view public.teacher_follow as
select t.id as teacher_id, t.full_name, p.status,
  (select count(*) from public.groups g where g.teacher_id = t.id and g.scope = 'academy' and g.active)::int as groups_count,
  (select count(distinct e.student_id) from public.enrollments e join public.students s on s.id = e.student_id
    where e.teacher_id = t.id and e.status = 'active' and s.scope = 'academy')::int as students_count,
  (select count(*) from public.lessons l where l.teacher_id = t.id and l.scope = 'academy' and l.status = 'done'
     and l.lesson_date >= (now() at time zone 'Africa/Cairo')::date - 30)::int as done_30d,
  (select count(*) from public.lessons l where l.teacher_id = t.id and l.scope = 'academy' and l.status = 'scheduled'
     and l.lesson_date >= (now() at time zone 'Africa/Cairo')::date)::int as upcoming,
  (select count(*) from public.lessons l where l.teacher_id = t.id and l.scope = 'academy' and l.status = 'scheduled'
     and l.lesson_date < (now() at time zone 'Africa/Cairo')::date)::int as overdue,
  (select max(l.lesson_date) from public.lessons l where l.teacher_id = t.id and l.scope = 'academy' and l.status = 'done') as last_done
from public.teachers t join public.profiles p on p.id = t.id
where public.staff_can('follow_teachers');

revoke all on public.report_feed, public.teacher_follow from anon, authenticated;
grant select on public.report_feed, public.teacher_follow to authenticated;

-- ---------- 5) تغيير معلم المجموعة: ينقل التسجيلات النشطة والحصص القادمة إلى المعلم الجديد ----------
-- (الحصص المنتهية تبقى باسم معلمها السابق حفاظًا على الأجور والسجلات)
create or replace function public.group_teacher_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_id is distinct from old.teacher_id then
    update public.enrollments set teacher_id = new.teacher_id where group_id = new.id and status = 'active';
    update public.lessons set teacher_id = new.teacher_id
     where group_id = new.id and status = 'scheduled' and lesson_date >= (now() at time zone 'Africa/Cairo')::date;
  end if;
  return null;
end $$;
drop trigger if exists trg_groups_teacher_sync on public.groups;
create trigger trg_groups_teacher_sync after update of teacher_id on public.groups
  for each row execute function public.group_teacher_sync();
