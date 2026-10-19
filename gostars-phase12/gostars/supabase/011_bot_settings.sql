-- =====================================================================
-- إعدادات البوت من لوحة المدير (/admin/bot) — المدير فقط
-- صف واحد. البوت يقرؤها مع كل سحب (عبر الدالة)، فتسري التعديلات خلال دقائق بلا لمس الهاتف.
-- آمنة للتكرار. شغّلها بعد 010.
-- =====================================================================

create table if not exists public.bot_settings (
  id               integer primary key default 1 check (id = 1),
  enabled          boolean not null default true,          -- إيقاف مؤقت لكل الإرسال
  hold_seconds     integer not null default 60  check (hold_seconds between 0 and 3600),   -- مهلة بعد آخر حفظ
  max_per_cycle    integer not null default 5   check (max_per_cycle between 1 and 10),
  delay_min        integer not null default 5   check (delay_min between 2 and 120),       -- فاصل بين الرسائل (ثوانٍ)
  delay_max        integer not null default 12  check (delay_max between 2 and 300),
  max_attempts     integer not null default 3   check (max_attempts between 1 and 5),
  send_to_absent   boolean not null default true,          -- هل يُرسل تقرير الطالب الغائب
  send_attachments boolean not null default true,
  quiet_from       integer check (quiet_from between 0 and 23),   -- ساعات الصمت بتوقيت القاهرة (اختياري)
  quiet_to         integer check (quiet_to between 0 and 23),
  show_teacher     boolean not null default true,
  show_homework    boolean not null default true,
  show_notes       boolean not null default true,          -- ملاحظات المعلم
  show_guidance    boolean not null default true,          -- توجيهات الذكاء الاصطناعي
  header_text      text not null default 'أكاديمية GoStars ⭐' check (length(header_text) between 1 and 100),
  footer_text      text not null default 'يمكنك متابعة كل التفاصيل من بوابة ولي الأمر على موقع الأكاديمية. 🌟' check (length(footer_text) <= 300),
  updated_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  constraint bot_delay_order check (delay_min <= delay_max),
  constraint bot_quiet_pair check ((quiet_from is null) = (quiet_to is null))
);
insert into public.bot_settings (id) values (1) on conflict do nothing;

alter table public.bot_settings enable row level security;
revoke all on public.bot_settings from anon, authenticated;
drop policy if exists bot_settings_admin on public.bot_settings;
create policy bot_settings_admin on public.bot_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.bot_settings to authenticated;
grant update (enabled, hold_seconds, max_per_cycle, delay_min, delay_max, max_attempts, send_to_absent, send_attachments,
              quiet_from, quiet_to, show_teacher, show_homework, show_notes, show_guidance, header_text, footer_text)
  on public.bot_settings to authenticated;

drop trigger if exists trg_bot_settings_updated on public.bot_settings;
create trigger trg_bot_settings_updated before update on public.bot_settings for each row execute function public.set_updated_at();
drop trigger if exists trg_audit on public.bot_settings;
create trigger trg_audit after update on public.bot_settings for each row execute function public.audit_row();

-- هل نحن داخل ساعات الصمت الآن (بتوقيت القاهرة)؟
create or replace function public.bot_in_quiet(s public.bot_settings) returns boolean
language sql stable as $$
  select case when s.quiet_from is null then false
    else (case when s.quiet_from <= s.quiet_to
               then extract(hour from now() at time zone 'Africa/Cairo') between s.quiet_from and s.quiet_to - 1
               else extract(hour from now() at time zone 'Africa/Cairo') >= s.quiet_from or extract(hour from now() at time zone 'Africa/Cairo') < s.quiet_to end) end $$;

-- الإعدادات التي يحتاجها البوت (بدون حقول التدقيق)
create or replace function public.bot_get_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(s) - 'id' - 'updated_by' - 'updated_at' || jsonb_build_object('paused_now', (not s.enabled) or public.bot_in_quiet(s))
  from public.bot_settings s where id = 1 $$;
revoke all on function public.bot_get_settings() from public, anon, authenticated;
grant execute on function public.bot_get_settings() to service_role;
revoke all on function public.bot_in_quiet(public.bot_settings) from public, anon, authenticated;

-- ---------- سحب التقارير يحترم الإعدادات ----------
drop function if exists public.bot_claim_reports(integer, text);
create or replace function public.bot_claim_reports(max_n integer default 5, bot_info text default null)
returns table (
  report_id uuid, report_type text, teacher_notes text, ai_guidance text, attachments jsonb,
  student_name text, student_code text, lesson_date date, lesson_no integer, lesson_title text,
  subject_name text, group_name text, teacher_name text,
  att_status text, hw_status text, hw_score numeric, hw_note text,
  phone text, attempts integer)
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; s public.bot_settings;
begin
  insert into public.bot_heartbeat (id, seen_at, info) values (1, now(), left(bot_info, 200))
  on conflict (id) do update set seen_at = now(), info = left(excluded.info, 200);
  select * into s from public.bot_settings where id = 1;
  if s.id is null then s.enabled := true; s.hold_seconds := 60; s.max_per_cycle := 5; s.max_attempts := 3; s.send_to_absent := true; end if;

  -- محاولة عالقة (انقطع البوت أثناء الإرسال)
  update public.reports set wa_status = case when wa_attempts >= s.max_attempts then 'failed' else 'pending' end,
         wa_error = case when wa_attempts >= s.max_attempts then 'انقطع البوت أثناء الإرسال' else wa_error end
   where wa_status = 'sending' and wa_claimed_at < now() - interval '10 minutes';

  if not s.enabled or public.bot_in_quiet(s) then return; end if;

  with c as (
    select r.id from public.reports r
    join public.lessons l on l.id = r.lesson_id
    join public.students st on st.id = r.student_id
    where r.wa_status = 'pending' and l.scope = 'academy' and st.scope = 'academy'
      and r.updated_at <= now() - (interval '1 second' * greatest(s.hold_seconds, 0)) * greatest(1, r.wa_attempts * r.wa_attempts * 2)
      and (s.send_to_absent or not exists (select 1 from public.attendance a where a.lesson_id = r.lesson_id and a.student_id = r.student_id and a.status = 'absent'))
    order by r.saved_at
    limit greatest(1, least(coalesce(max_n, 5), s.max_per_cycle))
    for update of r skip locked)
  select array_agg(id) into ids from c;
  if ids is null then return; end if;

  update public.reports set wa_status = 'sending', wa_claimed_at = now(), wa_attempts = wa_attempts + 1 where id = any(ids);

  return query
  select r.id, r.report_type, r.teacher_notes, r.ai_guidance, r.attachments,
         st.full_name, st.student_code, l.lesson_date, l.lesson_no, l.title,
         sb.name, g.name, t.full_name,
         a.status, h.status, h.score, h.note,
         nullif(btrim(sc.parent_phone), ''), r.wa_attempts
  from public.reports r
  join public.lessons l on l.id = r.lesson_id
  join public.students st on st.id = r.student_id
  left join public.student_contacts sc on sc.student_id = st.id
  left join public.attendance a on a.lesson_id = r.lesson_id and a.student_id = r.student_id
  left join public.homework h on h.lesson_id = r.lesson_id and h.student_id = r.student_id
  left join public.teachers t on t.id = l.teacher_id
  left join public.groups g on g.id = l.group_id
  left join public.subjects sb on sb.id = l.subject_id
  where r.id = any(ids)
  order by r.saved_at;
end $$;
revoke all on function public.bot_claim_reports(integer, text) from public, anon, authenticated;
grant execute on function public.bot_claim_reports(integer, text) to service_role;

-- الفشل النهائي يحترم حد المحاولات المضبوط
create or replace function public.bot_complete_report(rid uuid, ok boolean, err text default null, permanent boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare r public.reports%rowtype; res text; mx integer;
begin
  select * into r from public.reports where id = rid and wa_status = 'sending' for update;
  if not found then return 'ignored'; end if;
  if ok then
    update public.reports set wa_status = 'sent', wa_sent_at = now(), wa_error = null where id = rid;
    return 'sent';
  end if;
  select coalesce(max_attempts, 3) into mx from public.bot_settings where id = 1;
  res := case when permanent or r.wa_attempts >= coalesce(mx, 3) then 'failed' else 'pending' end;
  update public.reports set wa_status = res, wa_error = left(coalesce(err, 'فشل الإرسال'), 300) where id = rid;
  return res;
end $$;
revoke all on function public.bot_complete_report(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.bot_complete_report(uuid, boolean, text, boolean) to service_role;
