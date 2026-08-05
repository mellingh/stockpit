import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Panel, Empty } from '@/components/panel';
import { SkeletonRows } from '@/components/ui/skeleton';
import { BulletListe } from '@/components/news';
import { useSearchParams, useSetParam } from '@/lib/router';
import { useEarnings, useFeiertage, useIpos, useKalender } from '@/lib/queries';
import { erklaerungFuer, flagge } from '@/lib/event-lexikon';
import type { KalenderEvent } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fmtCompact, fmtNum } from '@/lib/format';

const IMPACT: Record<string, { n: number; label: string }> = {
  High: { n: 3, label: 'hohe Marktwirkung' },
  Medium: { n: 2, label: 'mittlere Marktwirkung' },
  Low: { n: 1, label: 'geringe Marktwirkung' },
};

/**
 * Marktwirkung als drei Sterne (investing.com-Optik, 16 px):
 * drei Sterne = Rot (Micha, Runde 10), ein/zwei = Gold, ungefüllte dezent grau.
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

function EventZeile({ e, autoOffen = false }: { e: KalenderEvent; autoOffen?: boolean }) {
  const [offen, setOffen] = useState(autoOffen);
  const zeileRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    // Deep-Link vom Dashboard: Zeile schon aufgeklappt ins Bild holen
    if (autoOffen) zeileRef.current?.scrollIntoView({ block: 'center' });
  }, [autoOffen]);
  const zeit = new Date(e.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const aktuellCls =
    e.aktuellTrend === 'gut' ? 'text-up' : e.aktuellTrend === 'schlecht' ? 'text-down' : '';

  // Festes Schema (Micha, Runde 17): 1. Bullet = was der Termin misst, dann
  // maximal zwei Deutungs-Sätze — mehr nicht. Die Devisen-Faustregel kommt als
  // abgesetzter Schlusssatz darunter (das Entscheidende zum Mitnehmen), und die
  // Ergebnis-Zeile ist raus — Ist/Prognose stehen ja rechts in der Tabelle.
  const { punkte, faustregel } = useMemo(() => {
    if (!offen) return { punkte: [] as string[], faustregel: null as string | null };
    const erk = erklaerungFuer(e.titel);
    const punkte = [
      erk.was,
      ...erk.deutung.split(/(?<=\.)\s+(?=[A-ZÄÖÜ„"])/).filter(Boolean).slice(0, 2),
    ];
    const faustregel =
      erk.richtung && e.waehrung
        ? erk.richtung === 'hoch-gut'
          ? `Fällt der Wert höher aus als erwartet, stärkt das in der Regel die Landeswährung (${e.waehrung}); wird die Prognose deutlich verfehlt, schwächt es sie.`
          : `Fällt der Wert niedriger aus als erwartet, gilt das als positiv für die Landeswährung (${e.waehrung}); ein deutlich höherer Wert schwächt sie.`
        : null;
    return { punkte, faustregel };
  }, [offen, e]);

  return (
    <Fragment>
      <tr
        ref={zeileRef}
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
        <td className="py-2.5 pr-3 text-small font-medium text-ink">
          {e.titel}
          {/* Aufklapp-Indikator: ohne ihn sieht man der Zeile nicht an, dass sie klickbar ist */}
          {offen ? (
            <ChevronUp size={13} aria-hidden className="ml-1.5 inline-block shrink-0 text-ink3" />
          ) : (
            <ChevronDown size={13} aria-hidden className="ml-1.5 inline-block shrink-0 text-ink3" />
          )}
        </td>
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
          <td colSpan={7} className="px-0 py-2.5">
            <BulletListe
              punkte={punkte}
              schluss={
                faustregel && (
                  <p>
                    <b className="text-ink">Devisen-Faustregel:</b> {faustregel}
                  </p>
                )
              }
            />
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

// ---------- Tabs (Aufbau wie der Wirtschaftskalender, nur andere Daten) ----------

const TABS = [
  ['wk', 'Wirtschaftskalender'],
  ['earnings', 'Earnings'],
  ['feiertage', 'Börsenfeiertage'],
  ['ipos', 'IPOs'],
] as const;

// Die fünf wichtigsten Aktienmärkte (gleiche Auswahl wie der Server)
const MAERKTE = [
  ['us', 'USA'],
  ['de', 'Deutschland'],
  ['uk', 'UK'],
  ['jp', 'Japan'],
  ['ca', 'Kanada'],
] as const;

const isoTag = (offset: number, endeDesTages = false) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (endeDesTages) d.setHours(23, 59, 59, 0);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/** Zeitfenster je Tages-Pill (gleiche Pills wie der Wirtschaftskalender) */
function zeitfenster(tag: string): [string, string] {
  if (tag === 'gestern') return [isoTag(-1), isoTag(-1, true)];
  if (tag === 'morgen') return [isoTag(1), isoTag(1, true)];
  if (tag === 'woche') return [isoTag(0), isoTag(7, true)];
  return [isoTag(0), isoTag(0, true)];
}

const THKopf = ({ className, ...p }: React.ComponentProps<'th'>) => (
  <th className={cn('pb-2.5 text-left text-micro font-bold uppercase tracking-[0.14em] text-ink3', className)} {...p} />
);

function TagesPills({ tag, setTag }: { tag: string; setTag: (v: string) => void }) {
  return (
    <>
      {TAGE.map(([key, label]) => (
        <FilterPill key={key} aktiv={tag === key} onClick={() => setTag(key)}>
          {label}
        </FilterPill>
      ))}
    </>
  );
}

function EarningsTab({ tag, setTag }: { tag: string; setTag: (v: string) => void }) {
  const params = useSearchParams();
  const setParam = useSetParam();
  const navigate = useNavigate();
  const markt = params.get('markt') ?? 'us';
  const setMarkt = (v: string) => setParam('markt', v === 'us' ? null : v);
  const [suche, setSuche] = useState('');
  const [von, bis] = zeitfenster(tag);
  const { data, isLoading, error } = useEarnings(markt, von, bis);

  const events = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const alle = data?.events ?? [];
    if (!q) return alle;
    return alle.filter((e) => e.ticker.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }, [data, suche]);

  const heuteKey = dayKey(new Date());
  let letzterTag: string | null = null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <TagesPills tag={tag} setTag={setTag} />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {MAERKTE.map(([key, label]) => (
            <FilterPill key={key} aktiv={markt === key} onClick={() => setMarkt(key)}>
              {label}
            </FilterPill>
          ))}
        </div>
      </div>
      {/* gleiche Optik wie die anderen Suchfelder: Lupe links, 32er-Reihe, Basis-Schrift.
          Die Liste filtert live beim Tippen — das sind die "Vorschläge". */}
      <div className="relative mb-4 max-w-[300px]">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3"
        />
        <Input
          className="h-control-sm pl-9"
          placeholder="Symbol oder Name suchen …"
          aria-label="Earnings nach Symbol oder Name filtern"
          autoComplete="off"
          spellCheck={false}
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>
      {isLoading && (
        <div role="status" aria-label="Earnings werden geladen">
          <SkeletonRows zeilen={8} />
        </div>
      )}
      {error && <Empty role="status" aria-live="polite">Earnings nicht erreichbar: {(error as Error).message}</Empty>}
      {data &&
        (events.length === 0 ? (
          <Empty>Keine Quartalszahlen-Termine in diesem Zeitraum{suche ? ' mit diesem Filter' : ''}.</Empty>
        ) : (
          <table className="lange-liste w-full border-collapse">
            <thead>
              <tr>
                <THKopf className="w-[96px]">Datum</THKopf>
                <THKopf>Wert</THKopf>
                <THKopf className="cursor-help text-right" title="Erwarteter Gewinn je Aktie (in der Landeswährung der Börse)">EPS erw.</THKopf>
                <THKopf className="cursor-help text-right" title="Gemeldeter Gewinn je Aktie">Ist</THKopf>
                <THKopf className="cursor-help text-right" title="Überraschung: Abweichung des Ist vom erwarteten EPS in Prozent">Überr.</THKopf>
                <THKopf className="cursor-help text-right" title="Marktkapitalisierung — Börsenwert aller Aktien">Market Cap</THKopf>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => {
                const key = dayKey(e.zeit);
                const separator =
                  tag === 'woche' && key !== letzterTag ? (
                    <tr key={`sep-${key}`} className="border-b border-line">
                      <td colSpan={6} className="pb-1.5 pt-4 text-micro font-bold uppercase tracking-[0.14em] text-accent">
                        {new Date(e.zeit).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {key === heuteKey ? ' — heute' : ''}
                      </td>
                    </tr>
                  ) : null;
                letzterTag = key;
                const ueb = e.ueberraschungPct;
                return (
                  <Fragment key={`${e.ticker}-${e.zeit}-${i}`}>
                    {separator}
                    <tr
                      onClick={() => navigate(`/analyse?symbol=${encodeURIComponent(e.yahooSymbol)}`)}
                      className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-panel2"
                    >
                      <td className="py-2.5 font-mono text-micro text-ink3 tnum">
                        {new Date(e.zeit).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="text-small font-medium text-ink">{e.name}</span>
                        <span className="ml-2 font-mono text-micro text-ink3">{e.ticker}</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-small text-ink2 tnum">
                        {e.epsErwartet != null ? fmtNum(e.epsErwartet) : '–'}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 text-right font-mono text-small tnum',
                          ueb != null && ueb > 0 ? 'text-up' : ueb != null && ueb < 0 ? 'text-down' : 'text-ink2'
                        )}
                      >
                        {e.epsIst != null ? fmtNum(e.epsIst) : '–'}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 text-right font-mono text-small tnum',
                          ueb != null && ueb > 0 ? 'text-up' : ueb != null && ueb < 0 ? 'text-down' : 'text-ink3'
                        )}
                      >
                        {ueb != null ? `${ueb > 0 ? '+' : ''}${fmtNum(ueb)} %` : '–'}
                      </td>
                      <td className="py-2.5 text-right font-mono text-small text-ink2 tnum">
                        {e.marketCap != null ? fmtCompact(e.marketCap) : '–'}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ))}
    </>
  );
}

function FeiertageTab() {
  const { data, isLoading, error } = useFeiertage();
  return (
    <>
      {isLoading && (
        <div role="status" aria-label="Feiertage werden geladen">
          <SkeletonRows zeilen={5} />
        </div>
      )}
      {error && <Empty role="status" aria-live="polite">Feiertage nicht erreichbar: {(error as Error).message}</Empty>}
      {data &&
        (data.events.length === 0 ? (
          <Empty>Keine Börsenfeiertage mehr bis Jahresende.</Empty>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <THKopf className="w-[120px]">Datum</THKopf>
                <THKopf className="w-[90px]">Land</THKopf>
                <THKopf>Börse</THKopf>
                <THKopf>Feiertag</THKopf>
              </tr>
            </thead>
            <tbody>
              {data.events.map((f, i) => (
                <tr key={`${f.land}-${f.zeit}-${i}`} className="border-b border-line last:border-b-0">
                  {/* gleiche Optik wie die Zeit-Spalte im Wirtschaftskalender (Konstanz) */}
                  <td className="py-2.5 font-mono text-micro text-ink3 tnum">
                    {new Date(f.zeit).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-small">
                    <span className="mr-1.5 text-lg leading-none">{flagge(f.land)}</span>
                    {f.land ?? '–'}
                  </td>
                  <td className="py-2.5 pr-3 text-small text-ink2">{f.boerse ?? '–'}</td>
                  <td className="py-2.5 text-small font-medium text-ink">{f.titel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      <p className="mt-4 text-micro text-ink3">
        Handel an der jeweiligen Börse ruht · Liste bis Jahresende (fest hinterlegter Handelskalender).
      </p>
    </>
  );
}

function IposTab() {
  const { data, isLoading, error } = useIpos();
  return (
    <>
      {isLoading && (
        <div role="status" aria-label="IPOs werden geladen">
          <SkeletonRows zeilen={5} />
        </div>
      )}
      {error && <Empty role="status" aria-live="polite">IPOs nicht erreichbar: {(error as Error).message}</Empty>}
      {data &&
        (data.events.length === 0 ? (
          <Empty>Keine Börsengänge im laufenden und nächsten Monat gelistet.</Empty>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <THKopf className="w-[96px]">Datum</THKopf>
                {/* Spalten wie beim investing.com-IPO-Kalender: Firma | Börse | IPO-Wert | Preis */}
                <THKopf>Firma</THKopf>
                <THKopf>Börse</THKopf>
                <THKopf className="cursor-help text-right" title="Gesamtwert der angebotenen Aktien (Emissionsvolumen)">
                  IPO-Wert
                </THKopf>
                <THKopf
                  className="cursor-help text-right"
                  title="Bei geplanten IPOs der vorgesehene Ausgabepreis bzw. die Spanne — der kann sich bis zur Preisfestsetzung noch ändern. Final ist der Preis erst mit Status „abgeschlossen“."
                >
                  Preis ($)
                </THKopf>
                <THKopf className="text-right">Status</THKopf>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e, i) => (
                <tr key={`${e.symbol}-${i}`} className="border-b border-line last:border-b-0">
                  <td className="py-2.5 font-mono text-micro text-ink3 tnum">
                    {e.zeit ? new Date(e.zeit).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '–'}
                  </td>
                  <td className="py-2.5 pr-3">
                    {/* Flagge vor der Firma wie bei investing */}
                    <span className="mr-1.5 text-lg leading-none">{flagge(e.land ?? 'US')}</span>
                    <span className="text-small font-medium text-ink">{e.firma ?? '–'}</span>
                    {e.symbol && <span className="ml-2 font-mono text-micro text-ink3">{e.symbol}</span>}
                  </td>
                  <td className="py-2.5 text-small text-ink2">{e.boerse ?? '–'}</td>
                  <td className="py-2.5 text-right font-mono text-small text-ink2 tnum">
                    {e.volumenUsd != null ? `${fmtCompact(e.volumenUsd)} $` : '–'}
                  </td>
                  {/* Spannen mit SCHMALER Luft um den Bindestrich (U+2009): volle
                      Leerzeichen waren zu viel, gar keine zu eng (Micha, Runde 26/27) */}
                  <td className="py-2.5 text-right font-mono text-small text-ink2 tnum">
                    {e.preis ? e.preis.replace(/(\d)\s*[-–]\s*(\d)/, '$1 – $2') : '–'}
                  </td>
                  <td className="py-2.5 text-right">
                    {/* Anzeige-Wording statt der API-Werte gepreist/erwartet (Micha, Runde 25):
                        „abgeschlossen“ = Ausgabepreis final festgesetzt, „geplant“ = Termin steht,
                        Preis ist noch der Vorschlag/die Spanne */}
                    <Badge
                      variant={e.status === 'gepreist' ? 'pos' : 'neu'}
                      title={e.status === 'gepreist' ? 'Ausgabepreis wurde final festgesetzt' : 'Termin steht — Preis kann sich bis zur Festsetzung noch ändern'}
                    >
                      {e.status === 'gepreist' ? 'abgeschlossen' : 'geplant'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      <p className="mt-4 text-micro text-ink3">Frisch abgeschlossene und geplante Börsengänge — terminlose Anmeldungen erscheinen erst mit festem Datum.</p>
    </>
  );
}

export default function KalenderPage() {
  const { data, isLoading, error } = useKalender();
  // Filter stehen in der URL: teilbar, überlebt F5, Zurück-Button funktioniert
  const params = useSearchParams();
  const setParam = useSetParam();
  const tab = params.get('tab') ?? 'wk';
  const setTab = (v: string) => setParam('tab', v === 'wk' ? null : v);
  const tag = params.get('tag') ?? 'heute';
  // Deep-Link vom Dashboard: ?event=<zeit>~<titel> klappt den Termin auf
  const eventKey = params.get('event');
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
        <h1 className="mt-1.5 font-display text-display-md font-bold tracking-tight text-balance">
          Was den Markt <em className="not-italic text-accent">bewegt.</em>
        </h1>
      </header>

      {/* Tab-Leiste: Unterstrich-Stil wie die Topbar-Navigation (Konstanz) */}
      <div className="flex items-center gap-1 border-b border-line animate-rise" style={{ animationDelay: '40ms' }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'relative flex h-control-md cursor-pointer items-center px-3.5 text-base font-medium transition-colors',
              tab === key
                ? 'text-ink after:absolute after:inset-x-3.5 after:bottom-[-1px] after:h-[2px] after:bg-accent'
                : 'text-ink2 hover:text-ink'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Panel className="animate-rise" style={{ animationDelay: '70ms' }}>
        {tab === 'earnings' && <EarningsTab tag={tag} setTag={setTag} />}
        {tab === 'feiertage' && <FeiertageTab />}
        {tab === 'ipos' && <IposTab />}
        {tab === 'wk' && (
          <>
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
                      {/* Schlüssel inkl. Land — dieselbe Kennzahl kann am selben
                          Tag in mehreren Ländern erscheinen (US + CA) */}
                      <EventZeile e={e} autoOffen={eventKey === `${e.zeit}~${e.titel}~${e.land ?? ''}`} />
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ))}
          </>
        )}
      </Panel>

      <p className="text-center text-micro text-ink3">
        Zeiten in deiner lokalen Zeitzone · „Aktuell"/„Ist" grün/rot = besser/schlechter als Prognose · Alle Angaben
        ohne Gewähr — keine Anlageberatung.
      </p>
    </div>
  );
}
