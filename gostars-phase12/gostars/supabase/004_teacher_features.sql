-- =====================================================================
-- GoStars — المرحلة 5: ميزات لوحة المعلم (قاعدة البيانات)
-- يُنفَّذ بعد 003_rls_policies.sql. قابل لإعادة التشغيل. لا DROP TABLE.
-- ⚠ خذ نسخة احتياطية قبل التنفيذ على قاعدة تحتوي بيانات (README-phase5.md).
-- يضيف: وقت الحصة، لقطة سعر المعلم (فردي ثابت / مجموعة لكل طالب حاضر)، باقات الطلاب
-- (يديرها المدير والمشرف فقط) وأرشفة التقارير، عروض الأرباح.
-- =====================================================================

-- ---------- 1) الحصص: وقت البدء + لقطة سعر المعلم ----------
-- lesson_rate = أجر الحصة الفردية (ثابت). group_rate_per_student = أجر المجموعة عن كل طالب حاضر.
alter table public.teachers add column if not exists group_rate_per_student numeric(10,2) not null default 0 check (group_rate_per_student >= 0);

alter table public.lessons add column if not exists start_time time;
alter table public.lessons add column if not exists teacher_rate_at_time numeric(10,2);   -- سعر الوحدة وقت الإتمام: فردي=سعر الحصة، مجموعة=سعر الطالب الواحد

create or replace function public.lesson_rate_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' or new.teacher_rate_at_time is null then
      select case when new.group_id is not null then group_rate_per_student else lesson_rate end
        into new.teacher_rate_at_time from public.teachers where id = new.teacher_id;
    else
      new.teacher_rate_at_time := old.teacher_rate_at_time;   -- لا يتغير بعد تثبيته
    end if;
  else
    new.teacher_rate_at_time := null;                          -- إلغاء الاكتمال يلغي الأجر
  end if;
  return new;
end $$;
drop trigger if exists trg_lessons_rate on public.lessons;
create trigger trg_lessons_rate before insert or update on public.lessons
  for each row execute function public.lesson_rate_snapshot();

update public.lessons l set teacher_rate_at_time = case when l.group_id is not null then t.group_rate_per_student else t.lesson_rate end
from public.teachers t where t.id = l.teacher_id and l.status = 'done' and l.teacher_rate_at_time is null;

-- أجر الحصة لا يُكشف لغير المعلم/الإدارة: نمنع قراءة العمود مباشرة (يُقرأ عبر العروض أدناه)
revoke select on public.lessons from authenticated;
grant select (id, teacher_id, group_id, student_id, subject_id, lesson_no, lesson_date, start_time, title, status,
              general_note, group_report_status, scope, created_at, updated_at) on public.lessons to authenticated;
grant insert (start_time) on public.lessons to authenticated;
grant update (start_time) on public.lessons to authenticated;

-- ---------- 2) باقات الطلاب ----------
create table if not exists public.student_packages (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete restrict,
  kind         text not null check (kind in ('monthly','lessons')),
  starts_on    date not null default ((now() at time zone 'Africa/Cairo')::date),
  ends_on      date,                       -- الشهرية: آخر يوم؛ بعدد الحصص: تُملأ عند الأرشفة
  lessons_total integer check (lessons_total > 0),
  status       text not null default 'active' check (status in ('active','archived')),
  archived_at  timestamptz,
  summary      text,                       -- ملخص الباقة (يمكن توليده بالذكاء الاصطناعي)
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  constraint pkg_monthly_needs_end check (kind <> 'monthly' or ends_on is not null),
  constraint pkg_lessons_needs_total check (kind <> 'lessons' or lessons_total is not null),
  constraint pkg_dates check (ends_on is null or ends_on >= starts_on)
);
create unique index if not exists student_packages_one_active on public.student_packages(student_id) where status = 'active';
create index if not exists student_packages_student_idx on public.student_packages(student_id, starts_on);

create or replace function public.package_archive_stamp() returns trigger
language plpgsql as $$
begin
  if new.status = 'archived' and (tg_op = 'INSERT' or old.status <> 'archived') then new.archived_at := now(); end if;
  if new.status = 'active' then new.archived_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_packages_stamp on public.student_packages;
create trigger trg_packages_stamp before insert or update on public.student_packages
  for each row execute function public.package_archive_stamp();

-- ربط كل تقرير بالباقة التي تقع حصته ضمنها (لأرشفة التقارير)
alter table public.reports add column if not exists package_id uuid references public.student_packages(id) on delete set null;
create index if not exists reports_package_idx on public.reports(package_id);

create or replace function public.report_package() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date;
begin
  select lesson_date into d from public.lessons where id = new.lesson_id;
  select id into new.package_id from public.student_packages
   where student_id = new.student_id and starts_on <= d
   order by starts_on desc limit 1;
  return new;
end $$;
drop trigger if exists trg_reports_package on public.reports;
create trigger trg_reports_package before insert on public.reports
  for each row execute function public.report_package();

-- أرشفة الباقات المنتهية (الشهرية بانتهاء تاريخها، وبعدد الحصص باستهلاكها). تُستدعى من اللوحة ومن مجدول لاحقًا.
create or replace function public.refresh_packages() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; p record; last_d date; c integer;
begin
  if public.current_role_name() is null then return 0; end if;
  update public.student_packages set status = 'archived'
   where status = 'active' and kind = 'monthly' and ends_on < (now() at time zone 'Africa/Cairo')::date;
  get diagnostics c = row_count; n := n + c;

  for p in select * from public.student_packages where status = 'active' and kind = 'lessons' loop
    select d into last_d from (
      select l.lesson_date d, row_number() over (order by l.lesson_date, l.id) rn
      from public.attendance a join public.lessons l on l.id = a.lesson_id
      where a.student_id = p.student_id and a.status in ('present','late') and l.lesson_date >= p.starts_on
    ) x where rn = p.lessons_total;
    if last_d is not null then
      update public.student_packages set status = 'archived', ends_on = last_d where id = p.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.refresh_packages() from public, anon;
grant execute on function public.refresh_packages() to authenticated;

-- ---------- 3) RLS للباقات ----------
alter table public.student_packages enable row level security;
revoke all on public.student_packages from anon, authenticated;

drop policy if exists packages_select on public.student_packages;
create policy packages_select on public.student_packages for select to authenticated
  using ((public.staff_reads_academy() and public.student_scope(student_id) = 'academy')
         or public.teacher_has_student(student_id) or public.parent_has_student(student_id));
-- الإنشاء والإنهاء: المدير والمشرف (manage_students) لطلاب الأكاديمية، والمعلم المالك لطلابه الشخصيين فقط.
-- معلم طالب الأكاديمية يقرأ الباقة ولا يعدّلها.
drop policy if exists packages_write on public.student_packages;
drop policy if exists packages_manage on public.student_packages;
create policy packages_manage on public.student_packages for all to authenticated
  using ((public.staff_can('manage_students') and public.student_scope(student_id) = 'academy') or public.owns_personal_student(student_id))
  with check ((public.staff_can('manage_students') and public.student_scope(student_id) = 'academy') or public.owns_personal_student(student_id));
grant select on public.student_packages to authenticated;
grant insert (student_id, kind, starts_on, ends_on, lessons_total) on public.student_packages to authenticated;
grant update (ends_on, lessons_total, status) on public.student_packages to authenticated;

-- ملخص الباقة (نص ختامي): يحفظه المعلم أو من يديرها، دون صلاحية تعديل باقي الباقة
create or replace function public.save_package_summary(pid uuid, txt text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select student_id into sid from public.student_packages where id = pid;
  if sid is null then raise exception 'الباقة غير موجودة'; end if;
  if not (public.teacher_has_student(sid) or (public.staff_can('manage_students') and public.student_scope(sid) = 'academy')) then
    raise exception 'غير مصرح';
  end if;
  update public.student_packages set summary = nullif(btrim(txt), '') where id = pid;
end $$;
revoke all on function public.save_package_summary(uuid, text) from public, anon;
grant execute on function public.save_package_summary(uuid, text) to authenticated;

-- ---------- 4) عروض ----------
create or replace function public.can_read_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.staff_reads_academy() and public.student_scope(sid) = 'academy')
         or public.teacher_has_student(sid) or public.parent_has_student(sid) $$;

-- تقدّم الباقة: المستهلك = حاضر + متأخر داخل فترة الباقة
drop view if exists public.package_progress;
create view public.package_progress as
select
  p.id as package_id, p.student_id, p.kind, p.starts_on, p.ends_on, p.lessons_total, p.status, p.archived_at, p.summary,
  (select count(*) from public.attendance a join public.lessons l on l.id = a.lesson_id
    where a.student_id = p.student_id and a.status in ('present','late')
      and l.lesson_date >= p.starts_on and (p.ends_on is null or l.lesson_date <= p.ends_on))::int as used_lessons
from public.student_packages p
where public.can_read_student(p.student_id);

-- تفصيل حصص الأجر: الأجر = سعر الوحدة (وقت الإتمام) × عدد الحاضرين (حاضر + متأخر) في التقرير اليومي.
-- الفردي: حاضر=1 أو 0؛ المجموعة: عدد الحاضرين. الغائب لا يُحتسب.
drop view if exists public.teacher_earnings;
drop view if exists public.teacher_lesson_earnings;
create view public.teacher_lesson_earnings as
select
  l.id as lesson_id, l.teacher_id, l.lesson_date, l.start_time, l.title, l.lesson_no,
  g.name as group_name, s.full_name as student_name,
  (l.group_id is not null) as is_group,
  l.teacher_rate_at_time as rate,
  coalesce(a.n, 0)::int as attended,
  coalesce(a.n, 0) * coalesce(l.teacher_rate_at_time, 0) as amount
from public.lessons l
left join public.groups g on g.id = l.group_id
left join public.students s on s.id = l.student_id
left join lateral (select count(*) n from public.attendance x
                   where x.lesson_id = l.id and x.status in ('present','late')) a on true
where l.status = 'done' and l.scope = 'academy'
  and ((public.is_teacher() and l.teacher_id = auth.uid()) or public.staff_can('manage_finance'));

-- أرباح المعلم الشهرية (تغيير السعر لاحقًا لا يمس الحصص السابقة)
create view public.teacher_earnings as
select
  e.teacher_id,
  t.full_name                                as teacher_name,
  date_trunc('month', e.lesson_date)::date   as month,
  count(*)                                   as lessons_done,
  sum(e.attended)::int                       as attendances,
  t.lesson_rate,
  t.group_rate_per_student,
  coalesce(sum(e.amount), 0)                 as amount
from public.teacher_lesson_earnings e
join public.teachers t on t.id = e.teacher_id
group by e.teacher_id, t.full_name, date_trunc('month', e.lesson_date), t.lesson_rate, t.group_rate_per_student;

revoke all on public.package_progress, public.teacher_earnings, public.teacher_lesson_earnings from anon, authenticated;
grant select on public.package_progress, public.teacher_earnings, public.teacher_lesson_earnings to authenticated;
