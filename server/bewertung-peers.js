// Vergleichsgruppe über den TradingView-Scanner (denselben, der schon die
// Earnings liefert). Er kann nach BRANCHE filtern und gibt Enterprise Value,
// Umsatz und EBITDA mit — daraus entstehen echte Peer-Multiples.
//
// Warum nicht Yahoo: `recommendationsBySymbol` liefert „wer das auch angesehen
// hat", nicht Branchen-Nachbarn — für Caris Life Sciences kamen ein
// Etikettenhersteller und ein Autozulieferer zurück, für SAP Allianz und BASF.
// Als Bewertungsgrundlage ist das unbrauchbar.
//
// Ohne Peer-Gruppe rechnet ein Multiple-Modell mit dem Marktmultiple der Aktie
// selbst und gibt näherungsweise den heutigen Kurs zurück — ein Zirkelschluss.
// Deshalb ist dieses Modul die Voraussetzung dafür, dass Multiples etwas aussagen.

import { cached, HOUR } from './cache.js';
import { QUALITAET } from './bewertung-regeln.js';

// Wie weit darf die Vergleichsgruppe in der Groesse abweichen? Vierfach nach
// oben und unten — darueber vergleicht man Nebenwerte mit Weltkonzernen.
const VORGABEN_GROESSE = { faktor: 4 };

// Wie stark zaehlt ein Wachstumsunterschied gegenueber einem Groessenunterschied
// bei der Auswahl? Gleich stark. Ein Vielfaches entsteht aus Groesse UND
// Wachstumsaussicht — Viatris (schrumpfend) ist fuer Insmed (+186 %) kein
// Massstab, auch wenn die Marktkapitalisierung passt.
const GEWICHT_WACHSTUM = 1;

// Ein Wettbewerber, fuer den die Quelle kein Wachstum kennt, ist nicht
// „gleich schnell" — genau so wirkte er aber, solange Unbekanntes als Abstand 0
// zaehlte: Caris (+85 %) bekam dadurch reine Forschungsfirmen ohne Umsatz in
// die Gruppe. Unbekanntes kostet deshalb einen mittleren Abstand.
const ABSTAND_OHNE_WACHSTUM = 0.35;

/** Ein Vielfaches ist brauchbar, wenn es positiv und nicht absurd ist. */
const brauchbaresVielfaches = (v) => typeof v === 'number' && v > 0 && v < 200;

/**
 * Sammelkategorien der Quelle: Branchen, in die TradingView alles einsortiert,
 * was nirgends sonst passt. Sie taugen NICHT als Vergleichsgruppe — in
 * „Miscellaneous Commercial Services" stehen Klarna, PayPal, Block, ein
 * Gefaengnisbetreiber und zwei Bildungskonzerne nebeneinander.
 *
 * Exakte Namen statt eines Musters auf „diversified/other": „Chemicals: Major
 * Diversified" (Dow, DuPont) und „Industrial Conglomerates" sind echte,
 * brauchbare Branchen und wurden von der alten Regex faelschlich verdaechtigt.
 */
const SAMMELKATEGORIEN = new Set([
  'Miscellaneous',
  'Miscellaneous Commercial Services',
  'Miscellaneous Manufacturing',
  'Other Consumer Services',
  'Other Consumer Specialties',
  'Other Metals/Minerals',
  'Other Transportation',
]);
// Die „Other …"-Kategorien gehören dazu, obwohl sie nach einer Sparte klingen:
// nachgeprüft an Uber. In „Other Transportation" stehen neben Uber vor allem
// lateinamerikanische Flughafenbetreiber (PAC, ASR, OMAB) und ein
// Lebensmittelgroßhändler — daraus wurde ein Wert von 28,84 USD. Über Yahoos
// Einordnung („Software - Application") kommen Plattformen wie ServiceNow und
// Salesforce in die Gruppe, und das Ergebnis liegt bei 51,55 USD. Für einen
// Marktplatz ist die zweite Gruppe die ehrlichere Messlatte.

/**
 * Yahoo-Branche → TradingView-Branche. Wird NUR gebraucht, wenn TradingView den
 * Wert in einer Sammelkategorie fuehrt: dann liefert Yahoos Einordnung die
 * bessere Branche, und in der gesuchten TradingView-Kategorie stehen die
 * richtigen Wettbewerber.
 *
 * Beispiel Klarna: TradingView sagt „Miscellaneous Commercial Services"
 * (Nachbarn: Laureate Education, TAL Education, ADT, GEO Group), Yahoo sagt
 * „Credit Services" — in TradingViews „Finance/Rental/Leasing" stehen Affirm,
 * SoFi, Upstart, Oportun und Ally. Das ist die echte Vergleichsgruppe.
 */
const TV_BRANCHE_AUS_YAHOO = {
  // Finanzen
  'credit services': 'Finance/Rental/Leasing',
  'mortgage finance': 'Finance/Rental/Leasing',
  'financial conglomerates': 'Financial Conglomerates',
  'banks - regional': 'Regional Banks',
  'banks - diversified': 'Major Banks',
  'capital markets': 'Investment Banks/Brokers',
  'financial data & stock exchanges': 'Investment Banks/Brokers',
  'asset management': 'Investment Managers',
  'insurance - property & casualty': 'Property/Casualty Insurance',
  'insurance - life': 'Life/Health Insurance',
  'insurance - diversified': 'Multi-Line Insurance',
  'insurance - reinsurance': 'Multi-Line Insurance',
  'insurance - specialty': 'Specialty Insurance',
  'insurance brokers': 'Insurance Brokers/Services',
  // Technologie
  'software - application': 'Packaged Software',
  'software - infrastructure': 'Packaged Software',
  'information technology services': 'Information Technology Services',
  'internet content & information': 'Internet Software/Services',
  semiconductors: 'Semiconductors',
  'semiconductor equipment & materials': 'Electronic Production Equipment',
  'consumer electronics': 'Electronics/Appliances',
  'communication equipment': 'Telecommunications Equipment',
  'computer hardware': 'Computer Processing Hardware',
  // Gesundheit
  biotechnology: 'Biotechnology',
  'drug manufacturers - general': 'Pharmaceuticals: Major',
  'drug manufacturers - specialty & generic': 'Pharmaceuticals: Major',
  'diagnostics & research': 'Medical Specialties',
  'medical devices': 'Medical Specialties',
  'medical instruments & supplies': 'Medical Specialties',
  'healthcare plans': 'Managed Health Care',
  'medical care facilities': 'Hospital/Nursing Management',
  'health information services': 'Services to the Health Industry',
  // Konsum, Industrie, Energie
  'internet retail': 'Internet Retail',
  'specialty retail': 'Specialty Stores',
  restaurants: 'Restaurants',
  'auto manufacturers': 'Motor Vehicles',
  'travel services': 'Hotels/Resorts/Cruise lines',
  'advertising agencies': 'Advertising/Marketing Services',
  'aerospace & defense': 'Aerospace & Defense',
  airlines: 'Airlines',
  'engineering & construction': 'Engineering & Construction',
  'waste management': 'Environmental Services',
  solar: 'Alternative Power Generation',
  'oil & gas e&p': 'Oil & Gas Production',
  'utilities - regulated electric': 'Electric Utilities',
  conglomerates: 'Industrial Conglomerates',
};

/** Yahoo schreibt mal „Banks - Regional", mal „Banks—Regional". */
const brancheSchluessel = (b) =>
  String(b ?? '').toLowerCase().replace(/[\u2014\u2013]/g, '-').replace(/\s+/g, ' ').trim();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

/** Yahoo-Suffix → TradingView-Markt (Gegenstück zur Map in kalender-extra.js). */
const MARKT_AUS_SUFFIX = {
  DE: 'germany', F: 'germany', L: 'uk', T: 'japan', TO: 'canada', V: 'canada',
  PA: 'france', MI: 'italy', MC: 'spain', AS: 'netherlands', SW: 'switzerland',
  ST: 'sweden', OL: 'norway', CO: 'denmark', HE: 'finland', VI: 'austria',
  BR: 'belgium', LS: 'portugal', HK: 'hongkong', AX: 'australia', NZ: 'newzealand',
};

export function marktFuer(symbol) {
  const suffix = symbol.includes('.') ? symbol.split('.').pop().toUpperCase() : null;
  return suffix ? (MARKT_AUS_SUFFIX[suffix] ?? null) : 'america';
}

/** Reines Tickersymbol ohne Börsensuffix — so kennt der Scanner es. */
const nacktesSymbol = (symbol) => symbol.split('.')[0].toUpperCase();

async function scan(markt, body) {
  const res = await fetch(`https://scanner.tradingview.com/${markt}/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.tradingview.com', 'user-agent': UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`TradingView-Scanner: HTTP ${res.status}`);
  return (await res.json()).data ?? [];
}

const SPALTEN = ['name', 'description', 'sector', 'industry', 'market_cap_basic', 'enterprise_value_current', 'total_revenue_ttm', 'ebitda_ttm', 'price_earnings_ttm', 'price_book_fq', 'return_on_equity', 'total_revenue_yoy_growth_ttm', 'revenue_forecast_next_fy', 'close', 'currency', 'typespecs',
  // Kennzahlen für den Qualitätsvergleich — aus derselben Abfrage wie die
  // Vielfachen, damit Zielwert und Gruppe mit demselben Lineal gemessen werden.
  'operating_margin', 'free_cash_flow_margin_ttm', 'debt_to_equity'];

/** Prozentangaben der Quelle (8,84) in Anteile umrechnen (0,0884). */
const anteil = (v) => (typeof v === 'number' && Number.isFinite(v) ? v / 100 : null);

function zeileZuObjekt(row) {
  const [name, beschreibung, sektor, branche, marktkap, ev, umsatz, ebitda, kgv, kbv, roe, wachstum, umsatzErwartet, kurs, waehrung, arten,
    opMarge, fcfMarge, schuldenquote] = row.d ?? [];
  return {
    operativeMarge: anteil(opMarge),
    fcfMarge: anteil(fcfMarge),
    eigenkapitalrendite: anteil(roe),
    schuldenquote: typeof schuldenquote === 'number' ? schuldenquote : null,
    symbol: String(row.s ?? '').split(':').pop(),
    boerse: String(row.s ?? '').split(':')[0],
    // Vorzugsaktien tragen dieselbe Branche, aber eine eigene Kapitalstruktur
    // (SLMBP neben SLM) — als Vergleichswert sind sie eine Dublette.
    vorzug: Array.isArray(arten) && arten.includes('preferred'),
    name: beschreibung || name, kuerzel: name, sektor, branche, marktkap, ev, umsatz, ebitda, kgv, kbv, roe,
    // Umsatzwachstum in Prozent — macht sichtbar, ob die Gruppe ueberhaupt
    // vergleichbar waechst (Insmed 186 %, die Pharma-Riesen 3 %)
    wachstum: typeof wachstum === 'number' ? wachstum / 100 : null,
    kurs: typeof kurs === 'number' ? kurs : null,
    waehrung: typeof waehrung === 'string' ? waehrung : null,
    umsatzErwartet: typeof umsatzErwartet === 'number' ? umsatzErwartet : null,
    evUmsatz: ev > 0 && umsatz > 0 ? ev / umsatz : null,
    // auf den ERWARTETEN Umsatz — so vergleichen Analysten wachsende Firmen
    evUmsatzErwartet: ev > 0 && umsatzErwartet > 0 ? ev / umsatzErwartet : null,
    evEbitda: ev > 0 && ebitda > 0 ? ev / ebitda : null,
  };
}

/**
 * Peer-Gruppe einer Aktie. Gefiltert wird auf dieselbe Branche und eine
 * ähnliche Größenordnung (ein Zehntel bis Zehnfaches der Marktkapitalisierung)
 * — ein 200-Milliarden-Konzern ist kein Vergleich für einen Nebenwert.
 * OTC-Zweitnotierungen fliegen raus: sie verdoppeln dieselbe Firma
 * (Lonza stand als LZAGY und LZAGF zugleich in der Liste).
 */
export function getPeers(symbol, yahooBranche = null) {
  return cached(`peers:${symbol}`, 6 * HOUR, async () => {
    const markt = marktFuer(symbol);
    if (!markt) return null;
    const ticker = nacktesSymbol(symbol);

    // 1. Branche und Eckdaten des Zielwerts. Ohne Börsenpräfix sucht der
    //    Scanner über alle Börsen des Markts.
    const treffer = await scan(markt, {
      filter: [{ left: 'name', operation: 'equal', right: ticker }],
      columns: SPALTEN,
      range: [0, 5],
    }).catch(() => []);
    const ziel = treffer.map(zeileZuObjekt).find((x) => x.branche) ?? null;
    if (!ziel?.branche) return null;

    // Landet der Wert in einer Sammelkategorie, entscheidet Yahoos Einordnung.
    // Sonst vergleicht sich Klarna mit einem Gefaengnisbetreiber.
    const ersatz = SAMMELKATEGORIEN.has(ziel.branche)
      ? TV_BRANCHE_AUS_YAHOO[brancheSchluessel(yahooBranche)] ?? null
      : null;
    const branche = ersatz ?? ziel.branche;

    // 2. Branchen-Nachbarn — IMMER im US-Markt gesucht, auch für deutsche
    //    Werte. Multiples sind währungsneutral (Zähler und Nenner in derselben
    //    Währung), und an den europäischen Börsen stehen überwiegend
    //    Zweitnotierungen mit lückenhaften Kennzahlen: für SAP kam aus dem
    //    deutschen Markt ein Median EV/Umsatz von 26,9 gegen SAPs eigene 5,7 —
    //    aus dem US-Markt kommen Microsoft, Oracle, Salesforce und 8,2.
    const roh = await scan('america', {
      filter: [
        { left: 'industry', operation: 'equal', right: branche },
        { left: 'market_cap_basic', operation: 'greater', right: 1e8 },
      ],
      columns: SPALTEN,
      sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
      range: [0, 80],
    }).catch(() => []);

    // Zum Vergleich das KÜRZEL nehmen, nicht den Firmennamen — `name` trägt
    // seit der description-Spalte den ausgeschriebenen Namen.
    const zielKuerzel = String(ziel.kuerzel ?? ticker).toUpperCase();
    const gesehen = new Set([ticker]);
    const brauchbar = roh
      .map(zeileZuObjekt)
      .filter((p) => {
        if (gesehen.has(p.symbol)) return false;
        if (p.boerse === 'OTC') return false; // Zweitnotierungen sind Dubletten
        if (p.symbol.includes('/') || p.vorzug) return false; // Vorzugsaktien (ORCL/PD, SLMBP)
        // Die eigene Aktie an einer anderen Börse: SAP.DE fand sich als
        // NYSE:SAP und OTC:SAPGF in der eigenen Vergleichsgruppe wieder.
        if (p.symbol === ticker || p.symbol === zielKuerzel) return false;
        if (p.marktkap == null || p.marktkap <= 0) return false;
        gesehen.add(p.symbol);
        return true;
      });

    // Die ÄHNLICHSTEN nehmen, nicht die größten: nach dem Größenabstand zum
    // Zielwert sortieren. Vorher lieferte „nach Marktkapitalisierung absteigend"
    // für Insmed (27 Mrd) die Riesen AstraZeneca, Novartis und Pfizer — reife
    // Konzerne, deren Umsatzmultiples für ein wachsendes Unternehmen nichts
    // aussagen.
    const groesse = (p) => (ziel.marktkap ? Math.abs(Math.log(p.marktkap / ziel.marktkap)) : 0);

    // Aehnlich gross REICHT NICHT: ein Vielfaches spiegelt auch die
    // Wachstumsaussicht. Viatris (schrumpfend) und Haleon (+3 %) standen in
    // Insmeds Gruppe (+186 %) und zogen das Vielfache auf ein Niveau, das fuer
    // eine wachsende Firma nichts aussagt. Der Abstand zaehlt deshalb Groesse
    // UND Wachstum, beide logarithmisch, damit sie vergleichbar skalieren.
    const wachstumsAbstand = (p) => {
      const a = 1 + (ziel.wachstum ?? 0);
      const b = 1 + (p.wachstum ?? 0);
      if (ziel.wachstum == null) return 0;
      if (p.wachstum == null || a <= 0 || b <= 0) return ABSTAND_OHNE_WACHSTUM;
      return Math.abs(Math.log(b / a));
    };
    const abstand = (p) => groesse(p) + GEWICHT_WACHSTUM * wachstumsAbstand(p);

    // Die Gruppe muss auf DER Kennzahl vergleichbar sein, mit der spaeter
    // gerechnet wird. Sonst besetzen Firmen die Plaetze, die zu dieser Frage
    // gar nichts sagen: In Caris' Gruppe standen sechs Forschungsfirmen ohne
    // Umsatz und ohne operativen Gewinn — verglichen wurde am Ende trotzdem
    // ueber den Umsatz, und zwar mit den zwei Firmen, die zufaellig einen hatten.
    // Welche Kennzahl das ist, entscheidet der Zielwert selbst, in derselben
    // Reihenfolge wie die Verfahrenswahl (bei Finanzwerten zaehlen Gewinn und
    // Buchwert, EV-Vielfache sind dort ohne Aussage).
    const finanzwert = /finance/i.test(ziel.sektor ?? '') || /bank|insurance|finance/i.test(branche);
    const leitkennzahl = (finanzwert ? ['kgv', 'kbv'] : ['evEbitda', 'evUmsatz', 'kgv', 'kbv'])
      .find((feld) => brauchbaresVielfaches(ziel[feld])) ?? null;
    const vergleichbar = leitkennzahl
      ? brauchbar.filter((p) => brauchbaresVielfaches(p[leitkennzahl]))
      : brauchbar;
    // Blieben zu wenige uebrig, ist die strengere Auswahl schlechter als gar
    // keine — dann zaehlt wieder die ganze Branche.
    const pool = vergleichbar.length >= 4 ? vergleichbar : brauchbar;

    const peers = pool
      // Die Groesse bleibt der harte Filter, das Wachstum entscheidet die Reihenfolge
      .filter((p) => groesse(p) <= Math.log(VORGABEN_GROESSE.faktor))
      .sort((a, b) => abstand(a) - abstand(b))
      .slice(0, 10);

    // Zu wenige in enger Spanne? Dann die Spanne weiten, statt gar keine
    // Vergleichsgruppe zu liefern — mit weniger als drei Werten fällt das
    // Verfahren ohnehin aus.
    const ergaenzt = peers.length >= 5
      ? peers
      : pool.sort((a, b) => abstand(a) - abstand(b)).slice(0, 10);

    // Manche Firmen landen bei der Quelle in einer Sammelkategorie — Klarna
    // etwa unter „Miscellaneous Commercial Services" statt bei den
    // Finanzdienstleistern. Die Vergleichsgruppe ist dann schwächer, und das
    // gehört gesagt statt kaschiert.
    const sammelkategorie = SAMMELKATEGORIEN.has(branche);

    return {
      markt, ziel, branche, sektor: ziel.sektor, sammelkategorie, peers: ergaenzt,
      // Wo in der Bandbreite der Gruppe gerechnet wird, entscheiden die
      // Kennzahlen des Werts — nicht pauschal die Mitte.
      qualitaet: qualitaetsVergleich(ziel, ergaenzt),
      // Fuer die Anzeige: „laut Yahoo Credit Services statt Sammelkategorie"
      korrigiert: ersatz ? { von: ziel.branche, nach: ersatz } : null,
    };
  }).catch(() => null);
}

/** Median einer Zahlenreihe. */
function mitte(werte) {
  const s = werte.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Wie steht der Wert gegenüber seiner Gruppe da — und was folgt daraus für das
 * Vielfache, mit dem gerechnet wird?
 *
 * Ergebnis ist bewusst nachvollziehbar: je Kriterium der eigene Wert, der
 * Median der Gruppe und ein Urteil. Die Verschiebung des Perzentils ist gekappt,
 * damit aus einer Einschätzung keine Hebelwirkung wird.
 */
export function qualitaetsVergleich(ziel, peers) {
  if (!ziel || !(peers?.length >= 3)) return null;

  const kriterien = QUALITAET.kriterien.map((k) => {
    const eigen = ziel[k.feld];
    const median = mitte(peers.map((p) => p[k.feld]));
    if (typeof eigen !== 'number' || median == null) {
      return { ...k, wert: typeof eigen === 'number' ? eigen : null, median, punkte: null, urteil: 'unbekannt' };
    }
    const besser = k.richtung === 'hoch' ? eigen > median + k.schwelle : eigen < median - k.schwelle;
    const schlechter = k.richtung === 'hoch' ? eigen < median - k.schwelle : eigen > median + k.schwelle;
    const punkte = besser ? 1 : schlechter ? -1 : 0;
    return { ...k, wert: eigen, median, punkte, urteil: besser ? 'besser' : schlechter ? 'schwaecher' : 'aehnlich' };
  });

  const bewertet = kriterien.filter((k) => k.punkte != null);
  if (bewertet.length < 3) return null; // zu dünne Datenlage für ein Urteil
  const summe = bewertet.reduce((s, k) => s + k.punkte, 0);
  const schnitt = summe / bewertet.length;

  const klemm = (p) => Math.min(QUALITAET.grenzen.max, Math.max(QUALITAET.grenzen.min, p));
  const basis = klemm(0.5 + schnitt * QUALITAET.maxVerschiebung);
  return {
    kriterien,
    punkte: summe,
    geprueft: bewertet.length,
    schnitt,
    perzentile: {
      worst: klemm(basis - QUALITAET.spanne),
      base: basis,
      best: klemm(basis + QUALITAET.spanne),
    },
  };
}

/** Multiples der Peer-Gruppe als Zahlenreihen (für die Perzentil-Regel). */
export function peerMultiples(gruppe) {
  const werte = (feld) => (gruppe?.peers ?? []).map((p) => p[feld]).filter((v) => typeof v === 'number' && v > 0 && v < 200);
  return {
    evUmsatz: werte('evUmsatz'),
    evEbitda: werte('evEbitda'),
    kgv: werte('kgv'),
    kbv: werte('kbv'),
  };
}
