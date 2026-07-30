// News-Beschaffung: Ticker-News von Yahoo + Makro-News über öffentliche
// RSS-Feeds (Fed/Zinsen, Wirtschaft, Welt). Alles kostenlos, kein Login.
import { execFile } from 'node:child_process';
import { XMLParser } from 'fast-xml-parser';
import { cached, MINUTE, DAY } from './cache.js';
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
      summary: cleanSummary(item.description ?? item.summary ?? null),
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

// RSS-Beschreibung zu einem kurzen "Worum es geht"-Teaser aufbereiten:
// HTML raus, Entities auflösen, an Wortgrenze kürzen
function cleanSummary(raw) {
  if (raw == null) return null;
  const text = decodeEntities(
    String(typeof raw === 'object' ? raw['#text'] ?? '' : raw)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
  if (text.length < 40) return null; // zu kurz, um etwas zu erklären
  if (text.length <= 280) return text;
  const cut = text.slice(0, 280);
  return `${cut.slice(0, cut.lastIndexOf(' '))} …`;
}

// "Worum es geht" für News ohne RSS-Description (v. a. Yahoo-Ticker-News):
// die Artikelseite kurz anfetchen und die og:description aus dem <head>
// ziehen — das ist der Teaser, den die Redaktion selbst geschrieben hat.
// Über curl statt Node-fetch: finance.yahoo.com blockt Nodes TLS-Fingerprint
// (wie investing.com beim Kalender). Pro URL einen Tag gecacht; Fehler
// (Paywall, Bot-Schutz) → einfach null.
export function getArticleSummary(url) {
  if (!url || !/^https?:\/\//.test(url)) return Promise.resolve(null);
  return cached(`artikel:${url}`, DAY, async () => {
    const html = await new Promise((resolve, reject) => {
      execFile(
        'curl',
        ['-s', '-L', '--max-time', '7', '--compressed',
          '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          url],
        { maxBuffer: 4 * 1024 * 1024, windowsHide: true },
        (err, stdout) => (err ? reject(err) : resolve(stdout))
      );
    });
    const meta =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ??
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    return meta ? cleanSummary(meta[1]) : null;
  }).catch(() => null);
}

// Fehlende Teaser für eine News-Liste parallel nachladen (mutiert die Items)
export async function fillSummaries(items) {
  await Promise.all(
    items
      .filter((n) => !n.summary && n.link)
      .map(async (n) => {
        n.summary = await getArticleSummary(n.link);
      })
  );
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
