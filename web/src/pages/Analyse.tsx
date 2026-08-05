import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useSetParam } from '@/lib/router';
import { Check, Search } from 'lucide-react';
import { Panel, PanelTitle, Empty } from '@/components/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton, SkeletonPills, SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SymbolSearch } from '@/components/symbol-search';
import { lazy, Suspense } from 'react';
const StockChart = lazy(() =>
  import('@/components/stock-chart').then((m) => ({ default: m.StockChart }))
);
import { LinksCard } from '@/components/links-card';
import { RadarChart } from '@/components/radar';
import { NewsItem } from '@/components/news';
import { api, type Analyse, type Rating, type SnowflakePunkt } from '@/lib/api';
import { useAnalyse, useDashboard, useHistory, usePortfolioMutation, useTrending } from '@/lib/queries';
import { fmtCompact, fmtDate, fmtEps, fmtMoney, fmtNum, fmtPct, fmtPctFrac, signClass } from '@/lib/format';
import { cn } from '@/lib/utils';

const RANGES: [string, string][] = [
  ['1d', '1T'],
  ['1w', '1W'],
  ['1m', '1M'],
  ['6m', '6M'],
  ['1y', '1J'],
  ['5y', '5J'],
  ['max', 'Max'],
];

// ---------- Suche ----------

function SucheDialog({ onPick }: { onPick: (symbol: string) => void }) {
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOffen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button
        onClick={() => setOffen(true)}
        className="flex h-control-lg w-full max-w-[560px] cursor-pointer items-center gap-3 rounded-md border border-line-strong bg-panel px-4 text-base text-ink3 transition-colors hover:border-ink3 focus-visible:ring-2 focus-visible:ring-accent/40 outline-none"
      >
        <Search size={16} />
        Aktie oder ETF suchen …
        <kbd className="ml-auto rounded border border-line-strong bg-panel2 px-1.5 py-0.5 font-mono text-micro text-ink3">
          Strg K
        </kbd>
      </button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent ohneSchliessen className="max-w-[560px] px-3 pb-3 pt-3.5">
          <SymbolSearch
            onPick={(r) => {
              setOffen(false);
              onPick(r.symbol);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Startansicht ----------

function StartChip({
  symbol,
  name,
  tagesPct,
  onPick,
}: {
  symbol: string;
  name: string;
  tagesPct: number | null;
  onPick: (s: string) => void;
}) {
  return (
    <button
      onClick={() => onPick(symbol)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-line-strong bg-panel2 px-3.5 py-2.5 text-left text-small transition-colors duration-150 hover:border-accent hover:bg-accent-soft"
    >
      <b className="min-w-[56px] font-mono text-small">{symbol}</b>
      <span className="flex-1 truncate text-ink2">{name}</span>
      <span className={cn('shrink-0 font-mono text-small tnum', signClass(tagesPct))}>{fmtPct(tagesPct)}</span>
    </button>
  );
}

function Startansicht({ onPick }: { onPick: (s: string) => void }) {
  const { data: d } = useDashboard();
  const { data: trending, isLoading: trendLaedt } = useTrending();

  // Nach Sektor gruppiert — gleiche Gruppierung wie die Dashboard-Tabellen
  const eigene = useMemo(() => {
    if (!d) return [];
    const gesehen = new Set<string>();
    return [
      ...d.positions.map((p) => ({ symbol: p.symbol, name: p.name, tagesPct: p.tagesPct, sektor: p.sektor })),
      ...d.watchlist.map((w) => ({ symbol: w.symbol, name: w.name, tagesPct: w.tagesPct, sektor: w.sektor })),
    ]
      .filter((w) => !gesehen.has(w.symbol) && gesehen.add(w.symbol))
      .sort(
        (a, b) =>
          (a.sektor ?? 'Sonstige').localeCompare(b.sektor ?? 'Sonstige') || a.name.localeCompare(b.name)
      );
  }, [d]);

  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 animate-rise">
      <Panel>
        <PanelTitle>Deine Werte</PanelTitle>
        {!d ? (
          <SkeletonRows zeilen={4} />
        ) : eigene.length === 0 ? (
          <Empty>Noch keine Positionen oder Watchlist-Werte — im Dashboard anlegen.</Empty>
        ) : (
          <div className="grid gap-2">
            {eigene.map((w, i, arr) => (
              <Fragment key={w.symbol}>
                {(i === 0 || (arr[i - 1].sektor ?? 'Sonstige') !== (w.sektor ?? 'Sonstige')) && (
                  <div className={cn('text-micro font-bold uppercase tracking-[0.14em] text-accent', i > 0 && 'mt-4')}>
                    {w.sektor ?? 'Sonstige'}
                  </div>
                )}
                <StartChip symbol={w.symbol} name={w.name} tagesPct={w.tagesPct} onPick={onPick} />
              </Fragment>
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        <PanelTitle>Gerade im Trend</PanelTitle>
        {trendLaedt ? (
          <SkeletonRows zeilen={4} />
        ) : !trending?.length ? (
          <Empty>Gerade keine Trend-Daten verfügbar.</Empty>
        ) : (
          <div className="grid gap-2">
            {trending.map((t) => (
              <StartChip key={t.symbol} {...t} onPick={onPick} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------- Watchlist-Schnellzugriff im Report-Kopf ----------

/**
 * Sitzt oben rechts IN der Chart-Karte, in der Kurs-Zeile (Micha, Runde 26) —
 * dezent in der „Im Depot"-Chip-Optik (subtle, 32er-Reihe), kurzes Label.
 * Ein separater Button über der Seitenspalte verschob die Kachel-Oberkanten.
 */
function WatchButton({ symbol }: { symbol: string }) {
  const { data: d } = useDashboard();
  const hinzufuegen = usePortfolioMutation(() => api.post('/api/watchlist', { symbol }));
  const entfernen = usePortfolioMutation(() => api.del(`/api/watchlist/${encodeURIComponent(symbol)}`));

  const imDepot = d?.positions.some((p) => p.symbol === symbol) ?? false;
  const beobachtet = d?.watchlist.some((w) => w.symbol === symbol) ?? false;

  // Was schon im Depot liegt, muss man nicht beobachten (Watchlist-Regel):
  // gleiche Form wie der Button, aber sichtbar keine Aktion
  if (imDepot) {
    return (
      <div className="ml-auto inline-flex h-control-sm items-center gap-1.5 self-center rounded-md border border-line bg-panel2 px-3 text-small font-medium text-ink2">
        <Check size={14} aria-hidden className="text-up" /> Im Depot
      </div>
    );
  }
  if (beobachtet) {
    return (
      <Button
        variant="subtle"
        size="sm"
        className="ml-auto gap-1.5 self-center"
        title="Von der Watchlist entfernen"
        onClick={() => entfernen.mutate(undefined)}
        disabled={entfernen.isPending}
      >
        <Check size={14} aria-hidden className="text-up" /> Hinzugefügt
      </Button>
    );
  }
  return (
    <Button
      variant="subtle"
      size="sm"
      className="ml-auto self-center"
      title="Zur Watchlist hinzufügen"
      onClick={() => hinzufuegen.mutate(undefined)}
      disabled={hinzufuegen.isPending || !d}
    >
      {/* Text-Plus wie bei „+ Hinzufügen" der Links-Karte — ein Icon-Plus war
          sichtbar größer und brach die Konstanz (Micha, Runde 27) */}
      + Watchlist
    </Button>
  );
}

// ---------- Lade-Gerüst ----------

/**
 * Zeigt beim Laden die Struktur des Reports (Kopf, Chart-Karte mit Zeitraum-Pills,
 * Seitenspalte, Kennzahlen-Leiste, Panels) statt leerer Flächen — so springt beim
 * Eintreffen der Daten nichts mehr.
 */
function ReportSkelett() {
  return (
    <div className="grid gap-5" role="status" aria-label="Analyse wird geladen">
      <header className="grid gap-2.5">
        <Skeleton className="h-control-sm w-[280px]" />
        <div className="flex gap-2">
          <Skeleton className="h-control-xs w-[64px] rounded-full" />
          <Skeleton className="h-control-xs w-[78px] rounded-full" />
          <Skeleton className="h-control-xs w-[110px] rounded-full" />
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Panel className="p-4">
          <div className="mb-3 flex items-baseline gap-3 px-1">
            <Skeleton className="h-control-sm w-[130px]" />
            <Skeleton className="h-4 w-[90px]" />
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5 px-1">
            {RANGES.map(([r]) => (
              <Skeleton key={r} className="h-control-xs w-[42px]" />
            ))}
          </div>
          <Skeleton className="h-[380px] w-full" />
        </Panel>
        <Panel>
          <Skeleton className="mb-4 h-3 w-[150px]" />
          <SkeletonPills anzahl={7} />
        </Panel>
      </div>

      <Panel>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <Skeleton className="h-3 w-[92px]" />
              <Skeleton className="h-3 w-[54px]" />
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel>
          <Skeleton className="mb-4 h-3 w-[120px]" />
          <SkeletonRows zeilen={4} />
        </Panel>
        <Panel>
          <Skeleton className="mb-4 h-3 w-[140px]" />
          <SkeletonRows zeilen={4} />
        </Panel>
      </div>
    </div>
  );
}

// ---------- Quartalszahlen-Banner (nur am Meldetag) ----------

/** Ganze Kalendertage her — nicht 24-h-Blöcke, sonst gilt ein Report von
 *  vorgestern 22 Uhr morgens noch als „gestern". */
function tageHer(ts: number) {
  const mitternacht = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((mitternacht(new Date()) - mitternacht(new Date(ts))) / 86400000);
}

/**
 * Banner rund um den Meldetag — in einem Fenster von einem Tag davor bis einem
 * Tag danach, danach ersatzlos weg (kein Platzhalter, das Chart rückt hoch):
 *   morgen/heute anstehend → Vorschau mit erwartetem EPS (neutral)
 *   heute/gestern gemeldet → Ergebnis mit Überraschung (grün/rot getönt)
 * Werte werden wie in den Termin-Zeilen mit einer Linie getrennt.
 */
function ZahlenBanner({ a }: { a: Analyse }) {
  const z = a.zahlen;
  const gemeldetTage = z?.gemeldet ? tageHer(z.gemeldet) : null;
  const istMeldung = gemeldetTage != null && gemeldetTage <= 1;

  // Vorschau: nächster Earnings-Termin heute oder morgen (tageHer ist dann 0 / −1)
  const naechste = a.termine?.earnings ? tageHer(new Date(a.termine.earnings).getTime()) : null;
  const istVorschau = !istMeldung && naechste != null && (naechste === 0 || naechste === -1);

  if (!istMeldung && !istVorschau) return null;

  const ueb = z?.ueberraschungPct ?? null;
  const ton = !istMeldung || ueb == null ? '' : ueb > 0 ? 'pos' : ueb < 0 ? 'neg' : '';
  const wann = istVorschau
    ? naechste === 0
      ? 'heute'
      : 'morgen'
    : gemeldetTage! <= 0
      ? 'heute'
      : 'gestern';
  const epsErw = z?.epsErwartet ?? null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-small',
        ton === 'pos' && 'border-up/40 [background:linear-gradient(90deg,rgba(53,217,154,0.1),transparent_55%),var(--color-panel)]',
        ton === 'neg' && 'border-down/40 [background:linear-gradient(90deg,rgba(255,107,120,0.1),transparent_55%),var(--color-panel)]',
        ton === '' && 'border-line-strong bg-panel'
      )}
    >
      <span className="font-semibold">
        Quartalszahlen {istVorschau ? (wann === 'heute' ? 'heute erwartet' : 'morgen erwartet') : wann}
      </span>
      {epsErw != null && (
        <span className="border-l border-line-strong pl-3 font-mono text-small text-ink2 tnum">
          EPS erw. {fmtEps(epsErw)}
        </span>
      )}
      {istMeldung &&
        (z?.epsTatsaechlich != null ? (
          <span
            className={cn(
              'border-l border-line-strong pl-3 font-mono text-small tnum',
              ton === 'pos' ? 'text-up' : ton === 'neg' ? 'text-down' : 'text-ink2'
            )}
          >
            Ist {fmtEps(z.epsTatsaechlich)}
            {ueb != null && ` (${ueb > 0 ? '+' : ''}${String(ueb).replace('.', ',')} %)`}
          </span>
        ) : (
          <span
            className="border-l border-line-strong pl-3 italic text-small text-ink3"
            title="Der Ist-Wert wird von Yahoo häufig erst einige Stunden nach dem Bericht nachgetragen."
          >
            Ist-Wert noch nicht veröffentlicht
          </span>
        ))}
    </div>
  );
}

// ---------- Kennzahlen-Leiste (Labels bewusst ENGLISCH, v1-Regel) ----------

function QuoteStrip({ a }: { a: Analyse }) {
  const k = a.kurs;
  const perf = a.kennzahlen?.performance ?? null;
  const spanne = (lo: number | null, hi: number | null) =>
    lo != null && hi != null ? `${fmtNum(lo)} – ${fmtNum(hi)}` : '–';
  const zellen: [string, string, string?][] = [
    ['Previous Close', fmtNum(k.vortag)],
    ['Open', fmtNum(k.eroeffnung)],
    ['Day Range', spanne(k.tagesTief, k.tagesHoch)],
    ['52 Week Range', spanne(k.w52Tief, k.w52Hoch)],
    ['Volume', fmtCompact(k.volumen)],
    ['Avg. Volume', fmtCompact(k.volumenSchnitt)],
    ['Market Cap', k.marktkap != null ? `${fmtCompact(k.marktkap)} ${a.currency}` : '–'],
    ['Beta', fmtNum(a.kennzahlen?.beta)],
    ['PE Ratio (TTM)', fmtNum(a.fundamental?.kgv)],
    ['Forward PE', fmtNum(a.fundamental?.kgvForward)],
    ['EPS (TTM)', fmtNum(a.kennzahlen?.epsTtm)],
    ['Revenue Growth', a.fundamental?.umsatzwachstum != null ? fmtPctFrac(a.fundamental.umsatzwachstum) : '–'],
    ['Net Margin', a.fundamental?.nettomarge != null ? fmtPctFrac(a.fundamental.nettomarge) : '–'],
    ['Perf. YTD', fmtPct(perf?.ytd), signClass(perf?.ytd)],
    ['Perf. 1Y', fmtPct(perf?.jahr), signClass(perf?.jahr)],
    ['Short Float', a.kennzahlen?.shortFloat != null ? fmtPctFrac(a.kennzahlen.shortFloat) : '–'],
    ['Next Earnings', fmtDate(a.termine?.earnings)],
    ['Dividend Yield', a.fundamental?.dividendenrendite != null ? fmtPct(a.fundamental.dividendenrendite, false) : '–'],
    ['Ex-Dividend', fmtDate(a.termine?.exDividende)],
    ['Avg. Price Target', a.analysts?.targets?.mean != null ? fmtNum(a.analysts.targets.mean) : '–'],
  ];
  return (
    <Panel>
      <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3 lg:grid-cols-4">
        {zellen.map(([label, wert, cls]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-2 text-small">
            {/* Labels bewusst englisch (Yahoo-/Finviz-Begriffe), die deutsche
                Erklärung hängt als Tooltip am Begriff — so findet man z. B.
                das KGV unter "PE Ratio" wieder. */}
            <span
              className={cn('text-ink3', KENNZAHL_INFO[label] && 'cursor-help')}
              title={KENNZAHL_INFO[label]}
            >
              {label}
            </span>
            <span className={cn('text-right font-mono text-small font-medium tnum', cls)}>{wert}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Deutsche Erklärungen zu den englischen Kennzahlen-Labels (Hover-Tooltip) */
const KENNZAHL_INFO: Record<string, string> = {
  'Previous Close': 'Schlusskurs des Vortags',
  Open: 'Eröffnungskurs heute',
  'Day Range': 'Tagestief bis Tageshoch',
  '52 Week Range': 'Tiefster und höchster Kurs der letzten 52 Wochen',
  Volume: 'Handelsvolumen heute (gehandelte Stückzahl)',
  'Avg. Volume': 'Durchschnittliches Tages-Handelsvolumen',
  'Market Cap': 'Marktkapitalisierung — Börsenwert aller Aktien zusammen',
  Beta: 'Schwankungsstärke im Vergleich zum Gesamtmarkt (1 = wie der Markt, >1 = stärker)',
  'PE Ratio (TTM)': 'Kurs-Gewinn-Verhältnis (dt. KGV) der letzten 12 Monate — wie viele Jahresgewinne man für die Aktie bezahlt',
  'Forward PE': 'KGV auf Basis der für die nächsten 12 Monate erwarteten Gewinne',
  'EPS (TTM)': 'Earnings per Share — Gewinn je Aktie der letzten 12 Monate',
  'Revenue Growth': 'Umsatzwachstum gegenüber dem Vorjahr',
  'Net Margin': 'Nettomarge — Gewinn in Prozent vom Umsatz',
  'Perf. YTD': 'Kursentwicklung seit Jahresbeginn',
  'Perf. 1Y': 'Kursentwicklung der letzten 12 Monate',
  'Short Float': 'Anteil der frei handelbaren Aktien, die leerverkauft sind — Wetten auf fallende Kurse',
  'Next Earnings': 'Nächster Termin für Quartalszahlen',
  'Dividend Yield': 'Dividendenrendite — jährliche Ausschüttung in Prozent des Kurses',
  'Ex-Dividend': 'Stichtag: Wer erst danach kauft, bekommt die nächste Dividende nicht mehr',
  'Avg. Price Target': 'Durchschnittliches Kursziel aller Analysten',
};

// ---------- Übersicht (Snowflake) ----------

function punktText(p: SnowflakePunkt | string) {
  return typeof p === 'string' ? p : p.t;
}
function punktInfo(p: SnowflakePunkt | string) {
  return typeof p === 'string' ? undefined : p.info;
}

function OvPunkt({ p, art }: { p: SnowflakePunkt | string; art: 'pos' | 'neg' }) {
  const info = punktInfo(p);
  const text = punktText(p);
  const farbe = art === 'pos' ? 'text-up' : 'text-down';
  const pfeil = art === 'pos' ? '▲ ' : '▼ ';
  if (!info) return <div className={cn('py-1 text-small', farbe)}>{pfeil}{text}</div>;
  return (
    <div className={cn('py-1 text-small', farbe)}>
      {pfeil}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${text} — Erklärung anzeigen`}
            className="cursor-help text-left underline decoration-dotted decoration-current/40 underline-offset-4 transition-colors hover:decoration-current"
          >
            {text}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-[360px]">
          {info}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function Uebersicht({ a }: { a: Analyse }) {
  const u = a.uebersicht;
  const sf = a.snowflake;
  if ((!u || !u.beschreibung) && !sf) return null;
  const kurz =
    u?.beschreibung && u.beschreibung.length > 260 ? `${u.beschreibung.slice(0, 260)} …` : u?.beschreibung;
  const fakten: [string, string][] = [];
  if (u?.mitarbeiter != null) fakten.push([fmtNum(u.mitarbeiter, 0), 'Vollzeitmitarbeiter']);
  if (u?.geschaeftsjahresende)
    fakten.push([
      new Date(u.geschaeftsjahresende).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }),
      'Geschäftsjahresende',
    ]);
  if (a.sektor) fakten.push([a.sektor, 'Sektor']);
  if (a.branche) fakten.push([a.branche, 'Branche']);

  return (
    <Panel>
      <PanelTitle>
        {a.name} — Übersicht
      </PanelTitle>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          {kurz && <p className="mb-2 text-base leading-relaxed text-ink2">{kurz}</p>}
          {sf && sf.staerken.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-micro font-bold uppercase tracking-[0.14em] text-ink3">Stärken</div>
              {sf.staerken.map((p, i) => (
                <OvPunkt key={i} p={p} art="pos" />
              ))}
            </>
          )}
          {sf && sf.risiken.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-micro font-bold uppercase tracking-[0.14em] text-ink3">Risiken</div>
              {sf.risiken.map((p, i) => (
                <OvPunkt key={i} p={p} art="neg" />
              ))}
            </>
          )}
        </div>
        {sf && (
          <div className="flex justify-center">
            <RadarChart
              scores={[
                { label: 'WERT', value: sf.scores.wert },
                { label: 'ZUKUNFT', value: sf.scores.zukunft },
                { label: 'VERGANGENH.', value: sf.scores.vergangenheit },
                { label: 'BILANZ', value: sf.scores.bilanz },
                { label: 'DIVIDENDE', value: sf.scores.dividende },
              ]}
            />
          </div>
        )}
      </div>
      <Accordion type="single" collapsible>
        <AccordionItem value="firma" className="border-0">
          <AccordionTrigger>Mehr zur Firma</AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-3 pt-1">
              {u?.beschreibung && <p className="text-base leading-relaxed text-ink2">{u.beschreibung}</p>}
              {u?.website && (
                <a href={u.website} target="_blank" rel="noopener" className="text-small text-accent hover:underline">
                  {u.website.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              )}
              {fakten.length > 0 && (
                <div className="flex flex-wrap gap-x-10 gap-y-3">
                  {fakten.map(([wert, label]) => (
                    <div key={label}>
                      <div className="text-base font-semibold">{wert}</div>
                      <div className="text-micro uppercase tracking-wider text-ink3">{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Panel>
  );
}

// ---------- Analysten ----------

const RECO_KEYS = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'] as const;
const RECO_COLORS: Record<string, string> = {
  strongBuy: '#1fae72',
  buy: '#8fd695',
  hold: '#d6c063',
  sell: '#f0a35f',
  strongSell: '#f0616d',
};
const RECO_LABELS: Record<string, string> = {
  strongBuy: 'Stark kaufen',
  buy: 'Kaufen',
  hold: 'Halten',
  sell: 'Verkaufen',
  strongSell: 'Stark verkaufen',
};
const KEY_LABELS: Record<string, string> = {
  strong_buy: 'Stark kaufen',
  buy: 'Kaufen',
  hold: 'Halten',
  underperform: 'Untergewichten',
  sell: 'Verkaufen',
  strong_sell: 'Stark verkaufen',
};

function Analysten({ a }: { a: Analyse }) {
  const an = a.analysts;
  if (!an) {
    return (
      <Panel>
        <PanelTitle>Analysten</PanelTitle>
        <Empty>{a.type === 'ETF' ? 'Für ETFs gibt es keine Analysten-Ratings.' : 'Keine Analystendaten verfügbar.'}</Empty>
      </Panel>
    );
  }
  const b = an.breakdown;
  const t = an.targets;
  const maxTotal = Math.max(
    ...an.trend.map((row) => RECO_KEYS.reduce((s, k) => s + (row[k] || 0), 0)),
    1
  );
  return (
    <Panel>
      <PanelTitle>Analysten</PanelTitle>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-display text-display-md font-bold tnum">{an.mean?.toFixed(1)}</span>
        <span className="text-small text-ink3">/ 5 · Konsens (1 = Stark kaufen)</span>
        <Badge variant={an.mean <= 2 ? 'pos' : an.mean >= 3.5 ? 'neg' : 'neu'}>
          {KEY_LABELS[an.key ?? ''] ??
            (an.key ?? '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
        </Badge>
      </div>

      {b && (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full">
            {RECO_KEYS.filter((k) => (b[k] || 0) > 0).map((k) => (
              <span key={k} style={{ flex: b[k], background: RECO_COLORS[k] }} title={`${RECO_LABELS[k]}: ${b[k]}`} />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-micro text-ink2">
            {RECO_KEYS.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: RECO_COLORS[k] }} />
                {RECO_LABELS[k]} {b[k] || 0}
              </span>
            ))}
          </div>
        </>
      )}

      {an.trend.length > 1 && (
        <>
          <div className="mb-2 mt-5 text-micro font-bold uppercase tracking-[0.14em] text-ink3">
            Empfehlungen im Monatsverlauf
          </div>
          <div className="flex items-end gap-5">
            {[...an.trend].reverse().map((row) => {
              const total = RECO_KEYS.reduce((s, k) => s + (row[k] || 0), 0);
              const monat = new Date();
              monat.setMonth(monat.getMonth() + (parseInt(row.period, 10) || 0));
              return (
                <div key={row.period} className="flex w-12 flex-col items-center gap-1">
                  <span className="font-mono text-micro text-ink2 tnum">{total}</span>
                  <div className="flex h-[110px] w-6 items-end">
                    {/* Stapel: Strong Buy OBEN (wie Yahoo) */}
                    <div
                      className="flex w-full flex-col overflow-hidden rounded-[3px]"
                      style={{ height: `${Math.max(Math.round((total / maxTotal) * 100), 4)}%` }}
                    >
                      {RECO_KEYS.filter((k) => (row[k] || 0) > 0).map((k) => (
                        <span key={k} style={{ flex: row[k], background: RECO_COLORS[k] }} title={`${RECO_LABELS[k]}: ${row[k]}`} />
                      ))}
                    </div>
                  </div>
                  <span className="text-micro text-ink3">
                    {monat.toLocaleDateString('de-DE', { month: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {t.low != null && t.high != null && t.high > t.low && (
        <div className="mt-5">
          <div className="text-micro font-bold uppercase tracking-[0.14em] text-ink3">
            Kursziele der Analysten
          </div>
          {/* Yahoo-Stil (Micha, Runde 23): graue Linie mit Endpunkten, blauer
              Marker = Ø-Kursziel (Wert mittig DARÜBER), weißer Marker =
              aktueller Kurs (Wert mittig DARUNTER). Marker sitzen exakt,
              die Beschriftungen werden an den Rändern eingefangen. */}
          {(() => {
            const posPct = (v: number) => Math.min(100, Math.max(0, ((v - t.low!) / (t.high! - t.low!)) * 100));
            const labelPct = (v: number) => Math.min(86, Math.max(14, posPct(v)));
            const kurs = a.kurs.preis;
            return (
              <div className="relative mx-2 mt-9 mb-9">
                <div className="relative h-[3px] rounded-full bg-line-strong">
                  {/* Endpunkte */}
                  <span aria-hidden className="absolute left-0 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink3" />
                  <span aria-hidden className="absolute right-0 top-1/2 size-2.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-ink3" />
                  {t.mean != null && (
                    <>
                      <span
                        className="absolute bottom-1/2 h-3.5 w-[3px] -translate-x-1/2 rounded bg-accent"
                        style={{ left: `${posPct(t.mean)}%` }}
                        title={`Ø-Kursziel ${fmtMoney(t.mean, a.currency)}`}
                      />
                      <div
                        className="absolute bottom-[14px] -translate-x-1/2 whitespace-nowrap rounded-md border border-accent/60 bg-panel2 px-2 py-0.5 font-mono text-micro text-accent tnum"
                        style={{ left: `${labelPct(t.mean)}%` }}
                      >
                        Ø {fmtNum(t.mean)} ({fmtPct(t.upsidePct)})
                      </div>
                    </>
                  )}
                  {kurs != null && (
                    <>
                      <span
                        className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 rounded bg-ink"
                        style={{ left: `${posPct(kurs)}%` }}
                        title={`Aktueller Kurs ${fmtMoney(kurs, a.currency)}`}
                      />
                      <div
                        className="absolute top-[14px] -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-panel2 px-2 py-0.5 font-mono text-micro text-ink tnum"
                        style={{ left: `${labelPct(kurs)}%` }}
                      >
                        Aktuell {fmtNum(kurs)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
          <div className="mx-2 flex justify-between font-mono text-micro text-ink3 tnum">
            <span>Tief {fmtNum(t.low)}</span>
            <span>Hoch {fmtNum(t.high)}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------- Analysten-Historie ----------

function Historie({ a }: { a: Analyse }) {
  const [alle, setAlle] = useState(false);
  if (!a.ratings?.length) return null;
  const hatKursziele = a.ratings.some((r) => r.kursziel != null);
  const liste = alle ? a.ratings : a.ratings.slice(0, 5);
  const aktionCls = (r: Rating) =>
    r.aktion === 'Hochgestuft' ? 'text-up' : r.aktion === 'Abgestuft' ? 'text-down' : '';
  return (
    <Panel>
      <PanelTitle>Analysten-Historie</PanelTitle>
      <table className="w-full border-collapse text-small">
        <thead>
          <tr className="text-left text-micro font-bold uppercase tracking-[0.14em] text-ink3">
            <th className="pb-2">Datum</th>
            <th className="pb-2">Analyst</th>
            <th className="pb-2">Aktion</th>
            <th className="pb-2">Rating</th>
            {hatKursziele && <th className="pb-2 text-right">Kursziel</th>}
          </tr>
        </thead>
        <tbody>
          {liste.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-b-0">
              <td className="py-2 pr-3 font-mono text-micro text-ink3 tnum">{fmtDate(r.datum)}</td>
              <td className="py-2 pr-3">
                {r.link ? (
                  <a href={r.link} target="_blank" rel="noopener" className="text-ink transition-colors hover:text-accent" title="Einschätzung beim Analysten nachlesen">
                    {r.firma || '–'}
                  </a>
                ) : (
                  r.firma || '–'
                )}
              </td>
              <td className={cn('py-2 pr-3', aktionCls(r))}>{r.aktion}</td>
              <td className="py-2 pr-3 text-ink2">{r.von && r.von !== r.zu ? `${r.von} → ${r.zu}` : r.zu || '–'}</td>
              {hatKursziele && (
                <td className="py-2 text-right font-mono text-small tnum">
                  {r.kursziel != null ? fmtMoney(r.kursziel, a.currency) : '–'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!alle && a.ratings.length > 5 && (
        <Button variant="ghost" size="sm" className="mt-3.5" onClick={() => setAlle(true)}>
          Mehr anzeigen ({a.ratings.length - 5})
        </Button>
      )}
      {!hatKursziele && (
        <p className="mt-3 rounded-md border border-line bg-panel2 px-3 py-2 text-micro text-ink3">
          Für diesen Wert sind keine Kursziele je Bank frei verfügbar — die Konsens-Spanne steht im Analysten-Panel.
        </p>
      )}
    </Panel>
  );
}

// ---------- Extra: Studien / ETF ----------

function Extra({ a }: { a: Analyse }) {
  if (a.trials?.length) {
    return (
      <Panel>
        <PanelTitle>Studien-Pipeline</PanelTitle>
        {a.trials.slice(0, 8).map((t, i) => (
          <div key={i} className="grid gap-1.5 border-b border-line py-3 last:border-b-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="cat">{(t.phases ?? []).join(' / ') || 'Phase –'}</Badge>
              <Badge>{t.status ?? ''}</Badge>
              {t.completion && <span className="text-micro text-ink3">Abschluss ~ {t.completion}</span>}
            </div>
            <a href={t.link} target="_blank" rel="noopener" className="text-small text-ink transition-colors hover:text-accent">
              {t.title}
            </a>
            {t.conditions?.length ? (
              <div className="font-mono text-micro text-ink3">{t.conditions.join(' · ')}</div>
            ) : null}
          </div>
        ))}
      </Panel>
    );
  }
  if (a.type === 'ETF' && a.etf && (a.etf.topHoldings?.length || a.etf.sektoren?.length)) {
    return (
      <Panel>
        <PanelTitle>Im ETF enthalten</PanelTitle>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {a.etf.topHoldings?.length ? (
            <div>
              {a.etf.topHoldings.map((h) => (
                <div key={h.symbol} className="flex items-baseline justify-between border-b border-dashed border-line py-1.5 text-small last:border-b-0">
                  <span className="truncate text-ink2">{h.name || h.symbol}</span>
                  <span className="font-mono text-small tnum">{fmtPctFrac(h.anteil)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {a.etf.sektoren?.length ? (
            <div>
              <div className="mb-1.5 text-micro font-bold uppercase tracking-[0.14em] text-ink3">Sektorgewichtung</div>
              {a.etf.sektoren.slice(0, 8).map((s) => (
                <div key={s.sektor} className="flex items-baseline justify-between border-b border-dashed border-line py-1.5 text-small last:border-b-0">
                  <span className="text-ink2">{s.sektor}</span>
                  <span className="font-mono text-small tnum">{fmtPctFrac(s.anteil)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Panel>
    );
  }
  return null;
}

function EtfProfil({ a }: { a: Analyse }) {
  if (a.type !== 'ETF' || !a.etf) return null;
  const rows: [string, string][] = [
    ['Kategorie', a.etf.kategorie ?? '–'],
    ['Anbieter', a.etf.familie ?? '–'],
    ['Kostenquote (TER)', a.etf.ter != null ? fmtPctFrac(a.etf.ter) : '–'],
  ];
  return (
    <Panel>
      <PanelTitle>ETF-Profil</PanelTitle>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between border-b border-dashed border-line py-2 text-small last:border-b-0">
          <span className="text-ink3">{k}</span>
          <span className="font-medium">{v}</span>
        </div>
      ))}
    </Panel>
  );
}

// ---------- Report ----------

function Report({ symbol }: { symbol: string }) {
  const { data: a, isLoading, error } = useAnalyse(symbol);
  // Zeitraum steht in der URL — ein Link auf „PGY, 5 Jahre" ist teilbar
  // und der Zurück-Button springt zum vorherigen Zeitraum
  const params = useSearchParams();
  const setParam = useSetParam();
  const range = params.get('range') ?? '1y';
  const setRange = (v: string) => setParam('range', v === '1y' ? null : v);
  const history = useHistory(range !== '1y' ? symbol : null, range);
  const chartData = range === '1y' ? a?.chart : (history.data ?? a?.chart);
  const rangeLabel = RANGES.find(([r]) => r === range)?.[1] ?? '1J';

  if (isLoading) return <ReportSkelett />;
  if (error || !a) {
    return (
      <Panel>
        <Empty>
          Analyse fehlgeschlagen: {(error as Error | null)?.message ?? 'Unbekannter Fehler'} — Symbol korrekt?
          Internet verbunden?
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="grid gap-5 [&>*]:animate-rise [&>*:nth-child(2)]:[animation-delay:50ms] [&>*:nth-child(3)]:[animation-delay:100ms] [&>*:nth-child(4)]:[animation-delay:150ms] [&>*:nth-child(5)]:[animation-delay:200ms] [&>*:nth-child(6)]:[animation-delay:250ms]">
      <header>
        <h1 className="font-display text-display-md font-bold tracking-tight text-balance">{a.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="chip">{a.symbol}</Badge>
          {a.kurs.boerse && <Badge>{a.kurs.boerse}</Badge>}
          {a.type === 'ETF' && <Badge variant="cat">ETF</Badge>}
          {a.sektor && <Badge>{a.sektor}</Badge>}
          {a.branche && <Badge>{a.branche}</Badge>}
        </div>
      </header>

      {/* Banner nur in Chartbreite — rechts daneben beginnt die Seitenspalte
          mit dem Watch-Button auf gleicher Höhe (Micha, Runde 24) */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid gap-5">
        <ZahlenBanner a={a} />
        <Panel className="p-4 pb-2">
          <div className="flex flex-wrap items-baseline gap-3 px-1 pb-2.5">
            <span className="font-display text-display-md font-bold leading-none tnum">
              {fmtMoney(a.kurs.preis, a.currency)}
            </span>
            <span className={cn('font-mono text-small tnum', signClass(a.kurs.veraenderungPct))}>
              {fmtPct(a.kurs.veraenderungPct)} heute
            </span>
            {a.kurs.ausserboerslich?.preis != null && (
              <span className="border-l border-line pl-3 font-mono text-micro tnum">
                <span className="text-ink3">
                  {a.kurs.ausserboerslich.phase === 'pre' ? 'Pre-Market ' : 'Nachbörslich '}
                </span>
                <span className={signClass(a.kurs.ausserboerslich.pct)}>
                  {fmtMoney(a.kurs.ausserboerslich.preis, a.currency)} ({fmtPct(a.kurs.ausserboerslich.pct)})
                </span>
              </span>
            )}
            <WatchButton symbol={a.symbol} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-3">
            {RANGES.map(([r, label]) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'h-control-xs cursor-pointer rounded-full border px-3 font-mono text-micro transition-colors',
                  range === r
                    ? 'border-accent bg-accent font-semibold text-[#0b1524]'
                    : 'border-line-strong text-ink2 hover:border-ink3 hover:bg-panel2 hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto hidden items-center gap-4 font-mono text-micro text-ink3 sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5" style={{ background: '#e5a83b' }} /> SMA 50
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5" style={{ background: '#9085e9' }} /> SMA 200
              </span>
            </span>
          </div>
          {chartData && (
            <Suspense fallback={<Skeleton className="h-[380px] w-full" aria-label="Chart wird geladen" />}>
              <StockChart
                data={chartData}
                titelZeile={[a.name, rangeLabel, a.kurs.boerse].filter(Boolean).join(' · ')}
                vortag={a.kurs.vortag}
                ausserboerslich={a.kurs.ausserboerslich}
              />
            </Suspense>
          )}
        </Panel>
        </div>
        <div className="grid content-start gap-5">
          <LinksCard symbol={a.symbol} name={a.name} />
        </div>
      </div>

      <QuoteStrip a={a} />
      <Uebersicht a={a} />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Analysten a={a} />
        <Historie a={a} />
        <EtfProfil a={a} />
        <Extra a={a} />
      </div>

      <Panel>
        <PanelTitle>News zu {a.name}</PanelTitle>
        {!a.news?.length ? (
          <Empty>Keine aktuellen News gefunden.</Empty>
        ) : (
          <>
            {a.news.slice(0, 5).map((n, i) => (
              <NewsItem key={`${n.link}-${i}`} n={n} />
            ))}
            {a.news.length > 5 && (
              <Accordion type="single" collapsible>
                <AccordionItem value="mehr" className="border-0">
                  <AccordionTrigger>Mehr anzeigen ({a.news.length - 5})</AccordionTrigger>
                  <AccordionContent>
                    {a.news.slice(5).map((n, i) => (
                      <NewsItem key={`${n.link}-rest-${i}`} n={n} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

// ---------- Seite ----------

export default function AnalysePage() {
  const params = useSearchParams();
  const navigate = useNavigate();
  const symbol = params.get('symbol');
  const waehlen = (s: string) => navigate(`/analyse?symbol=${encodeURIComponent(s)}`);

  return (
    <div className="grid gap-6">
      <header className="animate-rise">
        <div className="flex items-center gap-3 font-mono text-micro uppercase tracking-[0.14em] text-ink3">
          Aktien-Analyse
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <h1 className="mb-5 mt-1.5 font-display text-display-md font-bold tracking-tight text-balance">
          Ticker rein, <em className="not-italic text-accent">Einschätzung raus.</em>
        </h1>
        <SucheDialog onPick={waehlen} />
      </header>
      {symbol ? <Report symbol={symbol} /> : <Startansicht onPick={waehlen} />}
    </div>
  );
}
