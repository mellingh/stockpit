import { useState } from 'react';
import { Globe, Plus } from 'lucide-react';
import { Panel, PanelTitle, Empty } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useLinksMutation, useWebLinks, useXAccounts } from '@/lib/queries';

function XLogo({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * "Meinungen & Links": X-Suchen vertrauter Accounts (from:Account $TICKER)
 * + Quick-Links zu externen Seiten ({TICKER}-Platzhalter). Ein Eingabefeld
 * für beides — @handle → X-Account, URL → Webseite (Symbol in der URL wird
 * automatisch zum Platzhalter).
 */
export function LinksCard({ symbol }: { symbol: string }) {
  const ticker = symbol.split('.')[0].toUpperCase();
  const { data: accounts = [] } = useXAccounts();
  const { data: webLinks = [] } = useWebLinks();
  const [verwaltenOffen, setVerwaltenOffen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const hinzufuegen = useLinksMutation(async (wert: string) => {
    if (/^@?[A-Za-z0-9_]{1,15}$/.test(wert)) {
      return api.post('/api/xusers', { handle: wert });
    }
    let url = /^https?:\/\//i.test(wert) ? wert : `https://${wert}`;
    if (ticker.length >= 2) {
      url = url.replace(new RegExp(`(?<![A-Za-z0-9])${ticker}(?![A-Za-z0-9])`, 'gi'), '{TICKER}');
    }
    return api.post('/api/weblinks', { url });
  });
  const xEntfernen = useLinksMutation((h: string) => api.del(`/api/xusers/${encodeURIComponent(h)}`));
  const linkEntfernen = useLinksMutation((url: string) =>
    api.del(`/api/weblinks?url=${encodeURIComponent(url)}`)
  );

  const suchLink = (h: string) =>
    `https://x.com/search?q=${encodeURIComponent(`from:${h} $${ticker}`)}&src=typed_query&f=live`;

  const pillKlasse =
    'inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-panel2 px-3 py-[5px] text-[12.5px] text-ink2 transition-all duration-150 hover:border-accent hover:bg-accent-soft hover:text-ink cursor-pointer';

  return (
    <Panel>
      <PanelTitle>Meinungen &amp; Links</PanelTitle>
      {accounts.length + webLinks.length === 0 ? (
        <Empty>Noch nichts hinterlegt.</Empty>
      ) : (
        <div className="flex flex-wrap gap-2">
          {accounts.map((h) => (
            <a
              key={h}
              href={suchLink(h)}
              target="_blank"
              rel="noopener"
              title={`Posts von @${h} zu $${ticker} auf X`}
              className={pillKlasse}
            >
              <span className="text-ink3">
                <XLogo />
              </span>
              @{h}
            </a>
          ))}
          {webLinks.map((l) => (
            <a
              key={l.url}
              href={l.url.replaceAll('{TICKER}', ticker)}
              target="_blank"
              rel="noopener"
              title={`${l.name}: ${ticker} öffnen`}
              className={pillKlasse}
            >
              <Globe size={12} className="text-ink3" />
              {l.name}
            </a>
          ))}
        </div>
      )}
      <Button variant="ghost" size="sm" className="mt-4" onClick={() => setVerwaltenOffen(true)}>
        <Plus size={14} /> Hinzufügen
      </Button>

      <Dialog open={verwaltenOffen} onOpenChange={(o) => { setVerwaltenOffen(o); setFehler(null); }}>
        <DialogContent>
          <DialogTitle>Accounts &amp; Links</DialogTitle>
          <form
            className="mb-3 flex gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              const wert = eingabe.trim();
              if (!wert) return;
              setFehler(null);
              hinzufuegen.mutate(wert, {
                onSuccess: () => setEingabe(''),
                onError: (err) => setFehler((err as Error).message),
              });
            }}
          >
            <Input
              autoFocus
              placeholder="@handle oder Seiten-URL …"
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
            />
            <Button type="submit" size="sm" className="h-9 shrink-0" disabled={hinzufuegen.isPending}>
              Hinzufügen
            </Button>
          </form>
          {fehler && <p className="mb-3 text-[12.5px] leading-relaxed text-down">{fehler}</p>}
          <div className="max-h-[300px] overflow-y-auto">
            {accounts.map((h) => (
              <div key={h} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-b-0">
                <span className="flex items-center gap-2">
                  <span className="text-ink3"><XLogo /></span>@{h}
                </span>
                <Button variant="danger" size="xs" onClick={() => xEntfernen.mutate(h)}>
                  Entfernen
                </Button>
              </div>
            ))}
            {webLinks.map((l) => (
              <div key={l.url} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-b-0">
                <span className="flex min-w-0 items-center gap-2">
                  <Globe size={12} className="shrink-0 text-ink3" />
                  <span className="truncate">{l.name}</span>
                </span>
                <Button variant="danger" size="xs" onClick={() => linkEntfernen.mutate(l.url)}>
                  Entfernen
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
