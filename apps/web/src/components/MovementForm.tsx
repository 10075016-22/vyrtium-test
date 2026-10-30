import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, LoaderCircle, type LucideIcon } from 'lucide-react';
import { useRef, useState, type SubmitEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../auth/useAuth';
import { ApiError } from '../lib/api';
import { messageFor } from '../lib/errorMessages';
import { formatUsd, unmaskAmount, validateAmount } from '../lib/money';
import type { MovementResponse } from '../lib/types';
import { button, card, cardTitle, field, fieldError as fieldErrorClass, fieldHelp, icon, input, label } from '../ui/classes';
import { AmountInput } from './AmountInput';

type MovementType = 'deposit' | 'withdrawal';

// A single id: a new result replaces the previous toast instead of stacking up.
const RESULT_TOAST_ID = 'movement-result';

/** One key per user intent; a retry of the same intent must send the same key. */
interface PendingAttempt {
  fingerprint: string;
  key: string;
}

const LABELS: Record<MovementType, { action: string; done: string; path: string; icon: LucideIcon }> = {
  deposit: { action: 'Depositar', done: 'Depósito realizado', path: '/balances/me/deposits', icon: ArrowDownToLine },
  withdrawal: {
    action: 'Retirar',
    done: 'Retiro realizado',
    path: '/balances/me/withdrawals',
    icon: ArrowUpFromLine,
  },
};

export function MovementForm({ onCompleted }: { onCompleted: (transactionId: string) => void }) {
  const { request } = useAuth();
  const [type, setType] = useState<MovementType>('deposit');
  const [amount, setAmount] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Refs, not state: a fast double click fires twice before React re-renders
  // the disabled button, so the guard and the key must update synchronously.
  const inFlight = useRef(false);
  const pending = useRef<PendingAttempt | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const validation = validateAmount(unmaskAmount(amount));
    if (!validation.ok) {
      setFieldError(validation.message);
      return;
    }

    const fingerprint = `${type}:${validation.amount}`;
    if (pending.current?.fingerprint !== fingerprint) {
      pending.current = { fingerprint, key: crypto.randomUUID() };
    }
    const { key } = pending.current;

    inFlight.current = true;
    setSubmitting(true);
    setFieldError(null);

    try {
      const result = await request<MovementResponse>(LABELS[type].path, {
        method: 'POST',
        body: { amount: validation.amount, currency: 'USD' },
        headers: { 'Idempotency-Key': key },
      });
      pending.current = null;
      setAmount('');
      toast.success(`${LABELS[type].done} por ${formatUsd(result.transaction.amount)}`, {
        id: RESULT_TOAST_ID,
        description: `Nuevo saldo: ${formatUsd(result.balance.amount)}`,
      });
      onCompleted(result.transaction.id);
    } catch (err) {
      // Network failures and 5xx may or may not have been applied: keep the key so
      // the retry is deduplicated by the API. Any other answer is final.
      if (err instanceof ApiError && err.isRetryable) {
        toast.error(messageFor(err), {
          id: RESULT_TOAST_ID,
          description: 'Si vuelves a intentarlo, la operación no se duplicará.',
          duration: 10_000,
          action: {
            label: 'Reintentar',
            // Same form state, so the retry reuses the pending Idempotency-Key.
            onClick: () => formRef.current?.requestSubmit(),
          },
        });
      } else {
        pending.current = null;
        toast.error(messageFor(err), { id: RESULT_TOAST_ID });
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const SubmitIcon = LABELS[type].icon;

  return (
    <section className={card} aria-labelledby="movement-title">
      <h2 id="movement-title" className={cardTitle}>
        <ArrowLeftRight className={icon} aria-hidden="true" />
        Mover fondos
      </h2>

      <form ref={formRef} className="grid gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <fieldset
          className="relative grid grid-cols-2 gap-1 rounded-full border border-white/9 bg-field p-1"
          disabled={submitting}
        >
          <legend className="sr-only">Tipo de operación</legend>
          {/* Sliding highlight behind the selected option; transform keeps it on the compositor. */}
          <span
            className={`absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-full bg-raised shadow-[0_0_0_1px_rgb(255_255_255/16%)] transition-transform duration-220 ease-snappy ${
              type === 'withdrawal' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'
            }`}
            aria-hidden="true"
          />
          {(['deposit', 'withdrawal'] as const).map((option) => {
            const OptionIcon = LABELS[option].icon;
            return (
              <label key={option} className="relative z-1">
                <input
                  type="radio"
                  name="movement-type"
                  value={option}
                  checked={type === option}
                  className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                  onChange={() => {
                    setType(option);
                  }}
                />
                <span className="flex min-h-10 items-center justify-center gap-2 rounded-full font-semibold text-muted transition-colors duration-200 peer-checked:text-cream peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-brand-bright [&>svg]:transition-[color,transform] [&>svg]:duration-200 peer-checked:[&>svg]:scale-110 peer-checked:[&>svg]:text-brand">
                  <OptionIcon className={icon} aria-hidden="true" />
                  {LABELS[option].action}
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className={field}>
          <label htmlFor="amount" className={label}>
            Monto (USD)
          </label>
          <div className="relative">
            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true">
              $
            </span>
            <AmountInput
              id="amount"
              name="amount"
              spellCheck={false}
              autoComplete="off"
              placeholder="0.00"
              className={`${input} pl-7 tabular-nums`}
              value={amount}
              onValueChange={(masked) => {
                setAmount(masked);
                // Over the limit is a definite error, so it shows while typing. Other
                // errors (empty, "0.") may be intermediate states and wait for submit.
                const live = validateAmount(unmaskAmount(masked));
                setFieldError(!live.ok && live.reason === 'over-limit' ? live.message : null);
              }}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'amount-error amount-help' : 'amount-help'}
            />
          </div>
          <p id="amount-help" className={fieldHelp}>
            Máximo 10,000.00 USD por operación, con hasta 2 decimales.
          </p>
          {fieldError && (
            <p id="amount-error" className={fieldErrorClass}>
              {fieldError}
            </p>
          )}
        </div>

        <button type="submit" className={`${button.primary} w-full`} disabled={submitting}>
          {submitting ? (
            <LoaderCircle className={`${icon} animate-spin`} aria-hidden="true" />
          ) : (
            <SubmitIcon className={icon} aria-hidden="true" />
          )}
          {/* key replays the label fade when the operation type changes */}
          <span key={submitting ? 'sending' : type} className="animate-fade">
            {submitting ? 'Procesando…' : LABELS[type].action}
          </span>
        </button>
      </form>
    </section>
  );
}
