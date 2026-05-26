// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: clsx + tailwind-merge helper used by every UI component.

import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
