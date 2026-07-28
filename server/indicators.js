// Technische Indikatoren, selbst berechnet aus der Kurshistorie —
// dieselben Werte, die Finviz/TradingView anzeigen (SMA, RSI, MACD, 52W).
// Fokus: Swing-Trading und Long-Term, kein Day-Trading.

function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function ema(values, n) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    prev = prev == null ? values[i] : values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// RSI(14) mit Wilder-Glättung — wie bei TradingView
function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / n;
  let avgLoss = loss / n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (n - 1) + Math.max(d, 0)) / n;
    avgLoss = (avgLoss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function macd(closes) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const line = closes.map((_, i) => fast[i] - slow[i]);
  const signal = ema(line, 9);
  const i = closes.length - 1;
  return { line: line[i], signal: signal[i], hist: line[i] - signal[i] };
}

// Sucht ein Golden/Death Cross (SMA50 kreuzt SMA200) in den letzten `lookback` Tagen
function findCross(sma50, sma200, lookback = 40) {
  for (let i = sma50.length - 1; i > Math.max(sma50.length - lookback, 1); i--) {
    if (sma50[i] == null || sma200[i] == null || sma50[i - 1] == null || sma200[i - 1] == null) continue;
    const above = sma50[i] > sma200[i];
    const wasAbove = sma50[i - 1] > sma200[i - 1];
    if (above && !wasAbove) return { type: 'golden', daysAgo: sma50.length - 1 - i };
    if (!above && wasAbove) return { type: 'death', daysAgo: sma50.length - 1 - i };
  }
  return null;
}

const pct = (a, b) => ((a - b) / b) * 100;

// Liefert Signale + Ampel-Score. history: [{date, open, high, low, close, volume}]
export function analyzeTechnicals(history) {
  const closes = history.map((q) => q.close);
  if (closes.length < 60) return null;

  const last = closes[closes.length - 1];
  const sma50Series = sma(closes, 50);
  const sma200Series = sma(closes, 200);
  const sma50 = sma50Series[closes.length - 1];
  const sma200 = sma200Series[closes.length - 1];
  const rsiVal = rsi(closes.slice(-260));
  const macdVal = macd(closes);
  const yearSlice = history.slice(-252);
  const high52 = Math.max(...yearSlice.map((q) => q.high ?? q.close));
  const low52 = Math.min(...yearSlice.map((q) => q.low ?? q.close));
  const cross = findCross(sma50Series, sma200Series);

  const signals = [];
  let score = 0;

  // Trend über gleitende Durchschnitte
  if (sma200 != null) {
    if (last > sma50 && sma50 > sma200) {
      score += 2;
      signals.push({ label: 'Trend', verdict: 'pos', text: `Aufwärtstrend: Kurs über SMA50 und SMA200 (${pct(last, sma200).toFixed(1)} % über SMA200)` });
    } else if (last < sma50 && sma50 < sma200) {
      score -= 2;
      signals.push({ label: 'Trend', verdict: 'neg', text: `Abwärtstrend: Kurs unter SMA50 und SMA200 (${pct(last, sma200).toFixed(1)} % unter SMA200)` });
    } else {
      signals.push({ label: 'Trend', verdict: 'neutral', text: 'Seitwärts/uneinheitlich: Kurs zwischen den gleitenden Durchschnitten' });
    }
  } else if (sma50 != null) {
    const above = last > sma50;
    score += above ? 1 : -1;
    signals.push({ label: 'Trend', verdict: above ? 'pos' : 'neg', text: `Kurs ${above ? 'über' : 'unter'} SMA50 (zu wenig Historie für SMA200)` });
  }

  if (cross) {
    const good = cross.type === 'golden';
    score += good ? 1 : -1;
    signals.push({
      label: good ? 'Golden Cross' : 'Death Cross',
      verdict: good ? 'pos' : 'neg',
      text: `${good ? 'Golden' : 'Death'} Cross vor ${cross.daysAgo} Handelstagen (SMA50 ${good ? 'über' : 'unter'} SMA200 gekreuzt) — ${good ? 'bullisches' : 'bärisches'} Langfrist-Signal`,
    });
  }

  if (rsiVal != null) {
    if (rsiVal >= 70) {
      score -= 1;
      signals.push({ label: 'RSI', verdict: 'neg', text: `RSI(14) bei ${rsiVal.toFixed(0)} — überkauft, Rücksetzer möglich` });
    } else if (rsiVal <= 30) {
      score += 1;
      signals.push({ label: 'RSI', verdict: 'pos', text: `RSI(14) bei ${rsiVal.toFixed(0)} — überverkauft, Gegenbewegung möglich` });
    } else {
      signals.push({ label: 'RSI', verdict: 'neutral', text: `RSI(14) bei ${rsiVal.toFixed(0)} — neutraler Bereich` });
    }
  }

  const macdBull = macdVal.hist > 0;
  score += macdBull ? 0.5 : -0.5;
  signals.push({
    label: 'MACD',
    verdict: macdBull ? 'pos' : 'neg',
    text: `MACD-Histogramm ${macdBull ? 'positiv — Aufwärtsmomentum' : 'negativ — Abwärtsmomentum'}`,
  });

  const offHigh = pct(last, high52);
  const offLow = pct(last, low52);
  signals.push({
    label: '52 Wochen',
    verdict: offHigh > -5 ? 'pos' : offLow < 10 ? 'neg' : 'neutral',
    text: `${Math.abs(offHigh).toFixed(1)} % unter 52W-Hoch, ${offLow.toFixed(1)} % über 52W-Tief`,
  });
  if (offHigh > -5) score += 0.5; // nahe Hoch = Stärke
  if (offLow < 10) score -= 0.5;

  const ampel = score >= 1.5 ? 'green' : score <= -1.5 ? 'red' : 'yellow';

  // Performance über Standard-Zeiträume (Handelstage) + Jahresstart
  const perfOver = (n) => (closes.length > n ? pct(last, closes[closes.length - 1 - n]) : null);
  const thisYear = new Date().getFullYear();
  const ytdIdx = history.findIndex((q) => new Date(q.date).getFullYear() === thisYear);
  const sma20Series = sma(closes, 20);
  const sma20 = sma20Series[closes.length - 1];

  const performance = {
    woche: perfOver(5),
    monat: perfOver(21),
    quartal: perfOver(63),
    halbjahr: perfOver(126),
    jahr: perfOver(252),
    ytd: ytdIdx > 0 ? pct(last, history[ytdIdx].close) : null,
  };

  const smaAbstand = {
    sma20: sma20 != null ? pct(last, sma20) : null,
    sma50: sma50 != null ? pct(last, sma50) : null,
    sma200: sma200 != null ? pct(last, sma200) : null,
  };

  return {
    performance,
    smaAbstand,
    score: Math.round(score * 10) / 10,
    ampel,
    signals,
    values: {
      close: last,
      sma50,
      sma200,
      rsi: rsiVal,
      macdHist: macdVal.hist,
      high52,
      low52,
    },
    series: {
      sma50: history.map((q, i) => ({ date: q.date, value: sma50Series[i] })).filter((p) => p.value != null),
      sma200: history.map((q, i) => ({ date: q.date, value: sma200Series[i] })).filter((p) => p.value != null),
    },
  };
}
