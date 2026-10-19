-- =====================================================================
-- المرحلة 11: ربط بوت واتساب (Termux)
-- البوت لا يصل لقاعدة البيانات مباشرة: يستدعي دالتين على Cloudflare (محميتين بسرّ البوت)
-- وهما تستخدمان service_role لاستدعاء الدوال أدناه. الدوال لا تُمنح إلا لـ service_role.
-- آمنة للتكرار. شغّلها بعد 001–009 (نسخة احتياطية أولاً).
-- =====================================================================

alter table public.reports add column if not exists wa_attempts   integer not null default 0;
alter table public.reports add column if not exists wa_claimed_at timestamptz;

-- نبض البوت: صف واحد يحدَّث مع كل استعلام من البوت، ليعرف المدير أنه يعمل
create table if not exists public.bot_heartbeat (
  id      integer primary key check (id = 1),
  seen_at timestamptz not null default now(),
  info    text
);
alter table public.bot_heartbeat enable row level security;
revoke all on public.bot_heartbeat from anon, authenticated;
drop policy if exists bot_heartbeat_select on public.bot_heartbeat;
create policy bot_heartbeat_select on public.bot_heartbeat for select to authenticated using (public.staff_can('follow_reports'));
grant select on public.bot_heartbeat to authenticated;

-- ---------- سحب التقارير المعلّقة (ذرّي، بلا تكرار بين نسختين من البوت) ----------
-- شروط الإرسال: طالب وحصة من الأكاديمية فقط (الحصص الشخصية لا يرسلها البوت)،
-- ومرّت مهلة قصيرة منذ آخر حفظ (لتعديل المعلم السريع)، وتُعاد المحاولة تدريجياً حتى 3 مرات.
create or replace function public.bot_claim_reports(max_n integer default 5, bot_info text default null)
returns table (
  report_id uuid, report_type text, teacher_notes text, ai_guidance text, attachments jsonb,
  student_name text, student_code text, lesson_date date, lesson_no integer, lesson_title text,
  subject_name text, group_name text, teacher_name text,
  att_status text, hw_status text, hw_score numeric, hw_note text,
  phone text, attempts integer)
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  insert into public.bot_heartbeat (id, seen_at, info) values (1, now(), left(bot_info, 200))
  on conflict (id) do update set seen_at = now(), info = left(excluded.info, 200);

  -- محاولة عالقة (انقطع البوت أثناء الإرسال): تُعاد أو تُفشَل بعد 3 محاولات
  update public.reports set wa_status = case when wa_attempts >= 3 then 'failed' else 'pending' end,
         wa_error = case when wa_attempts >= 3 then 'انقطع البوت أثناء الإرسال' else wa_error end
   where wa_status = 'sending' and wa_claimed_at < now() - interval '10 minutes';

  with c as (
    select r.id from public.reports r
    join public.lessons l on l.id = r.lesson_id
    join public.students s on s.id = r.student_id
    where r.wa_status = 'pending' and l.scope = 'academy' and s.scope = 'academy'
      and r.updated_at <= now() - interval '60 seconds' * greatest(1, r.wa_attempts * r.wa_attempts * 2)
    order by r.saved_at
    limit greatest(1, least(coalesce(max_n, 5), 20))
    for update of r skip locked)
  select array_agg(id) into ids from c;
  if ids is null then return; end if;

  update public.reports set wa_status = 'sending', wa_claimed_at = now(), wa_attempts = wa_attempts + 1 where id = any(ids);

  return query
  select r.id, r.report_type, r.teacher_notes, r.ai_guidance, r.attachments,
         s.full_name, s.student_code, l.lesson_date, l.lesson_no, l.title,
         sb.name, g.name, t.full_name,
         a.status, h.status, h.score, h.note,
         nullif(btrim(sc.parent_phone), ''), r.wa_attempts
  from public.reports r
  join public.lessons l on l.id = r.lesson_id
  join public.students s on s.id = r.student_id
  left join public.student_contacts sc on sc.student_id = s.id
  left join public.attendance a on a.lesson_id = r.lesson_id and a.student_id = r.student_id
  left join public.homework h on h.lesson_id = r.lesson_id and h.student_id = r.student_id
  left join public.teachers t on t.id = l.teacher_id
  left join public.groups g on g.id = l.group_id
  left join public.subjects sb on sb.id = l.subject_id
  where r.id = any(ids)
  order by r.saved_at;
end $$;

-- ---------- تسجيل النتيجة ----------
-- permanent=true: فشل لا تنفع معه إعادة المحاولة (لا رقم، رقم غير مسجّل في واتساب)
create or replace function public.bot_complete_report(rid uuid, ok boolean, err text default null, permanent boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare r public.reports%rowtype; res text;
begin
  select * into r from public.reports where id = rid and wa_status = 'sending' for update;
  if not found then return 'ignored'; end if;
  if ok then
    update public.reports set wa_status = 'sent', wa_sent_at = now(), wa_error = null where id = rid;
    return 'sent';
  end if;
  res := case when permanent or r.wa_attempts >= 3 then 'failed' else 'pending' end;
  update public.reports set wa_status = res, wa_error = left(coalesce(err, 'فشل الإرسال'), 300) where id = rid;
  return res;
end $$;

revoke all on function public.bot_claim_reports(integer, text) from public, anon, authenticated;
revoke all on function public.bot_complete_report(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.bot_claim_reports(integer, text) to service_role;
grant execute on function public.bot_complete_report(uuid, boolean, text, boolean) to service_role;

-- ---------- إعادة المحاولة للفاشل (المدير/مشرف متابعة التقارير) ----------
-- لا يرسل شيئاً: يعيد التقرير الفاشل لطابور البوت فقط. المرسَل (sent) لا يُعاد.
create or replace function public.retry_report(rid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('follow_reports') then raise exception 'غير مصرح'; end if;
  update public.reports r set wa_status = 'pending', wa_attempts = 0, wa_error = null
   where r.id = rid and r.wa_status = 'failed'
     and exists (select 1 from public.lessons l join public.students s on s.id = r.student_id
                 where l.id = r.lesson_id and l.scope = 'academy' and s.scope = 'academy');
  if not found then raise exception 'لا يمكن إعادة هذا التقرير'; end if;
end $$;
revoke all on function public.retry_report(uuid) from public, anon;
grant execute on function public.retry_report(uuid) to authenticated;

-- العرض الإداري يشمل عدد المحاولات
drop view if exists public.report_feed;
create view public.report_feed as
select r.id, r.lesson_id, r.student_id, r.report_type, r.teacher_notes, r.ai_guidance, r.attachments,
       r.wa_status, r.wa_error, r.wa_sent_at, r.saved_at, r.wa_attempts,
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
revoke all on public.report_feed from anon, authenticated;
grant select on public.report_feed to authenticated;
