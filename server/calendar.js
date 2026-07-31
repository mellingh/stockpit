// Wirtschaftskalender.
// Primärquelle: der offene Kalender-Endpunkt von TradingView — liefert Ist-Werte
// ("Aktuell"), Prognose, Vorher, Wichtigkeit und Einheiten als JSON, ohne Key.
// Grund für den Wechsel: investing.com (sslecal2) steckt seit Sommer 2026 hinter
// einer Cloudflare-Challenge ("Just a moment…", HTTP 403) — auch per curl. Der
// Widget-Parser bleibt als zweite Stufe erhalten, falls die Sperre wieder fällt.
// Dritte Stufe: ForexFactory-Wochenfeed (hat KEINE Ist-Werte).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cached, MINUTE } from './cache.js';
import { decodeEntities } from './news.js';

const run = promisify(execFile);

const TV_BASE = 'https://economic-calendar.tradingview.com/events';
const TV_LAENDER = 'US,EU,DE,GB,JP,CN,CA,AU,CH,FR,IT,ES,NZ,IN,BR,KR,MX,SE,NO,PL';

const INVESTING_URL =
  'https://sslecal2.investing.com?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous' +
  '&features=datepicker,timezone&countries=25,32,6,37,72,22,17,39,14,10,35,43,56,36,110,11,26,12,4,5' +
  '&calType=week&timeZone=58&lang=8'; // lang=8 = Deutsch

const FF_FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  referer: 'http://localhost:3001/',
};

// Ländername aus der Flaggen-Klasse des Widgets ("ceFlags United_States")
const LAND_AUS_NAME = {
  United_States: 'US', Germany: 'DE', Euro_Zone: 'EU', United_Kingdom: 'GB', Japan: 'JP',
  China: 'CN', Switzerland: 'CH', Canada: 'CA', Australia: 'AU', New_Zealand: 'NZ',
  France: 'FR', Italy: 'IT', Spain: 'ES', Brazil: 'BR', South_Africa: 'ZA', India: 'IN',
  South_Korea: 'KR', Singapore: 'SG', Hong_Kong: 'HK', Netherlands: 'NL', Austria: 'AT',
  Belgium: 'BE', Portugal: 'PT', Ireland: 'IE', Greece: 'GR', Sweden: 'SE', Norway: 'NO',
  Denmark: 'DK', Poland: 'PL', Mexico: 'MX', Turkey: 'TR', Russia: 'RU',
};
// Fallback, wenn nur die Währung bekannt ist (ForexFactory / Flagge nicht lesbar)
const LAND_AUS_WAEHRUNG = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', CHF: 'CH', CAD: 'CA', AUD: 'AU', NZD: 'NZ',
  CNY: 'CN', INR: 'IN', KRW: 'KR', BRL: 'BR', SGD: 'SG', HKD: 'HK', ZAR: 'ZA', MXN: 'MX',
  TRY: 'TR', SEK: 'SE', NOK: 'NO', DKK: 'DK', PLN: 'PL', RUB: 'RU',
};
// Landeswährung aus dem Länderkürzel (TradingView liefert die Währung nicht immer)
const WAEHRUNG_AUS_LAND = Object.fromEntries(
  Object.entries(LAND_AUS_WAEHRUNG).map(([w, l]) => [l, w])
);

// ---------- Titel eindeutschen ----------
// TradingView liefert englische Indikatornamen. Statt einer Online-Übersetzung
// (unzuverlässig bei Fachbegriffen) eine feste Tabelle: Basisbegriff + Zusätze.
// Unbekannte Titel bleiben englisch stehen — ehrlicher als falsch geraten.
const INDIKATOR_DE = [
  [/^Fed Interest Rate Decision$/i, 'Fed-Zinsentscheid'],
  [/^(ECB|BoE|BoJ|SNB|RBA|RBNZ|BoC|PBoC)\s+Interest Rate Decision$/i, '$1-Zinsentscheid'],
  [/Interest Rate Decision/i, 'Zinsentscheid'],
  [/^(Fed|ECB|BoE|BoJ|SNB)\s+Press Conference$/i, '$1-Pressekonferenz'],
  [/Press Conference/i, 'Pressekonferenz'],
  [/^Inflation Rate/i, 'Inflationsrate'],
  [/^Core Inflation Rate/i, 'Kerninflationsrate'],
  [/^Core PCE Price Index/i, 'PCE-Kernpreisindex'],
  [/^PCE Price Index/i, 'PCE-Preisindex'],
  [/^Core CPI/i, 'Kernverbraucherpreise'],
  [/^CPI\b/i, 'Verbraucherpreise'],
  [/^Core PPI/i, 'Kernproduzentenpreise'],
  [/^PPI\b/i, 'Produzentenpreise'],
  [/^Producer Prices/i, 'Produzentenpreise'],
  [/^GDP Growth Rate/i, 'BIP-Wachstum'],
  [/^GDP\b/i, 'Bruttoinlandsprodukt'],
  [/^Unemployment Rate/i, 'Arbeitslosenquote'],
  [/^Unemployment Change/i, 'Veränderung der Arbeitslosenzahl'],
  [/^Employment Change/i, 'Beschäftigungsveränderung'],
  [/^Non.?Farm Payrolls/i, 'Beschäftigte außerhalb der Landwirtschaft'],
  [/^ADP Employment Change/i, 'ADP-Beschäftigungsveränderung'],
  [/^Initial Jobless Claims/i, 'Erstanträge Arbeitslosenhilfe'],
  [/^Continuing Jobless Claims/i, 'Folgeanträge Arbeitslosenhilfe'],
  [/^Average (Hourly Earnings|Earnings)/i, 'Durchschnittliche Stundenlöhne'],
  [/^Retail Sales/i, 'Einzelhandelsumsätze'],
  [/^Core Retail Sales/i, 'Einzelhandelsumsätze ohne Kfz'],
  [/^Industrial Production/i, 'Industrieproduktion'],
  [/^Manufacturing Production/i, 'Produktion im verarbeitenden Gewerbe'],
  [/^Factory Orders/i, 'Auftragseingänge Industrie'],
  [/^Durable Goods Orders/i, 'Auftragseingänge langlebige Güter'],
  [/^Construction (Output|Spending)/i, 'Bauausgaben'],
  [/^Building Permits/i, 'Baugenehmigungen'],
  [/^Housing Starts/i, 'Wohnbaubeginne'],
  [/^New Home Sales/i, 'Verkäufe neuer Häuser'],
  [/^Existing Home Sales/i, 'Verkäufe bestehender Häuser'],
  [/^Pending Home Sales/i, 'Anhängige Hausverkäufe'],
  [/^(NBS |Caixin |ISM |S&P Global |HCOB )?Non.?Manufacturing (PMI|Index)/i, '$1Einkaufsmanagerindex Dienstleistungen'],
  [/^(NBS |Caixin |ISM |S&P Global |HCOB )?Manufacturing PMI/i, '$1Einkaufsmanagerindex Industrie'],
  [/^(NBS |Caixin |ISM |S&P Global |HCOB )?Services PMI/i, '$1Einkaufsmanagerindex Dienstleistungen'],
  [/^(NBS |Caixin |ISM |S&P Global |HCOB )?Composite PMI/i, '$1Einkaufsmanagerindex Gesamt'],
  [/^ISM Manufacturing (Prices|Employment|New Orders)/i, 'ISM Industrie $1'],
  [/^Ifo Business Climate/i, 'Ifo-Geschäftsklima'],
  [/^Ifo Expectations/i, 'Ifo-Erwartungen'],
  [/^Ifo Current Conditions/i, 'Ifo-Lagebeurteilung'],
  [/^ZEW Economic Sentiment/i, 'ZEW-Konjunkturerwartungen'],
  [/^ZEW Current Conditions/i, 'ZEW-Lagebeurteilung'],
  [/^GfK Consumer Climate/i, 'GfK-Konsumklima'],
  [/^Consumer Confidence/i, 'Verbrauchervertrauen'],
  [/^(Michigan )?Consumer Sentiment/i, 'Verbraucherstimmung Michigan'],
  [/^Business Confidence/i, 'Geschäftsklima'],
  [/^Economic Sentiment/i, 'Konjunkturstimmung'],
  [/^Leading Economic Index/i, 'Frühindikator-Index'],
  [/^Coincident Index/i, 'Index der laufenden Wirtschaftslage'],
  [/^Balance of Trade/i, 'Handelsbilanz'],
  [/^(Goods )?Trade Balance/i, 'Handelsbilanz Güter'],
  [/^Current Account/i, 'Leistungsbilanz'],
  [/^Exports/i, 'Exporte'],
  [/^Imports/i, 'Importe'],
  [/^Foreign Direct Investment/i, 'Ausländische Direktinvestitionen'],
  [/^Foreign Bond Investment/i, 'Ausländische Anleihekäufe'],
  [/^Money Supply/i, 'Geldmenge'],
  [/^Private Loans/i, 'Private Kreditvergabe'],
  [/^Loans to Private Sector/i, 'Kredite an den Privatsektor'],
  [/^(BoE )?Consumer Credit/i, 'Konsumentenkredite'],
  [/^Mortgage (Lending|Approvals)/i, 'Hypotheken$1'],
  [/^Net Lending to Individuals/i, 'Nettokreditvergabe an Privatpersonen'],
  [/^Personal Income/i, 'Persönliche Einkommen'],
  [/^Personal Spending/i, 'Private Konsumausgaben'],
  [/^Household Spending/i, 'Konsumausgaben der Haushalte'],
  [/^Government (Budget|Debt)/i, 'Staatshaushalt'],
  [/^Budget Balance/i, 'Haushaltssaldo'],
  [/^Crude Oil (Inventories|Stocks Change)/i, 'Rohöllagerbestände'],
  [/^Natural Gas Stocks Change/i, 'Erdgaslagerbestände'],
  [/^Capacity Utilization/i, 'Kapazitätsauslastung'],
  [/^Wage(s)? Growth/i, 'Lohnwachstum'],
  [/^Labour Costs/i, 'Arbeitskosten'],
  [/^Productivity/i, 'Produktivität'],
  [/^Vehicle Sales/i, 'Fahrzeugverkäufe'],
  [/^Tourist Arrivals/i, 'Touristenankünfte'],
  [/^Politburo Meeting/i, 'Politbüro-Sitzung'],
  [/^Corporate Profits/i, 'Unternehmensgewinne'],
  [/^Industrial Profits/i, 'Industriegewinne'],
  // Reden und Berichte: „BoJ Gov Ueda Speech" → „BoJ-Chef Ueda spricht"
  [/^(\w+) Gov(?:ernor)? ([A-Z][\w-]+) Speech$/i, '$1-Chef $2 spricht'],
  [/^(\w+) (?:MPC |FOMC )?Member ([A-Z][\w-]+) Speech$/i, '$1-Mitglied $2 spricht'],
  [/^(\w+) Quarterly Outlook Report$/i, '$1-Quartalsbericht'],
  [/^(\w+) Monetary Policy (Statement|Report)$/i, '$1-Bericht zur Geldpolitik'],
  [/Speech$/i, 'Rede'],
  [/^Holiday$/i, 'Feiertag'],
];

// Zusätze am Titelende („Inflation Rate YoY Flash")
const ZUSATZ_DE = [
  [/\bYoY\b/i, 'Jahr'], [/\bMoM\b/i, 'Monat'], [/\bQoQ\b/i, 'Quartal'],
  [/\bYTD\b/i, 'seit Jahresbeginn'], [/\bPrel\b/i, 'vorl.'], [/\bFlash\b/i, 'Schnellsch.'],
  [/\bAdv\b/i, 'erste Sch.'], [/\bFinal\b/i, 'endg.'], [/\bs\.a\.\b/i, 'saisonber.'],
  [/\bn\.s\.a\.\b/i, 'unbereinigt'],
];
const MONAT_DE = {
  Jan: 'Jan', Feb: 'Feb', Mar: 'Mär', Apr: 'Apr', May: 'Mai', Jun: 'Jun',
  Jul: 'Jul', Aug: 'Aug', Sep: 'Sep', Oct: 'Okt', Nov: 'Nov', Dec: 'Dez',
};

function titelDeutsch(titel, periode) {
  const zusaetze = [];
  let rest = titel;
  for (const [muster, wort] of ZUSATZ_DE) {
    if (muster.test(rest)) {
      zusaetze.push(wort);
      rest = rest.replace(muster, '').replace(/\s{2,}/g, ' ').trim();
    }
  }
  let basis = rest;
  for (const [muster, ersatz] of INDIKATOR_DE) {
    if (muster.test(rest)) {
      basis = rest.replace(muster, ersatz).replace(/\s{2,}/g, ' ').trim();
      break;
    }
  }
  const zeit = periode
    ? periode.replace(/^([A-Z][a-z]{2})/, (m) => MONAT_DE[m] ?? m)
    : null;
  return basis + (zusaetze.length ? ` (${zusaetze.join(', ')})` : '') + (zeit ? ` (${zeit})` : '');
}

// ---------- Lesart: ist "höher als erwartet" gut oder schlecht? ----------
// Nur wo die Richtung fachlich eindeutig ist, wird gefärbt. Zinsentscheide und
// Unbekanntes bleiben absichtlich neutral — grün/rot wäre dort Interpretation.
const HOCH_SCHLECHT = /inflation|cpi\b|ppi\b|price index|producer price|unemployment (rate|change)|jobless claims|deficit|debt|labour costs|inventor|stocks change/i;
const HOCH_GUT = /gdp|payroll|employment change|pmi|retail sales|industrial production|manufacturing production|durable goods|factory orders|building permits|housing starts|home sales|consumer (confidence|sentiment|credit)|business (confidence|climate)|ifo|zew|sentiment|leading economic|coincident|balance of trade|trade balance|current account|exports|personal (income|spending)|household spending|productivity|capacity utilization|profits|wage|vehicle sales|direct investment/i;

function trendVon(titelEn, ist, prognose) {
  if (ist == null || prognose == null || ist === prognose) return null;
  const hoeher = ist > prognose;
  if (HOCH_SCHLECHT.test(titelEn)) return hoeher ? 'schlecht' : 'gut';
  if (HOCH_GUT.test(titelEn)) return hoeher ? 'gut' : 'schlecht';
  return null;
}

// ---------- Werte formatieren ----------
const SKALA_DE = { K: 'Tsd.', M: 'Mio.', B: 'Mrd.', T: 'Bio.' };

function wertText(wert, unit, skala) {
  if (wert == null) return null;
  const zahl = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(wert);
  const teile = [zahl];
  if (skala && SKALA_DE[skala]) teile.push(SKALA_DE[skala]);
  if (unit) teile.push(unit);
  return teile.join(' ');
}

// ---------- Quelle 1: TradingView ----------

function wocheISO() {
  const jetzt = new Date();
  const montag = new Date(jetzt);
  montag.setDate(jetzt.getDate() - ((jetzt.getDay() + 6) % 7));
  montag.setHours(0, 0, 0, 0);
  const sonntagAbend = new Date(montag);
  sonntagAbend.setDate(montag.getDate() + 7);
  return { von: montag.toISOString(), bis: sonntagAbend.toISOString() };
}

async function fromTradingView() {
  const { von, bis } = wocheISO();
  const url =
    `${TV_BASE}?from=${encodeURIComponent(von)}&to=${encodeURIComponent(bis)}&countries=${TV_LAENDER}`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      origin: 'https://www.tradingview.com',
      referer: 'https://www.tradingview.com/',
      'user-agent': HEADERS['user-agent'],
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`TradingView-Kalender: HTTP ${res.status}`);
  const daten = await res.json();
  const roh = Array.isArray(daten?.result) ? daten.result : [];
  if (roh.length < 5) throw new Error('TradingView-Kalender: unerwartete Antwort');

  const events = roh
    .map((e) => {
      if (!e?.title || !e?.date) return null;
      const land = e.country ?? null;
      return {
        titel: titelDeutsch(e.title, e.period),
        titelEn: e.title, // fürs Lexikon-Matching im Frontend (kennt beide Sprachen)
        waehrung: e.currency ?? WAEHRUNG_AUS_LAND[land] ?? null,
        land,
        zeit: new Date(e.date).toISOString(),
        wichtigkeit: e.importance >= 1 ? 'High' : e.importance === 0 ? 'Medium' : 'Low',
        aktuell: wertText(e.actual, e.unit, e.scale),
        aktuellTrend: trendVon(e.title, e.actual, e.forecast),
        prognose: wertText(e.forecast, e.unit, e.scale),
        vorher: wertText(e.previous, e.unit, e.scale),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.zeit) - new Date(b.zeit));

  return { quelle: 'TradingView-Kalender', events };
}

// ---------- Quelle 2: investing.com-Widget (aktuell per Cloudflare geblockt) ----------

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
      const landName = row.match(/ceFlags\s+([A-Za-z_]+)/)?.[1] ?? null;
      const event = cell(row, 'event');
      if (!event.text) return null;
      const act = cell(row, 'act');
      const fore = cell(row, 'fore');
      const prev = cell(row, 'prev');
      return {
        titel: event.text,
        titelEn: event.text,
        waehrung: currency,
        land: LAND_AUS_NAME[landName] ?? LAND_AUS_WAEHRUNG[currency] ?? null,
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
  // curl (seit Windows 10 vorinstalliert) kam früher durch.
  const { stdout } = await run(
    'curl',
    ['-s', '--max-time', '12', '-A', HEADERS['user-agent'], '-H', `Referer: ${HEADERS.referer}`, INVESTING_URL],
    { maxBuffer: 16 * 1024 * 1024, windowsHide: true }
  );
  const events = parseInvesting(stdout);
  if (events.length < 5) throw new Error('investing-Widget: unerwartetes Format oder geblockt');
  return { quelle: 'investing.com-Widget', events };
}

// ---------- Quelle 3: ForexFactory (ohne Ist-Werte) ----------

async function fromForexFactory() {
  const res = await fetch(FF_FEED, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Kalender-Feed: HTTP ${res.status}`);
  const events = (await res.json()).map((e) => ({
    titel: e.title,
    titelEn: e.title,
    waehrung: e.country,
    land: LAND_AUS_WAEHRUNG[e.country] ?? null,
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
    fromTradingView()
      .catch((err) => {
        console.warn('[kalender] TradingView nicht verfügbar:', err.message);
        return fromInvesting();
      })
      .catch((err) => {
        console.warn('[kalender] investing nicht verfügbar, nutze Fallback:', err.message);
        return fromForexFactory();
      })
  );
}
