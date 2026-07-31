import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { searchSymbols, useDashboard, useTrending } from '@/lib/queries';
import type { SearchResult } from '@/lib/api';
import { fmtPct, signClass } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Vorschlag {
  symbol: string;
  name: string;
  tagesPct?: number | null;
}

// ---------- Zuletzt gesucht (lokal im Browser, wie alles hier) ----------

const SPEICHER = 'stockpit.letzteSuchen';
const MAX_LETZTE = 8;

function letzteLaden(): Vorschlag[] {
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER) ?? '[]');
    if (!Array.isArray(roh)) return [];
    return roh
      .filter((e) => e && typeof e.symbol === 'string')
      .slice(0, MAX_LETZTE)
      .map((e) => ({ symbol: e.symbol, name: typeof e.name === 'string' ? e.name : e.symbol }));
  } catch {
    return [];
  }
}

/** Zuletzt gesuchtes Symbol vormerken — jüngstes zuerst, ohne Dubletten. */
export function letzteMerken(v: { symbol: string; name: string }) {
  try {
    const liste = [v, ...letzteLaden().filter((e) => e.symbol !== v.symbol)].slice(0, MAX_LETZTE);
    localStorage.setItem(SPEICHER, JSON.stringify(liste));
  } catch {
    /* private-Modus o. Ä. — dann gibt es eben keine Historie */
  }
}

// ---------- Bausteine ----------

/** Kleiner Kreis mit Anfangsbuchstabe (Yahoo-Trendticker-Optik) */
function Marke({ symbol }: { symbol: string }) {
  return (
    <span
      aria-hidden
      className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-elevated font-mono text-[10px] font-bold text-ink2"
    >
      {symbol[0]}
    </span>
  );
}

function TickerPill({
  v,
  aktiv,
  onHover,
  onClick,
}: {
  v: Vorschlag;
  aktiv: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={aktiv}
      title={v.name}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2 rounded-full border px-2.5 text-left transition-colors duration-150',
        aktiv ? 'border-accent bg-accent-soft' : 'border-line-strong bg-panel2 hover:border-ink3'
      )}
    >
      <Marke symbol={v.symbol} />
      <span className="font-mono text-[12.5px] font-semibold text-ink">{v.symbol}</span>
      {v.tagesPct != null && (
        <span className={cn('font-mono text-[11.5px] tnum', signClass(v.tagesPct))}>{fmtPct(v.tagesPct)}</span>
      )}
    </button>
  );
}

/** Treffer-Zeile im TradingView-Stil: Symbol · Name · Typ + Börse rechts */
function TrefferZeile({
  t,
  aktiv,
  onHover,
  onClick,
}: {
  t: SearchResult;
  aktiv: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={aktiv}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-150',
        aktiv ? 'bg-accent-soft' : 'hover:bg-panel2'
      )}
    >
      <Marke symbol={t.symbol} />
      <span className="min-w-[78px] shrink-0 font-mono text-[12.5px] font-semibold text-ink">{t.symbol}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink2">{t.name}</span>
      <span className="shrink-0 text-[11px] uppercase tracking-wider text-ink3">
        {t.type === 'ETF' ? 'ETF' : 'Aktie'}
        {t.exchange ? ` · ${t.exchange}` : ''}
      </span>
    </button>
  );
}

/**
 * Symbolsuche im Modal.
 * Ruhezustand = Trend-Ticker-Optik (Yahoo): Pill-Reihen mit „Zuletzt gesucht",
 * den eigenen Werten und den Trend-Symbolen — passt ohne Scrollen ins Fenster.
 * Suchmodus = Treffer-Zeilen mit Typ und Börse (TradingView).
 * Bedienung: ↑/↓/Enter/Escape, Rollen für Screenreader.
 */
export function SymbolSearch({
  onPick,
  placeholder = 'Aktie oder ETF suchen — Name oder Ticker …',
  autoFocus = true,
  zeigeEigene = true,
}: {
  onPick: (r: SearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  zeigeEigene?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [treffer, setTreffer] = useState<SearchResult[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const [letzte] = useState<Vorschlag[]>(letzteLaden);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);
  const { data: d } = useDashboard();
  const { data: trending } = useTrending();

  const suchModus = query.trim().length >= 2;

  const gruppen = useMemo(() => {
    const eigene: Vorschlag[] = [];
    if (zeigeEigene && d) {
      const gesehen = new Set<string>();
      for (const w of [...d.positions, ...d.watchlist]) {
        if (gesehen.has(w.symbol)) continue;
        gesehen.add(w.symbol);
        eigene.push({ symbol: w.symbol, name: w.name, tagesPct: w.tagesPct });
      }
    }
    // Keine Dubletten über die Gruppen hinweg — jedes Symbol erscheint einmal,
    // in der obersten Gruppe, in der es vorkommt.
    const belegt = new Set<string>();
    const einmalig = (items: Vorschlag[]) =>
      items.filter((v) => !belegt.has(v.symbol) && (belegt.add(v.symbol), true));
    return [
      ...(letzte.length ? [{ titel: 'Zuletzt gesucht', items: einmalig(letzte) }] : []),
      ...(eigene.length ? [{ titel: 'Deine Werte', items: einmalig(eigene) }] : []),
      { titel: 'Trend-Ticker', items: einmalig(trending ?? []).slice(0, 6) },
    ].filter((g) => g.items.length > 0);
  }, [d, trending, zeigeEigene, letzte]);

  const anzahl = suchModus ? treffer.length : gruppen.reduce((n, g) => n + g.items.length, 0);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!suchModus) {
      setTreffer([]);
      setLaedt(false);
      setAktiv(0);
      return;
    }
    setLaedt(true);
    timer.current = setTimeout(async () => {
      try {
        setTreffer(await searchSymbols(query.trim()));
        setAktiv(0);
      } catch {
        setTreffer([]);
      } finally {
        setLaedt(false);
      }
    }, 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, suchModus]);

  const waehlen = (v: Vorschlag | SearchResult) => {
    const voll: SearchResult =
      'type' in v ? (v as SearchResult) : treffer.find((t) => t.symbol === v.symbol) ?? { ...v, type: 'EQUITY' };
    letzteMerken({ symbol: voll.symbol, name: voll.name });
    onPick(voll);
  };

  /** Der aktive Index läuft über alle Gruppen hinweg — Reihenfolge = Anzeige */
  const beiIndex = (i: number): Vorschlag | SearchResult | null => {
    if (suchModus) return treffer[i] ?? null;
    let rest = i;
    for (const g of gruppen) {
      if (rest < g.items.length) return g.items[rest];
      rest -= g.items.length;
    }
    return null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!anzahl) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAktiv((i) => (i + 1) % anzahl);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAktiv((i) => (i - 1 + anzahl) % anzahl);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const v = beiIndex(aktiv) ?? beiIndex(0);
      if (v) waehlen(v);
    }
  };

  let laufIndex = -1;

  return (
    <div className="flex flex-col">
      {/* Eingabezeile: kein eigener Rahmen, nur die Hairline zur Liste darunter */}
      <div className="flex items-center gap-2.5 px-1.5 pb-3">
        <Search size={16} className="shrink-0 text-ink3" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded
          aria-autocomplete="list"
          aria-label={placeholder}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full border-0 bg-transparent p-0 text-[14.5px] text-ink outline-none placeholder:text-ink3"
        />
        {laedt && <Loader2 size={15} className="shrink-0 animate-spin text-ink3" aria-hidden />}
      </div>

      {/* Feste Höhe: das Fenster darf zwischen Ruhezustand und Tippen nicht springen */}
      <div className="scroll-dezent h-[300px] overflow-y-auto border-t border-line pt-2.5">
        {suchModus ? (
          <div role="listbox" aria-label="Suchergebnisse">
            {treffer.length === 0 && !laedt ? (
              <p className="px-3 py-8 text-center text-[13px] text-ink3" role="status" aria-live="polite">
                Nichts gefunden — Tippfehler im Ticker?
              </p>
            ) : (
              treffer.map((t, i) => (
                <TrefferZeile
                  key={`${t.symbol}-${t.exchange ?? ''}`}
                  t={t}
                  aktiv={i === aktiv}
                  onHover={() => setAktiv(i)}
                  onClick={() => waehlen(t)}
                />
              ))
            )}
          </div>
        ) : gruppen.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-ink3">Name oder Ticker eingeben, um zu suchen.</p>
        ) : (
          <div role="listbox" aria-label="Vorschläge" className="grid gap-3.5 px-1.5 pb-1">
            {gruppen.map((g) => (
              <div key={g.titel} role="group" aria-label={g.titel}>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-ink3">{g.titel}</div>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((v) => {
                    laufIndex += 1;
                    const i = laufIndex;
                    return (
                      <TickerPill
                        key={`${g.titel}-${v.symbol}`}
                        v={v}
                        aktiv={i === aktiv}
                        onHover={() => setAktiv(i)}
                        onClick={() => waehlen(v)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
