-- =====================================================================
-- GoStars — المرحلة 3: الحسابات والصلاحيات
-- يُنفَّذ مرة واحدة في Supabase → SQL Editor.
-- ينشئ جدولين من الـ16 المعتمدين: Users (باسم profiles) و Permissions.
-- المرحلة 4 لن تعيد إنشاءهما.
-- لا يحتوي هذا الملف على أي DROP.
-- =====================================================================

-- ---------- 1) جدول المستخدمين (الدور والحالة) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','supervisor','teacher','parent')),
  full_name  text not null,
  login_id   text,                         -- البريد للمعلم/المشرف/المدير، واسم المستخدم لولي الأمر
  status     text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);

-- ---------- 2) جدول الصلاحيات (للمشرفين) ----------
create table if not exists public.permissions (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  permission_key text not null,
  allowed        boolean not null default true,
  unique (user_id, permission_key)
);

alter table public.profiles    enable row level security;
alter table public.permissions enable row level security;

-- ---------- 3) دوال مساعدة (SECURITY DEFINER لتجنّب التكرار اللانهائي في RLS) ----------
-- دور المستخدم الحالي، ولا يُرجع شيئًا إذا كان حسابه موقوفًا
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

-- هل يملك المستخدم الحالي هذه الصلاحية؟ (المدير يملك كل شيء)
create or replace function public.has_permission(k text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
      and (
        p.role = 'admin'
        or exists (
          select 1 from public.permissions x
          where x.user_id = p.id and x.permission_key = k and x.allowed
        )
      )
  )
$$;

-- ---------- 4) سياسات profiles ----------
-- القراءة: صاحب الحساب لصفّه، المدير للجميع، المشرف الحاصل على manage_users للجميع
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.current_role_name() = 'admin'
  or (public.current_role_name() = 'supervisor' and public.has_permission('manage_users'))
);
-- لا توجد سياسات إدراج/تعديل/حذف: كلها تتم عبر الخادم (service_role) فقط.
-- هذا يمنع أي مستخدم من رفع دوره بنفسه.

-- ---------- 5) سياسات permissions ----------
drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated
using (user_id = auth.uid() or public.current_role_name() = 'admin');

drop policy if exists permissions_admin_write on public.permissions;
create policy permissions_admin_write on public.permissions for all to authenticated
using (public.current_role_name() = 'admin')
with check (public.current_role_name() = 'admin');

-- ---------- 6) سحب الصلاحيات الافتراضية ----------
revoke all on public.profiles    from anon;
revoke all on public.permissions from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.permissions to authenticated;

-- =====================================================================
-- تعيين أول مدير (نفّذ بعد إنشاء المستخدم من Authentication → Users)
-- غيّر البريد ثم شغّل هذا الأمر وحده:
-- =====================================================================
-- insert into public.profiles (id, role, full_name, login_id)
-- select id, 'admin', 'المدير', email from auth.users where email = 'ضع-بريدك-هنا@example.com';
