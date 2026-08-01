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
    // "approval"/"zulassung" allein sind zu breit — eine Robotaxi-Genehmigung
    // ("Wins First US Approval") landete sonst als FDA-News im Healthcare-Topf
    words: /\b(fda|ema\b|phase (1|2|3|i{1,3})|clinical trial|studie(n)?ergebnis|drug approval|marktzulassung|arzneimittel|medikament|breakthrough therapy|drug)\b/i,
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

// ---------- Relevanz-Filter für den News-Feed ----------
// Wunsch: primär News zu den eigenen Werten; allgemeine News nur bei echten
// Marktbewegern (Zinsentscheide, Notenbanken, Präsident, große Geopolitik).
// Ratgeber-/Lifestyle-Artikel ("Mein Berater sagt …") fliegen raus.

const MARKET_MOVERS =
  /\b(fed|fomc|powell|ezb|ecb|lagarde|zins(en|entscheid|senkung|erhöhung)?|leitzins|interest rates?|rate (cut|hike|decision)|inflation|cpi\b|ppi\b|nonfarm|jobs report|arbeitsmarktbericht|unemployment|gdp\b|bip\b|rezession|recession|stimulus|treasur(y|ies)|yields?|anleihen|opec|oil price|ölpreis|tariff|zölle|sanction|sanktion|trade (war|deal)|handelsabkommen|president|präsident|white house|weißes haus|trump|shutdown|schuldenobergrenze|debt ceiling|s&p ?500|nasdaq|dow jones|dax\b|börsen?(crash|rally)?|sell-?off|market (rally|slump|rout|crash)|earnings season|berichtssaison|krieg|war\b|ukraine|taiwan|nahost|middle east)\b/i;

const SECTOR_FOCUS =
  /\b(fintech|payment(s)?|zahlungsdienst|neobank|bank(en|ing)?|kredit|crypto|bitcoin|ethereum|blockchain|biotech|pharma|fda|ema\b|drug|medikament|zulassung|clinical|studie|tech(nology)?|software|cloud|chip(s)?|halbleiter|semiconductor|ki\b|künstliche intelligenz|artificial intelligence|\bai\b|data center|rechenzentrum)\b/i;

const JUNK =
  /\b(my (adviser|advisor|friend|husband|wife|mom|dad|brother|sister|son|daughter)|i['’]m \d\d|i am \d\d|inherit(ed|ance)?|medicaid|medicare|social security|401\(k\)|\bIRA\b|retirement (question|plan|dream)|dear (abby|quentin|moneyist)|the moneyist|horoscope|lottery|powerball|best credit cards?|mortgage rates? this week|student loans?|home prices? in|real estate tips|crossword|recipe)\b/i;

// newsItem braucht title + betroffen (aus mapAffected).
// hatWerte: Sobald Positionen/Watchlist existieren, wird der Feed streng —
// nur noch News zu den eigenen Werten plus die ganz großen Marktbeweger.
// Allgemeine Sektor-News gibt es nur, solange das Depot leer ist.
export function isRelevant(newsItem, hatWerte = false) {
  const title = newsItem.title || '';
  const direct = (newsItem.betroffen || []).some((b) => b.why === 'direkt');

  // Eigene Werte: immer relevant
  if (direct) return true;
  // Ratgeber-/Boulevard-Müll: nie
  if (JUNK.test(title)) return false;
  // Große Marktbeweger (Fed, EZB, Inflation, Krieg …): immer
  if (MARKET_MOVERS.test(title)) return true;
  // Mit eigenen Werten: alles andere raus — der Feed soll kurz bleiben
  if (hatWerte) return false;
  // Leeres Depot: Fokus-Sektoren (Fintech/Biotech/Tech) als Startbefüllung
  if (SECTOR_FOCUS.test(title)) return true;
  if ((newsItem.betroffen || []).length) return true;
  return false;
}

// ---------- News ↔ Kursbewegung ----------

// Kursreaktion am News-Tag — inklusive Vergleichsmaßstäben, damit die
// Erklärung später etwas aussagt: Wie groß war die Bewegung für DIESE Aktie?
// Kam Volumen mit? Wie ging es am Folgetag weiter?
export function priceReaction(newsItem, history) {
  const t = toTime(newsItem.pubDate);
  if (!t || !history?.length) return null;
  const day = new Date(t).toISOString().slice(0, 10);

  const idx = history.findIndex((q) => new Date(q.date).toISOString().slice(0, 10) >= day);
  if (idx < 1) return null;

  const changeOf = (i) =>
    i > 0 && i < history.length ? ((history[i].close - history[i - 1].close) / history[i - 1].close) * 100 : null;

  // Typische Tagesschwankung der letzten ~60 Handelstage (mittlere absolute
  // Veränderung) — der Maßstab für "viel" oder "wenig"
  const fenster = history.slice(Math.max(idx - 60, 1), idx);
  const absAenderungen = fenster
    .map((_, i) => changeOf(Math.max(idx - 60, 1) + i))
    .filter((v) => v != null)
    .map(Math.abs);
  const typisch = absAenderungen.length >= 20
    ? absAenderungen.reduce((a, b) => a + b, 0) / absAenderungen.length
    : null;

  // Volumen am News-Tag gegen den Schnitt der Vorwochen
  const volFenster = fenster.map((q) => q.volume).filter((v) => v > 0);
  const volSchnitt = volFenster.length >= 20 ? volFenster.reduce((a, b) => a + b, 0) / volFenster.length : null;
  const volTag = history[idx]?.volume ?? null;

  // Kurs-Kontext: Wo stand die Aktie, als die News kam?
  const closeTag = history[idx].close;
  const fensterLang = history.slice(Math.max(0, idx - 252), idx + 1);
  const hoch = Math.max(...fensterLang.map((q) => q.high ?? q.close));
  const vorwoche = idx >= 6 ? round1(((history[idx - 1].close - history[idx - 6].close) / history[idx - 6].close) * 100) : null;

  return {
    date: new Date(history[idx].date).toISOString().slice(0, 10),
    dayChangePct: round1(changeOf(idx)),
    nextDayChangePct: round1(changeOf(idx + 1)),
    typischPct: typisch != null ? round1(typisch) : null,
    volRel: volSchnitt && volTag ? Math.round((volTag / volSchnitt) * 10) / 10 : null,
    abstandHochPct: hoch > 0 ? round1(((closeTag - hoch) / hoch) * 100) : null,
    langesFenster: fensterLang.length >= 240, // ~1 Handelsjahr → "52-Wochen-Hoch"
    vorwochePct: vorwoche,
  };
}

const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

const fmtPctDe = (v) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')} %`;

// Analytische Einordnung: mehrere konkrete Sätze statt einer Floskel.
// Rückgabe: Array von Sätzen (Frontend rendert sie als eigene Zeilen).
export function explain(newsItem, reaction, symbolName) {
  if (!reaction || reaction.dayChangePct == null) return null;
  const saetze = [];
  const s = newsItem.sentiment?.label;
  const chg = reaction.dayChangePct;
  const stark = Math.abs(chg);
  const typisch = reaction.typischPct;
  const datum = new Date(reaction.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // 1. Was ist passiert — und ist das für DIESE Aktie viel oder wenig?
  if (typisch != null && typisch > 0) {
    const faktor = stark / typisch;
    const einordnung =
      faktor >= 2.5 ? `weit mehr als die üblichen ±${String(typisch).replace('.', ',')} % Tagesschwankung — ein deutlicher Ausschlag`
      : faktor >= 1.5 ? `mehr als die üblichen ±${String(typisch).replace('.', ',')} % Tagesschwankung — eine überdurchschnittliche Reaktion`
      : faktor >= 0.6 ? `im Rahmen der üblichen ±${String(typisch).replace('.', ',')} % Tagesschwankung — nichts Außergewöhnliches`
      : `deutlich unter der üblichen ±${String(typisch).replace('.', ',')} %-Schwankung — der Markt hat kaum reagiert`;
    saetze.push(`${symbolName} schloss am ${datum} bei ${fmtPctDe(chg)}: ${einordnung}.`);
  } else {
    saetze.push(`${symbolName} schloss am ${datum} bei ${fmtPctDe(chg)}.`);
  }

  // 2. Passt die Kursbewegung zur Tonlage der Nachricht?
  const kaum = stark < 0.5 || (typisch != null && typisch > 0 && stark / typisch < 0.6);
  if (kaum) {
    saetze.push(
      s === 'neutral'
        ? 'Nachrichtenton und Kursverlauf passen zusammen: beides ohne klare Richtung.'
        : `Trotz ${s === 'positive' ? 'positiver' : 'negativer'} Tonlage blieb der Kurs ruhig — die Meldung war für den Markt offenbar keine Überraschung oder bereits eingepreist.`
    );
  } else if ((s === 'positive' && chg > 0) || (s === 'negative' && chg < 0)) {
    saetze.push(
      `Die Kursbewegung passt zur ${s === 'positive' ? 'positiven' : 'negativen'} Tonlage der Meldung — sie ist damit eine plausible Erklärung für den Tag${newsItem.category?.id !== 'other' ? ` (Kategorie: ${newsItem.category.label})` : ''}.`
    );
  } else if (s === 'positive' && chg < 0) {
    saetze.push('Auffällige Divergenz: Die Meldung klingt gut, der Kurs fiel trotzdem. Typische Gründe: Die Erwartungen lagen höher, Anleger nehmen Gewinne mit, oder ein stärkerer Faktor (Gesamtmarkt, Sektor) überlagert die Nachricht.');
  } else if (s === 'negative' && chg > 0) {
    saetze.push('Auffällige Divergenz: Die Meldung klingt schlecht, der Kurs stieg trotzdem. Das spricht dafür, dass Schlimmeres befürchtet war, die Nachricht schon im Kurs steckte, oder der Gesamtmarkt kräftig zog.');
  } else {
    saetze.push('Die Meldung selbst ist neutral formuliert — die Bewegung dürfte eher andere Ursachen haben (Gesamtmarkt, Sektor, andere Nachrichten).');
  }

  // 3. Vorgeschichte: Traf die Meldung auf Stärke oder Schwäche?
  if (reaction.vorwochePct != null && Math.abs(reaction.vorwochePct) >= 3) {
    saetze.push(
      `Die Meldung traf auf eine bereits ${reaction.vorwochePct > 0 ? 'starke' : 'schwache'} Phase (${fmtPctDe(reaction.vorwochePct)} in den fünf Handelstagen davor)${
        reaction.vorwochePct < 0 && s === 'negative' ? ' — in so einer Lage wirken schlechte Nachrichten oft stärker nach' :
        reaction.vorwochePct > 0 && s === 'positive' ? ' — gute Nachrichten befeuern einen laufenden Anstieg zusätzlich' : ''
      }.`
    );
  }

  // 4. Das größere Bild: Wo stand die Aktie zu dem Zeitpunkt?
  if (reaction.abstandHochPct != null) {
    const hochWort = reaction.langesFenster ? '52-Wochen-Hoch' : 'Hoch der letzten Monate';
    if (reaction.abstandHochPct <= -30) {
      saetze.push(`Zum Zeitpunkt der Meldung lag der Kurs bereits ${String(Math.abs(reaction.abstandHochPct)).replace('.', ',')} % unter dem ${hochWort} — die Erwartungen waren also schon stark gedrückt.`);
    } else if (reaction.abstandHochPct >= -5) {
      saetze.push(`Der Kurs notierte nahe dem ${hochWort} — dort ist viel Optimismus eingepreist, was Aktien anfälliger für Enttäuschungen macht.`);
    }
  }

  // 5. Kam Volumen mit? (bestätigt oder relativiert die Bewegung)
  if (reaction.volRel != null && !kaum) {
    if (reaction.volRel >= 1.5)
      saetze.push(`Das Handelsvolumen lag bei ${String(reaction.volRel).replace('.', ',')}× des Normalwerts — viele Anleger waren beteiligt, was die Bewegung belastbarer macht.`);
    else if (reaction.volRel <= 0.7)
      saetze.push(`Das Handelsvolumen lag nur bei ${String(reaction.volRel).replace('.', ',')}× des Normalwerts — die Bewegung entstand bei dünnem Handel und ist entsprechend wenig belastbar.`);
  }

  // 6. Wie ging es weiter?
  const next = reaction.nextDayChangePct;
  if (next != null) {
    const gleicheRichtung = (chg > 0 && next > 0) || (chg < 0 && next < 0);
    if (Math.abs(next) < 0.5) saetze.push(`Am Folgetag beruhigte sich der Kurs (${fmtPctDe(next)}).`);
    else if (gleicheRichtung) saetze.push(`Am Folgetag setzte sich die Richtung fort (${fmtPctDe(next)}) — der Markt hat die Nachricht also nicht nur kurz abgehakt.`);
    else saetze.push(`Am Folgetag drehte der Kurs wieder (${fmtPctDe(next)}) — die erste Reaktion war teilweise eine Übertreibung.`);
  }

  return saetze;
}

// ---------- Gesamteinschätzung ----------

// Kombiniert alle Komponenten zu einer Ampel. Keine Blackbox:
// jede Komponente wird mit Beitrag und Begründung zurückgegeben.
export function overallAssessment({ technik, analysts, newsSentiments = [] }) {
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
