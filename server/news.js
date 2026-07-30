// News-Beschaffung: Ticker-News von Yahoo + Makro-News über öffentliche
// RSS-Feeds (Fed/Zinsen, Wirtschaft, Welt). Alles kostenlos, kein Login.
import { XMLParser } from 'fast-xml-parser';
import { cached, MINUTE } from './cache.js';
import { getTickerNews } from './yahoo.js';

const parser = new XMLParser({ ignoreAttributes: false });

// Konfigurierbare Feed-Liste. lang steuert das Sentiment-Modell (en → FinBERT).
export const MACRO_FEEDS = [
  {
    id: 'cnbc-top',
    name: 'CNBC Top News',
    lang: 'en',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
  },
  {
    id: 'cnbc-economy',
    name: 'CNBC Economy',
    lang: 'en',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
  },
  {
    id: 'marketwatch',
    name: 'MarketWatch',
    lang: 'en',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
  },
  {
    id: 'tagesschau-wirtschaft',
    name: 'tagesschau Wirtschaft',
    lang: 'de',
    url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml',
  },
];

async function fetchFeed(feed) {
  return cached(`rss:${feed.id}`, 15 * MINUTE, async () => {
    const res = await fetch(feed.url, {
      headers: { 'user-agent': 'Mozilla/5.0 (stockpit, lokal)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);
    const xml = await res.text();
    const doc = parser.parse(xml);
    const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
    return (Array.isArray(items) ? items : [items]).slice(0, 15).map((item) => ({
      title: typeof item.title === 'object' ? item.title['#text'] : item.title,
      link: typeof item.link === 'object' ? item.link['@_href'] ?? item.link['#text'] : item.link,
      pubDate: item.pubDate ?? item.published ?? null,
      source: feed.name,
      lang: feed.lang,
      macro: true,
    }));
  });
}

export async function getMacroNews() {
  const results = await Promise.allSettled(MACRO_FEEDS.map(fetchFeed));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const errors = results
    .map((r, i) => (r.status === 'rejected' ? MACRO_FEEDS[i].name : null))
    .filter(Boolean);
  return { items, errors };
}

export async function getNewsForSymbols(symbols) {
  const results = await Promise.allSettled(symbols.map((s) => getTickerNews(s)));
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

// HTML-Entities in Schlagzeilen auflösen ("El Ni&#xf1;o" → "El Niño")
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(text) {
  return String(text || '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, code) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

// Dubletten entfernen (gleiche Schlagzeile aus mehreren Quellen) und sortieren
export function dedupeAndSort(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item.title) continue;
    item.title = decodeEntities(item.title);
    const key = item.title.toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  out.sort((a, b) => toTime(b.pubDate) - toTime(a.pubDate));
  return out;
}

export function toTime(pubDate) {
  if (pubDate == null) return 0;
  if (typeof pubDate === 'number') return pubDate < 1e12 ? pubDate * 1000 : pubDate;
  const t = Date.parse(pubDate);
  return Number.isNaN(t) ? 0 : t;
}
