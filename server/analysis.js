// Das Kernstück: News kategorisieren, Betroffenheit (Sektor/Positionen)
// zuordnen, mit der Kursbewegung abgleichen und verständlich erklären.
// Außerdem: die Gesamteinschätzung pro Aktie (Technik + Analysten + News + Experten).
import { toTime } from './news.js';

// ---------- Kategorisierung per Schlagwort-Regeln ----------

const CATEGORIES = [
  {
    id: 'earnings',
    label: 'Quartalszahlen',
    words: /\b(earnings|quarterly|q[1-4]\b|revenue|guidance|beats?|miss(es|ed)?|results|quartalszahlen|umsatz|gewinn|prognose|jahreszahlen)\b/i,
  },
  {
    id: 'fed',
    label: 'Fed/Zinsen',
    words: /\b(fed|fomc|powell|interest rates?|rate (cut|hike)|inflation|cpi\b|ezb|zins(en|entscheid|senkung|erhöhung)?|leitzins|notenbank)\b/i,
  },
  {
    id: 'geo',
    label: 'Geopolitik',
    words: /\b(war|krieg|sanction|sanktion|tariff|zoll|zölle|ukraine|taiwan|china trade|middle east|nahost|opec|konflikt|embargo)\b/i,
  },
  {
    id: 'analyst',
    label: 'Analysten-Update',
    words: /\b(upgrade|downgrade|price target|kursziel|initiat(es|ed)|overweight|underweight|buy rating|sell rating|hochgestuft|abgestuft)\b/i,
  },
  {
    id: 'pharma',
    label: 'FDA/Studien',
    words: /\b(fda|ema\b|phase (1|2|3|i{1,3})|clinical trial|studie(n)?ergebnis|zulassung|approval|drug|breakthrough)\b/i,
  },
];

// Kategorie → typischerweise betroffene Sektoren (Yahoo-Sektornamen)
const CATEGORY_SECTORS = {
  fed: ['Technology', 'Real Estate', 'Financial Services'],
  geo: ['Energy', 'Industrials', 'Basic Materials'],
  pharma: ['Healthcare'],
};

export function categorize(title) {
  for (const cat of CATEGORIES) {
    if (cat.words.test(title)) return { id: cat.id, label: cat.label };
  }
  return { id: 'other', label: 'Sonstiges' };
}

// ---------- Betroffenheits-Mapping ----------

// holdings: [{symbol, name, sector}]
export function mapAffected(newsItem, holdings) {
  const title = (newsItem.title || '').toLowerCase();
  const category = newsItem.category?.id;
  const affected = [];

  for (const h of holdings) {
    // (a) Direkte Zuordnung — nur wenn die Schlagzeile Firma oder Ticker
    // wirklich nennt. (Yahoos Ticker-Feeds enthalten auch themenfremde News,
    // deshalb reicht die Feed-Herkunft allein nicht als Beleg.)
    const nameToken = (h.name || '').split(/[ ,.]/)[0].toLowerCase();
    const direct =
      (nameToken.length >= 3 && title.includes(nameToken)) ||
      new RegExp(`\\b${h.symbol.split('.')[0]}\\b`).test(newsItem.title || '');

    // (b) Kategorie→Sektor-Regel
    const bySector = category && h.sector && (CATEGORY_SECTORS[category] || []).includes(h.sector);

    if (direct) affected.push({ symbol: h.symbol, why: 'direkt' });
    else if (bySector) affected.push({ symbol: h.symbol, why: `Sektor ${h.sector}` });
  }
  return affected;
}

// ---------- News ↔ Kursbewegung ----------

// Findet die Tagesveränderung am News-Tag und am Folgetag
export function priceReaction(newsItem, history) {
  const t = toTime(newsItem.pubDate);
  if (!t || !history?.length) return null;
  const day = new Date(t).toISOString().slice(0, 10);

  const idx = history.findIndex((q) => new Date(q.date).toISOString().slice(0, 10) >= day);
  if (idx < 1) return null;

  const changeOf = (i) =>
    i > 0 && i < history.length ? ((history[i].close - history[i - 1].close) / history[i - 1].close) * 100 : null;

  return {
    date: new Date(history[idx].date).toISOString().slice(0, 10),
    dayChangePct: round1(changeOf(idx)),
    nextDayChangePct: round1(changeOf(idx + 1)),
  };
}

const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// Erklärungstext: setzt Sentiment und Kursreaktion in Verbindung
export function explain(newsItem, reaction, symbolName) {
  if (!reaction || reaction.dayChangePct == null) return null;
  const s = newsItem.sentiment?.label;
  const chg = reaction.dayChangePct;
  const dir = chg > 0 ? `+${chg} %` : `${chg} %`;
  const cat = newsItem.category?.label ? ` (${newsItem.category.label})` : '';

  if (s === 'positive' && chg > 0.5)
    return `${symbolName} ${dir} am ${reaction.date} — die positive News${cat} passt zur Kursreaktion.`;
  if (s === 'negative' && chg < -0.5)
    return `${symbolName} ${dir} am ${reaction.date} — die negative News${cat} passt zur Kursreaktion.`;
  if (s === 'positive' && chg < -0.5)
    return `Divergenz: News positiv${cat}, Kurs trotzdem ${dir} — Markt hatte womöglich mehr erwartet oder andere Faktoren überwiegen.`;
  if (s === 'negative' && chg > 0.5)
    return `Divergenz: News negativ${cat}, Kurs trotzdem ${dir} — Schlimmeres war wohl eingepreist oder andere Faktoren überwiegen.`;
  return `${symbolName} ${dir} am ${reaction.date} — kaum Kursreaktion auf diese News${cat}.`;
}

// ---------- Gesamteinschätzung ----------

// Kombiniert alle Komponenten zu einer Ampel. Keine Blackbox:
// jede Komponente wird mit Beitrag und Begründung zurückgegeben.
export function overallAssessment({ technik, analysts, newsSentiments = [], expertSentiments = [] }) {
  const components = [];
  let score = 0;
  let weightSum = 0;

  if (technik) {
    const norm = Math.max(-1, Math.min(1, technik.score / 3)); // -1..1
    score += norm * 3;
    weightSum += 3;
    components.push({
      label: 'Technik',
      weight: 3,
      verdict: verdictOf(norm),
      text: `Technik-Score ${technik.score} (${technik.ampel === 'green' ? 'bullisch' : technik.ampel === 'red' ? 'bärisch' : 'neutral'})`,
    });
  }

  if (analysts?.mean != null) {
    // Yahoo/Finviz-Skala: 1 = Strong Buy … 5 = Strong Sell → -1..1
    const norm = (3 - analysts.mean) / 2;
    score += norm * 3;
    weightSum += 3;
    components.push({
      label: 'Analysten',
      weight: 3,
      verdict: verdictOf(norm),
      text: `Konsens ${analysts.mean.toFixed(1)}/5 (${analysts.count ?? '?'} Analysten)`,
    });
  }

  if (newsSentiments.length) {
    const val = avgSentiment(newsSentiments);
    score += val * 2;
    weightSum += 2;
    const counts = countLabels(newsSentiments);
    components.push({
      label: 'News-Sentiment',
      weight: 2,
      verdict: verdictOf(val),
      text: `${counts.positive}× positiv, ${counts.negative}× negativ, ${counts.neutral}× neutral (letzte News)`,
    });
  }

  if (expertSentiments.length) {
    const val = avgSentiment(expertSentiments);
    // Experten-Meinungen bewusst höher gewichtet als anonyme News
    score += val * 3;
    weightSum += 3;
    const counts = countLabels(expertSentiments);
    components.push({
      label: 'Experten',
      weight: 3,
      verdict: verdictOf(val),
      text: `${counts.positive}× positiv, ${counts.negative}× negativ, ${counts.neutral}× neutral (gespeicherte Experten-Posts)`,
    });
  }

  if (!weightSum) return null;
  const norm = score / weightSum; // -1..1
  return {
    score: Math.round(norm * 100),
    ampel: norm > 0.25 ? 'green' : norm < -0.25 ? 'red' : 'yellow',
    components,
  };
}

const verdictOf = (v) => (v > 0.2 ? 'pos' : v < -0.2 ? 'neg' : 'neutral');

function avgSentiment(list) {
  const vals = list.map((s) => (s.label === 'positive' ? 1 : s.label === 'negative' ? -1 : 0));
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function countLabels(list) {
  const c = { positive: 0, negative: 0, neutral: 0 };
  for (const s of list) c[s.label] = (c[s.label] || 0) + 1;
  return c;
}
