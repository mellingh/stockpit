import { Fragment, useEffect, useMemo, useState } from 'react';
import { Panel, Empty } from '@/components/panel';
import { SkeletonRows } from '@/components/ui/skeleton';
import { BulletListe } from '@/components/news';
import { useSearchParams, useSetParam } from '@/lib/router';
import { useKalender } from '@/lib/queries';
import { erklaerungFuer, flagge } from '@/lib/event-lexikon';
import type { KalenderEvent } from '@/lib/api';
import { cn } from '@/lib/utils';

const IMPACT: Record<string, { n: number; label: string }> = {
  High: { n: 3, label: 'hohe Marktwirkung' },
  Medium: { n: 2, label: 'mittlere Marktwirkung' },
  Low: { n: 1, label: 'geringe Marktwirkung' },
};

/**
 * Marktwirkung als drei Sterne (investing.com-Optik, aber größer — 15 px):
 * drei Sterne = Orangerot, ein/zwei = Gold, ungefüllte dezent grau.
 * Rot bleibt der Marktfarbe (fallende Kurse) vorbehalten.
 */
function Sterne({ wichtigkeit, klein = false }: { wichtigkeit: string; klein?: boolean }) {
  const { n, label } = IMPACT[wichtigkeit] ?? IMPACT.Low;
  const farbe = n === 3 ? 'text-hoch' : 'text-warn';
  return (
    <span
      title={label}
      aria-label={label}
      className={cn('inline-flex gap-px leading-none', klein ? 'text-small' : 'text-lg')}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden className={i < n ? `stern ${farbe}` : 'stern-leer text-line-strong'}>
          ★
        </span>
      ))}
    </span>
  );
}

const TAGE = [
  ['gestern', 'Gestern'],
  ['heute', 'Heute'],
  ['morgen', 'Morgen'],
  ['woche', 'Diese Woche'],
] as const;
// Reihenfolge nach Michas Wunsch: aufsteigende Strenge, „Alle" rechts außen
const WICHTIGKEIT = [
  ['med', 'Medium'],
  ['high', 'High'],
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
        'flex h-control-sm cursor-pointer items-center gap-1.5 rounded-md border px-3 font-mono text-micro transition-colors',
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

function EventZeile({ e }: { e: KalenderEvent }) {
  const [offen, setOffen] = useState(false);
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
        // Guideline: klickbare Zeilen müssen auch per Tastatur bedienbar sein
        tabIndex={0}
        role="button"
        aria-expanded={offen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOffen(!offen);
          }
        }}
        title="Klick: Was bedeutet dieser Termin?"
        className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-panel2"
      >
        <td className="w-[56px] py-2.5 font-mono text-micro text-ink3 tnum">{zeit}</td>
        <td className="w-[86px] whitespace-nowrap py-2.5 text-small" title={e.waehrung ?? ''}>
          <span className="mr-1.5 text-lg leading-none">{flagge(e.land)}</span>
          {e.land ?? e.waehrung ?? '–'}
        </td>
        <td className="w-[66px] py-2.5">
          <Sterne wichtigkeit={e.wichtigkeit} />
        </td>
        <td className="py-2.5 pr-3 text-small font-medium text-ink">{e.titel}</td>
        <td
          className={cn('py-2.5 text-right font-mono text-small tnum', aktuellCls)}
          title={e.aktuellTrend ? `${e.aktuellTrend === 'gut' ? 'besser' : 'schlechter'} als Prognose` : ''}
        >
          {e.aktuell ?? '–'}
        </td>
        <td className="py-2.5 text-right font-mono text-small text-ink2 tnum">{e.prognose ?? '–'}</td>
        <td className="py-2.5 text-right font-mono text-small text-ink3 tnum">{e.vorher ?? '–'}</td>
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

/** Uhrzeit, die sich minütlich aktualisiert — für die „jetzt"-Linie */
function useJetzt() {
  const [jetzt, setJetzt] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setJetzt(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return jetzt;
}

/** Trennlinie „hier stehen wir gerade" mit Uhrzeit (wie bei investing.com) */
function JetztLinie({ jetzt }: { jetzt: Date }) {
  return (
    <tr aria-hidden>
      <td colSpan={7} className="p-0">
        <div className="relative flex items-center gap-2 py-1.5">
          <span className="rounded border border-accent px-1.5 py-px font-mono text-micro font-semibold text-accent tnum">
            {jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="h-px flex-1 bg-accent/55" />
        </div>
      </td>
    </tr>
  );
}

export default function KalenderPage() {
  const { data, isLoading, error } = useKalender();
  // Filter stehen in der URL: teilbar, überlebt F5, Zurück-Button funktioniert
  const params = useSearchParams();
  const setParam = useSetParam();
  const tag = params.get('tag') ?? 'heute';
  const imp = params.get('relevanz') ?? 'all';
  const setTag = (v: string) => setParam('tag', v === 'heute' ? null : v);
  const setImp = (v: string) => setParam('relevanz', v === 'all' ? null : v);

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

  const jetzt = useJetzt();
  const heuteKey = dayKey(jetzt);
  let letzterTag: string | null = null;
  // Die „jetzt"-Linie kommt vor den ersten Termin, der noch aussteht (nur in
  // Ansichten, die den heutigen Tag enthalten).
  const jetztVor =
    tag === 'heute' || tag === 'woche'
      ? events.findIndex((e) => new Date(e.zeit).getTime() > jetzt.getTime())
      : -1;

  return (
    <div className="grid gap-5">
      <header className="animate-rise">
        <div className="flex items-center gap-3 font-mono text-micro uppercase tracking-[0.14em] text-ink3">
          Wirtschaftskalender
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <h1 className="mt-1.5 font-display text-[clamp(28px,3.4vw,36px)] font-bold tracking-tight text-balance">
          Was den Markt <em className="not-italic text-accent">bewegt.</em>
        </h1>
      </header>

      <Panel className="animate-rise" style={{ animationDelay: '70ms' }}>
        {/* Zeitraum links, Relevanz rechtsbündig — kein Trennstrich (Micha) */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {TAGE.map(([key, label]) => (
            <FilterPill key={key} aktiv={tag === key} onClick={() => setTag(key)}>
              {label}
            </FilterPill>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {WICHTIGKEIT.map(([key, label]) => (
              <FilterPill key={key} aktiv={imp === key} onClick={() => setImp(key)}>
                {label === 'Alle' ? 'Alle' : <Sterne wichtigkeit={label} klein />}
                {label === 'Medium' ? <span className="opacity-60">+</span> : null}
              </FilterPill>
            ))}
          </div>
        </div>

        {isLoading && (
          <div role="status" aria-label="Kalender wird geladen">
            <SkeletonRows zeilen={9} />
          </div>
        )}
        {error && <Empty role="status" aria-live="polite">Kalender nicht erreichbar: {(error as Error).message}</Empty>}
        {data &&
          (events.length === 0 ? (
            <Empty>
              <b className="mb-1 block text-base text-ink2">Keine Termine mit diesen Filtern.</b>
              Tipp: „Diese Woche" wählen oder die Wichtigkeit auf „Alle" stellen.
            </Empty>
          ) : (
            <table className="lange-liste w-full border-collapse">
              <thead>
                <tr className="text-left text-micro font-bold uppercase tracking-[0.14em] text-ink3">
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
                        <td colSpan={7} className="pb-1.5 pt-4 text-micro font-bold uppercase tracking-[0.14em] text-accent">
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
                      {i === jetztVor && <JetztLinie jetzt={jetzt} />}
                      <EventZeile e={e} />
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ))}
      </Panel>

      <p className="text-center text-micro text-ink3">
        Zeiten in deiner lokalen Zeitzone · „Aktuell" grün/rot = besser/schlechter als Prognose · Alle Angaben ohne
        Gewähr — keine Anlageberatung.
      </p>
    </div>
  );
}
