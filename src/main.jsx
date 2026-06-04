// [UPDATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Entry point — mounts <App/> inside <ErrorBoundary/>.

import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './app/App.jsx';
import { ErrorBoundary } from './components/status/ErrorBoundary.jsx';

function shouldUsePerformanceMode() {
  const cores = Number(navigator.hardwareConcurrency ?? 4);
  const memory = Number(navigator.deviceMemory ?? 4);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  return reducedMotion || cores <= 6 || memory <= 4;
}

if (typeof window !== 'undefined' && shouldUsePerformanceMode()) {
  document.documentElement.classList.add('perf-lite');
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);


// SW регистрируем только в prod — в dev он мешает HMR и заставляет
// постоянно делать hard-reload. На проде SW даёт мгновенную загрузку
// со второго раза (cache-first для хешированных бандлов).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore registration failure */
    });
  });
} else if (!import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Если SW случайно остался от предыдущего prod-сеанса — снимаем его в dev.
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    for (const r of regs) r.unregister();
  }).catch(() => { /* ignore */ });
}
