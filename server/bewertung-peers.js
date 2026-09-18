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

// Wie weit darf die Vergleichsgruppe in der Groesse abweichen? Vierfach nach
// oben und unten — darueber vergleicht man Nebenwerte mit Weltkonzernen.
const VORGABEN_GROESSE = { faktor: 4 };

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

const SPALTEN = ['name', 'description', 'sector', 'industry', 'market_cap_basic', 'enterprise_value_current', 'total_revenue_ttm', 'ebitda_ttm', 'price_earnings_ttm', 'price_book_fq', 'return_on_equity', 'total_revenue_yoy_growth_ttm', 'revenue_forecast_next_fy', 'close', 'currency'];

function zeileZuObjekt(row) {
  const [name, beschreibung, sektor, branche, marktkap, ev, umsatz, ebitda, kgv, kbv, roe, wachstum, umsatzErwartet, kurs, waehrung] = row.d ?? [];
  return {
    symbol: String(row.s ?? '').split(':').pop(),
    boerse: String(row.s ?? '').split(':')[0],
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
export function getPeers(symbol) {
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

    // 2. Branchen-Nachbarn — IMMER im US-Markt gesucht, auch für deutsche
    //    Werte. Multiples sind währungsneutral (Zähler und Nenner in derselben
    //    Währung), und an den europäischen Börsen stehen überwiegend
    //    Zweitnotierungen mit lückenhaften Kennzahlen: für SAP kam aus dem
    //    deutschen Markt ein Median EV/Umsatz von 26,9 gegen SAPs eigene 5,7 —
    //    aus dem US-Markt kommen Microsoft, Oracle, Salesforce und 8,2.
    const roh = await scan('america', {
      filter: [
        { left: 'industry', operation: 'equal', right: ziel.branche },
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
        if (p.symbol.includes('/')) return false; // Vorzugsaktien (ORCL/PD)
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
    const abstand = (p) => (ziel.marktkap ? Math.abs(Math.log(p.marktkap / ziel.marktkap)) : 0);
    const peers = brauchbar
      .filter((p) => abstand(p) <= Math.log(VORGABEN_GROESSE.faktor))
      .sort((a, b) => abstand(a) - abstand(b))
      .slice(0, 10);

    // Zu wenige in enger Spanne? Dann die Spanne weiten, statt gar keine
    // Vergleichsgruppe zu liefern — mit weniger als drei Werten fällt das
    // Verfahren ohnehin aus.
    const ergaenzt = peers.length >= 5
      ? peers
      : brauchbar.sort((a, b) => abstand(a) - abstand(b)).slice(0, 10);

    // Manche Firmen landen bei der Quelle in einer Sammelkategorie — Klarna
    // etwa unter „Miscellaneous Commercial Services" statt bei den
    // Finanzdienstleistern. Die Vergleichsgruppe ist dann schwächer, und das
    // gehört gesagt statt kaschiert.
    const sammelkategorie = /miscellaneous|other|diversified/i.test(ziel.branche);

    return { markt, ziel, branche: ziel.branche, sektor: ziel.sektor, sammelkategorie, peers: ergaenzt };
  }).catch(() => null);
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
