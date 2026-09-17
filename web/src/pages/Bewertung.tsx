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

/** Multiples ueber 200 sind Datenfehler (Roivant stand mit EV/Umsatz 3.400 da)
 *  — die Rechnung verwirft sie, also zeigt die Tabelle sie auch nicht. */
const multiple = (v: number | null | undefined) =>
  v == null || v <= 0 || v > 200
    ? '–'
    // feste Nachkommastelle, sonst steht '4×' neben '3,6×'
    : new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '×';

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

/**
 * Erklärt die drei Spalten. Ohne diesen Absatz ist unklar, woher „pessimistisch"
 * kommt — man könnte es für frei gesetzte Zahlen halten, was den Zweck des
 * Regelwerks zunichte machen würde.
 */
function SzenarienErklaert({ anzahl }: { anzahl: number }) {
  return (
    <div className="mt-4 grid gap-2 border-t border-line pt-4">
      <p className="max-w-[78ch] text-small leading-relaxed text-ink2">
        <span className="font-bold text-ink">Woher die drei Werte kommen: </span>
        Sie entstehen nach festen Regeln aus denselben Annahmen — nicht durch freies Verschieben von
        Zahlen. Beim Branchenvergleich etwa rechnet <em className="not-italic text-ink">pessimistisch</em> mit
        dem unteren Viertel der Vergleichsgruppe, <em className="not-italic text-ink">realistisch</em> mit
        dem Mittelwert und <em className="not-italic text-ink">optimistisch</em> mit dem oberen Viertel.
        Gemessene Zahlen aus dem Geschäftsbericht wie Schulden oder Aktienanzahl bleiben in allen drei
        Fällen gleich — sie sind gemessen, nicht geschätzt.
      </p>
      {anzahl > 1 && (
        <p className="max-w-[78ch] text-small leading-relaxed text-ink2">
          <span className="font-bold text-ink">Warum ein Mittelwert: </span>
          Jedes Verfahren betrachtet die Firma aus einem anderen Blickwinkel und liegt deshalb
          woanders. Der gezeigte Wert ist die Mitte aus den {anzahl} Verfahren — die Einzelwerte
          stehen unten, damit du siehst, wie weit sie auseinanderliegen.
        </p>
      )}
    </div>
  );
}

/** Welches Verfahren passt zu welcher Art von Unternehmen — aufklappbar. */
function VerfahrensUebersicht() {
  const [offen, setOffen] = useState(false);
  const Chevron = offen ? ChevronUp : ChevronDown;
  const zeilen: { art: string; verfahren: string; warum: string }[] = [
    {
      art: 'Reife Firmen mit stetigem Geschäft',
      verfahren: 'Zahlungsstrom-Modell + Branchenvergleich',
      warum: 'Die Zahlungsströme sind planbar genug, um sie über zehn Jahre zu schätzen.',
    },
    {
      art: 'Schnell wachsende Firmen',
      verfahren: 'Branchenvergleich',
      warum: 'Eine Zehnjahresprognose wäre bei hohem Wachstum eine Wette auf das Abschmelzen — der Vergleich mit der Branche trägt weiter.',
    },
    {
      art: 'Biotech und Pharma mit Umsatz',
      verfahren: 'Branchenvergleich, bei Gewinn zusätzlich Zahlungsstrom-Modell',
      warum: 'Der Wert hängt an Zulassungen und Patenten. Der Vergleich mit anderen Biotechs fängt ein, wie der Markt solche Aussichten insgesamt bepreist.',
    },
    {
      art: 'Biotech ohne Umsatz (reine Pipeline)',
      verfahren: 'Pipeline-Modell (eigene Eingabe)',
      warum: 'Es gibt noch nichts zu vergleichen. Jedes Medikament muss einzeln mit Spitzenumsatz und Zulassungswahrscheinlichkeit angesetzt werden — diese Zahlen liefert keine kostenlose Quelle.',
    },
    {
      art: 'Banken, Versicherer, Kreditgeber',
      verfahren: 'Eigenkapital-Modell',
      warum: 'Bei Kreditgebern laufen Kreditvergaben durch die Cashflow-Rechnung: wer weniger Neugeschäft macht, sieht auf dem Papier besser aus. Bewertet wird deshalb über Buchwert und Eigenkapitalrendite.',
    },
    {
      art: 'Konzerne mit mehreren Geschäftsfeldern',
      verfahren: 'Bereiche einzeln (eigene Eingabe)',
      warum: 'Ein Handelsgeschäft und eine Cloud-Sparte werden am Markt völlig unterschiedlich bewertet — zusammengerechnet verschwindet dieser Unterschied.',
    },
  ];

  return (
    <div className="mt-5 border-t border-line pt-4">
      <button
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        className="flex cursor-pointer items-center gap-2 font-mono text-micro font-bold uppercase tracking-[0.14em] text-ink3 transition-colors hover:text-ink"
      >
        Welches Verfahren passt zu welcher Firma?
        <Chevron size={13} aria-hidden />
      </button>
      {offen && (
        <ul className="mt-4 grid gap-4">
          {zeilen.map((z) => (
            <li key={z.art} className="grid gap-1">
              <span className="text-small font-bold text-ink">{z.art}</span>
              <span className="font-mono text-micro text-accent">{z.verfahren}</span>
              <span className="max-w-[78ch] text-small leading-relaxed text-ink3">{z.warum}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

/** Ein Verfahren als aufklappbare Karte: Wert, Erklärung, Details. */
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
    <li className="rounded-md border border-line bg-panel2/40">
      <button
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        className="flex w-full cursor-pointer items-start gap-6 rounded-md p-4 text-left transition-colors hover:bg-panel2/70"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-lg font-bold text-ink">{VERFAHREN_NAME[v.id]}</span>
            {!v.automatisch && <Badge variant="neu">eigene Eingabe</Badge>}
            <Chevron size={14} className="text-ink3" aria-hidden />
          </span>
          {/* Lesbare Zeilenlänge: Fließtext bricht sonst über die volle Breite */}
          <span className="mt-2 block max-w-[62ch] text-small leading-relaxed text-ink2">
            {VERFAHREN_ERKLAERT[v.id]}
          </span>
          <span className="mt-2.5 block max-w-[62ch] text-small leading-relaxed">
            <span className="font-mono text-micro uppercase tracking-[0.14em] text-ink3">Warum hier? </span>
            <span className="text-ink2">{v.grund}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-display text-display-sm font-bold tabular-nums">{jeAktie(wert, waehrung)}</span>
          <EuroZeile wert={wert} eurKurs={eurKurs} waehrung={waehrung} />
          <span className={cn('mt-0.5 block font-mono text-small tabular-nums', abw == null ? 'text-ink3' : abw >= 0 ? 'text-up' : 'text-down')}>
            {abw == null ? '' : fmtPct(abw * 100) + ' zum Kurs'}
          </span>
        </span>
      </button>

      {offen && (
        <div className="grid gap-6 border-t border-line px-4 pb-5 pt-5">
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

/**
 * Die Vergleichsgruppe mit Erklärung, wozu sie da ist. Die Wachstumsspalte ist
 * der wichtigste Teil: wächst die betrachtete Firma deutlich schneller als die
 * Gruppe, erklärt das einen Aufschlag im Kurs — ohne diese Spalte wirkt die
 * Bewertung schlicht „zu hoch" (Insmed wächst 186 %, seine Branchen-Nachbarn
 * einstellig).
 */
function PeerPanel({ gruppe }: { gruppe: NonNullable<BewertungsAntwort['peerGruppe']> }) {
  // Wachstum des Zielwerts AUS DERSELBEN QUELLE wie die Gruppe — Yahoo misst es
  // anders (Quartal statt zwölf Monate) und lieferte 296 % gegen 186 %.
  const eigenes = gruppe.ziel?.wachstum ?? null;
  const wachstumsWerte = gruppe.peers
    .map((p) => (p as { wachstum?: number | null }).wachstum)
    .filter((v): v is number => typeof v === 'number');
  const medianWachstum = wachstumsWerte.length
    ? [...wachstumsWerte].sort((a, b) => a - b)[Math.floor(wachstumsWerte.length / 2)]
    : null;
  const deutlichSchneller = eigenes != null && medianWachstum != null && eigenes > medianWachstum + 0.2;

  return (
    <Panel className="animate-rise">
      <PanelTitle>Vergleichsgruppe</PanelTitle>
      <div className="mb-4 grid gap-2">
        <p className="max-w-[78ch] text-small leading-relaxed text-ink2">
          <span className="font-bold text-ink">Wozu das dient: </span>
          Der Branchenvergleich braucht einen Maßstab. Diese {gruppe.peers.length} Unternehmen der Branche{' '}
          <span className="text-ink">{gruppe.branche}</span> sind ähnlich groß; aus ihren Kennzahlen wird
          das Vielfache gebildet, mit dem gerechnet wird. Ohne eine solche Gruppe müsste das Modell die
          Aktie mit sich selbst vergleichen und gäbe nur den heutigen Kurs zurück.
        </p>
        {deutlichSchneller && (
          <p className="max-w-[78ch] text-small leading-relaxed text-ink2">
            <span className="font-bold text-ink">Einordnung: </span>
            Diese Firma wächst mit {fmtPct(eigenes! * 100, false)} deutlich schneller als die Gruppe
            (Mitte {fmtPct(medianWachstum! * 100, false)}). Ein Teil des Kursaufschlags erklärt sich
            dadurch — der Vergleich zeigt dann vor allem, wie viel Wachstum der Kurs bereits einpreist.
          </p>
        )}
      </div>
      <ScrollListe className="max-h-[340px]">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[78px]" /><col /><col className="w-[104px]" /><col className="w-[100px]" />
            <col className="w-[104px]" /><col className="w-[104px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
              <th className="pb-2.5 font-normal">Symbol</th>
              <th className="pb-2.5 font-normal">Name</th>
              <th className="pb-2.5 text-right font-normal">Börsenwert</th>
              <th className="pb-2.5 text-right font-normal">Wachstum</th>
              <th className="pb-2.5 text-right font-normal">EV/Umsatz</th>
              <th className="pb-2.5 text-right font-normal">EV/EBITDA</th>
            </tr>
          </thead>
          <tbody>
            {gruppe.peers.map((p) => {
              const w = (p as { wachstum?: number | null }).wachstum;
              return (
                <tr key={p.symbol} className="border-b border-line/70">
                  <td className="py-2.5 font-mono text-small text-accent">{p.symbol}</td>
                  <td className="py-2.5 truncate pr-3 text-small text-ink2" title={p.name}>{p.name}</td>
                  <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">{fmtCompact(p.marktkap)}</td>
                  <td className={cn('py-2.5 text-right font-mono text-small tabular-nums', w == null ? 'text-ink3' : w >= 0 ? 'text-up' : 'text-down')}>
                    {w == null ? '–' : fmtPct(w * 100)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">{multiple(p.evUmsatz)}</td>
                  <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">{multiple(p.evEbitda)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollListe>
    </Panel>
  );
}

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
            {satz && <p className="mt-5 max-w-[78ch] text-base leading-relaxed text-ink2">{satz}</p>}
            <SzenarienErklaert anzahl={gesamt.verfahren.length} />
          </>
        )}
      </Panel>

      <Panel className="animate-rise">
        <PanelTitle>So kommt die Zahl zustande</PanelTitle>
        {d.verfahren.length ? (
          <ul className="grid gap-3">
            {d.verfahren.map((v) => (
              <VerfahrensZeile key={v.id + (v.basis ?? '')} v={v} kurs={kurs} waehrung={waehrung} eurKurs={eurKurs} />
            ))}
          </ul>
        ) : (
          <Empty>Kein Verfahren ist mit den verfügbaren Daten belastbar.</Empty>
        )}

        <VerfahrensUebersicht />

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

      {!!d.peerGruppe?.peers?.length && <PeerPanel gruppe={d.peerGruppe} />}
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
