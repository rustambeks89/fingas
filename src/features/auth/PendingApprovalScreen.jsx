// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Holding screen shown until the owner approves the employee.

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Clock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function PendingApprovalScreen() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  async function handleSignOut() {
    setLeaving(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <Card className="max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-warning/15 border border-warning/30 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-7 h-7 text-warning" />
        </div>
        <div className="text-xl font-bold text-ink">Ожидание одобрения</div>
        <p className="text-sm text-ink-muted mt-2">
          Ваша заявка отправлена владельцу. Доступ откроется после
          подтверждения. Вы получите уведомление.
        </p>
        {user?.email && (
          <p className="text-xs text-ink-soft mt-3">{user.email}</p>
        )}
        <Button variant="secondary" size="block" className="mt-6" onClick={handleSignOut} loading={leaving}>
          Выйти
        </Button>
      </Card>
    </div>
  );
}
