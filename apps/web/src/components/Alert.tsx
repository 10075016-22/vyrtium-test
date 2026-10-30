import { CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { icon } from '../ui/classes';

type AlertKind = 'info' | 'error' | 'success';

const KINDS: Record<AlertKind, { Icon: LucideIcon; className: string }> = {
  info: { Icon: Info, className: 'border-brand/30 bg-brand/10 text-info' },
  error: { Icon: CircleAlert, className: 'border-danger/30 bg-danger/10 text-danger' },
  success: { Icon: CircleCheck, className: 'border-success/30 bg-success/10 text-success' },
};

export function Alert({ kind, role, children }: { kind: AlertKind; role: 'alert' | 'status'; children: ReactNode }) {
  const { Icon, className } = KINDS[kind];
  return (
    <div
      className={`flex animate-enter-down items-start gap-2 rounded-[10px] border px-4 py-3 text-[0.9375rem] ${className}`}
      role={role}
    >
      <Icon className={`${icon} mt-0.5`} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
