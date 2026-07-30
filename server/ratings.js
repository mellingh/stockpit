// Analysten-Ratings mit Kurszielen je Bank — von stockanalysis.com
// (frei zugängliche, serverseitig gerenderte Tabelle; nur US-Ticker).
// Fallback bleibt Yahoos upgradeDowngradeHistory ohne Kursziele.
import { cached, DAY } from './cache.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

const ACTION_DE = {
  Upgrade: 'Hochgestuft',
  Downgrade: 'Abgestuft',
  Maintains: 'Bestätigt',
  Reiterates: 'Bekräftigt',
  Initiates: 'Neu aufgenommen',
  Initiated: 'Neu aufgenommen',
  Resumed: 'Wieder aufgenommen',
  Assumes: 'Übernommen',
};

const tdText = (td) =>
  td
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Ticker mit Suffix (SAP.DE) deckt stockanalysis nicht ab → null (Yahoo-Fallback)
export function getRatingsWithTargets(symbol) {
  if (symbol.includes('.') || symbol.includes('=')) return Promise.resolve(null);
  return cached(`saratings:${symbol}`, DAY, async () => {
    const res = await fetch(`https://stockanalysis.com/stocks/${symbol.toLowerCase()}/ratings/`, {
      headers: { 'user-agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const body = html.match(/<tbody[\s\S]*?<\/tbody>/)?.[0];
    if (!body) return null;

    const rows = body.match(/<tr[\s\S]*?<\/tr>/g) || [];
    const out = [];
    for (const row of rows) {
      const tds = (row.match(/<td[\s\S]*?<\/td>/g) || []).map(tdText);
      if (tds.length < 6) continue;
      // Spalten von hinten (vorne stehen Mobil-Duplikate):
      // …, Rating, Aktion, Kursziel, Upside, Datum
      const [rating, action, target, , dateStr] = tds.slice(-5);
      const datum = new Date(dateStr);
      if (Number.isNaN(datum.getTime())) continue;
      // Link zur Analysten-Seite (dort ist die einzelne Einschätzung nachlesbar)
      const analystPfad = row.match(/href="(\/analysts\/[^"]+)"/)?.[1] ?? null;
      out.push({
        datum: datum.toISOString(),
        firma: tds[1] || null,
        aktion: ACTION_DE[action] ?? action,
        zu: rating || null,
        von: null,
        kursziel: /^\$[\d.,]+$/.test(target) ? Number(target.replace(/[$,]/g, '')) : null,
        link: analystPfad ? `https://stockanalysis.com${analystPfad}` : null,
      });
    }
    return out.length ? out.slice(0, 15) : null;
  });
}
