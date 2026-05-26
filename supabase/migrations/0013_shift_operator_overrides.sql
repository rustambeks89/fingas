-- [CREATED BY CLAUDE CLI - 2026-05-25]
-- Project: Fingas
-- Purpose: Manual override for the operator name attached to a POS shift.
-- azs_selling provides the original OperatorName (login on the POS), but it is
-- sometimes wrong (login mismatch, account sharing, accent issues). Owners
-- can store a corrected name here keyed on ShiftKey + ShopKey.
--
-- Reports must use:
--   operator_final_name = operator_corrected_name || operator_original_name
--
-- Idempotent. Apply via Supabase SQL editor.

create table if not exists public.shift_operator_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  station_id       uuid references public.stations(id) on delete set null,
  shop_key         integer not null,
  shift_key        integer not null,
  operator_corrected_name text,
  note             text,
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists ux_shift_op_override
  on public.shift_operator_overrides (organization_id, shop_key, shift_key);

create index if not exists idx_shift_op_override_org
  on public.shift_operator_overrides (organization_id);

drop trigger if exists trg_shift_op_override_updated_at on public.shift_operator_overrides;
create trigger trg_shift_op_override_updated_at
  before update on public.shift_operator_overrides
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------------
alter table public.shift_operator_overrides enable row level security;

drop policy if exists shift_op_override_select on public.shift_operator_overrides;
create policy shift_op_override_select on public.shift_operator_overrides
  for select
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('shifts', 'can_view')
  );

drop policy if exists shift_op_override_insert on public.shift_operator_overrides;
create policy shift_op_override_insert on public.shift_operator_overrides
  for insert
  with check (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('shifts', 'can_edit')
  );

drop policy if exists shift_op_override_update on public.shift_operator_overrides;
create policy shift_op_override_update on public.shift_operator_overrides
  for update
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('shifts', 'can_edit')
  )
  with check (organization_id = public.fingas_current_org());

drop policy if exists shift_op_override_delete on public.shift_operator_overrides;
create policy shift_op_override_delete on public.shift_operator_overrides
  for delete
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('shifts', 'can_delete')
  );
