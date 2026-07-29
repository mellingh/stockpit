// Wirtschaftskalender.
// Primärquelle: das offizielle Einbett-Widget von investing.com (sslecal2) —
// liefert als einzige kostenlose Quelle auch die "Aktuell"-Werte inkl.
// besser/schlechter-Färbung. Fallback: ForexFactory-Wochenfeed (ohne Aktuell).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cached, MINUTE } from './cache.js';
import { decodeEntities } from './news.js';

const run = promisify(execFile);

const INVESTING_URL =
  'https://sslecal2.investing.com?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous' +
  '&features=datepicker,timezone&countries=25,32,6,37,72,22,17,39,14,10,35,43,56,36,110,11,26,12,4,5' +
  '&calType=week&timeZone=58&lang=8'; // lang=8 = Deutsch

const FF_FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  referer: 'http://localhost:3001/',
};

// Zellen des Widgets: <td class="bold act greenFont ...">1,2%</td>
function cell(row, cls) {
  const m = row.match(new RegExp(`<td[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`));
  if (!m) return { text: null, trend: null };
  const raw = m[0];
  const text = decodeEntities(m[1].replace(/<[^>]*>/g, '')).trim() || null;
  const trend = /greenFont/.test(raw) ? 'gut' : /redFont/.test(raw) ? 'schlecht' : null;
  return { text, trend };
}

function parseInvesting(html) {
  const rows = html.match(/<tr id="eventRowId_\d+"[\s\S]*?<\/tr>/g) || [];
  return rows
    .map((row) => {
      const ts = row.match(/event_timestamp="([^"]+)"/)?.[1];
      if (!ts) return null;
      const stars = (row.match(/grayFullBullishIcon/g) || []).length;
      const currency = row.match(/class="flagCur">[\s\S]*?<\/span>\s*([A-Z]{3})/)?.[1] ?? null;
      const event = cell(row, 'event');
      if (!event.text) return null;
      const act = cell(row, 'act');
      const fore = cell(row, 'fore');
      const prev = cell(row, 'prev');
      return {
        titel: event.text,
        waehrung: currency,
        zeit: new Date(ts.replace(' ', 'T') + 'Z').toISOString(), // Widget liefert UTC
        wichtigkeit: stars >= 3 ? 'High' : stars === 2 ? 'Medium' : 'Low',
        aktuell: act.text,
        aktuellTrend: act.trend, // gut/schlecht = besser/schlechter als Prognose
        prognose: fore.text,
        vorher: prev.text,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.zeit) - new Date(b.zeit));
}

async function fromInvesting() {
  // Node-eigene Requests blockt investing per TLS-Fingerprint (403) —
  // curl (seit Windows 10 vorinstalliert) kommt durch.
  const { stdout } = await run(
    'curl',
    ['-s', '--max-time', '12', '-A', HEADERS['user-agent'], '-H', `Referer: ${HEADERS.referer}`, INVESTING_URL],
    { maxBuffer: 16 * 1024 * 1024, windowsHide: true }
  );
  const events = parseInvesting(stdout);
  if (events.length < 5) throw new Error('investing-Widget: unerwartetes Format oder geblockt');
  return { quelle: 'investing.com-Widget', events };
}

async function fromForexFactory() {
  const res = await fetch(FF_FEED, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Kalender-Feed: HTTP ${res.status}`);
  const events = (await res.json()).map((e) => ({
    titel: e.title,
    waehrung: e.country,
    zeit: new Date(e.date).toISOString(),
    wichtigkeit: e.impact === 'Holiday' ? 'Low' : e.impact,
    aktuell: null,
    aktuellTrend: null,
    prognose: e.forecast || null,
    vorher: e.previous || null,
  }));
  events.sort((a, b) => new Date(a.zeit) - new Date(b.zeit));
  return { quelle: 'ForexFactory (ohne Aktuell-Werte)', events };
}

// 15 Min Cache: "Aktuell"-Werte laufen über den Tag ein
export function getCalendar() {
  return cached('calendar:week', 15 * MINUTE, () =>
    fromInvesting().catch((err) => {
      console.warn('[kalender] investing nicht verfügbar, nutze Fallback:', err.message);
      return fromForexFactory();
    })
  );
}
