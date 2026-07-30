import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from '@/lib/router';
import { Search } from 'lucide-react';
import { Panel, PanelTitle, Empty } from '@/components/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SymbolSearch } from '@/components/symbol-search';
import { StockChart } from '@/components/stock-chart';
import { LinksCard } from '@/components/links-card';
import { RadarChart } from '@/components/radar';
import { NewsItem } from '@/components/news';
import type { Analyse, Rating, SnowflakePunkt } from '@/lib/api';
import { useAnalyse, useDashboard, useHistory, useTrending } from '@/lib/queries';
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
        className="flex h-11 w-full max-w-[560px] cursor-pointer items-center gap-3 rounded-md border border-line-strong bg-panel px-4 text-[13.5px] text-ink3 transition-all hover:border-ink3 focus-visible:ring-2 focus-visible:ring-accent/40 outline-none"
      >
        <Search size={16} />
        Aktie oder ETF suchen …
        <kbd className="ml-auto rounded border border-line-strong bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-ink3">
          Strg K
        </kbd>
      </button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-w-[560px] p-0">
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
      className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-line-strong bg-panel2 px-3.5 py-2.5 text-left text-[13.5px] transition-all duration-150 hover:border-accent hover:bg-accent-soft"
    >
      <b className="min-w-[56px] font-mono text-[12.5px]">{symbol}</b>
      <span className="flex-1 truncate text-ink2">{name}</span>
      <span className={cn('shrink-0 font-mono text-[12.5px] tnum', signClass(tagesPct))}>{fmtPct(tagesPct)}</span>
    </button>
  );
}

function Startansicht({ onPick }: { onPick: (s: string) => void }) {
  const { data: d } = useDashboard();
  const { data: trending, isLoading: trendLaedt } = useTrending();

  const eigene = useMemo(() => {
    if (!d) return [];
    const gesehen = new Set<string>();
    return [
      ...d.positions.map((p) => ({ symbol: p.symbol, name: p.name, tagesPct: p.tagesPct })),
      ...d.watchlist.map((w) => ({ symbol: w.symbol, name: w.name, tagesPct: w.tagesPct })),
    ].filter((w) => !gesehen.has(w.symbol) && gesehen.add(w.symbol));
  }, [d]);

  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 animate-rise">
      <Panel>
        <PanelTitle hint="· ein Klick öffnet die Analyse">Deine Werte</PanelTitle>
        {!d ? (
          <Skeleton className="h-[160px]" />
        ) : eigene.length === 0 ? (
          <Empty>Noch keine Positionen oder Watchlist-Werte — im Dashboard anlegen.</Empty>
        ) : (
          <div className="grid gap-2">
            {eigene.map((w) => (
              <StartChip key={w.symbol} {...w} onPick={onPick} />
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        <PanelTitle>Gerade im Trend</PanelTitle>
        {trendLaedt ? (
          <Skeleton className="h-[160px]" />
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

// ---------- Quartalszahlen-Banner (nur am Meldetag) ----------

function ZahlenBanner({ a }: { a: Analyse }) {
  const z = a.zahlen;
  if (!z?.gemeldet) return null;
  const tage = Math.floor((Date.now() - z.gemeldet) / 86400000);
  if (tage > 1) return null;
  const cls = z.ueberraschungPct != null && z.ueberraschungPct > 0 ? 'pos' : z.ueberraschungPct != null && z.ueberraschungPct < 0 ? 'neg' : '';
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border px-4 py-3 text-[13px]',
        cls === 'pos' && 'border-up/40 [background:linear-gradient(90deg,rgba(47,209,141,0.09),transparent_55%),var(--color-panel)]',
        cls === 'neg' && 'border-down/40 [background:linear-gradient(90deg,rgba(255,93,108,0.09),transparent_55%),var(--color-panel)]',
        cls === '' && 'border-line-strong bg-panel'
      )}
    >
      <span className="font-semibold">Quartalszahlen {tage <= 0 ? 'heute' : 'gestern'}</span>
      {z.epsErwartet != null && (
        <span className="font-mono text-[12.5px] text-ink2 tnum">EPS erw. {fmtEps(z.epsErwartet)}</span>
      )}
      {z.epsTatsaechlich != null ? (
        <span className={cn('font-mono text-[12.5px] tnum', cls === 'pos' ? 'text-up' : cls === 'neg' ? 'text-down' : 'text-ink2')}>
          Ist {fmtEps(z.epsTatsaechlich)}
          {z.ueberraschungPct != null &&
            ` (${z.ueberraschungPct > 0 ? '+' : ''}${String(z.ueberraschungPct).replace('.', ',')} %)`}
        </span>
      ) : (
        <span className="font-mono text-[12.5px] text-ink3">Ergebnis folgt</span>
      )}
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
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-2 text-[13px]">
            <span className="text-ink3">{label}</span>
            <span className={cn('text-right font-mono text-[12.5px] font-medium tnum', cls)}>{wert}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------- Übersicht (Snowflake) ----------

function punktText(p: SnowflakePunkt | string) {
  return typeof p === 'string' ? p : p.t;
}
function punktInfo(p: SnowflakePunkt | string) {
  return typeof p === 'string' ? undefined : p.info;
}

function OvPunkt({ p, art }: { p: SnowflakePunkt | string; art: 'pos' | 'neg' }) {
  const inhalt = (
    <div className={cn('py-1 text-[13px]', art === 'pos' ? 'text-up' : 'text-down')}>
      {art === 'pos' ? '▲ ' : '▼ '}
      {punktText(p)}
    </div>
  );
  const info = punktInfo(p);
  if (!info) return inhalt;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inhalt}</TooltipTrigger>
      <TooltipContent>{info}</TooltipContent>
    </Tooltip>
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
      <PanelTitle hint={sf ? '· Snowflake: 5 Dimensionen à 0–5 Punkte' : undefined}>
        {a.name} — Übersicht
      </PanelTitle>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          {kurz && <p className="mb-2 text-[13.5px] leading-relaxed text-ink2">{kurz}</p>}
          {sf && sf.staerken.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink3">Stärken</div>
              {sf.staerken.map((p, i) => (
                <OvPunkt key={i} p={p} art="pos" />
              ))}
            </>
          )}
          {sf && sf.risiken.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink3">Risiken</div>
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
              {u?.beschreibung && <p className="text-[13.5px] leading-relaxed text-ink2">{u.beschreibung}</p>}
              {u?.website && (
                <a href={u.website} target="_blank" rel="noopener" className="text-[13px] text-accent hover:underline">
                  {u.website.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              )}
              {fakten.length > 0 && (
                <div className="flex flex-wrap gap-x-10 gap-y-3">
                  {fakten.map(([wert, label]) => (
                    <div key={label}>
                      <div className="text-[14px] font-semibold">{wert}</div>
                      <div className="text-[11px] uppercase tracking-wider text-ink3">{label}</div>
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
  const pos = (v: number) =>
    t.low != null && t.high != null && t.high > t.low ? `${(((v - t.low) / (t.high - t.low)) * 100).toFixed(1)}%` : '0%';

  return (
    <Panel>
      <PanelTitle hint={`· ${an.count ?? '?'} Analysten`}>Analysten</PanelTitle>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-display text-[30px] font-bold tnum">{an.mean?.toFixed(1)}</span>
        <span className="text-[12.5px] text-ink3">/ 5 · Konsens (1 = Stark kaufen)</span>
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
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-ink2">
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
          <div className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink3">
            Empfehlungen im Monatsverlauf
          </div>
          <div className="flex items-end gap-5">
            {[...an.trend].reverse().map((row) => {
              const total = RECO_KEYS.reduce((s, k) => s + (row[k] || 0), 0);
              const monat = new Date();
              monat.setMonth(monat.getMonth() + (parseInt(row.period, 10) || 0));
              return (
                <div key={row.period} className="flex w-12 flex-col items-center gap-1">
                  <span className="font-mono text-[11px] text-ink2 tnum">{total}</span>
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
                  <span className="text-[10.5px] text-ink3">
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
          <div className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink3">
            Kursziele der Analysten
          </div>
          <div className="relative h-1.5 rounded-full bg-gradient-to-r from-down/60 via-warn/60 to-up/60">
            {a.kurs.preis != null && a.kurs.preis >= t.low && a.kurs.preis <= t.high && (
              <span
                className="absolute top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded bg-ink"
                style={{ left: pos(a.kurs.preis) }}
                title={`Aktueller Kurs ${fmtMoney(a.kurs.preis, a.currency)}`}
              />
            )}
            {t.mean != null && (
              <span
                className="absolute top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded bg-accent"
                style={{ left: pos(t.mean) }}
                title={`Ø-Kursziel ${fmtMoney(t.mean, a.currency)}`}
              />
            )}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11.5px] text-ink3 tnum">
            <span>Tief {fmtNum(t.low)}</span>
            <span className="text-accent">
              Ø {fmtNum(t.mean)} ({fmtPct(t.upsidePct)})
            </span>
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
      <PanelTitle hint="· einzelne Banken">Analysten-Historie</PanelTitle>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.13em] text-ink3">
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
              <td className="py-2 pr-3 font-mono text-[12px] text-ink3 tnum">{fmtDate(r.datum)}</td>
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
                <td className="py-2 text-right font-mono text-[12.5px] tnum">
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
        <p className="mt-3 rounded-md border border-line bg-panel2 px-3 py-2 text-[12px] text-ink3">
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
        <PanelTitle hint="· klinische Studien">Studien-Pipeline</PanelTitle>
        {a.trials.slice(0, 8).map((t, i) => (
          <div key={i} className="grid gap-1.5 border-b border-line py-3 last:border-b-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="cat">{(t.phases ?? []).join(' / ') || 'Phase –'}</Badge>
              <Badge>{t.status ?? ''}</Badge>
              {t.completion && <span className="text-[11.5px] text-ink3">Abschluss ~ {t.completion}</span>}
            </div>
            <a href={t.link} target="_blank" rel="noopener" className="text-[13.5px] text-ink transition-colors hover:text-accent">
              {t.title}
            </a>
            {t.conditions?.length ? (
              <div className="font-mono text-[11px] text-ink3">{t.conditions.join(' · ')}</div>
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
                <div key={h.symbol} className="flex items-baseline justify-between border-b border-dashed border-line py-1.5 text-[13px] last:border-b-0">
                  <span className="truncate text-ink2">{h.name || h.symbol}</span>
                  <span className="font-mono text-[12.5px] tnum">{fmtPctFrac(h.anteil)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {a.etf.sektoren?.length ? (
            <div>
              <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink3">Sektorgewichtung</div>
              {a.etf.sektoren.slice(0, 8).map((s) => (
                <div key={s.sektor} className="flex items-baseline justify-between border-b border-dashed border-line py-1.5 text-[13px] last:border-b-0">
                  <span className="text-ink2">{s.sektor}</span>
                  <span className="font-mono text-[12.5px] tnum">{fmtPctFrac(s.anteil)}</span>
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
        <div key={k} className="flex items-baseline justify-between border-b border-dashed border-line py-2 text-[13px] last:border-b-0">
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
  const [range, setRange] = useState('1y');
  useEffect(() => setRange('1y'), [symbol]);
  const history = useHistory(range !== '1y' ? symbol : null, range);
  const chartData = range === '1y' ? a?.chart : (history.data ?? a?.chart);
  const rangeLabel = RANGES.find(([r]) => r === range)?.[1] ?? '1J';

  if (isLoading) {
    return (
      <div className="grid gap-5">
        <Skeleton className="h-[70px]" />
        <Skeleton className="h-[440px]" />
        <Skeleton className="h-[220px]" />
      </div>
    );
  }
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
        <h1 className="font-display text-[clamp(26px,3.2vw,36px)] font-bold tracking-tight">{a.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="chip">{a.symbol}</Badge>
          {a.kurs.boerse && <Badge>{a.kurs.boerse}</Badge>}
          {a.type === 'ETF' && <Badge variant="cat">ETF</Badge>}
          {a.sektor && <Badge>{a.sektor}</Badge>}
          {a.branche && <Badge>{a.branche}</Badge>}
        </div>
      </header>

      <ZahlenBanner a={a} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Panel className="p-4 pb-2">
          <div className="flex flex-wrap items-baseline gap-3 px-1 pb-2.5">
            <span className="font-display text-[26px] font-bold leading-none tnum">
              {fmtMoney(a.kurs.preis, a.currency)}
            </span>
            <span className={cn('font-mono text-[13px] tnum', signClass(a.kurs.veraenderungPct))}>
              {fmtPct(a.kurs.veraenderungPct)} heute
            </span>
            {a.kurs.ausserboerslich?.preis != null && (
              <span className="border-l border-line pl-3 font-mono text-[12px] tnum">
                <span className="text-ink3">
                  {a.kurs.ausserboerslich.phase === 'pre' ? 'Pre-Market ' : 'Nachbörslich '}
                </span>
                <span className={signClass(a.kurs.ausserboerslich.pct)}>
                  {fmtMoney(a.kurs.ausserboerslich.preis, a.currency)} ({fmtPct(a.kurs.ausserboerslich.pct)})
                </span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-3">
            {RANGES.map(([r, label]) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'h-7 cursor-pointer rounded-md border px-3 font-mono text-[11.5px] transition-colors',
                  range === r
                    ? 'border-accent bg-accent font-semibold text-[#06101f]'
                    : 'border-line-strong text-ink2 hover:border-ink3 hover:bg-panel2 hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto hidden items-center gap-4 font-mono text-[10.5px] text-ink3 sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5" style={{ background: '#e5a83b' }} /> SMA 50
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5" style={{ background: '#9085e9' }} /> SMA 200
              </span>
            </span>
          </div>
          {chartData && (
            <StockChart
              data={chartData}
              titelZeile={[a.name, rangeLabel, a.kurs.boerse].filter(Boolean).join(' · ')}
              vortag={a.kurs.vortag}
              ausserboerslich={a.kurs.ausserboerslich}
            />
          )}
        </Panel>
        <LinksCard symbol={a.symbol} />
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
        <PanelTitle hint="· KI-bewertet, mit Kursreaktion">News zu {a.name}</PanelTitle>
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
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] text-ink3">
          Aktien-Analyse
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <h1 className="mb-5 mt-1.5 font-display text-[clamp(26px,3.4vw,38px)] font-bold tracking-tight">
          Ticker rein, <em className="not-italic text-accent">Einschätzung raus.</em>
        </h1>
        <SucheDialog onPick={waehlen} />
      </header>
      {symbol ? <Report symbol={symbol} /> : <Startansicht onPick={waehlen} />}
    </div>
  );
}
