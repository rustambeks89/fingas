// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Catch runtime crashes and show a useful screen instead of a blank
// page. Wraps the entire <App/> tree in main.jsx.

import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Fingas] Runtime error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl bg-bg-card border border-danger/30 p-6 shadow-card">
            <div className="text-danger font-semibold">Произошла ошибка</div>
            <p className="text-sm text-ink-muted mt-2">
              Что-то пошло не так при рендере приложения. Откройте консоль
              браузера для подробностей.
            </p>
            <pre className="mt-4 max-h-48 overflow-auto text-xs bg-bg-elevated rounded-2xl p-3 text-ink-muted whitespace-pre-wrap">
              {String(this.state.error?.message ?? this.state.error)}
            </pre>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="mt-4 w-full h-12 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-semibold"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
