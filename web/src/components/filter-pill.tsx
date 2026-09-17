import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Filter-/Auswahl-Pille: 24 px hoch, rund, Mono-Micro — dieselbe Form wie die
 * Chart-Zeiträume und die News-Badges. Aus Kalender.tsx herausgezogen, damit
 * neue Filter dieselbe Pille benutzen statt einer nachgebauten.
 */
export function FilterPill({
  aktiv,
  onClick,
  title,
  children,
}: {
  aktiv: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={aktiv}
      className={cn(
        'flex h-control-xs cursor-pointer items-center gap-1.5 rounded-full border px-3 font-mono text-micro transition-colors',
        aktiv
          // Sterne im aktiven Pill mitfärben, sonst leuchten sie auf dem Hellblau
          ? 'border-accent bg-accent font-semibold text-[#0b1524] [&_.stern]:text-[#0b1524] [&_.stern-leer]:text-[#0b1524]/35'
          : 'border-line-strong text-ink2 hover:border-ink3 hover:bg-panel2 hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}
