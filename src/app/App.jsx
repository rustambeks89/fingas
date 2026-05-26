// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: App root — wires AuthProvider + the router.

import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './providers';
import { AppRouter } from './router';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
