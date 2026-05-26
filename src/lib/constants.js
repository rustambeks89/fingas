// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Single source of truth for enums shared by UI + services + RLS.
// Keep aligned with SQL migrations in /supabase/migrations.

export const ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  OPERATOR: 'operator',
  ACCOUNTANT: 'accountant',
});

export const ROLE_LIST = Object.values(ROLES);

export const ROLE_LABELS = {
  owner: 'Владелец',
  admin: 'Администратор',
  operator: 'Оператор',
  accountant: 'Бухгалтер',
};

export const PROFILE_STATUS = Object.freeze({
  PENDING: 'pending_approval',
  ACTIVE: 'active',
  REJECTED: 'rejected',
  BLOCKED: 'blocked',
});

export const PROFILE_STATUS_LABELS = {
  pending_approval: 'Ожидает одобрения',
  active: 'Активен',
  rejected: 'Отклонен',
  blocked: 'Заблокирован',
};

export const MODULES = Object.freeze({
  DASHBOARD: 'dashboard',
  SHIFTS: 'shifts',
  SALES: 'sales',
  FUEL_SUPPLY: 'fuel_supply',
  TANK_MEASUREMENTS: 'tank_measurements',
  CALIBRATIONS: 'calibrations',
  FUEL_BALANCES: 'fuel_balances',
  CASHFLOW: 'cashflow',
  PL: 'pl',
  TAXES: 'taxes',
  PAYROLL: 'payroll',
  SUPPLIERS: 'suppliers',
  COLLECTIONS: 'collections',
  DOCUMENTS: 'documents',
  SETTINGS: 'settings',
  EMPLOYEES: 'employees',
  NOTIFICATIONS: 'notifications',
  CHAT: 'chat',
});

export const MODULE_LIST = Object.values(MODULES);

export const MODULE_LABELS = {
  dashboard: 'Дашборд',
  shifts: 'Смены',
  sales: 'Продажи',
  fuel_supply: 'Поступления топлива',
  tank_measurements: 'Замеры резервуаров',
  calibrations: 'Поверки ТРК',
  fuel_balances: 'Остатки топлива',
  cashflow: 'Кэшфлоу',
  pl: 'P&L',
  taxes: 'Налоги',
  payroll: 'Зарплата',
  suppliers: 'Поставщики',
  collections: 'Инкассация',
  documents: 'Документы',
  settings: 'Настройки',
  employees: 'Сотрудники',
  notifications: 'Уведомления',
  chat: 'Чат',
};

export const PERMISSION_ACTIONS = Object.freeze([
  'can_view',
  'can_create',
  'can_edit',
  'can_delete',
  'can_approve',
  'can_export',
  'can_upload',
]);

export const ACTION_LABELS = {
  can_view: 'Просмотр',
  can_create: 'Создание',
  can_edit: 'Редактирование',
  can_delete: 'Удаление',
  can_approve: 'Подтверждение',
  can_export: 'Экспорт',
  can_upload: 'Загрузка',
};

export const SHIFT_STATUS = Object.freeze({
  OPEN: 'open',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CLOSED: 'closed',
});

export const CASHFLOW_OPERATION = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
  COLLECTION: 'collection',
  TAX: 'tax',
  SALARY: 'salary',
  SUPPLIER_PAYMENT: 'supplier_payment',
  OWNER_CONTRIBUTION: 'owner_contribution',
});

export const COLLECTION_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending_confirmation',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
});

export const SALARY_TYPE = Object.freeze({
  FIXED: 'fixed',
  PIECEWORK: 'piecework',
});

export const TAX_TYPES = [
  'НДС',
  'НсП',
  'Налог на прибыль',
  'Единый налог',
  'Подоходный налог',
  'Соцфонд',
  'Налог на имущество',
  'Земельный налог',
  'Прочие налоги',
];

// Modules NOT visible by default to operators (owner can still toggle them on).
export const OPERATOR_HIDDEN_MODULES = [
  MODULES.PL,
  MODULES.CASHFLOW,
  MODULES.PAYROLL,
  MODULES.SUPPLIERS,
  MODULES.TAXES,
];

// Default role templates (used only as the starting toggle state when owner
// onboards an employee — the real source of truth is user_permissions).
export const ROLE_DEFAULT_PERMISSIONS = {
  owner: 'all',
  admin: {
    dashboard: ['can_view'],
    shifts: ['can_view', 'can_create', 'can_edit', 'can_approve'],
    sales: ['can_view'],
    fuel_supply: ['can_view', 'can_create', 'can_edit', 'can_upload'],
    tank_measurements: ['can_view', 'can_create', 'can_upload'],
    calibrations: ['can_view', 'can_create'],
    fuel_balances: ['can_view'],
    collections: ['can_view', 'can_create', 'can_upload'],
    documents: ['can_view', 'can_upload'],
    employees: ['can_view'],
    notifications: ['can_view'],
    chat: ['can_view', 'can_create', 'can_send', 'can_upload'],
  },
  operator: {
    dashboard: ['can_view'],
    shifts: ['can_view', 'can_create', 'can_edit'],
    sales: ['can_view'],
    documents: ['can_view', 'can_upload'],
    notifications: ['can_view'],
    chat: ['can_view', 'can_create', 'can_send', 'can_upload'],
  },
  accountant: {
    dashboard: ['can_view'],
    sales: ['can_view', 'can_export'],
    cashflow: ['can_view', 'can_create', 'can_export'],
    pl: ['can_view', 'can_export'],
    taxes: ['can_view', 'can_create', 'can_edit', 'can_export'],
    suppliers: ['can_view', 'can_create', 'can_edit', 'can_export'],
    documents: ['can_view', 'can_upload'],
    notifications: ['can_view'],
    chat: ['can_view', 'can_create', 'can_send', 'can_upload'],
  },
};
