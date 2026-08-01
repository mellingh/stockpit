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
function einordnungPunkte(n: NewsItemT): string[] {
  const parts: string[] = [];
  if (n.summary) parts.push(`Worum es geht: ${n.summary}`);
  if (Array.isArray(n.erklaerung)) parts.push(...n.erklaerung);
  else if (n.erklaerung) parts.push(n.erklaerung);
  if (n.sentiment?.unavailable) {
    parts.push('Das KI-Modell war noch nicht geladen — Einstufung vorläufig neutral.');
  }
  for (const b of n.betroffen ?? []) {
    if (b.why !== 'direkt') parts.push(`${b.symbol}: indirekt betroffen über ${b.why}.`);
  }
  return parts;
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
  const punkte = einordnungPunkte(n);
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
        <span>{fmtAgo(n.pubDate)}</span>
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
      {punkte.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="einordnung" className="border-0">
            <AccordionTrigger>Einordnung</AccordionTrigger>
            <AccordionContent>
              <BulletListe punkte={punkte} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </article>
  );
}
