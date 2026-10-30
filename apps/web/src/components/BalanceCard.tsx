import { CircleAlert, RefreshCw, Wallet } from 'lucide-react';
import type { ApiQuery } from '../hooks/useApiQuery';
import { messageFor } from '../lib/errorMessages';
import { formatDate, formatUsd } from '../lib/money';
import type { Balance } from '../lib/types';
import { button, card, cardTitle, icon, skeleton, stateTitle } from '../ui/classes';

export function BalanceCard({ query }: { query: ApiQuery<Balance> }) {
  const { data, error, loading, reload } = query;

  return (
    <section className={card} aria-labelledby="balance-title" aria-busy={loading}>
      <h2 id="balance-title" className={cardTitle}>
        <Wallet className={icon} aria-hidden="true" />
        Saldo disponible
      </h2>

      {error ? (
        <div className="grid animate-fade justify-items-start gap-2 text-danger" role="alert">
          <p className={stateTitle}>
            <CircleAlert className={icon} aria-hidden="true" />
            No se pudo cargar tu saldo
          </p>
          <p className="text-muted">{messageFor(error)}</p>
          <button type="button" className={`${button.secondary} mt-2`} onClick={reload}>
            <RefreshCw className={icon} aria-hidden="true" />
            Reintentar
          </button>
        </div>
      ) : data ? (
        <>
          {/* key replays the enter animation whenever the amount changes */}
          <p
            key={data.amount}
            className="animate-fade text-[2.5rem] leading-tight font-bold tabular-nums wrap-anywhere"
          >
            {formatUsd(data.amount)} <span className="text-base font-semibold text-muted">{data.currency}</span>
          </p>
          <p className="text-sm text-muted">Actualizado {formatDate(data.updatedAt)}</p>
        </>
      ) : (
        <div className={`${skeleton} h-11 w-3/5`} aria-label="Cargando saldo" />
      )}
    </section>
  );
}
