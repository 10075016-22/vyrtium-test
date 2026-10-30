// Shared Tailwind class sets for the few patterns repeated across components.

export const icon = 'size-[18px] shrink-0';

export const card = [
  'relative rounded-[20px] border border-white/9 bg-surface/85 p-6 backdrop-blur-sm',
  'shadow-[inset_0_1px_0_rgb(255_255_255/4%),0_12px_32px_rgb(0_0_0/35%)]',
  // Thin teal highlight along the top edge.
  'before:pointer-events-none before:absolute before:-top-px before:left-1/2 before:h-px before:w-3/5',
  'before:-translate-x-1/2 before:bg-linear-to-r before:from-transparent before:via-brand-bright/35 before:to-transparent',
].join(' ');

export const cardTitle = 'mb-4 flex items-center gap-2 text-base font-semibold [&>svg]:text-brand';

// Horizontal padding lives in each variant, never in the base: two px-* utilities on
// one element conflict and the winner depends on stylesheet order, not class order.
const buttonBase =
  'inline-flex min-h-11 cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-full border py-2 font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55';

const secondaryLook =
  'border-white/16 bg-transparent text-cream enabled:hover:border-brand enabled:hover:text-brand-bright';

export const button = {
  primary: `${buttonBase} border-transparent bg-brand px-6 text-ink enabled:hover:bg-brand-bright`,
  secondary: `${buttonBase} ${secondaryLook} px-6`,
  compact: `${buttonBase} ${secondaryLook} px-3`,
  ghost: `${buttonBase} border-transparent bg-transparent px-3 text-muted hover:text-cream`,
};

export const field = 'grid gap-1';
export const label = 'text-[0.9375rem] font-semibold';
export const input = [
  'min-h-11 w-full rounded-[10px] border border-white/16 bg-field px-3 py-2 text-cream transition-colors',
  'placeholder:text-placeholder hover:border-white/24',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:outline-danger',
].join(' ');
export const fieldHelp = 'text-sm text-muted';
export const fieldError = 'animate-enter-down text-sm font-medium text-danger';

export const skeleton = 'animate-pulse rounded-[10px] bg-skeleton';

export const stateTitle = 'flex items-center gap-2 font-semibold';
