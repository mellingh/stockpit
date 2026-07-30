import * as React from 'react';
import { cn } from '@/lib/utils';

/** Glas-Panel: Hairline-Border, Innen-Highlight oben, tiefer Schatten */
export function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'rounded-lg border border-line bg-panel p-5 shadow-panel',
        className
      )}
      {...props}
    />
  );
}

/** Panel-Überschrift mit Hairline rechts (Stockpit-Signatur) */
export function PanelTitle({
  className,
  children,
  hint,
  actions,
  ...props
}: React.ComponentProps<'h2'> & { hint?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <h2
      className={cn(
        'mb-4 flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink2',
        className
      )}
      {...props}
    >
      <span className="shrink-0">{children}</span>
      {hint ? <span className="shrink-0 font-medium normal-case tracking-normal text-ink3">{hint}</span> : null}
      <span aria-hidden className="h-px flex-1 bg-line" />
      {actions}
    </h2>
  );
}

/** Leerer Zustand innerhalb eines Panels */
export function Empty({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('py-6 text-center text-[13px] leading-relaxed text-ink3', className)}
      {...props}
    />
  );
}
