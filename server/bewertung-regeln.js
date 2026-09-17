// Regeln und Voreinstellungen der Bewertung — ALLE Zahlen des Bewertungsmodells
// stehen in dieser Datei. `bewertung.js` rechnet nur und enthält selbst keine
// einzige Konstante; so lässt sich in sechs Monaten nachvollziehen, mit welchen
// Vorgaben eine gespeicherte Bewertung entstanden ist.

/** Die fünf Verfahren und wofür sie taugen. */
export const VERFAHREN = {
  dcf: { label: 'DCF', lang: 'Discounted Cash Flow', fuer: 'Reife Unternehmen mit planbaren Zahlungsströmen' },
  multiples: { label: 'Multiples', lang: 'Peer-Vergleich', fuer: 'Wachsende Unternehmen ohne stabilen Free Cashflow' },
  sotp: { label: 'SOTP', lang: 'Sum of the Parts', fuer: 'Plattformen, Konglomerate, Mehrsegmentfirmen' },
  rnpv: { label: 'rNPV', lang: 'Risikoadjustierter Barwert', fuer: 'Biotech und Pharma mit Pipeline' },
  residual: { label: 'Residualgewinn', lang: 'Buchwert- und Ertragsbasis', fuer: 'Banken, Versicherer, Kreditgeber' },
};

// Was ein Verfahren NICHT verwenden darf. Bei einem Kreditgeber laufen
// Veränderungen der Kreditforderungen durch die Cashflow-Rechnung: wer weniger
// neue Kredite vergibt, sieht auf dem Papier großartig aus. Free Cashflow und
// Enterprise Value sind dort keine sinnvollen Kennzahlen.
export const VERBOTE = {
  residual: {
    felder: ['freierCashflow', 'enterpriseValue', 'evUmsatz', 'evEbitda'],
    grund:
      'Bei Kreditgebern laufen Kreditvergaben durch die Cashflow-Rechnung — weniger '
      + 'Neugeschäft sieht dort wie ein Mittelzufluss aus. Enterprise Value und Free '
      + 'Cashflow sind deshalb nicht aussagekräftig.',
  },
  rnpv: {
    felder: ['kgv'],
    grund: 'Ein KGV ist bei Verlustfirmen bedeutungslos.',
    nurWenn: 'verlust',
  },
};

/** Erfolgswahrscheinlichkeit bis zur Zulassung je Entwicklungsphase. */
export const POS_PHASEN = [
  { id: 'praeklinisch', label: 'Präklinisch', pos: 0.06 },
  { id: 'phase1', label: 'Phase 1', pos: 0.12 },
  { id: 'phase2', label: 'Phase 2', pos: 0.30 },
  { id: 'phase3', label: 'Phase 3', pos: 0.55 },
  { id: 'eingereicht', label: 'Zulassungsantrag eingereicht', pos: 0.87 },
  { id: 'zugelassen', label: 'Zugelassen und am Markt', pos: 1.0 },
];

// Zu- und Abschläge je Indikationsgebiet (multiplikativ auf den Phasenwert).
// Die Phasenwerte oben sind Durchschnitte über alle Gebiete und schwanken stark:
// Onkologie liegt deutlich darunter, seltene Erkrankungen darüber.
export const POS_GEBIETE = [
  { id: 'allgemein', label: 'Ohne Zuordnung', faktor: 1.0 },
  { id: 'onkologie', label: 'Onkologie', faktor: 0.65 },
  { id: 'selten', label: 'Seltene Erkrankungen', faktor: 1.3 },
  { id: 'infektion', label: 'Infektionskrankheiten', faktor: 1.1 },
  { id: 'immunologie', label: 'Immunologie und Entzündung', faktor: 0.95 },
  { id: 'neurologie', label: 'Neurologie und Psychiatrie', faktor: 0.6 },
  { id: 'herzkreislauf', label: 'Herz-Kreislauf und Stoffwechsel', faktor: 0.8 },
  { id: 'atemwege', label: 'Atemwege', faktor: 0.9 },
];

/** Bewertungsmultiple auf den Spitzenumsatz (rNPV). */
export const RNPV_MULTIPLE = { patentgeschuetzt: 3.0, reif: 2.0 };

/** Voreinstellungen, die der Nutzer überschreiben kann. */
export const VORGABEN = {
  konglomeratsabschlag: 0.20,
  steuerquote: 0.25,
  ewigesWachstum: 0.02,
  eigenkapitalkosten: 0.09,
  marktrisikopraemie: 0.055,
  risikofreierZins: 0.04,
  prognoseJahre: 10,
  // Mindestabstand der Kapitalkosten zur ewigen Wachstumsrate. Darunter wird
  // der Endwert (FCF / (WACC - g)) zur Fantasiezahl.
  mindestAbstandWacc: 0.03,
  // Ab diesem erwarteten Wachstum wird ein DCF nicht mehr angeboten: der
  // Endwert reagiert dann so stark auf das Abschmelzen, dass das Ergebnis
  // beliebig wird. Solche Firmen bewertet man ueber die Vergleichsgruppe.
  maxWachstumFuerDcf: 0.25,
  // Ab diesem Wachstum wird das Multiple auf den ERWARTETEN Umsatz gerechnet
  // statt auf den heutigen.
  wachstumFuerForward: 0.20,
  monteCarloLaeufe: 10000,
  sensitivitaetSchritt: 0.10,
};

// Szenario-Regelwerk. Die Szenarien entstehen NICHT durch freies Verschieben von
// Zahlen, sondern durch feste Regeln auf den Basisannahmen — nur so sind sie
// symmetrisch und vergleichbar.
//
// `art` beschreibt, wie der Basiswert verändert wird:
//   faktor    — Basiswert × f
//   punkte    — Basiswert + p (für Prozentsätze wie Kapitalkosten)
//   absolut   — fester Wert ersetzt den Basiswert
//   perzentil — Perzentil der hinterlegten Peer-Gruppe
export const SZENARIO_REGELN = {
  management_guidance: {
    label: 'Management-Guidance',
    art: 'faktor',
    worst: 0.45,
    base: 0.65,
    best: 0.90,
    begruendung:
      'Spitzenumsatz-Angaben von Managements stellen empirisch fast immer die obere '
      + 'Kante dar. Der Abschlag korrigiert diese bekannte Verzerrung — er ist keine '
      + 'Pessimismus-Neigung. Deshalb ist er bewusst unsymmetrisch.',
  },
  analystenkonsens: { label: 'Analystenkonsens', art: 'faktor', worst: 0.80, base: 1.0, best: 1.15 },
  eigene_schaetzung: { label: 'Eigene Schätzung', art: 'faktor', worst: 0.70, base: 1.0, best: 1.25 },
  geschaeftsbericht: {
    label: 'Geschäftsbericht',
    art: 'faktor',
    worst: 1.0,
    base: 1.0,
    best: 1.0,
    begruendung:
      'Ist-Zahlen aus dem Abschluss (Cash, Schulden, Aktienanzahl) werden in keinem '
      + 'Szenario skaliert — sie sind gemessen, nicht geschätzt. Wer sie mitverschiebt, '
      + 'rechnet Unsicherheit doppelt.',
  },
  peer_gruppe: {
    label: 'Peer-Gruppe',
    art: 'perzentil',
    worst: 0.25,
    base: 0.50,
    best: 0.75,
    ersatz: { art: 'faktor', worst: 0.75, base: 1.0, best: 1.25 },
    begruendung:
      'Ohne hinterlegte Peer-Gruppe kann kein Perzentil gebildet werden — dann greift '
      + 'ersatzweise eine Spanne von minus 25 bis plus 25 Prozent.',
  },
};

/** Regeln, die an einer bestimmten Annahme hängen statt an ihrer Quelle. */
export const SZENARIO_SONDERREGELN = {
  erfolgswahrscheinlichkeit: { label: 'Erfolgswahrscheinlichkeit', art: 'faktor', worst: 0.7, base: 1.0, best: 1.2, maximum: 0.95 },
  konglomeratsabschlag: { label: 'Konglomeratsabschlag', art: 'absolut', worst: 0.30, base: 0.20, best: 0.10 },
  verwaesserung: { label: 'Künftige Verwässerung', art: 'absolut', worst: 0.12, base: 0.06, best: 0.02 },
  kapitalkosten: { label: 'Kapitalkosten', art: 'punkte', worst: 0.02, base: 0, best: -0.01 },
  // Margen und Renditen verschieben sich in PROZENTPUNKTEN. Prozentual gerechnet
  // wuerde eine 28-Prozent-Marge zwischen 19 und 35 Prozent schwanken — das
  // multipliziert sich im DCF mit Wachstum und Kapitalkosten zu einer Spanne,
  // die keine Aussage mehr traegt.
  marge: { label: 'Operative Marge', art: 'punkte', worst: -0.04, base: 0, best: 0.03 },
  rendite: { label: 'Eigenkapitalrendite', art: 'punkte', worst: -0.03, base: 0, best: 0.02 },
  ewigesWachstum: { label: 'Ewige Wachstumsrate', art: 'absolut', worst: 0.005, base: 0.020, best: 0.025 },
};

/** Auswahlwerte für das Pflichtfeld „Quelle" jeder Annahme. */
export const QUELLEN = Object.keys(SZENARIO_REGELN);

/** Schwellen der automatischen Prüfungen. */
export const SCHWELLEN = {
  annahmeGelbTage: 90,
  annahmeRotTage: 180,
  kursAlterTage: 7,
  konzentrationAnteil: 0.40,
  endwertAnteil: 0.75,
  konsistenzAbweichung: 0.25,
  spitzenumsatzVielfaches: 5,
  liquiditaetMonate: 24,
  maxUeberschreibungen: 3,
  spanneFaktor: 4,
};
