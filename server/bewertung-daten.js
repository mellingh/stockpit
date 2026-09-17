// Vorbefüllung einer Bewertung aus den Yahoo-Rohdaten.
//
// Trennung der Schichten: Was hier entsteht, ist ausschließlich eine
// ANNAHMENSTRUKTUR — jede Zeile trägt Quelle, Stand und `herkunft: 'auto'`.
// Die Rohdaten selbst bleiben unverändert daneben stehen (`rohdaten`), damit
// später nachvollziehbar ist, worauf eine Annahme beruhte und was davon vom
// Nutzer überschrieben wurde.

import { POS_PHASEN, RNPV_MULTIPLE, VORGABEN, SZENARIO_SONDERREGELN } from './bewertung-regeln.js';

const zahl = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isoTag = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/**
 * Welches Verfahren passt? Die Weiche folgt dem Geschäftsmodell, nicht der
 * Datenlage — wer alles über einen Kamm schert, produziert bei mindestens
 * einem Typ Unsinn. Der Nutzer kann jederzeit umstellen.
 */
export function verfahrenVorschlag({ sektor, branche, ebitda, freierCashflow, umsatzwachstum, nettoergebnis }) {
  const b = (branche ?? '').toLowerCase();
  const s = (sektor ?? '').toLowerCase();

  if (s.includes('financial') || /bank|insurance|credit|capital market|mortgage|lending/.test(b)) {
    return { verfahren: 'residual', grund: 'Finanzunternehmen — Bewertung über Buchwert und Eigenkapitalrendite.' };
  }
  if (s.includes('healthcare') && /biotechnolog|drug manufactur|pharmaceutic/.test(b)) {
    return { verfahren: 'rnpv', grund: 'Biotech/Pharma — der Wert steckt in der Pipeline, nicht in heutigen Cashflows.' };
  }
  if (zahl(freierCashflow) != null && freierCashflow > 0 && (zahl(umsatzwachstum) ?? 0) < 0.3) {
    return { verfahren: 'dcf', grund: 'Positiver Free Cashflow bei moderatem Wachstum — Zahlungsströme sind planbar.' };
  }
  if ((zahl(nettoergebnis) ?? 0) < 0 || (zahl(ebitda) ?? 0) <= 0) {
    return { verfahren: 'multiples', grund: 'Noch kein tragfähiger Cashflow — Bewertung über den Peer-Vergleich.' };
  }
  return { verfahren: 'multiples', grund: 'Wachstumsphase — Peer-Vergleich trägt weiter als eine Cashflow-Prognose.' };
}

/**
 * Rohdaten aus quoteSummary und fundamentalsTimeSeries zusammenführen.
 * `fts` ist die jüngste Jahreszeile; sie liefert Posten, die quoteSummary seit
 * Ende 2024 nicht mehr ausgibt (Minderheitsanteile, Leasing, verwässerte
 * Aktienanzahl, Steuerquote, Working-Capital-Veränderung).
 */
export function rohdatenVon(summary, fts, zusatz = {}) {
  const fd = summary?.financialData ?? {};
  const ks = summary?.defaultKeyStatistics ?? {};
  const sd = summary?.summaryDetail ?? {};
  const ap = summary?.assetProfile ?? {};
  const f = fts ?? {};

  const umsatz = zahl(fd.totalRevenue);
  const opCf = zahl(fd.operatingCashflow);
  const cash = zahl(fd.totalCash);
  // Reichweite der Liquidität: nur sinnvoll, wenn operativ Geld abfließt.
  const monatsBurn = opCf != null && opCf < 0 ? Math.abs(opCf) / 12 : null;
  const liquiditaetMonate = monatsBurn && cash ? cash / monatsBurn : null;

  return {
    stand: isoTag(zusatz.letzteZahlen) ?? isoTag(f.date) ?? isoTag(new Date()),
    ftsStand: isoTag(f.date),
    sektor: ap.sector ?? null,
    branche: ap.industry ?? null,
    waehrung: summary?.price?.currency ?? null,
    umsatz,
    ebitda: zahl(fd.ebitda),
    operativeMarge: zahl(fd.operatingMargins),
    umsatzwachstum: zahl(fd.revenueGrowth),
    freierCashflow: zahl(fd.freeCashflow),
    operativerCashflow: opCf,
    nettoergebnis: zahl(ks.netIncomeToCommon),
    eigenkapital: zahl(f.stockholdersEquity) ?? (zahl(ks.bookValue) != null && zahl(ks.sharesOutstanding) != null ? ks.bookValue * ks.sharesOutstanding : null),
    roe: zahl(fd.returnOnEquity),
    beta: zahl(ks.beta),
    marktkapitalisierung: zahl(sd.marketCap) ?? zahl(ks.marketCap),
    enterpriseValue: zahl(ks.enterpriseValue),
    cash,
    schulden: zahl(fd.totalDebt),
    leasing: zahl(f.capitalLeaseObligations),
    minderheiten: zahl(f.minorityInterest),
    aktienVerwaessert: zahl(f.dilutedAverageShares) ?? zahl(ks.impliedSharesOutstanding) ?? zahl(ks.sharesOutstanding),
    aktienAusstehend: zahl(ks.sharesOutstanding),
    steuerquote: zahl(f.taxRateForCalcs),
    investitionsquote: zahl(f.capitalExpenditure) != null && zahl(f.totalRevenue) ? Math.abs(f.capitalExpenditure) / f.totalRevenue : null,
    workingCapitalQuote: zahl(f.changeInWorkingCapital) != null && zahl(f.totalRevenue) ? Math.abs(f.changeInWorkingCapital) / f.totalRevenue : null,
    liquiditaetMonate,
    letzteZahlen: isoTag(zusatz.letzteZahlen),
    risikofreierZins: zahl(zusatz.risikofreierZins) ?? VORGABEN.risikofreierZins,
  };
}

/** Kapitalkosten nach CAPM — die Herleitung steht als Notiz an der Annahme. */
function kapitalkosten(roh) {
  const beta = roh.beta ?? 1;
  const rf = roh.risikofreierZins;
  const wert = rf + beta * VORGABEN.marktrisikopraemie;
  const notiz =
    (rf * 100).toFixed(1).replace('.', ',') + ' % risikofrei + Beta ' + beta.toFixed(2).replace('.', ',')
    + ' × ' + (VORGABEN.marktrisikopraemie * 100).toFixed(1).replace('.', ',') + ' % Marktrisikoprämie';
  return { wert, notiz };
}

const mk = (id, label, wert, quelle, stand, extra = {}) => ({
  id, label, wert, quelle, stand, herkunft: 'auto', ...extra,
});

/** Equity Bridge — gilt für alle Verfahren außer dem Residualgewinn. */
function bridgeAnnahmen(roh) {
  const st = roh.stand;
  const verwaesserungNoetig =
    (roh.nettoergebnis ?? 0) < 0 && roh.liquiditaetMonate != null && roh.liquiditaetMonate < 24;

  return [
    mk('bridge.cash', 'Zahlungsmittel und kurzfristige Anlagen', roh.cash ?? 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge' }),
    mk('bridge.schulden', 'Finanzverbindlichkeiten', roh.schulden ?? 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge', notiz: 'Yahoos Gesamtverschuldung enthält bei IFRS-Bilanzierern die Leasingverbindlichkeiten meist bereits.' }),
    mk('bridge.leasing', 'Leasingverbindlichkeiten', 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge',
        notiz: roh.leasing != null
          ? 'Laut Jahresabschluss ' + Math.round(roh.leasing / 1e6) + ' Mio. — bewusst auf 0 vorbelegt, weil sie in den Finanzverbindlichkeiten oben meist schon stecken. Nur eintragen, wenn nachweislich nicht enthalten.'
          : 'Nicht automatisch ermittelbar.' }),
    mk('bridge.minderheiten', 'Minderheitsanteile', roh.minderheiten ?? 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge' }),
    mk('bridge.pensionen', 'Pensionsverpflichtungen', 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge', notiz: 'Liefert keine kostenlose Quelle — bitte aus dem Geschäftsbericht ergänzen.' }),
    mk('bridge.royalty', 'Royalty-Financing-Verpflichtungen', 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge',
        notiz: 'Verkauf künftiger Umsatzbeteiligungen gegen Geld im Voraus. Steht selten als Schuld in der Bilanz, ist wirtschaftlich aber genau das — und schmälert die Erlöse der Produkte, die im Modell mit vollem Wert stehen.' }),
    mk('bridge.aktien', 'Aktien, voll verwässert', roh.aktienVerwaessert ?? 0, 'geschaeftsbericht', st,
      { einheit: 'anzahl', gruppe: 'Equity Bridge',
        notiz: roh.aktienAusstehend && roh.aktienVerwaessert && roh.aktienVerwaessert > roh.aktienAusstehend
          ? 'Verwässerte Anzahl (inkl. Optionen und Wandelanleihen); ausstehend sind ' + Math.round(roh.aktienAusstehend / 1e6) + ' Mio.'
          : 'Verwässerte Anzahl aus dem Jahresabschluss.' }),
    mk('bridge.verwaesserung', 'Künftige Verwässerung', verwaesserungNoetig ? SZENARIO_SONDERREGELN.verwaesserung.base : 0,
      'eigene_schaetzung', st,
      { einheit: 'prozent', regel: 'verwaesserung', gruppe: 'Equity Bridge',
        notiz: verwaesserungNoetig
          ? 'Operativ negativ und Liquidität unter 24 Monaten — eine Kapitalerhöhung ist wahrscheinlich, deshalb vorbelegt.'
          : 'Zusätzliche Aktien aus künftigen Kapitalerhöhungen.' }),
  ];
}

/** Annahmen und Zeilen für ein Verfahren vorbereiten. */
export function annahmenFuer(verfahren, roh, extras = {}) {
  const st = roh.stand;
  const kk = kapitalkosten(roh);
  const annahmen = [];
  const zeilen = [];

  if (verfahren === 'dcf') {
    annahmen.push(
      mk('dcf.umsatz', 'Umsatz (Basis)', roh.umsatz ?? 0, 'geschaeftsbericht', st, { einheit: 'geld', gruppe: 'DCF' }),
      mk('dcf.wachstum', 'Umsatzwachstum p. a.', roh.umsatzwachstum ?? 0, 'eigene_schaetzung', st,
        { einheit: 'prozent', gruppe: 'DCF', notiz: 'Vorbelegt mit dem zuletzt gemessenen Jahreswachstum — eine Fortschreibung, keine Prognose.' }),
      mk('dcf.marge', 'Operative Marge', roh.operativeMarge ?? 0, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'marge', gruppe: 'DCF', notiz: 'Vorbelegt mit der aktuellen Marge.' }),
      mk('dcf.steuerquote', 'Steuerquote', roh.steuerquote ?? VORGABEN.steuerquote, 'geschaeftsbericht', st, { einheit: 'prozent', gruppe: 'DCF' }),
      mk('dcf.investitionen', 'Investitionen (Anteil vom Umsatz)', roh.investitionsquote ?? 0, 'geschaeftsbericht', st, { einheit: 'prozent', gruppe: 'DCF' }),
      mk('dcf.workingCapital', 'Working Capital (Anteil vom Umsatzzuwachs)', roh.workingCapitalQuote ?? 0, 'eigene_schaetzung', st, { einheit: 'prozent', gruppe: 'DCF' }),
      mk('dcf.kapitalkosten', 'Kapitalkosten', kk.wert, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'kapitalkosten', gruppe: 'DCF', notiz: kk.notiz }),
      mk('dcf.ewigesWachstum', 'Ewige Wachstumsrate', VORGABEN.ewigesWachstum, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'ewigesWachstum', gruppe: 'DCF' }),
      mk('dcf.jahre', 'Prognosejahre', VORGABEN.prognoseJahre, 'eigene_schaetzung', st, { einheit: 'jahre', gruppe: 'DCF' }),
    );
  } else if (verfahren === 'multiples') {
    const aufEbitda = (roh.ebitda ?? 0) > 0;
    const kennzahl = aufEbitda ? roh.ebitda : roh.umsatz;
    const aktuell = roh.enterpriseValue != null && kennzahl ? roh.enterpriseValue / kennzahl : null;
    annahmen.push(
      mk('mult.kennzahl', aufEbitda ? 'EBITDA' : 'Umsatz', kennzahl ?? 0, 'geschaeftsbericht', st, { einheit: 'geld', gruppe: 'Multiples' }),
      mk('mult.multiple', aufEbitda ? 'EV/EBITDA' : 'EV/Umsatz', aktuell ?? 0, 'peer_gruppe', st,
        { einheit: 'faktor', gruppe: 'Multiples', peers: [],
          notiz: 'Vorbelegt mit dem MARKTMULTIPLE dieser Aktie — damit rechnet das Modell zwangsläufig den heutigen Kurs heraus. '
            + 'Erst eine eigene Peer-Gruppe macht daraus eine Aussage.' }),
    );
  } else if (verfahren === 'sotp') {
    annahmen.push(
      mk('sotp.konglomeratsabschlag', 'Konglomeratsabschlag', VORGABEN.konglomeratsabschlag, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'konglomeratsabschlag', gruppe: 'SOTP',
          notiz: 'Bildet ab, dass die Segmente voneinander abhängen und nicht einzeln verkäuflich sind.' }),
    );
    // Segmente kann keine kostenlose Quelle zuverlässig aufteilen — eine
    // Startzeile mit dem Gesamtumsatz ist ehrlicher als erfundene Segmente.
    zeilen.push({ id: 's1', name: 'Segment 1', basis: 'umsatz', begruendung: '' });
    annahmen.push(
      mk('zeile.s1.kennzahl', 'Segment 1 — Umsatz', roh.umsatz ?? 0, 'geschaeftsbericht', st, { einheit: 'geld', gruppe: 'Segment 1' }),
      mk('zeile.s1.multiple', 'Segment 1 — Multiple', roh.enterpriseValue && roh.umsatz ? roh.enterpriseValue / roh.umsatz : 0, 'peer_gruppe', st,
        { einheit: 'faktor', gruppe: 'Segment 1', peers: [] }),
    );
  } else if (verfahren === 'rnpv') {
    // Zeilen aus den laufenden Studien vorschlagen: Phase → Erfolgswahrschein-
    // lichkeit. Den Spitzenumsatz kann keine kostenlose Quelle liefern — er
    // bleibt leer statt geraten.
    const studien = (extras.trials ?? []).slice(0, 12);
    const gesehen = new Set();
    let n = 0;
    for (const t of studien) {
      const name = (t.conditions?.[0] ?? t.title ?? '').slice(0, 60);
      if (!name || gesehen.has(name.toLowerCase())) continue;
      gesehen.add(name.toLowerCase());
      const id = 'p' + ++n;
      const phase = phaseAusStudie(t.phases);
      zeilen.push({ id, name, indikation: t.conditions?.[0] ?? null, phase, quelle: 'clinicaltrials.gov' });
      annahmen.push(
        mk('zeile.' + id + '.spitzenumsatz', name + ' — Spitzenumsatz', 0, 'eigene_schaetzung', st,
          { einheit: 'geld', gruppe: name, notiz: 'Keine kostenlose Quelle liefert Spitzenumsätze — bitte selbst setzen.' }),
        mk('zeile.' + id + '.pos', name + ' — Erfolgswahrscheinlichkeit', posFuer(phase), 'eigene_schaetzung', st,
          { einheit: 'prozent', regel: 'erfolgswahrscheinlichkeit', bernoulli: phase !== 'zugelassen', gruppe: name,
            notiz: 'Tabellenwert für ' + (POS_PHASEN.find((p) => p.id === phase)?.label ?? phase) + ' — je Indikationsgebiet anpassbar.' }),
        mk('zeile.' + id + '.multiple', name + ' — Bewertungsmultiple', RNPV_MULTIPLE.patentgeschuetzt, 'eigene_schaetzung', st,
          { einheit: 'faktor', gruppe: name, notiz: 'Multiple auf den Spitzenumsatz. ' + RNPV_MULTIPLE.patentgeschuetzt + ' für patentgeschützte, ' + RNPV_MULTIPLE.reif + ' für reife Produkte.' }),
      );
    }
    if (!zeilen.length) {
      zeilen.push({ id: 'p1', name: 'Programm 1', indikation: null, phase: 'phase2' });
      annahmen.push(
        mk('zeile.p1.spitzenumsatz', 'Programm 1 — Spitzenumsatz', 0, 'eigene_schaetzung', st, { einheit: 'geld', gruppe: 'Programm 1' }),
        mk('zeile.p1.pos', 'Programm 1 — Erfolgswahrscheinlichkeit', posFuer('phase2'), 'eigene_schaetzung', st,
          { einheit: 'prozent', regel: 'erfolgswahrscheinlichkeit', bernoulli: true, gruppe: 'Programm 1' }),
        mk('zeile.p1.multiple', 'Programm 1 — Bewertungsmultiple', RNPV_MULTIPLE.patentgeschuetzt, 'eigene_schaetzung', st, { einheit: 'faktor', gruppe: 'Programm 1' }),
      );
    }
  } else if (verfahren === 'residual') {
    annahmen.push(
      mk('res.eigenkapital', 'Eigenkapital (Buchwert)', roh.eigenkapital ?? 0, 'geschaeftsbericht', st, { einheit: 'geld', gruppe: 'Residualgewinn' }),
      mk('res.roe', 'Eigenkapitalrendite', roh.roe ?? 0, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'rendite', gruppe: 'Residualgewinn', notiz: 'Vorbelegt mit der aktuellen Rendite — für die Bewertung zählt die nachhaltig erreichbare.' }),
      mk('res.eigenkapitalkosten', 'Eigenkapitalkosten', kk.wert, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'kapitalkosten', gruppe: 'Residualgewinn', notiz: kk.notiz }),
      mk('res.wachstum', 'Nachhaltiges Wachstum', VORGABEN.ewigesWachstum, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'ewigesWachstum', gruppe: 'Residualgewinn' }),
    );
  }

  // Equity Bridge für alle Verfahren außer Residualgewinn; dort wird direkt
  // das Eigenkapital bewertet und nur die Aktienanzahl gebraucht.
  if (verfahren === 'residual') {
    annahmen.push(
      mk('bridge.aktien', 'Aktien, voll verwässert', roh.aktienVerwaessert ?? 0, 'geschaeftsbericht', st, { einheit: 'anzahl', gruppe: 'Equity Bridge' }),
      mk('bridge.verwaesserung', 'Künftige Verwässerung', 0, 'eigene_schaetzung', st, { einheit: 'prozent', regel: 'verwaesserung', gruppe: 'Equity Bridge' }),
    );
  } else {
    annahmen.push(...bridgeAnnahmen(roh));
  }

  return { annahmen, zeilen };
}

/** clinicaltrials-Phasenangabe auf die Tabelle abbilden. */
function phaseAusStudie(phases) {
  const p = (phases ?? []).join(' ').toUpperCase();
  if (p.includes('PHASE4')) return 'zugelassen';
  if (p.includes('PHASE3')) return 'phase3';
  if (p.includes('PHASE2')) return 'phase2';
  if (p.includes('PHASE1')) return 'phase1';
  if (p.includes('EARLY_PHASE1')) return 'praeklinisch';
  return 'phase2';
}

function posFuer(phase) {
  return POS_PHASEN.find((p) => p.id === phase)?.pos ?? 0.3;
}

/** Komplettes Startmodell für ein Symbol. */
export function baueModell({ symbol, name, kurs, kursStand, verfahren, roh, extras, heute }) {
  const { annahmen, zeilen } = annahmenFuer(verfahren, roh, extras);
  return {
    symbol,
    name,
    verfahren,
    waehrung: roh.waehrung,
    kurs,
    kursStand: isoTag(kursStand),
    stand: isoTag(heute ?? new Date()),
    annahmen,
    zeilen,
  };
}
