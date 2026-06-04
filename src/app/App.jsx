// [UPDATED BY CLAUDE CLI - 2026-06-04]
// Project: Fingas
// Purpose: App root — wires AuthProvider + the router.
//
// MotionConfig раньше жил здесь и тянул framer-motion (~37KB gzip) в первый
// бандл ещё до того как пользователь увидел экран логина. Теперь MotionConfig
// смонтирован внутри MobileLayout (за PrivateRoute), а на auth-экранах
// используются обычные CSS-анимации Tailwind. До авторизации framer-motion
// вообще не подтягивается.

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
