import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, X } from 'lucide-react';
import { Panel, PanelTitle, Empty } from '@/components/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SymbolSearch } from '@/components/symbol-search';
import { Sparkline } from '@/components/sparkline';
import { Donut, CAT_COLORS } from '@/components/donut';
import { NewsItem } from '@/components/news';
import { api, type Dashboard, type Position, type SearchResult, type Termin, type Ausserboerslich } from '@/lib/api';
import { useDashboard, useNewsfeed, usePortfolioMutation } from '@/lib/queries';
import { fmtEur, fmtEps, fmtMoney, fmtPct, fmtDate, signClass } from '@/lib/format';
import { cn } from '@/lib/utils';

// ---------- Hero-KPIs ----------

function StatCard({
  label,
  value,
  valueClass,
  sub,
  featured = false,
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  sub?: React.ReactNode;
  featured?: boolean;
  delay?: number;
}) {
  return (
    <Panel
      className={cn('flex min-h-[128px] flex-col justify-between animate-rise', featured && 'border-accent/25')}
      style={{
        animationDelay: `${delay}ms`,
        ...(featured
          ? { background: 'linear-gradient(135deg, rgba(94,158,255,0.07), rgba(94,158,255,0) 55%), var(--color-panel)' }
          : undefined),
      }}
    >
      <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink3">{label}</span>
      <div>
        <div className={cn('font-display text-[30px] font-bold leading-tight tnum', valueClass)}>{value}</div>
        {sub ? <div className="mt-1 font-mono text-[12px] text-ink2 tnum">{sub}</div> : null}
      </div>
    </Panel>
  );
}

// ---------- Wichtige Termine ----------

function wannVon(t: Termin) {
  if (t.days === 0)
    return `heute ${new Date(t.date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  if (t.days === 1) return 'morgen';
  return new Date(t.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function TerminWert({ t }: { t: Termin }) {
  return (
    <Link
      to={`/analyse?symbol=${encodeURIComponent(t.symbol!)}`}
      title={`${t.name} — ${t.typ}, ${fmtDate(t.date)}`}
      className="flex items-center gap-3 border-b border-line py-2.5 text-[13px] text-ink transition-colors last:border-b-0 hover:bg-panel2"
    >
      <span className="w-[86px] shrink-0 font-mono text-[11.5px] text-ink3">{wannVon(t)}</span>
      <Badge variant="chip">{t.symbol}</Badge>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {t.typ === 'Quartalszahlen' ? 'Quartalszahlen' : 'Ex-Dividende'}
        {t.epsErwartet != null && (
          <span className="font-mono text-[12px] text-ink2 tnum">EPS erw. {fmtEps(t.epsErwartet)}</span>
        )}
        {t.epsTatsaechlich != null && (
          <span
            className={cn(
              'border-l border-line-strong pl-3 font-mono text-[12px] tnum',
              t.ueberraschungPct != null && t.ueberraschungPct > 0 ? 'text-up' : t.ueberraschungPct != null && t.ueberraschungPct < 0 ? 'text-down' : 'text-ink2'
            )}
          >
            Ist {fmtEps(t.epsTatsaechlich)}
            {t.ueberraschungPct != null &&
              ` (${t.ueberraschungPct > 0 ? '+' : ''}${String(t.ueberraschungPct).replace('.', ',')} %)`}
          </span>
        )}
      </span>
    </Link>
  );
}

function TerminMarkt({ t }: { t: Termin }) {
  const kurzTitel = t.name.replace(/\s*\((Monat|Jahr|Quartal)\)/g, '');
  return (
    <Link
      to="/kalender"
      title={`${t.name} — Prognose ${t.prognose ?? '–'}, vorher ${t.vorher ?? '–'}`}
      className="flex items-center gap-3 border-b border-line py-2.5 text-[13px] text-ink transition-colors last:border-b-0 hover:bg-panel2"
    >
      <span className="w-[86px] shrink-0 font-mono text-[11.5px] text-ink3">{wannVon(t)}</span>
      <Badge variant="neu" title={t.waehrung ?? ''}>{t.land ?? t.waehrung}</Badge>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {kurzTitel}
        {t.prognose && <span className="font-mono text-[12px] text-ink2 tnum">Prog. {t.prognose}</span>}
        {t.aktuell && (
          <span
            className={cn(
              'border-l border-line-strong pl-3 font-mono text-[12px] tnum',
              t.aktuellTrend === 'gut' ? 'text-up' : t.aktuellTrend === 'schlecht' ? 'text-down' : 'text-ink2'
            )}
          >
            Ist {t.aktuell}
          </span>
        )}
      </span>
    </Link>
  );
}

// ---------- Pre-/After-Market-Mini ----------

function PrepostMini({ ab }: { ab: Ausserboerslich | null }) {
  if (!ab || ab.pct == null) return null;
  return (
    <span
      className={cn('block text-[10.5px] opacity-90 tnum', signClass(ab.pct))}
      title={ab.phase === 'pre' ? 'Vorbörslicher Handel (Pre-Market)' : 'Nachbörslicher Handel (After-Hours)'}
    >
      {ab.phase === 'pre' ? 'Pre' : 'Post'} {fmtPct(ab.pct)}
    </span>
  );
}

// ---------- Position hinzufügen / bearbeiten ----------

function AddPositionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [gewaehlt, setGewaehlt] = useState<SearchResult | null>(null);
  const [shares, setShares] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const mutation = usePortfolioMutation((input: { symbol: string; shares: string; buyPrice: string | null }) =>
    api.post('/api/positions', input)
  );

  const reset = () => {
    setGewaehlt(null);
    setShares('');
    setBuyPrice('');
    mutation.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="p-0">
        <div className="p-5 pb-0">
          <DialogTitle>Position hinzufügen</DialogTitle>
        </div>
        {!gewaehlt ? (
          <div className="px-1.5 pb-1.5">
            <SymbolSearch onPick={setGewaehlt} placeholder="Name oder Ticker …" />
          </div>
        ) : (
          <form
            className="grid gap-3 p-5 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(
                { symbol: gewaehlt.symbol, shares, buyPrice: buyPrice || null },
                { onSuccess: () => { onClose(); reset(); } }
              );
            }}
          >
            <div className="flex items-center gap-2 text-[13px]">
              <Badge variant="chip">{gewaehlt.symbol}</Badge>
              <span className="truncate text-ink2">{gewaehlt.name}</span>
              <button
                type="button"
                onClick={() => setGewaehlt(null)}
                className="ml-auto cursor-pointer text-[12px] text-ink3 hover:text-ink"
              >
                ändern
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink3">
                Stück
                <Input
                  type="number"
                  step="any"
                  min="0"
                  required
                  autoFocus
                  placeholder="z. B. 25"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink3">
                Ø-Kaufkurs
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="z. B. 105,50"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                />
              </label>
            </div>
            {mutation.isError && (
              <p className="text-[12.5px] text-down">Fehler: {(mutation.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-2.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => { onClose(); reset(); }}>
                Abbrechen
              </Button>
              <Button type="submit" size="sm" disabled={mutation.isPending}>
                Hinzufügen
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditPositionDialog({ position, onClose }: { position: Position | null; onClose: () => void }) {
  const [shares, setShares] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [geladenFuer, setGeladenFuer] = useState<string | null>(null);
  const mutation = usePortfolioMutation((input: { id: string; shares: number; buyPrice: number | null }) =>
    api.patch(`/api/positions/${input.id}`, { shares: input.shares, buyPrice: input.buyPrice })
  );

  if (position && geladenFuer !== position.id) {
    setShares(String(position.shares));
    setBuyPrice(position.buyPrice != null ? String(position.buyPrice) : '');
    setGeladenFuer(position.id);
  }

  return (
    <Dialog open={!!position} onOpenChange={(o) => { if (!o) { onClose(); setGeladenFuer(null); } }}>
      <DialogContent>
        <DialogTitle>
          {position?.name} <span className="text-ink3">({position?.symbol})</span>
        </DialogTitle>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!position) return;
            mutation.mutate(
              { id: position.id, shares: Number(shares), buyPrice: buyPrice === '' ? null : Number(buyPrice) },
              { onSuccess: () => { onClose(); setGeladenFuer(null); } }
            );
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink3">
              Stück
              <Input type="number" step="any" min="0" required autoFocus value={shares} onChange={(e) => setShares(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink3">
              Ø-Kaufkurs
              <Input type="number" step="any" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
            </label>
          </div>
          {mutation.isError && (
            <p className="text-[12.5px] text-down">Fehler: {(mutation.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => { onClose(); setGeladenFuer(null); }}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              Speichern
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddWatchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mutation = usePortfolioMutation((symbol: string) => api.post('/api/watchlist', { symbol }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0">
        <div className="p-5 pb-0">
          <DialogTitle>Wert beobachten</DialogTitle>
        </div>
        <div className="px-1.5 pb-1.5">
          <SymbolSearch
            placeholder="Name oder Ticker suchen …"
            onPick={(r) => {
              mutation.mutate(r.symbol);
              onClose();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Tabellen ----------

const TH = ({ className, ...p }: React.ComponentProps<'th'>) => (
  <th
    className={cn('pb-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.13em] text-ink3', className)}
    {...p}
  />
);

function Positionen({ d }: { d: Dashboard }) {
  const navigate = useNavigate();
  const [addOffen, setAddOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Position | null>(null);
  const loeschen = usePortfolioMutation((id: string) => api.del(`/api/positions/${id}`));

  return (
    <Panel className="animate-rise" style={{ animationDelay: '120ms' }}>
      <PanelTitle>Positionen</PanelTitle>
      {d.positions.length === 0 ? (
        <Empty>
          <b className="mb-1 block text-[14px] text-ink2">Noch keine Positionen.</b>
          Über „+ Position hinzufügen" unten legst du deine erste an — die Kurse laufen dann automatisch ein.
        </Empty>
      ) : (
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <TH>Wert</TH>
              <TH className="text-right">Kurs</TH>
              <TH className="text-right">Heute</TH>
              <TH>
                Trend <span className="font-medium normal-case tracking-normal">30 T.</span>
              </TH>
              <TH className="text-right">Wert (EUR)</TH>
              <TH className="text-right">G/V</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {d.positions.map((p) => (
              <tr
                key={p.id}
                onClick={() => navigate(`/analyse?symbol=${encodeURIComponent(p.symbol)}`)}
                className="group cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-panel2"
              >
                <td className="py-3 pr-3">
                  <div className="font-medium text-ink">{p.name}</div>
                  <div className="font-mono text-[11px] tracking-wide text-ink3">
                    {p.symbol} · {p.shares} Stk.
                  </div>
                </td>
                <td className="py-3 text-right font-mono text-[13px] tnum">{fmtMoney(p.preis, p.waehrung)}</td>
                <td className={cn('py-3 text-right font-mono text-[13px] tnum', signClass(p.tagesPct))}>
                  {fmtPct(p.tagesPct)}
                  <PrepostMini ab={p.ausserboerslich} />
                </td>
                <td className="py-3 pl-2">
                  <Sparkline values={p.sparkline} />
                </td>
                <td className="py-3 text-right font-mono text-[13px] tnum">{fmtEur(p.valueEur)}</td>
                <td className={cn('py-3 text-right font-mono text-[13px] tnum', signClass(p.gewinnEur))}>
                  {fmtEur(p.gewinnEur)} <span className="text-ink3">({fmtPct(p.gewinnPct)})</span>
                </td>
                <td className="w-[1%] whitespace-nowrap py-3 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <span className="flex items-center gap-0.5 opacity-30 transition-opacity group-hover:opacity-100">
                    <Button variant="icon" size="icon" title="Stückzahl / Ø-Kaufkurs ändern" onClick={() => setBearbeite(p)}>
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="icon"
                      size="icon"
                      className="hover:text-down"
                      title="Position löschen"
                      onClick={() => loeschen.mutate(p.id)}
                    >
                      <X size={15} />
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Button variant="ghost" size="sm" className="mt-4" onClick={() => setAddOffen(true)}>
        + Position hinzufügen
      </Button>
      <AddPositionDialog open={addOffen} onClose={() => setAddOffen(false)} />
      <EditPositionDialog position={bearbeite} onClose={() => setBearbeite(null)} />
    </Panel>
  );
}

function Watchlist({ d }: { d: Dashboard }) {
  const navigate = useNavigate();
  const [addOffen, setAddOffen] = useState(false);
  const entfernen = usePortfolioMutation((symbol: string) => api.del(`/api/watchlist/${encodeURIComponent(symbol)}`));

  return (
    <Panel className="animate-rise" style={{ animationDelay: '170ms' }}>
      <PanelTitle>Watchlist</PanelTitle>
      {d.watchlist.length === 0 ? (
        <Empty>Keine beobachteten Werte — über „+ Wert beobachten" unten hinzufügen.</Empty>
      ) : (
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <TH>Wert</TH>
              <TH className="text-right">Kurs</TH>
              <TH className="text-right">Heute</TH>
              <TH>
                Trend <span className="font-medium normal-case tracking-normal">30 T.</span>
              </TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {d.watchlist.map((w) => (
              <tr
                key={w.symbol}
                onClick={() => navigate(`/analyse?symbol=${encodeURIComponent(w.symbol)}`)}
                className="group cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-panel2"
              >
                <td className="py-3 pr-3">
                  <div className="font-medium text-ink">{w.name}</div>
                  <div className="font-mono text-[11px] tracking-wide text-ink3">{w.symbol}</div>
                </td>
                <td className="py-3 text-right font-mono text-[13px] tnum">{fmtMoney(w.preis, w.waehrung)}</td>
                <td className={cn('py-3 text-right font-mono text-[13px] tnum', signClass(w.tagesPct))}>
                  {fmtPct(w.tagesPct)}
                  <PrepostMini ab={w.ausserboerslich} />
                </td>
                <td className="py-3 pl-2">
                  <Sparkline values={w.sparkline} />
                </td>
                <td className="w-[1%] whitespace-nowrap py-3 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <span className="flex justify-end opacity-30 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="icon"
                      size="icon"
                      className="hover:text-down"
                      title="Von der Watchlist entfernen"
                      onClick={() => entfernen.mutate(w.symbol)}
                    >
                      <X size={15} />
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Button variant="ghost" size="sm" className="mt-4" onClick={() => setAddOffen(true)}>
        + Wert beobachten
      </Button>
      <AddWatchDialog open={addOffen} onClose={() => setAddOffen(false)} />
    </Panel>
  );
}

// ---------- Allokation ----------

function Allokation({ d }: { d: Dashboard }) {
  const slices = useMemo(() => {
    const top = d.allokation.slice(0, 7);
    const rest = d.allokation.slice(7);
    const list = top.map((g, i) => ({
      label: g.label,
      value: g.valueEur,
      color: CAT_COLORS[i],
      pct: (g.valueEur / d.totalEur) * 100,
      symbole: g.symbole ?? [],
    }));
    if (rest.length) {
      const restSum = rest.reduce((s, g) => s + g.valueEur, 0);
      list.push({ label: 'Weitere', value: restSum, color: CAT_COLORS[7], pct: (restSum / d.totalEur) * 100, symbole: [] });
    }
    return list;
  }, [d]);

  return (
    <Panel className="animate-rise" style={{ animationDelay: '220ms' }}>
      <PanelTitle>Allokation</PanelTitle>
      {d.positions.length === 0 || d.totalEur <= 0 ? (
        <Empty>Sobald Positionen da sind, erscheint hier die Aufteilung.</Empty>
      ) : (
        <div className="flex flex-wrap items-center gap-7">
          <Donut slices={slices.map((s) => ({ label: s.label, value: s.value, color: s.color, text: fmtEur(s.value) }))} />
          <div className="grid min-w-[220px] flex-1 gap-2.5">
            {slices.map((s) => (
              <div key={s.label} className="flex items-start gap-2.5">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] font-medium text-ink">{s.label}</span>
                    <span className="font-mono text-[13px] font-semibold tnum">{fmtPct(s.pct, false)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-ink3">
                    {s.symbole.length ? <span className="truncate">{s.symbole.join(' · ')}</span> : <span />}
                    <span className="tnum">{fmtEur(s.value)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------- News ----------

function NewsLage() {
  const { data, isLoading, error } = useNewsfeed();
  return (
    <Panel className="animate-rise" style={{ animationDelay: '150ms' }}>
      <PanelTitle hint="· KI-bewertet, deinen Werten zugeordnet">News-Lage</PanelTitle>
      {isLoading && (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      )}
      {error && <Empty>News nicht erreichbar: {(error as Error).message}</Empty>}
      {data &&
        (data.items.length === 0 ? (
          <Empty>Keine News gefunden.</Empty>
        ) : (
          <>
            {(data.feedErrors ?? []).map((f) => (
              <p key={f} className="mb-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-ink2">
                Feed nicht erreichbar: {f}
              </p>
            ))}
            {data.items.slice(0, 5).map((n, i) => (
              <NewsItem key={`${n.link}-${i}`} n={n} zeigeChips />
            ))}
            {data.items.length > 5 && (
              <Accordion type="single" collapsible>
                <AccordionItem value="mehr" className="border-0">
                  <AccordionTrigger>Mehr anzeigen ({data.items.length - 5})</AccordionTrigger>
                  <AccordionContent>
                    {data.items.slice(5).map((n, i) => (
                      <NewsItem key={`${n.link}-rest-${i}`} n={n} zeigeChips />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </>
        ))}
    </Panel>
  );
}

// ---------- Seite ----------

export default function DashboardPage() {
  const { data: d, isLoading, error } = useDashboard();

  const heute = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="grid gap-5">
      <header className="animate-rise">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] text-ink3">
          {heute}
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <h1 className="mt-1.5 font-display text-[clamp(26px,3.4vw,38px)] font-bold tracking-tight">
          Dein Depot, <em className="not-italic text-accent">auf einen Blick.</em>
        </h1>
      </header>

      {error && (
        <Panel>
          <Empty>
            Daten konnten nicht geladen werden: {(error as Error).message}. Läuft der Server? Besteht eine
            Internetverbindung?
          </Empty>
        </Panel>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[128px]" />
          ))}
        </div>
      )}

      {d && (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(280px,1.35fr)_1fr_1fr]">
            <StatCard
              label="Gesamtwert (EUR)"
              value={d.positions.length ? fmtEur(d.totalEur) : '—'}
              sub={d.fx?.USD ? `USD→EUR ${d.fx.USD.toFixed(4)}` : undefined}
              featured
            />
            <StatCard
              label="Gewinn / Verlust"
              value={d.positions.length ? fmtEur(d.gewinnEur) : '—'}
              valueClass={cn('text-[26px]', signClass(d.gewinnEur))}
              sub={d.gewinnPct != null ? `${fmtPct(d.gewinnPct)} seit Kauf` : undefined}
              delay={60}
            />
            <StatCard
              label="Heute"
              value={d.positions.length ? fmtEur(d.dayChangeEur) : '—'}
              valueClass={cn('text-[26px]', signClass(d.dayChangeEur))}
              sub={d.dayChangePct != null ? `${fmtPct(d.dayChangePct)} zum Vortag` : undefined}
              delay={120}
            />
          </div>

          {d.termine.length > 0 && (
            <Panel className="animate-rise" style={{ animationDelay: '90ms' }}>
              <PanelTitle hint="· nächste 14 Tage">Wichtige Termine</PanelTitle>
              <div className="grid grid-cols-1 gap-x-10 gap-y-4 lg:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink3">Deine Werte</div>
                  {d.termine.filter((t) => t.typ !== 'Markt').length ? (
                    d.termine.filter((t) => t.typ !== 'Markt').map((t, i) => <TerminWert key={i} t={t} />)
                  ) : (
                    <p className="py-2 text-[13px] text-ink3">Keine Termine deiner Werte.</p>
                  )}
                </div>
                <div>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink3">Markt-Events</div>
                  {d.termine.filter((t) => t.typ === 'Markt').length ? (
                    d.termine
                      .filter((t) => t.typ === 'Markt')
                      .slice(0, 3)
                      .map((t, i) => <TerminMarkt key={i} t={t} />)
                  ) : (
                    <p className="py-2 text-[13px] text-ink3">Keine großen Markt-Events.</p>
                  )}
                </div>
              </div>
            </Panel>
          )}

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.55fr_1fr]">
            <div className="grid gap-5">
              <Positionen d={d} />
              <Watchlist d={d} />
              <Allokation d={d} />
            </div>
            <NewsLage />
          </div>
        </>
      )}
    </div>
  );
}
