// Analyse-Seite: Suche → Komplett-Report mit Chart (inkl. News-Marker),
// Technik-, Analysten-, Fundamental-, Termin-, Studien-/ETF-Panels,
// News mit KI-Sentiment + Kurs-Erklärung.
import { api } from './api.js';
import {
  el, fmtEur, fmtMoney, fmtNum, fmtPct, fmtPctFrac, fmtCompact, fmtDate, fmtAgo,
  signClass, sentimentBadge, categoryBadge, ampelDot, AMPEL_TEXT, attachSearch, markActiveNav, makeExplainable,
} from './ui.js';

markActiveNav();

const $ = (id) => document.getElementById(id);

// replaceChildren wandelt null in den Text "null" um — deshalb immer filtern
const setChildren = (node, ...kids) => node.replaceChildren(...kids.flat().filter(Boolean));

let currentSymbol = null;
let currentCurrency = 'USD';
let chart = null;
let candleSeries = null;
let volumeSeries = null;
let sma50Series = null;
let sma200Series = null;
let tooltip = null;

// ---------- Suche ----------

attachSearch($('search'), (r) => {
  history.replaceState(null, '', `?symbol=${encodeURIComponent(r.symbol)}`);
  loadReport(r.symbol);
});

const params = new URLSearchParams(location.search);
if (params.get('symbol')) loadReport(params.get('symbol'));

// ---------- Chart ----------

function ensureChart() {
  if (chart) return;
  const opts = {
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#807d72',
      fontFamily: "'Spline Sans Mono', monospace",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(44,44,40,0.6)' },
      horzLines: { color: 'rgba(44,44,40,0.6)' },
    },
    crosshair: { mode: 0 },
    rightPriceScale: { borderColor: '#2c2c28' },
    timeScale: { borderColor: '#2c2c28' },
    autoSize: true,
    localization: { locale: 'de-DE' },
  };
  chart = LightweightCharts.createChart($('chart'), opts);
  candleSeries = chart.addCandlestickSeries({
    upColor: '#3fb968',
    downColor: '#e66767',
    wickUpColor: '#3fb968',
    wickDownColor: '#e66767',
    borderVisible: false,
  });
  // Volumen-Balken unten im Chart (eigene, überlagerte Skala)
  volumeSeries = chart.addHistogramSeries({
    priceScaleId: 'vol',
    priceFormat: { type: 'volume' },
    priceLineVisible: false,
    lastValueVisible: false,
  });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
  sma50Series = chart.addLineSeries({ color: '#e5a83b', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  sma200Series = chart.addLineSeries({ color: '#9085e9', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

  // OHLCV-Tooltip beim Überfahren (wie bei Trade Republic)
  tooltip = el('div', { class: 'chart-tooltip' });
  $('chart').style.position = 'relative';
  $('chart').append(tooltip);
  const volFmt = (v) =>
    v == null ? '–' : v >= 1e9 ? `${(v / 1e9).toFixed(2).replace('.', ',')} Mrd.` : v >= 1e6 ? `${(v / 1e6).toFixed(2).replace('.', ',')} Mio.` : new Intl.NumberFormat('de-DE').format(v);
  chart.subscribeCrosshairMove((param) => {
    const bar = param?.seriesData?.get(candleSeries);
    if (!param?.time || !bar || param.point == null) {
      tooltip.style.display = 'none';
      return;
    }
    const vol = param.seriesData.get(volumeSeries)?.value;
    const up = bar.close >= bar.open;
    const date = new Date(param.time).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    tooltip.innerHTML = `
      <div class="tt-date">${date}</div>
      <div class="tt-grid">
        <span>Eröffnung</span><b>${fmtNum(bar.open)}</b>
        <span>Hoch</span><b>${fmtNum(bar.high)}</b>
        <span>Tief</span><b>${fmtNum(bar.low)}</b>
        <span>Schluss</span><b class="${up ? 'pos' : 'neg'}">${fmtNum(bar.close)}</b>
        <span>Volumen</span><b>${volFmt(vol)}</b>
      </div>`;
    tooltip.style.display = 'block';
    const box = $('chart').getBoundingClientRect();
    const x = Math.min(param.point.x + 16, box.width - tooltip.offsetWidth - 8);
    const y = Math.min(param.point.y + 16, box.height - tooltip.offsetHeight - 8);
    tooltip.style.transform = `translate(${Math.max(x, 4)}px, ${Math.max(y, 4)}px)`;
  });
}

function applyChartData(chartData) {
  candleSeries.setData(chartData.candles);
  volumeSeries.setData(
    chartData.candles.map((c) => ({
      time: c.time,
      value: c.volume ?? 0,
      color: c.close >= c.open ? 'rgba(63,185,104,0.35)' : 'rgba(230,103,103,0.35)',
    }))
  );
  sma50Series.setData(chartData.sma50);
  sma200Series.setData(chartData.sma200);
}

function setChartData(chartData, news) {
  ensureChart();
  applyChartData(chartData);

  // News-Marker: pro Handelstag gebündelt (sonst stapeln sie sich),
  // gefärbt nach dominierendem Sentiment
  const firstTime = chartData.candles[0]?.time ?? '';
  const byDay = new Map();
  for (const n of news || []) {
    if (!n.reaction?.date || n.reaction.date < firstTime) continue;
    const day = byDay.get(n.reaction.date) ?? { pos: 0, neg: 0, count: 0 };
    day.count++;
    if (n.sentiment?.label === 'positive') day.pos++;
    if (n.sentiment?.label === 'negative') day.neg++;
    byDay.set(n.reaction.date, day);
  }
  const markers = [...byDay.entries()]
    .map(([time, d]) => {
      const dominant = d.pos > d.neg ? 'positive' : d.neg > d.pos ? 'negative' : 'neutral';
      return {
        time,
        position: 'aboveBar',
        shape: dominant === 'negative' ? 'arrowDown' : dominant === 'positive' ? 'arrowUp' : 'circle',
        color: dominant === 'negative' ? '#e66767' : dominant === 'positive' ? '#3fb968' : '#8a877a',
        text: d.count > 1 ? `${d.count} News` : 'News',
      };
    })
    .sort((a, b) => (a.time < b.time ? -1 : 1));
  candleSeries.setMarkers(markers);
  chart.timeScale().fitContent();
}

// Zeitraum-Wechsel lädt nur den Chart neu
document.querySelectorAll('.chart-toolbar .rng').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (!currentSymbol) return;
    document.querySelectorAll('.chart-toolbar .rng').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    try {
      const data = await api.get(`/api/history/${encodeURIComponent(currentSymbol)}?range=${btn.dataset.range}`);
      applyChartData(data);
      chart.timeScale().fitContent();
    } catch {}
  });
});

// ---------- Report ----------

async function loadReport(symbol) {
  currentSymbol = symbol;
  $('report').hidden = true;
  $('report-error').hidden = true;
  $('report-loading').hidden = false;

  let a;
  try {
    a = await api.get(`/api/analyse/${encodeURIComponent(symbol)}`);
  } catch (err) {
    $('report-loading').hidden = true;
    $('report-error').hidden = false;
    $('report-error').textContent = `Analyse fehlgeschlagen: ${err.message} — Symbol korrekt? Internet verbunden?`;
    return;
  }

  $('report-loading').hidden = true;
  $('report').hidden = false;
  document.title = `Aktien-Cockpit — ${a.name}`;

  // Kopf
  $('r-name').textContent = a.name;
  setChildren($('r-meta'), 
    el('span', { class: 'badge chip' }, a.symbol),
    a.kurs.boerse ? el('span', { class: 'badge' }, a.kurs.boerse) : null,
    a.type === 'ETF' ? el('span', { class: 'badge cat' }, 'ETF') : null,
    a.sektor ? el('span', { class: 'badge' }, a.sektor) : null,
    a.branche ? el('span', { class: 'badge' }, a.branche) : null
  );
  $('r-price').textContent = fmtMoney(a.kurs.preis, a.currency);
  $('r-chg').textContent = `${fmtPct(a.kurs.veraenderungPct)} heute`;
  $('r-chg').className = `chg ${signClass(a.kurs.veraenderungPct)}`;

  // Gesamteinschätzung
  const g = a.gesamt;
  const gCard = $('r-gesamt');
  const gDetail = $('r-gesamt-detail');
  if (g) {
    gCard.replaceChildren(
      ampelDot(g.ampel),
      el('div', {},
        el('div', { class: 'glabel' }, 'Gesamteinschätzung'),
        el('div', { class: 'gscore' }, `${AMPEL_TEXT[g.ampel]} · ${g.score > 0 ? '+' : ''}${g.score}`)
      )
    );
    gDetail.replaceChildren(
      el('h2', { class: 'panel-title' }, 'Wie die Einschätzung zustande kommt'),
      ...g.components.map((c) =>
        el('div', { class: 'sig-row' },
          ampelDot(c.verdict === 'pos' ? 'green' : c.verdict === 'neg' ? 'red' : 'yellow'),
          el('div', {}, el('b', {}, `${c.label} (Gewicht ${c.weight}): `), el('span', { class: 'txt' }, c.text))
        )
      ),
      el('div', { class: 'notice' }, 'Keine Blackbox: Jede Komponente ist einzeln in den Panels darunter nachvollziehbar. Keine Anlageberatung.')
    );
    gCard.onclick = () => (gDetail.hidden = !gDetail.hidden);
  } else {
    gCard.replaceChildren(el('span', { class: 'dim' }, 'Zu wenig Daten für eine Einschätzung'));
  }
  gDetail.hidden = true;

  // Chart
  document.querySelectorAll('.chart-toolbar .rng').forEach((b) => b.classList.toggle('active', b.dataset.range === '1y'));
  setChartData(a.chart, a.news);

  currentCurrency = a.currency;
  renderTechnik(a);
  renderAnalysten(a);
  renderRatings(a);
  renderKennzahlen(a);
  renderFundamental(a);
  renderTermine(a);
  renderNews(a);
  renderExtra(a);
}

// Analysten-Historie: einzelne Banken mit Hoch-/Abstufungen
function renderRatings(a) {
  const box = $('p-ratings');
  if (!a.ratings?.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const latest = a.ratings[0];
  const aktionClass = (r) => (r.aktion === 'Hochgestuft' ? 'pos' : r.aktion === 'Abgestuft' ? 'neg' : '');

  box.replaceChildren(
    el('h2', { class: 'panel-title' }, 'Analysten-Historie', el('span', { class: 'hint' }, ' · einzelne Banken')),
    // "Aktuelle Bewertung" — wie bei Trade Republic
    el('div', { class: 'rating-card' },
      el('dl', { class: 'facts' },
        el('dt', {}, 'Datum'), el('dd', {}, fmtDate(latest.datum)),
        el('dt', {}, 'Analyst'), el('dd', {}, latest.firma || '–'),
        el('dt', {}, 'Aktion'), el('dd', { class: aktionClass(latest) }, latest.aktion || '–'),
        el('dt', {}, 'Rating'), el('dd', {}, latest.von && latest.von !== latest.zu ? `${latest.von} → ${latest.zu}` : latest.zu || '–')
      )
    ),
    el('table', { class: 'data', style: 'margin-top:12px' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Datum'), el('th', {}, 'Analyst'), el('th', {}, 'Aktion'), el('th', {}, 'Rating')
      )),
      el('tbody', {},
        a.ratings.slice(1).map((r) =>
          el('tr', {},
            el('td', { class: 'num', style: 'text-align:left' }, fmtDate(r.datum)),
            el('td', {}, r.firma || '–'),
            el('td', { class: aktionClass(r) }, r.aktion),
            el('td', {}, r.von && r.von !== r.zu ? `${r.von} → ${r.zu}` : r.zu || '–')
          )
        )
      )
    ),
    el('div', { class: 'notice', style: 'margin-top:12px' },
      'Kursziele einzelner Banken sind nur in Bezahl-Datenbanken verfügbar — die Konsens-Spanne steht im Analysten-Panel.')
  );
}

// Kennzahlen im Finviz-Stil
function renderKennzahlen(a) {
  const box = $('p-kennzahlen');
  const k = a.kennzahlen;
  if (!k) {
    box.hidden = true;
    return;
  }
  box.hidden = false;

  const pctCell = (v) => (v == null ? el('dd', {}, '–') : el('dd', { class: signClass(v) }, fmtPct(v)));
  const facts1 = [
    ['Beta', fmtNum(k.beta)],
    ['EPS (12 Mon.)', fmtNum(k.epsTtm)],
    ['PEG', fmtNum(k.peg)],
    ['Kurs/Buchwert', fmtNum(k.kbv)],
    ['EV/EBITDA', fmtNum(k.evEbitda)],
    ['ROE', k.roe != null ? fmtPctFrac(k.roe) : '–'],
    ['ROA', k.roa != null ? fmtPctFrac(k.roa) : '–'],
    ['Current Ratio', fmtNum(k.currentRatio)],
  ];
  const facts2 = [
    ['Aktien gesamt', fmtCompact(k.aktienGesamt)],
    ['Streubesitz', fmtCompact(k.streubesitz)],
    ['Insider-Anteil', k.insiderAnteil != null ? fmtPctFrac(k.insiderAnteil) : '–'],
    ['Institutionen', k.institutionenAnteil != null ? fmtPctFrac(k.institutionenAnteil) : '–'],
    ['Short Float', k.shortFloat != null ? fmtPctFrac(k.shortFloat) : '–'],
    ['Short Ratio', fmtNum(k.shortRatio)],
    ['Volumen heute', fmtCompact(k.volumen)],
    ['Volumen (Ø)', fmtCompact(k.volumenSchnitt)],
  ];

  const perf = k.performance || {};
  const smaAb = k.smaAbstand || {};
  const perfRows = [
    ['Perf. Woche', perf.woche], ['Perf. Monat', perf.monat], ['Perf. Quartal', perf.quartal],
    ['Perf. Halbjahr', perf.halbjahr], ['Perf. seit 1.1.', perf.ytd], ['Perf. Jahr', perf.jahr],
    ['Abstand SMA20', smaAb.sma20], ['Abstand SMA50', smaAb.sma50], ['Abstand SMA200', smaAb.sma200],
  ];

  box.replaceChildren(
    el('h2', { class: 'panel-title' }, 'Kennzahlen', el('span', { class: 'hint' }, ' · Finviz-Stil')),
    el('div', { class: 'facts-2col' },
      el('dl', { class: 'facts' }, facts1.flatMap(([kk, v]) => [el('dt', {}, kk), el('dd', {}, String(v))])),
      el('dl', { class: 'facts' }, facts2.flatMap(([kk, v]) => [el('dt', {}, kk), el('dd', {}, String(v))]))
    ),
    el('div', { class: 'kpi-label', style: 'margin:16px 0 6px' }, 'Performance & Trend-Abstand'),
    el('div', { class: 'facts-2col' },
      el('dl', { class: 'facts' }, perfRows.slice(0, 5).flatMap(([kk, v]) => [el('dt', {}, kk), pctCell(v)])),
      el('dl', { class: 'facts' }, perfRows.slice(5).flatMap(([kk, v]) => [el('dt', {}, kk), pctCell(v)]))
    )
  );
}

// ---------- Panels ----------

function renderTechnik(a) {
  const box = $('p-technik');
  if (!a.technik) {
    box.replaceChildren(el('h2', { class: 'panel-title' }, 'Technik'), el('div', { class: 'empty' }, 'Zu wenig Kurshistorie.'));
    return;
  }
  const t = a.technik;
  box.replaceChildren(
    el('h2', { class: 'panel-title' }, 'Technik ', el('span', { class: 'badge' }, ampelDot(t.ampel), `Score ${t.score > 0 ? '+' : ''}${t.score}`)),
    ...t.signals.map((s) =>
      el('div', { class: 'sig-row' },
        ampelDot(s.verdict === 'pos' ? 'green' : s.verdict === 'neg' ? 'red' : 'yellow'),
        el('div', {}, el('b', {}, `${s.label}: `), el('span', { class: 'txt' }, s.text))
      )
    )
  );
}

const RECO_COLORS = { strongBuy: '#3fb968', buy: '#8fce6f', hold: '#8a877a', sell: '#e0925f', strongSell: '#e66767' };
const RECO_LABELS = { strongBuy: 'Strong Buy', buy: 'Kaufen', hold: 'Halten', sell: 'Verkaufen', strongSell: 'Strong Sell' };

function renderAnalysten(a) {
  const box = $('p-analysten');
  if (!a.analysts) {
    box.replaceChildren(el('h2', { class: 'panel-title' }, 'Analysten'), el('div', { class: 'empty' }, a.type === 'ETF' ? 'Für ETFs gibt es keine Analysten-Ratings.' : 'Keine Analystendaten verfügbar.'));
    return;
  }
  const an = a.analysts;
  const b = an.breakdown || {};
  const total = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].reduce((s, k) => s + (b[k] || 0), 0) || 1;

  const bar = el('div', { class: 'reco-bar' });
  const legend = el('div', { class: 'reco-legend' });
  for (const key of ['strongBuy', 'buy', 'hold', 'sell', 'strongSell']) {
    const count = b[key] || 0;
    if (count > 0) {
      bar.append(el('span', { style: `flex:${count};background:${RECO_COLORS[key]}`, title: `${RECO_LABELS[key]}: ${count}` }));
    }
    legend.append(el('i', {}, el('span', { class: 'sq', style: `background:${RECO_COLORS[key]}` }), `${RECO_LABELS[key]} ${count}`));
  }

  const t = an.targets || {};
  let targetNode = null;
  if (t.low != null && t.high != null && t.high > t.low) {
    const pos = (v) => `${(((v - t.low) / (t.high - t.low)) * 100).toFixed(1)}%`;
    const now = a.kurs.preis;
    targetNode = el('div', { class: 'target-range' },
      el('div', { class: 'kpi-label', style: 'margin-bottom:10px' }, 'Kursziele der Analysten'),
      el('div', { class: 'target-track' },
        el('span', { class: 'fill', style: `left:0;right:0` }),
        now != null && now >= t.low && now <= t.high ? el('span', { class: 'tick-now', style: `left:${pos(now)}`, title: `Aktueller Kurs ${fmtMoney(now, a.currency)}` }) : null,
        t.mean != null ? el('span', { class: 'tick-mean', style: `left:${pos(t.mean)}`, title: `Ø-Kursziel ${fmtMoney(t.mean, a.currency)}` }) : null
      ),
      el('div', { class: 'target-labels' },
        el('span', {}, `Tief ${fmtNum(t.low)}`),
        el('span', { style: 'color:var(--accent)' }, `Ø ${fmtNum(t.mean)} (${fmtPct(t.upsidePct)})`),
        el('span', {}, `Hoch ${fmtNum(t.high)}`)
      )
    );
  }

  setChildren(box,
    el('h2', { class: 'panel-title' }, 'Analysten ', el('span', { class: 'hint' }, `· ${an.count ?? '?'} Analysten`)),
    el('div', { style: 'display:flex;align-items:baseline;gap:12px' },
      el('span', { class: 'kpi-value small', style: 'font-size:30px' }, an.mean?.toFixed(1)),
      el('span', { class: 'dim' }, '/ 5 · Konsens (1 = Strong Buy)'),
      el('span', { class: `badge ${an.mean <= 2 ? 's-pos' : an.mean >= 3.5 ? 's-neg' : 's-neu'}` }, (an.key || '').replace('_', ' '))
    ),
    bar,
    legend,
    targetNode
  );
}

function renderFundamental(a) {
  const box = $('p-fundamental');
  if (a.type === 'ETF' && a.etf) {
    const rows = [
      ['Kategorie', a.etf.kategorie ?? '–'],
      ['Anbieter', a.etf.familie ?? '–'],
      ['Kostenquote (TER)', a.etf.ter != null ? fmtPctFrac(a.etf.ter) : '–'],
    ];
    box.replaceChildren(
      el('h2', { class: 'panel-title' }, 'ETF-Profil'),
      el('dl', { class: 'facts' }, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))]))
    );
    return;
  }
  if (!a.fundamental) {
    box.replaceChildren(el('h2', { class: 'panel-title' }, 'Fundamental'), el('div', { class: 'empty' }, 'Keine Fundamentaldaten.'));
    return;
  }
  const f = a.fundamental;
  const rows = [
    ['Marktkapitalisierung', f.marktkapitalisierung != null ? `${fmtCompact(f.marktkapitalisierung)} ${a.currency}` : '–'],
    ['KGV (aktuell)', fmtNum(f.kgv)],
    ['KGV (erwartet)', fmtNum(f.kgvForward)],
    ['Kurs/Umsatz', fmtNum(f.kuv)],
    ['Umsatzwachstum', fmtPctFrac(f.umsatzwachstum)],
    ['Gewinnwachstum', fmtPctFrac(f.gewinnwachstum)],
    ['Bruttomarge', fmtPctFrac(f.bruttomarge)],
    ['Nettomarge', fmtPctFrac(f.nettomarge)],
    ['Verschuldung (Debt/Equity)', f.verschuldung != null ? fmtNum(f.verschuldung, 0) + ' %' : '–'],
    ['Free Cashflow', f.freeCashflow != null ? `${fmtCompact(f.freeCashflow)} ${a.currency}` : '–'],
    ['Dividendenrendite', f.dividendenrendite != null ? fmtPct(f.dividendenrendite, false) : '–'],
    ['Ausschüttungsquote', fmtPctFrac(f.ausschuettungsquote)],
  ];
  box.replaceChildren(
    el('h2', { class: 'panel-title' }, 'Fundamental'),
    el('dl', { class: 'facts' }, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))]))
  );
}

function renderTermine(a) {
  const box = $('p-termine');
  const rows = [
    ['Nächste Quartalszahlen', fmtDate(a.termine?.earnings)],
    ['Ex-Dividende', fmtDate(a.termine?.exDividende)],
    ['Dividendenzahlung', fmtDate(a.termine?.dividende)],
  ];
  const children = [
    el('h2', { class: 'panel-title' }, 'Termine'),
    el('dl', { class: 'facts' }, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
  ];
  if (a.termine?.earnings) {
    const days = Math.round((new Date(a.termine.earnings) - Date.now()) / 86400000);
    if (days >= 0 && days <= 14) {
      children.push(el('div', { class: 'notice' }, `⚠ Quartalszahlen ${days === 0 ? 'heute' : `in ${days} Tag${days === 1 ? '' : 'en'}`} — erhöhte Kursschwankungen möglich.`));
    }
  }
  if (a.beschreibung) children.push(el('p', { style: 'font-size:13px;color:var(--ink-3);margin:12px 0 0' }, a.beschreibung + ' …'));
  box.replaceChildren(...children);
}

function renderNews(a) {
  const box = $('p-news');
  const children = [el('h2', { class: 'panel-title' }, `News zu ${a.name}`, el('span', { class: 'hint' }, ' · KI-bewertet, mit Kursreaktion'))];
  if (!a.news?.length) {
    children.push(el('div', { class: 'empty' }, 'Keine aktuellen News gefunden.'));
  } else {
    children.push(
      ...a.news.map((n) =>
        el('article', { class: 'news-item' },
          el('div', { class: 'news-meta' }, el('span', {}, n.source || '—'), el('span', {}, fmtAgo(n.pubDate))),
          el('div', { class: 'news-title' }, el('a', { href: n.link, target: '_blank', rel: 'noopener' }, n.title)),
          makeExplainable(
            el('div', { class: 'news-badges' },
              sentimentBadge(n.sentiment),
              categoryBadge(n.category),
              n.reaction?.dayChangePct != null
                ? el('span', { class: `badge ${signClass(n.reaction.dayChangePct)}` }, `Kurs am Tag: ${fmtPct(n.reaction.dayChangePct)}`)
                : null
            ),
            n
          ),
          n.erklaerung ? el('div', { class: 'news-explain' }, n.erklaerung) : null
        )
      )
    );
  }
  box.replaceChildren(...children);
}

function renderExtra(a) {
  const box = $('p-extra');
  // Klinische Studien (Healthcare)
  if (a.trials?.length) {
    box.hidden = false;
    box.replaceChildren(
      el('h2', { class: 'panel-title' }, 'Klinische Studien', el('span', { class: 'hint' }, ' · clinicaltrials.gov')),
      ...a.trials.slice(0, 8).map((t) =>
        el('div', { class: 'trial' },
          el('div', { class: 't-meta' },
            el('span', { class: 'badge cat' }, (t.phases || []).join(' / ') || 'Phase –'),
            el('span', { class: 'badge' }, t.status || ''),
            t.completion ? el('span', {}, `Abschluss ~ ${t.completion}`) : null
          ),
          el('div', {}, el('a', { href: t.link, target: '_blank', rel: 'noopener' }, t.title)),
          t.conditions?.length ? el('div', { class: 'sym' }, t.conditions.join(' · ')) : null
        )
      )
    );
    return;
  }
  // ETF: Top-Positionen + Sektoren
  if (a.type === 'ETF' && a.etf && (a.etf.topHoldings?.length || a.etf.sektoren?.length)) {
    box.hidden = false;
    box.replaceChildren(
      el('h2', { class: 'panel-title' }, 'Im ETF enthalten'),
      a.etf.topHoldings?.length
        ? el('dl', { class: 'facts' },
            a.etf.topHoldings.flatMap((h) => [
              el('dt', {}, `${h.name || h.symbol}`),
              el('dd', {}, fmtPctFrac(h.anteil)),
            ])
          )
        : null,
      a.etf.sektoren?.length
        ? el('div', { style: 'margin-top:14px' },
            el('div', { class: 'kpi-label', style: 'margin-bottom:8px' }, 'Sektorgewichtung'),
            el('dl', { class: 'facts' },
              a.etf.sektoren.slice(0, 8).flatMap((s) => [el('dt', {}, s.sektor), el('dd', {}, fmtPctFrac(s.anteil))])
            )
          )
        : null
    );
    return;
  }
  box.hidden = true;
}
