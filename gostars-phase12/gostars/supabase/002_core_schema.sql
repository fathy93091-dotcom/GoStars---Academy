-- =====================================================================
-- GoStars — المرحلة 4 (1/2): الجداول والعلاقات والقيود
-- يُنفَّذ بعد 001_auth_rbac.sql وقبل 003_rls_policies.sql.
-- لا يحتوي على أي DROP TABLE. كل الأوامر قابلة لإعادة التشغيل (IF NOT EXISTS).
-- ⚠ خذ نسخة احتياطية كاملة قبل التنفيذ (انظر README-phase4.md).
--
-- الكيانات: 16 كيانًا حسب الوثيقة. اثنان أُنشئا في المرحلة 3 (profiles = Users، permissions).
-- الجداول الإضافية (مبرَّرة في README-phase4.md):
--   student_contacts, group_whatsapp, enrollments, subjects, contact_messages
-- =====================================================================

create sequence if not exists public.student_code_seq start 1001;
create sequence if not exists public.payment_ref_seq  start 1001;

-- ---------- المواد الدراسية (قائمة يديرها المدير) ----------
create table if not exists public.subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) between 2 and 60),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 2) المعلمون (المعرّف = معرّف حسابه) ----------
create table if not exists public.teachers (
  id          uuid primary key references public.profiles(id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) >= 2),
  specialty   text,
  rating      numeric(3,2) check (rating between 0 and 5),
  lesson_rate numeric(10,2) not null default 0 check (lesson_rate >= 0),  -- تكلفة/أجر الحصة للمعلم
  created_at  timestamptz not null default now()
);

-- ---------- 3) المشرفون (الصلاحيات في جدول permissions) ----------
create table if not exists public.supervisors (
  id         uuid primary key references public.profiles(id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) >= 2),
  created_at timestamptz not null default now()
);

-- ---------- 4) الطلاب ----------
-- scope: academy = طالب الأكاديمية ، personal = طالب خاص بمعلم (معزول تمامًا عن الأكاديمية)
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  student_code    text not null unique default ('GS-' || nextval('public.student_code_seq')::text),
  full_name       text not null check (length(btrim(full_name)) >= 2),
  grade           text,
  curriculum      text,
  study_type      text not null check (study_type in ('private','group')),
  lesson_price    numeric(10,2) not null default 0 check (lesson_price >= 0),
  schedule        jsonb not null default '[]'::jsonb,
  parent_user_id  uuid references auth.users(id) on delete set null,   -- حساب ولي الأمر في البوابة
  scope           text not null default 'academy' check (scope in ('academy','personal')),
  owner_teacher_id uuid references public.teachers(id) on delete restrict,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint students_scope_owner check (
    (scope = 'academy' and owner_teacher_id is null)
    or (scope = 'personal' and owner_teacher_id is not null and parent_user_id is null)
  )
);
create index if not exists students_parent_idx on public.students(parent_user_id);
create index if not exists students_owner_idx  on public.students(owner_teacher_id);

-- بيانات الاتصال (محجوبة عن المعلمين في الأكاديمية — قاعدة رقم 4)
create table if not exists public.student_contacts (
  student_id   uuid primary key references public.students(id) on delete cascade,
  student_phone text,
  parent_name  text,
  parent_phone text,
  updated_at   timestamptz not null default now()
);

-- ---------- 5) المجموعات ----------
create table if not exists public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) >= 2),
  teacher_id       uuid not null references public.teachers(id) on delete restrict,
  subject_id       uuid references public.subjects(id) on delete set null,
  curriculum       text,
  schedule         jsonb not null default '[]'::jsonb,
  scope            text not null default 'academy' check (scope in ('academy','personal')),
  owner_teacher_id uuid references public.teachers(id) on delete restrict,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint groups_scope_owner check (
    (scope = 'academy' and owner_teacher_id is null)
    or (scope = 'personal' and owner_teacher_id = teacher_id)
  )
);

-- رابط مجموعة الواتساب (محجوب — يقرؤه البوت فقط عبر service_role)
create table if not exists public.group_whatsapp (
  group_id      uuid primary key references public.groups(id) on delete cascade,
  whatsapp_link text
);

-- ---------- التسجيل: يربط الطالب بالمعلم والمجموعة والمادة (متعدد المواد) ----------
create table if not exists public.enrollments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  group_id   uuid references public.groups(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  subject_id uuid references public.subjects(id) on delete set null,
  status     text not null default 'active' check (status in ('active','ended')),
  created_at timestamptz not null default now()
);
create unique index if not exists enrollments_active_unique on public.enrollments (
  student_id, teacher_id,
  coalesce(group_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where status = 'active';
create index if not exists enrollments_teacher_idx on public.enrollments(teacher_id) where status = 'active';

-- ---------- 6) الحصص ----------
create table if not exists public.lessons (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null references public.teachers(id) on delete restrict,
  group_id           uuid references public.groups(id) on delete restrict,
  student_id         uuid references public.students(id) on delete restrict,   -- للحصة الفردية
  subject_id         uuid references public.subjects(id) on delete set null,
  lesson_no          integer check (lesson_no > 0),
  lesson_date        date not null,
  title              text,
  status             text not null default 'scheduled' check (status in ('scheduled','done','cancelled')),
  general_note       text,                          -- ملاحظات عامة للتقرير الجماعي
  group_report_status text not null default 'none' check (group_report_status in ('none','pending','sent','failed')),
  scope              text not null default 'academy' check (scope in ('academy','personal')),  -- يُشتق تلقائيًا
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint lessons_one_target check (((group_id is not null)::int + (student_id is not null)::int) = 1)
);
create index if not exists lessons_teacher_date_idx on public.lessons(teacher_id, lesson_date);
create index if not exists lessons_group_idx on public.lessons(group_id);

-- ---------- 7) الحضور ----------
create table if not exists public.attendance (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete restrict,
  status        text not null check (status in ('present','absent','late')),
  note          text,
  price_at_time numeric(10,2) not null default 0,   -- سعر الحصة وقت التسجيل (يُملأ تلقائيًا)
  created_at    timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index if not exists attendance_student_idx on public.attendance(student_id);

-- ---------- 8) الواجبات ----------
create table if not exists public.homework (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status     text not null check (status in ('done','not_done','partial')),
  score      numeric(6,2) check (score >= 0),
  note       text,
  created_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index if not exists homework_student_idx on public.homework(student_id);

-- ---------- 9) التقارير ----------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete restrict,
  report_type   text not null check (report_type in ('individual','group')),
  teacher_notes text,
  ai_guidance   text,
  attachments   jsonb not null default '[]'::jsonb,     -- مسارات ملفات في تخزين خاص
  saved_at      timestamptz not null default now(),
  -- حالة الإرسال: يكتبها البوت فقط (service_role)
  wa_status     text not null default 'pending' check (wa_status in ('pending','sending','sent','failed')),
  wa_sent_at    timestamptz,
  wa_error      text,
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index if not exists reports_student_idx on public.reports(student_id);
create index if not exists reports_pending_idx on public.reports(wa_status) where wa_status = 'pending';

-- ---------- 10) الاختبارات ----------
create table if not exists public.exams (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  group_id   uuid references public.groups(id) on delete set null,
  exam_name  text not null check (length(btrim(exam_name)) >= 2),
  max_score  numeric(6,2) not null check (max_score > 0),
  score      numeric(6,2) check (score >= 0),
  exam_date  date not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint exams_score_le_max check (score is null or score <= max_score)
);
create index if not exists exams_student_idx on public.exams(student_id);

-- ---------- 11) المدفوعات ----------
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete restrict,
  amount      numeric(10,2) not null check (amount > 0),
  paid_at     date not null default current_date,
  method      text,
  note        text,
  ref_code    text not null unique default ('PAY-' || nextval('public.payment_ref_seq')::text),
  recorded_by uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists payments_student_idx on public.payments(student_id);

-- ---------- 12) التقييمات الشهرية ----------
create table if not exists public.monthly_evaluations (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.students(id) on delete restrict,
  month               date not null check (extract(day from month) = 1),   -- أول يوم في الشهر
  commitment_level    text,
  strengths           text,
  improvements        text,
  overall             text,
  teacher_recommendations text,
  next_month_plan     text,
  published           boolean not null default false,    -- لا يراه ولي الأمر قبل النشر
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  unique (student_id, month)
);

-- ---------- 13) الشهادات ----------
create table if not exists public.certificates (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  title      text not null check (length(btrim(title)) >= 2),
  issued_at  date not null default current_date,
  file_path  text,                                      -- مسار في تخزين خاص (لا رابط عام)
  published  boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists certificates_student_idx on public.certificates(student_id);

-- ---------- 14) الإعلانات ----------
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) >= 2),
  body         text not null,
  audience     text not null default 'all' check (audience in ('all','students','teachers')),
  published_at timestamptz not null default now(),
  visible      boolean not null default true,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- ---------- 15) محتوى الموقع (CMS) ----------
create table if not exists public.content_site (
  id          uuid primary key default gen_random_uuid(),
  key_element text not null unique check (key_element ~ '^[a-z0-9._-]{2,80}$'),
  text_value  text,
  image_url   text,
  size        text,
  model       text,
  visible     boolean not null default true,
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now()
);

-- ---------- رسائل نموذج التواصل (الموقع العام) ----------
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 3 and 80),
  phone      text not null check (length(btrim(phone)) between 6 and 30),
  role       text check (role in ('ولي أمر','طالب','معلم','أخرى')),
  message    text not null check (length(btrim(message)) between 5 and 2000),
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- دوال المشغّلات (Triggers) — كلها SECURITY DEFINER لتعمل بغض النظر عن RLS
-- =====================================================================

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['students','groups','lessons','reports','content_site','student_contacts'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- التسجيل: اتساق المعلم والمجموعة والنطاق
create or replace function public.check_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record; g record;
begin
  select scope, owner_teacher_id into s from public.students where id = new.student_id;
  if s.scope = 'personal' and s.owner_teacher_id <> new.teacher_id then
    raise exception 'طالب خاص: يجب أن يكون المعلم هو مالك الطالب';
  end if;
  if new.group_id is not null then
    select scope, teacher_id into g from public.groups where id = new.group_id;
    if g.teacher_id <> new.teacher_id then raise exception 'معلم التسجيل يجب أن يطابق معلم المجموعة'; end if;
    if g.scope <> s.scope then raise exception 'لا يمكن الخلط بين مجموعة أكاديمية وطالب خاص (أو العكس)'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_enrollments_check on public.enrollments;
create trigger trg_enrollments_check before insert or update on public.enrollments
  for each row execute function public.check_enrollment();

-- الحصة: اشتقاق النطاق من الهدف + اتساق المعلم
create or replace function public.sync_lesson_scope() returns trigger
language plpgsql security definer set search_path = public as $$
declare sc text; own uuid;
begin
  if new.group_id is not null then
    select scope, owner_teacher_id into sc, own from public.groups where id = new.group_id;
  else
    select scope, owner_teacher_id into sc, own from public.students where id = new.student_id;
  end if;
  if sc is null then raise exception 'المجموعة/الطالب غير موجود'; end if;
  new.scope := sc;
  if sc = 'personal' and own <> new.teacher_id then
    raise exception 'حصة شخصية: يجب أن يكون المعلم هو المالك';
  end if;
  return new;
end $$;
drop trigger if exists trg_lessons_scope on public.lessons;
create trigger trg_lessons_scope before insert or update on public.lessons
  for each row execute function public.sync_lesson_scope();

-- الحضور: تثبيت سعر الحصة وقت التسجيل، ومنع تعديله لاحقًا
create or replace function public.attendance_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select lesson_price into new.price_at_time from public.students where id = new.student_id;
  else
    new.price_at_time := old.price_at_time;
    new.lesson_id := old.lesson_id;
    new.student_id := old.student_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_attendance_price on public.attendance;
create trigger trg_attendance_price before insert or update on public.attendance
  for each row execute function public.attendance_price();
