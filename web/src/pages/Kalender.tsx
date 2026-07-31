import { Fragment, useMemo, useState } from 'react';
import { Panel, Empty } from '@/components/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { BulletListe } from '@/components/news';
import { useKalender } from '@/lib/queries';
import { erklaerungFuer, flagge } from '@/lib/event-lexikon';
import type { KalenderEvent } from '@/lib/api';
import { cn } from '@/lib/utils';

const IMPACT: Record<string, { stars: string; cls: string; label: string }> = {
  High: { stars: '★★★', cls: 'text-warn', label: 'hohe Marktwirkung' },
  Medium: { stars: '★★☆', cls: 'text-ink2', label: 'mittlere Marktwirkung' },
  Low: { stars: '★☆☆', cls: 'text-ink3', label: 'geringe Marktwirkung' },
};

const TAGE = [
  ['gestern', 'Gestern'],
  ['heute', 'Heute'],
  ['morgen', 'Morgen'],
  ['woche', 'Diese Woche'],
] as const;
const WICHTIGKEIT = [
  ['high', '★★★'],
  ['med', '★★☆+'],
  ['all', 'Alle'],
] as const;

const dayKey = (d: string | Date) => new Date(d).toLocaleDateString('de-DE');
const offsetDay = (n: number) => dayKey(new Date(Date.now() + n * 86400000));

function FilterPill({
  aktiv,
  onClick,
  children,
}: {
  aktiv: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-7 cursor-pointer rounded-md border px-3 font-mono text-[11.5px] transition-colors',
        aktiv
          ? 'border-accent bg-accent font-semibold text-[#0b1524]'
          : 'border-line-strong text-ink2 hover:border-ink3 hover:bg-panel2 hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}

function EventZeile({ e }: { e: KalenderEvent }) {
  const [offen, setOffen] = useState(false);
  const imp = IMPACT[e.wichtigkeit] ?? IMPACT.Low;
  const zeit = new Date(e.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const aktuellCls =
    e.aktuellTrend === 'gut' ? 'text-up' : e.aktuellTrend === 'schlecht' ? 'text-down' : '';

  const punkte = useMemo(() => {
    if (!offen) return [];
    const erk = erklaerungFuer(e.titel);
    const liste: string[] = [
      erk.was,
      ...erk.deutung.split(/(?<=\.)\s+(?=[A-ZÄÖÜ„"])/).filter(Boolean),
    ];
    if (erk.richtung && e.waehrung) {
      liste.push(
        erk.richtung === 'hoch-gut'
          ? `Devisen-Faustregel: Fällt der Wert höher aus als erwartet, führt das in der Regel zu einem steigenden Kurs der Landeswährung (${e.waehrung}); wird die Prognose deutlich verfehlt, schwächt das die Währung.`
          : `Devisen-Faustregel: Fällt der Wert niedriger aus als erwartet, gilt das als positiv für die Landeswährung (${e.waehrung}); ein deutlich höherer Wert schwächt sie.`
      );
    }
    if (e.aktuell) {
      liste.push(
        `Ergebnis: ${e.aktuell} vs. Prognose ${e.prognose ?? '–'}${
          e.aktuellTrend ? ` — ${e.aktuellTrend === 'gut' ? 'besser' : 'schlechter'} als erwartet` : ''
        }.`
      );
    }
    return liste;
  }, [offen, e]);

  return (
    <Fragment>
      <tr
        onClick={() => setOffen(!offen)}
        title="Klick: Was bedeutet dieser Termin?"
        className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-panel2"
      >
        <td className="w-[56px] py-2.5 font-mono text-[12px] text-ink3 tnum">{zeit}</td>
        <td className="w-[86px] whitespace-nowrap py-2.5 text-[13px]" title={e.waehrung ?? ''}>
          <span className="mr-1.5 text-[15px] leading-none">{flagge(e.land)}</span>
          {e.land ?? e.waehrung ?? '–'}
        </td>
        <td className="w-[62px] py-2.5">
          <span className={cn('text-[11px] tracking-widest', imp.cls)} title={imp.label}>
            {imp.stars}
          </span>
        </td>
        <td className="py-2.5 pr-3 text-[13.5px] font-medium text-ink">{e.titel}</td>
        <td
          className={cn('py-2.5 text-right font-mono text-[12.5px] tnum', aktuellCls)}
          title={e.aktuellTrend ? `${e.aktuellTrend === 'gut' ? 'besser' : 'schlechter'} als Prognose` : ''}
        >
          {e.aktuell ?? '–'}
        </td>
        <td className="py-2.5 text-right font-mono text-[12.5px] text-ink2 tnum">{e.prognose ?? '–'}</td>
        <td className="py-2.5 text-right font-mono text-[12.5px] text-ink3 tnum">{e.vorher ?? '–'}</td>
      </tr>
      {offen && (
        <tr className="border-b border-line last:border-b-0">
          <td colSpan={7} className="px-2 pb-3 pt-1">
            <BulletListe punkte={punkte} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function KalenderPage() {
  const { data, isLoading, error } = useKalender();
  const [tag, setTag] = useState<string>('heute');
  const [imp, setImp] = useState<string>('all');

  const events = useMemo(() => {
    if (!data) return [];
    return data.events.filter((e) => {
      if (imp === 'high' && e.wichtigkeit !== 'High') return false;
      if (imp === 'med' && e.wichtigkeit === 'Low') return false;
      if (tag === 'woche') return true;
      const ziel = { gestern: offsetDay(-1), heute: offsetDay(0), morgen: offsetDay(1) }[tag];
      return dayKey(e.zeit) === ziel;
    });
  }, [data, tag, imp]);

  const heuteKey = dayKey(new Date());
  let letzterTag: string | null = null;

  return (
    <div className="grid gap-5">
      <header className="animate-rise">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] text-ink3">
          Wirtschaftskalender · diese Woche
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <h1 className="mt-1.5 font-display text-[clamp(26px,3.4vw,38px)] font-bold tracking-tight text-balance">
          Was den Markt <em className="not-italic text-accent">bewegt.</em>
        </h1>
      </header>

      <Panel className="animate-rise" style={{ animationDelay: '70ms' }}>
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {TAGE.map(([key, label]) => (
            <FilterPill key={key} aktiv={tag === key} onClick={() => setTag(key)}>
              {label}
            </FilterPill>
          ))}
          <span className="mx-2 h-4 w-px bg-line-strong" />
          {WICHTIGKEIT.map(([key, label]) => (
            <FilterPill key={key} aktiv={imp === key} onClick={() => setImp(key)}>
              {label}
            </FilterPill>
          ))}
        </div>

        {isLoading && <Skeleton className="h-[320px]" aria-label="Kalender wird geladen" />}
        {error && <Empty role="status" aria-live="polite">Kalender nicht erreichbar: {(error as Error).message}</Empty>}
        {data &&
          (events.length === 0 ? (
            <Empty>
              <b className="mb-1 block text-[14px] text-ink2">Keine Termine mit diesen Filtern.</b>
              Tipp: „Diese Woche" wählen oder die Wichtigkeit auf „Alle" stellen.
            </Empty>
          ) : (
            <table className="lange-liste w-full border-collapse">
              <thead>
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.13em] text-ink3">
                  <th className="pb-2.5">Zeit</th>
                  <th className="pb-2.5">Land</th>
                  <th className="pb-2.5">Relev.</th>
                  <th className="pb-2.5">Termin</th>
                  <th className="pb-2.5 text-right">Aktuell</th>
                  <th className="pb-2.5 text-right">Prognose</th>
                  <th className="pb-2.5 text-right">Vorherig</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => {
                  const key = dayKey(e.zeit);
                  const separator =
                    tag === 'woche' && key !== letzterTag ? (
                      <tr key={`sep-${key}`} className="border-b border-line">
                        <td colSpan={7} className="pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-[0.13em] text-accent">
                          {new Date(e.zeit).toLocaleDateString('de-DE', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          })}
                          {key === heuteKey ? ' — heute' : ''}
                        </td>
                      </tr>
                    ) : null;
                  letzterTag = key;
                  return (
                    <Fragment key={`${e.titel}-${e.zeit}-${i}`}>
                      {separator}
                      <EventZeile e={e} />
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ))}
      </Panel>

      <p className="text-center text-[12px] text-ink3">
        Zeiten in deiner lokalen Zeitzone · „Aktuell" grün/rot = besser/schlechter als Prognose · Alle Angaben ohne
        Gewähr — keine Anlageberatung.
      </p>
    </div>
  );
}
