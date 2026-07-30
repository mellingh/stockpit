// Analyse-Seite: Suche → Komplett-Report mit Chart (inkl. News-Marker),
// Technik-, Analysten-, Fundamental-, Termin-, Studien-/ETF-Panels,
// News mit KI-Sentiment + Kurs-Erklärung.
import { api } from './api.js';
import {
  el, fmtEur, fmtMoney, fmtNum, fmtPct, fmtPctFrac, fmtCompact, fmtDate, fmtAgo,
  signClass, attachSearch, markActiveNav, newsBadgesRow, newsEinordnung,
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
let priceLines = []; // Vortag/Vorbörslich-Markierungen, pro Report neu gesetzt
let priceZoom = 1; // Mausrad-Zoom der Preisachse (1 = Autoscale-Standard)
let symline = null; // Titelzeile im Chart: "Wert · Zeitraum · Börse"
let chartMeta = { name: '', boerse: '' };

// Chart-Titel (TradingView-Stil) aktualisieren — Zeitraum kommt vom aktiven Knopf
function updateChartTitle() {
  if (!symline) return;
  const range = document.querySelector('.chart-toolbar .rng.active')?.textContent ?? '';
  symline.textContent = [chartMeta.name, range, chartMeta.boerse].filter(Boolean).join(' · ');
}

// ---------- Suche ----------

attachSearch($('search'), (r) => {
  history.replaceState(null, '', `?symbol=${encodeURIComponent(r.symbol)}`);
  loadReport(r.symbol);
});

const params = new URLSearchParams(location.search);
if (params.get('symbol')) loadReport(params.get('symbol'));
else renderStart();

// ---------- Startansicht (kein Symbol gewählt): eigene Werte + Trending ----------

function startChip(w) {
  return el('button', { class: 'start-chip', type: 'button', onclick: () => {
    history.replaceState(null, '', `?symbol=${encodeURIComponent(w.symbol)}`);
    loadReport(w.symbol);
  } },
    el('b', {}, w.symbol),
    el('span', { class: 'sc-name' }, w.name || ''),
    el('span', { class: `sc-pct ${signClass(w.tagesPct)}` }, fmtPct(w.tagesPct))
  );
}

async function renderStart() {
  $('start').hidden = false;

  api.get('/api/dashboard').then((d) => {
    const eigene = [
      ...d.positions.map((p) => ({ symbol: p.symbol, name: p.name, tagesPct: p.tagesPct })),
      ...d.watchlist.map((w) => ({ symbol: w.symbol, name: w.name, tagesPct: w.tagesPct })),
    ];
    // Dubletten raus (Wert in Depot UND Watchlist)
    const gesehen = new Set();
    const liste = eigene.filter((w) => !gesehen.has(w.symbol) && gesehen.add(w.symbol));
    $('start-eigene').replaceChildren(
      liste.length
        ? el('div', { class: 'start-chips' }, liste.map(startChip))
        : el('div', { class: 'empty' }, 'Noch keine Positionen oder Watchlist-Werte — im Dashboard anlegen.')
    );
  }).catch(() => {
    $('start-eigene').replaceChildren(el('div', { class: 'empty' }, 'Werte konnten nicht geladen werden.'));
  });

  api.get('/api/trending').then((liste) => {
    $('start-trend').replaceChildren(
      liste.length
        ? el('div', { class: 'start-chips' }, liste.map(startChip))
        : el('div', { class: 'empty' }, 'Gerade keine Trend-Daten verfügbar.')
    );
  }).catch(() => {
    $('start-trend').replaceChildren(el('div', { class: 'empty' }, 'Trend-Daten nicht erreichbar.'));
  });
}

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

  // Titelzeile + OHLC-Zeile oben links im Chart (TradingView-Stil):
  // erst "Wert · Zeitraum · Börse", darunter die Kerzenwerte zum Fadenkreuz
  symline = el('div', { class: 'chart-symline' });
  tooltip = el('div', { class: 'chart-ohlc' });
  $('chart').style.position = 'relative';
  $('chart').append(el('div', { class: 'chart-overlay' }, symline, tooltip));
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

  // Mausrad ÜBER der Preisachse skaliert die Preise (wie bei TradingView) —
  // die Bibliothek kann das nicht von Haus aus, deshalb ein eigener
  // Autoscale-Faktor, der die automatische Spanne um die Mitte streckt/staucht.
  candleSeries.applyOptions({
    autoscaleInfoProvider: (original) => {
      const res = original();
      if (!res?.priceRange || priceZoom === 1) return res;
      const mitte = (res.priceRange.minValue + res.priceRange.maxValue) / 2;
      const halb = ((res.priceRange.maxValue - res.priceRange.minValue) / 2) * priceZoom;
      return { ...res, priceRange: { minValue: mitte - halb, maxValue: mitte + halb } };
    },
  });
  const container = $('chart');
  const ueberPreisachse = (e) => {
    const x = e.clientX - container.getBoundingClientRect().left;
    return x >= container.clientWidth - chart.priceScale('right').width();
  };
  container.addEventListener('wheel', (e) => {
    if (!ueberPreisachse(e)) return; // links davon: normales Chart-Zoomen
    e.preventDefault();
    e.stopPropagation();
    priceZoom = Math.min(Math.max(priceZoom * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 0.15), 15);
    chart.priceScale('right').applyOptions({ autoScale: true });
  }, { passive: false, capture: true });
  container.addEventListener('dblclick', (e) => {
    if (!ueberPreisachse(e)) return;
    priceZoom = 1;
    chart.priceScale('right').applyOptions({ autoScale: true });
  }, true);
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

// Horizontale Markierungen im Chart (TradingView-Stil): Schlusskurs des
// Vortags (grau gepunktet) und der vor-/nachbörsliche Kurs (orange
// gestrichelt). Werden pro Report neu gesetzt.
function setPriceLines(kurs) {
  priceLines.forEach((l) => candleSeries.removePriceLine(l));
  priceLines = [];
  priceZoom = 1;
  if (kurs.vortag != null) {
    priceLines.push(candleSeries.createPriceLine({
      price: kurs.vortag, color: '#7b8294', lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: 'Vortag',
    }));
  }
  const ab = kurs.ausserboerslich;
  if (ab?.preis != null) {
    priceLines.push(candleSeries.createPriceLine({
      price: ab.preis, color: '#e5a83b', lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: true,
      title: ab.phase === 'pre' ? 'Vorbörslich' : 'Nachbörslich',
    }));
  }
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
      priceZoom = 1;
      chart.timeScale().fitContent();
      updateChartTitle();
    } catch {}
  });
});

// ---------- Report ----------

async function loadReport(symbol) {
  currentSymbol = symbol;
  $('start').hidden = true;
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

  // Frische Quartalszahlen: schmaler Banner über dem Chart (Yahoo-Stil),
  // erscheint nur am Meldetag (heute/gestern) und verschwindet dann wieder
  const z = a.zahlen;
  const banner = $('r-zahlen-banner');
  const zTage = z?.gemeldet ? Math.floor((Date.now() - z.gemeldet) / 86400000) : null;
  if (z?.gemeldet && zTage <= 1) {
    const fmtEps = (v) => (v > 0 ? '+' : '') + Number(v).toFixed(2).replace('.', ',');
    const cls = z.ueberraschungPct > 0 ? 'pos' : z.ueberraschungPct < 0 ? 'neg' : '';
    banner.hidden = false;
    banner.className = `zahlen-banner ${cls}`;
    setChildren(banner,
      el('span', { class: 'zb-label' }, `Quartalszahlen ${zTage <= 0 ? 'heute' : 'gestern'}`),
      z.epsErwartet != null ? el('span', { class: 'zb-wert' }, `EPS erw. ${fmtEps(z.epsErwartet)}`) : null,
      z.epsTatsaechlich != null
        ? el('span', { class: `zb-wert ${cls}` },
            `Ist ${fmtEps(z.epsTatsaechlich)}`,
            z.ueberraschungPct != null ? ` (${z.ueberraschungPct > 0 ? '+' : ''}${String(z.ueberraschungPct).replace('.', ',')} %)` : ''
          )
        : el('span', { class: 'zb-wert dim' }, 'Ergebnis folgt')
    );
  } else {
    banner.hidden = true;
    banner.replaceChildren();
  }
  $('r-price').textContent = fmtMoney(a.kurs.preis, a.currency);
  $('r-chg').textContent = `${fmtPct(a.kurs.veraenderungPct)} heute`;
  $('r-chg').className = `chg ${signClass(a.kurs.veraenderungPct)}`;

  // Vor-/nachbörslicher Kurs (nur wenn die Börse ihn liefert, v. a. US-Werte)
  const ab = a.kurs.ausserboerslich;
  const pp = $('r-prepost');
  if (ab?.preis != null) {
    pp.hidden = false;
    setChildren(pp,
      el('span', { class: 'dim' }, ab.phase === 'pre' ? 'Pre-Market' : 'Nachbörslich'),
      el('span', { class: signClass(ab.pct) }, `${fmtMoney(ab.preis, a.currency)} (${fmtPct(ab.pct)})`)
    );
  } else {
    pp.hidden = true;
    pp.replaceChildren();
  }

  // (Die Gesamteinschätzungs-Anzeige im Kopf wurde in Runde 25 komplett
  // entfernt — der Server berechnet sie weiterhin.)

  // Chart
  document.querySelectorAll('.chart-toolbar .rng').forEach((b) => b.classList.toggle('active', b.dataset.range === '1y'));
  setChartData(a.chart);
  setPriceLines(a.kurs);
  chartMeta = { name: a.name, boerse: a.kurs.boerse || '' };
  updateChartTitle();

  currentCurrency = a.currency;
  renderQuoteStrip(a);
  renderAnalysten(a);
  renderRatings(a);
  renderFundamental(a);
  renderUebersicht(a);
  renderNews(a);
  renderExtra(a);
  renderX(a);
}

// "Meinungen & Links": X-Suchen vertrauter Accounts (from:Account $TICKER)
// plus Ein-Klick-Sprünge zu externen Seiten ({TICKER}-Platzhalter).
// Verwaltet wird über den +-Knopf im Titel: ein Overlay ÜBER der Karte
// (statt Akkordeon — das machte die Karte lang und klobig). Das eine
// Eingabefeld erkennt selbst: @handle → X-Account, URL → Webseite.
async function renderX(a, verwaltenOffen = false) {
  const box = $('p-x');
  const ticker = a.symbol.split('.')[0].toUpperCase();
  let accounts = [];
  let webLinks = [];
  try {
    [accounts, webLinks] = await Promise.all([api.get('/api/xusers'), api.get('/api/weblinks')]);
  } catch {
    box.hidden = true;
    return;
  }
  box.hidden = false;

  const suchLink = (h) =>
    `https://x.com/search?q=${encodeURIComponent(`from:${h} $${ticker}`)}&src=typed_query&f=live`;

  // Kompakte Pills (Icon + Name), die umbrechen — statt großer Zeilen-Buttons.
  // Der Ticker steckt im Link selbst, nicht im Label.
  const pille = (icon, label, href, title) =>
    el('a', { class: 'x-pill', href, target: '_blank', rel: 'noopener', title }, icon, label);
  const zeilen = [
    ...accounts.map((h) =>
      pille(xLogo(11), `@${h}`, suchLink(h), `Posts von @${h} zu $${ticker} auf X`)
    ),
    ...webLinks.map((l) =>
      pille(globusIcon(11), l.name, l.url.replaceAll('{TICKER}', ticker), `${l.name}: ${ticker} öffnen`)
    ),
  ];

  // Overlay-Verwaltung (öffnet über der Karte)
  const oeffneVerwaltung = () => {
    box.querySelector('.karten-overlay')?.remove();

    const hinweis = el('div', { class: 'notice', hidden: 'hidden' });
    const input = el('input', { type: 'text', placeholder: '@handle oder Seiten-URL …', autocomplete: 'off', style: 'flex:1;min-width:150px' });
    const form = el('form', { class: 'inline-add', style: 'margin:0 0 6px' },
      input,
      el('button', { class: 'btn small', type: 'submit' }, 'Hinzufügen')
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const wert = input.value.trim();
      if (!wert) return;
      try {
        if (/^@?[A-Za-z0-9_]{1,15}$/.test(wert)) {
          await api.post('/api/xusers', { handle: wert });
        } else {
          let url = /^https?:\/\//i.test(wert) ? wert : `https://${wert}`;
          if (ticker.length >= 2) {
            url = url.replace(new RegExp(`(?<![A-Za-z0-9])${ticker}(?![A-Za-z0-9])`, 'gi'), '{TICKER}');
          }
          await api.post('/api/weblinks', { url });
        }
        renderX(a, true);
      } catch (err) {
        hinweis.hidden = false;
        hinweis.textContent = `Fehler: ${err.message}`;
      }
    });

    const entfernRow = (label, onRemove) =>
      el('div', { class: 'x-row' },
        el('span', { class: 'x-row-label' }, label),
        el('button', { class: 'btn danger small', type: 'button', onclick: onRemove }, 'Entfernen')
      );

    const overlay = el('div', { class: 'karten-overlay' },
      el('div', { class: 'ko-kopf' },
        el('span', { class: 'ko-titel' }, 'Accounts & Links verwalten'),
        el('button', { class: 'icon-btn', type: 'button', title: 'Schließen', onclick: () => overlay.remove() }, '✕')
      ),
      form,
      hinweis,
      el('div', { class: 'ko-liste' },
        accounts.map((h) =>
          entfernRow(`@${h}`, async () => {
            await api.del(`/api/xusers/${encodeURIComponent(h)}`);
            renderX(a, true);
          })
        ),
        webLinks.map((l) =>
          entfernRow(l.name, async () => {
            await api.del(`/api/weblinks?url=${encodeURIComponent(l.url)}`);
            renderX(a, true);
          })
        )
      )
    );
    box.append(overlay);
    input.focus();
  };

  // Die +-Pille reiht sich als letztes Element ein (Tag-Editor-Muster)
  const plusPille = el('button', {
    class: 'x-pill x-pill-plus', type: 'button',
    title: 'Accounts & Links verwalten', onclick: oeffneVerwaltung,
  }, '+');

  setChildren(box,
    el('h2', { class: 'panel-title' }, 'Meinungen & Links'),
    el('div', { class: 'x-pills' }, zeilen, plusPille)
  );
  if (verwaltenOffen) oeffneVerwaltung();
}

// Schlichter Globus (Lucide-Stil) für die Web-Quick-Links
function globusIcon(size = 13) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('class', 'x-logo');
  const c = document.createElementNS(svgNS, 'circle');
  c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '10');
  svg.append(c);
  for (const d of ['M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20']) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// Offizielles X-Logo (schlicht, currentColor)
function xLogo(size = 13) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('class', 'x-logo');
  const p = document.createElementNS(svgNS, 'path');
  p.setAttribute('d', 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z');
  svg.append(p);
  return svg;
}

// Wichtigste Metriken horizontal unter dem Chart (Yahoo-Stil).
// Enthält seit Runde 14 auch die wertvollsten Finviz-Kennzahlen —
// das eigene Kennzahlen-Panel ist dafür entfallen.
function renderQuoteStrip(a) {
  const box = $('p-quotestrip');
  const k = a.kurs;
  const perf = a.kennzahlen?.performance ?? {};
  const spanne = (lo, hi) => (lo != null && hi != null ? `${fmtNum(lo)} – ${fmtNum(hi)}` : '–');
  // [Label, Wert, optionale Farb-Klasse] — Labels bewusst auf ENGLISCH
  // (Michas Wunsch: die Fachbegriffe wie bei Yahoo/Finviz, nur in dieser Leiste)
  const zellen = [
    ['Previous Close', fmtNum(k.vortag)],
    ['Open', fmtNum(k.eroeffnung)],
    ['Day Range', spanne(k.tagesTief, k.tagesHoch)],
    ['52 Week Range', spanne(k.w52Tief, k.w52Hoch)],
    ['Volume', fmtCompact(k.volumen)],
    ['Avg. Volume', fmtCompact(k.volumenSchnitt)],
    ['Market Cap', k.marktkap != null ? `${fmtCompact(k.marktkap)} ${a.currency}` : '–'],
    ['Beta', fmtNum(a.kennzahlen?.beta)],
    ['PE Ratio (TTM)', fmtNum(a.fundamental?.kgv)],
    ['Forward PE', fmtNum(a.fundamental?.kgvForward)],
    ['EPS (TTM)', fmtNum(a.kennzahlen?.epsTtm)],
    ['Revenue Growth', a.fundamental?.umsatzwachstum != null ? fmtPctFrac(a.fundamental.umsatzwachstum) : '–'],
    ['Net Margin', a.fundamental?.nettomarge != null ? fmtPctFrac(a.fundamental.nettomarge) : '–'],
    ['Perf. YTD', fmtPct(perf.ytd), signClass(perf.ytd)],
    ['Perf. 1Y', fmtPct(perf.jahr), signClass(perf.jahr)],
    ['Short Float', a.kennzahlen?.shortFloat != null ? fmtPctFrac(a.kennzahlen.shortFloat) : '–'],
    ['Next Earnings', fmtDate(a.termine?.earnings)],
    ['Dividend Yield', a.fundamental?.dividendenrendite != null ? fmtPct(a.fundamental.dividendenrendite, false) : '–'],
    ['Ex-Dividend', fmtDate(a.termine?.exDividende)],
    ['Avg. Price Target', a.analysts?.targets?.mean != null ? fmtNum(a.analysts.targets.mean) : '–'],
  ];
  box.hidden = false;
  box.replaceChildren(
    el('div', { class: 'quote-strip' },
      zellen.map(([label, wert, cls]) =>
        el('div', { class: 'qs-cell' }, el('span', { class: 'qs-label' }, label), el('span', { class: `qs-value ${cls || ''}` }, String(wert)))
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

  // Linke Seite: Kurzbeschreibung + Stärken/Risiken.
  // Punkte können {t, info} sein — info (Fachbegriff-Erklärung) steckt NUR im
  // Hover-Tooltip; sichtbare Erklärzeilen fand Micha zu unübersichtlich (Runde 20).
  const punkt = (p, cls, pfeil) =>
    el('div', { class: `ov-punkt ${cls}`, title: (typeof p === 'object' && p.info) || '' },
      `${pfeil} `,
      typeof p === 'string' ? p : p.t
    );
  const kurz = u?.beschreibung && u.beschreibung.length > 260 ? u.beschreibung.slice(0, 260) + ' …' : u?.beschreibung;
  const links = el('div', { class: 'ov-links' },
    el('p', { class: 'uebersicht-text' }, kurz || ''),
    sf?.staerken?.length
      ? el('div', {},
          el('div', { class: 'kpi-label', style: 'margin:10px 0 6px' }, 'Stärken'),
          sf.staerken.map((p) => punkt(p, 'pos', '▲'))
        )
      : null,
    sf?.risiken?.length
      ? el('div', {},
          el('div', { class: 'kpi-label', style: 'margin:10px 0 6px' }, 'Risiken'),
          sf.risiken.map((p) => punkt(p, 'neg', '▼'))
        )
      : null
  );

  // Rechte Seite: Snowflake-Radar (Fazit-Satz auf Michas Wunsch entfernt, Runde 22)
  const rechts = sf
    ? el('div', { class: 'ov-rechts' },
        radarChart([
          { label: 'WERT', value: sf.scores.wert },
          { label: 'ZUKUNFT', value: sf.scores.zukunft },
          { label: 'VERGANGENH.', value: sf.scores.vergangenheit },
          { label: 'BILANZ', value: sf.scores.bilanz },
          { label: 'DIVIDENDE', value: sf.scores.dividende },
        ])
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

  // Kompakt: maximal 5 Zeilen, der Rest hinter "Mehr anzeigen"
  const erste = a.ratings.slice(0, 5);
  const rest = a.ratings.slice(5);
  const tbody = el('tbody', {}, erste.map(zeile));
  let mehrBtn = null;
  if (rest.length) {
    mehrBtn = el('button', { class: 'btn ghost small', type: 'button', style: 'margin-top:10px', onclick: () => {
      rest.forEach((r) => tbody.append(zeile(r)));
      mehrBtn.remove();
    } }, `Mehr anzeigen (${rest.length})`);
  }

  setChildren(box,
    el('h2', { class: 'panel-title' }, 'Analysten-Historie',
      el('span', { class: 'hint' }, ' · einzelne Banken')),
    el('div', { class: 'table-scroll', style: 'margin-top:0' }, el('table', { class: 'data compact' }, kopf, tbody)),
    mehrBtn,
    !hatKursziele ? el('div', { class: 'notice', style: 'margin-top:10px' }, 'Für diesen Wert sind keine Kursziele je Bank frei verfügbar — die Konsens-Spanne steht im Analysten-Panel.') : null
  );
}

// Das Kennzahlen- und das Technik-Panel sind bewusst entfernt (Micha, Runde 14):
// die wichtigsten Kennzahlen stehen im Quote-Strip, die Technik fließt weiter
// in die Gesamteinschätzung ein.

const RECO_COLORS ={ strongBuy: '#1fae72', buy: '#8fd695', hold: '#d6c063', sell: '#f0a35f', strongSell: '#f0616d' };
const RECO_LABELS = { strongBuy: 'Stark kaufen', buy: 'Kaufen', hold: 'Halten', sell: 'Verkaufen', strongSell: 'Stark verkaufen' };

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
      el('span', { class: 'dim' }, '/ 5 · Konsens (1 = Stark kaufen)'),
      el('span', { class: `badge ${an.mean <= 2 ? 's-pos' : an.mean >= 3.5 ? 's-neg' : 's-neu'}` },
        ({ strong_buy: 'Stark kaufen', buy: 'Kaufen', hold: 'Halten', underperform: 'Untergewichten', sell: 'Verkaufen', strong_sell: 'Stark verkaufen' })[an.key] ??
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
          newsBadgesRow(n),
          newsEinordnung(n)
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
