// Aktien-Dashboard — lokaler Server.
// Läuft nur auf deinem Rechner (http://localhost:3001), holt kostenlose
// Daten von Yahoo Finance / RSS / clinicaltrials.gov und bewertet News
// mit einer lokalen KI. Kein Login, keine API-Keys, keine Kosten.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cached, MINUTE, HOUR, DAY } from './cache.js';
import * as yahoo from './yahoo.js';
import { analyzeTechnicals } from './indicators.js';
import * as store from './storage.js';
import { getMacroNews, getNewsForSymbols, dedupeAndSort, toTime, MACRO_FEEDS } from './news.js';
import { classify, sentimentStatus, preload } from './sentiment.js';
import { categorize, mapAffected, priceReaction, explain, overallAssessment, isRelevant } from './analysis.js';
import { getTrials } from './trials.js';
import { getCalendar } from './calendar.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor', express.static(path.join(ROOT, 'node_modules/lightweight-charts/dist')));

// Sentiment einer Schlagzeile — pro Titel einen Tag gecacht,
// damit dieselbe News nicht mehrfach durch das Modell läuft.
function classifyCached(title, lang) {
  return cached(`sent:${title}`, DAY, () => classify(title, lang));
}

// Sektor einer Aktie (für das Betroffenheits-Mapping), einen Tag gecacht
async function getSector(symbol) {
  try {
    const summary = await yahoo.getSummary(symbol);
    return summary?.assetProfile?.sector ?? null;
  } catch {
    return null;
  }
}

async function trackedWithSectors() {
  const tracked = store.trackedSymbols();
  const sectors = await Promise.all(tracked.map((t) => getSector(t.symbol)));
  return tracked.map((t, i) => ({ ...t, sector: sectors[i] }));
}

// Yahoo-Kurznamen sind teils mit Leerzeichen aufgefüllt ("SAP SE     I")
const displayName = (quote, fallback) =>
  (quote?.longName || quote?.shortName || fallback || '').replace(/\s{2,}.*/, '').trim() || fallback;

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(`[api] ${req.path}:`, err.message);
    res.status(500).json({ error: err.message });
  });

// ---------- Status & Suche ----------

app.get('/api/status', (req, res) => {
  res.json({ sentiment: sentimentStatus(), feeds: MACRO_FEEDS.map((f) => f.name) });
});

app.get(
  '/api/search',
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const result = await yahoo.search(q);
    res.json(
      (result.quotes || [])
        .filter((x) => x.symbol && ['EQUITY', 'ETF'].includes(x.quoteType))
        .map((x) => ({
          symbol: x.symbol,
          name: x.shortname || x.longname || x.symbol,
          exchange: x.exchDisp,
          type: x.quoteType,
        }))
    );
  })
);

// ---------- Kurshistorie (für Chart-Zeitraum-Wechsel) ----------

const RANGE_DAYS = { '6m': 128, '1y': 255, '5y': 1275 };

function chartPayload(history, technik, range) {
  const n = RANGE_DAYS[range] ?? RANGE_DAYS['1y'];
  const candles = history.slice(-n).map((q) => ({
    time: new Date(q.date).toISOString().slice(0, 10),
    open: q.open,
    high: q.high,
    low: q.low,
    close: q.close,
    volume: q.volume ?? null,
  }));
  const from = candles[0]?.time ?? '';
  const smaSlice = (series) =>
    series
      .map((p) => ({ time: new Date(p.date).toISOString().slice(0, 10), value: Math.round(p.value * 100) / 100 }))
      .filter((p) => p.time >= from);
  return {
    candles,
    sma50: technik ? smaSlice(technik.series.sma50) : [],
    sma200: technik ? smaSlice(technik.series.sma200) : [],
  };
}

app.get(
  '/api/history/:symbol',
  wrap(async (req, res) => {
    const { symbol } = req.params;
    const range = String(req.query.range || '1y');
    const history = await yahoo.getHistory(symbol, range);
    const technik = analyzeTechnicals(history);
    res.json(chartPayload(history, technik, range));
  })
);

// ---------- Komplett-Analyse für eine Aktie / einen ETF ----------

app.get(
  '/api/analyse/:symbol',
  wrap(async (req, res) => {
    const { symbol } = req.params;
    const range = String(req.query.range || '1y');

    const [quote, history, summary] = await Promise.all([
      yahoo.getQuote(symbol),
      yahoo.getHistory(symbol, range),
      yahoo.getSummary(symbol),
    ]);

    const name = displayName(quote, symbol);
    const isEtf = quote.quoteType === 'ETF';
    const technik = analyzeTechnicals(history);

    // Panels aus den Yahoo-Rohdaten
    const sd = summary?.summaryDetail ?? {};
    const fd = summary?.financialData ?? {};
    const ks = summary?.defaultKeyStatistics ?? {};
    const profile = summary?.assetProfile ?? {};

    const fundamental = isEtf
      ? null
      : {
          kgv: sd.trailingPE ?? null,
          kgvForward: sd.forwardPE ?? ks.forwardPE ?? null,
          kuv: sd.priceToSalesTrailing12Months ?? null,
          umsatzwachstum: fd.revenueGrowth ?? null,
          gewinnwachstum: fd.earningsGrowth ?? null,
          bruttomarge: fd.grossMargins ?? null,
          nettomarge: fd.profitMargins ?? null,
          verschuldung: fd.debtToEquity ?? null,
          freeCashflow: fd.freeCashflow ?? null,
          dividendenrendite: sd.dividendYield ?? null,
          ausschuettungsquote: sd.payoutRatio ?? null,
          marktkapitalisierung: quote.marketCap ?? null,
        };

    // Analysten (Yahoo-Konsens = Finviz-"Recom"-Skala 1–5)
    const trend = summary?.recommendationTrend?.trend ?? [];
    const current = trend.find((t) => t.period === '0m') ?? trend[0] ?? null;
    const analysts = fd.recommendationMean
      ? {
          mean: fd.recommendationMean,
          key: fd.recommendationKey,
          count: fd.numberOfAnalystOpinions ?? null,
          trend: trend.slice(0, 4),
          breakdown: current,
          targets: {
            low: fd.targetLowPrice ?? null,
            mean: fd.targetMeanPrice ?? null,
            high: fd.targetHighPrice ?? null,
            upsidePct:
              fd.targetMeanPrice && quote.regularMarketPrice
                ? Math.round(((fd.targetMeanPrice - quote.regularMarketPrice) / quote.regularMarketPrice) * 1000) / 10
                : null,
          },
        }
      : null;

    // Analysten-Historie: einzelne Hoch-/Abstufungen mit Bank-Name.
    // (Kursziele je einzelner Bank gibt es kostenlos nicht — nur den Konsens.)
    const ACTION_LABELS = { up: 'Hochgestuft', down: 'Abgestuft', main: 'Bestätigt', reit: 'Bekräftigt', init: 'Neu aufgenommen' };
    const ratings = (summary?.upgradeDowngradeHistory?.history ?? [])
      .slice(0, 12)
      .map((r) => ({
        datum: r.epochGradeDate ?? null,
        firma: r.firm,
        aktion: ACTION_LABELS[r.action] ?? r.action ?? '',
        von: r.fromGrade || null,
        zu: r.toGrade || null,
      }));

    // Kennzahlen im Finviz-Stil (Yahoo-Rohdaten + eigene Berechnungen)
    const kennzahlen = isEtf
      ? null
      : {
          beta: sd.beta ?? ks.beta ?? null,
          epsTtm: ks.trailingEps ?? null,
          peg: ks.pegRatio ?? null,
          kbv: ks.priceToBook ?? null,
          evEbitda: ks.enterpriseToEbitda ?? null,
          roe: fd.returnOnEquity ?? null,
          roa: fd.returnOnAssets ?? null,
          currentRatio: fd.currentRatio ?? null,
          quickRatio: fd.quickRatio ?? null,
          aktienGesamt: ks.sharesOutstanding ?? null,
          streubesitz: ks.floatShares ?? null,
          insiderAnteil: ks.heldPercentInsiders ?? null,
          institutionenAnteil: ks.heldPercentInstitutions ?? null,
          shortFloat: ks.shortPercentOfFloat ?? null,
          shortRatio: ks.shortRatio ?? null,
          volumen: quote.regularMarketVolume ?? null,
          volumenSchnitt: sd.averageVolume ?? quote.averageDailyVolume3Month ?? null,
          performance: technik?.performance ?? null,
          smaAbstand: technik?.smaAbstand ?? null,
        };

    // Termine
    const cal = summary?.calendarEvents ?? {};
    const termine = {
      earnings: cal.earnings?.earningsDate?.[0] ?? null,
      exDividende: cal.exDividendDate ?? null,
      dividende: cal.dividendDate ?? null,
    };

    // ETF-Panel
    let etf = null;
    if (isEtf) {
      const details = await yahoo.getEtfDetails(symbol);
      const fp = details?.fundProfile ?? {};
      const th = details?.topHoldings ?? {};
      etf = {
        kategorie: fp.categoryName ?? null,
        ter: fp.feesExpensesInvestment?.annualReportExpenseRatio ?? null,
        familie: fp.family ?? null,
        topHoldings: (th.holdings ?? []).slice(0, 10).map((h) => ({
          symbol: h.symbol,
          name: h.holdingName,
          anteil: h.holdingPercent,
        })),
        sektoren: (th.sectorWeightings ?? [])
          .map((s) => {
            const [k, v] = Object.entries(s)[0] ?? [];
            return { sektor: k, anteil: v };
          })
          .filter((s) => s.anteil > 0.001),
      };
    }

    // Klinische Studien bei Healthcare
    let trials = null;
    if (profile.sector === 'Healthcare') {
      trials = await getTrials(name).catch(() => null);
    }

    // News + Sentiment + Kurs-Verknüpfung.
    // Yahoos Ticker-Feed enthält auch themenfremde Artikel — bevorzugt werden
    // Schlagzeilen, die Firma oder Ticker wirklich nennen.
    const rawNews = await yahoo.getTickerNews(symbol).catch(() => []);
    const nameToken = name.split(/[ ,.]/)[0].toLowerCase();
    const baseTicker = new RegExp(`\\b${symbol.split('.')[0]}\\b`);
    const relevant = rawNews.filter(
      (n) => n.title && (n.title.toLowerCase().includes(nameToken) || baseTicker.test(n.title))
    );
    const newsSource = relevant.length >= 3 ? relevant : rawNews;
    const news = [];
    for (const item of dedupeAndSort(newsSource).slice(0, 10)) {
      const sentiment = await classifyCached(item.title, item.lang);
      const category = categorize(item.title);
      const reaction = priceReaction({ ...item }, history);
      const enriched = { ...item, sentiment, category, reaction };
      enriched.erklaerung = explain(enriched, reaction, name);
      news.push(enriched);
    }

    const gesamt = overallAssessment({
      technik,
      analysts,
      newsSentiments: news.map((n) => n.sentiment).filter((s) => !s.unavailable),
    });

    res.json({
      symbol,
      name,
      type: quote.quoteType,
      currency: quote.currency,
      kurs: {
        preis: quote.regularMarketPrice,
        veraenderungPct: quote.regularMarketChangePercent,
        vortag: quote.regularMarketPreviousClose,
        zeit: quote.regularMarketTime,
        boerse: quote.fullExchangeName,
      },
      sektor: profile.sector ?? null,
      branche: profile.industry ?? null,
      beschreibung: profile.longBusinessSummary ? profile.longBusinessSummary.slice(0, 400) : null,
      chart: chartPayload(history, technik, range),
      technik: technik ? { score: technik.score, ampel: technik.ampel, signals: technik.signals, values: technik.values } : null,
      fundamental,
      analysts,
      ratings,
      kennzahlen,
      termine,
      etf,
      trials,
      news,
      gesamt,
    });
  })
);

// ---------- Dashboard (Portfolio + Watchlist) ----------

app.get(
  '/api/dashboard',
  wrap(async (req, res) => {
    const data = store.getData();
    const symbols = [...new Set([...data.positions.map((p) => p.symbol), ...data.watchlist.map((w) => w.symbol)])];
    const quotes = await yahoo.getQuotes(symbols);

    // Wechselkurse aller vorkommenden Währungen → EUR
    const currencies = [...new Set(Object.values(quotes).map((q) => q.currency).filter(Boolean))];
    const fx = {};
    for (const c of currencies) {
      fx[c] = c === 'EUR' ? 1 : await yahoo.getFxRate(c, 'EUR').catch(() => null);
    }

    // Positionen anreichern (Sparkline + Technik-Ampel aus gecachter Historie)
    const positions = await Promise.all(
      data.positions.map(async (pos) => {
        const quote = quotes[pos.symbol];
        const rate = quote ? fx[quote.currency] ?? null : null;
        const price = quote?.regularMarketPrice ?? null;
        const valueEur = price != null && rate != null ? price * pos.shares * rate : null;
        const costEur = pos.buyPrice != null && rate != null ? pos.buyPrice * pos.shares * rate : null;

        let sparkline = [];
        let ampel = null;
        try {
          const history = await yahoo.getHistory(pos.symbol, '6m');
          sparkline = history.slice(-30).map((q) => Math.round(q.close * 100) / 100);
          ampel = analyzeTechnicals(history)?.ampel ?? null;
        } catch {}

        return {
          ...pos,
          name: displayName(quote, pos.name || pos.symbol),
          preis: price,
          waehrung: quote?.currency ?? null,
          tagesPct: quote?.regularMarketChangePercent ?? null,
          valueEur,
          gewinnEur: valueEur != null && costEur != null ? valueEur - costEur : null,
          gewinnPct: valueEur != null && costEur ? ((valueEur - costEur) / costEur) * 100 : null,
          sparkline,
          ampel,
        };
      })
    );

    const watchlist = data.watchlist.map((w) => {
      const quote = quotes[w.symbol];
      return {
        ...w,
        name: displayName(quote, w.name || w.symbol),
        preis: quote?.regularMarketPrice ?? null,
        waehrung: quote?.currency ?? null,
        tagesPct: quote?.regularMarketChangePercent ?? null,
      };
    });

    const totalEur = positions.reduce((s, p) => s + (p.valueEur ?? 0), 0);
    const costEur = positions.reduce(
      (s, p) => s + (p.gewinnEur != null && p.valueEur != null ? p.valueEur - p.gewinnEur : 0),
      0
    );
    const dayChangeEur = positions.reduce((s, p) => {
      if (p.valueEur == null || p.tagesPct == null) return s;
      return s + p.valueEur - p.valueEur / (1 + p.tagesPct / 100);
    }, 0);

    // Termin-Radar: nahende Earnings (nächste 14 Tage)
    const upcoming = [];
    for (const t of store.trackedSymbols()) {
      try {
        const summary = await yahoo.getSummary(t.symbol);
        const earnings = summary?.calendarEvents?.earnings?.earningsDate?.[0];
        if (earnings) {
          const days = Math.round((new Date(earnings) - Date.now()) / DAY);
          if (days >= 0 && days <= 14) upcoming.push({ symbol: t.symbol, name: t.name, date: earnings, days });
        }
      } catch {}
    }
    upcoming.sort((a, b) => a.days - b.days);

    res.json({
      fx,
      totalEur,
      gewinnEur: totalEur - costEur,
      gewinnPct: costEur ? ((totalEur - costEur) / costEur) * 100 : null,
      dayChangeEur,
      dayChangePct: totalEur ? (dayChangeEur / (totalEur - dayChangeEur)) * 100 : null,
      positions,
      watchlist,
      termine: upcoming,
    });
  })
);

// ---------- News-Feed (Dashboard) ----------

app.get(
  '/api/newsfeed',
  wrap(async (req, res) => {
    const holdings = await trackedWithSectors();
    const [tickerNews, macro] = await Promise.all([
      getNewsForSymbols(holdings.map((h) => h.symbol)),
      getMacroNews(),
    ]);

    // Erst kategorisieren + zuordnen, dann Relevanz filtern:
    // Eigene Werte immer, Makro nur bei echten Marktbewegern,
    // Fokus-Sektoren (Fintech/Biotech/Tech) ja, Ratgeber-Müll nie.
    const candidates = dedupeAndSort([...tickerNews, ...macro.items]).map((item) => {
      const enriched = { ...item, category: categorize(item.title) };
      enriched.betroffen = mapAffected(enriched, holdings);
      return enriched;
    });
    const relevant = candidates.filter(isRelevant);

    // Eigene Werte zuerst, innerhalb der Gruppen nach Zeit
    relevant.sort((a, b) => {
      const aDirect = a.betroffen.some((x) => x.why === 'direkt') ? 0 : 1;
      const bDirect = b.betroffen.some((x) => x.why === 'direkt') ? 0 : 1;
      if (aDirect !== bDirect) return aDirect - bDirect;
      return toTime(b.pubDate) - toTime(a.pubDate);
    });

    const out = [];
    for (const enriched of relevant.slice(0, 35)) {
      enriched.sentiment = await classifyCached(enriched.title, enriched.lang);

      // Bei direkter Zuordnung: Kursreaktion + Erklärung
      const direct = enriched.betroffen.find((b) => b.why === 'direkt');
      if (direct) {
        try {
          const history = await yahoo.getHistory(direct.symbol, '6m');
          const reaction = priceReaction(enriched, history);
          enriched.reaction = reaction;
          enriched.erklaerung = explain(
            enriched,
            reaction,
            holdings.find((h) => h.symbol === direct.symbol)?.name ?? direct.symbol
          );
        } catch {}
      }
      out.push(enriched);
    }

    res.json({ items: out, feedErrors: macro.errors, gefiltert: candidates.length - relevant.length });
  })
);

// ---------- Wirtschaftskalender ----------

app.get(
  '/api/calendar',
  wrap(async (req, res) => {
    res.json({ events: await getCalendar() });
  })
);

// ---------- Portfolio & Watchlist verwalten ----------

app.post(
  '/api/positions',
  wrap(async (req, res) => {
    const { symbol, shares, buyPrice, buyDate } = req.body;
    if (!symbol || !shares) return res.status(400).json({ error: 'symbol und shares sind Pflicht' });
    const quote = await yahoo.getQuote(symbol); // validiert das Symbol
    const entry = store.addPosition({
      symbol,
      name: displayName(quote, symbol),
      shares: Number(shares),
      buyPrice: buyPrice != null ? Number(buyPrice) : null,
      currency: quote.currency,
      buyDate: buyDate || null,
    });
    res.json(entry);
  })
);

app.patch('/api/positions/:id', (req, res) => {
  const updated = store.updatePosition(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Position nicht gefunden' });
  res.json(updated);
});

app.delete('/api/positions/:id', (req, res) => {
  store.removePosition(req.params.id);
  res.json({ ok: true });
});

app.post(
  '/api/watchlist',
  wrap(async (req, res) => {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'symbol ist Pflicht' });
    const quote = await yahoo.getQuote(symbol);
    res.json(store.addWatch({ symbol, name: displayName(quote, symbol) }));
  })
);

app.delete('/api/watchlist/:symbol', (req, res) => {
  store.removeWatch(req.params.symbol);
  res.json({ ok: true });
});

// ---------- Start ----------

app.listen(PORT, () => {
  console.log(`\n  Aktien-Dashboard läuft: http://localhost:${PORT}\n`);
  preload(); // Sentiment-Modell im Hintergrund laden
});
