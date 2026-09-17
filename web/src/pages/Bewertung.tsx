// Bewertung: Kürzel eingeben, EINE Zahl bekommen.
//
// Die Seite rechnet nicht ein Verfahren, sondern alle, für die es belastbare
// Daten gibt, und fasst sie zu einem Wert zusammen. Was NICHT gerechnet werden
// kann, wird mit Begründung genannt statt verschwiegen — ein Ergebnis aus
// leeren Feldern sieht sonst aus wie eine Aussage.
//
// KEIN Kauf- oder Verkaufsurteil: die Seite liefert Zahlen und sagt, woher sie
// kommen. Die Entscheidung trifft der Nutzer.

import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Info, Save, Search, Trash2 } from 'lucide-react';
import { Panel, PanelTitle, Empty } from '@/components/panel';
import { ScrollListe } from '@/components/scroll-liste';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SymbolSearch } from '@/components/symbol-search';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useSearchParams, useTitel, useNavigate } from '@/lib/router';
import { useBewertungStart, useBewertungGespeichert, useBewertungsListe, useBewertungMutation } from '@/lib/queries';
import { api, type Annahme, type BewertungsAntwort, type Fall, type SensZeile, type Verfahren } from '@/lib/api';
import { fmtCompact, fmtDate, fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

// ---------- Beschriftungen ----------

const VERFAHREN_NAME: Record<Verfahren, string> = {
  dcf: 'Zahlungsstrom-Modell',
  multiples: 'Branchenvergleich',
  sotp: 'Bereiche einzeln',
  rnpv: 'Pipeline-Modell',
  residual: 'Eigenkapital-Modell',
};

/** Ein Satz in Alltagssprache — keine Fachbegriffe ohne Übersetzung. */
const VERFAHREN_ERKLAERT: Record<Verfahren, string> = {
  dcf: 'Schätzt, wie viel Geld das Unternehmen in den nächsten zehn Jahren erwirtschaftet, und rechnet das auf heute zurück. Fachbegriff: Discounted Cash Flow.',
  multiples: 'Schaut, was Anleger für vergleichbare Firmen derselben Branche zahlen — etwa das Achtfache des Umsatzes — und überträgt das auf diese Aktie. Fachbegriff: Peer-Multiples.',
  sotp: 'Bewertet jeden Geschäftsbereich einzeln und zählt zusammen, abzüglich eines Abschlags dafür, dass die Bereiche nicht einzeln verkäuflich sind. Fachbegriff: Sum of the Parts.',
  rnpv: 'Für Biotech: jedes Medikament mit seinem möglichen Spitzenumsatz, multipliziert mit der Wahrscheinlichkeit, dass es zugelassen wird. Fachbegriff: risikoadjustierter Barwert (rNPV).',
  residual: 'Für Banken und Kreditgeber: bewertet das Eigenkapital danach, wie viel Rendite darauf erwirtschaftet wird. Cashflow-Modelle führen dort in die Irre.',
};

const FALL_LABEL: Record<Fall, string> = { worst: 'Pessimistisch', base: 'Realistisch', best: 'Optimistisch' };

const QUELLE_LABEL: Record<string, string> = {
  management_guidance: 'Management-Prognose',
  analystenkonsens: 'Analystenkonsens',
  geschaeftsbericht: 'Geschäftsbericht',
  eigene_schaetzung: 'Eigene Schätzung',
  peer_gruppe: 'Vergleichsgruppe',
};

// ---------- Formatierung ----------

const jeAktie = (v: number | null | undefined, w: string | null) =>
  v == null
    ? '–'
    // feste zwei Nachkommastellen wie bei den Kursen im Depot — sonst steht
    // '9,5' neben '14,10' und die Spalte franst aus
    : new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
      + (w ? ' ' + w : '');

/** Zweitzeile in Euro — wie bei den Positionen im Dashboard. */
function EuroZeile({ wert, eurKurs, waehrung }: { wert: number | null; eurKurs: number | null; waehrung: string | null }) {
  if (wert == null || !eurKurs || waehrung === 'EUR') return null;
  return <span className="block font-mono text-micro text-ink3">≈ {new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(wert * eurKurs)} EUR</span>;
}

/** Wert einer Annahme lesbar machen (Prozent, Vielfaches, Geldbetrag). */
function annahmeText(a: Annahme, waehrung: string | null): string {
  if (a.wert == null) return '–';
  if (a.einheit === 'prozent') return fmtNum(a.wert * 100, 1) + ' %';
  if (a.einheit === 'faktor') return fmtNum(a.wert, 1) + '×';
  if (a.einheit === 'jahre') return fmtNum(a.wert, 0) + ' Jahre';
  if (a.einheit === 'anzahl') return fmtCompact(a.wert);
  return fmtCompact(a.wert) + (waehrung ? ' ' + waehrung : '');
}

// ---------- Ergebnis oben ----------

function SzenarioSpalte({ fall, wert, kurs, waehrung, eurKurs, hervor }: {
  fall: Fall; wert: number | null; kurs: number | null; waehrung: string | null; eurKurs: number | null; hervor?: boolean;
}) {
  const abweichung = kurs && wert != null ? (wert - kurs) / kurs : null;
  return (
    <div className={cn('flex flex-col gap-1 rounded-md border px-4 py-3', hervor ? 'border-accent/40 bg-accent-soft' : 'border-line bg-panel2')}>
      <span className="font-mono text-micro uppercase tracking-[0.14em] text-ink3">{FALL_LABEL[fall]}</span>
      <span className={cn('font-display font-bold tabular-nums', hervor ? 'text-display-md' : 'text-display-sm')}>
        {jeAktie(wert, waehrung)}
      </span>
      <EuroZeile wert={wert} eurKurs={eurKurs} waehrung={waehrung} />
      <span className={cn('font-mono text-small tabular-nums', abweichung == null ? 'text-ink3' : abweichung >= 0 ? 'text-up' : 'text-down')}>
        {abweichung == null ? '–' : fmtPct(abweichung * 100) + ' zum Kurs'}
      </span>
    </div>
  );
}

/** Ein Satz, der sagt, was die Zahl bedeutet. */
function einschaetzungsSatz(d: BewertungsAntwort): string | null {
  const { kurs, gesamt } = d;
  if (kurs == null || gesamt.base == null) return null;
  const abw = (gesamt.base - kurs) / kurs;
  const anzahl = gesamt.verfahren.length;
  const wie = anzahl === 1
    ? `Gerechnet mit einem Verfahren (${VERFAHREN_NAME[gesamt.verfahren[0]]})`
    : `Mittelwert aus ${anzahl} Verfahren`;

  if (Math.abs(abw) < 0.1) {
    return `${wie}: Der Kurs liegt etwa dort, wo die Rechnung ihn sieht. Der Markt preist die Erwartungen ein, die auch in diesen Annahmen stecken.`;
  }
  if (abw > 0) {
    return `${wie}: Die Rechnung kommt ${fmtPct(abw * 100, false)} über dem Kurs heraus. Der Markt traut dem Unternehmen also weniger zu als diese Annahmen — oder sieht ein Risiko, das hier nicht abgebildet ist.`;
  }
  return `${wie}: Die Rechnung kommt ${fmtPct(-abw * 100, false)} unter dem Kurs heraus. Im Kurs steckt mehr Erwartung, als diese Annahmen hergeben.`;
}

// ---------- Verfahren im Detail ----------

function WarnZeile({ w }: { w: BewertungsAntwort['verfahren'][number]['ergebnis']['warnungen'][number] }) {
  const farbe = w.stufe === 'rot' ? 'text-down' : w.stufe === 'gelb' ? 'text-warn' : 'text-ink3';
  const Icon = w.stufe === 'info' ? Info : AlertTriangle;
  return (
    <li className="flex gap-2.5 py-1.5">
      <Icon size={13} className={cn('mt-0.5 shrink-0', farbe)} aria-hidden />
      <span className="text-small leading-relaxed">
        <span className="text-ink2">{w.text}</span>
        {w.hinweis && <span className="text-ink3"> {w.hinweis}</span>}
      </span>
    </li>
  );
}

function AnnahmenTabelle({ annahmen, waehrung }: { annahmen: Annahme[]; waehrung: string | null }) {
  const gruppen = useMemo(() => {
    const m = new Map<string, Annahme[]>();
    for (const a of annahmen) {
      if ((a as { versteckt?: boolean }).versteckt) continue;
      const g = a.gruppe ?? 'Weitere';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(a);
    }
    return [...m.entries()];
  }, [annahmen]);

  return (
    <ScrollListe className="max-h-[420px]">
      <table className="w-full table-fixed">
        <colgroup><col /><col className="w-[140px]" /><col className="w-[150px]" /></colgroup>
        <tbody>
          {gruppen.map(([gruppe, liste], i) => (
            <Fragment key={gruppe}>
              <tr>
                <td colSpan={3} className={cn('font-mono text-micro font-bold uppercase tracking-[0.14em] text-accent', i === 0 ? 'pt-1 pb-1.5' : 'pt-6 pb-1.5')}>
                  {gruppe}
                </td>
              </tr>
              {liste.map((a) => (
                <tr key={a.id} className="border-b border-line/70">
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-1.5">
                      <span className="text-small text-ink2">{a.label}</span>
                      {a.notiz && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help text-ink3" aria-label="Erklärung"><Info size={12} /></span>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="max-w-[360px]">{a.notiz}</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-small tabular-nums">{annahmeText(a, waehrung)}</td>
                  <td className="py-2 text-right font-mono text-micro text-ink3">
                    {QUELLE_LABEL[a.quelle] ?? a.quelle}
                    {a.stand && <span className="block">{fmtDate(a.stand)}</span>}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </ScrollListe>
  );
}

function SensTabelle({ zeilen }: { zeilen: SensZeile[] }) {
  const max = zeilen[0]?.spanne ?? 1;
  if (!zeilen.length) return null;
  return (
    <table className="w-full table-fixed">
      <colgroup><col /><col className="w-[100px]" /><col className="w-[100px]" /><col className="w-[110px]" /></colgroup>
      <thead>
        <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
          <th className="pb-2 font-normal">Stellschraube</th>
          <th className="pb-2 text-right font-normal">10 % weniger</th>
          <th className="pb-2 text-right font-normal">10 % mehr</th>
          <th className="pb-2 pl-4 font-normal">Wirkung</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.slice(0, 8).map((z) => (
          <tr key={z.id} className="border-b border-line/70">
            <td className="py-2 pr-3 truncate text-small text-ink2" title={z.label}>{z.label}</td>
            <td className="py-2 text-right font-mono text-small tabular-nums text-ink3">{jeAktie(z.runter, null)}</td>
            <td className="py-2 text-right font-mono text-small tabular-nums text-ink3">{jeAktie(z.hoch, null)}</td>
            <td className="py-2 pl-4">
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 rounded-full bg-accent" style={{ width: Math.max(4, (z.spanne / max) * 56) + 'px' }} />
                <span className="font-mono text-micro tabular-nums text-ink3">{z.wirkungPct == null ? '' : Math.round(z.wirkungPct * 100) + ' %'}</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ein Verfahren als aufklappbare Zeile: Wert, Erklärung, Details. */
function VerfahrensZeile({ v, kurs, waehrung, eurKurs }: {
  v: BewertungsAntwort['verfahren'][number];
  kurs: number | null; waehrung: string | null; eurKurs: number | null;
}) {
  const [offen, setOffen] = useState(false);
  const e = v.ergebnis;
  const wert = e.szenarien.base.wertJeAktie;
  const abw = kurs && wert != null ? (wert - kurs) / kurs : null;
  const Chevron = offen ? ChevronUp : ChevronDown;

  return (
    <li className="border-b border-line/70 last:border-b-0">
      <button
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        className="flex w-full cursor-pointer items-start gap-3 py-3 text-left transition-colors hover:bg-panel2/60"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-base font-bold text-ink">{VERFAHREN_NAME[v.id]}</span>
            {!v.automatisch && <Badge variant="neu">eigene Eingabe</Badge>}
            <Chevron size={14} className="text-ink3" aria-hidden />
          </span>
          <span className="mt-1 block text-small leading-relaxed text-ink3">{VERFAHREN_ERKLAERT[v.id]}</span>
          <span className="mt-1 block text-small leading-relaxed text-ink2">{v.grund}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-display text-display-sm font-bold tabular-nums">{jeAktie(wert, waehrung)}</span>
          <EuroZeile wert={wert} eurKurs={eurKurs} waehrung={waehrung} />
          <span className={cn('block font-mono text-small tabular-nums', abw == null ? 'text-ink3' : abw >= 0 ? 'text-up' : 'text-down')}>
            {abw == null ? '' : fmtPct(abw * 100)}
          </span>
        </span>
      </button>

      {offen && (
        <div className="grid gap-5 pb-5 pt-1">
          <div className="grid gap-3 sm:grid-cols-3">
            {(['worst', 'base', 'best'] as Fall[]).map((f) => (
              <SzenarioSpalte key={f} fall={f} wert={e.szenarien[f].wertJeAktie} kurs={kurs} waehrung={waehrung} eurKurs={eurKurs} hervor={f === 'base'} />
            ))}
          </div>

          <div>
            <h4 className="mb-2 font-mono text-micro font-bold uppercase tracking-[0.14em] text-ink3">
              Wie sicher ist das? ({fmtCompact(e.monteCarlo.laeufe)} Durchläufe mit zufällig gezogenen Annahmen)
            </h4>
            <p className="text-small text-ink2">
              In 8 von 10 Fällen landet der Wert zwischen{' '}
              <span className="font-mono tabular-nums text-ink">{jeAktie(e.monteCarlo.p10, waehrung)}</span> und{' '}
              <span className="font-mono tabular-nums text-ink">{jeAktie(e.monteCarlo.p90, waehrung)}</span>, Mittelpunkt{' '}
              <span className="font-mono tabular-nums text-ink">{jeAktie(e.monteCarlo.median, waehrung)}</span>.
            </p>
          </div>

          {!!e.sensitivitaet.treiber.length && (
            <div>
              <h4 className="mb-2 font-mono text-micro font-bold uppercase tracking-[0.14em] text-ink3">Woran das Ergebnis hängt</h4>
              <SensTabelle zeilen={e.sensitivitaet.treiber} />
            </div>
          )}

          <div>
            <h4 className="mb-2 font-mono text-micro font-bold uppercase tracking-[0.14em] text-ink3">Womit gerechnet wurde</h4>
            <AnnahmenTabelle annahmen={v.modell.annahmen} waehrung={waehrung} />
          </div>

          {!!e.warnungen.length && (
            <ul className="border-t border-line pt-2" aria-live="polite">
              {e.warnungen.map((w) => <WarnZeile key={w.id} w={w} />)}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ---------- Seite ----------

/** Gespeicherte Bewertungen — der Rückblick auf frühere Annahmen. */
function Gespeicherte() {
  const { data, isLoading } = useBewertungsListe();
  const navigate = useNavigate();
  const loeschen = useBewertungMutation((id: string) => api.del(`/api/bewertungen/${id}`));

  if (isLoading || !data?.length) return null;
  return (
    <Panel className="animate-rise">
      <PanelTitle>Gespeicherte Bewertungen</PanelTitle>
      <table className="w-full">
        <tbody>
          {data.map((b) => {
            const ab = b.wertJeAktie != null && b.kurs ? (b.wertJeAktie - b.kurs) / b.kurs : null;
            return (
              <tr key={b.id} className="group border-b border-line/70 last:border-b-0">
                <td className="py-2.5 pr-3">
                  <button
                    className="cursor-pointer text-small text-ink transition-colors hover:text-accent"
                    onClick={() => navigate(`/bewertung?id=${encodeURIComponent(b.id)}`)}
                  >
                    {b.name}
                  </button>
                  <span className="ml-2 font-mono text-micro text-ink3">{b.symbol}</span>
                </td>
                <td className="py-2.5 pr-3 text-right font-mono text-small tabular-nums">{jeAktie(b.wertJeAktie, b.waehrung)}</td>
                <td className={cn('py-2.5 pr-3 text-right font-mono text-small tabular-nums', ab == null ? 'text-ink3' : ab >= 0 ? 'text-up' : 'text-down')}>
                  {ab == null ? '–' : fmtPct(ab * 100)}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono text-micro text-ink3">
                  Fassung {b.versionen} · {fmtDate(b.geaendert)}
                </td>
                <td className="w-8 py-2.5 text-right">
                  <button
                    aria-label={`${b.name} löschen`}
                    onClick={() => loeschen.mutate(b.id)}
                    className="cursor-pointer text-ink3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-down"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function Ergebnis({ d, id }: { d: BewertungsAntwort; id?: string | null }) {
  const { kurs, waehrung, eurKurs, gesamt } = d;
  const satz = einschaetzungsSatz(d);
  const [gemerkt, setGemerkt] = useState<string | null>(null);
  const speichern = useBewertungMutation((body: { id?: string; auswertung: BewertungsAntwort }) =>
    api.post<{ id: string; version: number }>('/api/bewertungen', body),
  );

  return (
    <div className="grid gap-5">
      <Panel className="animate-rise">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-display-sm font-bold">{d.name}</h2>
          <span className="font-mono text-small text-ink3">({d.symbol})</span>
          <span className="ml-auto flex items-center gap-3">
            <span className="font-mono text-small text-ink3">
              Kurs {jeAktie(kurs, waehrung)} · Stand {fmtDate(d.stand)}
            </span>
            {/* Festhalten, um in sechs Monaten zu sehen, welche Annahme trug */}
            <Button
              variant="subtle"
              size="sm"
              disabled={speichern.isPending}
              onClick={() => speichern.mutate(
                { id: id ?? undefined, auswertung: d },
                { onSuccess: (r) => setGemerkt('Fassung ' + (r as { version: number }).version + ' gespeichert') },
              )}
            >
              <Save size={13} aria-hidden /> {gemerkt ?? 'Festhalten'}
            </Button>
          </span>
        </div>

        {gesamt.base == null ? (
          <Empty className="mt-4" aria-live="polite">
            Für diesen Wert lässt sich mit kostenlosen Daten keine belastbare Bewertung rechnen.
            Die Gründe stehen unten.
          </Empty>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(['worst', 'base', 'best'] as Fall[]).map((f) => (
                <SzenarioSpalte key={f} fall={f} wert={gesamt[f]} kurs={kurs} waehrung={waehrung} eurKurs={eurKurs} hervor={f === 'base'} />
              ))}
            </div>
            {satz && <p className="mt-4 border-t border-line pt-4 text-base leading-relaxed text-ink2">{satz}</p>}
          </>
        )}
      </Panel>

      <Panel className="animate-rise">
        <PanelTitle>So kommt die Zahl zustande</PanelTitle>
        {d.verfahren.length ? (
          <ul>
            {d.verfahren.map((v) => (
              <VerfahrensZeile key={v.id + (v.basis ?? '')} v={v} kurs={kurs} waehrung={waehrung} eurKurs={eurKurs} />
            ))}
          </ul>
        ) : (
          <Empty>Kein Verfahren ist mit den verfügbaren Daten belastbar.</Empty>
        )}

        {!!d.abgelehnt?.length && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 font-mono text-micro font-bold uppercase tracking-[0.14em] text-ink3">Nicht angewandt</h3>
            <ul className="grid gap-2">
              {d.abgelehnt.map((a) => (
                <li key={a.id} className="text-small leading-relaxed">
                  <span className="text-ink2">{VERFAHREN_NAME[a.id]}: </span>
                  <span className="text-ink3">{a.grund}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {!!d.peerGruppe?.peers?.length && (
        <Panel className="animate-rise">
          <PanelTitle>Vergleichsgruppe</PanelTitle>
          <p className="-mt-2 mb-3 text-small text-ink3">
            {d.peerGruppe.peers.length} Unternehmen der Branche {d.peerGruppe.branche} in ähnlicher Größe.
            Aus ihren Kennzahlen kommt das Multiple im Branchenvergleich.
          </p>
          <ScrollListe className="max-h-[320px]">
            <table className="w-full table-fixed">
              <colgroup><col className="w-[90px]" /><col /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[110px]" /></colgroup>
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
                  <th className="pb-2 font-normal">Symbol</th>
                  <th className="pb-2 font-normal">Name</th>
                  <th className="pb-2 text-right font-normal">Börsenwert</th>
                  <th className="pb-2 text-right font-normal">EV/Umsatz</th>
                  <th className="pb-2 text-right font-normal">EV/EBITDA</th>
                </tr>
              </thead>
              <tbody>
                {d.peerGruppe.peers.map((p) => (
                  <tr key={p.symbol} className="border-b border-line/70">
                    <td className="py-2 font-mono text-small text-accent">{p.symbol}</td>
                    <td className="py-2 truncate text-small text-ink2" title={p.name}>{p.name}</td>
                    <td className="py-2 text-right font-mono text-small tabular-nums text-ink3">{fmtCompact(p.marktkap)}</td>
                    <td className="py-2 text-right font-mono text-small tabular-nums text-ink3">{p.evUmsatz == null ? '–' : fmtNum(p.evUmsatz, 1) + '×'}</td>
                    <td className="py-2 text-right font-mono text-small tabular-nums text-ink3">{p.evEbitda == null ? '–' : fmtNum(p.evEbitda, 1) + '×'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollListe>
        </Panel>
      )}
    </div>
  );
}

export default function BewertungPage() {
  const params = useSearchParams();
  const symbol = params.get('symbol');
  const id = params.get('id');
  const navigate = useNavigate();
  const [sucheOffen, setSucheOffen] = useState(false);
  useTitel(symbol ? `Bewertung · ${symbol}` : 'Bewertung');

  // Entweder eine gespeicherte Fassung (?id=) oder frisch gerechnet (?symbol=)
  const gespeichert = useBewertungGespeichert(id);
  const frisch = useBewertungStart(id ? null : symbol);
  const { data, isLoading, error } = id ? gespeichert : frisch;

  return (
    <div className="grid gap-5">
      <header className="animate-rise">
        <div className="flex items-center gap-3 font-mono text-micro uppercase tracking-[0.14em] text-ink3">
          Bewertung
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-4">
          <h1 className="font-display text-display-md font-bold tracking-tight text-balance">
            Was ein Wert <em className="not-italic text-accent">wert ist.</em>
          </h1>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSucheOffen(true)}>
            <Search size={13} aria-hidden /> {symbol ? 'Anderen Wert' : 'Wert wählen'}
          </Button>
        </div>
      </header>

      <Dialog open={sucheOffen} onOpenChange={setSucheOffen}>
        <DialogContent ohneSchliessen className="p-0">
          <SymbolSearch onPick={(s) => { setSucheOffen(false); navigate(`/bewertung?symbol=${encodeURIComponent(s.symbol)}`); }} />
        </DialogContent>
      </Dialog>

      {!symbol && !id && (
        <Panel className="animate-rise">
          <Empty>
            Wähle oben einen Wert. Stockpit rechnet dann selbst — mit Zahlen aus dem Geschäftsbericht,
            den Schätzungen der Analysten und dem Vergleich zu Wettbewerbern derselben Branche.
          </Empty>
        </Panel>
      )}

      {!symbol && !id && <Gespeicherte />}

      {(symbol || id) && isLoading && (
        <div className="grid gap-5" role="status" aria-label="Bewertung wird gerechnet">
          <Skeleton className="h-[260px]" />
          <Skeleton className="h-[320px]" />
        </div>
      )}

      {(symbol || id) && error && (
        <Panel>
          <Empty aria-live="polite">
            {String((error as Error).message) === 'HTTP 404'
              ? (id ? 'Diese gespeicherte Bewertung gibt es nicht mehr.' : `Für ${symbol} gibt es keine Bewertungsdaten.`)
              : 'Die Bewertung konnte nicht geladen werden. Läuft der Server noch?'}
          </Empty>
        </Panel>
      )}

      {data && <Ergebnis key={id ?? symbol} d={data} id={id} />}
    </div>
  );
}
