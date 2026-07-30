// Analyse-Seite: Suche → Komplett-Report mit Chart (inkl. News-Marker),
// Technik-, Analysten-, Fundamental-, Termin-, Studien-/ETF-Panels,
// News mit KI-Sentiment + Kurs-Erklärung.
import { api } from './api.js';
import {
  el, fmtEur, fmtMoney, fmtNum, fmtPct, fmtPctFrac, fmtCompact, fmtDate, fmtAgo,
  signClass, ampelDot, AMPEL_TEXT, attachSearch, markActiveNav, newsSummaryLine,
  radarChart, collapsible,
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
      textColor: '#7b8294',
      fontFamily: "'Spline Sans Mono', monospace",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(38,44,58,0.6)' },
      horzLines: { color: 'rgba(38,44,58,0.6)' },
    },
    crosshair: { mode: 0 },
    rightPriceScale: { borderColor: '#262c3a' },
    timeScale: { borderColor: '#262c3a' },
    // Verhalten wie TradingView: Rad zoomt, Ziehen scrollt,
    // Ziehen auf den Achsen skaliert Preis-/Zeitachse
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: true,
    },
    autoSize: true,
    localization: { locale: 'de-DE' },
  };
  chart = LightweightCharts.createChart($('chart'), opts);
  candleSeries = chart.addCandlestickSeries({
    upColor: '#22c07e',
    downColor: '#f0616d',
    wickUpColor: '#22c07e',
    wickDownColor: '#f0616d',
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

  // OHLC-Zeile oben links im Chart (TradingView-Stil), folgt dem Fadenkreuz
  tooltip = el('div', { class: 'chart-ohlc' });
  $('chart').style.position = 'relative';
  $('chart').append(tooltip);
  const volFmt = (v) =>
    v == null ? '–' : v >= 1e9 ? `${(v / 1e9).toFixed(2).replace('.', ',')} Mrd.` : v >= 1e6 ? `${(v / 1e6).toFixed(2).replace('.', ',')} Mio.` : new Intl.NumberFormat('de-DE').format(v);

  window.__setOhlc = (bar, vol) => {
    if (!bar) {
      tooltip.replaceChildren();
      return;
    }
    const up = bar.close >= bar.open;
    const chg = bar.open ? ((bar.close - bar.open) / bar.open) * 100 : null;
    const cls = up ? 'pos' : 'neg';
    tooltip.replaceChildren(
      el('span', {}, 'O ', el('b', { class: cls }, fmtNum(bar.open))),
      el('span', {}, 'H ', el('b', { class: cls }, fmtNum(bar.high))),
      el('span', {}, 'T ', el('b', { class: cls }, fmtNum(bar.low))),
      el('span', {}, 'S ', el('b', { class: cls }, fmtNum(bar.close))),
      chg != null ? el('b', { class: cls }, ` ${fmtPct(chg)}`) : null,
      el('span', { class: 'ohlc-vol' }, ' Vol ', el('b', {}, volFmt(vol)))
    );
  };

  chart.subscribeCrosshairMove((param) => {
    const bar = param?.seriesData?.get(candleSeries);
    if (!param?.time || !bar) {
      window.__setOhlc(lastBar, lastBar?.volume);
      return;
    }
    window.__setOhlc(bar, param.seriesData.get(volumeSeries)?.value);
  });
}

let lastBar = null;

function applyChartData(chartData) {
  candleSeries.setData(chartData.candles);
  volumeSeries.setData(
    chartData.candles.map((c) => ({
      time: c.time,
      value: c.volume ?? 0,
      color: c.close >= c.open ? 'rgba(34,192,126,0.35)' : 'rgba(240,97,109,0.35)',
    }))
  );
  sma50Series.setData(chartData.sma50);
  sma200Series.setData(chartData.sma200);
  // Intraday: Uhrzeiten auf der Zeitachse zeigen
  chart.timeScale().applyOptions({ timeVisible: !!chartData.intraday, secondsVisible: false });
  // OHLC-Zeile mit der letzten Kerze vorbelegen
  lastBar = chartData.candles[chartData.candles.length - 1] ?? null;
  window.__setOhlc?.(lastBar, lastBar?.volume);
}

function setChartData(chartData) {
  ensureChart();
  applyChartData(chartData);
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
  document.title = `Stockpit — ${a.name}`;

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

  // Gesamteinschätzung: nur das Urteil — Klick springt zur Einordnung
  // (Stärken/Risiken + Snowflake in der Übersichtskarte)
  const g = a.gesamt;
  const gCard = $('r-gesamt');
  if (g) {
    const scoreCls = g.ampel === 'green' ? 'pos' : g.ampel === 'red' ? 'neg' : '';
    gCard.replaceChildren(
      el('div', {},
        el('div', { class: 'glabel' }, 'Gesamteinschätzung'),
        el('div', { class: `gscore ${scoreCls}` }, AMPEL_TEXT[g.ampel]),
        el('div', { class: 'gsub' }, 'zur Einordnung ↓')
      )
    );
    gCard.title = 'Zur Einordnung springen (Stärken, Risiken, Snowflake)';
    gCard.onclick = () => {
      const ziel = document.getElementById('p-uebersicht');
      if (ziel && !ziel.hidden) ziel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  } else {
    gCard.replaceChildren(el('span', { class: 'dim' }, 'Zu wenig Daten für eine Einschätzung'));
  }

  // Chart
  document.querySelectorAll('.chart-toolbar .rng').forEach((b) => b.classList.toggle('active', b.dataset.range === '1y'));
  setChartData(a.chart);

  currentCurrency = a.currency;
  renderQuoteStrip(a);
  renderTechnik(a);
  renderAnalysten(a);
  renderRatings(a);
  renderKennzahlen(a);
  renderFundamental(a);
  renderUebersicht(a);
  renderNews(a);
  renderExtra(a);
}

// Wichtigste Metriken horizontal unter dem Chart (Yahoo-Stil)
function renderQuoteStrip(a) {
  const box = $('p-quotestrip');
  const k = a.kurs;
  const spanne = (lo, hi) => (lo != null && hi != null ? `${fmtNum(lo)} – ${fmtNum(hi)}` : '–');
  const zellen = [
    ['Kurs Vortag', fmtNum(k.vortag)],
    ['Eröffnung', fmtNum(k.eroeffnung)],
    ['Tagesspanne', spanne(k.tagesTief, k.tagesHoch)],
    ['52-Wochen-Spanne', spanne(k.w52Tief, k.w52Hoch)],
    ['Volumen', fmtCompact(k.volumen)],
    ['Ø-Volumen', fmtCompact(k.volumenSchnitt)],
    ['Marktkap.', k.marktkap != null ? `${fmtCompact(k.marktkap)} ${a.currency}` : '–'],
    ['Beta', fmtNum(a.kennzahlen?.beta)],
    ['KGV (12 Mon.)', fmtNum(a.fundamental?.kgv)],
    ['KGV (erwartet)', fmtNum(a.fundamental?.kgvForward)],
    ['EPS (12 Mon.)', fmtNum(a.kennzahlen?.epsTtm)],
    ['Umsatzwachstum', a.fundamental?.umsatzwachstum != null ? fmtPctFrac(a.fundamental.umsatzwachstum) : '–'],
    ['Nettomarge', a.fundamental?.nettomarge != null ? fmtPctFrac(a.fundamental.nettomarge) : '–'],
    ['Nächste Zahlen', fmtDate(a.termine?.earnings)],
    ['Dividendenrendite', a.fundamental?.dividendenrendite != null ? fmtPct(a.fundamental.dividendenrendite, false) : '–'],
    ['Ex-Dividende', fmtDate(a.termine?.exDividende)],
    ['Ø-Kursziel', a.analysts?.targets?.mean != null ? fmtNum(a.analysts.targets.mean) : '–'],
  ];
  box.hidden = false;
  box.replaceChildren(
    el('div', { class: 'quote-strip' },
      zellen.map(([label, wert]) =>
        el('div', { class: 'qs-cell' }, el('span', { class: 'qs-label' }, label), el('span', { class: 'qs-value' }, String(wert)))
      )
    )
  );
}

// Firmen-Übersicht + Snowflake-Analyse (Simply-Wall-St-Stil) als Querkarte
function renderUebersicht(a) {
  const box = $('p-uebersicht');
  const u = a.uebersicht;
  const sf = a.snowflake;
  if ((!u || !u.beschreibung) && !sf) {
    box.hidden = true;
    return;
  }
  box.hidden = false;

  // Linke Seite: Kurzbeschreibung + Stärken/Risiken
  const kurz = u?.beschreibung && u.beschreibung.length > 260 ? u.beschreibung.slice(0, 260) + ' …' : u?.beschreibung;
  const links = el('div', { class: 'ov-links' },
    el('p', { class: 'uebersicht-text' }, kurz || ''),
    sf?.staerken?.length
      ? el('div', {},
          el('div', { class: 'kpi-label', style: 'margin:10px 0 6px' }, 'Stärken'),
          sf.staerken.map((t) => el('div', { class: 'ov-punkt pos' }, '▲ ', t))
        )
      : null,
    sf?.risiken?.length
      ? el('div', {},
          el('div', { class: 'kpi-label', style: 'margin:10px 0 6px' }, 'Risiken'),
          sf.risiken.map((t) => el('div', { class: 'ov-punkt neg' }, '▼ ', t))
        )
      : null
  );

  // Rechte Seite: Snowflake-Radar + Fazit
  const rechts = sf
    ? el('div', { class: 'ov-rechts' },
        radarChart([
          { label: 'WERT', value: sf.scores.wert },
          { label: 'ZUKUNFT', value: sf.scores.zukunft },
          { label: 'VERGANGENH.', value: sf.scores.vergangenheit },
          { label: 'BILANZ', value: sf.scores.bilanz },
          { label: 'DIVIDENDE', value: sf.scores.dividende },
        ]),
        el('div', { class: 'ov-fazit' }, sf.fazit)
      )
    : null;

  // Aufklappbarer Detail-Teil (Yahoo-Stil): volle Beschreibung + Firmenfakten
  const fakten = [
    u?.mitarbeiter != null ? [fmtNum(u.mitarbeiter, 0), 'Vollzeitmitarbeiter'] : null,
    u?.geschaeftsjahresende ? [new Date(u.geschaeftsjahresende).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }), 'Geschäftsjahresende'] : null,
    a.sektor ? [a.sektor, 'Sektor'] : null,
    a.branche ? [a.branche, 'Branche'] : null,
  ].filter(Boolean);
  const detail = collapsible(
    'Mehr zur Firma',
    el('div', { style: 'padding-top:10px' },
      u?.beschreibung ? el('p', { class: 'uebersicht-text' }, u.beschreibung) : null,
      u?.website ? el('a', { href: u.website, target: '_blank', rel: 'noopener', style: 'font-size:13px' }, u.website.replace(/^https?:\/\/(www\.)?/, '')) : null,
      fakten.length
        ? el('div', { class: 'uebersicht-fakten' },
            fakten.map(([wert, label]) => el('div', {}, el('div', { class: 'uf-wert' }, wert), el('div', { class: 'uf-label' }, label)))
          )
        : null
    )
  );

  setChildren(box,
    el('h2', { class: 'panel-title' }, `${a.name} — Übersicht`, sf ? el('span', { class: 'hint' }, ' · Snowflake: 5 Dimensionen à 0–5 Punkte') : null),
    el('div', { class: 'ov-wrap' }, links, rechts),
    detail
  );
}

// Analysten-Historie: volle Breite, mit Kursziel je Bank (stockanalysis.com)
function renderRatings(a) {
  const box = $('p-ratings');
  if (!a.ratings?.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const latest = a.ratings[0];
  const aktionClass = (r) => (r.aktion === 'Hochgestuft' ? 'pos' : r.aktion === 'Abgestuft' ? 'neg' : '');
  const hatKursziele = a.ratings.some((r) => r.kursziel != null);

  const zeile = (r) =>
    el('tr', {},
      el('td', { class: 'num', style: 'text-align:left' }, fmtDate(r.datum)),
      el('td', {},
        r.link
          ? el('a', { href: r.link, target: '_blank', rel: 'noopener', title: 'Einschätzung beim Analysten nachlesen' }, r.firma || '–')
          : r.firma || '–'
      ),
      el('td', { class: aktionClass(r) }, r.aktion),
      el('td', {}, r.von && r.von !== r.zu ? `${r.von} → ${r.zu}` : r.zu || '–'),
      hatKursziele ? el('td', { class: 'num' }, r.kursziel != null ? fmtMoney(r.kursziel, a.currency) : '–') : null
    );

  const kopf = el('thead', {}, el('tr', {},
    el('th', {}, 'Datum'), el('th', {}, 'Analyst'), el('th', {}, 'Aktion'), el('th', {}, 'Rating'),
    hatKursziele ? el('th', { class: 'num' }, 'Kursziel') : null
  ));

  // Kompakt: die neueste Bewertung ist einfach Zeile 1 der Tabelle
  const erste = a.ratings.slice(0, 6);
  const rest = a.ratings.slice(6);
  const tbody = el('tbody', {}, erste.map(zeile));
  let mehrBtn = null;
  if (rest.length) {
    mehrBtn = el('button', { class: 'btn ghost small', type: 'button', style: 'margin-top:10px', onclick: () => {
      rest.forEach((r) => tbody.append(zeile(r)));
      mehrBtn.remove();
    } }, `${rest.length} ältere anzeigen`);
  }

  setChildren(box,
    el('h2', { class: 'panel-title' }, 'Analysten-Historie',
      el('span', { class: 'hint' }, ` · einzelne Banken · Quelle: ${a.ratingsQuelle || '–'}`)),
    el('div', { class: 'table-scroll', style: 'margin-top:0' }, el('table', { class: 'data compact' }, kopf, tbody)),
    mehrBtn,
    !hatKursziele ? el('div', { class: 'notice', style: 'margin-top:10px' }, 'Für diesen Wert sind keine Kursziele je Bank frei verfügbar — die Konsens-Spanne steht im Analysten-Panel.') : null
  );
}

// Kennzahlen im Finviz-Stil — aufklappbar, um Platz zu sparen
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

  // Fundamentaldaten (ehem. eigenes Panel) — vollständig im Akkordeon
  const f = a.fundamental;
  const fundamentalRows = f
    ? [
        ['Kurs/Umsatz', fmtNum(f.kuv)],
        ['Gewinnwachstum', fmtPctFrac(f.gewinnwachstum)],
        ['Bruttomarge', fmtPctFrac(f.bruttomarge)],
        ['Nettomarge', fmtPctFrac(f.nettomarge)],
        ['Verschuldung (Debt/Equity)', f.verschuldung != null ? fmtNum(f.verschuldung, 0) + ' %' : '–'],
        ['Free Cashflow', f.freeCashflow != null ? `${fmtCompact(f.freeCashflow)} ${a.currency}` : '–'],
        ['Umsatzwachstum', fmtPctFrac(f.umsatzwachstum)],
        ['KGV (aktuell)', fmtNum(f.kgv)],
        ['KGV (erwartet)', fmtNum(f.kgvForward)],
        ['Dividendenrendite', f.dividendenrendite != null ? fmtPct(f.dividendenrendite, false) : '–'],
        ['Ausschüttungsquote', fmtPctFrac(f.ausschuettungsquote)],
      ]
    : [];

  setChildren(box,
    el('h2', { class: 'panel-title' }, 'Kennzahlen', el('span', { class: 'hint' }, ' · Finviz-Stil')),
    el('div', { class: 'kpi-label', style: 'margin:0 0 6px' }, 'Performance & Trend-Abstand'),
    el('div', { class: 'facts-2col' },
      el('dl', { class: 'facts' }, perfRows.slice(0, 5).flatMap(([kk, v]) => [el('dt', {}, kk), pctCell(v)])),
      el('dl', { class: 'facts' }, perfRows.slice(5).flatMap(([kk, v]) => [el('dt', {}, kk), pctCell(v)]))
    ),
    collapsible('Alle Kennzahlen & Fundamentaldaten anzeigen',
      el('div', { style: 'padding-top:10px' },
        el('div', { class: 'facts-2col' },
          el('dl', { class: 'facts' }, facts1.flatMap(([kk, v]) => [el('dt', {}, kk), el('dd', {}, String(v))])),
          el('dl', { class: 'facts' }, facts2.flatMap(([kk, v]) => [el('dt', {}, kk), el('dd', {}, String(v))]))
        ),
        fundamentalRows.length
          ? el('div', {},
              el('div', { class: 'kpi-label', style: 'margin:14px 0 6px' }, 'Fundamentaldaten'),
              el('div', { class: 'facts-2col' },
                el('dl', { class: 'facts' }, fundamentalRows.slice(0, 6).flatMap(([kk, v]) => [el('dt', {}, kk), el('dd', {}, String(v))])),
                el('dl', { class: 'facts' }, fundamentalRows.slice(6).flatMap(([kk, v]) => [el('dt', {}, kk), el('dd', {}, String(v))]))
              )
            )
          : null
      )
    )
  );
}

function renderTechnik(a) {
  const box = $('p-technik');
  if (!a.technik) {
    box.replaceChildren(el('h2', { class: 'panel-title' }, 'Technik'), el('div', { class: 'empty' }, 'Zu wenig Kurshistorie.'));
    return;
  }
  const t = a.technik;
  const verdictCls = t.ampel === 'green' ? 's-pos' : t.ampel === 'red' ? 's-neg' : 's-neu';
  box.replaceChildren(
    el('h2', { class: 'panel-title' }, 'Technisches Bild ', el('span', { class: `badge ${verdictCls}` }, ampelDot(t.ampel), AMPEL_TEXT[t.ampel])),
    ...t.signals.map((s) =>
      el('div', { class: 'sig-row' },
        ampelDot(s.verdict === 'pos' ? 'green' : s.verdict === 'neg' ? 'red' : 'yellow'),
        el('div', {}, el('b', {}, `${s.label}: `), el('span', { class: 'txt' }, s.text))
      )
    )
  );
}

const RECO_COLORS = { strongBuy: '#1fae72', buy: '#8fd695', hold: '#d6c063', sell: '#f0a35f', strongSell: '#f0616d' };
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

  // Monatsverlauf der Empfehlungen als gestapelte Säulen (Yahoo-Stil)
  let monthly = null;
  if (an.trend?.length > 1) {
    const keys = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'];
    const maxTotal = Math.max(...an.trend.map((t) => keys.reduce((s, k) => s + (t[k] || 0), 0)), 1);
    const cols = [...an.trend].reverse().map((t) => {
      const total = keys.reduce((s, k) => s + (t[k] || 0), 0);
      const monat = new Date();
      monat.setMonth(monat.getMonth() + (parseInt(t.period, 10) || 0));
      const stack = el('div', { class: 'reco-col-stack', style: `height:${Math.max(Math.round((total / maxTotal) * 100), 4)}%` },
        keys.filter((k) => t[k] > 0).map((k) =>
          el('span', { style: `flex:${t[k]};background:${RECO_COLORS[k]}`, title: `${RECO_LABELS[k]}: ${t[k]}` })
        )
      );
      return el('div', { class: 'reco-col' },
        el('span', { class: 'reco-col-total' }, String(total)),
        el('div', { class: 'reco-col-plot' }, stack),
        el('span', { class: 'reco-col-monat' }, monat.toLocaleDateString('de-DE', { month: 'short' }))
      );
    });
    monthly = el('div', {},
      el('div', { class: 'kpi-label', style: 'margin:16px 0 8px' }, 'Empfehlungen im Monatsverlauf'),
      el('div', { class: 'reco-cols' }, cols)
    );
  }

  setChildren(box,
    el('h2', { class: 'panel-title' }, 'Analysten ', el('span', { class: 'hint' }, `· ${an.count ?? '?'} Analysten`)),
    el('div', { style: 'display:flex;align-items:baseline;gap:12px' },
      el('span', { class: 'kpi-value small', style: 'font-size:30px' }, an.mean?.toFixed(1)),
      el('span', { class: 'dim' }, '/ 5 · Konsens (1 = Strong Buy)'),
      el('span', { class: `badge ${an.mean <= 2 ? 's-pos' : an.mean >= 3.5 ? 's-neg' : 's-neu'}` },
        (an.key || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
    ),
    bar,
    legend,
    monthly,
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
  // Aktien: Fundamentaldaten stecken jetzt kompakt im Kennzahlen-Strip
  // und vollständig im Kennzahlen-Akkordeon — eigenes Panel entfällt.
  box.hidden = true;
}

function renderNews(a) {
  const box = $('p-news');
  const children = [el('h2', { class: 'panel-title' }, `News zu ${a.name}`, el('span', { class: 'hint' }, ' · KI-bewertet, mit Kursreaktion'))];
  if (!a.news?.length) {
    children.push(el('div', { class: 'empty' }, 'Keine aktuellen News gefunden.'));
  } else {
    const newsNode = (n) =>
        el('article', { class: 'news-item' },
          el('div', { class: 'news-meta' }, el('span', {}, n.source || '—'), el('span', {}, fmtAgo(n.pubDate))),
          el('div', { class: 'news-title' }, el('a', { href: n.link, target: '_blank', rel: 'noopener' }, n.title)),
          newsSummaryLine(n),
          n.erklaerung ? el('div', { class: 'news-explain' }, n.erklaerung) : null
        );

    // Platz sparen: erst 5 News, Rest aufklappbar
    children.push(...a.news.slice(0, 5).map(newsNode));
    if (a.news.length > 5) {
      children.push(collapsible(`${a.news.length - 5} weitere News anzeigen`, a.news.slice(5).map(newsNode)));
    }
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
