import { useEffect, useRef, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { searchSymbols } from '@/lib/queries';
import type { SearchResult } from '@/lib/api';

/**
 * Yahoo-Symbolsuche als Command-Liste (debounced, 280 ms wie in v1).
 * Wird in der Analyse-Suche und in den Hinzufügen-Dialogen verwendet.
 */
export function SymbolSearch({
  onPick,
  placeholder = 'Aktie oder ETF suchen — Name oder Ticker …',
  autoFocus = true,
}: {
  onPick: (r: SearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [laedt, setLaedt] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLaedt(false);
      return;
    }
    setLaedt(true);
    timer.current = setTimeout(async () => {
      try {
        setResults(await searchSymbols(q));
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

  return (
    <Command>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <CommandList>
        {query.trim().length >= 2 && !laedt && (
          <CommandEmpty>Nichts gefunden — Tippfehler im Ticker?</CommandEmpty>
        )}
        {results.map((r) => (
          <CommandItem key={`${r.symbol}-${r.exchange}`} value={r.symbol} onSelect={() => onPick(r)}>
            <span className="min-w-[76px] font-mono text-[12.5px] font-semibold text-accent">
              {r.symbol}
            </span>
            <span className="flex-1 truncate text-ink">{r.name}</span>
            <span className="shrink-0 text-[11.5px] text-ink3">
              {r.exchange}
              {r.type === 'ETF' ? ' · ETF' : ''}
            </span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
