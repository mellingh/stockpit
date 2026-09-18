// Bewertung: Kürzel eingeben, EINE Zahl bekommen.
//
// Die Seite rechnet nicht ein Verfahren, sondern alle, für die es belastbare
// Daten gibt, und fasst sie zu einem Wert zusammen. Was NICHT gerechnet werden
// kann, wird mit Begründung genannt statt verschwiegen — ein Ergebnis aus
// leeren Feldern sieht sonst aus wie eine Aussage.
//
// KEIN Kauf- oder Verkaufsurteil: die Seite liefert Zahlen und sagt, woher sie
// kommen. Die Entscheidung trifft der Nutzer.

import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileDown, Info, Save, Search, Trash2 } from 'lucide-react';
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
  dcf: 'Zahlungsstrom-Modell (Discounted Cash Flow)',
  multiples: 'Branchenvergleich (Peer Multiples)',
  sotp: 'Bereiche einzeln (Sum of the Parts)',
  rnpv: 'Pipeline-Modell (rNPV)',
  residual: 'Eigenkapital-Modell (Residual Income)',
};

/** Kurzform ohne Klammer — für Fließtext und Listen. */
const VERFAHREN_KURZ: Record<Verfahren, string> = {
  dcf: 'Zahlungsstrom-Modell',
  multiples: 'Branchenvergleich',
  sotp: 'Bereiche einzeln',
  rnpv: 'Pipeline-Modell',
  residual: 'Eigenkapital-Modell',
};

/** Ein Satz in Alltagssprache — keine Fachbegriffe ohne Übersetzung. */
const VERFAHREN_ERKLAERT: Record<Verfahren, string> = {
  dcf: 'Schätzt, wie viel Geld das Unternehmen in den nächsten zehn Jahren erwirtschaftet, und rechnet das auf heute zurück.',
  multiples: 'Schaut, was Anleger für vergleichbare Firmen derselben Branche zahlen — etwa das Achtfache des Umsatzes — und überträgt das auf diese Aktie.',
  sotp: 'Bewertet jeden Geschäftsbereich einzeln und zählt zusammen, abzüglich eines Abschlags dafür, dass die Bereiche nicht einzeln verkäuflich sind.',
  rnpv: 'Für Biotech: jedes Medikament mit seinem möglichen Spitzenumsatz, multipliziert mit der Wahrscheinlichkeit, dass es zugelassen wird.',
  residual: 'Für Banken und Kreditgeber: bewertet das Eigenkapital danach, wie viel Rendite darauf erwirtschaftet wird. Cashflow-Modelle führen dort in die Irre.',
};

/** Was das jeweilige Vielfache bedeutet — in Alltagssprache. */
const MULTIPLE_INFO: Record<string, string> = {
  ebitda: 'Firmenwert geteilt durch den operativen Gewinn. 10× heißt: die Firma kostet das Zehnfache dessen, was sie im Jahr operativ verdient.',
  umsatz: 'Firmenwert geteilt durch den Jahresumsatz. 3× heißt: die Firma kostet das Dreifache ihres Umsatzes.',
  umsatzErwartet: 'Firmenwert geteilt durch den für nächstes Jahr erwarteten Umsatz — bei wachsenden Firmen aussagekräftiger als der heutige.',
  gewinn: 'Kurs geteilt durch den Gewinn je Aktie (KGV). 20× heißt: man zahlt zwanzig Jahresgewinne für eine Aktie.',
  buchwert: 'Kurs geteilt durch das Eigenkapital je Aktie (KBV). 2× heißt: man zahlt das Doppelte dessen, was laut Bilanz an Vermögen da ist.',
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

/**
 * Eine Szenario-Karte. Der Analystenwert steht DARIN statt als Fließtext
 * darunter (Micha) — pessimistisch gegen deren tiefstes Ziel, realistisch gegen
 * den Schnitt, optimistisch gegen das höchste. So sieht man die fremde
 * Einschätzung direkt neben der eigenen, ohne einen Absatz zu lesen.
 */
function SzenarioSpalte({ fall, wert, kurs, waehrung, eurKurs, hervor, analyst }: {
  fall: Fall; wert: number | null; kurs: number | null; waehrung: string | null;
  eurKurs: number | null; hervor?: boolean; analyst?: number | null;
}) {
  const abweichung = kurs && wert != null ? (wert - kurs) / kurs : null;
  return (
    // flex-col + mt-auto am Fuß: die Analystenzeile sitzt in allen drei Karten
    // auf derselben Höhe, auch wenn darüber unterschiedlich viel steht
    // (die hervorgehobene Karte hat eine größere Zahl).
    <div className={cn('flex h-full flex-col rounded-md border px-4 py-3', hervor ? 'border-accent/40 bg-accent-soft' : 'border-line bg-panel2')}>
      <span className="font-mono text-micro uppercase tracking-[0.14em] text-ink3">{FALL_LABEL[fall]}</span>
      <span className={cn('mt-1 font-display font-bold tabular-nums', hervor ? 'text-display-md' : 'text-display-sm')}>
        {jeAktie(wert, waehrung)}
      </span>
      <EuroZeile wert={wert} eurKurs={eurKurs} waehrung={waehrung} />
      <span className={cn('mt-0.5 mb-3 font-mono text-small tabular-nums', abweichung == null ? 'text-ink3' : abweichung >= 0 ? 'text-up' : 'text-down')}>
        {abweichung == null ? '–' : fmtPct(abweichung * 100) + ' zum Kurs'}
      </span>
      {analyst != null && (
        // line-strong statt line: auf dem helleren Hintergrund der
        // hervorgehobenen Karte war die dünne Linie unsichtbar
        <span className="mt-auto flex items-baseline justify-between gap-2 border-t border-line-strong pt-2.5">
          <span className="text-micro text-ink3">Analysten</span>
          <span className="font-mono text-small font-bold tabular-nums text-ink2">{jeAktie(analyst, waehrung)}</span>
        </span>
      )}
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
    ? `Gerechnet mit einem Verfahren (${VERFAHREN_KURZ[gesamt.verfahren[0]]})`
    : `Mittelwert aus ${anzahl} Verfahren`;

  if (Math.abs(abw) < 0.1) return `${wie}: Der Kurs liegt etwa dort, wo die Rechnung ihn sieht.`;
  if (abw > 0) return `${wie}: ${fmtPct(abw * 100, false)} über dem Kurs — der Markt traut dem Unternehmen weniger zu als diese Annahmen.`;
  return `${wie}: ${fmtPct(-abw * 100, false)} unter dem Kurs — im Kurs steckt mehr Erwartung, als diese Annahmen hergeben.`;
}

/**
 * Zerlegt den Kurs in das, was die Rechnung trägt, und den Rest.
 *
 * Das ist die ehrlichste Antwort auf die Frage, warum ein Modell 24 USD sagt,
 * während Analysten bei 200 stehen: Beide beantworten verschiedene Fragen. Das
 * Modell bewertet das HEUTIGE Geschäft im Branchenvergleich; im Kurs steckt
 * zusätzlich die Erwartung an ein Geschäft, das es noch nicht gibt. Diese
 * Differenz ist keine Ungenauigkeit — sie ist die eigentliche Aussage.
 */
function KursZerlegung({ d }: { d: BewertungsAntwort }) {
  const { kurs, waehrung, gesamt, analysten } = d;
  if (kurs == null || gesamt.base == null) return null;

  // Zwei grundverschiedene Fälle — früher wurde nur der erste gezeigt, wodurch
  // bei Klarna „Erwartung an die Zukunft: 0,00 USD" neben „realistisch
  // 22,37 USD" stand und sich widersprach.
  const rechnungDarueber = gesamt.base > kurs;
  const heute = Math.min(gesamt.base, kurs);
  const erwartung = kurs - heute;
  const anteilHeute = (heute / kurs) * 100;

  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-4">
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-mono text-micro uppercase tracking-[0.14em] text-accent">
            {rechnungDarueber ? 'Kurs und Rechnung' : 'Woraus der heutige Kurs besteht'}
          </span>
        </div>

        {rechnungDarueber ? (
          <p className="max-w-[78ch] text-small leading-relaxed text-ink2">
            Schon das heutige Geschäft wäre{' '}
            <span className="font-mono font-bold tabular-nums text-ink">{jeAktie(gesamt.base, waehrung)}</span>{' '}
            wert — <span className="font-bold text-ink">mehr als der Kurs</span>. Es steckt also keine Zukunftserwartung im Kurs, eher ein Abschlag für
            ein Risiko, das diese Annahmen nicht kennen.
          </p>
        ) : (
          <>
            {/* Zwei Balken: was die Rechnung trägt, und was an Erwartung darüber liegt */}
            <div className="flex h-2 overflow-hidden rounded-full bg-panel2" role="img"
              aria-label={`${Math.round(anteilHeute)} Prozent des Kurses deckt die Rechnung ab`}>
              <span className="bg-accent" style={{ width: anteilHeute + '%' }} />
              <span className="flex-1 bg-line-strong" />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-small">
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                <span className="text-ink2">Vom heutigen Geschäft gedeckt</span>
                <span className="font-mono font-bold tabular-nums text-ink">{jeAktie(heute, waehrung)}</span>
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-line-strong" />
                <span className="text-ink2">Vorschuss auf die Zukunft</span>
                <span className="font-mono font-bold tabular-nums text-ink">{jeAktie(erwartung, waehrung)}</span>
              </span>
            </div>
            <p className="mt-2.5 max-w-[78ch] text-small leading-relaxed text-ink3">
              Von {jeAktie(kurs, waehrung)} deckt die Rechnung {Math.round(anteilHeute)} % ab. Der Rest ist
              bezahlt für Geschäft, das es heute noch nicht gibt — je größer dieser Teil, desto mehr muss
              das Unternehmen erst noch liefern.
            </p>
          </>
        )}
      </div>

      {/* Die Zahlen stehen jetzt IN den Karten — hier bleibt nur der Hinweis,
          wenn die Analysten so weit weg sind, dass es einer Erklärung bedarf. */}
      {analysten?.kursziel != null && analysten.kursziel > gesamt.base * 1.5 && (
        <p className="max-w-[78ch] text-small leading-relaxed text-ink3">
          Die Analysten liegen deutlich höher. Das heißt nicht, dass eine Seite falsch rechnet: Sie
          modellieren die Entwicklung über zehn Jahre, diese Rechnung bewertet das heutige Geschäft.
        </p>
      )}
    </div>
  );
}

/**
 * Die Rechnung zum Mitlesen, ganz oben im aufgeklappten Bereich.
 *
 * „Branchenvergleich → 22,37 USD" beantwortet nicht, WIE man dahin kommt.
 * Diese Kette tut es in einer Zeile: Kennzahl × Vielfaches = Firmenwert,
 * Schulden ab, durch die Aktien. Wer will, liest darunter weiter; wer nur
 * wissen will, woher die Zahl kommt, ist nach drei Sekunden fertig.
 */
function Rechenweg({ v, waehrung }: { v: BewertungsAntwort['verfahren'][number]; waehrung: string | null }) {
  const e = v.ergebnis;
  const wert = (id: string) => v.modell.annahmen.find((a) => a.id === id)?.wert ?? null;
  const geld = (x: number | null | undefined) => (x == null ? '–' : fmtCompact(x));

  const schritte: { label: string; wert: string; op?: string }[] = [];

  if (v.id === 'multiples') {
    const kennzahl = v.modell.annahmen.find((a) => a.id === 'mult.kennzahl');
    const m = wert('mult.multiple');
    const aufEquity = wert('mult.aufEquity') === 1;
    schritte.push({ label: kurzLabel(kennzahl?.label ?? 'Kennzahl'), wert: geld(kennzahl?.wert) });
    schritte.push({ op: '×', label: 'Vielfaches der Gruppe', wert: m == null ? '–' : fmtNum(m, 1) + '×' });
    schritte.push({ op: '=', label: aufEquity ? 'Wert des Eigenkapitals' : 'Wert des Unternehmens', wert: geld(e.kern.enterpriseValue ?? e.equity.equityValue) });
    if (!aufEquity) {
      schritte.push({ op: '±', label: 'Kasse minus Schulden', wert: geld((e.equity.equityValue ?? 0) - (e.kern.enterpriseValue ?? 0)) });
    }
  } else if (v.id === 'residual') {
    schritte.push({ label: 'Eigenkapital', wert: geld(wert('res.eigenkapital')) });
    schritte.push({ op: '×', label: 'faires Kurs-Buchwert-Verhältnis', wert: e.kern.fairesKbv == null ? '–' : fmtNum(e.kern.fairesKbv, 2) + '×' });
    schritte.push({ op: '=', label: 'Wert des Eigenkapitals', wert: geld(e.equity.equityValue) });
  } else if (v.id === 'dcf') {
    schritte.push({ label: 'Zahlungsströme der Prognosejahre', wert: geld(e.kern.barwertExplizit) });
    schritte.push({ op: '+', label: 'Wert danach (Endwert)', wert: geld(e.kern.endwert) });
    schritte.push({ op: '±', label: 'Kasse minus Schulden', wert: geld((e.equity.equityValue ?? 0) - (e.kern.enterpriseValue ?? 0)) });
  } else {
    return null;
  }

  schritte.push({ op: '÷', label: 'Aktien', wert: fmtCompact(e.equity.aktien) });

  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3.5">
      <div className="mb-3 font-mono text-micro uppercase tracking-[0.14em] text-accent">So wird gerechnet</div>
      <div className="flex flex-wrap items-stretch gap-x-3 gap-y-3">
        {schritte.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            {s.op && <span aria-hidden className="font-mono text-lg text-ink3">{s.op}</span>}
            <span className="grid gap-0.5">
              <span className="font-mono text-small tabular-nums text-ink">{s.wert}</span>
              <span className="text-micro text-ink3">{s.label}</span>
            </span>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <span aria-hidden className="font-mono text-lg text-ink3">=</span>
          <span className="grid gap-0.5">
            <span className="font-mono text-small font-bold tabular-nums text-accent">
              {jeAktie(e.szenarien.base.wertJeAktie, waehrung)}
            </span>
            <span className="text-micro text-ink3">je Aktie</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Lange Annahme-Labels für die Rechenkette kürzen (Klammer-Zusatz raus). */
function kurzLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').replace(/,.*$/, '');
}

/**
 * Die Gegenprobe: was im Kurs und im Analystenziel an Geschäftsentwicklung
 * steckt. Das ist der Zweck des Tools — eine fremde Einschätzung wird nicht
 * geglaubt oder verworfen, sondern in eine nachprüfbare Zahl übersetzt.
 */
function Gegenprobe({ v, waehrung, kurs, analystenZiel }: {
  v: BewertungsAntwort['verfahren'][number];
  waehrung: string | null; kurs: number | null; analystenZiel: number | null;
}) {
  const e = v.eingepreist;
  if (!e?.kurs && !e?.analysten) return null;

  /**
   * Eine Zeile stellt NÖTIG gegen VORHANDEN. Vorher stand dort „1,56 Mrd" und
   * „0,6× von heute" — man musste selbst ausrechnen, dass der tatsächliche
   * Buchwert 2,51 Mrd beträgt und die Schwelle damit längst überschritten ist.
   */
  const zeile = (
    label: string,
    preis: number | null,
    x: NonNullable<BewertungsAntwort['verfahren'][number]['eingepreist']>['kurs'],
  ) => {
    if (!x) return null;
    const erfuellt = x.vielfaches != null ? x.vielfaches <= 1 : (x.heute ?? 0) >= x.noetig;
    const einheit = (v: number | null | undefined) =>
      v == null ? '–' : x.art === 'kennzahl' ? fmtCompact(v) : fmtPct(v * 100, false);

    return (
      <tr key={label} className="border-b border-line/70 last:border-b-0">
        <td className="py-3 pr-4">
          <span className="block text-small text-ink">{label}</span>
          <span className="block font-mono text-micro tabular-nums text-ink3">{jeAktie(preis, waehrung)}</span>
        </td>
        <td className="py-3 pr-4 text-right font-mono text-small font-bold tabular-nums text-ink">
          {einheit(x.noetig)}
        </td>
        <td className="py-3 pr-4 text-right font-mono text-small tabular-nums text-ink2">
          {einheit(x.heute)}
        </td>
        <td className="py-3 text-right">
          {erfuellt ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-small text-up">
              <Check size={13} aria-hidden /> erfüllt
            </span>
          ) : (
            <span className="font-mono text-small tabular-nums text-ink2">
              {x.jahre == null ? 'offen' : 'in ~' + fmtNum(x.jahre, 1) + ' Jahren'}
            </span>
          )}
        </td>
      </tr>
    );
  };

  // Kurzform für den Spaltenkopf — das volle Annahme-Label („Umsatz nächstes
  // Jahr, erwartet (Forward Revenue)') sprengt die Spalte.
  const basis = v.basis ?? '';
  const wasNoetig = v.id === 'dcf'
    ? 'Nötiges Wachstum'
    : v.id === 'residual'
      ? 'Nötige Rendite'
      : basis === 'ebitda'
        ? 'Nötiges EBITDA'
        : basis === 'gewinn'
          ? 'Nötiger Gewinn'
          : basis === 'buchwert'
            ? 'Nötiger Buchwert'
            : 'Nötiger Umsatz';
  const tempo = e.kurs?.tempo ?? e.analysten?.tempo ?? null;
  // Der Erklaersatz zur Dauer ist ueberfluessig, wenn beide Zeilen „erfuellt' sind
  const brauchtZeit = [e.kurs, e.analysten].some((x) => x && (x.vielfaches ?? 0) > 1);

  return (
    <Abschnitt
      titel="Die Gegenprobe"
      info="Dieselbe Rechnung rückwärts: Statt zu fragen, was die Aktie wert ist, wird gefragt, was das Unternehmen liefern müsste, damit der heutige Kurs bzw. das Analystenziel aufgeht. Gerechnet wird mit demselben Vielfachen wie oben."
    >
      <table className="w-full table-fixed">
        <colgroup><col /><col className="w-[150px]" /><col className="w-[150px]" /><col className="w-[140px]" /></colgroup>
        <thead>
          <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
            <th className="pb-2.5 font-normal">Damit das aufgeht …</th>
            <th className="whitespace-nowrap pb-2.5 pr-4 text-right font-normal">{wasNoetig}</th>
            <th className="whitespace-nowrap pb-2.5 pr-4 text-right font-normal">Hat die Firma</th>
            <th className="whitespace-nowrap pb-2.5 text-right font-normal">Stand</th>
          </tr>
        </thead>
        <tbody>
          {zeile('Heutiger Kurs', kurs, e.kurs)}
          {zeile('Kursziel der Analysten', analystenZiel, e.analysten)}
        </tbody>
      </table>
      {tempo != null && brauchtZeit && (
        <p className="mt-3 max-w-[78ch] text-small leading-relaxed text-ink3">
          Die Jahresangabe unterstellt {fmtPct(tempo * 100, false)} Wachstum pro Jahr — was Analysten
          fürs nächste Jahr erwarten. Dauerhaft hält das kaum eine Firma durch, es ist also die
          günstigste Annahme, nicht die wahrscheinlichste.
        </p>
      )}
    </Abschnitt>
  );
}

/**
 * Die Pipeline eines Biotechs: woraus das künftige Geschäft kommen müsste.
 *
 * Ohne diese Liste ist „Erwartung an die Zukunft: 81 USD je Aktie" eine
 * abstrakte Zahl. Mit ihr sieht man, worauf sich diese Erwartung stützt — und
 * wie viel davon statistisch übrig bleibt: aus zehn Phase-1-Programmen wird im
 * Schnitt gut eines zugelassen.
 */
function PipelinePanel({ pipeline }: { pipeline: NonNullable<BewertungsAntwort['pipeline']> }) {
  const gesamt = pipeline.reduce((s, p) => s + p.anzahl, 0);
  // Statistisch zu erwartende Zulassungen — die nüchterne Gegenrechnung zur
  // Aufzählung „X Programme in der Pipeline".
  const erwartet = pipeline.reduce((s, p) => s + p.anzahl * (p.pos ?? 0), 0);

  return (
    <Panel className="animate-rise">
      <PanelTitle>Pipeline</PanelTitle>
      <p className="mb-4 max-w-[78ch] text-small leading-relaxed text-ink2">
        <span className="font-bold text-ink">Woher das künftige Geschäft kommen müsste: </span>
        {gesamt} laufende Programme aus dem öffentlichen Studienregister. Die Wahrscheinlichkeit ist der
        statistische Erfahrungswert für die jeweilige Phase — rechnerisch werden daraus{' '}
        <span className="font-mono tabular-nums text-ink">{fmtNum(erwartet, 1)}</span> Zulassungen.
        Das ersetzt keine Einzelbewertung, zeigt aber die Größenordnung.
      </p>
      <table className="w-full table-fixed">
        <colgroup><col className="w-[150px]" /><col className="w-[110px]" /><col /></colgroup>
        <thead>
          <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
            <th className="pb-2.5 font-normal">Phase</th>
            <th className="whitespace-nowrap pb-2.5 pr-4 text-right font-normal">Chance</th>
            <th className="pb-2.5 font-normal">Indikationen</th>
          </tr>
        </thead>
        <tbody>
          {pipeline.map((p) => (
            <tr key={p.phase} className="border-b border-line/70 last:border-b-0">
              <td className="py-2.5 pr-4 text-small text-ink">
                {p.label}
                {/* „4×' las sich wie ein Faktor — ausgeschrieben ist eindeutig */}
                <span className="ml-2 font-mono text-micro text-ink3">
                  {p.anzahl} {p.anzahl === 1 ? 'Programm' : 'Programme'}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-small tabular-nums text-ink2">
                {p.pos == null ? '–' : fmtPct(p.pos * 100, false)}
              </td>
              <td className="py-2.5 truncate text-small text-ink3" title={p.indikationen.join(' · ')}>
                {p.indikationen.join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/**
 * Erklärt die drei Spalten. Ohne diesen Absatz ist unklar, woher „pessimistisch"
 * kommt — man könnte es für frei gesetzte Zahlen halten, was den Zweck des
 * Regelwerks zunichte machen würde.
 */
function SzenarienErklaert({ anzahl }: { anzahl: number }) {
  return (
    <p className="mt-4 max-w-[78ch] border-t border-line pt-4 text-small leading-relaxed text-ink3">
      Die drei Werte entstehen nach festen Regeln
      <Erklaert text="Pessimistisch rechnet mit dem unteren Viertel der Vergleichsgruppe, realistisch mit dem Mittelwert, optimistisch mit dem oberen Viertel. Gemessene Zahlen wie Schulden oder Aktienanzahl bleiben in allen drei Fällen gleich." />
      {' '}aus denselben Annahmen — nicht durch freies Verschieben von Zahlen.
      {anzahl > 1 && ` Gezeigt ist die Mitte aus ${anzahl} Verfahren; die Einzelwerte stehen unten.`}
    </p>
  );
}

/** Kleines „i" hinter einem Begriff — Erklärung auf Hover, kein Fließtext. */
function Erklaert({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="ml-1 cursor-help text-ink3" aria-label="Erklärung">
          <Info size={12} className="inline align-middle" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-[360px]">{text}</TooltipContent>
    </Tooltip>
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
    <>
      {/* Eigener Panel-Titel wie „Vergleichsgruppe" (Micha) — vorher hing hier
          ein grauer Aufklapper ohne Bezug zur Überschriften-Sprache der Seite. */}
      <PanelTitle
        actions={
          <button
            onClick={() => setOffen((o) => !o)}
            aria-expanded={offen}
            className="flex cursor-pointer items-center gap-1.5 font-mono text-micro uppercase tracking-[0.14em] text-ink3 transition-colors hover:text-ink"
          >
            {offen ? 'Zuklappen' : 'Aufklappen'}
            <Chevron size={13} aria-hidden />
          </button>
        }
      >
        Welches Verfahren passt wozu?
      </PanelTitle>
      {offen && (
        // gap-6 statt gap-4 und mehr Luft zwischen den drei Zeilen einer
        // Gruppe — vorher klebten Titel, Verfahren und Erklärung aneinander
        <ul className="grid gap-6">
          {zeilen.map((z) => (
            <li key={z.art} className="grid gap-1.5">
              <span className="text-base font-bold text-ink">{z.art}</span>
              <span className="font-mono text-small text-accent">{z.verfahren}</span>
              <span className="max-w-[78ch] text-small leading-relaxed text-ink3">{z.warum}</span>
            </li>
          ))}
        </ul>
      )}
    </>
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

/** Erklärungen zu den Abschnitts-Überschriften — Fachbegriff bleibt, Erklärung deutsch. */
const GRUPPEN_INFO: Record<string, string> = {
  'Equity Bridge':
    'Rechnet den Wert des ganzen Unternehmens in den Wert je Aktie um: Kasse dazu, Schulden und ähnliche Verpflichtungen ab, dann durch die Anzahl der Aktien teilen.',
  Prognose: 'Die geschätzte Geschäftsentwicklung der kommenden Jahre.',
  Abzinsung:
    'Geld in zehn Jahren ist weniger wert als Geld heute. Diese Werte bestimmen, wie stark künftige Beträge auf heute heruntergerechnet werden.',
  Vergleich: 'Die eigene Kennzahl und das Vielfache, das die Vergleichsgruppe dafür bekommt.',
  Ertragskraft: 'Wie viel Ertrag das Eigenkapital abwirft — die Grundlage dieses Verfahrens.',
};

/** Abschnitts-Überschrift im Detailbereich: eine Ebene, hellblau, mit Erklärung. */
function Abschnitt({ titel, info, children }: { titel: string; info?: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2.5 flex items-center gap-1.5 font-mono text-micro font-bold uppercase tracking-[0.14em] text-accent">
        {titel}
        {info && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0 cursor-help text-ink3" aria-label={`Erklärung zu ${titel}`}><Info size={12} /></span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-[360px]">{info}</TooltipContent>
          </Tooltip>
        )}
      </h4>
      {children}
    </section>
  );
}

/**
 * Annahmen je Abschnitt. Die Gruppen sind selbst die Überschriften — vorher
 * stand „Womit gerechnet wurde" (grau) direkt über „Vergleich" (blau), also
 * zwei Überschriften ohne Inhalt dazwischen.
 */
function AnnahmenBloecke({ annahmen, waehrung }: { annahmen: Annahme[]; waehrung: string | null }) {
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
    <>
      {gruppen.map(([gruppe, liste]) => (
        <Abschnitt key={gruppe} titel={gruppe} info={GRUPPEN_INFO[gruppe]}>
          <table className="w-full table-fixed">
            <colgroup><col /><col className="w-[150px]" /><col className="w-[160px]" /></colgroup>
            <tbody>
              {liste.map((a) => (
                <tr key={a.id} className="border-b border-line/70 last:border-b-0">
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-1.5">
                      <span className="text-small text-ink2">{a.label}</span>
                      {a.notiz && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex shrink-0 cursor-help text-ink3" aria-label="Erklärung"><Info size={12} /></span>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="max-w-[360px]">{a.notiz}</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-small tabular-nums">{annahmeText(a, waehrung)}</td>
                  <td className="py-2.5 text-right font-mono text-micro text-ink3">
                    {QUELLE_LABEL[a.quelle] ?? a.quelle}
                    {a.stand && <span className="block">{fmtDate(a.stand)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Abschnitt>
      ))}
    </>
  );
}

function SensTabelle({ zeilen, waehrung }: { zeilen: SensZeile[]; waehrung: string | null }) {
  const max = zeilen[0]?.spanne ?? 1;
  if (!zeilen.length) return null;
  return (
    // Spaltenköpfe bilden einen Satz: „Wenn sich das um 10 % ändert … liegt der
    // Wert je Aktie zwischen …". Vorher standen dort „10 % weniger / 10 % mehr"
    // und ein nackter Balken — es war unklar, WELCHE Zahl sich ändert und
    // WELCHES Ergebnis gemeint ist.
    <table className="w-full table-fixed">
      <colgroup><col /><col className="w-[210px]" /><col className="w-[130px]" /></colgroup>
      <thead>
        <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
          <th className="pb-2.5 font-normal">Wenn sich das um 10 % ändert …</th>
          <th className="whitespace-nowrap pb-2.5 pr-6 text-right font-normal">… Wert je Aktie dann</th>
          <th className="pb-2.5 pl-4 font-normal">Einfluss</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.slice(0, 8).map((z) => (
          <tr key={z.id} className="border-b border-line/70">
            <td className="truncate py-2.5 pr-4 text-small text-ink2" title={z.label}>{z.label}</td>
            <td className="whitespace-nowrap py-2.5 pr-6 text-right font-mono text-small tabular-nums text-ink">
              {jeAktie(Math.min(z.runter, z.hoch), null)} – {jeAktie(Math.max(z.runter, z.hoch), waehrung)}
            </td>
            <td className="py-2.5 pl-4">
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 rounded-full bg-accent" style={{ width: Math.max(4, (z.spanne / max) * 56) + 'px' }} />
                <span className="font-mono text-micro tabular-nums text-ink3">
                  {z.wirkungPct == null ? '' : '± ' + Math.round((z.wirkungPct / 2) * 100) + ' %'}
                </span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ein Verfahren als aufklappbare Karte: Wert, Erklärung, Details. */
function VerfahrensZeile({ v, kurs, waehrung, eurKurs, analystenZiel }: {
  v: BewertungsAntwort['verfahren'][number];
  kurs: number | null; waehrung: string | null; eurKurs: number | null; analystenZiel: number | null;
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
          <Rechenweg v={v} waehrung={waehrung} />

          <div className="grid gap-3 sm:grid-cols-3">
            {(['worst', 'base', 'best'] as Fall[]).map((f) => (
              <SzenarioSpalte key={f} fall={f} wert={e.szenarien[f].wertJeAktie} kurs={kurs} waehrung={waehrung} eurKurs={eurKurs} hervor={f === 'base'} />
            ))}
          </div>

          <Gegenprobe v={v} waehrung={waehrung} kurs={kurs} analystenZiel={analystenZiel} />

          <Abschnitt
            titel="Wie sicher ist das?"
            info={`Das Modell wurde ${fmtCompact(e.monteCarlo.laeufe)} Mal durchgerechnet, jedes Mal mit leicht anderen Annahmen aus ihrer jeweiligen Bandbreite. Das zeigt, wie stabil das Ergebnis ist.`}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-line bg-panel2 px-4 py-3">
              <span className="text-small text-ink2">In 8 von 10 Fällen zwischen</span>
              <span className="font-display text-display-sm font-bold tabular-nums text-ink">
                {jeAktie(e.monteCarlo.p10, null)} – {jeAktie(e.monteCarlo.p90, waehrung)}
              </span>
              <span className="font-mono text-small text-ink3">Mitte {jeAktie(e.monteCarlo.median, waehrung)}</span>
            </div>
          </Abschnitt>

          {!!e.sensitivitaet.treiber.length && (
            <Abschnitt
              titel="Woran das Ergebnis hängt"
              info="Jede Annahme wird einzeln um 10 % nach oben und unten verschoben. Je länger der Balken, desto stärker verändert diese eine Zahl das Ergebnis."
            >
              <SensTabelle zeilen={e.sensitivitaet.treiber} waehrung={waehrung} />
            </Abschnitt>
          )}

          <AnnahmenBloecke annahmen={v.modell.annahmen} waehrung={waehrung} />

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
function PeerPanel({ gruppe, symbol, zielKurs, waehrung }: {
  gruppe: NonNullable<BewertungsAntwort['peerGruppe']>;
  symbol: string;
  zielKurs: number | null;
  waehrung: string | null;
}) {
  // Die Tabelle zeigt genau das Vielfache, mit dem gerechnet wird — sonst
  // steht dort EV/Umsatz, während das Verfahren den Buchwert nutzt.
  const multipleName = {
    ebitda: 'EV/EBITDA',
    umsatz: 'EV/Umsatz',
    umsatzErwartet: 'EV/Umsatz (erwartet)',
    gewinn: 'KGV',
    buchwert: 'KBV',
  }[gruppe.basis ?? 'umsatz'] ?? 'EV/Umsatz';

  const genutztesMultiple = (p: NonNullable<BewertungsAntwort['peerGruppe']>['peers'][number]) => {
    const x = p as unknown as Record<string, number | null | undefined>;
    return {
      ebitda: x.evEbitda,
      umsatz: x.evUmsatz,
      umsatzErwartet: x.evUmsatzErwartet,
      gewinn: x.kgv,
      buchwert: x.kbv,
    }[gruppe.basis ?? 'umsatz'] ?? x.evUmsatz;
  };
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

  // Spanne der brauchbaren Vielfachen und was sie fuer DIESE Aktie bedeuten.
  const spanne = (() => {
    const paare = gruppe.peers
      .map((p) => ({ m: genutztesMultiple(p), k: p.kursFuerZiel }))
      .filter((x): x is { m: number; k: number } => typeof x.m === 'number' && x.m > 0 && x.m < 200 && typeof x.k === 'number')
      .sort((a, b) => a.m - b.m);
    if (!paare.length) return { min: null, max: null, kursMin: null, kursMax: null };
    const bei = (q: number) => paare[Math.min(paare.length - 1, Math.floor((paare.length - 1) * q))];
    const u = bei(0.25);
    const o = bei(0.75);
    return { min: u.m, max: o.m, kursMin: u.k, kursMax: o.k };
  })();

  return (
    <Panel className="animate-rise">
      <PanelTitle>Vergleichsgruppe</PanelTitle>
      {/* Kernaussage als EINE Zeile: was die Gruppe für diese Aktie bedeutet.
          Die Tabelle darunter ist der Beleg, nicht die Botschaft. */}
      <div className="mb-4 grid gap-2">
        <p className="max-w-[78ch] text-small leading-relaxed text-ink2">
          {gruppe.peers.length} Wettbewerber
          <Erklaert text={`Ähnlich große Unternehmen der Branche ${gruppe.branche}. Aus ihren Kennzahlen entsteht das Vielfache, mit dem gerechnet wird — ohne eine solche Gruppe würde das Modell die Aktie mit sich selbst vergleichen.`} />
          {' '}liegen beim <span className="text-ink">{multipleName}</span> mehrheitlich zwischen{' '}
          <span className="font-mono tabular-nums text-ink">{multiple(spanne.min)}</span> und{' '}
          <span className="font-mono tabular-nums text-ink">{multiple(spanne.max)}</span>.
          Für <span className="font-mono text-accent">${symbol}</span> wären das{' '}
          <span className="font-mono tabular-nums text-ink">{jeAktie(spanne.kursMin, null)}</span> bis{' '}
          <span className="font-mono tabular-nums text-ink">{jeAktie(spanne.kursMax, waehrung)}</span>.
        </p>
        {gruppe.sammelkategorie && (
          <p className="max-w-[78ch] text-small leading-relaxed text-warn">
            <span className="font-bold">Achtung: </span>
            <span className="text-ink2">
              Die Quelle führt {symbol} in einer Sammelkategorie statt in der eigentlichen Branche —
              prüfe, ob die Firmen unten zum Geschäftsmodell passen.
            </span>
          </p>
        )}
        {deutlichSchneller && (
          <p className="max-w-[78ch] text-small leading-relaxed text-ink3">
            {symbol} wächst mit {fmtPct(eigenes! * 100, false)} deutlich schneller als die Gruppe
            (Mitte {fmtPct(medianWachstum! * 100, false)}) — das erklärt einen Teil des Kursaufschlags.
          </p>
        )}
      </div>
      {/* Gezeigt wird GENAU das Vielfache, mit dem gerechnet wird — vorher
          standen hier EV/Umsatz und EV/EBITDA, während das Verfahren bei
          Klarna den Buchwert nutzte; die maßgebliche Spalte fehlte also.
          Die letzte Spalte übersetzt jedes fremde Vielfache in einen Kurs
          für DIESE Aktie: das ist der Grund, warum die Tabelle nützlich ist. */}
      <ScrollListe className="max-h-[340px]">
        <table className="w-full table-fixed">
          <colgroup>
            <col /><col className="w-[104px]" /><col className="w-[112px]" /><col className="w-[108px]" />
            <col className="w-[124px]" /><col className="w-[164px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-panel">
            {/* Jede Spalte trägt ihre Erklärung — ohne sie sind „Börsenwert",
                „KBV" und „Wert für $KLAR" für Laien bedeutungslos (Micha). */}
            <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
              <th className="pb-2.5 font-normal">Firma</th>
              <th className="whitespace-nowrap pb-2.5 text-right font-normal">
                Kurs<Erklaert text="Aktueller Börsenkurs dieses Wettbewerbers — nur zur Einordnung, er fließt nicht in die Rechnung ein." />
              </th>
              <th className="whitespace-nowrap pb-2.5 text-right font-normal">
                Börsenwert<Erklaert text="Was alle Aktien dieser Firma zusammen kosten. Dient dazu, ähnlich große Unternehmen zu vergleichen." />
              </th>
              <th className="whitespace-nowrap pb-2.5 text-right font-normal">
                Wachstum<Erklaert text="Umsatzwachstum der letzten zwölf Monate. Wächst ein Wettbewerber viel langsamer, ist sein Vielfaches nur bedingt übertragbar." />
              </th>
              <th className="whitespace-nowrap pb-2.5 pr-5 text-right font-normal">
                {multipleName}<Erklaert text={MULTIPLE_INFO[gruppe.basis ?? 'umsatz'] ?? MULTIPLE_INFO.umsatz} />
              </th>
              <th className="whitespace-nowrap pb-2.5 text-right font-normal text-accent">
                Wert für ${symbol}
                <Erklaert text={`Was eine Aktie von ${symbol} kosten würde, wenn der Markt sie mit demselben Vielfachen bepreisen würde wie diesen Wettbewerber. Darunter der Abstand zum heutigen Kurs.`} />
              </th>
            </tr>
          </thead>
          <tbody>
            {gruppe.peers.map((p) => {
              const w = (p as { wachstum?: number | null }).wachstum;
              const k = p.kursFuerZiel;
              const abw = k != null && zielKurs ? (k - zielKurs) / zielKurs : null;
              return (
                <tr key={p.symbol} className="border-b border-line/70">
                  <td className="py-2.5 pr-4">
                    <span className="block truncate text-small text-ink2" title={p.name}>{p.name}</span>
                    <span className="block font-mono text-micro text-accent">${p.symbol}</span>
                  </td>
                  <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">{jeAktie((p as { kurs?: number | null }).kurs, null)}</td>
                  <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">{fmtCompact(p.marktkap)}</td>
                  <td className={cn('py-2.5 text-right font-mono text-small tabular-nums', w == null ? 'text-ink3' : w >= 0 ? 'text-up' : 'text-down')}>
                    {w == null ? '–' : fmtPct(w * 100)}
                  </td>
                  <td className="py-2.5 pr-5 text-right font-mono text-small tabular-nums text-ink2">{multiple(genutztesMultiple(p))}</td>
                  {/* Kurs und Abstand untereinander — nebeneinander brach die Zelle um */}
                  <td className="py-2.5 text-right">
                    <span className="block font-mono text-small tabular-nums text-ink">{jeAktie(k, waehrung)}</span>
                    {abw != null && (
                      <span className={cn('block font-mono text-micro tabular-nums', abw >= 0 ? 'text-up' : 'text-down')}>
                        {fmtPct(abw * 100)} zum Kurs
                      </span>
                    )}
                  </td>
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
            {/* Druckdialog des Browsers — dort „Als PDF speichern'. Kein
                zusaetzliches Paket, und das Ergebnis ist teilbar. */}
            <Button variant="ghost" size="sm" onClick={() => window.print()} title="Über den Druckdialog als PDF sichern">
              <FileDown size={13} aria-hidden /> PDF
            </Button>
            <Button
              variant="subtle"
              size="sm"
              disabled={speichern.isPending}
              title="Speichert diese Fassung lokal in Stockpit — später unter „Bewertung' ohne Kürzel abrufbar"
              onClick={() => speichern.mutate(
                { id: id ?? undefined, auswertung: d },
                { onSuccess: (r) => setGemerkt('Fassung ' + (r as { version: number }).version + ' gespeichert') },
              )}
            >
              {gemerkt
                ? <><Check size={13} aria-hidden className="text-up" /> {gemerkt}</>
                : <><Save size={13} aria-hidden /> In Stockpit sichern</>}
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
                <SzenarioSpalte
                  key={f}
                  fall={f}
                  wert={gesamt[f]}
                  kurs={kurs}
                  waehrung={waehrung}
                  eurKurs={eurKurs}
                  hervor={f === 'base'}
                  analyst={f === 'worst' ? d.analysten?.tief : f === 'best' ? d.analysten?.hoch : d.analysten?.kursziel}
                />
              ))}
            </div>
            {satz && <p className="mt-5 max-w-[78ch] text-base leading-relaxed text-ink2">{satz}</p>}
            <KursZerlegung d={d} />
            <SzenarienErklaert anzahl={gesamt.verfahren.length} />
          </>
        )}
      </Panel>

      <Panel className="animate-rise">
        <PanelTitle>So kommt die Zahl zustande</PanelTitle>
        {d.verfahren.length ? (
          <ul className="grid gap-3">
            {d.verfahren.map((v) => (
              <VerfahrensZeile key={v.id + (v.basis ?? '')} v={v} kurs={kurs} waehrung={waehrung} eurKurs={eurKurs} analystenZiel={d.analysten?.kursziel ?? null} />
            ))}
          </ul>
        ) : (
          <Empty>Kein Verfahren ist mit den verfügbaren Daten belastbar.</Empty>
        )}

      </Panel>

      <Panel className="animate-rise">
        <VerfahrensUebersicht />

        {!!d.abgelehnt?.length && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 font-mono text-micro font-bold uppercase tracking-[0.14em] text-ink3">Nicht angewandt</h3>
            <ul className="grid gap-2">
              {d.abgelehnt.map((a) => (
                <li key={a.id} className="text-small leading-relaxed">
                  <span className="text-ink2">{VERFAHREN_KURZ[a.id]}: </span>
                  <span className="text-ink3">{a.grund}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {!!d.pipeline?.length && <PipelinePanel pipeline={d.pipeline} />}

      {!!d.peerGruppe?.peers?.length && (
        <PeerPanel gruppe={d.peerGruppe} symbol={d.symbol} zielKurs={d.kurs} waehrung={d.waehrung} />
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
        {/* Gleiche Maße wie die globale Suche in der Topbar — vorher p-0,
            wodurch der Dialog schmaler war und das Feld am Rand klebte. */}
        <DialogContent ohneSchliessen className="max-w-[560px] px-3 pb-3 pt-3.5">
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
