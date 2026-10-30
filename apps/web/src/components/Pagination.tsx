import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { PAGE_SIZE_OPTIONS, pageItems, type PageSize } from '../lib/pagination';
import { icon } from '../ui/classes';

interface Props {
  page: number;
  pageSize: PageSize;
  total: number;
  totalPages: number;
  disabled: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

// Same pill language as the Depositar/Retirar switch: a bordered track, and the
// selected item raised inside it.
const trackBase = 'inline-flex items-center gap-0.5 rounded-full border border-white/9 bg-field';
const track = `${trackBase} p-1`;
const sizeTrack = `${trackBase} p-0.5`;
// Size lives outside the base: two h-* utilities on one element conflict and the
// winner depends on stylesheet order, not class order.
const itemBase =
  'relative inline-grid cursor-pointer touch-manipulation place-items-center rounded-full font-semibold tabular-nums text-muted transition-colors duration-150 after:absolute enabled:hover:text-cream disabled:cursor-not-allowed disabled:opacity-35';
// The invisible ::after extends the tap target to ~44px without changing the look.
const item = `${itemBase} h-9 min-w-9 px-2 text-sm after:-inset-1`;
const sizeItem = `${itemBase} h-7 min-w-8 px-2 text-xs after:-inset-x-0.5 after:-inset-y-2`;
const selected = 'bg-raised text-cream shadow-[0_0_0_1px_rgb(255_255_255/16%)]';

export function Pagination({ page, pageSize, total, totalPages, disabled, onPageChange, onPageSizeChange }: Props) {
  // Fewer numbers on narrow screens so the control always fits on one line.
  const wide = useMediaQuery('(min-width: 640px)');
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      className="mt-4 flex flex-col-reverse items-center gap-3 border-t border-white/9 pt-4 sm:flex-row sm:justify-between"
      aria-label="Paginación de movimientos"
    >
      <div className="flex items-center gap-3 text-sm text-muted">
        <p aria-live="polite">
          <span className="font-semibold text-cream tabular-nums">
            {first}–{last}
          </span>{' '}
          de <span className="tabular-nums">{total}</span>
        </p>
        <span className="h-4 w-px bg-white/9" aria-hidden="true" />
        <div className="flex items-center gap-2" role="group" aria-label="Movimientos por página">
          <span aria-hidden="true">Ver</span>
          <div className={sizeTrack}>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                type="button"
                className={`${sizeItem} ${size === pageSize ? selected : ''}`}
                aria-pressed={size === pageSize}
                aria-label={`${String(size)} por página`}
                disabled={disabled}
                onClick={() => {
                  if (size !== pageSize) onPageSizeChange(size);
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {totalPages > 1 && (
        <div className={track}>
          <button
            type="button"
            className={item}
            onClick={() => {
              onPageChange(page - 1);
            }}
            disabled={disabled || page <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft className={icon} aria-hidden="true" />
          </button>

          {pageItems(page, totalPages, wide ? 1 : 0).map((entry, i) =>
            entry === 'gap' ? (
              <span key={`gap-${String(i)}`} className="w-5 text-center text-sm text-muted" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                className={`${item} ${entry === page ? selected : ''}`}
                onClick={() => {
                  onPageChange(entry);
                }}
                disabled={disabled}
                aria-label={`Página ${String(entry)}`}
                aria-current={entry === page ? 'page' : undefined}
              >
                {entry}
              </button>
            ),
          )}

          <button
            type="button"
            className={item}
            onClick={() => {
              onPageChange(page + 1);
            }}
            disabled={disabled || page >= totalPages}
            aria-label="Página siguiente"
          >
            <ChevronRight className={icon} aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
