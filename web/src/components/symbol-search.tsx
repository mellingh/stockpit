import { useEffect, useId, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { searchSymbols } from '@/lib/queries';
import type { SearchResult } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Symbolsuche als normales Eingabefeld mit Vorschlagsliste darunter —
 * kein Modal (Micha, v2-Runde 1). Debounce 280 ms wie in v1.
 * Barrierefrei: combobox/listbox-Rollen, Pfeiltasten, Enter, Escape.
 */
export function SymbolSearch({
  onPick,
  placeholder = 'Aktie oder ETF suchen — Name oder Ticker …',
  autoFocus = false,
  groß = false,
  className,
}: {
  onPick: (r: SearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  groß?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);
  const listId = useId();

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLaedt(false);
      setOffen(false);
      return;
    }
    setLaedt(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await searchSymbols(q);
        setResults(r);
        setAktiv(r.length ? 0 : -1);
        setOffen(true);
      } catch {
        setResults([]);
      } finally {
        setLaedt(false);
      }
    }, 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  // Klick außerhalb schließt die Liste
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const waehlen = (r: SearchResult) => {
    setOffen(false);
    setQuery('');
    setResults([]);
    onPick(r);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!offen || !results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAktiv((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAktiv((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      waehlen(results[aktiv >= 0 ? aktiv : 0]);
    } else if (e.key === 'Escape') {
      setOffen(false);
    }
  };

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <Search
        size={groß ? 18 : 16}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink3"
        aria-hidden
      />
      {laedt && (
        <Loader2
          size={15}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-ink3"
          aria-hidden
        />
      )}
      <input
        type="text"
        role="combobox"
        aria-expanded={offen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOffen(true)}
        onKeyDown={onKeyDown}
        className={cn(
          'w-full rounded-sm border border-line-strong bg-panel pl-11 pr-10 text-ink outline-none transition-all duration-150',
          'placeholder:text-ink3 focus:border-accent focus:ring-2 focus:ring-accent/25',
          groß ? 'h-control-lg text-lg' : 'h-control-md text-base'
        )}
      />
      {offen && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[340px] overflow-y-auto rounded-md border border-line-strong bg-elevated p-1.5 shadow-pop animate-pop"
        >
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-small text-ink3">
              Nichts gefunden — Tippfehler im Ticker?
            </li>
          ) : (
            results.map((r, i) => (
              <li key={`${r.symbol}-${r.exchange}`} role="option" aria-selected={i === aktiv}>
                <button
                  type="button"
                  onMouseEnter={() => setAktiv(i)}
                  onClick={() => waehlen(r)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left text-base transition-colors',
                    i === aktiv ? 'bg-accent-soft text-ink' : 'text-ink2 hover:bg-panel2'
                  )}
                >
                  <span className="min-w-[80px] font-mono text-small font-semibold text-accent">
                    {r.symbol}
                  </span>
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="shrink-0 text-small text-ink3">
                    {r.exchange}
                    {r.type === 'ETF' ? ' · ETF' : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
