import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SymbolSearch } from '@/components/symbol-search';
import type { SearchResult } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Suchfeld, das ein Modal öffnet (Micha mag die Palette) — zusätzlich
 * per Strg/Cmd+K erreichbar. Die eigentliche Suche ist die gemeinsame
 * SymbolSearch-Komponente, damit Verhalten und Optik überall gleich sind.
 */
export function SearchDialog({
  onPick,
  className,
}: {
  onPick: (r: SearchResult) => void;
  className?: string;
}) {
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
        className={cn(
          'flex h-control-lg w-full cursor-pointer items-center gap-3 rounded-sm border border-line-strong bg-panel px-4 text-lg text-ink3 transition-colors hover:border-ink3',
          className
        )}
      >
        <Search size={18} aria-hidden />
        Aktie oder ETF suchen …
        <kbd className="ml-auto rounded border border-line-strong bg-panel2 px-2 py-1 font-mono text-micro text-ink3">
          Strg K
        </kbd>
      </button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-w-[600px]">
          <DialogTitle className="sr-only">Aktie oder ETF suchen</DialogTitle>
          <SymbolSearch
            groß
            autoFocus
            onPick={(r) => {
              setOffen(false);
              onPick(r);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
