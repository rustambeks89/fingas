// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: useAuth hook — reads the AuthContext provided by AuthProvider.

import { useContext } from 'react';
import { AuthContext } from '@/app/providers';

export function useAuth() {
  return useContext(AuthContext);
}
