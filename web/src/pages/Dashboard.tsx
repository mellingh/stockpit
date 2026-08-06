import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useTitel } from '@/lib/router';
import { Pencil, X } from 'lucide-react';
import { Panel, PanelTitle, Empty } from '@/components/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton, SkeletonRows, SkeletonText } from '@/components/ui/skeleton';
import { SymbolSearch } from '@/components/symbol-search';
import { Donut, CAT_COLORS } from '@/components/donut';
import { ScrollListe } from '@/components/scroll-liste';
import { NewsItem } from '@/components/news';
import { api, type Dashboard, type Position, type SearchResult, type Termin, type Ausserboerslich } from '@/lib/api';
import { useDashboard, useNewsfeed, usePortfolioMutation } from '@/lib/queries';
import { fmtEur, fmtEps, fmtMoney, fmtMoneyGanz, fmtPct, fmtDate, signClass } from '@/lib/format';
import { flagge } from '@/lib/event-lexikon';
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
          ? { background: 'linear-gradient(135deg, rgba(107,165,255,0.08), rgba(107,165,255,0) 55%), var(--color-panel)' }
          : undefined),
      }}
    >
      <span className="text-micro font-bold uppercase tracking-[0.14em] text-ink3">{label}</span>
      <div>
        <div className={cn('font-display font-bold leading-tight tnum', featured ? 'text-display-lg' : 'text-display-md', valueClass)}>{value}</div>
        {sub ? <div className="mt-1 font-mono text-micro text-ink2 tnum">{sub}</div> : null}
      </div>
    </Panel>
  );
}

// ---------- Wichtige Termine ----------

function wannVon(t: Termin) {
  const d = new Date(t.date);
  const uhr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  // Kalendertage selbst rechnen statt t.days zu trauen: der Server hält gemeldete
  // Zahlen 3 Tage in der Liste und meldete dabei days:0 — ein gestriger 22-Uhr-Termin
  // stand als „heute 22:00" ÜBER „heute 14:30" und wirkte falsch sortiert (Runde 33)
  const heute0 = new Date();
  heute0.setHours(0, 0, 0, 0);
  const d0 = new Date(d);
  d0.setHours(0, 0, 0, 0);
  const tage = Math.round((+d0 - +heute0) / 86_400_000);
  if (tage === -1) return `gestern ${uhr}`;
  if (tage === 0) return `heute ${uhr}`;
  if (tage === 1) return `morgen ${uhr}`;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function TerminWert({ t }: { t: Termin }) {
  return (
    <Link
      to={`/analyse?symbol=${encodeURIComponent(t.symbol!)}`}
      title={`${t.name} — ${t.typ}, ${fmtDate(t.date)}`}
      className="flex min-h-[45px] items-center gap-3 border-b border-line py-2.5 text-small text-ink transition-colors hover:bg-panel2"
    >
      <span className="w-[96px] shrink-0 font-mono text-micro text-ink3">{wannVon(t)}</span>
      {/* feste Spaltenbreite: sonst beginnt „Quartalszahlen" je nach Ticker-Länge woanders */}
      <span className="w-[68px] shrink-0">
        <Badge variant="chip">{t.symbol}</Badge>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {t.typ === 'Quartalszahlen' ? 'Quartalszahlen' : 'Ex-Dividende'}
        {t.epsErwartet != null && (
          <span className="font-mono text-micro text-ink2 tnum">EPS erw. {fmtEps(t.epsErwartet)}</span>
        )}
        {t.epsTatsaechlich != null && (
          <span
            className={cn(
              'border-l border-line-strong pl-3 font-mono text-micro tnum',
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
      // Land gehört in den Schlüssel: dieselbe Kennzahl kann am selben Tag in
      // mehreren Ländern erscheinen (Arbeitslosenquote US + CA öffnete beide)
      to={`/kalender?${t.days === 0 ? '' : 'tag=woche&'}event=${encodeURIComponent(`${t.date}~${t.name}~${t.land ?? ''}`)}`}
      title={`${t.name} — Prognose ${t.prognose ?? '–'}, vorher ${t.vorher ?? '–'}`}
      className="flex min-h-[45px] items-center gap-3 border-b border-line py-2.5 text-small text-ink transition-colors hover:bg-panel2"
    >
      <span className="w-[96px] shrink-0 font-mono text-micro text-ink3">{wannVon(t)}</span>
      <span className="w-[56px] shrink-0 whitespace-nowrap" title={t.waehrung ?? ''}><span className="mr-1.5 text-lg leading-none">{flagge(t.land)}</span>{t.land ?? t.waehrung}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {kurzTitel}
        {t.prognose && <span className="font-mono text-micro text-ink2 tnum">Prog. {t.prognose}</span>}
        {t.aktuell && (
          <span
            className={cn(
              'border-l border-line-strong pl-3 font-mono text-micro tnum',
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

/**
 * Umgerechneter EUR-Kurs als Zweitzeile unter dem Börsenkurs — der Kurs selbst
 * bleibt in der Handelswährung (das ist die echte Notierung), aber wer in EUR
 * kauft, sieht sofort, was ein Stück gerade kostet (Micha, Runde 24).
 */
function KursInEur({
  preis,
  waehrung,
  fx,
}: {
  preis: number | null;
  waehrung: string | null;
  fx: Record<string, number | null>;
}) {
  if (preis == null || !waehrung || waehrung === 'EUR') return null;
  const rate = fx?.[waehrung];
  if (rate == null) return null;
  return <span className="block text-micro text-ink3 tnum">≈ {fmtEur(preis * rate)}</span>;
}

/** Wechselkurs nach EUR — EUR selbst zählt als 1, Unbekanntes als null */
function rateEur(fx: Record<string, number | null>, w: string | null | undefined): number | null {
  if (!w) return null;
  return w === 'EUR' ? 1 : (fx?.[w] ?? null);
}

/**
 * Positions-Geldzellen in der KAUFwährung (Micha, Runde 29): Kurs, Wert und G/V
 * stehen primär in der Währung, in der gekauft wurde (buyCurrency, sonst
 * Notierungswährung) — darunter klein die ≈-Umrechnung: in EUR, bzw. bei
 * EUR-Käufen fremdnotierter Werte die Notierungswährung. So decken sich die
 * Zahlen mit dem Broker-Depot.
 */
function KursKauf({ p, fx }: { p: Position; fx: Record<string, number | null> }) {
  const k = p.buyCurrency || p.waehrung;
  const rN = rateEur(fx, p.waehrung);
  const rK = rateEur(fx, k);
  if (p.preis != null && k && k !== p.waehrung && rN != null && rK != null) {
    return (
      <>
        {fmtMoney((p.preis * rN) / rK, k)}
        <span className="block text-micro text-ink3 tnum">≈ {fmtMoney(p.preis, p.waehrung)}</span>
      </>
    );
  }
  return (
    <>
      {fmtMoney(p.preis, p.waehrung)}
      <KursInEur preis={p.preis} waehrung={p.waehrung} fx={fx} />
    </>
  );
}

/**
 * Ø-Kaufkurs mit ≈-Umrechnung wie die Kurs-Spalte (Micha, Runde 38) — Umrechnung
 * zum HEUTIGEN Wechselkurs (der historische ist ohne Kaufdatum nicht bekannt).
 */
function OKaufZelle({ p, fx }: { p: Position; fx: Record<string, number | null> }) {
  const k = p.buyCurrency || p.waehrung;
  if (p.buyPrice == null || !k) return <>{fmtMoney(p.buyPrice, k)}</>;
  const rK = rateEur(fx, k);
  const rN = rateEur(fx, p.waehrung);
  const eur = rK != null ? p.buyPrice * rK : null;
  return (
    <>
      {fmtMoney(p.buyPrice, k)}
      {k !== 'EUR' && eur != null && (
        <span className="block text-micro text-ink3 tnum">≈ {fmtEur(eur)}</span>
      )}
      {k === 'EUR' && p.waehrung && p.waehrung !== 'EUR' && rN != null && eur != null && (
        <span className="block text-micro text-ink3 tnum">≈ {fmtMoney(eur / rN, p.waehrung)}</span>
      )}
    </>
  );
}

function BetragKauf({
  eur,
  p,
  fx,
  suffix,
}: {
  eur: number | null;
  p: Position;
  fx: Record<string, number | null>;
  /** steht inline HINTER dem Primärbetrag (z. B. die G/V-Prozentklammer) */
  suffix?: React.ReactNode;
}) {
  const k = p.buyCurrency || p.waehrung;
  const rK = rateEur(fx, k);
  const rN = rateEur(fx, p.waehrung);
  if (eur == null || !k || rK == null)
    return (
      <>
        {fmtEur(eur)}
        {suffix}
      </>
    );
  if (k === 'EUR') {
    // in EUR gekauft: EUR primär, bei Fremdnotierung ≈ Notierungswährung darunter
    return (
      <>
        {fmtEur(eur)}
        {suffix}
        {p.waehrung && p.waehrung !== 'EUR' && rN != null && (
          <span className="block text-micro text-ink3 tnum">≈ {fmtMoneyGanz(eur / rN, p.waehrung)}</span>
        )}
      </>
    );
  }
  return (
    <>
      {fmtMoneyGanz(eur / rK, k)}
      {suffix}
      <span className="block text-micro text-ink3 tnum">≈ {fmtEur(eur)}</span>
    </>
  );
}

/**
 * Aggregierter Pre-/After-Market-Effekt fürs Depot (Micha, Runde 38): Summe über
 * alle Positionen mit außerbörslichem Kurs — shares × (Prepost − Schluss) × FX.
 * Erscheint als Zweitzeile in der „Heute"-Kachel, nur wenn Daten da sind
 * (nur US-Börsen liefern Pre/Post; XETRA & Co. fallen still weg).
 */
function PrepostSumme({ d }: { d: Dashboard }) {
  let delta = 0;
  let basis = 0;
  let phase: 'pre' | 'post' | null = null;
  for (const p of d.positions) {
    const ab = p.ausserboerslich;
    const rate = rateEur(d.fx, p.waehrung);
    if (!ab || ab.preis == null || p.preis == null || rate == null) continue;
    delta += p.shares * (ab.preis - p.preis) * rate;
    basis += p.shares * p.preis * rate;
    phase = ab.phase;
  }
  if (!phase || !basis) return null;
  const pct = (delta / basis) * 100;
  return (
    <span className={cn('block', signClass(delta))}>
      {phase === 'pre' ? 'Pre-Market' : 'Nachbörslich'} {delta >= 0 ? '+' : ''}
      {fmtEur(delta)} ({fmtPct(pct)})
    </span>
  );
}

// ---------- Pre-/After-Market-Mini ----------

function PrepostMini({ ab }: { ab: Ausserboerslich | null }) {
  if (!ab || ab.pct == null) return null;
  return (
    <span
      className={cn('block text-micro opacity-90 tnum', signClass(ab.pct))}
      title={ab.phase === 'pre' ? 'Vorbörslicher Handel (Pre-Market)' : 'Nachbörslicher Handel (After-Hours)'}
    >
      {ab.phase === 'pre' ? 'Pre' : 'Post'} {fmtPct(ab.pct)}
    </span>
  );
}

// ---------- Position hinzufügen / bearbeiten ----------

/** Kaufwährung: je nach Broker EUR (z. B. ING) oder direkt USD/GBP an der Heimatbörse */
const KAUF_WAEHRUNGEN = ['EUR', 'USD', 'GBP', 'CHF'] as const;

function WaehrungSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // dunkler Hintergrund explizit — native Selects fallen sonst aus dem Dark Mode
      className="h-control-md w-full cursor-pointer rounded-md border border-line-strong bg-bg px-2.5 text-base text-ink outline-none transition-colors hover:border-ink3 focus:border-accent"
    >
      <option value="">Währung der Aktie</option>
      {KAUF_WAEHRUNGEN.map((w) => (
        <option key={w} value={w}>
          {w}
        </option>
      ))}
    </select>
  );
}

function AddPositionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [gewaehlt, setGewaehlt] = useState<SearchResult | null>(null);
  const [shares, setShares] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyCurrency, setBuyCurrency] = useState('');
  const mutation = usePortfolioMutation(
    (input: { symbol: string; shares: string; buyPrice: string | null; buyCurrency: string | null }) =>
      api.post('/api/positions', input)
  );

  const reset = () => {
    setGewaehlt(null);
    setShares('');
    setBuyPrice('');
    setBuyCurrency('');
    mutation.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="p-0">
        <div className="px-5 pb-4 pt-4">
          {/* pr-9: rechts sitzt das absolute ✕ des Dialogs */}
          <DialogTitle className="mb-0 pr-9">Position hinzufügen</DialogTitle>
        </div>
        {!gewaehlt ? (
          <div className="px-3.5 pb-3">
            <SymbolSearch onPick={setGewaehlt} placeholder="Name oder Ticker …" zeigeEigene={false} />
          </div>
        ) : (
          <form
            className="grid gap-3 p-5 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(
                { symbol: gewaehlt.symbol, shares, buyPrice: buyPrice || null, buyCurrency: buyCurrency || null },
                { onSuccess: () => { onClose(); reset(); } }
              );
            }}
          >
            <div className="flex items-center gap-2 text-small">
              <Badge variant="chip">{gewaehlt.symbol}</Badge>
              <span className="truncate text-ink2">{gewaehlt.name}</span>
              <Button type="button" variant="ghost" size="xs" className="ml-auto" onClick={() => setGewaehlt(null)}>
                Ändern
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-micro font-semibold uppercase tracking-wider text-ink3">
                Stück
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  required
                  autoFocus
                  placeholder="z. B. 25"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-micro font-semibold uppercase tracking-wider text-ink3">
                Ø-Kaufkurs
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  placeholder="z. B. 105,50"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-micro font-semibold uppercase tracking-wider text-ink3">
              Bezahlt in
              <WaehrungSelect value={buyCurrency} onChange={setBuyCurrency} />
            </label>
            <p className="text-micro leading-relaxed text-ink3">
              Je nach Broker zahlst du in EUR (z.&nbsp;B. ING) oder direkt in der Börsenwährung — davon
              hängt die Gewinn-Berechnung ab.
            </p>
            {mutation.isError && (
              <p className="text-small text-down">Fehler: {(mutation.error as Error).message}</p>
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

/**
 * Bearbeiten-Dialog. Die Startwerte kommen aus der Position; der Aufrufer
 * gibt der Komponente ein `key` mit der Positions-ID, damit React sie beim
 * Wechsel neu erzeugt — so braucht es kein State-Sync im Render (React-Regel
 * „derived state without effect").
 */
function EditPositionDialog({ position, onClose }: { position: Position | null; onClose: () => void }) {
  const [shares, setShares] = useState(position ? String(position.shares) : '');
  const [buyPrice, setBuyPrice] = useState(
    position?.buyPrice != null ? String(position.buyPrice) : ''
  );
  const [buyCurrency, setBuyCurrency] = useState(position?.buyCurrency ?? '');
  const mutation = usePortfolioMutation(
    (input: { id: string; shares: number; buyPrice: number | null; buyCurrency: string | null }) =>
      api.patch(`/api/positions/${input.id}`, {
        shares: input.shares,
        buyPrice: input.buyPrice,
        buyCurrency: input.buyCurrency,
      })
  );

  return (
    <Dialog open={!!position} onOpenChange={(o) => { if (!o) onClose(); }}>
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
              {
                id: position.id,
                shares: Number(shares),
                buyPrice: buyPrice === '' ? null : Number(buyPrice),
                buyCurrency: buyCurrency || null,
              },
              { onSuccess: onClose }
            );
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-micro font-semibold uppercase tracking-wider text-ink3">
              Stück
              <Input type="number"
                  inputMode="decimal" step="any" min="0" required autoFocus value={shares} onChange={(e) => setShares(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-micro font-semibold uppercase tracking-wider text-ink3">
              Ø-Kaufkurs
              <Input type="number"
                  inputMode="decimal" step="any" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
            </label>
          </div>
          <label className="grid gap-1.5 text-micro font-semibold uppercase tracking-wider text-ink3">
            Bezahlt in
            <WaehrungSelect value={buyCurrency} onChange={setBuyCurrency} />
          </label>
          {mutation.isError && (
            <p className="text-small text-down">Fehler: {(mutation.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); mutation.reset(); } }}>
      <DialogContent className="p-0">
        <div className="px-5 pb-4 pt-4">
          <DialogTitle className="mb-0 pr-9">Wert beobachten</DialogTitle>
        </div>
        {/* Ablehnung des Servers (z. B. "liegt bereits in deinen Positionen")
            anzeigen statt still zu schließen */}
        {mutation.isError && (
          <p role="status" aria-live="polite" className="mx-5 mb-2 text-small leading-relaxed text-down">
            {(mutation.error as Error).message}
          </p>
        )}
        <div className="px-3.5 pb-3">
          <SymbolSearch
            placeholder="Name oder Ticker suchen …"
            zeigeEigene={false}
            onPick={(r) => {
              mutation.mutate(r.symbol, { onSuccess: () => { onClose(); mutation.reset(); } });
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
    className={cn('pb-2.5 text-left text-micro font-bold uppercase tracking-[0.14em] text-ink3', className)}
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
          <b className="mb-1 block text-base text-ink2">Noch keine Positionen.</b>
          Über „+ Position hinzufügen" unten legst du deine erste an — die Kurse laufen dann automatisch ein.
        </Empty>
      ) : (
        <ScrollListe className="max-h-[570px]">
        <table className="w-full table-fixed border-collapse text-small">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr>
              {/* Feste Breiten: Positionen und Watchlist teilen sich dasselbe
                  Spaltenraster — Kurs steht unter Kurs. Die Verlauf-Sparkline ist
                  raus (Micha, Runde 31: sagte nichts aus, was „Heute" nicht zeigt) —
                  dafür Ø Kauf und mehr Luft für Wert/G/V/Aktionen. */}
              <TH><span className="sr-only">Wert</span></TH>
              <TH className="w-[104px] text-right">Kurs</TH>
              <TH className="w-[96px] text-right">Heute</TH>
              <TH className="w-[104px] text-right" title="Dein Ø-Kaufkurs je Stück, in der Währung, in der du gekauft hast">
                Ø Kauf
              </TH>
              <TH className="w-[130px] text-right" title="Aktueller Positionswert in deiner Kaufwährung, darunter die Umrechnung">Wert</TH>
              <TH className="w-[200px] text-right">G/V</TH>
              <TH className="w-[64px]" />
            </tr>
          </thead>
          <tbody>
            {/* Nach Sektor gruppiert (Micha, Runde 24) — Trennzeilen wie die
                Tages-Separatoren im Kalender */}
            {[...d.positions]
              .sort(
                (a, b) =>
                  (a.sektor ?? 'Sonstige').localeCompare(b.sektor ?? 'Sonstige') ||
                  (b.valueEur ?? 0) - (a.valueEur ?? 0)
              )
              .map((p, i, arr) => (
              <Fragment key={p.id}>
                {(i === 0 || (arr[i - 1].sektor ?? 'Sonstige') !== (p.sektor ?? 'Sonstige')) && (
                  <tr className="border-b border-line">
                    {/* Luft über der Gruppe: erste Gruppe knapp, alle weiteren deutlich
                        abgesetzt (Micha, Runde 25 — „sehen, wo sich die Gruppen trennen") */}
                    <td colSpan={7} className={cn('pb-1.5 text-micro font-bold uppercase tracking-[0.14em] text-accent', i === 0 ? 'pt-1' : 'pt-7')}>
                      {p.sektor ?? 'Sonstige'}
                    </td>
                  </tr>
                )}
              <tr
                onClick={() => navigate(`/analyse?symbol=${encodeURIComponent(p.symbol)}`)}
                className="group cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-panel2"
              >
                <td className="py-3 pr-3">
                  {/* echter Link: Strg-/Mittelklick öffnet einen neuen Tab */}
                  <Link
                    to={`/analyse?symbol=${encodeURIComponent(p.symbol)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-ink transition-colors hover:text-accent"
                  >
                    {p.name}
                  </Link>
                  <div className="font-mono text-micro tracking-wide text-ink3">
                    {p.symbol} · {p.shares} Stk.
                  </div>
                </td>
                <td className="py-3 text-right font-mono text-small tnum">
                  <KursKauf p={p} fx={d.fx} />
                </td>
                <td className={cn('py-3 text-right font-mono text-small tnum', signClass(p.tagesPct))}>
                  {fmtPct(p.tagesPct)}
                  <PrepostMini ab={p.ausserboerslich} />
                </td>
                <td className="py-3 text-right font-mono text-small text-ink2 tnum">
                  <OKaufZelle p={p} fx={d.fx} />
                </td>
                <td className="py-3 text-right font-mono text-small tnum">
                  <BetragKauf eur={p.valueEur} p={p} fx={d.fx} />
                </td>
                <td className={cn('py-3 text-right font-mono text-small tnum', signClass(p.gewinnEur))}>
                  <BetragKauf
                    eur={p.gewinnEur}
                    p={p}
                    fx={d.fx}
                    suffix={<span className="text-ink3"> ({fmtPct(p.gewinnPct)})</span>}
                  />
                </td>
                <td className="whitespace-nowrap py-3 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <span className="flex items-center justify-end gap-0 opacity-30 transition-opacity group-hover:opacity-100">
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
                      <X size={14} />
                    </Button>
                  </span>
                </td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        </ScrollListe>
      )}
      <Button variant="action" size="sm" className="mt-4" onClick={() => setAddOffen(true)}>
        + Position hinzufügen
      </Button>
      <AddPositionDialog open={addOffen} onClose={() => setAddOffen(false)} />
      <EditPositionDialog key={bearbeite?.id ?? "leer"} position={bearbeite} onClose={() => setBearbeite(null)} />
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
        <ScrollListe className="max-h-[570px]">
        <table className="w-full table-fixed border-collapse text-small">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr>
              {/* Gleiches Spaltenraster wie die Positionen-Tabelle; der Füller
                  ersetzt Ø Kauf + Wert + G/V, damit Kurs/Heute exakt
                  untereinander stehen. */}
              <TH><span className="sr-only">Wert</span></TH>
              <TH className="w-[104px] text-right">Kurs</TH>
              <TH className="w-[96px] text-right">Heute</TH>
              <TH className="w-[434px]" />
              <TH className="w-[64px]" />
            </tr>
          </thead>
          <tbody>
            {/* gleiche Sektor-Gruppierung wie die Positionen-Tabelle */}
            {[...d.watchlist]
              .sort(
                (a, b) =>
                  (a.sektor ?? 'Sonstige').localeCompare(b.sektor ?? 'Sonstige') ||
                  a.name.localeCompare(b.name)
              )
              .map((w, i, arr) => (
              <Fragment key={w.symbol}>
                {(i === 0 || (arr[i - 1].sektor ?? 'Sonstige') !== (w.sektor ?? 'Sonstige')) && (
                  <tr className="border-b border-line">
                    <td colSpan={5} className={cn('pb-1.5 text-micro font-bold uppercase tracking-[0.14em] text-accent', i === 0 ? 'pt-1' : 'pt-7')}>
                      {w.sektor ?? 'Sonstige'}
                    </td>
                  </tr>
                )}
              <tr
                onClick={() => navigate(`/analyse?symbol=${encodeURIComponent(w.symbol)}`)}
                className="group cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-panel2"
              >
                <td className="py-3 pr-3">
                  <Link
                    to={`/analyse?symbol=${encodeURIComponent(w.symbol)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-ink transition-colors hover:text-accent"
                  >
                    {w.name}
                  </Link>
                  <div className="font-mono text-micro tracking-wide text-ink3">{w.symbol}</div>
                </td>
                <td className="py-3 text-right font-mono text-small tnum">
                  {fmtMoney(w.preis, w.waehrung)}
                  <KursInEur preis={w.preis} waehrung={w.waehrung} fx={d.fx} />
                </td>
                <td className={cn('py-3 text-right font-mono text-small tnum', signClass(w.tagesPct))}>
                  {fmtPct(w.tagesPct)}
                  <PrepostMini ab={w.ausserboerslich} />
                </td>
                <td aria-hidden />
                <td className="whitespace-nowrap py-3 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <span className="flex justify-end opacity-30 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="icon"
                      size="icon"
                      className="hover:text-down"
                      title="Von der Watchlist entfernen"
                      onClick={() => entfernen.mutate(w.symbol)}
                    >
                      <X size={14} />
                    </Button>
                  </span>
                </td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        </ScrollListe>
      )}
      <Button variant="action" size="sm" className="mt-4" onClick={() => setAddOffen(true)}>
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
                    <span className="truncate text-small font-medium text-ink">{s.label}</span>
                    <span className="font-mono text-small font-semibold tnum">{fmtPct(s.pct, false)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 font-mono text-micro text-ink3">
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
      <PanelTitle>News-Lage</PanelTitle>
      {isLoading && (
        /* Gerüst einer News: Meta-Zeile, Titel, Badge-Zeile */
        <div className="grid gap-5" role="status" aria-label="News werden geladen">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid gap-2 border-b border-line pb-4 last:border-b-0">
              <Skeleton className="h-3 w-[190px]" />
              <SkeletonText zeilen={2} />
              <div className="mt-1 flex gap-2">
                <Skeleton className="h-control-xs w-[92px] rounded-full" />
                <Skeleton className="h-control-xs w-[66px] rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <Empty role="status" aria-live="polite">News nicht erreichbar: {(error as Error).message}</Empty>}
      {data &&
        (data.items.length === 0 ? (
          <Empty>Keine News gefunden.</Empty>
        ) : (
          <>
            {(data.feedErrors ?? []).map((f) => (
              <p key={f} className="mb-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-micro text-ink2">
                Feed nicht erreichbar: {f}
              </p>
            ))}
            {/* Gekappte Höhe + Scrollen statt „Mehr anzeigen" (Micha, Runde 32) —
                die Karte wächst nicht mehr endlos unter die Allokation hinaus */}
            <ScrollListe className="max-h-[820px]">
              {data.items.map((n, i) => (
                <NewsItem key={`${n.link}-${i}`} n={n} zeigeChips />
              ))}
            </ScrollListe>
          </>
        ))}
    </Panel>
  );
}

// ---------- Seite ----------

export default function DashboardPage() {
  useTitel('Dashboard');
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
        <div className="flex items-center gap-3 font-mono text-micro uppercase tracking-[0.14em] text-ink3">
          {heute}
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <h1 className="mt-1.5 font-display text-display-md font-bold tracking-tight text-balance">
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
        /* Gerüst des ganzen Dashboards: KPI-Karten, Termin-Spalten, Tabellen */
        <div className="grid gap-5" role="status" aria-label="Dashboard wird geladen">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(280px,1.35fr)_1fr_1fr]">
            {[0, 1, 2].map((i) => (
              <Panel key={i} className="flex min-h-[128px] flex-col justify-between">
                <Skeleton className="h-3 w-[110px]" />
                <div className="grid gap-2">
                  <Skeleton className="h-control-sm w-[150px]" />
                  <Skeleton className="h-3 w-[96px]" />
                </div>
              </Panel>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <Panel key={i}>
                <Skeleton className="mb-4 h-3 w-[130px]" />
                <SkeletonRows zeilen={4} />
              </Panel>
            ))}
          </div>
          <Panel>
            <Skeleton className="mb-4 h-3 w-[110px]" />
            <SkeletonRows zeilen={5} />
          </Panel>
        </div>
      )}

      {d && (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(280px,1.35fr)_1fr_1fr]">
            {/* Leerzustand: erklärender Platzhalter statt nacktem Strich */}
            <StatCard
              label="Gesamtwert (EUR)"
              value={
                d.positions.length ? (
                  fmtEur(d.totalEur)
                ) : (
                  <span className="text-base font-medium text-ink3">Noch keine Positionen</span>
                )
              }
              sub={
                d.positions.length
                  ? d.fx?.USD
                    ? `1 USD = ${d.fx.USD.toFixed(4).replace('.', ',')} €`
                    : undefined
                  : 'Lege unten deine erste Position an'
              }
              featured
            />
            <StatCard
              label="Gewinn / Verlust"
              value={
                d.positions.length ? (
                  fmtEur(d.gewinnEur)
                ) : (
                  <span className="text-base font-medium text-ink3">erscheint mit der ersten Position</span>
                )
              }
              valueClass={d.positions.length ? signClass(d.gewinnEur) : undefined}
              sub={d.gewinnPct != null ? `${fmtPct(d.gewinnPct)} seit Kauf` : undefined}
              delay={60}
            />
            <StatCard
              label="Heute"
              value={
                d.positions.length ? (
                  fmtEur(d.dayChangeEur)
                ) : (
                  <span className="text-base font-medium text-ink3">erscheint mit der ersten Position</span>
                )
              }
              valueClass={d.positions.length ? signClass(d.dayChangeEur) : undefined}
              sub={
                d.dayChangePct != null ? (
                  <>
                    {fmtPct(d.dayChangePct)} zum Vortag
                    <PrepostSumme d={d} />
                  </>
                ) : undefined
              }
              delay={120}
            />
          </div>

          {d.termine.length > 0 && (
            <Panel className="animate-rise" style={{ animationDelay: '90ms' }}>
              <PanelTitle>Wichtige Termine</PanelTitle>
              {/* Beide Spalten streng nach Zeit sortiert (das Nächste zuerst),
                  sichtbar sind ~5 Zeilen (5 × 45px), der Rest scrollt (Micha, Runde 32) */}
              <div className="grid grid-cols-1 gap-x-10 gap-y-4 lg:grid-cols-2">
                <div>
                  {/* „Deine Werte" ist raus (Micha, Runde 34) — die Gruppen Positionen |
                      Watchlist stehen direkt in der Markt-Events-Optik (grau statt accent),
                      jede für sich streng nach Zeit sortiert, das Nächste zuerst */}
                  {d.termine.filter((t) => t.typ !== 'Markt').length ? (
                    <ScrollListe className="max-h-[270px]">
                      {(['Positionen', 'Watchlist'] as const).map((gruppe) => {
                        const imDepot = new Set(d.positions.map((p) => p.symbol));
                        // maximal 1 Tag zurück (Micha, Runde 37) — Älteres fliegt raus
                        const gestern0 = new Date(new Date().setHours(0, 0, 0, 0)) .getTime() - 86_400_000;
                        const eintraege = d.termine
                          .filter((t) => t.typ !== 'Markt')
                          .filter((t) => (gruppe === 'Positionen') === imDepot.has(t.symbol ?? ''))
                          .filter((t) => +new Date(t.date) >= gestern0)
                          .sort((a, b) => +new Date(a.date) - +new Date(b.date));
                        if (!eintraege.length) return null;
                        return (
                          <Fragment key={gruppe}>
                            <div className="mb-1.5 pt-4 text-micro font-bold uppercase tracking-[0.14em] text-ink3 first:pt-0">
                              {gruppe}
                            </div>
                            {eintraege.map((t, i) => <TerminWert key={i} t={t} />)}
                          </Fragment>
                        );
                      })}
                    </ScrollListe>
                  ) : (
                    <p className="py-2 text-small text-ink3">Keine Termine deiner Werte.</p>
                  )}
                </div>
                <div>
                  <div className="mb-1.5 text-micro font-bold uppercase tracking-[0.14em] text-ink3">Markt-Events</div>
                  {d.termine.filter((t) => t.typ === 'Markt').length ? (
                    <ScrollListe className="max-h-[225px]">
                      {d.termine
                        .filter((t) => t.typ === 'Markt')
                        .filter((t) => +new Date(t.date) >= new Date(new Date().setHours(0, 0, 0, 0)).getTime() - 86_400_000)
                        .sort((a, b) => +new Date(a.date) - +new Date(b.date))
                        .map((t, i) => <TerminMarkt key={i} t={t} />)}
                    </ScrollListe>
                  ) : (
                    <p className="py-2 text-small text-ink3">Keine großen Markt-Events.</p>
                  )}
                </div>
              </div>
            </Panel>
          )}

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[2fr_1fr]">
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
