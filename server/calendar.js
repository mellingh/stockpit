// Wirtschaftskalender: öffentlicher Wochen-Feed von ForexFactory
// (faireconomy.media) — kostenlos, kein Key. Enthält Zinsentscheide,
// Inflationsdaten, Arbeitsmarkt, Reden von Notenbankern usw.
import { cached, HOUR } from './cache.js';

const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

const IMPACT_ORDER = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

export function getCalendar() {
  return cached('calendar:week', 2 * HOUR, async () => {
    const res = await fetch(FEED, {
      headers: { 'user-agent': 'Mozilla/5.0 (aktien-dashboard, lokal)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Kalender-Feed: HTTP ${res.status}`);
    const events = await res.json();
    return events
      .map((e) => ({
        titel: e.title,
        waehrung: e.country, // Feed nutzt Währungskürzel (USD, EUR, …)
        zeit: e.date,
        wichtigkeit: e.impact, // High | Medium | Low | Holiday
        prognose: e.forecast || null,
        vorher: e.previous || null,
      }))
      .sort((a, b) => new Date(a.zeit) - new Date(b.zeit) || IMPACT_ORDER[b.wichtigkeit] - IMPACT_ORDER[a.wichtigkeit]);
  });
}
