-- [CREATED BY CODEX - 2026-05-26]
-- Project: Fingas
-- Purpose: Add explicit archive date columns to the MySQL-synced azs_balance
-- source table so archived shifts can use balance-owned timestamps instead of
-- falling back to azs_selling or synced_at.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'azs_balance'
  ) then
    alter table public.azs_balance
      add column if not exists measured_at timestamptz,
      add column if not exists shift_started_at timestamptz,
      add column if not exists shift_ended_at timestamptz;

    comment on column public.azs_balance.measured_at is
      'Business timestamp from the source MySQL snapshot. Must be synced from the station system; do not use synced_at for archive shift dates.';
    comment on column public.azs_balance.shift_started_at is
      'Optional source shift start timestamp from MySQL, if available.';
    comment on column public.azs_balance.shift_ended_at is
      'Optional source shift end timestamp from MySQL, if available.';

    create index if not exists azs_balance_measured_at_idx
      on public.azs_balance (measured_at desc nulls last);
    create index if not exists azs_balance_shift_started_at_idx
      on public.azs_balance (shift_started_at desc nulls last);
    create index if not exists azs_balance_shift_ended_at_idx
      on public.azs_balance (shift_ended_at desc nulls last);

    notify pgrst, 'reload schema';
  end if;
end $$;
