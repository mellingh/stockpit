// Earnings-, Feiertags- und IPO-Kalender — kostenlose Quellen ohne Key.
//
// Earnings:   TradingView-Scanner (scanner.tradingview.com/<markt>/scan, POST).
//             Kann nach Markt filtern (america/germany/uk/japan/canada) und
//             liefert für vergangene Termine Ist-EPS + Überraschung, für
//             kommende die EPS-Prognose. Inoffiziell wie Yahoo, kein Key.
// Feiertage:  TradingView-Wirtschaftskalender, Einträge mit indicator
//             "Holidays" — der Horizont der Quelle reicht ca. 4 Wochen voraus.
// IPOs:       api.nasdaq.com/api/ipo/calendar — offizielle Nasdaq-API,
//             deckt US-Börsengänge (Nasdaq + NYSE) ab, braucht nur einen
//             Browser-User-Agent.
import { cached, HOUR } from './cache.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

// Markt-Kürzel (API) → TradingView-Scanner-Markt. Die fünf wichtigsten
// Aktienmärkte, wie mit Micha besprochen — bewusst kurz gehalten.
export const EARNINGS_MAERKTE = {
  us: { scan: 'america', land: 'US' },
  de: { scan: 'germany', land: 'DE' },
  uk: { scan: 'uk', land: 'GB' },
  jp: { scan: 'japan', land: 'JP' },
  ca: { scan: 'canada', land: 'CA' },
};

// TradingView-Ticker → Yahoo-Symbol (für den Klick zur Analyse-Seite)
const YAHOO_SUFFIX = { XETR: '.DE', LSE: '.L', TSE: '.T', TSX: '.TO', TSXV: '.V' };

async function tvScan(scanMarkt, body) {
  const res = await fetch(`https://scanner.tradingview.com/${scanMarkt}/scan`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://www.tradingview.com',
      'user-agent': UA,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`TradingView-Scanner: HTTP ${res.status}`);
  return (await res.json()).data ?? [];
}

const rund = (n) => (n == null ? null : Math.round(n * 100) / 100);

/**
 * Quartalszahlen-Termine eines Markts im Zeitfenster [vonMs, bisMs].
 * Vergangenheit und Zukunft liegen bei TradingView in getrennten Feldern
 * (earnings_release_date / earnings_release_next_date) — beide abfragen
 * und per Symbol zusammenführen.
 */
export function getEarnings(marktKey, vonMs, bisMs) {
  const markt = EARNINGS_MAERKTE[marktKey];
  if (!markt) throw new Error('Unbekannter Markt');
  const tagKey = (ms) => new Date(ms).toISOString().slice(0, 10);
  return cached(`earnings:${marktKey}:${tagKey(vonMs)}:${tagKey(bisMs)}`, HOUR, async () => {
    const von = Math.floor(vonMs / 1000);
    const bis = Math.floor(bisMs / 1000);
    const jetzt = Math.floor(Date.now() / 1000);
    const basisFilter = [{ left: 'is_primary', operation: 'equal', right: true }];
    const abfragen = [];

    if (von <= jetzt) {
      abfragen.push(
        tvScan(markt.scan, {
          filter: [
            ...basisFilter,
            { left: 'earnings_release_date', operation: 'in_range', right: [von, Math.min(bis, jetzt)] },
          ],
          columns: [
            'name', 'description', 'earnings_release_date',
            'earnings_per_share_fq', 'earnings_per_share_forecast_fq',
            'eps_surprise_percent_fq', 'market_cap_basic', 'exchange',
          ],
          sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
          range: [0, 150],
        }).then((rows) =>
          rows.map(({ d }) => ({
            ticker: d[0], name: d[1], zeit: new Date(d[2] * 1000).toISOString(),
            epsIst: rund(d[3]), epsErwartet: rund(d[4]),
            ueberraschungPct: rund(d[5]), marketCap: d[6] ?? null, boerse: d[7] ?? null,
          }))
        )
      );
    }
    if (bis > jetzt) {
      abfragen.push(
        tvScan(markt.scan, {
          filter: [
            ...basisFilter,
            { left: 'earnings_release_next_date', operation: 'in_range', right: [Math.max(von, jetzt), bis] },
          ],
          columns: [
            'name', 'description', 'earnings_release_next_date',
            'earnings_per_share_forecast_next_fq', 'market_cap_basic', 'exchange',
          ],
          sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
          range: [0, 150],
        }).then((rows) =>
          rows.map(({ d }) => ({
            ticker: d[0], name: d[1], zeit: new Date(d[2] * 1000).toISOString(),
            epsIst: null, epsErwartet: rund(d[3]),
            ueberraschungPct: null, marketCap: d[4] ?? null, boerse: d[5] ?? null,
          }))
        )
      );
    }

    const gesehen = new Set();
    const events = (await Promise.all(abfragen))
      .flat()
      .filter((e) => {
        const key = `${e.ticker}~${e.zeit.slice(0, 10)}`;
        if (gesehen.has(key)) return false;
        gesehen.add(key);
        return true;
      })
      .map((e) => ({
        ...e,
        land: markt.land,
        yahooSymbol: e.ticker + (YAHOO_SUFFIX[e.boerse] ?? ''),
      }))
      .sort((a, b) => new Date(a.zeit) - new Date(b.zeit) || (b.marketCap ?? 0) - (a.marketCap ?? 0));

    return { quelle: 'TradingView-Scanner', events };
  });
}

// Börsenfeiertage: fest hinterlegter Handelskalender der wichtigsten Börsen.
// Feiertage stehen Jahre im Voraus fest — eine gepflegte Tabelle ist die
// einzige kostenlose Quelle, die bis Jahresende reicht (TradingView liefert
// nur ~4 Wochen, investing.com ist hinter Cloudflare).
// PFLEGE: Zum Jahreswechsel das Folgejahr ergänzen.
const BOERSEN_NAME = {
  US: 'New York Stock Exchange / Nasdaq',
  DE: 'Deutsche Börse (Xetra)',
  GB: 'London Stock Exchange',
  JP: 'Japan Exchange (Tokio)',
  CN: 'Shanghai / Shenzhen Stock Exchange',
  CA: 'Toronto Stock Exchange',
};

const FEIERTAGE_2026 = [
  ['CA', '2026-08-03', 'Civic Holiday'],
  ['JP', '2026-08-11', 'Mountain Day (Tag des Berges)'],
  ['GB', '2026-08-31', 'Summer Bank Holiday'],
  ['US', '2026-09-07', 'Labor Day'],
  ['CA', '2026-09-07', 'Labour Day'],
  ['JP', '2026-09-21', 'Respect for the Aged Day'],
  ['JP', '2026-09-22', 'Brückenfeiertag (Kokumin no Kyūjitsu)'],
  ['JP', '2026-09-23', 'Herbst-Tagundnachtgleiche'],
  ['CN', '2026-09-25', 'Mittherbstfest'],
  ['CN', '2026-10-01', 'Nationalfeiertag — Goldene Woche (bis 7.10. geschlossen)'],
  ['CA', '2026-10-12', 'Thanksgiving (Kanada)'],
  ['JP', '2026-10-12', 'Sports Day'],
  ['JP', '2026-11-03', 'Culture Day'],
  ['JP', '2026-11-23', 'Labour Thanksgiving Day'],
  ['US', '2026-11-26', 'Thanksgiving'],
  ['DE', '2026-12-24', 'Heiligabend'],
  ['US', '2026-12-25', '1. Weihnachtstag'],
  ['DE', '2026-12-25', '1. Weihnachtstag'],
  ['GB', '2026-12-25', '1. Weihnachtstag'],
  ['CA', '2026-12-25', '1. Weihnachtstag'],
  ['GB', '2026-12-28', 'Boxing Day (nachgeholt)'],
  ['CA', '2026-12-28', 'Boxing Day (nachgeholt)'],
  ['DE', '2026-12-31', 'Silvester'],
  ['JP', '2026-12-31', 'Jahresschluss (JPX geschlossen)'],
];

/** Börsenfeiertage der wichtigsten Märkte ab heute bis Jahresende. */
export function getFeiertage() {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const events = FEIERTAGE_2026
    .map(([land, datum, titel]) => ({
      land,
      boerse: BOERSEN_NAME[land] ?? null,
      zeit: new Date(`${datum}T12:00:00`).toISOString(),
      titel,
    }))
    .filter((e) => new Date(e.zeit) >= heute)
    .sort((a, b) => new Date(a.zeit) - new Date(b.zeit));
  return Promise.resolve({ quelle: 'Handelskalender 2026 (fest hinterlegt)', events });
}

const nasdaqZahl = (s) => {
  const n = Number(String(s ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const nasdaqDatum = (s) => {
  // "8/06/2026" → ISO; ungültiges bleibt null
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? ''));
  return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), 12).toISOString() : null;
};

// Zweite IPO-Quelle: stockanalysis.com/ipos/calendar (serverseitig gerendert,
// wie schon bei den Analysten-Ratings). Listet gelegentlich Deals, die bei
// Nasdaq noch fehlen — wird per Symbol dazugemischt.
const saZahl = (s) => {
  const m = /^([\d.,]+)\s*([KMB])?$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const basis = Number(m[1].replace(/,/g, ''));
  const faktor = { K: 1e3, M: 1e6, B: 1e9 }[m[2]] ?? 1;
  return Number.isFinite(basis) ? basis * faktor : null;
};

async function iposVonStockanalysis() {
  try {
    const res = await fetch('https://stockanalysis.com/ipos/calendar/', {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const tabelle = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? '';
    const zeilen = [...tabelle.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1); // Kopfzeile weg
    return zeilen
      .map(([, inhalt]) => {
        const zellen = [...inhalt.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, z]) =>
          z.replace(/<[^>]+>/g, '').trim()
        );
        // IPO Date | Symbol | Company | Exchange | Price Range | Shares | Deal Size | …
        if (zellen.length < 7) return null;
        const datum = Date.parse(zellen[0]) + 12 * 3600 * 1000;
        return {
          status: 'erwartet',
          symbol: zellen[1] || null,
          firma: zellen[2] || null,
          boerse: zellen[3] || null,
          preis: zellen[4]?.replace(/\$/g, '') || null,
          volumenUsd: saZahl(zellen[6]),
          zeit: Number.isFinite(datum) ? new Date(datum).toISOString() : null,
        };
      })
      .filter((e) => e && e.symbol);
  } catch {
    return []; // zweite Quelle darf still ausfallen
  }
}

/** US-Börsengänge von heute bis Jahresende (erwartet und bereits gepreist). */
export function getIpos() {
  return cached('ipos', 12 * HOUR, async () => {
    // Nasdaq liefert monatsweise — alle Monate bis Dezember abfragen
    const monate = [];
    const jetzt = new Date();
    for (let m = jetzt.getMonth(); m <= 11; m++) {
      monate.push(new Date(jetzt.getFullYear(), m, 1));
    }
    const events = [];
    for (const m of monate) {
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const res = await fetch(`https://api.nasdaq.com/api/ipo/calendar?date=${key}`, {
        headers: { accept: 'application/json', 'user-agent': UA },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue; // ein Monat darf fehlen, der andere zählt trotzdem
      const daten = (await res.json())?.data ?? {};
      for (const r of daten.upcoming?.upcomingTable?.rows ?? []) {
        events.push({
          status: 'erwartet',
          symbol: r.proposedTickerSymbol ?? null,
          firma: r.companyName ?? null,
          boerse: r.proposedExchange ?? null,
          preis: r.proposedSharePrice ?? null,
          volumenUsd: nasdaqZahl(r.dollarValueOfSharesOffered),
          zeit: nasdaqDatum(r.expectedPriceDate),
        });
      }
      for (const r of daten.priced?.rows ?? []) {
        events.push({
          status: 'gepreist',
          symbol: r.proposedTickerSymbol ?? r.symbol ?? null,
          firma: r.companyName ?? null,
          boerse: r.proposedExchange ?? null,
          preis: r.proposedSharePrice ?? null,
          volumenUsd: nasdaqZahl(r.dollarValueOfSharesOffered),
          zeit: nasdaqDatum(r.pricedDate),
        });
      }
    }
    // Zweite Quelle dazumischen (nur Symbole, die Nasdaq nicht schon listet)
    const bekannt = new Set(events.map((e) => e.symbol).filter(Boolean));
    for (const e of await iposVonStockanalysis()) {
      if (!bekannt.has(e.symbol)) {
        bekannt.add(e.symbol);
        events.push(e);
      }
    }
    events.sort((a, b) => new Date(a.zeit ?? 0) - new Date(b.zeit ?? 0));
    return { quelle: 'Nasdaq (nur US-Börsengänge)', events };
  });
}
