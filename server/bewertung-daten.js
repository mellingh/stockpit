// Vorbefüllung einer Bewertung aus den Rohdaten.
//
// Trennung der Schichten: Was hier entsteht, ist ausschließlich eine
// ANNAHMENSTRUKTUR — jede Zeile trägt Quelle, Stand und `herkunft: 'auto'`.
// Die Rohdaten selbst bleiben unverändert daneben stehen, damit später
// nachvollziehbar ist, worauf eine Annahme beruhte.
//
// Drei Quellen, nach Belastbarkeit geordnet:
//   1. Geschäftsbericht (Yahoo `financialData` + `fundamentalsTimeSeries`)
//   2. Analystenkonsens (Yahoo `earningsTrend` — Umsatz- und Gewinnschätzungen
//      für die kommenden Jahre, mit Anzahl der Analysten)
//   3. Peer-Gruppe (TradingView-Scanner, Branchen-Nachbarn mit ihren Multiples)

import { POS_PHASEN, RNPV_MULTIPLE, VORGABEN, SZENARIO_SONDERREGELN } from './bewertung-regeln.js';
import { perzentil } from './bewertung.js';

const zahl = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Wie viele Geschäftsjahre in die Durchschnitte eingehen. */
const JAHRE_SCHNITT = 3;

/**
 * Kennzahlen je Geschäftsjahr aus der Jahresreihe — nur Jahre mit Umsatz.
 * Beträge werden mit demselben Faktor in die Kurswährung gebracht wie der Rest.
 */
function jahresReihe(f, fx = 1) {
  const quote = (wert, umsatz) => (zahl(wert) != null && zahl(umsatz) > 0 ? Math.abs(wert) / umsatz : null);
  return (f?.reihe ?? [])
    .filter((j) => zahl(j.totalRevenue) > 0)
    .map((j) => ({
      jahr: new Date(j.date).getUTCFullYear(),
      umsatz: j.totalRevenue * fx,
      marge: zahl(j.operatingIncome) != null ? j.operatingIncome / j.totalRevenue : null,
      investitionen: quote(j.capitalExpenditure, j.totalRevenue),
      abschreibungen: quote(
        j.depreciationAndAmortization ?? j.depreciationAmortizationDepletion ?? j.reconciledDepreciation,
        j.totalRevenue,
      ),
      steuerquote: zahl(j.taxRateForCalcs),
      aktien: zahl(j.dilutedAverageShares),
      aktienverguetung: quote(j.stockBasedCompensation, j.totalRevenue),
    }));
}

/** Durchschnitt der letzten n Jahre eines Feldes (null, wenn nichts da ist). */
function mehrjahresSchnitt(reihe, feld, n = JAHRE_SCHNITT) {
  const werte = reihe.slice(-n).map((j) => j[feld]).filter((v) => zahl(v) != null);
  return werte.length ? werte.reduce((s, v) => s + v, 0) / werte.length : null;
}

/**
 * Jährliche Verwässerung aus der gemessenen Aktienanzahl.
 *
 * Bisher stand hier pauschal null — bei Samsara wuchs die Aktienzahl in vier
 * Jahren von 514 auf 573 Mio (2,8 % pro Jahr), weil ein Fünftel des Umsatzes
 * als Aktienvergütung ausgezahlt wird. Über die Haltedauer verwässert das den
 * Wert je Aktie spürbar. Aktienrückkäufe (negative Werte) bleiben unbeachtet:
 * das Geld dafür steckt schon im Cashflow, es zweimal gutzuschreiben wäre
 * zu freundlich gerechnet.
 */
function verwaesserungProJahr(reihe) {
  const werte = reihe.map((j) => j.aktien).filter((v) => zahl(v) > 0);
  if (werte.length < 2) return null;
  const jahre = werte.length - 1;
  const rate = (werte[werte.length - 1] / werte[0]) ** (1 / jahre) - 1;
  return Math.min(0.05, Math.max(0, rate));
}
const isoTag = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const median = (a) => perzentil(a ?? [], 0.5);

/** Analystenschätzungen aus `earningsTrend` in eine flache Form bringen. */
export function schaetzungenVon(summary) {
  const trend = summary?.earningsTrend?.trend ?? [];
  const hole = (periode) => {
    const t = trend.find((x) => x.period === periode);
    if (!t) return null;
    return {
      endet: isoTag(t.endDate),
      umsatz: zahl(t.revenueEstimate?.avg),
      umsatzwachstum: zahl(t.revenueEstimate?.growth),
      eps: zahl(t.earningsEstimate?.avg),
      analysten: zahl(t.revenueEstimate?.numberOfAnalysts) ?? zahl(t.earningsEstimate?.numberOfAnalysts),
    };
  };
  const jahr0 = hole('0y');
  const jahr1 = hole('+1y');
  return {
    jahr0,
    jahr1,
    // Für die Prognose zählt das Wachstum des NÄCHSTEN Jahres: das laufende ist
    // größtenteils schon Vergangenheit.
    wachstum: jahr1?.umsatzwachstum ?? jahr0?.umsatzwachstum ?? null,
    analysten: jahr1?.analysten ?? jahr0?.analysten ?? null,
  };
}

/**
 * Rohdaten aus quoteSummary, fundamentalsTimeSeries, Analystenschätzungen und
 * Peer-Gruppe zusammenführen.
 */
export function rohdatenVon(summary, fts, zusatz = {}) {
  const fd = summary?.financialData ?? {};
  const ks = summary?.defaultKeyStatistics ?? {};
  const sd = summary?.summaryDetail ?? {};
  const ap = summary?.assetProfile ?? {};
  const f = fts ?? {};
  const schaetzung = schaetzungenVon(summary);

  /**
   * Bilanz und GuV stehen oft in einer ANDEREN Währung als der Kurs:
   * AstraZeneca bilanziert in USD, notiert aber in Pence (1 Pfund = 100 GBp) —
   * die Rechnung ergab 171,82 „USD je Aktie" neben einem Kurs von 12.672 GBp,
   * also scheinbar −99 %. Shopify an der TSX (USD/CAD) und Tencent in Hongkong
   * (CNY/HKD) trifft dasselbe. Deshalb werden ALLE Geldbeträge hier einmal in
   * die Kurswährung umgerechnet; Vielfache und Quoten sind Verhältnisse und
   * bleiben unberührt.
   */
  const fx = zahl(zusatz.waehrungsfaktor) ?? 1;
  const geld = (v) => (zahl(v) == null ? null : v * fx);
  const jahre = jahresReihe(f, fx);

  const umsatz = geld(fd.totalRevenue);
  const opCf = geld(fd.operatingCashflow);
  const cash = geld(fd.totalCash);
  // Reichweite der Liquidität: nur sinnvoll, wenn operativ Geld abfließt.
  const monatsBurn = opCf != null && opCf < 0 ? Math.abs(opCf) / 12 : null;
  const liquiditaetMonate = monatsBurn && cash ? cash / monatsBurn : null;

  const peers = zusatz.peers ?? null;
  // Ausreisser kappen: ein einzelner Wert wie CrowdStrikes EV/EBITDA von 935
  // zieht sonst das 75. Perzentil und damit den ganzen Best Case hoch. Erst
  // grob filtern, dann alles ueber dem Dreifachen des Medians verwerfen.
  // Für Hersteller mit eigener Bank zählt nur, wer selbst so finanziert ist:
  // Volkswagen gegen Ford, GM, Toyota und Stellantis — nicht gegen Tesla und
  // Ferrari, die ohne Finanzierungstochter und mit ganz anderen Vielfachen
  // dastehen. Gemessen am Verhältnis Schulden zu Eigenkapital.
  const hochVerschuldet = (p) => typeof p.schuldenquote === 'number' && p.schuldenquote > 1.5;
  const peerWerteGefiltert = (feld, filter) => {
    const grob = (peers?.peers ?? []).filter(filter).map((p) => p[feld])
      .filter((v) => zahl(v) != null && v > 0 && v < 200);
    const m = median(grob);
    return m == null ? grob : grob.filter((v) => v <= m * 3);
  };
  const peerWerte = (feld) => {
    const grob = (peers?.peers ?? []).map((p) => p[feld]).filter((v) => zahl(v) != null && v > 0 && v < 200);
    const m = median(grob);
    return m == null ? grob : grob.filter((v) => v <= m * 3);
  };

  return {
    stand: isoTag(zusatz.letzteZahlen) ?? isoTag(f.date) ?? isoTag(new Date()),
    ftsStand: isoTag(f.date),
    sektor: ap.sector ?? null,
    branche: ap.industry ?? null,
    waehrung: summary?.price?.currency ?? null,
    // Wechselkurs mitgeben, damit gespeicherte Fassungen nachvollziehbar sind
    waehrungsfaktor: fx,
    finanzWaehrung: zusatz.finanzWaehrung ?? null,
    umsatz,
    ebitda: geld(fd.ebitda),
    operativeMarge: zahl(fd.operatingMargins),
    umsatzwachstum: zahl(fd.revenueGrowth),
    freierCashflow: geld(fd.freeCashflow),
    operativerCashflow: opCf,
    nettoergebnis: geld(ks.netIncomeToCommon),
    epsTtm: geld(ks.trailingEps),
    eigenkapital: geld(zahl(f.stockholdersEquity)
      ?? (zahl(ks.bookValue) != null && zahl(ks.sharesOutstanding) != null ? ks.bookValue * ks.sharesOutstanding : null)),
    buchwertJeAktie: geld(ks.bookValue),
    roe: zahl(fd.returnOnEquity),
    beta: zahl(ks.beta),
    // Marktkapitalisierung steht bereits in Kurswährung, der Enterprise Value
    // dagegen in der Bilanzwährung
    marktkapitalisierung: zahl(sd.marketCap) ?? zahl(ks.marketCap),
    enterpriseValue: geld(ks.enterpriseValue),
    // Kursziele der Analysten stehen in KURSwährung — nicht umrechnen
    kursziel: zahl(fd.targetMeanPrice),
    kurszielTief: zahl(fd.targetLowPrice),
    kurszielHoch: zahl(fd.targetHighPrice),
    kurszielAnalysten: zahl(fd.numberOfAnalystOpinions),
    cash,
    schulden: geld(fd.totalDebt),
    leasing: geld(f.capitalLeaseObligations),
    minderheiten: geld(f.minorityInterest),
    // Die GRÖSSTE der drei Zahlen zählt, nicht die erstbeste:
    //  - `dilutedAverageShares` ist der DURCHSCHNITT des letzten Geschäftsjahres
    //    und hinkt jeder Kapitalerhöhung hinterher (Assembly Biosciences: 11,2
    //    statt 20,4 Mio Stück — der Wert je Aktie war dadurch 82 % zu hoch);
    //  - `impliedSharesOutstanding` zählt alle Aktiengattungen (bei Samsara
    //    gibt es A- und B-Aktien: 380 Mio ausgewiesen, 586 Mio insgesamt);
    //  - `dilutedAverageShares` enthält dafür Optionen und Wandelrechte.
    // Wer eine Aktie bewertet, teilt durch ALLE Ansprüche auf den Gewinn.
    aktienVerwaessert: Math.max(
      zahl(f.dilutedAverageShares) ?? 0,
      zahl(ks.impliedSharesOutstanding) ?? 0,
      zahl(ks.sharesOutstanding) ?? 0,
    ) || null,
    aktienAusstehend: zahl(ks.sharesOutstanding),
    // Steuerquote gedeckelt: in Verlustjahren meldet die Quelle Werte wie 40 %
    // oder 0 %, beides verzerrt eine Zehnjahresrechnung.
    steuerquote: (() => {
      const s = mehrjahresSchnitt(jahre, 'steuerquote') ?? zahl(f.taxRateForCalcs);
      return s == null ? null : Math.min(0.35, Math.max(0.15, s));
    })(),
    // Investitionen und Steuern kommen als Schnitt der letzten drei Jahre:
    // beide springen von Jahr zu Jahr (Microsoft 13 → 35 % Investitionsquote,
    // Samsara 40 % Steuerquote in einem Verlustjahr). Die operative Marge bleibt
    // dagegen der aktuelle Wert — sie ist die heutige Ertragskraft, und die
    // Szenarien verschieben sie ohnehin um ±3 Punkte.
    investitionsquote: mehrjahresSchnitt(jahre, 'investitionen')
      ?? (zahl(f.capitalExpenditure) != null && zahl(f.totalRevenue) ? Math.abs(f.capitalExpenditure) / f.totalRevenue : null),
    jahresreihe: jahre,
    verwaesserungProJahr: verwaesserungProJahr(jahre),
    aktienverguetungsquote: jahre.length ? jahre[jahre.length - 1].aktienverguetung : null,
    // Abschreibungen sind KEIN Geldabfluss — sie mindern nur den ausgewiesenen
    // Gewinn. Wer sie in der Cashflow-Rechnung nicht zurückaddiert, bewertet
    // jede kapitalintensive Firma systematisch zu niedrig: Tesla kam so auf
    // einen NEGATIVEN Unternehmenswert, ExxonMobil auf 40 USD bei Kurs 163.
    // Drei Feldnamen, weil Yahoo je nach Branche anders benennt: Ölkonzerne
    // führen den Posten als „Depletion" (ExxonMobil hat kein
    // depreciationAndAmortization, wohl aber 26 Mrd unter dem längeren Namen).
    abschreibungsquote: mehrjahresSchnitt(jahre, 'abschreibungen') ?? (() => {
      const da = zahl(f.depreciationAndAmortization)
        ?? zahl(f.depreciationAmortizationDepletion)
        ?? zahl(f.reconciledDepreciation);
      return da != null && zahl(f.totalRevenue) ? Math.abs(da) / f.totalRevenue : null;
    })(),
    workingCapitalQuote: zahl(f.changeInWorkingCapital) != null && zahl(f.totalRevenue) ? Math.abs(f.changeInWorkingCapital) / f.totalRevenue : null,
    liquiditaetMonate,
    letzteZahlen: isoTag(zusatz.letzteZahlen),
    risikofreierZins: zahl(zusatz.risikofreierZins) ?? VORGABEN.risikofreierZins,
    schaetzung,
    // Erwarteter Umsatz aus DERSELBEN Quelle wie die Peer-Multiples —
    // sonst vergleicht man eine Yahoo-Schaetzung mit TradingView-Multiples.
    // Yahoos Konsens zuerst: er steht in der Bilanzwährung und wird hier
    // mitumgerechnet. Der TradingView-Wert ist nur die Rückfallebene — seine
    // Währung ist nicht garantiert dieselbe.
    umsatzErwartet: geld(schaetzung.jahr1?.umsatz) ?? peers?.ziel?.umsatzErwartet ?? null,
    qualitaet: peers?.qualitaet ?? null,
    peerGruppe: peers
      ? {
        branche: peers.branche,
        // Wo in der Bandbreite gerechnet wird (aus dem Kennzahlen-Vergleich)
        perzentile: peers.qualitaet?.perzentile ?? null,
        anzahl: peers.peers.length,
        namen: peers.peers.map((p) => p.symbol),
        evUmsatz: peerWerte('evUmsatz'),
        // ohne Ausreißer-Kappung: hier zählt die typische Marge der Branche
        ebitdaMargen: (peers.peers ?? []).map((p) => p.ebitdaMarge).filter((v) => typeof v === 'number' && v > 0),
        evUmsatzErwartet: peerWerte('evUmsatzErwartet'),
        evEbitda: peerWerte('evEbitda'),
        kgv: peerWerte('kgv'),
        kbv: peerWerte('kbv'),
        kgvVerschuldet: peerWerteGefiltert('kgv', hochVerschuldet),
        kbvVerschuldet: peerWerteGefiltert('kbv', hochVerschuldet),
      }
      : null,
  };
}

/** Kapitalkosten nach CAPM — die Herleitung steht als Notiz an der Annahme. */
function kapitalkosten(roh) {
  // Ein Beta um null oder darunter ist kein niedriges Risiko, sondern ein
  // kaputter Wert — Yahoo liefert das bei Zweitnotierungen und ADRs regelmäßig
  // (BP: −0,22). Dann zählt der Marktdurchschnitt 1,0 statt einer geklemmten
  // Zahl: geklemmt ergäbe sich für einen Ölkonzern ein Kapitalkostensatz wie
  // für einen Versorger, und der Zahlungsstrom-Wert stiege auf das Doppelte des
  // Kurses. Echte niedrige Betas (Coca-Cola 0,5) bleiben erhalten.
  const roheBeta = zahl(roh.beta);
  const beta = roheBeta == null || roheBeta < VORGABEN.betaSpanne.kaputtUnter
    ? 1
    : Math.min(VORGABEN.betaSpanne.max, Math.max(VORGABEN.betaSpanne.min, roheBeta));
  const rf = roh.risikofreierZins;
  const wert = Math.max(VORGABEN.mindestKapitalkosten, rf + beta * VORGABEN.marktrisikopraemie);
  const pz = (v) => (v * 100).toFixed(1).replace('.', ',');
  return {
    wert,
    notiz: `${pz(rf)} % risikofreier Zins + Beta ${beta.toFixed(2).replace('.', ',')} × ${pz(VORGABEN.marktrisikopraemie)} % Marktrisikoprämie`,
  };
}

// Bei Immobiliengesellschaften (REITs) steht der Wert in den Objekten, nicht im
// Zahlungsstrom der GuV: Zukäufe und Verkäufe von Immobilien laufen an der
// Investitionsposition vorbei, die Abschreibungen sind riesig und wirtschaftlich
// bedeutungslos. VICI kam so auf einen NEGATIVEN Wert je Aktie, Realty Income
// auf 1,76 USD bei einem Kurs von 57.
const istImmobilie = (roh) => /real estate|reit/i.test(`${roh.sektor ?? ''} ${roh.branche ?? ''}`);

/**
 * Versorger und Netzbetreiber: Der Wert hängt am regulierten Anlagevermögen und
 * an Investitionszyklen, die die Gewinnrechnung nur verzerrt abbildet —
 * Frequenzlizenzen, Netzausbau und Leasing laufen an der Investitionsposition
 * vorbei. Nachgemessen: die Deutsche Telekom kam im Zahlungsstrom-Modell auf
 * 106 EUR bei einem Kurs von 27, NextEra auf einen negativen Wert. In der
 * Praxis bewertet man diese Branchen über Vielfache und Ausschüttungen.
 */
const istNetzbetreiber = (roh) =>
  /utilities/i.test(roh.sektor ?? '')
  || /telecom services|utilities/i.test(roh.branche ?? '');

const istFinanzwert = (roh) =>
  (roh.sektor ?? '').toLowerCase().includes('financial')
  || /bank|insurance|credit|capital market|mortgage|lending/.test((roh.branche ?? '').toLowerCase());

/**
 * Welche Verfahren lassen sich für diesen Wert OHNE Handeingaben rechnen?
 * Ein Verfahren, dessen Pflichtzahlen keine kostenlose Quelle liefert, wird
 * nicht angeboten — sonst steht dort ein Ergebnis, das nur den Kassenbestand
 * zeigt (genau das passierte beim rNPV mit leeren Spitzenumsätzen).
 */
export function anwendbareVerfahren(roh) {
  const finanz = istFinanzwert(roh);
  const peers = roh.peerGruppe;
  const raus = [];
  const abgelehnt = [];
  const pz = (v) => Math.round(v * 100) + ' %';

  if (finanz) {
    abgelehnt.push({
      id: 'dcf',
      grund: 'Bei Kreditgebern laufen Kreditvergaben durch die Cashflow-Rechnung — wer weniger Neugeschäft macht, sieht auf dem Papier besser aus. Ein Cashflow-Modell führt hier in die Irre.',
    });
    if (zahl(roh.eigenkapital) > 0 && zahl(roh.roe) > 0) {
      raus.push({ id: 'residual', grund: 'Buchwert und Eigenkapitalrendite liegen vor — bei Kreditgebern das übliche Verfahren.' });
    } else {
      abgelehnt.push({ id: 'residual', grund: 'Buchwert oder Eigenkapitalrendite fehlen bzw. sind negativ.' });
    }
    const nettoMarge = zahl(roh.nettoergebnis) > 0 && zahl(roh.umsatz) > 0 ? roh.nettoergebnis / roh.umsatz : null;
    if ((peers?.kgv?.length ?? 0) >= 3 && nettoMarge != null && nettoMarge >= VORGABEN.mindestNettoMarge) {
      raus.push({ id: 'multiples', basis: 'gewinn', grund: `Gewinnvielfaches im Vergleich zu ${peers.anzahl} Wettbewerbern.` });
    } else if ((peers?.kbv?.length ?? 0) >= 3 && zahl(roh.eigenkapital) > 0) {
      raus.push({ id: 'multiples', basis: 'buchwert', grund: `Buchwertvielfaches im Vergleich zu ${peers.anzahl} Wettbewerbern.` });
    } else {
      abgelehnt.push({ id: 'multiples', grund: 'Keine ausreichende Vergleichsgruppe mit brauchbaren Kennzahlen gefunden.' });
    }
    return { anwendbar: raus, abgelehnt };
  }

  // DCF braucht ein positives operatives Ergebnis und eine Wachstumsschätzung.
  const wachstum = roh.schaetzung?.wachstum ?? roh.umsatzwachstum;
  const immobilie = istImmobilie(roh);

  // Hersteller mit eigener Bank: Die Finanzierungsschulden gehören zum
  // Geschäftsmodell und stehen Kundenforderungen gegenüber, die im EBITDA nicht
  // vorkommen. Zieht man sie wie normale Schulden ab, bleibt vom Wert nichts
  // übrig — Volkswagen, BMW, Mercedes, Ford und Deere kamen alle auf negative
  // Werte je Aktie. Bewertet wird dann über Gewinn oder Buchwert, also über
  // Größen, in denen die Finanzierung schon steckt (dieselbe Logik wie bei
  // Banken, nur eine Stufe weiter unten).
  const nettoSchulden = (zahl(roh.schulden) ?? 0) - (zahl(roh.cash) ?? 0);
  const hebel = zahl(roh.ebitda) > 0 ? nettoSchulden / roh.ebitda : null;
  const eigeneBank = !finanz && !immobilie && !istNetzbetreiber(roh)
    && hebel != null && hebel > VORGABEN.maxHebelFuerEv;
  if (eigeneBank) {
    const hebelText = hebel.toFixed(1).replace('.', ',');
    const grund = `Die Netto-Verschuldung beträgt das ${hebelText}-Fache des operativen Gewinns. Bei Herstellern mit eigener Finanzierungstochter gehört dieser Teil zum Geschäft und steht Kundenforderungen gegenüber — Verfahren über den Unternehmenswert ziehen ihn ab und kommen auf einen Wert unter null.`;
    abgelehnt.push({ id: 'dcf', grund });
    // Hier zählt NUR, ob unter dem Strich Gewinn steht — nicht die Nettomarge.
    // Autohersteller verdienen strukturell 1 bis 3 % vom Umsatz; mit der
    // Margenschwelle fiel Volkswagen auf das Buchwertvielfache, und weil die
    // Gruppe Tesla und Ferrari enthält, kam ein Wert vom Fünffachen des Kurses
    // heraus. Über den Gewinn landet dieselbe Aktie in der Nähe des Kurses.
    if ((peers?.kgv?.length ?? 0) >= 3 && zahl(roh.nettoergebnis) > 0) {
      raus.push({ id: 'multiples', basis: 'gewinn',
        grund: `Gewinnvielfaches im Vergleich zu ${peers.anzahl} Wettbewerbern — im Gewinn steckt die Finanzierung bereits drin.` });
    } else if ((peers?.kbv?.length ?? 0) >= 3 && zahl(roh.eigenkapital) > 0) {
      raus.push({ id: 'multiples', basis: 'buchwert',
        grund: `Buchwertvielfaches im Vergleich zu ${peers.anzahl} Wettbewerbern — der Gewinn ist zu dünn, das Eigenkapital trägt die Bewertung.` });
    } else {
      abgelehnt.push({ id: 'multiples', grund: 'Keine Vergleichsgruppe mit brauchbarem Gewinn- oder Buchwertvielfachen.' });
    }
    return { anwendbar: raus, abgelehnt };
  }
  // Freier Zahlungsstrom je Euro Umsatz, aus der Jahresreihe zusammengesetzt.
  // Yahoos Feld `freeCashflow` taugt dafür NICHT — nachgemessen weist es für
  // Microsoft 5 % vom Umsatz aus statt rund 21 %, für Coca-Cola 10 statt 19 %.
  const fcfMarge = zahl(roh.operativeMarge) != null
    ? roh.operativeMarge * (1 - (zahl(roh.steuerquote) ?? VORGABEN.steuerquote))
      + (roh.investitionsquote != null ? roh.abschreibungsquote ?? 0 : 0)
      - (roh.investitionsquote ?? 0)
    : null;
  if (immobilie) {
    abgelehnt.push({
      id: 'dcf',
      grund: 'Bei Immobiliengesellschaften steckt der Wert in den Objekten. Zu- und Verkäufe laufen an der Gewinnrechnung vorbei, und die Abschreibungen auf Gebäude sind wirtschaftlich bedeutungslos — ein Cashflow-Modell trifft hier daneben.',
    });
  } else if (istNetzbetreiber(roh)) {
    abgelehnt.push({
      id: 'dcf',
      grund: 'Bei Versorgern und Netzbetreibern hängt der Wert am Anlagevermögen und an Investitionszyklen: Netzausbau, Frequenzen und Leasing tauchen in der Gewinnrechnung nur teilweise auf. Bewertet wird deshalb über den Branchenvergleich.',
    });
  } else if (!(zahl(roh.umsatz) > 0) || !(zahl(roh.operativeMarge) > 0)) {
    abgelehnt.push({ id: 'dcf', grund: 'Operativ noch nicht profitabel — es gibt keine Zahlungsströme, die sich abzinsen ließen.' });
  } else if (fcfMarge != null && fcfMarge < VORGABEN.mindestFcfMargeFuerDcf) {
    // Gemessen wird der freie Zahlungsstrom des ersten Prognosejahres, genau so
    // wie ihn rechneDcf bildet: Betriebsergebnis nach Steuern + Abschreibungen
    // − Investitionen. Bleibt davon nichts, ist das Ergebnis beliebig.
    abgelehnt.push({
      id: 'dcf',
      grund: `Nach Investitionen bleibt vom Umsatz praktisch kein freier Zahlungsstrom übrig (${pz(fcfMarge)}). Eine Zehnjahresrechnung darauf misst Rundungsfehler: schon ein halber Prozentpunkt mehr Marge würde das Ergebnis vervielfachen.`,
    });
  } else if (zahl(wachstum) == null) {
    abgelehnt.push({ id: 'dcf', grund: 'Keine belastbare Wachstumsschätzung verfügbar.' });
  } else if (wachstum > VORGABEN.maxWachstumFuerDcf) {
    // Eine Zehnjahresprognose für ein Unternehmen, das gerade 66 % pro Jahr
    // wächst, ist keine Rechnung mehr, sondern eine Wette auf das Abschmelzen.
    // Der Endwert reagiert darauf so stark, dass ein Ergebnis beim Vielfachen
    // des Kurses herauskommt. In der Praxis bewertet man solche Firmen über
    // die Vergleichsgruppe.
    abgelehnt.push({
      id: 'dcf',
      grund: `Erwartetes Wachstum von ${pz(wachstum)} — bei diesem Tempo ist eine Zehnjahresprognose nicht belastbar, der Endwert würde das Ergebnis beliebig machen.`,
    });
  } else {
    raus.push({
      id: 'dcf',
      grund: roh.schaetzung?.wachstum != null
        ? `Operativ profitabel; Wachstum von ${pz(wachstum)} aus den Schätzungen von ${roh.schaetzung.analysten ?? '—'} Analysten.`
        : `Operativ profitabel; Wachstum von ${pz(wachstum)} aus dem letzten Geschäftsjahr fortgeschrieben.`,
    });
  }

  // Multiples brauchen eine echte Vergleichsgruppe. Reihenfolge nach
  // Aussagekraft:
  //  1. EV/EBITDA, wenn die Firma profitabel ist — die Kennzahl nimmt die Marge
  //     mit und nicht nur die Umsatzgröße.
  //  2. Sonst, bei deutlichem Wachstum, der ERWARTETE Umsatz: ein Vielfaches des
  //     heutigen unterschätzt eine Firma, die sich gerade verdoppelt (Insmed kam
  //     so auf 5,5 Mrd, während der Markt 26,5 Mrd zahlt).
  //  3. Sonst der heutige Umsatz.
  const waechstDeutlich = (zahl(wachstum) ?? 0) > VORGABEN.wachstumFuerForward;
  // Das EBITDA muss die Firma tragen können: unter fünf Prozent vom Umsatz ist
  // es eine Restgröße, auf die kein Vielfaches passt (Samsara, 1,7 %). Darüber
  // bleibt EV/EBITDA richtig, auch wenn die Marge unter der Branche liegt —
  // das Vielfache ist margenneutral, ein Umsatzvielfaches wäre es nicht.
  const ebitdaMarge = zahl(roh.ebitda) > 0 && zahl(roh.umsatz) > 0 ? roh.ebitda / roh.umsatz : null;
  const ebitdaTraegt = ebitdaMarge != null && ebitdaMarge >= VORGABEN.mindestEbitdaMarge;
  if ((peers?.evEbitda?.length ?? 0) >= 3 && ebitdaTraegt) {
    raus.push({ id: 'multiples', basis: 'ebitda', grund: `EV/EBITDA im Vergleich zu ${peers.anzahl} Wettbewerbern derselben Branche.` });
  } else if (waechstDeutlich && (peers?.evUmsatzErwartet?.length ?? 0) >= 3 && zahl(roh.umsatzErwartet) > 0) {
    raus.push({ id: 'multiples', basis: 'umsatzErwartet',
      grund: `Vielfaches des für nächstes Jahr erwarteten Umsatzes, verglichen mit ${peers.anzahl} Wettbewerbern — bei ${pz(wachstum)} Wachstum ist der heutige Umsatz die falsche Basis.` });
  } else if ((peers?.evUmsatz?.length ?? 0) >= 3 && zahl(roh.umsatz) > 0) {
    raus.push({ id: 'multiples', basis: 'umsatz', grund: `EV/Umsatz im Vergleich zu ${peers.anzahl} Wettbewerbern derselben Branche.` });
  } else {
    abgelehnt.push({ id: 'multiples', grund: 'Keine Vergleichsgruppe mit mindestens drei brauchbaren Multiples gefunden.' });
  }

  return { anwendbar: raus, abgelehnt };
}

/** Verfahren, die immer Handeingaben brauchen — nie automatisch gerechnet. */
export const MANUELLE_VERFAHREN = {
  rnpv: 'Spitzenumsätze je Medikament liefert keine kostenlose Quelle — die trägst du selbst ein.',
  sotp: 'Segmentumsätze stehen nur im Geschäftsbericht — die trägst du selbst ein.',
};

/** „Die letzten Jahre: 2023: 13,3 % · 2024: 18,1 % · 2025: 22,9 %" */
function jahresNotiz(roh, feld) {
  const jahre = (roh.jahresreihe ?? []).slice(-4).filter((j) => zahl(j[feld]) != null);
  if (jahre.length < 2) return '';
  const teile = jahre.map((j) => `${j.jahr}: ${(j[feld] * 100).toFixed(1).replace('.', ',')} %`);
  return 'Die letzten Geschäftsjahre — ' + teile.join(' · ') + '.';
}

const mk = (id, label, wert, quelle, stand, extra = {}) => ({
  id, label, wert, quelle, stand, herkunft: 'auto', ...extra,
});

/** Aktienanzahl und künftige Verwässerung — braucht jedes Verfahren. */
/**
 * Wie viele Aktien kommen noch dazu?
 *
 * Bisher stand hier null, sofern keine Kapitalerhöhung drohte — das war zu
 * freundlich. Aktienvergütung erhöht die Aktienzahl Jahr für Jahr, und zwar
 * messbar: bei Samsara um 2,8 % pro Jahr (ein Fünftel des Umsatzes geht als
 * Aktien an die Belegschaft), bei NVIDIA um 0,4 %. Angesetzt wird die gemessene
 * Rate über drei Jahre — nicht über den ganzen Prognosezeitraum, weil niemand
 * weiß, wie lange ein Unternehmen so vergütet.
 *
 * WICHTIG: Die Aktienvergütung wird NUR hier berücksichtigt, nicht zusätzlich
 * als Kostenposten. Beides zusammen wäre doppelt gezählt.
 */
function verwaesserungAnsatz(roh, verwaesserungNoetig) {
  const pz = (v) => (v * 100).toFixed(1).replace('.', ',');
  if (verwaesserungNoetig) {
    return {
      wert: SZENARIO_SONDERREGELN.verwaesserung.base,
      notiz: 'Operativ negativ und Liquidität unter 24 Monaten — eine Kapitalerhöhung ist wahrscheinlich, deshalb vorbelegt.',
    };
  }
  const proJahr = zahl(roh.verwaesserungProJahr);
  if (!proJahr) {
    return { wert: 0, notiz: 'Zusätzliche Aktien aus künftigen Kapitalerhöhungen — keine Veränderung messbar.' };
  }
  const sbc = zahl(roh.aktienverguetungsquote);
  return {
    wert: Math.min(0.25, proJahr * 3),
    notiz: `Gemessen: Die Aktienzahl stieg zuletzt um ${pz(proJahr)} % pro Jahr, hier über drei Jahre fortgeschrieben.`
      + (sbc ? ` Ursache ist meist die Aktienvergütung — sie kostet aktuell ${pz(sbc)} % vom Umsatz und taucht im EBITDA nicht auf.` : ''),
  };
}

function aktienAnnahmen(roh, verwaesserungNoetig) {
  const st = roh.stand;
  return [
    mk('bridge.aktien', 'Aktien, voll verwässert (Diluted Shares)', roh.aktienVerwaessert ?? 0, 'geschaeftsbericht', st,
      { einheit: 'anzahl', gruppe: 'Equity Bridge',
        notiz: roh.aktienAusstehend && roh.aktienVerwaessert && roh.aktienVerwaessert > roh.aktienAusstehend
          ? `Verwässerte Anzahl inkl. Optionen und Wandelanleihen; ausstehend sind ${Math.round(roh.aktienAusstehend / 1e6)} Mio.`
          : 'Verwässerte Anzahl aus dem Jahresabschluss.' }),
    mk('bridge.verwaesserung', 'Künftige Verwässerung (Expected Dilution)',
      verwaesserungAnsatz(roh, verwaesserungNoetig).wert, 'eigene_schaetzung', st,
      { einheit: 'prozent', regel: 'verwaesserung', gruppe: 'Equity Bridge',
        notiz: verwaesserungAnsatz(roh, verwaesserungNoetig).notiz }),
  ];
}

/** Equity Bridge — für alle Verfahren, die über den Enterprise Value gehen. */
function bridgeAnnahmen(roh) {
  const st = roh.stand;
  const verwaesserungNoetig =
    (roh.nettoergebnis ?? 0) < 0 && roh.liquiditaetMonate != null && roh.liquiditaetMonate < 24;

  return [
    mk('bridge.cash', 'Zahlungsmittel (Cash & Equivalents)', roh.cash ?? 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge' }),
    mk('bridge.schulden', 'Finanzschulden (Total Debt)', roh.schulden ?? 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge', notiz: 'Yahoos Gesamtverschuldung enthält bei IFRS-Bilanzierern die Leasingverbindlichkeiten meist bereits.' }),
    mk('bridge.leasing', 'Leasingverbindlichkeiten (Lease Liabilities)', 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge',
        notiz: roh.leasing != null
          ? `Laut Jahresabschluss ${Math.round(roh.leasing / 1e6)} Mio. — bewusst auf 0 vorbelegt, weil sie in den Finanzverbindlichkeiten oben meist schon stecken. Nur eintragen, wenn nachweislich nicht enthalten.`
          : 'Nicht automatisch ermittelbar.' }),
    mk('bridge.minderheiten', 'Minderheitsanteile (Minority Interest)', roh.minderheiten ?? 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge' }),
    mk('bridge.pensionen', 'Pensionsverpflichtungen (Pension Obligations)', 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge', notiz: 'Liefert keine kostenlose Quelle — bei Bedarf aus dem Geschäftsbericht ergänzen.' }),
    mk('bridge.royalty', 'Verkaufte Umsatzbeteiligungen (Royalty Financing)', 0, 'geschaeftsbericht', st,
      { einheit: 'geld', gruppe: 'Equity Bridge',
        notiz: 'Verkauf künftiger Umsatzbeteiligungen gegen Geld im Voraus. Steht selten als Schuld in der Bilanz, ist wirtschaftlich aber genau das — und schmälert die Erlöse der Produkte, die im Modell mit vollem Wert stehen.' }),
    ...aktienAnnahmen(roh, verwaesserungNoetig),
  ];
}

/** Annahmen und Zeilen für ein Verfahren vorbereiten. */
export function annahmenFuer(verfahren, roh, extras = {}) {
  const st = roh.stand;
  const kk = kapitalkosten(roh);
  const peers = roh.peerGruppe;
  const annahmen = [];
  const zeilen = [];

  if (verfahren === 'dcf') {
    const wachstum = roh.schaetzung?.wachstum ?? roh.umsatzwachstum ?? 0;
    const ausSchaetzung = roh.schaetzung?.wachstum != null;
    annahmen.push(
      mk('dcf.umsatz', 'Umsatz, letzte 12 Monate (Revenue TTM)', roh.umsatz ?? 0, 'geschaeftsbericht', st, { einheit: 'geld', gruppe: 'Prognose' }),
      mk('dcf.wachstum', 'Umsatzwachstum Jahr 1 (Revenue Growth)', wachstum, ausSchaetzung ? 'analystenkonsens' : 'eigene_schaetzung', st,
        { einheit: 'prozent', gruppe: 'Prognose',
          notiz: ausSchaetzung
            ? `Konsens von ${roh.schaetzung.analysten ?? '—'} Analysten für ${roh.schaetzung.jahr1?.endet?.slice(0, 4) ?? 'das nächste Jahr'}. Danach schmilzt das Wachstum bis zum Ende des Prognosezeitraums auf die ewige Rate ab.`
            : 'Fortgeschrieben aus dem zuletzt gemessenen Jahreswachstum; schmilzt über den Prognosezeitraum auf die ewige Rate ab.' }),
      mk('dcf.marge', 'Operative Marge (Operating Margin)', roh.operativeMarge ?? 0, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'marge', gruppe: 'Prognose',
          notiz: 'Vorbelegt mit der aktuellen Marge — sie ist die heutige Ertragskraft. ' + jahresNotiz(roh, 'marge') }),
      mk('dcf.steuerquote', 'Steuerquote (Tax Rate)', roh.steuerquote ?? VORGABEN.steuerquote, 'geschaeftsbericht', st, { einheit: 'prozent', gruppe: 'Prognose' }),
      mk('dcf.investitionen', 'Investitionen, Anteil vom Umsatz (CapEx)', roh.investitionsquote ?? 0, 'geschaeftsbericht', st,
        { einheit: 'prozent', gruppe: 'Prognose',
          notiz: 'Was die Firma jährlich in Anlagen und Ausrüstung steckt, gemessen am Umsatz. Dieses Geld fließt ab. '
            + jahresNotiz(roh, 'investitionen') }),
      // Nur zusammen mit den Investitionen ansetzen: fehlt die Zeitreihe, fehlen
      // beide Werte — dann darf nicht die eine Seite ohne die andere wirken.
      mk('dcf.abschreibungen', 'Abschreibungen, Anteil vom Umsatz (D&A)',
        roh.investitionsquote != null ? roh.abschreibungsquote ?? 0 : 0, 'geschaeftsbericht', st,
        { einheit: 'prozent', gruppe: 'Prognose',
          notiz: 'Der Wertverlust von Maschinen und Gebäuden mindert den Gewinn, kostet aber kein Geld. Deshalb wird er in der Zahlungsstrom-Rechnung wieder hinzugerechnet. '
            + jahresNotiz(roh, 'abschreibungen') }),
      mk('dcf.workingCapital', 'Gebundenes Umlaufvermögen (Working Capital)', roh.workingCapitalQuote ?? 0, 'eigene_schaetzung', st, { einheit: 'prozent', gruppe: 'Prognose' }),
      mk('dcf.kapitalkosten', 'Kapitalkosten (WACC)', kk.wert, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'kapitalkosten', gruppe: 'Abzinsung', notiz: kk.notiz }),
      mk('dcf.ewigesWachstum', 'Ewiges Wachstum (Terminal Growth)', VORGABEN.ewigesWachstum, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'ewigesWachstum', gruppe: 'Abzinsung',
          notiz: 'Wachstum nach dem Prognosezeitraum — dauerhaft kann kein Unternehmen schneller wachsen als die Wirtschaft.' }),
      mk('dcf.jahre', 'Prognosezeitraum (Forecast Period)', VORGABEN.prognoseJahre, 'eigene_schaetzung', st, { einheit: 'jahre', gruppe: 'Abzinsung' }),
      ...bridgeAnnahmen(roh),
    );
  } else if (verfahren === 'multiples') {
    const basis = extras.basis ?? (zahl(roh.ebitda) > 0 ? 'ebitda' : 'umsatz');
    const aufEquity = basis === 'gewinn' || basis === 'buchwert';
    const felder = {
      ebitda: { label: 'EBITDA', wert: roh.ebitda, multiple: 'EV/EBITDA', reihe: peers?.evEbitda,
        info: 'Operatives Ergebnis vor Zinsen, Steuern und Abschreibungen — was das Kerngeschäft erwirtschaftet.' },
      umsatz: { label: 'Umsatz, letzte 12 Monate (Revenue TTM)', wert: roh.umsatz, multiple: 'EV/Revenue', reihe: peers?.evUmsatz,
        info: 'Umsatz der letzten zwölf Monate (trailing twelve months).' },
      umsatzErwartet: { label: 'Umsatz nächstes Jahr, erwartet (Forward Revenue)', wert: roh.umsatzErwartet, multiple: 'EV/Revenue (Forward)', reihe: peers?.evUmsatzErwartet,
        info: 'Der für das nächste Geschäftsjahr erwartete Umsatz. Bei wachsenden Firmen die ehrlichere Basis — der heutige Umsatz bildet das Geschäft von morgen nicht ab.' },
      gewinn: { label: 'Nettogewinn (Net Income)', wert: roh.nettoergebnis, multiple: 'P/E (KGV)', reihe: peers?.kgv,
        info: 'Nettogewinn nach Steuern — was für die Aktionäre übrig bleibt.' },
      buchwert: { label: 'Eigenkapital, Buchwert (Book Value)', wert: roh.eigenkapital, multiple: 'P/B (KBV)', reihe: peers?.kbv,
        info: 'Eigenkapital laut Bilanz — Vermögen minus Schulden.' },
    }[basis];
    const reihe = felder.reihe ?? [];

    // Wo in der Bandbreite der Gruppe gerechnet wird: in der Mitte, solange die
    // Kennzahlen dem Branchenschnitt entsprechen — darüber oder darunter, wenn
    // der Vergleich das hergibt. Ohne diese Anpassung bekäme jede Firma das
    // Durchschnitts-Vielfache, auch die, die in jedem Punkt besser dasteht.
    const pz = peers?.perzentile ?? null;
    const stelle = pz?.base ?? 0.5;
    const multipleWert = reihe.length ? perzentil(reihe, stelle) : 0;
    const stellenText = Math.abs(stelle - 0.5) < 0.02
      ? 'Mitte der Gruppe'
      : `${Math.round(stelle * 100)}. Perzentil der Gruppe`;

    annahmen.push(
      mk('mult.kennzahl', felder.label, felder.wert ?? 0, 'geschaeftsbericht', st, { einheit: 'geld', gruppe: 'Vergleich', notiz: felder.info }),
      mk('mult.multiple', `${felder.multiple} (${stellenText})`, multipleWert ?? 0, 'peer_gruppe', st,
        { einheit: 'faktor', gruppe: 'Vergleich', peers: reihe, perzentile: pz ?? undefined,
          notiz: reihe.length
            ? `Aus ${reihe.length} Wettbewerbern der Branche ${peers?.branche ?? '—'} (${(peers?.namen ?? []).slice(0, 8).join(', ')}). Gerechnet wird am ${stellenText} — welche Stelle das ist, entscheidet der Kennzahlen-Vergleich weiter unten. Pessimistisch und optimistisch liegen 25 Perzentilpunkte darunter bzw. darüber.`
            : 'Keine Vergleichsgruppe gefunden.' }),
      // Kein Eingabefeld — steuert nur, ob die Equity Bridge läuft.
      { id: 'mult.aufEquity', label: 'Bezugsgröße', wert: aufEquity ? 1 : 0, quelle: 'geschaeftsbericht', stand: st, herkunft: 'auto', versteckt: true },
      ...(aufEquity ? aktienAnnahmen(roh, false) : bridgeAnnahmen(roh)),
    );
  } else if (verfahren === 'residual') {
    annahmen.push(
      mk('res.eigenkapital', 'Eigenkapital, Buchwert (Book Value)', roh.eigenkapital ?? 0, 'geschaeftsbericht', st, { einheit: 'geld', gruppe: 'Ertragskraft' }),
      mk('res.roe', 'Eigenkapitalrendite (Return on Equity)', roh.roe ?? 0, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'rendite', gruppe: 'Ertragskraft', notiz: 'Vorbelegt mit der aktuellen Rendite — für die Bewertung zählt die nachhaltig erreichbare.' }),
      mk('res.eigenkapitalkosten', 'Eigenkapitalkosten (Cost of Equity)', kk.wert, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'kapitalkosten', gruppe: 'Ertragskraft', notiz: kk.notiz }),
      mk('res.wachstum', 'Nachhaltiges Wachstum (Sustainable Growth)', VORGABEN.ewigesWachstum, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'ewigesWachstum', gruppe: 'Ertragskraft' }),
      ...aktienAnnahmen(roh, false),
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
        mk(`zeile.${id}.spitzenumsatz`, `${name} — Spitzenumsatz (Peak Sales)`, 0, 'eigene_schaetzung', st,
          { einheit: 'geld', gruppe: name, notiz: 'Keine kostenlose Quelle liefert Spitzenumsätze — bitte selbst setzen.' }),
        mk(`zeile.${id}.pos`, `${name} — Erfolgswahrscheinlichkeit (Probability of Success)`, posFuer(phase), 'eigene_schaetzung', st,
          { einheit: 'prozent', regel: 'erfolgswahrscheinlichkeit', bernoulli: phase !== 'zugelassen', gruppe: name,
            notiz: `Tabellenwert für ${POS_PHASEN.find((p) => p.id === phase)?.label ?? phase}.` }),
        mk(`zeile.${id}.multiple`, `${name} — Bewertungsfaktor (Sales Multiple)`, RNPV_MULTIPLE.patentgeschuetzt, 'eigene_schaetzung', st,
          { einheit: 'faktor', gruppe: name, notiz: `Multiple auf den Spitzenumsatz. ${RNPV_MULTIPLE.patentgeschuetzt} für patentgeschützte, ${RNPV_MULTIPLE.reif} für reife Produkte.` }),
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
    annahmen.push(...bridgeAnnahmen(roh));
  } else if (verfahren === 'sotp') {
    annahmen.push(
      mk('sotp.konglomeratsabschlag', 'Konglomeratsabschlag (Conglomerate Discount)', VORGABEN.konglomeratsabschlag, 'eigene_schaetzung', st,
        { einheit: 'prozent', regel: 'konglomeratsabschlag', gruppe: 'Segmente',
          notiz: 'Bildet ab, dass die Segmente voneinander abhängen und nicht einzeln verkäuflich sind.' }),
    );
    zeilen.push({ id: 's1', name: 'Segment 1', basis: 'umsatz', begruendung: '' });
    annahmen.push(
      mk('zeile.s1.kennzahl', 'Segment 1 — Umsatz', roh.umsatz ?? 0, 'geschaeftsbericht', st, { einheit: 'geld', gruppe: 'Segment 1' }),
      mk('zeile.s1.multiple', 'Segment 1 — Multiple', median(peers?.evUmsatz) ?? 0, 'peer_gruppe', st,
        { einheit: 'faktor', gruppe: 'Segment 1', peers: peers?.evUmsatz ?? [] }),
      ...bridgeAnnahmen(roh),
    );
  }

  return { annahmen, zeilen };
}

/** clinicaltrials-Phasenangabe auf die Tabelle abbilden. */
function phaseAusStudie(phases) {
  const p = (phases ?? []).join(' ').toUpperCase();
  if (p.includes('PHASE4')) return 'zugelassen';
  if (p.includes('PHASE3')) return 'phase3';
  if (p.includes('PHASE2')) return 'phase2';
  if (p.includes('EARLY_PHASE1')) return 'praeklinisch';
  if (p.includes('PHASE1')) return 'phase1';
  return 'phase2';
}

function posFuer(phase) {
  return POS_PHASEN.find((p) => p.id === phase)?.pos ?? 0.3;
}

/** Komplettes Modell für ein Verfahren. */
export function baueModell({ symbol, name, kurs, kursStand, verfahren, roh, extras, heute }) {
  const { annahmen, zeilen } = annahmenFuer(verfahren, roh, extras);
  return {
    symbol,
    name,
    verfahren,
    basis: extras?.basis ?? null,
    waehrung: roh.waehrung,
    kurs,
    kursStand: isoTag(kursStand),
    stand: isoTag(heute ?? new Date()),
    annahmen,
    zeilen,
  };
}
