// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Tiny input validators shared by forms.

export const isEmail = (v) =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const isPhone = (v) =>
  typeof v === 'string' && v.replace(/\D/g, '').length >= 9;

export const isStrongPassword = (v) =>
  typeof v === 'string' && v.length >= 8;

export const isNonEmpty = (v) =>
  typeof v === 'string' ? v.trim().length > 0 : v !== null && v !== undefined;

export const isPositiveNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
};

export const isNonNegativeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
};
