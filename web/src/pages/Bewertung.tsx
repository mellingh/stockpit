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
import { AlertTriangle, Check, ChevronDown, ChevronUp, ExternalLink, FileDown, Info, Save, Search, Trash2 } from 'lucide-react';
import { Panel, PanelTitle, Empty } from '@/components/panel';
import { ScrollListe } from '@/components/scroll-liste';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SymbolSearch } from '@/components/symbol-search';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useSearchParams, useTitel, useNavigate, Link } from '@/lib/router';
import { useBewertungStart, useBewertungGespeichert, useBewertungsListe, useBewertungMutation } from '@/lib/queries';
import { api, type Annahme, type BewertungsAntwort, type Fall, type SensZeile, type Verfahren } from '@/lib/api';
import { fmtCompact, fmtDate, fmtNum, fmtPct } from '@/lib/format';
import { STUDIEN_STATUS_DE } from '@/lib/studien';
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
  // Die Verfahren beim Namen nennen — „Mittelwert aus 2 Verfahren" ließ offen,
  // aus welchen.
  const wie = anzahl === 1
    ? `Gerechnet mit dem ${VERFAHREN_KURZ[gesamt.verfahren[0]]}`
    : `Mitte aus ${anzahl} Verfahren (${gesamt.verfahren.map((v) => VERFAHREN_KURZ[v]).join(', ')})`;

  // Die Abweichung in Prozent steht schon in jeder Karte — hier bleibt nur,
  // WOMIT gerechnet wurde. Was der Abstand zum Kurs bedeutet, sagt der Satz
  // darunter mit nachprüfbaren Zahlen statt mit einem Urteil.
  if (Math.abs(abw) < 0.1) return `${wie}. Der Kurs liegt etwa dort, wo die Rechnung ihn sieht.`;
  return `${wie}.`;
}

/** Wie die Kennzahl im Satz heißt („müsste DER UMSATZ bei … liegen"). */
const KENNZAHL_WORT: Record<string, string> = {
  ebitda: 'der operative Gewinn (EBITDA)',
  umsatz: 'der Umsatz',
  umsatzErwartet: 'der Umsatz',
  gewinn: 'der Nettogewinn',
  buchwert: 'der Buchwert',
};

/**
 * Die ernsten Prüfergebnisse ganz oben statt versteckt im aufgeklappten
 * Verfahren. „Der Endwert macht 85 % des Werts aus" oder „keine
 * Vergleichsgruppe gefunden" entscheidet darüber, wie viel die Zahl darüber
 * wert ist — das gehört neben die Zahl, nicht drei Klicks entfernt.
 */
function Vorbehalte({ d }: { d: BewertungsAntwort }) {
  // Jede Warnung nur einmal, auch wenn zwei Verfahren sie melden
  const gesehen = new Set<string>();
  const wichtig = d.verfahren
    .filter((v) => v.automatisch)
    .flatMap((v) => v.ergebnis.warnungen)
    .filter((w) => (w.stufe === 'rot' || w.stufe === 'gelb') && !gesehen.has(w.id) && gesehen.add(w.id))
    .slice(0, 3);
  if (!wichtig.length) return null;

  return (
    <ul className="mt-4 grid gap-1.5 border-t border-line pt-4" aria-live="polite">
      {wichtig.map((w) => (
        <li key={w.id} className="flex gap-2.5">
          <AlertTriangle size={13} aria-hidden className={cn('mt-0.5 shrink-0', w.stufe === 'rot' ? 'text-down' : 'text-warn')} />
          <span className="max-w-[78ch] text-small leading-relaxed">
            <span className="text-ink2">{w.text}</span>
            {w.hinweis && <span className="text-ink3"> {w.hinweis}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Drei Zahlen nebeneinander, damit klar ist, welcher Art sie sind (Micha:
 * „dann hat man drei verschiedene Werte").
 *
 *  1. Was der Markt heute zahlt — gemessen, kein Modell.
 *  2. Was laut Bilanz an Substanz dahintersteht — gemessen, ebenfalls kein
 *     Modell: Vermögen minus Schulden, geteilt durch alle Aktien. Das ist der
 *     Boden, unter den eine Bewertung selten fällt, solange die Firma nicht
 *     Geld verbrennt.
 *  3. Diese Rechnung — gerechnet, mit dem Maßstab der Wettbewerber.
 *  4. Was Analysten erwarten — eine Meinung, kein Fakt.
 *
 * Die Kennzeichnung „gemessen / gerechnet / Meinung" ist der eigentliche Punkt:
 * Sie macht sichtbar, welche Zahl man nachprüfen kann und welche nicht.
 */
function VierBlickwinkel({ d }: { d: BewertungsAntwort }) {
  const { waehrung, substanz, gesamt, analysten } = d;
  const spalten: { titel: string; wert: number | null; art: string; info: string }[] = [
    {
      titel: 'Kurs heute',
      wert: d.kurs,
      art: 'gemessen',
      info: 'Was der Markt in diesem Moment für eine Aktie zahlt. Keine Schätzung — aber auch keine Aussage darüber, ob der Preis angemessen ist.',
    },
    {
      titel: 'Substanz je Aktie',
      wert: substanz?.eigenkapitalJeAktie ?? null,
      art: 'gemessen',
      info: `Vermögen minus Schulden laut Bilanz, geteilt durch alle Aktien (Buchwert). Das ist da, auch wenn das Geschäft morgen stillsteht${
        substanz?.nettoCashJeAktie != null
          ? ` — davon ${jeAktie(substanz.nettoCashJeAktie, waehrung)} als Kasse abzüglich Schulden`
          : ''
      }. Bei Firmen, deren Wert an Marken, Patenten oder Software hängt, ist dieser Wert niedrig, ohne dass das ein Mangel wäre.`,
    },
    {
      titel: 'Diese Rechnung',
      wert: gesamt.base,
      art: 'gerechnet',
      info: 'Das Ergebnis der Verfahren unten — die heutigen Zahlen, gemessen am Maßstab der Wettbewerber. Nachvollziehbar, aber abhängig davon, wie gut die Vergleichsgruppe passt.',
    },
    {
      titel: 'Analysten',
      wert: analysten?.kursziel ?? null,
      art: 'Meinung',
      info: `Durchschnittliches Kursziel auf zwölf Monate${
        analysten?.anzahl ? ` aus ${analysten.anzahl} Einschätzungen` : ''
      }. Analysten modellieren die Entwicklung über viele Jahre und liegen oft über dem, was die heutigen Zahlen tragen — nachprüfbar ist diese Zahl nicht.`,
    },
  ];

  if (spalten.every((s) => s.wert == null)) return null;

  return (
    <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
      {spalten.map((s) => (
        <div key={s.titel} className="grid gap-1 bg-panel2/40 px-4 py-3">
          <span className="flex items-center gap-1 font-mono text-micro uppercase tracking-[0.14em] text-ink3">
            {s.titel}
            <Erklaert text={s.info} className="ml-0" />
          </span>
          <span className="font-mono text-lg font-bold tabular-nums text-ink">{jeAktie(s.wert, waehrung)}</span>
          <span className={cn('text-micro', s.art === 'gemessen' ? 'text-up' : s.art === 'gerechnet' ? 'text-accent' : 'text-ink3')}>
            {s.art}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Was der heutige Kurs voraussetzt — in einem Satz, ganz oben.
 *
 * Die Zahl steckte bisher nur in der Gegenprobe im aufgeklappten Verfahren.
 * Dort beantwortet sie aber genau die Frage, die beim Blick auf „13,79 USD bei
 * einem Kurs von 38,17" als Erstes aufkommt: Was müsste passieren, damit der
 * Kurs aufgeht? Das ist die nützlichere Information als die Abweichung in
 * Prozent — sie ist nachprüfbar statt wertend.
 */
function KursVoraussetzung({ d }: { d: BewertungsAntwort }) {
  // Das Verfahren nehmen, das auch den Gesamtwert trägt
  const v = d.verfahren.find((x) => x.automatisch && x.eingepreist?.kurs);
  const e = v?.eingepreist?.kurs;
  if (!v || !e || e.noetig == null) return null;

  const zeigeZahl = (x: number | null | undefined) =>
    x == null ? '–' : e.art === 'kennzahl' ? fmtCompact(x) : fmtPct(x * 100, false);
  const Zahl = ({ x, fett }: { x: number | null | undefined; fett?: boolean }) => (
    <span className={cn('font-mono tabular-nums text-ink', fett && 'font-bold')}>{zeigeZahl(x)}</span>
  );

  // Je Verfahren ein eigener Satzbau — „müsste die Firma jährliches Wachstum
  // bei 24 % liegen" war grammatisch schief.
  const kern = v.id === 'dcf'
    ? <>müsste das Unternehmen dauerhaft <Zahl x={e.noetig} fett /> pro Jahr wachsen{e.heute != null && <>, erwartet werden <Zahl x={e.heute} /></>}</>
    : v.id === 'residual'
      ? <>müsste die <span className="font-bold text-ink">Eigenkapitalrendite</span> bei <Zahl x={e.noetig} fett /> liegen{e.heute != null && <>, heute sind es <Zahl x={e.heute} /></>}</>
      : <>müsste <span className="font-bold text-ink">{KENNZAHL_WORT[v.basis ?? ''] ?? 'der Umsatz'}</span> bei <Zahl x={e.noetig} fett /> liegen{e.heute != null && <>, heute sind es <Zahl x={e.heute} /></>}</>;

  return (
    <p className="mt-2 max-w-[78ch] text-base leading-relaxed text-ink2">
      Damit der Kurs von{' '}
      <span className="font-mono tabular-nums text-ink">{jeAktie(d.kurs, d.waehrung)}</span> aufgeht, {kern}
      {/* Beträge wie „2,05 Mrd." enden selbst auf einen Punkt — steht ein
          solcher Wert am Satzende, entfällt der Schlusspunkt. */}
      {e.jahre != null && e.jahre > 0
        ? <>{' '}— beim erwarteten Tempo rund <span className="font-mono font-bold tabular-nums text-ink">{fmtNum(e.jahre, 1)} Jahre</span>.</>
        : (e.art === 'kennzahl' ? null : '.')}
    </p>
  );
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
{/* Zwei Balken: was die Rechnung trägt, und was an Erwartung darüber liegt.
                Der zweite Teil ist GOLD, nicht grau — in Linienfarbe war er vom
                Hintergrund kaum zu unterscheiden, man sah das Ende der Skala
                nicht (Micha). Gold steht in Stockpit ohnehin für „Vorsicht",
                Grün und Rot bleiben dem Markt vorbehalten. */}
            <div className="flex h-2.5 overflow-hidden rounded-full border border-line-strong bg-panel" role="img"
              aria-label={`${Math.round(anteilHeute)} Prozent des Kurses deckt die Rechnung ab`}>
              <span className="bg-accent" style={{ width: anteilHeute + '%' }} />
              <span className="flex-1 bg-warn" />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-small">
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                <span className="text-ink2">Vom heutigen Geschäft gedeckt</span>
                <span className="font-mono font-bold tabular-nums text-ink">{jeAktie(heute, waehrung)}</span>
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-warn" />
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
  const annahme = (id: string) => v.modell.annahmen.find((a) => a.id === id);
  const wert = (id: string) => annahme(id)?.wert ?? null;
  const geld = (x: number | null | undefined) => (x == null ? '–' : fmtCompact(x));

  // Jeder Schritt trägt seine Erklärung (Micha: „ich frage mich, was Vielfaches
  // der Gruppe ist und wie gerechnet wird"). Wo eine Annahme dahintersteht,
  // kommt deren Notiz — so steht die Herkunft der Zahl an genau einer Stelle.
  const schritte: { label: string; wert: string; op?: string; info?: string }[] = [];

  if (v.id === 'multiples') {
    const kennzahl = v.modell.annahmen.find((a) => a.id === 'mult.kennzahl');
    const m = wert('mult.multiple');
    const aufEquity = wert('mult.aufEquity') === 1;
    schritte.push({
      label: kurzLabel(kennzahl?.label ?? 'Kennzahl'),
      wert: geld(kennzahl?.wert),
      info: (kennzahl?.notiz ?? '') + ' Diese Zahl des Unternehmens ist der Ausgangspunkt der Rechnung.',
    });
    schritte.push({
      op: '×',
      label: 'Vielfaches der Gruppe',
      wert: m == null ? '–' : fmtNum(m, 1) + '×',
      info: (annahme('mult.multiple')?.notiz ?? '')
        + (m == null ? '' : ` Ein Vielfaches von ${fmtNum(m, 1)}× heißt: Für vergleichbare Firmen zahlen Anleger derzeit das ${fmtNum(m, 1)}-Fache dieser Kennzahl.`),
    });
    schritte.push({
      op: '=',
      label: aufEquity ? 'Wert des Eigenkapitals' : 'Wert des Unternehmens',
      wert: geld(e.kern.enterpriseValue ?? e.equity.equityValue),
      info: aufEquity
        ? 'Kennzahl mal Vielfaches — bei Gewinn und Buchwert ist das direkt der Wert der Aktien, weil beide Größen schon nach Zinsen und Schulden gerechnet sind.'
        : 'Kennzahl mal Vielfaches — das ist der Preis für das ganze Unternehmen einschließlich seiner Schulden (Enterprise Value).',
    });
    if (!aufEquity) {
      schritte.push({
        op: '±',
        label: 'Kasse minus Schulden',
        wert: geld((e.equity.equityValue ?? 0) - (e.kern.enterpriseValue ?? 0)),
        info: 'Wer eine Firma kauft, bekommt ihre Kasse mit und übernimmt ihre Schulden. Beides wird deshalb verrechnet, damit am Ende der Wert der Aktien steht (Equity Bridge).',
      });
    }
  } else if (v.id === 'residual') {
    schritte.push({
      label: 'Eigenkapital',
      wert: geld(wert('res.eigenkapital')),
      info: 'Das Vermögen laut Bilanz abzüglich aller Schulden — bei Banken und Versicherern die Grundlage jeder Bewertung.',
    });
    schritte.push({
      op: '×',
      label: 'faires Kurs-Buchwert-Verhältnis',
      wert: e.kern.fairesKbv == null ? '–' : fmtNum(e.kern.fairesKbv, 2) + '×',
      info: 'Wie viel das Eigenkapital wert sein darf, hängt davon ab, wie viel Rendite darauf erwirtschaftet wird: Wer mehr verdient, als das Kapital kostet, ist mehr wert als sein Buchwert. Gerechnet als (Rendite − Wachstum) geteilt durch (Kapitalkosten − Wachstum).',
    });
    schritte.push({
      op: '=',
      label: 'Wert des Eigenkapitals',
      wert: geld(e.equity.equityValue),
      info: 'Buchwert mal dem fairen Verhältnis — der Wert, den die Aktien zusammen haben sollten.',
    });
  } else if (v.id === 'dcf') {
    schritte.push({
      label: 'Zahlungsströme der Prognosejahre',
      wert: geld(e.kern.barwertExplizit),
      info: 'Die freien Mittel der nächsten zehn Jahre, jeweils auf heute abgezinst: Geld in zehn Jahren ist weniger wert als Geld heute.',
    });
    schritte.push({
      op: '+',
      label: 'Wert danach (Endwert)',
      wert: geld(e.kern.endwert),
      info: 'Was das Geschäft nach dem zehnten Jahr noch wert ist, ebenfalls auf heute gerechnet. Macht dieser Teil den Großteil aus, hängt das Ergebnis vor allem an einer Annahme über die ferne Zukunft — darauf weist die Prüfliste hin.',
    });
    schritte.push({
      op: '±',
      label: 'Kasse minus Schulden',
      wert: geld((e.equity.equityValue ?? 0) - (e.kern.enterpriseValue ?? 0)),
      info: 'Wer eine Firma kauft, bekommt ihre Kasse mit und übernimmt ihre Schulden. Beides wird deshalb verrechnet, damit am Ende der Wert der Aktien steht (Equity Bridge).',
    });
  } else {
    return null;
  }

  schritte.push({
    op: '÷',
    label: 'Aktien',
    wert: fmtCompact(e.equity.aktien),
    info: (annahme('bridge.aktien')?.notiz ?? '')
      + ' Geteilt wird durch ALLE Ansprüche auf den Gewinn: sämtliche Aktiengattungen, Optionen und Wandelrechte, dazu die erwartete künftige Verwässerung.',
  });

  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3.5">
      <div className="mb-3 font-mono text-micro uppercase tracking-[0.14em] text-accent">So wird gerechnet</div>
      <div className="flex flex-wrap items-stretch gap-x-3 gap-y-3">
        {schritte.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            {s.op && <span aria-hidden className="font-mono text-lg text-ink3">{s.op}</span>}
            <span className="grid gap-0.5">
              <span className="font-mono text-small tabular-nums text-ink">{s.wert}</span>
              <span className="flex items-center gap-1 text-micro text-ink3">
                {s.label}
                {s.info && <Erklaert text={s.info.trim()} className="ml-0" />}
              </span>
            </span>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <span aria-hidden className="font-mono text-lg text-ink3">=</span>
          <span className="grid gap-0.5">
            <span className="font-mono text-small font-bold tabular-nums text-accent">
              {jeAktie(e.szenarien.base.wertJeAktie, waehrung)}
            </span>
            <span className="flex items-center gap-1 text-micro text-ink3">
              je Aktie
              <Erklaert
                className="ml-0"
                text="Das Ergebnis dieser Rechnung — was eine Aktie nach diesem Verfahren wert wäre, wenn die Firma heute so bewertet würde wie ihre Vergleichsgruppe. Kein Kursziel: Erwartungen an künftiges Wachstum stecken nur so weit drin, wie die Kennzahl sie schon enthält."
              />
            </span>
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
/**
 * Eine Entwicklungsstufe als Karte — aufklappbar bis auf die einzelne Studie.
 *
 * Vorher stand hier eine Tabellenzeile je Phase mit der Zahl der Krankheits-
 * gebiete. Das war zu wenig: bei Insmed laufen 55 Studien über vier Stufen, bei
 * Caris standen zwei ABGEBROCHENE Programme als künftiges Geschäft da. Wer
 * wissen will, worauf die Zukunftserwartung beruht, kommt hier an die Namen.
 */
function PhasenKarte({ p }: { p: NonNullable<BewertungsAntwort['pipeline']>[number] }) {
  const [offen, setOffen] = useState(false);
  const Chevron = offen ? ChevronUp : ChevronDown;
  const programme = p.programme ?? [];
  // Ältere gespeicherte Fassungen kennen die Studienzahl nicht — dann zählt
  // wie früher die Zahl der Krankheitsgebiete.
  const laufend = p.studien ?? p.anzahl;

  return (
    <li className="rounded-md border border-line bg-panel2/40">
      <button
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        disabled={!programme.length}
        className="flex w-full items-start gap-6 rounded-md p-4 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-panel2/70"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-base font-bold text-ink">{p.label}</span>
            {!!programme.length && <Chevron size={14} className="text-ink3" aria-hidden />}
          </span>
          <span className="mt-1.5 block font-mono text-micro text-ink3">
            {laufend} {laufend === 1 ? 'laufende Studie' : 'laufende Studien'}
            {!!p.fertige && ` · ${p.fertige} abgeschlossen`}
            {` · ${p.anzahl} ${p.anzahl === 1 ? 'Krankheitsgebiet' : 'Krankheitsgebiete'}`}
          </span>
          <span className="mt-2 block max-w-[78ch] text-small leading-relaxed text-ink2">
            {p.indikationen.join(' · ')}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-lg font-bold tabular-nums text-ink">
            {/* ganze Prozent: „55,00 %" für eine Erfahrungsquote täuscht
                eine Genauigkeit vor, die es nicht gibt */}
            {p.pos == null ? '–' : fmtNum(p.pos * 100, 0) + ' %'}
          </span>
          <span className="block text-micro text-ink3">Chance auf Zulassung</span>
        </span>
      </button>

      {offen && (
        <div className="border-t border-line px-4 pb-3.5 pt-3.5">
          <ScrollListe className="max-h-[300px]">
            <ul className="grid gap-3">
              {programme.map((s) => {
                const st = STUDIEN_STATUS_DE[s.status];
                return (
                  <li key={s.id} className="flex items-start gap-3">
                    <Badge variant={st?.variante ?? 'neu'} className="shrink-0">
                      {st?.label ?? s.status}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <a
                        href={s.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${s.titel} — öffnet in neuem Tab`}
                        className="text-small leading-relaxed text-ink2 transition-colors hover:text-accent"
                      >
                        {s.titel} <ExternalLink size={11} className="inline align-middle text-ink3" aria-hidden />
                      </a>
                      {!!s.indikationen.length && (
                        <span className="mt-0.5 block font-mono text-micro text-ink3">{s.indikationen.join(' · ')}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {!!p.weitere && (
              <p className="pt-3 text-micro text-ink3">und {p.weitere} weitere Studien in dieser Stufe</p>
            )}
          </ScrollListe>
        </div>
      )}
    </li>
  );
}

function PipelinePanel({ pipeline, gesamt }: {
  pipeline: NonNullable<BewertungsAntwort['pipeline']>;
  gesamt?: BewertungsAntwort['pipelineGesamt'];
}) {
  const laufend = gesamt?.laufend ?? pipeline.reduce((s, p) => s + (p.studien ?? p.anzahl), 0);
  // Statistisch zu erwartende Zulassungen — die nüchterne Gegenrechnung zur
  // Aufzählung „X Programme in der Pipeline". Gerechnet wird mit den LAUFENDEN
  // Studien: die Zahl der Krankheitsgebiete zählt dasselbe Mittel mehrfach (das
  // Register führt „Bronchiectasis" und „Non-Cystic Fibrosis Bronchiectasis"
  // getrennt) und blähte die Erwartung auf.
  const erwartet = pipeline.reduce((s, p) => s + (p.studien ?? p.anzahl) * (p.pos ?? 0), 0);

  return (
    <Panel className="animate-rise">
      <PanelTitle>Pipeline</PanelTitle>
      <p className="mb-4 max-w-[78ch] text-small leading-relaxed text-ink2">
        <span className="font-bold text-ink">Woher das künftige Geschäft kommen müsste: </span>
        <span className="font-mono font-bold tabular-nums text-ink">{laufend}</span>{' '}
        {laufend === 1 ? 'laufende Studie' : 'laufende Studien'} in{' '}
        <span className="font-mono font-bold tabular-nums text-ink">{pipeline.length}</span>{' '}
        {pipeline.length === 1 ? 'Entwicklungsstufe' : 'Entwicklungsstufen'}
        {/* Ohne Phasenangabe (Diagnostik, Beobachtungsstudien) gibt es keine
            Erfahrungsquote — dann steht dort auch keine erfundene Zahl. */}
        {erwartet > 0 ? (
          <>
            {' '}— rechnerisch{' '}
            <span className="font-mono font-bold tabular-nums text-ink">{fmtNum(erwartet, 1)}</span> Zulassungen
            <Erklaert text="Jede laufende Studie wird mit der statistischen Zulassungschance ihrer Phase multipliziert. Das ist ein grober Erwartungswert, keine Einzelbewertung: aus zehn Phase-1-Studien wird im Schnitt gut eine Zulassung." />
          </>
        ) : (
          <>. Ohne Phasenangabe lässt sich daraus keine Zulassungsquote ableiten</>
        )}
        {gesamt?.abgebrochen
          ? `. Abgebrochene und zurückgezogene Studien (${gesamt.abgebrochen}) zählen nicht mit.`
          : '.'}
      </p>
      <ul className="grid gap-3">
        {pipeline.map((p) => <PhasenKarte key={p.phase} p={p} />)}
      </ul>
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
function Erklaert({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* In Fließtext steht das Symbol mit Abstand hinter dem Wort, in
            Flex-Zeilen (Spaltenköpfen) sorgt der Container für den Abstand —
            dort wird die Klasse überschrieben statt ein Pixel verschoben. */}
        <span className={cn('ml-1 cursor-help text-ink3', className)} aria-label="Erklärung">
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
      {/* Der Pfeil sitzt DIREKT hinter der Überschrift (Micha) — derselbe Griff
          wie an den Verfahrens-Karten darüber, kein eigener Knopf am Rand. */}
      <PanelTitle>
        <button
          onClick={() => setOffen((o) => !o)}
          aria-expanded={offen}
          className="flex cursor-pointer items-center gap-2 transition-colors hover:text-accent"
        >
          Welches Verfahren passt wozu?
          <Chevron size={14} aria-hidden className="text-ink3" />
        </button>
      </PanelTitle>
      {offen && (
        // Karten wie unter „So kommt die Zahl zustande" — Box in der Box, damit
        // beide Kacheln dieselbe Sprache sprechen (Micha).
        <ul className="grid gap-3">
          {zeilen.map((z) => (
            <li key={z.art} className="grid gap-1.5 rounded-md border border-line bg-panel2/40 p-4">
              <span className="text-base font-bold text-ink">{z.art}</span>
              <span className="font-mono text-small text-accent">{z.verfahren}</span>
              <span className="max-w-[78ch] text-small leading-relaxed text-ink2">{z.warum}</span>
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
            {/* Ein Verfahren mit negativem Ergebnis bleibt sichtbar, zählt aber
                nicht mit: bei Volkswagen übersteigt die Verschuldung der
                Finanzsparte den Unternehmenswert aus dem Vielfachen. Der
                Mittelwert aus einer negativen und einer positiven Zahl wäre
                eine Zahl ohne Bedeutung. */}
            {v.automatisch && v.zaehlt === false && (
              <Badge variant="warn">zählt nicht mit</Badge>
            )}
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
          {/* Ohne diesen Satz steht eine negative Zahl kommentarlos da */}
          {v.automatisch && v.zaehlt === false && (
            <span className="mt-2 block max-w-[62ch] text-small leading-relaxed text-warn">
              Das Ergebnis liegt unter null: Die Verschuldung übersteigt hier den Unternehmenswert, den
              dieses Verfahren errechnet. Bei Herstellern mit eigener Bank (Volkswagen) ist das die
              Regel — die Finanzierungsschulden gehören zum Geschäft. Zählt deshalb nicht in den
              Gesamtwert.
            </span>
          )}
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
 * Der Kennzahlen-Vergleich mit der Branche — und was daraus folgt.
 *
 * Micha: „nimm die Top 5 wichtigsten Analystenkennzahlen, wo man sieht, dass
 * die Aktie gesund ist, und kalkuliere die mit rein." Genau das passiert hier:
 * Die fünf Kennzahlen entscheiden, an welcher STELLE der Wettbewerber-Bandbreite
 * gerechnet wird. Vorher stand dort immer die Mitte — also „Durchschnitt", egal
 * wie gut oder schlecht die Firma tatsächlich dasteht.
 *
 * Kurs-Vielfache wie KGV oder EV/EBITDA stehen bewusst NICHT in dieser Liste:
 * sie sind der PREIS, den die Rechnung ermittelt, nicht die Qualität, die ihn
 * rechtfertigt. Sie mit hineinzurechnen wäre ein Zirkelschluss.
 */
function QualitaetsPanel({ q, symbol }: { q: NonNullable<BewertungsAntwort['qualitaet']>; symbol: string }) {
  const stelle = Math.round(q.perzentile.base * 100);
  const besser = q.kriterien.filter((k) => k.urteil === 'besser').length;
  const schwaecher = q.kriterien.filter((k) => k.urteil === 'schwaecher').length;

  // feste zwei Nachkommastellen beim Vielfachen — „0,3×" neben „0,78×" franst aus
  const zahl = (v: number | null, einheit: string) =>
    v == null
      ? '–'
      : einheit === 'faktor'
        ? new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + '×'
        : fmtPct(v * 100, false);

  const urteilStil: Record<string, { text: string; variante: 'pos' | 'neg' | 'neu' }> = {
    besser: { text: 'besser', variante: 'pos' },
    schwaecher: { text: 'schwächer', variante: 'neg' },
    aehnlich: { text: 'wie die Branche', variante: 'neu' },
    unbekannt: { text: 'keine Daten', variante: 'neu' },
  };

  return (
    <Panel className="animate-rise">
      <PanelTitle>Wie gesund ist die Firma?</PanelTitle>
      <p className="mb-4 max-w-[78ch] text-small leading-relaxed text-ink2">
        <span className="font-mono font-bold tabular-nums text-ink">{besser}</span> von{' '}
        <span className="font-mono font-bold tabular-nums text-ink">{q.geprueft}</span> Kennzahlen sind besser
        als in der Vergleichsgruppe{schwaecher > 0 && `, ${schwaecher} schwächer`} — deshalb rechnet die
        Bewertung mit dem{' '}
        <span className="font-mono font-bold tabular-nums text-ink">{stelle}.</span> Perzentil der
        Wettbewerber-Vielfachen
        <Erklaert text={`Die Wettbewerber werden nach ihrem Vielfachen sortiert. Am 50. Perzentil steht der mittlere von ihnen. Steht ${symbol} bei den Kennzahlen besser da, wird weiter oben in dieser Reihe gerechnet, bei schwächeren Kennzahlen weiter unten — höchstens 20 Punkte in jede Richtung.`} />
        {stelle === 50 ? ' — also genau in der Mitte.' : '.'}
      </p>
      <table className="w-full table-fixed">
        <colgroup><col /><col className="w-[170px]" /><col className="w-[190px]" /><col className="w-[190px]" /></colgroup>
        <thead>
          <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
            <Kopf links>Kennzahl</Kopf>
            <Kopf info={`Der Wert von ${symbol} aus den letzten zwölf Monaten.`}>Diese Firma</Kopf>
            <Kopf info="Der mittlere Wert der Vergleichsgruppe — die Messlatte.">Branche (Mitte)</Kopf>
            <Kopf info="Nur deutliche Unterschiede zählen: kleine Abweichungen gelten als „wie die Branche&#34;.">Urteil</Kopf>
          </tr>
        </thead>
        <tbody>
          {q.kriterien.map((k) => (
            <tr key={k.id} className="border-b border-line/70 last:border-b-0">
              <td className="py-2.5 pr-6">
                <span className="flex items-center gap-1.5">
                  <span className="text-small text-ink2">{k.label}</span>
                  <Erklaert text={k.info} className="ml-0" />
                </span>
              </td>
              <td className="py-2.5 text-right font-mono text-small font-bold tabular-nums text-ink">
                {zahl(k.wert, k.einheit)}
              </td>
              <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">
                {zahl(k.median, k.einheit)}
              </td>
              <td className="py-2.5 text-right">
                <Badge variant={urteilStil[k.urteil].variante}>{urteilStil[k.urteil].text}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/**
 * Ein Kürzel, das zur Analyse dieses Werts führt. Ein blau geschriebenes
 * Kürzel sieht aus wie ein Link — also ist es einer (Micha).
 */
function Cashtag({ symbol, className }: { symbol: string; className?: string }) {
  return (
    <Link
      to={`/analyse?symbol=${encodeURIComponent(symbol)}`}
      title={`${symbol} in der Analyse öffnen`}
      className={cn('font-mono text-small text-accent transition-colors hover:text-ink hover:underline', className)}
    >
      ${symbol}
    </Link>
  );
}

/**
 * Spaltenkopf der Vergleichsgruppe. Text und „i" stehen in einer Flex-Zeile mit
 * items-center — als Inline-Element saß das Symbol eine Spur zu tief und
 * fluchtete nicht mit den Nachbarspalten (Micha).
 */
function Kopf({ children, info, links, className }: {
  children: ReactNode; info?: string; links?: boolean; className?: string;
}) {
  return (
    <th className={cn('pb-2.5 font-normal', className)}>
      <span className={cn('flex items-center gap-1 whitespace-nowrap', links ? 'justify-start' : 'justify-end')}>
        {children}
        {info && <Erklaert text={info} className="ml-0" />}
      </span>
    </th>
  );
}

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
    // kurz halten: der lange Name lief im Spaltenkopf in die Nachbarspalte
    umsatzErwartet: 'EV/Umsatz erw.',
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
          {/* Die Anzahl in derselben Auszeichnung wie die übrigen Zahlen des
              Satzes — als bloßer Fließtext war sie kleiner und ging unter. */}
          <span className="font-mono font-bold tabular-nums text-ink">{gruppe.peers.length}</span> Wettbewerber
          <Erklaert text={`Ähnlich große Unternehmen der Branche ${gruppe.branche}, die ähnlich schnell wachsen. Aus ihren Kennzahlen entsteht das Vielfache, mit dem gerechnet wird — ohne eine solche Gruppe würde das Modell die Aktie mit sich selbst vergleichen.`} />
          {' '}liegen beim <span className="text-ink">{multipleName}</span> mehrheitlich zwischen{' '}
          <span className="font-mono tabular-nums text-ink">{multiple(spanne.min)}</span> und{' '}
          <span className="font-mono tabular-nums text-ink">{multiple(spanne.max)}</span>.
          Für <Cashtag symbol={symbol} /> wären das{' '}
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
{/* Bei rechtsbündigen Spalten ist die sichtbare Lücke zwischen zwei
              Köpfen genau: Breite der rechten Spalte minus Breite ihres
              Kopftextes. Nachgemessen waren es 35/43/74/59 px — die Köpfe
              „KURS" und „BÖRSENWERT" klebten aneinander (Micha). Jetzt ist
              jede Spalte so breit, dass überall mindestens 55 px Luft bleiben,
              auch beim längsten Kopf („EV/UMSATZ ERW."). */}
          <colgroup>
            <col /><col className="w-[130px]" /><col className="w-[165px]" /><col className="w-[150px]" />
            <col className="w-[190px]" /><col className="w-[200px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-panel">
            {/* Jede Spalte trägt ihre Erklärung — ohne sie sind „Börsenwert",
                „KBV" und „Wert für $KLAR" für Laien bedeutungslos (Micha). */}
            <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
              <Kopf links>Firma</Kopf>
              <Kopf info="Aktueller Börsenkurs dieses Wettbewerbers — nur zur Einordnung, er fließt nicht in die Rechnung ein.">Kurs</Kopf>
              <Kopf info="Was alle Aktien dieser Firma zusammen kosten. Dient dazu, ähnlich große Unternehmen zu vergleichen.">Börsenwert</Kopf>
              <Kopf info="Umsatzwachstum der letzten zwölf Monate. Wächst ein Wettbewerber viel langsamer, ist sein Vielfaches nur bedingt übertragbar.">Wachstum</Kopf>
              <Kopf info={MULTIPLE_INFO[gruppe.basis ?? 'umsatz'] ?? MULTIPLE_INFO.umsatz}>{multipleName}</Kopf>
              <Kopf
                className="text-accent"
                info={`Was eine Aktie von ${symbol} kosten würde, wenn der Markt sie mit demselben Vielfachen bepreisen würde wie diesen Wettbewerber. Darunter der Abstand zum heutigen Kurs.`}
              >
                Wert für ${symbol}
              </Kopf>
            </tr>
          </thead>
          <tbody>
            {gruppe.peers.map((p) => {
              const w = (p as { wachstum?: number | null }).wachstum;
              const k = p.kursFuerZiel;
              const abw = k != null && zielKurs ? (k - zielKurs) / zielKurs : null;
              return (
                <tr key={p.symbol} className="border-b border-line/70">
                  <td className="py-2.5 pr-6">
                    <span className="block truncate text-small text-ink2" title={p.name}>{p.name}</span>
                    <Cashtag symbol={p.symbol} className="block text-micro" />
                  </td>
                  <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">{jeAktie((p as { kurs?: number | null }).kurs, null)}</td>
                  <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">{fmtCompact(p.marktkap)}</td>
                  <td className={cn('py-2.5 text-right font-mono text-small tabular-nums', w == null ? 'text-ink3' : w >= 0 ? 'text-up' : 'text-down')}>
                    {w == null ? '–' : fmtPct(w * 100)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink2">{multiple(genutztesMultiple(p))}</td>
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

  // Liegen zwei Verfahren um mehr als das Zweieinhalbfache auseinander, sagt
  // ihre Mitte wenig — bei Tesla stehen 2 USD aus der Zahlungsstrom-Rechnung
  // gegen 38 USD aus dem Branchenvergleich. Das gehört dazugesagt, sonst wirkt
  // der Mittelwert genauer, als er ist.
  const einzelwerte = d.verfahren
    .filter((v) => v.automatisch)
    .map((v) => v.ergebnis.szenarien.base.wertJeAktie)
    .filter((x): x is number => typeof x === 'number' && x > 0);
  const weitAuseinander = einzelwerte.length > 1
    && Math.max(...einzelwerte) / Math.min(...einzelwerte) > 2.5;
  const [gemerkt, setGemerkt] = useState<string | null>(null);
  const speichern = useBewertungMutation((body: { id?: string; auswertung: BewertungsAntwort }) =>
    api.post<{ id: string; version: number }>('/api/bewertungen', body),
  );

  return (
    <div className="grid gap-5">
      <Panel className="animate-rise">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-display-sm font-bold">{d.name}</h2>
          {/* Der Weg zurück in die Analyse desselben Werts — seit die Analyse
              kein Navigationspunkt mehr ist, braucht die Bewertung einen. */}
          <Cashtag symbol={d.symbol} />
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
            {d.istFonds
              ? 'Das ist ein Fonds (ETF) — ein Korb aus vielen Aktien. Einen Unternehmenswert gibt es dafür nicht: Was er wert ist, ergibt sich aus den Kursen seiner Positionen. Die Analyse-Seite zeigt zu ETFs die größten Positionen und die Kosten.'
              : 'Für diesen Wert lässt sich mit kostenlosen Daten keine belastbare Bewertung rechnen. Die Gründe stehen unten.'}
          </Empty>
        ) : (
          <>
            {/* Ohne diese Zeile liest sich „REALISTISCH 13,79 USD" wie ein
                Kursziel. Es ist aber etwas anderes: was das Geschäft trägt, das
                heute schon da ist (Micha: „wie kann der realistische Wert so
                krass unter dem Kurs liegen?"). */}
            <div className="mt-5 flex items-center gap-1.5 font-mono text-micro uppercase tracking-[0.14em] text-accent">
              Was die heutigen Zahlen tragen
              <Erklaert
                className="ml-0"
                text="Gerechnet mit Umsatz, Gewinn und Bilanz von heute und dem Maßstab der Wettbewerber. Das ist kein Kursziel: Künftiges Wachstum steckt hier nur so weit drin, wie die Schätzungen fürs nächste Jahr es hergeben. Was der Markt darüber hinaus erwartet, steht darunter."
              />
            </div>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
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
            <VierBlickwinkel d={d} />
            {satz && <p className="mt-5 max-w-[78ch] text-base leading-relaxed text-ink2">{satz}</p>}
            <KursVoraussetzung d={d} />
            {weitAuseinander && (
              <p className="mt-2 max-w-[78ch] text-small leading-relaxed text-ink3">
                Die Verfahren liegen weit auseinander (
                <span className="font-mono tabular-nums">{jeAktie(Math.min(...einzelwerte), null)}</span> bis{' '}
                <span className="font-mono tabular-nums">{jeAktie(Math.max(...einzelwerte), waehrung)}</span>)
                — die Mitte daraus ist nur ein grober Anhaltspunkt.
              </p>
            )}
            <KursZerlegung d={d} />
            <Vorbehalte d={d} />
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

      {!!d.qualitaet && <QualitaetsPanel q={d.qualitaet} symbol={d.symbol} />}

      {!!d.pipeline?.length && <PipelinePanel pipeline={d.pipeline} gesamt={d.pipelineGesamt} />}

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
          {/* Ohne gewählten Wert steht der Knopf in der leeren Kachel — zwei
              gleichlautende Knöpfe übereinander waren eine Entscheidung zu viel. */}
          {(symbol || id) && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSucheOffen(true)}>
              <Search size={13} aria-hidden /> Anderen Wert
            </Button>
          )}
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
          {/* Ein Knopf statt „wähle oben einen Wert": „oben" gab es zweimal —
              die globale Suche in der Topbar und den Knopf in der Kopfzeile.
              Beide Wege öffnen denselben Dialog, hier ist er unübersehbar. */}
          <Empty className="grid justify-items-center gap-4 py-10">
            <span className="max-w-[62ch]">
              Stockpit rechnet selbst — mit Zahlen aus dem Geschäftsbericht, den Schätzungen der
              Analysten und dem Vergleich zu Wettbewerbern derselben Branche.
            </span>
            <Button variant="action" size="sm" onClick={() => setSucheOffen(true)}>
              <Search size={13} aria-hidden /> Wert wählen
            </Button>
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
