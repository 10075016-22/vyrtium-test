import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { BalanceCard } from '../components/BalanceCard';
import { Brand } from '../components/Brand';
import { MovementForm } from '../components/MovementForm';
import { TransactionHistory } from '../components/TransactionHistory';
import { useApiQuery } from '../hooks/useApiQuery';
import type { Balance } from '../lib/types';
import { button, icon } from '../ui/classes';

export function BalancePage() {
  const { session, logout } = useAuth();
  const balance = useApiQuery<Balance>('/balances/me');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [newTransactionId, setNewTransactionId] = useState<string | null>(null);

  function handleCompleted(transactionId: string) {
    balance.reload();
    setNewTransactionId(transactionId);
    setHistoryRefresh((n) => n + 1);
  }

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/9 bg-ink/75 px-4 py-3 backdrop-blur-md md:px-6">
        <Brand />
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-sm text-muted">{session?.email}</span>
          <button
            type="button"
            className={button.ghost}
            onClick={() => {
              logout();
            }}
          >
            <LogOut className={icon} aria-hidden="true" />
            {/* Icon-only on small screens; the label stays available to screen readers. */}
            <span className="sr-only sm:not-sr-only">Cerrar sesión</span>
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1080px] grid-cols-[minmax(0,1fr)] gap-4 p-4 md:grid-cols-[minmax(300px,380px)_1fr] md:items-start md:gap-6 md:px-6 md:py-8">
        <h1 className="sr-only">Tu saldo</h1>
        <div className="grid content-start gap-4">
          <BalanceCard query={balance} />
          <MovementForm onCompleted={handleCompleted} />
        </div>
        <TransactionHistory refreshToken={historyRefresh} highlightId={newTransactionId} />
      </main>
    </div>
  );
}
