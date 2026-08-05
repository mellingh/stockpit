import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Gekappter Scrollbereich nach Best Practice (Micha, Runde 34):
 * - fester Innenabstand rechts (pr-2.5), damit die Scrollleiste NIE über
 *   Werten/Text liegt (vorher stand sie über den Kurszielen der Historie)
 * - Fade-Out am unteren Rand, solange weiterer Inhalt folgt — die letzte
 *   sichtbare Zeile wirkt nicht mehr „abgehackt", sondern signalisiert
 *   klar „hier geht es weiter" (Muster wie bei Linear/Notion-Listen)
 * - Fade verschwindet, sobald ganz nach unten gescrollt ist oder alles passt
 */
export function ScrollListe({
  className,
  children,
}: {
  /** max-h-… hier hereinreichen */
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mehrUnten, setMehrUnten] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pruefen = () => setMehrUnten(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    pruefen();
    el.addEventListener('scroll', pruefen, { passive: true });
    const ro = new ResizeObserver(pruefen);
    ro.observe(el);
    // Inhalt kann nachladen (Query-Refetch) — auch darauf reagieren
    const mo = new MutationObserver(pruefen);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', pruefen);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div ref={ref} className={cn('scroll-dezent overflow-y-auto pr-2.5', className)}>
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-12 transition-opacity duration-200',
          mehrUnten ? 'opacity-100' : 'opacity-0'
        )}
        style={{ background: 'linear-gradient(to top, var(--color-panel), transparent)' }}
      />
    </div>
  );
}
