import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  CircleAlert,
  History,
  Inbox,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useApiQuery } from '../hooks/useApiQuery';
import { messageFor } from '../lib/errorMessages';
import { formatDate, formatUsd } from '../lib/money';
import type { PageSize } from '../lib/pagination';
import type { TransactionPage, TransactionType } from '../lib/types';
import { button, card, cardTitle, icon, skeleton, stateTitle } from '../ui/classes';
import { Pagination } from './Pagination';

const DEFAULT_PAGE_SIZE: PageSize = 10;

const TYPES: Record<TransactionType, { label: string; icon: LucideIcon }> = {
  deposit: { label: 'Depósito', icon: ArrowDownToLine },
  withdrawal: { label: 'Retiro', icon: ArrowUpFromLine },
  gateway_credit: { label: 'Pago aprobado', icon: BadgeCheck },
};

interface Props {
  /** Bumped after each operation: go back to page 1 and refetch, keeping the list on screen. */
  refreshToken: number;
  /** Transaction just created by the user; it gets an enter animation. */
  highlightId: string | null;
}

export function TransactionHistory({ refreshToken, highlightId }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [seenRefresh, setSeenRefresh] = useState(refreshToken);
  if (seenRefresh !== refreshToken) {
    // Adjusting state during render (React's documented pattern) avoids a stale extra fetch.
    setSeenRefresh(refreshToken);
    setPage(1);
  }

  const { data, error, loading, reload } = useApiQuery<TransactionPage>(
    `/balances/me/transactions?page=${String(page)}&pageSize=${String(pageSize)}`,
    refreshToken,
  );

  function renderBody() {
    if (error) {
      return (
        <div className="grid animate-fade justify-items-start gap-2 text-danger" role="alert">
          <p className={stateTitle}>
            <CircleAlert className={icon} aria-hidden="true" />
            No se pudieron cargar tus movimientos
          </p>
          <p className="text-muted">{messageFor(error)}</p>
          <button type="button" className={`${button.secondary} mt-2`} onClick={reload}>
            <RefreshCw className={icon} aria-hidden="true" />
            Reintentar
          </button>
        </div>
      );
    }
    if (!data) {
      return (
        <ul className="grid gap-1" aria-label="Cargando movimientos">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className={`${skeleton} h-14`} />
          ))}
        </ul>
      );
    }
    if (data.pagination.total === 0) {
      return (
        <div className="grid animate-fade justify-items-center gap-2 py-6 text-center">
          <Inbox className="size-8 text-muted" aria-hidden="true" />
          <p className={stateTitle}>Aún no tienes movimientos</p>
          <p className="text-muted">Cuando deposites o retires fondos, los verás aquí.</p>
        </div>
      );
    }
    // While another page loads, the current one stays visible but dimmed.
    return (
      <ul className={`grid gap-1 transition-opacity duration-150 ${loading ? 'opacity-50' : ''}`}>
        {data.data.map((tx) => {
          const isDebit = tx.type === 'withdrawal';
          const isNew = tx.id === highlightId;
          const { label, icon: TypeIcon } = TYPES[tx.type];
          return (
            <li
              key={tx.id}
              data-new={isNew || undefined}
              className={`flex items-center gap-3 border-b border-white/9 py-2.5 last:border-b-0 ${
                isNew ? '-mx-2 animate-row-enter rounded-[10px] px-2' : ''
              }`}
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-full ${
                  isDebit ? 'bg-white/6 text-muted' : 'bg-success/10 text-success'
                }`}
                aria-hidden="true"
              >
                <TypeIcon className={icon} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{label}</p>
                <p className="text-sm text-muted">{formatDate(tx.createdAt)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-bold tabular-nums ${isDebit ? 'text-cream' : 'text-success'}`}>
                  {isDebit ? '−' : '+'}
                  {formatUsd(tx.amount)}
                </p>
                <p className="text-sm text-muted">Saldo {formatUsd(tx.balanceAfter)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className={card} aria-labelledby="history-title" aria-busy={loading}>
      <h2 id="history-title" className={cardTitle}>
        <History className={icon} aria-hidden="true" />
        Movimientos
      </h2>

      {renderBody()}

      {!error && data && data.pagination.total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.pagination.total}
          totalPages={data.pagination.totalPages}
          disabled={loading}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </section>
  );
}
