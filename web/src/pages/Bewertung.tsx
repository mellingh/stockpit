// Bewertungs-Werkbank: Kürzel eingeben, sofort eine gerechnete Spanne sehen,
// danach jede Annahme nachschärfen. Der Aufbau folgt der Ausgabe-Vorlage:
// Ergebniskarte oben, Annahmen in der Mitte, Sensitivität unten.
//
// BEWUSST KEIN Kauf- oder Verkaufsurteil — die Seite liefert Zahlen und
// benennt, woran sie hängen. Die Entscheidung trifft der Nutzer.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Info, Save, Search, Trash2 } from 'lucide-react';
import { Panel, PanelTitle, Empty } from '@/components/panel';
import { FilterPill } from '@/components/filter-pill';
import { ScrollListe } from '@/components/scroll-liste';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SymbolSearch } from '@/components/symbol-search';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useSearchParams, useSetParam, useTitel, useNavigate } from '@/lib/router';
import { useBewertungStart, useBewertungGespeichert, useBewertungsListe, useBewertungMutation, rechneBewertung } from '@/lib/queries';
import { api, type Annahme, type BewertungsErgebnis, type BewertungsModell, type BewertungsZeile, type Fall, type Quelle, type SensZeile, type Verfahren } from '@/lib/api';
import { fmtCompact, fmtDate, fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

// ---------- Beschriftungen ----------

const VERFAHREN_LABEL: Record<Verfahren, string> = {
  dcf: 'DCF',
  multiples: 'Multiples',
  sotp: 'SOTP',
  rnpv: 'rNPV',
  residual: 'Residualgewinn',
};

const VERFAHREN_INFO: Record<Verfahren, string> = {
  dcf: 'Discounted Cash Flow — für reife Unternehmen mit planbaren Zahlungsströmen.',
  multiples: 'Peer-Vergleich über EV/Umsatz oder EV/EBITDA — für wachsende Firmen ohne stabilen Free Cashflow.',
  sotp: 'Sum of the Parts — jedes Segment mit eigenem Multiple, abzüglich Konglomeratsabschlag.',
  rnpv: 'Risikoadjustierter Barwert — Spitzenumsatz × Erfolgswahrscheinlichkeit × Multiple je Medikament.',
  residual: 'Buchwert- und Ertragsbasis — für Banken und Kreditgeber, wo Enterprise Value und Free Cashflow nicht taugen.',
};

const QUELLE_LABEL: Record<Quelle, string> = {
  management_guidance: 'Management-Guidance',
  analystenkonsens: 'Analystenkonsens',
  geschaeftsbericht: 'Geschäftsbericht',
  eigene_schaetzung: 'Eigene Schätzung',
  peer_gruppe: 'Peer-Gruppe',
};

const FALL_LABEL: Record<Fall, string> = { worst: 'Worst Case', base: 'Base Case', best: 'Best Case' };

// ---------- Formatierung ----------

/** Geldwerte werden in Millionen eingegeben — neunstellige Zahlen tippt niemand. */
const MIO = 1_000_000;

function anzeigeWert(a: Annahme): string {
  if (a.wert == null) return '';
  if (a.einheit === 'prozent') return fmtNum(a.wert * 100, 2);
  if (a.einheit === 'geld' || a.einheit === 'anzahl') return fmtNum(a.wert / MIO, 2);
  return fmtNum(a.wert, 2);
}

function ausEingabe(text: string, einheit: Annahme['einheit']): number | null {
  const n = Number(text.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (einheit === 'prozent') return n / 100;
  if (einheit === 'geld' || einheit === 'anzahl') return n * MIO;
  return n;
}

const EINHEIT_SUFFIX: Record<string, string> = { prozent: '%', geld: 'Mio.', anzahl: 'Mio.', faktor: '×', jahre: 'J' };

/** Kurs/Wert je Aktie — immer zwei Nachkommastellen, wie im Depot. */
const jeAktie = (v: number | null | undefined, w: string | null) =>
  v == null ? '–' : fmtNum(v, 2) + (w ? ' ' + w : '');

// ---------- Ergebniskarte ----------

function SzenarioSpalte({ fall, wert, abweichung, waehrung, hervor }: {
  fall: Fall; wert: number | null; abweichung: number | null; waehrung: string | null; hervor?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-md border px-4 py-3', hervor ? 'border-accent/40 bg-accent-soft' : 'border-line bg-panel2')}>
      <span className="font-mono text-micro uppercase tracking-[0.14em] text-ink3">{FALL_LABEL[fall]}</span>
      <span className="font-display text-display-sm font-bold tabular-nums">{jeAktie(wert, waehrung)}</span>
      <span className={cn('font-mono text-small tabular-nums', abweichung == null ? 'text-ink3' : abweichung >= 0 ? 'text-up' : 'text-down')}>
        {abweichung == null ? '–' : fmtPct(abweichung * 100)}
      </span>
    </div>
  );
}

/** Verteilung der Simulation — die Mehrgipfligkeit soll sichtbar sein. */
function Histogramm({ daten, median }: { daten: { von: number; bis: number; anzahl: number }[]; median: number | null }) {
  const max = Math.max(...daten.map((d) => d.anzahl), 1);
  if (!daten.length) return null;
  const spanne = daten[daten.length - 1].bis - daten[0].von;
  const medianPos = median != null && spanne > 0 ? ((median - daten[0].von) / spanne) * 100 : null;
  return (
    <div className="relative mt-3 flex h-16 items-end gap-px" aria-hidden>
      {daten.map((d, i) => (
        <span key={i} className="flex-1 rounded-t-[2px] bg-accent/35" style={{ height: Math.max(2, (d.anzahl / max) * 100) + '%' }} />
      ))}
      {medianPos != null && (
        <span className="absolute inset-y-0 w-px bg-accent" style={{ left: medianPos + '%' }} />
      )}
    </div>
  );
}

function WarnZeile({ w }: { w: BewertungsErgebnis['warnungen'][number] }) {
  const farbe = w.stufe === 'rot' ? 'text-down' : w.stufe === 'gelb' ? 'text-warn' : 'text-ink3';
  const Icon = w.stufe === 'info' ? Info : AlertTriangle;
  return (
    <li className="flex gap-2.5 py-2">
      <Icon size={14} className={cn('mt-0.5 shrink-0', farbe)} aria-hidden />
      <span className="text-small leading-relaxed">
        <span className="text-ink">{w.text}</span>
        {w.hinweis && <span className="text-ink3"> {w.hinweis}</span>}
      </span>
    </li>
  );
}

function Ergebniskarte({ e, modell }: { e: BewertungsErgebnis; modell: BewertungsModell }) {
  const w = modell.waehrung;
  const kurs = e.kurs;
  const base = e.szenarien.base.wertJeAktie;
  const treiber = e.sensitivitaet.treiber.slice(0, 3);
  const grosse = e.beitraege.filter((b) => (b.anteil ?? 0) > 0.05).slice(0, 4);

  // Einschätzung in einem Satz: wo steht der Kurs relativ zum Base Case?
  const einschaetzung = (() => {
    if (kurs == null || base == null) return null;
    const d = (base - kurs) / kurs;
    const richtung = Math.abs(d) < 0.05 ? 'deckt sich mit' : d > 0 ? 'liegt unter' : 'liegt über';
    const treiberName = treiber[0]?.label;
    return (
      'Der Kurs ' + richtung + ' dem berechneten Base Case'
      + (Math.abs(d) < 0.05 ? '.' : ' (' + fmtPct(-d * 100) + ').')
      + (treiberName ? ' Am stärksten reagiert das Ergebnis auf: ' + treiberName + '.' : '')
    );
  })();

  return (
    <Panel className="animate-rise">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-display-sm font-bold">{modell.name}</h2>
        <span className="font-mono text-small text-ink3">({modell.symbol})</span>
        <Badge variant="chip">{VERFAHREN_LABEL[modell.verfahren]}</Badge>
        <span className="ml-auto font-mono text-small text-ink3">
          Kurs {jeAktie(kurs, w)} · Stand {fmtDate(modell.stand)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SzenarioSpalte fall="worst" wert={e.szenarien.worst.wertJeAktie} abweichung={e.szenarien.worst.abweichung} waehrung={w} />
        <SzenarioSpalte fall="base" wert={base} abweichung={e.szenarien.base.abweichung} waehrung={w} hervor />
        <SzenarioSpalte fall="best" wert={e.szenarien.best.wertJeAktie} abweichung={e.szenarien.best.abweichung} waehrung={w} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="font-mono text-micro font-bold uppercase tracking-[0.14em] text-ink3">
            Monte Carlo ({fmtCompact(e.monteCarlo.laeufe)} Durchläufe)
          </h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-small tabular-nums">
            {([['10. Perzentil', e.monteCarlo.p10], ['Median', e.monteCarlo.median], ['90. Perzentil', e.monteCarlo.p90]] as const).map(([l, v]) => (
              <div key={l} className="col-span-2 flex justify-between gap-4">
                <dt className="text-ink3">{l}</dt>
                <dd className={cn(l === 'Median' && 'font-bold')}>{jeAktie(v, w)}</dd>
              </div>
            ))}
          </dl>
          <Histogramm daten={e.monteCarlo.histogramm} median={e.monteCarlo.median} />
        </div>

        <div>
          <h3 className="font-mono text-micro font-bold uppercase tracking-[0.14em] text-ink3">Das Ergebnis hängt an</h3>
          <ol className="mt-2 grid gap-1.5">
            {grosse.map((b) => (
              <li key={b.id} className="flex items-baseline justify-between gap-3 text-small">
                <span className="truncate text-ink2" title={b.label}>{b.label}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {b.anteil == null ? '–' : Math.round(b.anteil * 100) + ' %'}
                  {(b.anteil ?? 0) > 0.4 && grosse.length > 1 && modell.verfahren !== 'dcf' && (
                    <Badge variant="neg" className="ml-2">Konzentration</Badge>
                  )}
                </span>
              </li>
            ))}
            {!grosse.length && treiber.map((t) => (
              <li key={t.id} className="flex items-baseline justify-between gap-3 text-small">
                <span className="truncate text-ink2">{t.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-ink3">
                  ± {jeAktie(t.spanne / 2, w)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {einschaetzung && (
        <p className="mt-5 border-t border-line pt-4 text-base leading-relaxed text-ink2">{einschaetzung}</p>
      )}

      {!!e.warnungen.length && (
        <ul className="mt-2 divide-y divide-line" aria-live="polite">
          {e.warnungen.map((x) => <WarnZeile key={x.id} w={x} />)}
        </ul>
      )}
    </Panel>
  );
}

// ---------- Annahmen ----------

function AlterChip({ stand }: { stand: string | null }) {
  if (!stand) return null;
  const tage = Math.round((Date.now() - new Date(stand).getTime()) / 86_400_000);
  const stufe = tage > 180 ? 'neg' : tage > 90 ? 'warn' : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('cursor-help font-mono text-micro tabular-nums',
          stufe === 'neg' ? 'text-down' : stufe === 'warn' ? 'text-warn' : 'text-ink3')}>
          {fmtDate(stand)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {tage} Tage alt{stufe === 'neg' ? ' — älter als 180 Tage' : stufe === 'warn' ? ' — älter als 90 Tage' : ''}
      </TooltipContent>
    </Tooltip>
  );
}

function AnnahmeZeile({ a, onChange }: { a: Annahme; onChange: (patch: Partial<Annahme>) => void }) {
  const [text, setText] = useState(() => anzeigeWert(a));
  // Wert von außen (Verfahrenswechsel, Zurücksetzen) übernehmen
  const letzter = useRef(a.wert);
  useEffect(() => {
    if (a.wert !== letzter.current) {
      letzter.current = a.wert;
      setText(anzeigeWert(a));
    }
  }, [a.wert, a.einheit]);

  return (
    <tr className="border-b border-line/70">
      <td className="py-2.5 pr-3">
        <span className="flex items-center gap-1.5">
          <span className="text-small text-ink">{a.label}</span>
          {a.notiz && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-ink3" aria-label="Erklärung"><Info size={12} /></span>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-[340px]">{a.notiz}</TooltipContent>
            </Tooltip>
          )}
          {a.bernoulli && (
            <Tooltip>
              <TooltipTrigger asChild><span className="cursor-help font-mono text-micro text-accent">⚄</span></TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-[340px]">
                In der Simulation ein Münzwurf statt eines Erwartungswerts — ein Medikament wird zugelassen oder nicht.
              </TooltipContent>
            </Tooltip>
          )}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <span className="flex items-center gap-1.5">
          <Input
            value={text}
            inputMode="decimal"
            spellCheck={false}
            autoComplete="off"
            className="h-control-sm w-[110px] text-right font-mono text-small tabular-nums"
            onChange={(ev) => {
              setText(ev.target.value);
              const n = ausEingabe(ev.target.value, a.einheit);
              if (n != null) { letzter.current = n; onChange({ wert: n, herkunft: 'manuell' }); }
            }}
          />
          <span className="w-8 shrink-0 font-mono text-micro text-ink3">{a.einheit ? EINHEIT_SUFFIX[a.einheit] ?? '' : ''}</span>
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <select
          value={a.quelle}
          onChange={(ev) => onChange({ quelle: ev.target.value as Quelle })}
          className="h-control-sm rounded-md border border-line bg-panel2 px-2 text-small text-ink2 hover:border-ink3"
        >
          {(Object.keys(QUELLE_LABEL) as Quelle[]).map((q) => (
            <option key={q} value={q}>{QUELLE_LABEL[q]}</option>
          ))}
        </select>
      </td>
      <td className="py-2.5 text-right"><AlterChip stand={a.stand} /></td>
    </tr>
  );
}

function AnnahmenPanel({ modell, setzeAnnahme }: {
  modell: BewertungsModell; setzeAnnahme: (id: string, patch: Partial<Annahme>) => void;
}) {
  const gruppen = useMemo(() => {
    const m = new Map<string, Annahme[]>();
    for (const a of modell.annahmen) {
      const g = a.gruppe ?? 'Weitere';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(a);
    }
    return [...m.entries()];
  }, [modell.annahmen]);

  return (
    <Panel className="animate-rise">
      <PanelTitle>Annahmen</PanelTitle>
      <ScrollListe className="max-h-[620px]">
        <table className="w-full table-fixed">
          <colgroup>
            <col /><col className="w-[170px]" /><col className="w-[170px]" /><col className="w-[96px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
              <th className="pb-2 font-normal">Annahme</th>
              <th className="pb-2 font-normal">Wert</th>
              <th className="pb-2 font-normal">Quelle</th>
              <th className="pb-2 text-right font-normal">Stand</th>
            </tr>
          </thead>
          <tbody>
            {gruppen.map(([gruppe, liste], i) => (
              <Fragment key={gruppe}>
                <tr>
                  <td colSpan={4} className={cn('font-mono text-micro font-bold uppercase tracking-[0.14em] text-accent', i === 0 ? 'pt-1 pb-1.5' : 'pt-7 pb-1.5')}>
                    {gruppe}
                  </td>
                </tr>
                {liste.map((a) => (
                  <AnnahmeZeile key={a.id} a={a} onChange={(p) => setzeAnnahme(a.id, p)} />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </ScrollListe>
    </Panel>
  );
}

// ---------- Zeilen (Segmente bzw. Produkte) ----------

/**
 * Segmente (SOTP) und Programme (rNPV) anlegen, benennen und verknüpfen.
 * Die Überschneidung ist der Grund, warum es diese Tabelle braucht:
 * Indikationen adressieren manchmal dieselben Patienten — ohne Kürzung zählt
 * das Modell denselben Umsatz zweimal.
 */
function ZeilenPanel({ modell, regeln, aendere }: {
  modell: BewertungsModell;
  regeln?: { phasen: { id: string; label: string; pos: number }[]; rnpvMultiple: { patentgeschuetzt: number; reif: number } };
  aendere: (m: BewertungsModell) => void;
}) {
  const istRnpv = modell.verfahren === 'rnpv';
  const titel = istRnpv ? 'Programme' : 'Segmente';

  const setzeZeile = (id: string, patch: Partial<BewertungsZeile>) =>
    aendere({ ...modell, zeilen: modell.zeilen.map((z) => (z.id === id ? { ...z, ...patch } : z)) });

  /** Phase wechseln setzt zugleich die Erfolgswahrscheinlichkeit auf den Tabellenwert. */
  const setzePhase = (id: string, phase: string) => {
    const pos = regeln?.phasen.find((p) => p.id === phase)?.pos;
    aendere({
      ...modell,
      zeilen: modell.zeilen.map((z) => (z.id === id ? { ...z, phase } : z)),
      annahmen: modell.annahmen.map((a) =>
        a.id === `zeile.${id}.pos` && pos != null
          ? { ...a, wert: pos, bernoulli: phase !== 'zugelassen', herkunft: 'manuell' as const }
          : a,
      ),
    });
  };

  const loesche = (id: string) =>
    aendere({
      ...modell,
      // Verweise anderer Zeilen mitnehmen, sonst zeigt eine Ueberschneidung ins
      // Leere und kuerzt still weiter den Umsatz.
      zeilen: modell.zeilen
        .filter((z) => z.id !== id)
        .map((z) => (z.ueberschneidetMit === id ? { ...z, ueberschneidetMit: null, ueberschneidungPct: null } : z)),
      annahmen: modell.annahmen.filter((a) => !a.id.startsWith(`zeile.${id}.`)),
    });

  const hinzu = () => {
    const nr = modell.zeilen.length + 1;
    const id = 'z' + Date.now().toString(36);
    const name = istRnpv ? `Programm ${nr}` : `Segment ${nr}`;
    const heute = new Date().toISOString().slice(0, 10);
    const basis = { quelle: 'eigene_schaetzung' as Quelle, stand: heute, herkunft: 'manuell' as const, gruppe: name };
    const neue: Annahme[] = istRnpv
      ? [
        { id: `zeile.${id}.spitzenumsatz`, label: `${name} — Spitzenumsatz`, wert: 0, einheit: 'geld', ...basis },
        { id: `zeile.${id}.pos`, label: `${name} — Erfolgswahrscheinlichkeit`, wert: regeln?.phasen.find((p) => p.id === 'phase2')?.pos ?? 0.3, einheit: 'prozent', regel: 'erfolgswahrscheinlichkeit', bernoulli: true, ...basis },
        { id: `zeile.${id}.multiple`, label: `${name} — Bewertungsmultiple`, wert: regeln?.rnpvMultiple.patentgeschuetzt ?? 3, einheit: 'faktor', ...basis },
      ]
      : [
        { id: `zeile.${id}.kennzahl`, label: `${name} — Kennzahl`, wert: 0, einheit: 'geld', ...basis },
        { id: `zeile.${id}.multiple`, label: `${name} — Multiple`, wert: 0, einheit: 'faktor', quelle: 'peer_gruppe', stand: heute, herkunft: 'manuell', gruppe: name, peers: [] },
      ];
    aendere({
      ...modell,
      zeilen: [...modell.zeilen, { id, name, phase: istRnpv ? 'phase2' : undefined, basis: istRnpv ? undefined : 'umsatz' }],
      annahmen: [...modell.annahmen, ...neue],
    });
  };

  return (
    <Panel className="animate-rise">
      <PanelTitle>{titel}</PanelTitle>
      <ScrollListe className="max-h-[420px]">
        <table className="w-full table-fixed">
          <colgroup>
            <col /><col className="w-[150px]" />{istRnpv && <col className="w-[210px]" />}<col className="w-[40px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
              <th className="pb-2 font-normal">Name</th>
              <th className="pb-2 font-normal">{istRnpv ? 'Phase' : 'Basis'}</th>
              {istRnpv && <th className="pb-2 font-normal">Überschneidung</th>}
              <th className="pb-2"><span className="sr-only">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            {modell.zeilen.map((z) => (
              <tr key={z.id} className="group border-b border-line/70">
                <td className="py-2.5 pr-3">
                  <Input value={z.name} className="h-control-sm text-small"
                    onChange={(ev) => setzeZeile(z.id, { name: ev.target.value })} />
                  {z.indikation && z.indikation !== z.name && (
                    <span className="mt-1 block truncate text-micro text-ink3" title={z.indikation}>{z.indikation}</span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  {istRnpv ? (
                    <select value={z.phase ?? 'phase2'} onChange={(ev) => setzePhase(z.id, ev.target.value)}
                      className="h-control-sm w-full rounded-md border border-line bg-panel2 px-2 text-small text-ink2 hover:border-ink3">
                      {(regeln?.phasen ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  ) : (
                    <select value={z.basis ?? 'umsatz'} onChange={(ev) => setzeZeile(z.id, { basis: ev.target.value as 'umsatz' | 'ebitda' })}
                      className="h-control-sm w-full rounded-md border border-line bg-panel2 px-2 text-small text-ink2 hover:border-ink3">
                      <option value="umsatz">Umsatz</option>
                      <option value="ebitda">EBITDA</option>
                    </select>
                  )}
                </td>
                {istRnpv && (
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-1.5">
                      <select value={z.ueberschneidetMit ?? ''}
                        onChange={(ev) => setzeZeile(z.id, {
                          ueberschneidetMit: ev.target.value || null,
                          ueberschneidungPct: ev.target.value ? (z.ueberschneidungPct ?? 0.4) : null,
                        })}
                        className="h-control-sm min-w-0 flex-1 rounded-md border border-line bg-panel2 px-2 text-small text-ink2 hover:border-ink3">
                        <option value="">keine</option>
                        {modell.zeilen.filter((x) => x.id !== z.id).map((x) => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </select>
                      {z.ueberschneidetMit && (
                        <Input value={fmtNum((z.ueberschneidungPct ?? 0) * 100, 0)} inputMode="decimal"
                          className="h-control-sm w-[56px] text-right font-mono text-small tabular-nums"
                          onChange={(ev) => {
                            const n = Number(ev.target.value.replace(',', '.'));
                            if (Number.isFinite(n)) setzeZeile(z.id, { ueberschneidungPct: Math.min(1, Math.max(0, n / 100)) });
                          }} />
                      )}
                    </span>
                  </td>
                )}
                <td className="py-2.5 text-right">
                  <button aria-label={`${z.name} entfernen`} onClick={() => loesche(z.id)}
                    className="cursor-pointer text-ink3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-down">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollListe>
      {/* listenerweiternde Aktion: unter der Liste, linksbündig */}
      <Button variant="action" size="sm" className="mt-3" onClick={hinzu}>
        + {istRnpv ? 'Programm' : 'Segment'} hinzufügen
      </Button>
    </Panel>
  );
}

// ---------- Sensitivität ----------

function SensPanel({ sens, waehrung }: { sens: BewertungsErgebnis['sensitivitaet']; waehrung: string | null }) {
  const max = sens.zeilen[0]?.spanne ?? 1;
  return (
    <Panel className="animate-rise">
      <PanelTitle>Sensitivität</PanelTitle>
      <p className="-mt-2 mb-3 text-small text-ink3">
        Wirkung auf den Wert je Aktie, wenn eine Annahme um {Math.round(sens.schritt * 100)} % nach oben und unten verschoben wird.
      </p>
      <ScrollListe className="max-h-[420px]">
        <table className="w-full table-fixed">
          <colgroup><col /><col className="w-[92px]" /><col className="w-[92px]" /><col className="w-[150px]" /></colgroup>
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line text-left font-mono text-micro uppercase tracking-[0.14em] text-ink3">
              <th className="pb-2 font-normal">Annahme</th>
              <th className="pb-2 text-right font-normal">−{Math.round(sens.schritt * 100)} %</th>
              <th className="pb-2 text-right font-normal">+{Math.round(sens.schritt * 100)} %</th>
              <th className="pb-2 pl-4 font-normal">Wirkung</th>
            </tr>
          </thead>
          <tbody>
            {sens.zeilen.map((z: SensZeile) => (
              <tr key={z.id} className="border-b border-line/70">
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-small text-ink2" title={z.label}>{z.label}</span>
                    {z.gemessen && (
                      <Tooltip>
                        <TooltipTrigger asChild><span className="cursor-help font-mono text-micro text-ink3">Ist</span></TooltipTrigger>
                        <TooltipContent side="top" align="start" className="max-w-[320px]">
                          Gemessene Zahl aus dem Abschluss — rechnerisch wirksam, aber keine Unsicherheit. Deshalb nicht als Treiber gezählt.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </td>
                <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">{jeAktie(z.runter, null)}</td>
                <td className="py-2.5 text-right font-mono text-small tabular-nums text-ink3">{jeAktie(z.hoch, null)}</td>
                <td className="py-2.5 pl-4">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={cn('h-1.5 rounded-full', z.gemessen ? 'bg-ink3/40' : 'bg-accent')}
                      style={{ width: Math.max(4, (z.spanne / max) * 64) + 'px' }} />
                    <span className="font-mono text-micro tabular-nums text-ink3">
                      {z.wirkungPct == null ? '' : Math.round(z.wirkungPct * 100) + ' %'}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollListe>
      <p className="mt-3 text-micro text-ink3">Wert je Aktie in {waehrung ?? 'Notierungswährung'}.</p>
    </Panel>
  );
}

// ---------- Equity Bridge ----------

function BridgePanel({ e, waehrung }: { e: BewertungsErgebnis; waehrung: string | null }) {
  const p = e.equity.posten;
  return (
    <Panel className="animate-rise">
      <PanelTitle>Equity Bridge</PanelTitle>
      <table className="w-full">
        <tbody>
          {p.map((x) => (
            <tr key={x.id} className="border-b border-line/70">
              <td className="py-2 pr-3 text-small text-ink2">
                {x.vorzeichen < 0 ? '− ' : x.id === 'enterpriseValue' || x.id === 'res.equity' ? '' : '+ '}{x.label}
              </td>
              <td className="py-2 text-right font-mono text-small tabular-nums">{fmtCompact(x.betrag)}</td>
            </tr>
          ))}
          <tr className="border-b border-line">
            <td className="py-2 pr-3 text-small font-bold">= Equity Value</td>
            <td className="py-2 text-right font-mono text-small font-bold tabular-nums">{fmtCompact(e.equity.equityValue)}</td>
          </tr>
          <tr className="border-b border-line/70">
            <td className="py-2 pr-3 text-small text-ink2">
              ÷ Aktien{e.equity.verwaesserung ? ' (inkl. ' + fmtPct(e.equity.verwaesserung * 100, false) + ' Verwässerung)' : ''}
            </td>
            <td className="py-2 text-right font-mono text-small tabular-nums">{fmtCompact(e.equity.aktien)}</td>
          </tr>
          <tr>
            <td className="py-2 pr-3 text-small font-bold">= Wert je Aktie</td>
            <td className="py-2 text-right font-mono text-small font-bold tabular-nums">{jeAktie(e.equity.wertJeAktie, waehrung)}</td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}

// ---------- Werkbank ----------

function Werkbank({ start }: { start: BewertungsErgebnis }) {
  const [modell, setModell] = useState<BewertungsModell>(start.modell);
  const [ergebnis, setErgebnis] = useState<BewertungsErgebnis>(start);
  const [rechnet, setRechnet] = useState(false);
  const [gespeichert, setGespeichert] = useState<string | null>(null);
  // Ohne id legt jedes Speichern eine neue Bewertung an statt einer Version —
  // die id aus der ersten Antwort merken und danach mitschicken.
  const [id, setId] = useState<string | undefined>(start.id);
  const setParam = useSetParam();
  const timer = useRef<number | undefined>(undefined);

  // Neu rechnen mit kurzer Verzögerung — während des Tippens nicht bei jedem
  // Tastendruck eine Simulation über 10.000 Durchläufe anstoßen.
  const rechneNeu = (m: BewertungsModell) => {
    window.clearTimeout(timer.current);
    setRechnet(true);
    timer.current = window.setTimeout(() => {
      rechneBewertung(m, start.markt)
        .then((r) => setErgebnis(r))
        .finally(() => setRechnet(false));
    }, 350);
  };

  const setzeAnnahme = (id: string, patch: Partial<Annahme>) => {
    setModell((alt) => {
      const neu = { ...alt, annahmen: alt.annahmen.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
      rechneNeu(neu);
      return neu;
    });
  };

  /** Ganzes Modell ersetzen (Zeilen anlegen/löschen) und neu rechnen. */
  const setzeModell = (m: BewertungsModell) => { setModell(m); rechneNeu(m); };

  const speichern = useBewertungMutation((body: { id?: string; modell: BewertungsModell; markt: unknown }) =>
    api.post<{ id: string; version: number }>('/api/bewertungen', body),
  );

  const exportiere = (art: 'json' | 'csv') => {
    const inhalt = art === 'json'
      ? JSON.stringify({ modell, ergebnis }, null, 2)
      : [
        ['Annahme', 'Wert', 'Einheit', 'Quelle', 'Stand', 'Herkunft'].join(';'),
        ...modell.annahmen.map((a) => [a.label, a.wert ?? '', a.einheit ?? '', a.quelle, a.stand ?? '', a.herkunft].join(';')),
      ].join('\n');
    const blob = new Blob([inhalt], { type: art === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bewertung-${modell.symbol}-${modell.stand}.${art}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-5">
      {/* Verfahren wählen — der Vorschlag steht daneben */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-micro uppercase tracking-[0.14em] text-ink3">Verfahren</span>
        {(Object.keys(VERFAHREN_LABEL) as Verfahren[]).map((v) => (
          <FilterPill key={v} aktiv={modell.verfahren === v} title={VERFAHREN_INFO[v]}
            onClick={() => setParam('verfahren', v === start.vorschlag?.verfahren ? null : v)}>
            {VERFAHREN_LABEL[v]}
          </FilterPill>
        ))}
        {start.vorschlag && (
          <span className="ml-1 text-micro text-ink3">{start.vorschlag.grund}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {rechnet && <span className="font-mono text-micro text-ink3" role="status">rechnet …</span>}
          <Button size="sm" variant="ghost" onClick={() => exportiere('csv')}>CSV</Button>
          <Button size="sm" variant="ghost" onClick={() => exportiere('json')}>JSON</Button>
          <Button size="sm" variant="action" disabled={speichern.isPending}
            onClick={() => speichern.mutate({ id, modell, markt: start.markt },
              { onSuccess: (r) => {
                const a = r as { id: string; version: number };
                setId(a.id);
                setGespeichert('Version ' + a.version + ' gespeichert');
              } })}>
            <Save size={13} aria-hidden /> Speichern
          </Button>
        </span>
      </div>
      {(gespeichert || start.versionen?.length) && (
        <p className="-mt-3 text-right text-micro" role="status">
          {gespeichert ? <span className="text-up">{gespeichert}</span>
            : <span className="text-ink3">Gespeichert in {start.versionen!.length} Version{start.versionen!.length === 1 ? '' : 'en'} · zuletzt {fmtDate(start.versionen![start.versionen!.length - 1].zeit)}</span>}
        </p>
      )}

      <Ergebniskarte e={ergebnis} modell={modell} />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid content-start gap-5">
          {(modell.verfahren === 'rnpv' || modell.verfahren === 'sotp') && (
            <ZeilenPanel modell={modell} regeln={start.regeln} aendere={setzeModell} />
          )}
          <AnnahmenPanel modell={modell} setzeAnnahme={setzeAnnahme} />
        </div>
        <div className="grid content-start gap-5">
          <BridgePanel e={ergebnis} waehrung={modell.waehrung} />
          {!!ergebnis.begruendungen.length && (
            <Panel className="animate-rise">
              <PanelTitle>Warum diese Regeln</PanelTitle>
              <ul className="grid gap-3">
                {ergebnis.begruendungen.map((b) => (
                  <li key={b.regel} className="text-small leading-relaxed">
                    <span className="font-bold text-ink">{b.regel}: </span>
                    <span className="text-ink2">{b.text}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <SensPanel sens={ergebnis.sensitivitaet} waehrung={modell.waehrung} />
    </div>
  );
}

// ---------- Gespeicherte Bewertungen ----------

function Gespeicherte() {
  const { data, isLoading } = useBewertungsListe();
  const navigate = useNavigate();
  const loeschen = useBewertungMutation((id: string) => api.del(`/api/bewertungen/${id}`));

  if (isLoading) return <SkeletonRows zeilen={3} />;
  if (!data?.length) {
    return <Empty>Noch keine gespeicherte Bewertung. Suche oben einen Wert — die erste Rechnung steht sofort.</Empty>;
  }
  return (
    <table className="w-full">
      <tbody>
        {data.map((b) => {
          const ab = b.wertJeAktie != null && b.kurs ? (b.wertJeAktie - b.kurs) / b.kurs : null;
          return (
            <tr key={b.id} className="group border-b border-line/70">
              <td className="py-2.5 pr-3">
                <button className="cursor-pointer text-small text-ink hover:text-accent"
                  onClick={() => navigate(`/bewertung?id=${encodeURIComponent(b.id)}`)}>
                  {b.name}
                </button>
                <span className="ml-2 font-mono text-micro text-ink3">{b.symbol}</span>
              </td>
              <td className="py-2.5 pr-3 font-mono text-micro text-ink3">{b.verfahren ? VERFAHREN_LABEL[b.verfahren] : '–'}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-small tabular-nums">{jeAktie(b.wertJeAktie, b.waehrung)}</td>
              <td className={cn('py-2.5 pr-3 text-right font-mono text-small tabular-nums', ab == null ? 'text-ink3' : ab >= 0 ? 'text-up' : 'text-down')}>
                {ab == null ? '–' : fmtPct(ab * 100)}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-micro text-ink3">
                v{b.versionen} · {fmtDate(b.geaendert)}
              </td>
              <td className="w-8 py-2.5 text-right">
                <button aria-label={`${b.name} löschen`} onClick={() => loeschen.mutate(b.id)}
                  className="cursor-pointer text-ink3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-down">
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------- Seite ----------

export default function BewertungPage() {
  const params = useSearchParams();
  const symbol = params.get('symbol');
  const id = params.get('id');
  const verfahren = params.get('verfahren') ?? undefined;
  const navigate = useNavigate();
  const [sucheOffen, setSucheOffen] = useState(false);
  // Entweder eine gespeicherte Bewertung (?id=) oder eine frisch vorbefüllte
  // (?symbol=) — beide Wege liefern dieselbe Ergebnisstruktur.
  const gespeichert = useBewertungGespeichert(id);
  const frisch = useBewertungStart(id ? null : symbol, verfahren);
  const { data, isLoading, error } = id ? gespeichert : frisch;
  useTitel(data?.modell.symbol ? `Bewertung · ${data.modell.symbol}` : symbol ? `Bewertung · ${symbol}` : 'Bewertung');

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
          <SymbolSearch
            onPick={(s) => { setSucheOffen(false); navigate(`/bewertung?symbol=${encodeURIComponent(s.symbol)}`); }}
          />
        </DialogContent>
      </Dialog>

      {!symbol && !id && (
        <Panel className="animate-rise">
          <PanelTitle>Gespeicherte Bewertungen</PanelTitle>
          <Gespeicherte />
        </Panel>
      )}

      {(symbol || id) && isLoading && (
        <div className="grid gap-5" role="status" aria-label="Bewertung wird geladen">
          <Skeleton className="h-[280px]" />
          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <Skeleton className="h-[420px]" /><Skeleton className="h-[420px]" />
          </div>
        </div>
      )}

      {(symbol || id) && error && (
        <Panel><Empty aria-live="polite">
          {String((error as Error).message) === 'HTTP 404'
            ? (id ? 'Diese gespeicherte Bewertung gibt es nicht mehr.' : `Für ${symbol} gibt es keine Bewertungsdaten.`)
            : 'Die Bewertung konnte nicht geladen werden. Läuft der Server noch?'}
        </Empty></Panel>
      )}

      {data && <Werkbank key={(id ?? symbol) + (verfahren ?? '')} start={data} />}
    </div>
  );
}
