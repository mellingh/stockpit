import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from '@/lib/router';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SymbolSearch } from '@/components/symbol-search';

/**
 * Globale Wertsuche in der Topbar (Micha, Runde 52). Sitzt dort, wo vorher der
 * „Analyse"-Nav-Eintrag stand — von jeder Seite erreichbar (auch aus dem
 * Kalender), Strg+K überall. Öffnet denselben Dialog wie bisher die
 * Analyse-Startseite (letzte Suchen, eigene Werte, Trend-Ticker) und springt
 * in den Report des gewählten Werts.
 */
export function TopbarSuche() {
  const [offen, setOffen] = useState(false);
  const navigate = useNavigate();

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
        aria-label="Aktie oder ETF suchen"
        // 40er-Reihe wie die Standard-Eingabefelder (Runde 53: 32 war zu zierlich,
        // 48 wie die alte Analyse-Suche zu wuchtig für die Topbar)
        className="flex h-control-md w-[320px] cursor-pointer items-center gap-2.5 rounded-md border border-line-strong bg-panel px-3 text-small text-ink3 transition-colors hover:border-ink3 focus-visible:ring-2 focus-visible:ring-accent/40 outline-none"
      >
        <Search size={16} aria-hidden />
        Aktie oder ETF suchen …
        <kbd className="ml-auto rounded border border-line-strong bg-panel2 px-1.5 font-mono text-micro text-ink3">
          Strg K
        </kbd>
      </button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent ohneSchliessen className="max-w-[560px] px-3 pb-3 pt-3.5">
          <SymbolSearch
            onPick={(r) => {
              setOffen(false);
              navigate(`/analyse?symbol=${encodeURIComponent(r.symbol)}`);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
