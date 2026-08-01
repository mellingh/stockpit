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

/** Börsenfeiertage der wichtigsten Märkte — so weit die Quelle reicht (~4 Wochen). */
export function getFeiertage() {
  return cached('feiertage', 12 * HOUR, async () => {
    const von = new Date();
    von.setHours(0, 0, 0, 0);
    const bis = new Date(von);
    bis.setDate(bis.getDate() + 35);
    const url =
      `https://economic-calendar.tradingview.com/events?from=${von.toISOString()}` +
      `&to=${bis.toISOString()}&countries=US,DE,GB,JP,CN,CA`;
    const res = await fetch(url, {
      headers: { origin: 'https://www.tradingview.com', 'user-agent': UA },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Feiertags-Kalender: HTTP ${res.status}`);
    const daten = await res.json();
    const events = (daten.result ?? [])
      .filter((e) => e.indicator === 'Holidays')
      .map((e) => ({ land: e.country ?? null, zeit: e.date, titel: e.title }))
      .sort((a, b) => new Date(a.zeit) - new Date(b.zeit));
    return { quelle: 'TradingView-Kalender', horizontTage: 35, events };
  });
}

const nasdaqZahl = (s) => {
  const n = Number(String(s ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const nasdaqDatum = (s) => {
  // "8/06/2026" → ISO; ungültiges bleibt null
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? ''));
  return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])).toISOString() : null;
};

/** US-Börsengänge des laufenden + nächsten Monats (erwartet und bereits gepreist). */
export function getIpos() {
  return cached('ipos', 12 * HOUR, async () => {
    const monate = [new Date(), new Date()];
    monate[1].setMonth(monate[1].getMonth() + 1);
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
    events.sort((a, b) => new Date(a.zeit ?? 0) - new Date(b.zeit ?? 0));
    return { quelle: 'Nasdaq (nur US-Börsengänge)', events };
  });
}
