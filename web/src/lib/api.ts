// Typisierter Client für die bestehende Stockpit-API (server/index.js).
// Die Typen bilden exakt die JSON-Antworten des Express-Servers ab.

// ---------- Typen ----------

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type: 'EQUITY' | 'ETF';
}

export interface Ausserboerslich {
  phase: 'pre' | 'post';
  preis: number;
  pct: number | null;
}

export interface Position {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  buyPrice: number | null;
  buyCurrency?: string | null;
  currency?: string | null;
  sektor?: string;
  preis: number | null;
  waehrung: string | null;
  tagesPct: number | null;
  ausserboerslich: Ausserboerslich | null;
  valueEur: number | null;
  gewinnEur: number | null;
  gewinnPct: number | null;
  sparkline: number[];
  ampel: string | null;
}

export interface WatchItem {
  symbol: string;
  name: string;
  sektor?: string;
  preis: number | null;
  waehrung: string | null;
  tagesPct: number | null;
  ausserboerslich: Ausserboerslich | null;
  sparkline: number[];
}

export interface Termin {
  symbol: string | null;
  name: string;
  typ: 'Quartalszahlen' | 'Ex-Dividende' | 'Markt';
  date: string | number;
  days: number;
  epsErwartet?: number | null;
  epsTatsaechlich?: number | null;
  ueberraschungPct?: number | null;
  umsatzErwartet?: number | null;
  waehrung?: string | null;
  land?: string | null;
  prognose?: string | null;
  vorher?: string | null;
  aktuell?: string | null;
  aktuellTrend?: 'gut' | 'schlecht' | null;
}

export interface AllokationsGruppe {
  label: string;
  valueEur: number;
  symbole: string[];
}

export interface Dashboard {
  fx: Record<string, number | null>;
  totalEur: number;
  allokation: AllokationsGruppe[];
  gewinnEur: number;
  gewinnPct: number | null;
  dayChangeEur: number;
  dayChangePct: number | null;
  positions: Position[];
  watchlist: WatchItem[];
  termine: Termin[];
}

export interface Sentiment {
  label: 'positive' | 'negative' | 'neutral';
  score?: number;
  unavailable?: boolean;
}

export interface NewsItem {
  title: string;
  link: string;
  source?: string;
  pubDate: string | number | null;
  lang?: string;
  summary?: string | null;
  sentiment?: Sentiment;
  category?: { id: string; label: string };
  betroffen?: { symbol: string; why: string }[];
  reaction?: { dayChangePct: number | null; typischPct?: number | null } | null;
  erklaerung?: string[] | string | null;
}

export interface NewsFeed {
  items: NewsItem[];
  feedErrors: string[];
  gefiltert: number;
}

export interface Candle {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface ChartData {
  intraday: boolean;
  candles: Candle[];
  sma50: { time: string; value: number }[];
  sma200: { time: string; value: number }[];
}

export interface RecoTrend {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface Analysts {
  mean: number;
  key?: string;
  count: number | null;
  trend: RecoTrend[];
  breakdown: RecoTrend | null;
  targets: { low: number | null; mean: number | null; high: number | null; upsidePct: number | null };
}

export interface Rating {
  datum: string | number | null;
  firma: string;
  aktion: string;
  von: string | null;
  zu: string | null;
  kursziel: number | null;
  link?: string;
}

export interface SnowflakePunkt {
  t: string;
  info?: string;
}

export interface Snowflake {
  scores: { wert: number; zukunft: number; vergangenheit: number; bilanz: number; dividende: number };
  staerken: (SnowflakePunkt | string)[];
  risiken: (SnowflakePunkt | string)[];
  fazit: string;
}

export interface Zahlen {
  gemeldet: number | null;
  epsErwartet: number | null;
  epsTatsaechlich: number | null;
  ueberraschungPct: number | null;
}

export interface Trial {
  title: string;
  link: string;
  phases?: string[];
  status?: string;
  completion?: string;
  conditions?: string[];
}

export interface EtfInfo {
  kategorie: string | null;
  ter: number | null;
  familie: string | null;
  topHoldings: { symbol: string; name: string; anteil: number }[];
  sektoren: { sektor: string; anteil: number }[];
}

export interface Analyse {
  symbol: string;
  name: string;
  type: string;
  currency: string;
  kurs: {
    preis: number;
    veraenderungPct: number;
    vortag: number | null;
    eroeffnung: number | null;
    tagesTief: number | null;
    tagesHoch: number | null;
    w52Tief: number | null;
    w52Hoch: number | null;
    volumen: number | null;
    volumenSchnitt: number | null;
    marktkap: number | null;
    zeit: string | number;
    boerse: string | null;
    ausserboerslich: Ausserboerslich | null;
  };
  sektor: string | null;
  branche: string | null;
  uebersicht: {
    beschreibung: string | null;
    website: string | null;
    mitarbeiter: number | null;
    geschaeftsjahresende: string | number | null;
    land: string | null;
  } | null;
  chart: ChartData;
  technik: { score: number; ampel: string; signals: unknown[]; values: unknown } | null;
  fundamental: {
    kgv: number | null;
    kgvForward: number | null;
    kuv: number | null;
    umsatzwachstum: number | null;
    gewinnwachstum: number | null;
    bruttomarge: number | null;
    nettomarge: number | null;
    verschuldung: number | null;
    freeCashflow: number | null;
    dividendenrendite: number | null;
    ausschuettungsquote: number | null;
    marktkapitalisierung: number | null;
  } | null;
  analysts: Analysts | null;
  ratings: Rating[] | null;
  ratingsQuelle?: string;
  kennzahlen: {
    beta: number | null;
    epsTtm: number | null;
    shortFloat: number | null;
    performance?: { woche: number | null; monat: number | null; quartal: number | null; halbjahr: number | null; ytd: number | null; jahr: number | null } | null;
  } | null;
  snowflake: Snowflake | null;
  termine: { earnings: string | number | null; exDividende: string | number | null; dividende: string | number | null };
  zahlen: Zahlen | null;
  etf: EtfInfo | null;
  trials: Trial[] | null;
  news: NewsItem[];
  gesamt: { score: number; ampel: string; components: unknown[] } | null;
}

export interface KalenderEvent {
  titel: string;
  waehrung: string | null;
  land: string | null;
  zeit: string;
  wichtigkeit: 'High' | 'Medium' | 'Low';
  aktuell: string | null;
  aktuellTrend: 'gut' | 'schlecht' | null;
  prognose: string | null;
  vorher: string | null;
}

export interface Kalender {
  quelle: string;
  events: KalenderEvent[];
}

export interface EarningsEvent {
  ticker: string;
  name: string;
  zeit: string;
  epsIst: number | null;
  epsErwartet: number | null;
  ueberraschungPct: number | null;
  marketCap: number | null;
  boerse: string | null;
  land: string | null;
  yahooSymbol: string;
}

export interface EarningsKalender {
  quelle: string;
  events: EarningsEvent[];
}

export interface Feiertag {
  land: string | null;
  boerse: string | null;
  zeit: string;
  titel: string;
}

export interface FeiertagsKalender {
  quelle: string;
  events: Feiertag[];
}

export interface IpoEvent {
  status: 'erwartet' | 'gepreist';
  land?: string | null;
  symbol: string | null;
  firma: string | null;
  boerse: string | null;
  preis: string | null;
  volumenUsd: number | null;
  zeit: string | null;
}

export interface IpoKalender {
  quelle: string;
  events: IpoEvent[];
}

export interface TrendingItem {
  symbol: string;
  name: string;
  tagesPct: number | null;
}

export interface WebLink {
  name: string;
  url: string;
}

// ---------- Client ----------

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* Antwort ohne JSON-Body */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
