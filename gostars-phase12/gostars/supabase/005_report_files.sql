-- =====================================================================
-- GoStars — المرحلة 6: مرفقات التقارير (صور/مستندات إيضاحية) في تخزين خاص
-- يُنفَّذ بعد 004_teacher_features.sql. قابل لإعادة التشغيل. لا DROP TABLE.
-- ⚠ خذ نسخة احتياطية قبل التنفيذ على قاعدة تحتوي بيانات.
--
-- المسار الإلزامي للملف:  <teacher_id>/<lesson_id>/<student_id>/<اسم-الملف>
--   - الرفع: معلم الحصة نفسه فقط، لطالب ضمن الحصة.
--   - القراءة: معلم الحصة، أو المدير/المشرف (follow_reports/manage_students) لحصص الأكاديمية،
--              أو ولي أمر الطالب نفسه. لا روابط عامة أبدًا (روابط موقّعة قصيرة العمر).
--   - الحصص الشخصية: لا يراها المدير ولا المشرف.
-- =====================================================================

-- ---------- 1) الحاوية (Bucket) الخاصة ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-files', 'report-files', false, 20971520,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- 2) دالة التحقق من المسار والصلاحية ----------
create or replace function public.report_file_access(obj_name text, mode text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[];
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  t uuid; l uuid; s uuid;
begin
  parts := string_to_array(obj_name, '/');
  if array_length(parts, 1) is distinct from 4 then return false; end if;
  if parts[1] !~ uuid_re or parts[2] !~ uuid_re or parts[3] !~ uuid_re then return false; end if;
  if parts[4] !~ '^[A-Za-z0-9._-]{1,100}$' or parts[4] like '%..%' then return false; end if;
  t := parts[1]::uuid; l := parts[2]::uuid; s := parts[3]::uuid;

  if mode = 'write' then
    return t = auth.uid() and public.teacher_owns_lesson(l) and public.lesson_has_student(l, s);
  end if;
  return (t = auth.uid() and public.teacher_owns_lesson(l))
      or (public.staff_can_any(array['follow_reports','manage_students'])
          and public.lesson_scope(l) = 'academy' and public.student_scope(s) = 'academy')
      or public.parent_has_student(s);
end $$;
revoke all on function public.report_file_access(text, text) from public, anon;
grant execute on function public.report_file_access(text, text) to authenticated;

-- ---------- 3) سياسات التخزين ----------
drop policy if exists report_files_insert on storage.objects;
create policy report_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'report-files' and public.report_file_access(name, 'write'));

drop policy if exists report_files_select on storage.objects;
create policy report_files_select on storage.objects for select to authenticated
  using (bucket_id = 'report-files' and public.report_file_access(name, 'read'));

drop policy if exists report_files_delete on storage.objects;
create policy report_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'report-files' and public.report_file_access(name, 'write'));

-- ---------- 4) حد مرفقات التقرير (5 ملفات كحد أقصى، مصفوفة فقط) ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_attachments_limit') then
    alter table public.reports add constraint reports_attachments_limit
      check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5);
  end if;
end $$;
