import { cn } from '@/lib/utils';

/**
 * Ladeplatzhalter. Statt einer leeren Fläche wird das Grundgerüst der späteren
 * Inhalte gezeigt (Zeilenhöhen, Spaltenbreiten) — dadurch springt das Layout
 * beim Eintreffen der Daten nicht. Schimmer-Animation kommt aus `.skelett`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden className={cn('skelett rounded-md', className)} {...props} />;
}

/** Mehrere Textzeilen unterschiedlicher Länge (letzte kürzer, wie echter Text) */
function SkeletonText({
  zeilen = 3,
  className,
}: {
  zeilen?: number;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      {Array.from({ length: zeilen }, (_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: i === zeilen - 1 ? '58%' : `${92 - i * 7}%` }}
        />
      ))}
    </div>
  );
}

/** Tabellenzeilen mit Trennlinien — für Positionen, Termine, Kalender */
function SkeletonRows({
  zeilen = 5,
  hoehe = 'h-4',
  className,
}: {
  zeilen?: number;
  hoehe?: string;
  className?: string;
}) {
  return (
    <div className={cn('grid', className)}>
      {Array.from({ length: zeilen }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
          <Skeleton className={cn(hoehe, 'w-[68px] shrink-0')} />
          <Skeleton className={cn(hoehe, 'flex-1')} style={{ maxWidth: `${58 + ((i * 13) % 30)}%` }} />
          <Skeleton className={cn(hoehe, 'w-[52px] shrink-0')} />
        </div>
      ))}
    </div>
  );
}

/** Pill-Reihe — für Trend-Vorschläge, Links, Chips */
function SkeletonPills({ anzahl = 6, className }: { anzahl?: number; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {Array.from({ length: anzahl }, (_, i) => (
        <Skeleton key={i} className="h-8 rounded-full" style={{ width: `${86 + ((i * 17) % 46)}px` }} />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonRows, SkeletonPills };
