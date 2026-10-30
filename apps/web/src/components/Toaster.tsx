import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { icon } from '../ui/classes';

// Sonner reads its colors from CSS variables; map them to the app palette.
const palette = {
  '--normal-bg': 'var(--color-raised)',
  '--normal-border': 'rgb(255 255 255 / 12%)',
  '--normal-text': 'var(--color-cream)',
  '--success-bg': 'color-mix(in srgb, var(--color-success) 12%, var(--color-surface))',
  '--success-border': 'color-mix(in srgb, var(--color-success) 35%, transparent)',
  '--success-text': 'var(--color-success)',
  '--error-bg': 'color-mix(in srgb, var(--color-danger) 12%, var(--color-surface))',
  '--error-border': 'color-mix(in srgb, var(--color-danger) 35%, transparent)',
  '--error-text': 'var(--color-danger)',
  '--border-radius': '14px',
} as CSSProperties;

export function Toaster() {
  // Desktop: the empty corner under the content, never over the header or the history.
  // Mobile: bottom, in thumb reach, away from the balance at the top.
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <SonnerToaster
      theme="dark"
      position={isDesktop ? 'bottom-right' : 'bottom-center'}
      richColors
      closeButton
      style={palette}
      containerAriaLabel="Notificaciones"
      icons={{
        success: <CircleCheck className={icon} aria-hidden="true" />,
        error: <CircleAlert className={icon} aria-hidden="true" />,
        info: <Info className={icon} aria-hidden="true" />,
      }}
      toastOptions={{
        closeButtonAriaLabel: 'Cerrar notificación',
        classNames: {
          toast: 'font-sans! text-[0.9375rem]! shadow-[0_12px_32px_rgb(0_0_0/45%)]!',
          actionButton: 'bg-brand! text-ink! font-semibold! rounded-full! px-3!',
        },
      }}
    />
  );
}
