// Datenquelle: Yahoo Finance über die inoffizielle, seit Jahren gepflegte
// Bibliothek yahoo-finance2 — kostenlos, kein API-Key, kein Login.
import YahooFinance from 'yahoo-finance2';
import { cached, MINUTE, HOUR, DAY } from './cache.js';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const RANGES = {
  '1m': 60,
  '6m': 190,
  '1y': 380,
  '5y': 5 * 365 + 10,
  max: 40 * 365,
};

// Intraday-Kerzen für kurze Zeiträume (TradingView-Gefühl)
const INTRADAY = {
  '1d': { days: 4, interval: '15m' },
  '1w': { days: 8, interval: '30m' },
};

export function getIntraday(symbol, range) {
  const cfg = INTRADAY[range];
  return cached(`intraday:${symbol}:${range}`, 5 * MINUTE, async () => {
    const period1 = new Date(Date.now() - cfg.days * DAY);
    const result = await yahooFinance.chart(symbol, { period1, interval: cfg.interval });
    let quotes = (result.quotes || []).filter((q) => q.close != null);
    if (range === '1d' && quotes.length) {
      // nur der letzte Handelstag
      const lastDay = new Date(quotes[quotes.length - 1].date).toDateString();
      quotes = quotes.filter((q) => new Date(q.date).toDateString() === lastDay);
    }
    return quotes;
  });
}

export function getQuote(symbol) {
  return cached(`quote:${symbol}`, MINUTE, () => yahooFinance.quote(symbol));
}

export async function getQuotes(symbols) {
  const results = await Promise.allSettled(symbols.map((s) => getQuote(s)));
  const map = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map[symbols[i]] = r.value;
  });
  return map;
}

// Tages-Kerzen. Für Indikatoren (SMA200) brauchen wir Vorlauf: es werden
// immer mindestens ~2 Jahre geladen, das Frontend schneidet die Anzeige zu.
export function getHistory(symbol, range = '1y') {
  const days = Math.max(RANGES[range] ?? RANGES['1y'], 2 * 365);
  return cached(`history:${symbol}:${days}`, HOUR, async () => {
    const period1 = new Date(Date.now() - days * DAY);
    const result = await yahooFinance.chart(symbol, { period1, interval: '1d' });
    return (result.quotes || []).filter((q) => q.close != null);
  });
}

const STOCK_MODULES = [
  'price',
  'summaryDetail',
  'financialData',
  'defaultKeyStatistics',
  'recommendationTrend',
  'calendarEvents',
  'assetProfile',
  'upgradeDowngradeHistory',
  'earningsHistory',
  // earningsChart.quarterly trägt das Ist-EPS nach einem Report oft Stunden
  // früher nach als earningsHistory — zweite Quelle für "Frische Zahlen"
  'earnings',
];

export function getSummary(symbol) {
  // 4 h statt 1 Tag: Yahoo trägt das Ist-EPS am Meldetag stundenweise nach —
  // mit Tages-Cache stünde "Ist-Wert noch nicht veröffentlicht" zu lange da.
  return cached(`summary:${symbol}`, 4 * HOUR, () =>
    yahooFinance.quoteSummary(symbol, { modules: STOCK_MODULES }).catch(async (err) => {
      // Bei Validierungsfehlern liefert Yahoo trotzdem brauchbare Teildaten
      if (err?.result) return err.result;
      // ETFs kennen manche Module nicht — reduzierter Satz
      return yahooFinance.quoteSummary(symbol, {
        modules: ['price', 'summaryDetail', 'defaultKeyStatistics'],
      });
    })
  );
}

// ETF-Details (Kostenquote, Kategorie, Top-Positionen)
export function getEtfDetails(symbol) {
  return cached(`etf:${symbol}`, DAY, () =>
    yahooFinance
      .quoteSummary(symbol, { modules: ['fundProfile', 'topHoldings', 'fundPerformance'] })
      .catch((err) => err?.result ?? null)
  );
}

export function search(q) {
  return cached(`search:${q.toLowerCase()}`, HOUR, () =>
    yahooFinance.search(q, { quotesCount: 8, newsCount: 0 })
  );
}

// News-Schlagzeilen zu einem Ticker (Yahoo aggregiert viele Quellen).
// Bei Ticker-Suffixen (SAP.DE) sucht der Basisticker deutlich treffsicherer.
export function getTickerNews(symbol) {
  return cached(`news:${symbol}`, 15 * MINUTE, async () => {
    const query = symbol.split('.')[0];
    const result = await yahooFinance.search(query, { quotesCount: 0, newsCount: 12 });
    return (result.news || []).map((n) => ({
      title: n.title,
      link: n.link,
      source: n.publisher,
      pubDate: n.providerPublishTime,
      symbol,
      lang: 'en',
    }));
  });
}

// Gerade meistgesucht/im Trend bei Yahoo (US-Markt) — nur Symbolliste
export function getTrendingSymbols() {
  return cached('trending:US', 15 * MINUTE, async () => {
    const result = await yahooFinance.trendingSymbols('US', { count: 15 });
    return (result?.quotes ?? []).map((q) => q.symbol).filter(Boolean);
  });
}

// Wechselkurs from→to (z.B. USD→EUR über "USDEUR=X")
export async function getFxRate(from, to) {
  if (from === to) return 1;
  const q = await cached(`fx:${from}${to}`, 15 * MINUTE, () =>
    yahooFinance.quote(`${from}${to}=X`)
  );
  return q?.regularMarketPrice ?? null;
}
