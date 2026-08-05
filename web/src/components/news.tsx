import { Link } from '@/lib/router';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { fmtAgo, fmtPct } from '@/lib/format';
import type { NewsItem as NewsItemT } from '@/lib/api';

const SENTIMENT_LABEL: Record<string, string> = {
  positive: 'Positiv',
  negative: 'Negativ',
  neutral: 'Neutral',
};

function SentimentBadge({ s }: { s: NewsItemT['sentiment'] }) {
  if (!s) return null;
  const variant = s.label === 'positive' ? 'pos' : s.label === 'negative' ? 'neg' : 'neu';
  const dot =
    s.label === 'positive' ? 'bg-up' : s.label === 'negative' ? 'bg-down' : 'bg-ink3';
  return (
    <Badge
      variant={variant}
      title={s.unavailable ? 'KI-Modell lädt noch' : `Konfidenz ${Math.round((s.score ?? 0) * 100)} %`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {SENTIMENT_LABEL[s.label] ?? s.label}
    </Badge>
  );
}

/**
 * Einordnung als knappe Bullet-Liste: "Worum es geht"-Teaser + Analyse-Sätze
 * vom Server + indirekte Betroffenheit. Keine generischen Floskeln (v1-Regel).
 */
function einordnungPunkte(n: NewsItemT): { punkte: string[]; fazit: string | null } {
  const punkte: string[] = [];
  if (n.summary) punkte.push(`Worum es geht: ${n.summary}`);
  if (Array.isArray(n.erklaerung)) punkte.push(...n.erklaerung);
  else if (n.erklaerung) punkte.push(n.erklaerung);
  if (n.sentiment?.unavailable) {
    punkte.push('Das KI-Modell war noch nicht geladen — Einstufung vorläufig neutral.');
  }

  // Ohne Teaser wirkt die Einordnung leer — dann wenigstens ehrlich sagen, warum
  if (punkte.length === 0) {
    punkte.push('Zu dieser Meldung liefert die Quelle keinen Teaser — Details stehen im verlinkten Artikel.');
  }

  // Fazit = was aus der Meldung FOLGT, nicht die Tonlage (die steht schon im
  // Badge): Wie stark hat der Markt reagiert — gemessen am üblichen
  // Tagesausschlag — und wer hängt nur indirekt mit drin? Es gibt IMMER ein
  // Fazit (Micha, Runde 20: das Schema Text + Fazit muss konstant sein).
  const direkte = (n.betroffen ?? []).filter((b) => b.why === 'direkt').map((b) => b.symbol);
  const indirekte = (n.betroffen ?? []).filter((b) => b.why !== 'direkt');
  const teile: string[] = [];
  const r = n.reaction;
  if (r?.dayChangePct != null && direkte.length) {
    const staerke =
      r.typischPct != null && Math.abs(r.dayChangePct) >= 2 * r.typischPct
        ? 'weit über dem üblichen Tagesausschlag'
        : r.typischPct != null && Math.abs(r.dayChangePct) >= r.typischPct
          ? 'etwa im Rahmen des üblichen Tagesausschlags'
          : 'kaum spürbar';
    teile.push(
      `Der Markt hat die Nachricht bei ${direkte.join(' und ')} mit ${fmtPct(r.dayChangePct)} am Tag ${
        r.dayChangePct >= 0 ? 'belohnt' : 'abgestraft'
      } — ${staerke}`
    );
  } else if (direkte.length && n.sentiment?.label && n.sentiment.label !== 'neutral') {
    teile.push(
      `Die Meldung liest sich für ${direkte.join(' und ')} ${
        n.sentiment.label === 'positive' ? 'unterstützend' : 'belastend'
      }, eine messbare Kursreaktion steht noch aus`
    );
  } else if (direkte.length) {
    // neutral + keine Reaktion: ehrlich einordnen statt Fazit weglassen
    teile.push(
      `Für ${direkte.join(' und ')} ohne klaren Kurstreiber — weder Tonlage noch Kursreaktion geben einen Ausschlag`
    );
  } else if (!indirekte.length) {
    teile.push('Markt-Meldung ohne direkten Bezug zu deinen Werten — Hintergrund, kein Handelssignal');
  }
  for (const b of indirekte) {
    teile.push(
      `${b.symbol} wird nicht direkt genannt, gehört aber zur selben Branche (${b.why.replace(/^Sektor /, '')}) und kann mitreagieren`
    );
  }
  const fazit = teile.length ? teile.join('; ') + '.' : null;
  return { punkte, fazit };
}

export function BulletListe({
  punkte,
  schluss,
}: {
  punkte: React.ReactNode[];
  /** Abgesetzter Schlusssatz unter den Bullets (z. B. die Devisen-Faustregel) */
  schluss?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-panel2 px-4 py-3 text-small leading-relaxed text-ink2">
      <ul className="grid gap-2">
        {punkte.map((p, i) => (
          <li key={i} className="relative pl-4 before:absolute before:left-0 before:text-accent before:content-['–']">
            {p}
          </li>
        ))}
      </ul>
      {schluss && <div className="mt-2.5 border-t border-line pt-2.5">{schluss}</div>}
    </div>
  );
}

export function NewsItem({ n, zeigeChips = false }: { n: NewsItemT; zeigeChips?: boolean }) {
  const { punkte, fazit } = einordnungPunkte(n);
  return (
    <article className="grid gap-2 border-b border-line py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2.5 font-mono text-micro uppercase tracking-wider text-ink3">
        {zeigeChips &&
          (n.betroffen ?? []).slice(0, 4).map((b) => (
            <Link key={b.symbol} to={`/analyse?symbol=${encodeURIComponent(b.symbol)}`}>
              <Badge
                variant="chip"
                className="cursor-pointer transition-colors hover:bg-accent hover:text-[#0b1524]"
                title={b.why === 'direkt' ? 'direkt betroffen' : `betroffen über ${b.why}`}
              >
                {b.symbol}
              </Badge>
            </Link>
          ))}
        <span>{n.source ?? '—'}</span>
        {/* Zeit immer rechtsbündig — links stehen nur Chips + Quelle (Micha, Runde 20) */}
        <span className="ml-auto shrink-0">{fmtAgo(n.pubDate)}</span>
      </div>
      <h3 className="text-lg font-semibold leading-snug">
        <a
          href={n.link}
          target="_blank"
          rel="noopener"
          className="text-ink transition-colors hover:text-accent"
        >
          {n.title}
        </a>
      </h3>
      <div className="flex flex-wrap gap-1.5">
        <SentimentBadge s={n.sentiment} />
        {n.category && n.category.id !== 'other' && <Badge variant="cat">{n.category.label}</Badge>}
        {n.reaction?.dayChangePct != null && (
          <Badge variant={n.reaction.dayChangePct > 0 ? 'pos' : n.reaction.dayChangePct < 0 ? 'neg' : 'neu'}>
            Kurs am Tag {fmtPct(n.reaction.dayChangePct)}
          </Badge>
        )}
      </div>
      {(punkte.length > 0 || fazit) && (
        /* Trigger kompakt + leicht eingezogen: sonst ist der Abstand unter der
           zugeklappten News größer als über ihr (Micha, Runde 33 — Zeilen sollen
           unabhängig vom Aufklappen gleich wirken) */
        <Accordion type="single" collapsible className="-mb-2">
          <AccordionItem value="einordnung" className="border-0">
            <AccordionTrigger className="h-control-sm">Einordnung</AccordionTrigger>
            <AccordionContent>
              <BulletListe
                punkte={punkte}
                schluss={fazit && (
                  <p>
                    <b className="text-ink">Fazit:</b> {fazit}
                  </p>
                )}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </article>
  );
}
