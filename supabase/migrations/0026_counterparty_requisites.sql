-- [CREATED BY CLAUDE CLI - 2026-05-27]
-- Project: Fingas
-- Purpose: Полные реквизиты контрагентов для КР:
--   * ОКПО — Общереспубликанский классификатор предприятий
--   * Юридический адрес — отдельно от физического/почтового
--   * НДС — флаг плательщика + регистрационный номер
--   * ФИО руководителя — для подписи договоров/счетов
--   * Несколько банковских счетов на одного контрагента (отдельная таблица)
--
-- Идемпотентно.

------------------------------------------------------------------------------
-- 1. Расширяем counterparties
------------------------------------------------------------------------------
alter table public.counterparties
  add column if not exists okpo          text,
  add column if not exists legal_address text,
  add column if not exists director_name text,
  add column if not exists vat_payer     boolean not null default false,
  add column if not exists vat_number    text,
  add column if not exists bank_name     text,     -- основной банк (deprecated, остаётся для совместимости)
  add column if not exists bank_account  text,     -- основной счёт (deprecated)
  add column if not exists bank_bik      text;     -- основной БИК (deprecated)

------------------------------------------------------------------------------
-- 2. Таблица банковских счетов (несколько на контрагента)
------------------------------------------------------------------------------
create table if not exists public.counterparty_bank_accounts (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  counterparty_id          uuid not null references public.counterparties(id) on delete cascade,
  label                    text,                          -- "Основной", "Долларовый", "Транзитный"
  bank_name                text not null,
  bik                      text,                          -- БИК банка
  account_number           text not null,                 -- расчётный счёт
  correspondent_account    text,                          -- корсчёт (опционально)
  currency                 text not null default 'KGS' check (currency in ('KGS','USD','RUB','EUR','KZT','UZS','CNY','OTHER')),
  is_primary               boolean not null default false,
  active                   boolean not null default true,
  note                     text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_cp_bank_accounts_cp  on public.counterparty_bank_accounts (counterparty_id);
create index if not exists idx_cp_bank_accounts_org on public.counterparty_bank_accounts (organization_id);

-- Только один primary на пару (counterparty_id, currency).
create unique index if not exists uniq_cp_bank_primary
  on public.counterparty_bank_accounts (counterparty_id, currency)
  where is_primary;

drop trigger if exists trg_cp_bank_accounts_updated_at on public.counterparty_bank_accounts;
create trigger trg_cp_bank_accounts_updated_at
  before update on public.counterparty_bank_accounts
  for each row execute function public.trigger_set_updated_at();

------------------------------------------------------------------------------
-- 3. RLS
------------------------------------------------------------------------------
alter table public.counterparty_bank_accounts enable row level security;

drop policy if exists cp_bank_sel on public.counterparty_bank_accounts;
create policy cp_bank_sel on public.counterparty_bank_accounts for select
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_view')
  );

drop policy if exists cp_bank_ins on public.counterparty_bank_accounts;
create policy cp_bank_ins on public.counterparty_bank_accounts for insert
  with check (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_create')
  );

drop policy if exists cp_bank_upd on public.counterparty_bank_accounts;
create policy cp_bank_upd on public.counterparty_bank_accounts for update
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_edit')
  )
  with check (organization_id = public.fingas_current_org());

drop policy if exists cp_bank_del on public.counterparty_bank_accounts;
create policy cp_bank_del on public.counterparty_bank_accounts for delete
  using (
    organization_id = public.fingas_current_org()
    and public.fingas_has_perm('suppliers','can_delete')
  );

notify pgrst, 'reload schema';
