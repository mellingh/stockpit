// Bewertungsrechnung — rein funktional, ohne Seiteneffekte und ohne eigene
// Konstanten. Jede Zahl stammt entweder aus den Annahmen des Nutzers oder aus
// `bewertung-regeln.js`. Dadurch ist eine gespeicherte Bewertung später exakt
// reproduzierbar: gleiche Annahmen + gleiche Regelfassung = gleiches Ergebnis.
//
// Datenmodell (ein „Modell" ist eine Bewertung):
//   { symbol, name, verfahren, waehrung, kurs, kursStand, stand,
//     annahmen: Annahme[],        // FLACHE Liste, id ist der Pfad
//     zeilen:   Zeile[] }         // Segmente (SOTP) bzw. Produkte (rNPV)
//
// Annahme: { id, label, wert, einheit, quelle, stand, regel?, herkunft,
//            peers?, gruppe?, notiz?, bernoulli?, ueberschrieben? }
//
// Die flache Annahmenliste ist Absicht: Sensitivität und Monte Carlo können so
// über ALLE Stellschrauben laufen, ohne die Verfahren zu kennen.

import {
  SZENARIO_REGELN,
  SZENARIO_SONDERREGELN,
  VORGABEN,
} from './bewertung-regeln.js';

// ---------- kleine Helfer ----------

const zahl = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const summe = (arr) => arr.reduce((s, x) => s + (zahl(x) ?? 0), 0);

/** Perzentil einer Zahlenreihe (lineare Interpolation wie Excel QUANTIL). */
export function perzentil(werte, p) {
  const s = werte.filter((v) => zahl(v) != null).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * p;
  const u = Math.floor(pos);
  const rest = pos - u;
  return s[u] + (s[Math.min(u + 1, s.length - 1)] - s[u]) * rest;
}

/** Wertetabelle (id → Zahl) aus einer Annahmenliste. */
export function werteVon(annahmen) {
  const t = {};
  for (const a of annahmen) t[a.id] = zahl(a.wert);
  return t;
}

// ---------- Szenarien ----------

/**
 * Welche Regel gilt für eine Annahme? Erst die Sonderregel (hängt an der
 * Annahme selbst, z. B. Kapitalkosten), sonst die Regel ihrer Quelle.
 */
export function regelFuer(annahme) {
  if (annahme.regel && SZENARIO_SONDERREGELN[annahme.regel]) {
    return { ...SZENARIO_SONDERREGELN[annahme.regel], schluessel: annahme.regel, sonder: true };
  }
  const r = SZENARIO_REGELN[annahme.quelle];
  if (!r) return null;
  return { ...r, schluessel: annahme.quelle, sonder: false };
}

/**
 * Szenariowert einer einzelnen Annahme. `fall` ist 'worst' | 'base' | 'best'.
 * Eine manuelle Überschreibung sticht die Regel — sie wird aber gezählt und in
 * der Ausgabe gekennzeichnet, damit ein handgebautes Szenario nicht wie ein
 * regelbasiertes aussieht.
 */
export function szenarioWert(annahme, fall) {
  const eigen = annahme.ueberschrieben?.[fall];
  if (zahl(eigen) != null) return eigen;

  const basis = zahl(annahme.wert);
  if (basis == null) return null;
  const regel = regelFuer(annahme);
  if (!regel) return basis;

  let art = regel.art;
  let f = regel[fall];

  // Perzentil braucht eine Peer-Gruppe; ohne sie greift die Ersatzregel.
  if (art === 'perzentil') {
    const peers = (annahme.peers ?? []).filter((v) => zahl(v) != null);
    if (peers.length >= 2) return perzentil(peers, f);
    art = regel.ersatz.art;
    f = regel.ersatz[fall];
  }

  let wert;
  if (art === 'faktor') wert = basis * f;
  else if (art === 'punkte') wert = basis + f;
  else if (art === 'absolut') wert = f;
  else wert = basis;

  if (regel.maximum != null) wert = Math.min(wert, regel.maximum);
  return wert;
}

/** Alle Annahmen auf einen Szenariofall abbilden → Wertetabelle. */
export function szenarioWerte(annahmen, fall) {
  const t = {};
  for (const a of annahmen) t[a.id] = szenarioWert(a, fall);
  return t;
}

// ---------- Equity Bridge ----------

/**
 * Enterprise Value → Wert je Aktie. Der häufigste Fehler in selbstgebauten
 * Modellen: Multiples beziehen sich auf den Enterprise Value, gebraucht wird
 * aber der Wert je Aktie.
 *
 * Royalty-Financing steht bewusst als eigener Posten: dabei verkauft ein
 * Unternehmen künftige Umsatzbeteiligungen gegen Geld im Voraus. Das erscheint
 * nicht immer als klassische Schuld, ist wirtschaftlich aber genau das — und es
 * schmälert zusätzlich die Erlöse aus Produkten, die im Modell mit vollem Wert
 * stehen.
 */
export function equityBridge(ev, w) {
  const posten = [
    { id: 'enterpriseValue', label: 'Enterprise Value', betrag: ev, vorzeichen: 1 },
    { id: 'bridge.cash', label: 'Zahlungsmittel und kurzfristige Anlagen', betrag: w['bridge.cash'] ?? 0, vorzeichen: 1 },
    { id: 'bridge.schulden', label: 'Finanzverbindlichkeiten', betrag: w['bridge.schulden'] ?? 0, vorzeichen: -1 },
    { id: 'bridge.leasing', label: 'Leasingverbindlichkeiten', betrag: w['bridge.leasing'] ?? 0, vorzeichen: -1 },
    { id: 'bridge.minderheiten', label: 'Minderheitsanteile', betrag: w['bridge.minderheiten'] ?? 0, vorzeichen: -1 },
    { id: 'bridge.pensionen', label: 'Pensionsverpflichtungen', betrag: w['bridge.pensionen'] ?? 0, vorzeichen: -1 },
    { id: 'bridge.royalty', label: 'Royalty-Financing-Verpflichtungen', betrag: w['bridge.royalty'] ?? 0, vorzeichen: -1 },
  ];
  const equityValue = summe(posten.map((p) => p.vorzeichen * (zahl(p.betrag) ?? 0)));

  const basisAktien = zahl(w['bridge.aktien']) ?? 0;
  const verwaesserung = zahl(w['bridge.verwaesserung']) ?? 0;
  const aktien = basisAktien * (1 + verwaesserung);

  return {
    posten,
    equityValue,
    aktienBasis: basisAktien,
    aktien,
    verwaesserung,
    wertJeAktie: aktien > 0 ? equityValue / aktien : null,
  };
}

// ---------- Die fünf Verfahren ----------

/**
 * DCF, zweistufig: expliziter Prognosezeitraum + Endwert (Gordon Growth).
 * Liefert zwingend den Endwertanteil mit — ein DCF, der fast nur aus dem
 * Endwert besteht, ist eine als Rechnung getarnte Meinung.
 */
export function rechneDcf(w) {
  const jahre = Math.max(1, Math.round(zahl(w['dcf.jahre']) ?? VORGABEN.prognoseJahre));
  const umsatz0 = zahl(w['dcf.umsatz']) ?? 0;
  const wachstum = zahl(w['dcf.wachstum']) ?? 0;
  const marge = zahl(w['dcf.marge']) ?? 0;
  const steuer = zahl(w['dcf.steuerquote']) ?? 0;
  const investitionen = zahl(w['dcf.investitionen']) ?? 0; // Anteil vom Umsatz
  const workingCapital = zahl(w['dcf.workingCapital']) ?? 0; // Anteil vom Umsatzzuwachs
  const g = zahl(w['dcf.ewigesWachstum']) ?? 0;

  // Kapitalkosten dürfen dem ewigen Wachstum nicht beliebig nahe kommen: der
  // Endwert ist FCF/(WACC − g), bei einem Abstand von 1 Prozentpunkt also das
  // Hundertfache. Im Best Case (WACC −1 Punkt, g 2,5 %) entstand so ein Wert,
  // der das Zehnfache des Base Case betrug — keine Bewertung, ein Rechenartefakt.
  const waccRoh = zahl(w['dcf.kapitalkosten']) ?? 0;
  const wacc = Math.max(waccRoh, g + VORGABEN.mindestAbstandWacc);
  const waccGeklemmt = wacc > waccRoh;

  // Wachstum schmilzt linear auf die ewige Rate ab („fade to terminal growth").
  // Ohne das wächst eine Firma zehn Jahre lang mit ihrem aktuellen Tempo —
  // bei NVIDIA wären das 106 % jährlich, was den Endwert ins Absurde treibt.
  const wachstumImJahr = (j) =>
    jahre <= 1 ? wachstum : wachstum + (g - wachstum) * ((j - 1) / (jahre - 1));

  const jahresreihe = [];
  let umsatz = umsatz0;
  let barwerte = 0;
  for (let j = 1; j <= jahre; j++) {
    const vorher = umsatz;
    const wj = wachstumImJahr(j);
    umsatz = umsatz * (1 + wj);
    const ebit = umsatz * marge;
    const nopat = ebit * (1 - steuer);
    const capex = umsatz * investitionen;
    const wcVeraenderung = (umsatz - vorher) * workingCapital;
    const fcf = nopat - capex - wcVeraenderung;
    const diskont = Math.pow(1 + wacc, j);
    const barwert = fcf / diskont;
    barwerte += barwert;
    jahresreihe.push({ jahr: j, umsatz, ebit, fcf, barwert, wachstum: wj });
  }

  // Endwert nach Gordon Growth. Bei g >= wacc ist die Formel nicht definiert —
  // dann gibt es keinen Endwert statt einer Fantasiezahl.
  const letzter = jahresreihe[jahresreihe.length - 1];
  const fcfEwig = letzter.fcf * (1 + g);
  const endwertNominal = wacc > g ? fcfEwig / (wacc - g) : null;
  const endwert = endwertNominal == null ? null : endwertNominal / Math.pow(1 + wacc, jahre);

  const enterpriseValue = endwert == null ? barwerte : barwerte + endwert;
  return {
    enterpriseValue,
    jahresreihe,
    barwertExplizit: barwerte,
    endwert,
    endwertUndefiniert: endwert == null,
    endwertAnteil: endwert != null && enterpriseValue > 0 ? endwert / enterpriseValue : null,
    wacc,
    waccGeklemmt,
    wachstumStart: wachstumImJahr(1),
    wachstumEnde: wachstumImJahr(jahre),
    beitraege: [
      { id: 'dcf.explizit', label: 'Prognosezeitraum (' + jahre + ' Jahre)', wert: barwerte },
      { id: 'dcf.endwert', label: 'Endwert', wert: endwert ?? 0 },
    ],
  };
}

/**
 * Peer-Multiples: Kennzahl × Multiple.
 *
 * Zwei Spielarten, weil nicht jedes Multiple auf denselben Wert führt:
 *  - auf den Enterprise Value (EV/Umsatz, EV/EBITDA) — danach läuft die Equity
 *    Bridge, die Schulden abzieht und Cash addiert;
 *  - direkt auf das Eigenkapital (KGV auf den Gewinn, KBV auf den Buchwert) —
 *    dort ist der Wert schon der Marktwert des Eigenkapitals, eine Bridge würde
 *    Schulden ein zweites Mal abziehen. Für Banken ist das die einzig
 *    zulässige Variante, weil es dort keinen sinnvollen Enterprise Value gibt.
 */
export function rechneMultiples(w) {
  const kennzahl = zahl(w['mult.kennzahl']) ?? 0;
  const multiple = zahl(w['mult.multiple']) ?? 0;
  const aufEquity = (zahl(w['mult.aufEquity']) ?? 0) === 1;
  const wert = kennzahl * multiple;
  return {
    aufEquity,
    kennzahl,
    multiple,
    ...(aufEquity ? { equityValue: wert } : { enterpriseValue: wert }),
    beitraege: [{ id: 'mult.basis', label: 'Bewertete Kennzahl × Multiple', wert }],
  };
}

/**
 * Sum of the Parts. Der Konglomeratsabschlag bildet ab, dass die Segmente
 * voneinander abhängen und nicht einzeln verkäuflich sind.
 */
export function rechneSotp(w, zeilen) {
  const segmente = zeilen.map((z) => {
    const kennzahl = zahl(w['zeile.' + z.id + '.kennzahl']) ?? 0;
    const multiple = zahl(w['zeile.' + z.id + '.multiple']) ?? 0;
    return { ...z, kennzahl, multiple, wert: kennzahl * multiple };
  });
  const brutto = summe(segmente.map((s) => s.wert));
  const abschlag = zahl(w['sotp.konglomeratsabschlag']) ?? 0;
  return {
    enterpriseValue: brutto * (1 - abschlag),
    brutto,
    abschlag,
    segmente,
    beitraege: segmente.map((s) => ({ id: 'zeile.' + s.id, label: s.name, wert: s.wert })),
  };
}

/**
 * rNPV: je Medikament und Indikation eine Zeile.
 *   Wert = Spitzenumsatz × Erfolgswahrscheinlichkeit × Bewertungsmultiple
 *
 * Erfolgswahrscheinlichkeit und Multiple sind bewusst ZWEI getrennte Annahmen —
 * sie in einer Zahl zu vermischen macht das Ergebnis uninterpretierbar.
 *
 * Überschneidung: Indikationen adressieren manchmal dieselben Patienten
 * (idiopathische Lungenfibrose ist eine Untergruppe der progredienten
 * Lungenfibrose). Ohne Kürzung zählt das Modell Umsätze doppelt.
 */
export function rechneRnpv(w, zeilen) {
  const produkte = zeilen.map((z) => {
    const spitzenumsatz = zahl(w['zeile.' + z.id + '.spitzenumsatz']) ?? 0;
    const pos = zahl(w['zeile.' + z.id + '.pos']) ?? 0;
    const multiple = zahl(w['zeile.' + z.id + '.multiple']) ?? 0;
    const anteil = z.ueberschneidungPct ? 1 - z.ueberschneidungPct : 1;
    const bereinigt = spitzenumsatz * anteil;
    return {
      ...z,
      spitzenumsatz,
      spitzenumsatzBereinigt: bereinigt,
      pos,
      multiple,
      wert: bereinigt * pos * multiple,
    };
  });
  return {
    enterpriseValue: summe(produkte.map((p) => p.wert)),
    produkte,
    beitraege: produkte.map((p) => ({
      id: 'zeile.' + p.id,
      label: p.indikation ? p.name + ' — ' + p.indikation : p.name,
      wert: p.wert,
    })),
  };
}

/**
 * Residualgewinn für Finanzunternehmen. Bewertet wird über Buchwert und
 * Eigenkapitalrendite statt über Cashflows:
 *
 *   faires Kurs-Buchwert-Verhältnis = (ROE − g) / (Eigenkapitalkosten − g)
 *   Equity Value = Eigenkapital × faires KBV
 *
 * Ergebnis ist direkt der Equity Value — einen Enterprise Value gibt es hier
 * nicht, weil Schulden bei einem Kreditgeber Teil des Geschäfts sind.
 */
export function rechneResidual(w) {
  const eigenkapital = zahl(w['res.eigenkapital']) ?? 0;
  const roe = zahl(w['res.roe']) ?? 0;
  const coe = zahl(w['res.eigenkapitalkosten']) ?? 0;
  const g = zahl(w['res.wachstum']) ?? 0;

  const fairesKbv = coe > g ? (roe - g) / (coe - g) : null;
  const equityValue = fairesKbv == null ? null : eigenkapital * fairesKbv;
  return {
    equityValue,
    fairesKbv,
    eigenkapital,
    roe,
    unbestimmt: fairesKbv == null,
    beitraege: [{ id: 'res.equity', label: 'Eigenkapital × faires KBV', wert: equityValue ?? 0 }],
  };
}

// ---------- Gesamtrechnung ----------

/**
 * Rechnet ein Modell für eine Wertetabelle durch. Reine Funktion: gleiche
 * Eingabe → gleiches Ergebnis, kein Zugriff auf Uhrzeit, Datei oder Netz.
 */
export function rechne(modell, w) {
  const zeilen = modell.zeilen ?? [];
  let kern;
  let equity;

  // Multiples auf das Eigenkapital (KGV, KBV) führen direkt zum Equity Value —
  // dieselbe Behandlung wie beim Residualgewinn, nur mit anderer Herleitung.
  const direktAufEquity =
    modell.verfahren === 'residual'
    || (modell.verfahren === 'multiples' && (zahl(w['mult.aufEquity']) ?? 0) === 1);

  if (direktAufEquity) {
    kern = modell.verfahren === 'residual' ? rechneResidual(w) : rechneMultiples(w);
    // Hier gibt es keine Equity Bridge über den Enterprise Value — der Wert IST
    // bereits Eigenkapital. Die Verwässerung gilt trotzdem.
    const basisAktien = zahl(w['bridge.aktien']) ?? 0;
    const verwaesserung = zahl(w['bridge.verwaesserung']) ?? 0;
    const aktien = basisAktien * (1 + verwaesserung);
    const herleitung = modell.verfahren === 'residual'
      ? 'Equity Value (Eigenkapital × faires KBV)'
      : 'Equity Value (Kennzahl × Multiple)';
    equity = {
      posten: [{ id: 'res.equity', label: herleitung, betrag: kern.equityValue, vorzeichen: 1 }],
      equityValue: kern.equityValue,
      aktienBasis: basisAktien,
      aktien,
      verwaesserung,
      wertJeAktie: aktien > 0 && kern.equityValue != null ? kern.equityValue / aktien : null,
    };
  } else {
    if (modell.verfahren === 'dcf') kern = rechneDcf(w);
    else if (modell.verfahren === 'multiples') kern = rechneMultiples(w);
    else if (modell.verfahren === 'sotp') kern = rechneSotp(w, zeilen);
    else if (modell.verfahren === 'rnpv') kern = rechneRnpv(w, zeilen);
    else throw new Error('Unbekanntes Verfahren: ' + modell.verfahren);
    equity = equityBridge(kern.enterpriseValue, w);
  }

  const beitraege = (kern.beitraege ?? []).filter((b) => zahl(b.wert) != null && b.wert !== 0);
  const bruttoBeitrag = summe(beitraege.map((b) => Math.abs(b.wert)));
  const mitAnteil = beitraege
    .map((b) => ({ ...b, anteil: bruttoBeitrag > 0 ? Math.abs(b.wert) / bruttoBeitrag : null }))
    .sort((a, b) => Math.abs(b.wert) - Math.abs(a.wert));

  return { verfahren: modell.verfahren, kern, equity, beitraege: mitAnteil, wertJeAktie: equity.wertJeAktie };
}

/** Die drei Szenarien nach Regelwerk. */
export function szenarien(modell) {
  const out = {};
  for (const fall of ['worst', 'base', 'best']) {
    out[fall] = rechne(modell, szenarioWerte(modell.annahmen, fall));
  }
  return out;
}
