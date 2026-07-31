import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, TrendingUp, Loader2 } from 'lucide-react';
import { searchSymbols, useDashboard, useTrending } from '@/lib/queries';
import type { SearchResult } from '@/lib/api';
import { fmtPct, signClass } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Vorschlag {
  symbol: string;
  name: string;
  tagesPct?: number | null;
}

/**
 * Symbolsuche im Modal. Solange nichts eingetippt ist, stehen sinnvolle
 * Vorschläge bereit (eigene Werte + Trend) — ein leeres Fenster mit nur
 * einem Eingabefeld wirkte abgeschnitten. Feste Mindesthöhe, damit das
 * Fenster beim Tippen nicht springt.
 * Bedienung: Pfeiltasten, Enter, Escape; Rollen für Screenreader.
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
  const timer = useRef<ReturnType<typeof setTimeout>>(null);
  const { data: d } = useDashboard();
  const { data: trending } = useTrending();

  const suchModus = query.trim().length >= 2;

  // Vorschlagsgruppen für den Ruhezustand
  const gruppen = useMemo(() => {
    const eigene: Vorschlag[] = [];
    if (zeigeEigene && d) {
      const gesehen = new Set<string>();
      for (const p of d.positions) {
        if (!gesehen.has(p.symbol)) {
          gesehen.add(p.symbol);
          eigene.push({ symbol: p.symbol, name: p.name, tagesPct: p.tagesPct });
        }
      }
      for (const w of d.watchlist) {
        if (!gesehen.has(w.symbol)) {
          gesehen.add(w.symbol);
          eigene.push({ symbol: w.symbol, name: w.name, tagesPct: w.tagesPct });
        }
      }
    }
    const trend: Vorschlag[] = (trending ?? []).slice(0, 6);
    return [
      ...(eigene.length ? [{ titel: 'Deine Werte', icon: null, items: eigene }] : []),
      ...(trend.length ? [{ titel: 'Gerade im Trend', icon: <TrendingUp size={12} />, items: trend }] : []),
    ];
  }, [d, trending, zeigeEigene]);

  // Flache Liste für Tastatur-Navigation
  const sichtbar: Vorschlag[] = suchModus
    ? treffer.map((t) => ({ symbol: t.symbol, name: t.name }))
    : gruppen.flatMap((g) => g.items);

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

  const waehlen = (v: Vorschlag) => {
    const voll = treffer.find((t) => t.symbol === v.symbol);
    onPick(voll ?? { symbol: v.symbol, name: v.name, type: 'EQUITY' });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!sichtbar.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAktiv((i) => (i + 1) % sichtbar.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAktiv((i) => (i - 1 + sichtbar.length) % sichtbar.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      waehlen(sichtbar[aktiv] ?? sichtbar[0]);
    }
  };

  const Zeile = ({ v, index }: { v: Vorschlag; index: number }) => (
    <li role="option" aria-selected={index === aktiv}>
      <button
        type="button"
        onMouseEnter={() => setAktiv(index)}
        onClick={() => waehlen(v)}
        className={cn(
          'flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] transition-colors',
          index === aktiv ? 'bg-accent-soft text-ink' : 'text-ink2 hover:bg-panel2'
        )}
      >
        <span className="min-w-[74px] font-mono text-[12.5px] font-semibold text-accent">{v.symbol}</span>
        <span className="min-w-0 flex-1 truncate">{v.name}</span>
        {v.tagesPct != null && (
          <span className={cn('shrink-0 font-mono text-[12px] tnum', signClass(v.tagesPct))}>
            {fmtPct(v.tagesPct)}
          </span>
        )}
      </button>
    </li>
  );

  let laufIndex = -1;

  return (
    <div className="flex flex-col">
      {/* Eingabezeile: nur Trennlinie unten, kein eigener Rahmen */}
      <div className="flex items-center gap-2.5 px-1 pb-3">
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

      <div className="min-h-[260px] max-h-[340px] overflow-y-auto border-t border-line pt-2">
        {suchModus ? (
          <ul role="listbox" aria-label="Suchergebnisse">
            {treffer.length === 0 && !laedt ? (
              <li className="px-3 py-6 text-center text-[13px] text-ink3">
                Nichts gefunden — Tippfehler im Ticker?
              </li>
            ) : (
              treffer.map((t, i) => <Zeile key={`${t.symbol}-${t.exchange}`} v={{ symbol: t.symbol, name: t.name }} index={i} />)
            )}
          </ul>
        ) : gruppen.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-ink3">
            Name oder Ticker eingeben, um zu suchen.
          </p>
        ) : (
          gruppen.map((g) => (
            <div key={g.titel} className="mb-1">
              <div className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em] text-ink3">
                {g.icon}
                {g.titel}
              </div>
              <ul role="listbox" aria-label={g.titel}>
                {g.items.map((v) => {
                  laufIndex += 1;
                  return <Zeile key={`${g.titel}-${v.symbol}`} v={v} index={laufIndex} />;
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
