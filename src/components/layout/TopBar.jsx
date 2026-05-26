import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { Wordmark } from '@/components/ui/Logo';

export function TopBar() {
  const { user } = useAuth();
  const p = user?.profile;

  return (
    <header className="sticky top-0 z-20 border-b border-transparent safe-top bg-bg-card/85 backdrop-blur-xl">
      <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <Wordmark />
        </div>
        
        <div className="flex-1 flex items-center justify-end gap-3">
          <Link
            to="/notifications"
            className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-white/70 hover:text-white transition-colors relative"
            aria-label="Уведомления"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 border-2 border-[rgba(10,15,26,0.9)] rounded-full bg-brand-500" />
          </Link>
          <Link to="/profile" className="transition-transform active:scale-95" aria-label="Профиль">
            <Avatar size="md" className="w-10 h-10 border-white/10 shadow-sm" name={p?.full_name ?? user?.email ?? '?'} src={p?.avatar_url} />
          </Link>
        </div>
      </div>
    </header>
  );
}
