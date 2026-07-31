import { useState } from 'react';
import { ArrowUpRight, Globe, Plus, X } from 'lucide-react';
import { Panel, PanelTitle, Empty } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useLinksMutation, useWebLinks, useXAccounts } from '@/lib/queries';

function XLogo({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * "Meinungen & Links": Sprungziele nach außen. Bewusst als Link-Pills mit
 * ↗-Kennzeichen und aria-label ("… in neuem Tab") — damit auch ohne Farbe
 * und für Screenreader klar ist, dass die Seite verlassen wird.
 * Ein Eingabefeld für beides: @handle → X-Account, URL → Webseite.
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

  const LinkPill = ({
    href,
    icon,
    label,
    beschreibung,
  }: {
    href: string;
    icon: React.ReactNode;
    label: string;
    beschreibung: string;
  }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${beschreibung} — öffnet in neuem Tab`}
      className="group flex h-control-sm items-center gap-2 overflow-hidden rounded-full border border-line-strong bg-panel2 pl-3 pr-2.5 text-small text-ink2 transition-colors duration-150 hover:border-accent hover:bg-accent-soft hover:text-ink"
    >
      <span className="text-ink3 transition-colors group-hover:text-accent">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowUpRight size={13} className="shrink-0 text-ink3 transition-colors group-hover:text-accent" aria-hidden />
    </a>
  );

  const EntfernenZeile = ({
    icon,
    label,
    onRemove,
  }: {
    icon: React.ReactNode;
    label: string;
    onRemove: () => void;
  }) => (
    <div className="flex items-center gap-2.5 border-b border-line py-2 text-base last:border-b-0">
      <span className="shrink-0 text-ink3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Button
        variant="icon"
        size="icon"
        className="shrink-0 hover:text-down"
        aria-label={`${label} entfernen`}
        title="Entfernen"
        onClick={onRemove}
      >
        <X size={15} />
      </Button>
    </div>
  );

  return (
    <Panel>
      <PanelTitle>Meinungen &amp; Links</PanelTitle>
      {accounts.length + webLinks.length === 0 ? (
        <Empty>Noch nichts hinterlegt.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {accounts.map((h) => (
            <LinkPill
              key={h}
              href={suchLink(h)}
              icon={<XLogo />}
              label={`@${h}`}
              beschreibung={`Posts von @${h} zu $${ticker} auf X`}
            />
          ))}
          {webLinks.map((l) => (
            <LinkPill
              key={l.url}
              href={l.url.replaceAll('{TICKER}', ticker)}
              icon={<Globe size={13} />}
              label={l.name}
              beschreibung={`${l.name}: ${ticker}`}
            />
          ))}
        </div>
      )}
      <Button variant="ghost" size="sm" className="mt-4" onClick={() => setVerwaltenOffen(true)}>
        <Plus size={15} /> Hinzufügen
      </Button>

      <Dialog open={verwaltenOffen} onOpenChange={(o) => { setVerwaltenOffen(o); setFehler(null); }}>
        <DialogContent>
          <DialogTitle>Accounts &amp; Links</DialogTitle>
          <DialogDescription>
            X-Account als <code className="font-mono text-ink2">@handle</code> eintragen, Webseiten
            als Adresse — das Aktien-Symbol darin wird automatisch ersetzt.
          </DialogDescription>
          <form
            className="mb-4 flex gap-2"
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
              aria-label="X-Handle oder Seiten-URL"
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
            />
            <Button type="submit" className="shrink-0" disabled={hinzufuegen.isPending}>
              Hinzufügen
            </Button>
          </form>
          {fehler && <p className="mb-3 text-small leading-relaxed text-down">{fehler}</p>}
          <div className="max-h-[300px] overflow-y-auto">
            {accounts.map((h) => (
              <EntfernenZeile
                key={h}
                icon={<XLogo size={12} />}
                label={`@${h}`}
                onRemove={() => xEntfernen.mutate(h)}
              />
            ))}
            {webLinks.map((l) => (
              <EntfernenZeile
                key={l.url}
                icon={<Globe size={13} />}
                label={l.name}
                onRemove={() => linkEntfernen.mutate(l.url)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
