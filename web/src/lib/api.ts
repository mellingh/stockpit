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
  /** Handelstag, auf den sich dayChangeEur bezieht (vor Börsenstart = gestern) */
  letzterHandelstag?: number | null;
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

/** Vergangener Quartalsbericht für die „E"-Marker im Chart (Runde 60) */
export interface EarningsMarke {
  /** Veröffentlichungszeitpunkt (ISO) — dort sitzt der Marker */
  gemeldet: string;
  quartal: string | null;
  zeitraumEnde: string | null;
  epsIst: number | null;
  epsErwartet: number | null;
  ueberraschungPct: number | null;
  umsatz: number | null;
  gewinn: number | null;
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
  termine: { earnings: string | number | null; earningsEpsErwartet?: number | null; exDividende: string | number | null; dividende: string | number | null };
  zahlen: Zahlen | null;
  earningsMarker?: EarningsMarke[];
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
  sektor?: string;
}

export interface WebLink {
  name: string;
  url: string;
}

// ---------- Bewertung ----------

export type Verfahren = 'dcf' | 'multiples' | 'sotp' | 'rnpv' | 'residual';
export type Quelle =
  | 'management_guidance'
  | 'analystenkonsens'
  | 'geschaeftsbericht'
  | 'eigene_schaetzung'
  | 'peer_gruppe';
export type Fall = 'worst' | 'base' | 'best';

/** Eine einzelne Stellschraube mit Herkunft und Stand — die Kerneinheit des Modells. */
export interface Annahme {
  id: string;
  label: string;
  wert: number | null;
  einheit?: 'geld' | 'prozent' | 'faktor' | 'anzahl' | 'jahre';
  quelle: Quelle;
  stand: string | null;
  regel?: string;
  herkunft: 'auto' | 'manuell';
  peers?: number[];
  gruppe?: string | null;
  notiz?: string | null;
  bernoulli?: boolean;
  ueberschrieben?: Partial<Record<Fall, number>>;
}

/** Segment (SOTP) bzw. Produkt/Indikation (rNPV). */
export interface BewertungsZeile {
  id: string;
  name: string;
  indikation?: string | null;
  phase?: string;
  basis?: 'umsatz' | 'ebitda';
  begruendung?: string;
  quelle?: string;
  ueberschneidetMit?: string | null;
  ueberschneidungPct?: number | null;
}

export interface BewertungsModell {
  symbol: string;
  name: string;
  verfahren: Verfahren;
  waehrung: string | null;
  kurs: number | null;
  kursStand: string | null;
  stand: string;
  annahmen: Annahme[];
  zeilen: BewertungsZeile[];
}

export interface Beitrag {
  id: string;
  label: string;
  wert: number;
  anteil: number | null;
}

export interface Warnung {
  stufe: 'rot' | 'gelb' | 'info';
  id: string;
  text: string;
  hinweis: string | null;
}

export interface SensZeile {
  id: string;
  label: string;
  gruppe: string | null;
  gemessen: boolean;
  basis: number;
  hoch: number;
  runter: number;
  spanne: number;
  wirkungPct: number | null;
}

export interface MonteCarlo {
  laeufe: number;
  seed: number;
  p10: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  min: number | null;
  max: number | null;
  mittel: number | null;
  histogramm: { von: number; bis: number; anzahl: number }[];
}

export interface BewertungsErgebnis {
  modell: BewertungsModell;
  stand: string;
  kurs: number | null;
  waehrung: string | null;
  szenarien: Record<Fall, { wertJeAktie: number | null; abweichung: number | null }>;
  beitraege: Beitrag[];
  equity: {
    posten: { id: string; label: string; betrag: number | null; vorzeichen: number }[];
    equityValue: number | null;
    aktienBasis: number;
    aktien: number;
    verwaesserung: number;
    wertJeAktie: number | null;
  };
  kern: {
    enterpriseValue?: number;
    endwertAnteil?: number | null;
    endwertUndefiniert?: boolean;
    barwertExplizit?: number;
    endwert?: number | null;
    brutto?: number;
    abschlag?: number;
    fairesKbv?: number | null;
    jahresreihe?: { jahr: number; umsatz: number; ebit: number; fcf: number; barwert: number }[];
  };
  monteCarlo: MonteCarlo;
  sensitivitaet: { basisWert: number | null; schritt: number; zeilen: SensZeile[]; treiber: SensZeile[] };
  warnungen: Warnung[];
  begruendungen: { regel: string; text: string }[];
  ueberschreibungen: Record<Fall, number>;
  markt: Record<string, number | string | null>;
  /** nur bei einer gespeicherten Bewertung */
  id?: string;
  versionen?: { version: number; zeit: string; notiz: string | null; wertJeAktie: number | null }[];
  /** nur bei der Startabfrage: die unveränderten Yahoo-Werte + Verfahrensvorschlag */
  rohdaten?: Record<string, number | string | null>;
  vorschlag?: { verfahren: Verfahren; grund: string };
  verfahrenListe?: Record<Verfahren, { label: string; lang: string; fuer: string }>;
  regeln?: {
    phasen: { id: string; label: string; pos: number }[];
    gebiete: { id: string; label: string; faktor: number }[];
    rnpvMultiple: { patentgeschuetzt: number; reif: number };
  };
}

/** Ergebnis der Rückwärtsrechnung zu einem Zielkurs. */
export interface ImplizitErwartet {
  art: 'kennzahl' | 'wachstum' | 'rendite';
  /** was nötig wäre (Geldbetrag, Wachstums- oder Renditesatz) */
  noetig: number;
  /** der heutige Stand derselben Größe */
  heute: number | null;
  vielfaches: number | null;
  preis: number;
  /** unterstelltes Jahreswachstum für die Dauer-Angabe */
  tempo: number | null;
  jahre: number | null;
}

/** Antwort der Bewertungs-Route: alle rechenbaren Verfahren plus Gesamtwert. */
export interface BewertungsAntwort {
  symbol: string;
  name: string;
  kurs: number | null;
  kursStand: string | number | null;
  waehrung: string | null;
  /** Umrechnungsfaktor Notierungswährung → EUR (1, wenn schon EUR) */
  eurKurs: number | null;
  /** Kursziel der Analysten als Referenz neben der eigenen Rechnung */
  analysten?: { kursziel: number | null; tief: number | null; hoch: number | null; anzahl: number | null };
  stand: string;
  gesamt: {
    worst: number | null;
    base: number | null;
    best: number | null;
    abweichung: number | null;
    verfahren: Verfahren[];
    einzelwerte: { id: Verfahren; basis: string | null; wertJeAktie: number | null }[];
  };
  verfahren: {
    id: Verfahren;
    basis: string | null;
    grund: string;
    automatisch: boolean;
    modell: BewertungsModell;
    ergebnis: BewertungsErgebnis;
    /** Rückwärtsrechnung: was in Kurs bzw. Analystenziel an Entwicklung steckt */
    eingepreist?: {
      kurs: ImplizitErwartet | null;
      analysten: ImplizitErwartet | null;
    };
  }[];
  /** Verfahren, die für diesen Wert nicht taugen — mit Begründung */
  abgelehnt: { id: Verfahren; grund: string }[];
  /** Verfahren, die Handeingaben brauchen */
  manuell: { id: Verfahren; grund: string }[];
  /** nur bei Healthcare: laufende Programme nach Entwicklungsphase */
  pipeline?: {
    phase: string; label: string; pos: number | null;
    /** verschiedene Krankheitsgebiete in dieser Phase */
    anzahl: number;
    /** laufende bzw. abgeschlossene Studien (ältere Fassungen kennen die Felder nicht) */
    studien?: number; fertige?: number;
    indikationen: string[];
    programme?: { id: string; titel: string; status: string; link: string; indikationen: string[] }[];
    weitere?: number;
  }[] | null;
  /** Summen über alle Phasen — getrenntes Feld, damit gespeicherte Fassungen weiter lesbar bleiben */
  pipelineGesamt?: { laufend: number; abgeschlossen: number; abgebrochen: number } | null;
  /** Kennzahlen-Vergleich mit der Branche: entscheidet über die Stelle in der Peer-Bandbreite */
  qualitaet?: {
    punkte: number;
    geprueft: number;
    schnitt: number;
    perzentile: { worst: number; base: number; best: number };
    kriterien: {
      id: string; label: string; einheit: string; info: string;
      wert: number | null; median: number | null;
      punkte: number | null; urteil: 'besser' | 'aehnlich' | 'schwaecher' | 'unbekannt';
    }[];
  } | null;
  rohdaten: Record<string, unknown>;
  peerGruppe: {
    branche: string;
    /** Quelle hat die Firma in eine Sammelkategorie einsortiert — Gruppe schwächer */
    sammelkategorie?: boolean;
    /** welche Kennzahl das Verfahren nutzt (ebitda/umsatz/umsatzErwartet/gewinn/buchwert) */
    basis?: string | null;
    /** der bewertete Wert selbst, aus derselben Quelle wie die Peers */
    ziel?: { name: string; marktkap: number | null; wachstum: number | null; evUmsatz: number | null; evEbitda: number | null };
    peers: {
      symbol: string;
      name: string;
      marktkap: number | null;
      /** Umsatzwachstum — zeigt, ob die Gruppe vergleichbar wächst */
      wachstum: number | null;
      evUmsatz: number | null;
      evEbitda: number | null;
      kgv: number | null;
      /** aktueller Kurs des Wettbewerbers (nur zur Einordnung) */
      kurs?: number | null;
      /** Kurs, den DIESE Aktie mit dem Vielfachen dieses Wettbewerbers hätte */
      kursFuerZiel?: number | null;
    }[];
  } | null;
  markt: Record<string, number | string | null>;
  verfahrenListe: Record<Verfahren, { label: string; lang: string; fuer: string }>;
  regeln: {
    phasen: { id: string; label: string; pos: number }[];
    gebiete: { id: string; label: string; faktor: number }[];
    rnpvMultiple: { patentgeschuetzt: number; reif: number };
  };
}

export interface BewertungsEintrag {
  id: string;
  symbol: string;
  name: string;
  verfahren: Verfahren | null;
  erstellt: string;
  geaendert: string;
  versionen: number;
  wertJeAktie: number | null;
  kurs: number | null;
  waehrung: string | null;
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
