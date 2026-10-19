-- =====================================================================
-- GoStars — المرحلة 9: إدارة الموقع بدون كود (CMS)
-- يُنفَّذ بعد 007. قابل لإعادة التشغيل. لا DROP TABLE.
-- ⚠ خذ نسخة احتياطية قبل التنفيذ على قاعدة تحتوي بيانات.
-- يضيف:
--   1) عرض public_content للزوار (النص المخفي لا يخرج، ويُعرف أنه مخفي ليُحجب العنصر)
--   2) قيود على محتوى الموقع (روابط الصور https فقط، طول النص، الرئيسية لا تُخفى)
--   3) حاوية صور الموقع site-media (عامة للقراءة، الرفع لمن يملك manage_content فقط)
--   4) تسجيل تعديلات المحتوى والإعلانات في سجل العمليات (النصوص الطويلة تُختصر)
-- =====================================================================

-- ---------- 1) ما يراه الزائر ----------
-- الزائر لا يقرأ الجدول مباشرة؛ يقرأ هذا العرض فقط.
drop view if exists public.public_content;
create view public.public_content as
select key_element,
       case when visible then text_value end as text_value,
       case when visible then image_url end as image_url,
       size, visible
from public.content_site;
revoke all on public.public_content from anon, authenticated;
grant select on public.public_content to anon, authenticated;

drop policy if exists content_anon on public.content_site;
revoke select on public.content_site from anon;

-- ---------- 2) قيود المحتوى ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_site_text_len') then
    alter table public.content_site add constraint content_site_text_len check (text_value is null or length(text_value) <= 5000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_site_image_https') then
    alter table public.content_site add constraint content_site_image_https check (image_url is null or image_url ~ '^https://[^[:space:]]+$' and length(image_url) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_site_size_ok') then
    alter table public.content_site add constraint content_site_size_ok check (size is null or size in ('sm','md','lg'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_site_home_visible') then
    alter table public.content_site add constraint content_site_home_visible check (key_element <> 'page.home' or visible);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'announcements_len') then
    alter table public.announcements add constraint announcements_len check (length(title) <= 150 and length(body) <= 5000);
  end if;
end $$;

-- ---------- 3) صور الموقع ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.site_media_ok(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select obj_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
         and public.staff_can('manage_content') $$;
revoke all on function public.site_media_ok(text) from public, anon;
grant execute on function public.site_media_ok(text) to authenticated;

drop policy if exists site_media_insert on storage.objects;
create policy site_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.site_media_ok(name));
drop policy if exists site_media_delete on storage.objects;
create policy site_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.site_media_ok(name));
drop policy if exists site_media_select on storage.objects;
create policy site_media_select on storage.objects for select to authenticated
  using (bucket_id = 'site-media' and public.staff_can('manage_content'));

-- ---------- 4) سجل العمليات: اختصار القيم الطويلة + تتبّع المحتوى والإعلانات ----------
create or replace function public.audit_clip(v jsonb) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 200 then to_jsonb(left(v #>> '{}', 200) || '…') else v end $$;

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
      if k not in ('updated_at', 'updated_by') and (n -> k) is distinct from (o -> k) then
        ch := ch || jsonb_build_object(k, jsonb_build_object(
          'old', case when k = any(secret) then to_jsonb('***'::text) else public.audit_clip(o -> k) end,
          'new', case when k = any(secret) then to_jsonb('***'::text) else public.audit_clip(n -> k) end));
      end if;
    end loop;
    if ch = '{}'::jsonb then return null; end if;
  else
    for k in select jsonb_object_keys(coalesce(n, o)) loop
      ch := ch || jsonb_build_object(k, case when k = any(secret) then to_jsonb('***'::text) else public.audit_clip(coalesce(n, o) -> k) end);
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
  foreach t in array array['content_site','announcements'] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;
