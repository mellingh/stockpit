// Gemeinsame UI-Bausteine: Formatierung, Badges, Sparklines, Suche.
import { api } from './api.js';

// ---------- Formatierung (deutsch) ----------

const nfEur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const nfEur2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtEur = (v, cents = false) => (v == null ? '–' : (cents ? nfEur2 : nfEur).format(v));
export const fmtNum = (v, digits = 2) =>
  v == null ? '–' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(v);
export const fmtMoney = (v, currency) =>
  v == null
    ? '–'
    : new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(v);

export function fmtPct(v, signed = true) {
  if (v == null || Number.isNaN(v)) return '–';
  const s = signed && v > 0 ? '+' : '';
  return `${s}${nf2.format(v)} %`;
}

// Prozentwert, der als Bruch (0.34) geliefert wird
export const fmtPctFrac = (v) => (v == null ? '–' : fmtPct(v * 100, false));

export function fmtCompact(v) {
  if (v == null) return '–';
  if (Math.abs(v) >= 1e12) return `${nf2.format(v / 1e12)} Bio.`;
  if (Math.abs(v) >= 1e9) return `${nf2.format(v / 1e9)} Mrd.`;
  if (Math.abs(v) >= 1e6) return `${nf2.format(v / 1e6)} Mio.`;
  return fmtNum(v, 0);
}

export function fmtDate(d) {
  if (!d) return '–';
  const date = typeof d === 'number' ? new Date(d < 1e12 ? d * 1000 : d) : new Date(d);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtAgo(d) {
  const date = typeof d === 'number' ? new Date(d < 1e12 ? d * 1000 : d) : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `vor ${mins} Min.`;
  if (mins < 60 * 24) return `vor ${Math.round(mins / 60)} Std.`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

export const signClass = (v) => (v == null ? 'dim' : v > 0 ? 'pos' : v < 0 ? 'neg' : 'dim');

// ---------- DOM-Helfer ----------

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

// ---------- Badges & Ampeln ----------

const SENTIMENT_LABELS = { positive: 'Positiv', negative: 'Negativ', neutral: 'Neutral' };

export function sentimentBadge(sentiment) {
  if (!sentiment) return null;
  const cls = sentiment.label === 'positive' ? 's-pos' : sentiment.label === 'negative' ? 's-neg' : 's-neu';
  const dotCls = sentiment.label === 'positive' ? 'green' : sentiment.label === 'negative' ? 'red' : 'gray';
  return el(
    'span',
    { class: `badge ${cls}`, title: sentiment.unavailable ? 'KI-Modell lädt noch' : `Konfidenz ${Math.round((sentiment.score || 0) * 100)} %` },
    el('span', { class: `dot ${dotCls}` }),
    SENTIMENT_LABELS[sentiment.label] || sentiment.label
  );
}

export function categoryBadge(category) {
  if (!category || category.id === 'other') return null;
  return el('span', { class: 'badge cat' }, category.label);
}

export function ampelDot(ampel, title) {
  return el('span', { class: `dot ${ampel || 'gray'}`, title: title || '' });
}

export const AMPEL_TEXT = { green: 'Bullish', yellow: 'Neutral', red: 'Bearish' };

// ---------- Erklärung zu News-Badges (Klick blendet Einordnung ein) ----------

const conf = (s) => (s?.score ? ` (Sicherheit der KI: ${Math.round(s.score * 100)} %)` : '');

const SENTIMENT_EXPLAIN = {
  positive: (s) =>
    `🟢 Positiv: Die lokale Finanz-KI (FinBERT) liest diese Schlagzeile als gute Nachricht aus Marktsicht — tendenziell kursstützend${conf(s)}.`,
  negative: (s) =>
    `🔴 Negativ: Die lokale Finanz-KI (FinBERT) liest diese Schlagzeile als schlechte Nachricht aus Marktsicht — tendenziell kursbelastend${conf(s)}.`,
  neutral: (s) =>
    `⚪ Neutral: Die Schlagzeile enthält aus Sicht der Finanz-KI weder klar gute noch klar schlechte Signale${conf(s)}.`,
};

const CATEGORY_EXPLAIN = {
  earnings: 'Quartalszahlen: Es geht um Geschäftszahlen, Prognosen oder die Berichtssaison — hier reagieren Kurse oft am stärksten.',
  fed: 'Fed/Zinsen: Geldpolitik (Zinsentscheide, Inflation) beeinflusst die Bewertung fast aller Aktien — besonders Tech und Wachstumswerte.',
  geo: 'Geopolitik: Krieg, Sanktionen oder Zölle — wirkt vor allem auf Energie, Rüstung und Lieferketten.',
  analyst: 'Analysten-Update: Eine Bank hat ihr Rating oder Kursziel geändert (z. B. hochgestuft/abgestuft) — kurzfristig oft kursbewegend.',
  pharma: 'FDA/Studien: Zulassungen oder Studiendaten — bei Biotech/Pharma der stärkste einzelne Kurstreiber.',
};

export function buildNewsExplain(n) {
  const parts = [];
  const sExpl = SENTIMENT_EXPLAIN[n.sentiment?.label];
  if (sExpl) parts.push(sExpl(n.sentiment));
  if (n.sentiment?.unavailable) parts.push('Hinweis: Das KI-Modell war noch nicht geladen — Einstufung vorläufig neutral.');
  const cExpl = CATEGORY_EXPLAIN[n.category?.id];
  if (cExpl) parts.push(cExpl);
  for (const b of n.betroffen || []) {
    parts.push(
      b.why === 'direkt'
        ? `${b.symbol}: direkt betroffen — Firma oder Ticker wird in der Schlagzeile genannt.`
        : `${b.symbol}: indirekt betroffen über ${b.why}.`
    );
  }
  if (!parts.length) return null;
  return el('div', { class: 'news-explain-detail' }, parts.map((p) => el('div', {}, p)));
}

// Jedes Badge einzeln klickbar: Sentiment erklärt Sentiment,
// Kategorie erklärt Kategorie — kein Gruppen-Hover mehr.
function attachBadgeExplain(badge, buildText) {
  if (!badge) return badge;
  badge.classList.add('explain');
  let detail = null;
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    if (detail) {
      detail.remove();
      detail = null;
      return;
    }
    const text = buildText();
    if (!text) return;
    detail = el('div', { class: 'news-explain-detail' }, ...[text].flat().map((t) => el('div', {}, t)));
    badge.closest('.news-badges')?.after(detail);
  });
  return badge;
}

// News-Bausteine: Badge-Zeile (ohne verwirrende Prozentzahl — die
// KI-Sicherheit steckt im Tooltip und in der Einordnung) und
// aufklappbare "Einordnung" mit der ausführlichen Erklärung.
export function newsBadgesRow(n) {
  const kids = [sentimentBadge(n.sentiment), categoryBadge(n.category)];
  if (n.reaction?.dayChangePct != null) {
    kids.push(
      el('span', { class: `badge ${n.reaction.dayChangePct > 0 ? 's-pos' : n.reaction.dayChangePct < 0 ? 's-neg' : 's-neu'}` },
        `Kurs am Tag ${fmtPct(n.reaction.dayChangePct)}`)
    );
  }
  return el('div', { class: 'news-badges' }, kids);
}

// Aufklappbare Einordnung unter jeder News — nur Substanz, keine Floskeln:
// Worum es geht (Artikel-Teaser), was der Kurs daraus gemacht hat (Server-
// Analyse) und warum die News hier auftaucht. Generische Erklärtexte
// (Signalwörter, Kategorie-Boilerplate) sind bewusst raus.
export function newsEinordnung(n) {
  const parts = [];
  if (n.summary) parts.push(`Worum es geht: ${n.summary}`);

  // Server liefert mehrere Analyse-Sätze (Bewegung vs. üblich, Sentiment-Abgleich,
  // Volumen, Folgetag) — ältere Fassungen lieferten einen einzelnen String
  if (Array.isArray(n.erklaerung)) parts.push(...n.erklaerung);
  else if (n.erklaerung) parts.push(n.erklaerung);

  if (n.sentiment?.unavailable) {
    parts.push('Das KI-Modell war noch nicht geladen — Einstufung vorläufig neutral.');
  }
  for (const b of n.betroffen || []) {
    if (b.why !== 'direkt') parts.push(`${b.symbol}: indirekt betroffen über ${b.why}.`);
  }
  if (!parts.length) return null;
  return collapsible(
    'Einordnung',
    el('ul', { class: 'einordnung-liste' }, parts.map((p) => el('li', {}, p)))
  );
}

// ---------- Bestätigungs-Dialog (statt Browser-confirm) ----------

export function confirmDialog(message, { okText = 'Löschen', cancelText = 'Abbrechen' } = {}) {
  return new Promise((resolve) => {
    const close = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(false); } },
      el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        el('div', { class: 'modal-text' }, message),
        el('div', { class: 'modal-actions' },
          el('button', { class: 'btn ghost', type: 'button', onclick: () => close(false) }, cancelText),
          el('button', { class: 'btn danger-solid', type: 'button', onclick: () => close(true) }, okText)
        )
      )
    );
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    overlay.querySelector('.btn.ghost').focus();
  });
}

export function explainableSentimentBadge(sentiment) {
  const badge = sentimentBadge(sentiment);
  return attachBadgeExplain(badge, () => {
    const parts = [];
    const fn = SENTIMENT_EXPLAIN[sentiment?.label];
    if (fn) parts.push(fn(sentiment));
    if (sentiment?.unavailable) parts.push('Hinweis: Das KI-Modell war noch nicht geladen — Einstufung vorläufig neutral.');
    return parts;
  });
}

export function explainableCategoryBadge(category) {
  const badge = categoryBadge(category);
  return attachBadgeExplain(badge, () => CATEGORY_EXPLAIN[category?.id] || null);
}

// ---------- Sparkline (SVG) ----------

export function sparkline(values, width = 90, height = 26) {
  if (!values || values.length < 2) return el('span', { class: 'dim' }, '–');
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
  const dir = values[values.length - 1] >= values[0] ? 'up' : 'down';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts);
  line.setAttribute('class', dir);
  svg.append(line);
  return svg;
}

// ---------- Donut (SVG, mit 2px-Lücken) ----------

export const CAT_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export function donut(slices, size = 168, stroke = 26) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  let offset = -0.25 * circumference; // bei 12 Uhr beginnen
  const gap = 2;
  slices.forEach((slice, i) => {
    const len = (slice.value / total) * circumference;
    const seg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    seg.setAttribute('cx', c);
    seg.setAttribute('cy', c);
    seg.setAttribute('r', r);
    seg.setAttribute('fill', 'none');
    seg.setAttribute('stroke', slice.color || CAT_COLORS[i % CAT_COLORS.length]);
    seg.setAttribute('stroke-width', stroke);
    seg.setAttribute('stroke-dasharray', `${Math.max(len - gap, 0.5)} ${circumference - Math.max(len - gap, 0.5)}`);
    seg.setAttribute('stroke-dashoffset', -offset);
    seg.append(
      Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'title'), {
        textContent: `${slice.label}: ${slice.text}`,
      })
    );
    svg.append(seg);
    offset += len;
  });
  return svg;
}

// ---------- Snowflake-Radar (SVG-Pentagon, SWS-Stil) ----------

export function radarChart(scores, size = 210) {
  // scores: [{label, value 0..5}], 5 Achsen.
  // viewBox seitlich aufgeweitet, damit lange Labels (ZUKUNFT, DIVIDENDE)
  // nicht abgeschnitten werden — plus winkelabhängige Text-Anker unten.
  const c = size / 2;
  const rMax = size / 2 - 34;
  const n = scores.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [c + r * Math.cos(angle(i)), c + r * Math.sin(angle(i))];
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  const rand = 36;
  svg.setAttribute('viewBox', `${-rand} 0 ${size + 2 * rand} ${size}`);
  svg.setAttribute('class', 'radar');
  svg.setAttribute('width', size + 2 * rand);
  svg.setAttribute('height', size);

  // Ringe (1–5)
  for (let ring = 1; ring <= 5; ring++) {
    const poly = document.createElementNS(svgNS, 'polygon');
    poly.setAttribute('points', scores.map((_, i) => pt(i, (rMax * ring) / 5).join(',')).join(' '));
    poly.setAttribute('class', 'radar-ring');
    svg.append(poly);
  }
  // Achsen
  scores.forEach((_, i) => {
    const line = document.createElementNS(svgNS, 'line');
    const [x, y] = pt(i, rMax);
    line.setAttribute('x1', c); line.setAttribute('y1', c);
    line.setAttribute('x2', x); line.setAttribute('y2', y);
    line.setAttribute('class', 'radar-ring');
    svg.append(line);
  });
  // Wertefläche
  const shape = document.createElementNS(svgNS, 'polygon');
  shape.setAttribute('points', scores.map((s, i) => pt(i, (rMax * Math.max(s.value, 0.15)) / 5).join(',')).join(' '));
  shape.setAttribute('class', 'radar-shape');
  svg.append(shape);
  // Beschriftung — seitliche Labels nach außen ankern, damit nichts abschneidet
  scores.forEach((s, i) => {
    const [x, y] = pt(i, rMax + 14);
    const cos = Math.cos(angle(i));
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', x); text.setAttribute('y', y);
    text.setAttribute('class', 'radar-label');
    text.setAttribute('text-anchor', cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = s.label;
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${s.label}: ${s.value}/5`;
    text.append(title);
    svg.append(text);
  });
  return svg;
}

// Klassisches Chevron-Icon (Lucide-Stil) für Aufklapp-Elemente
export function chevronIcon(size = 16) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', 'chev');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M6 9l6 6 6-6');
  svg.append(path);
  return svg;
}

// ---------- Aufklappbare Bereiche (platzsparend) ----------

export function collapsible(summaryChildren, bodyChildren, open = false) {
  const det = el('details', { class: 'clap' }, el('summary', {}, summaryChildren));
  if (open) det.setAttribute('open', '');
  det.append(...[bodyChildren].flat().filter(Boolean));
  return det;
}

// ---------- Ticker-Suche mit Vorschlägen ----------

export function attachSearch(input, onPick) {
  // Lazy auflösen: das Input steckt evtl. erst NACH attachSearch im Wrap
  let wrap = input.closest('.search-wrap');
  const getWrap = () => (wrap ??= input.closest('.search-wrap'));
  let box = null;
  let items = [];
  let sel = -1;
  let timer = null;

  const close = () => {
    box?.remove();
    box = null;
    items = [];
    sel = -1;
  };

  const render = (results) => {
    close();
    if (!results.length) return;
    box = el('div', { class: 'suggestions' });
    items = results.map((r, i) => {
      const btn = el(
        'button',
        { type: 'button', onclick: () => { close(); onPick(r); } },
        el('span', { class: 's-sym' }, r.symbol),
        el('span', { class: 's-name' }, r.name),
        el('span', { class: 's-ex' }, `${r.exchange || ''}${r.type === 'ETF' ? ' · ETF' : ''}`)
      );
      box.append(btn);
      return btn;
    });
    getWrap()?.append(box);
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      try {
        render(await api.get(`/api/search?q=${encodeURIComponent(q)}`));
      } catch {
        close();
      }
    }, 280);
  });

  input.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel >= 0 ? sel : 0].click(); return; }
    else if (e.key === 'Escape') { close(); return; }
    else return;
    e.preventDefault();
    items.forEach((b, i) => b.classList.toggle('sel', i === sel));
  });

  document.addEventListener('click', (e) => {
    if (!getWrap()?.contains(e.target)) close();
  });
}

// ---------- Navigation ----------

export function markActiveNav() {
  const here = location.pathname.replace(/\/$/, '') || '/index.html';
  document.querySelectorAll('.topnav a').forEach((a) => {
    const target = a.getAttribute('href').replace('./', '/');
    if (here.endsWith(target) || (target === '/index.html' && (here === '' || here === '/'))) a.classList.add('active');
  });
}
