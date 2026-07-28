// Dashboard: Portfolio-Kennzahlen, Positionen, Watchlist, Allokation,
// Termin-Radar und der KI-bewertete News-Feed.
import { api } from './api.js';
import {
  el, fmtEur, fmtMoney, fmtPct, fmtAgo, fmtDate, signClass, sentimentBadge, categoryBadge,
  ampelDot, AMPEL_TEXT, sparkline, donut, CAT_COLORS, markActiveNav, makeExplainable,
} from './ui.js';

markActiveNav();

document.getElementById('dateline').textContent = new Date().toLocaleDateString('de-DE', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

// ---------- KI-Status ----------

async function pollStatus() {
  try {
    const s = await api.get('/api/status');
    const node = document.getElementById('ki-status');
    const state = s.sentiment?.status;
    node.querySelector('span:last-child').textContent =
      state === 'ready' ? 'lokale KI bereit' : state === 'loading' ? 'KI-Modell lädt …' : state === 'error' ? 'KI nicht verfügbar' : 'lokale KI';
    node.querySelector('.pulse').style.background =
      state === 'ready' ? 'var(--up)' : state === 'error' ? 'var(--down)' : 'var(--accent)';
    if (state !== 'ready') setTimeout(pollStatus, 4000);
  } catch {}
}
pollStatus();

// ---------- Kennzahlen + Positionen ----------

function set(id, content, cls) {
  const node = document.getElementById(id);
  node.classList.remove('skel');
  node.textContent = content;
  if (cls) node.classList.add(cls);
  return node;
}

async function loadDashboard() {
  let d;
  try {
    d = await api.get('/api/dashboard');
  } catch (err) {
    document.getElementById('positions').replaceChildren(
      el('div', { class: 'notice err' }, `Daten konnten nicht geladen werden: ${err.message}. Läuft der Server? Besteht eine Internetverbindung?`)
    );
    return;
  }

  const hasPositions = d.positions.length > 0;

  set('kpi-total', hasPositions ? fmtEur(d.totalEur) : '—');
  if (d.fx?.USD) document.getElementById('kpi-fx').textContent = `USD→EUR ${d.fx.USD.toFixed(4)}`;

  set('kpi-gain', hasPositions ? fmtEur(d.gewinnEur) : '—', signClass(d.gewinnEur));
  document.getElementById('kpi-gain-pct').textContent = d.gewinnPct != null ? `${fmtPct(d.gewinnPct)} seit Kauf` : '';

  set('kpi-day', hasPositions ? fmtEur(d.dayChangeEur) : '—', signClass(d.dayChangeEur));
  document.getElementById('kpi-day-pct').textContent = d.dayChangePct != null ? `${fmtPct(d.dayChangePct)} zum Vortag` : '';

  // Termin-Radar
  if (d.termine?.length) {
    document.getElementById('termine-wrap').replaceChildren(
      el('section', { class: 'panel', style: 'margin-bottom:18px' },
        el('h2', { class: 'panel-title' }, 'Termin-Radar'),
        el('div', { class: 'termine-strip' },
          d.termine.map((t) =>
            el('div', { class: 'termin' },
              el('b', {}, t.symbol),
              `Quartalszahlen`,
              el('span', { class: 'days' }, t.days === 0 ? 'heute' : t.days === 1 ? 'morgen' : `in ${t.days} Tagen`)
            )
          )
        )
      )
    );
  }

  // Positionsliste
  const posBox = document.getElementById('positions');
  if (!hasPositions) {
    posBox.replaceChildren(
      el('div', { class: 'empty' },
        el('div', { class: 'big' }, 'Noch keine Positionen.'),
        el('div', {}, 'Lege im ', el('a', { href: './portfolio.html' }, 'Portfolio'), ' deine erste Position an — die Kurse laufen dann automatisch hier ein.')
      )
    );
  } else {
    const table = el('table', { class: 'data' },
      el('thead', {},
        el('tr', {},
          el('th', {}, 'Wert'),
          el('th', { class: 'num' }, 'Kurs'),
          el('th', { class: 'num' }, 'Heute'),
          el('th', {}, '30 Tage'),
          el('th', { class: 'num' }, 'Wert (EUR)'),
          el('th', { class: 'num' }, 'G/V'),
          el('th', {}, 'Signal')
        )
      ),
      el('tbody', {},
        d.positions.map((p) =>
          el('tr', { class: 'rowlink', onclick: () => (location.href = `./analyse.html?symbol=${encodeURIComponent(p.symbol)}`) },
            el('td', { class: 'name-cell' }, p.name, el('span', { class: 'sym' }, `${p.symbol} · ${p.shares} Stk.`)),
            el('td', { class: 'num' }, fmtMoney(p.preis, p.waehrung)),
            el('td', { class: `num ${signClass(p.tagesPct)}` }, fmtPct(p.tagesPct)),
            el('td', {}, sparkline(p.sparkline)),
            el('td', { class: 'num' }, fmtEur(p.valueEur)),
            el('td', { class: `num ${signClass(p.gewinnEur)}` },
              `${fmtEur(p.gewinnEur)}`,
              el('span', { class: 'dim' }, ` (${fmtPct(p.gewinnPct)})`)
            ),
            el('td', {}, el('span', { class: 'badge' }, ampelDot(p.ampel), AMPEL_TEXT[p.ampel] || '–'))
          )
        )
      )
    );
    posBox.replaceChildren(table);
  }

  // Watchlist
  const watchBox = document.getElementById('watchlist');
  if (!d.watchlist.length) {
    watchBox.replaceChildren(el('div', { class: 'empty' }, 'Keine beobachteten Werte. Im Portfolio hinzufügen.'));
  } else {
    watchBox.replaceChildren(
      el('table', { class: 'data' },
        el('tbody', {},
          d.watchlist.map((w) =>
            el('tr', { class: 'rowlink', onclick: () => (location.href = `./analyse.html?symbol=${encodeURIComponent(w.symbol)}`) },
              el('td', { class: 'name-cell' }, w.name, el('span', { class: 'sym' }, w.symbol)),
              el('td', { class: 'num' }, fmtMoney(w.preis, w.waehrung)),
              el('td', { class: `num ${signClass(w.tagesPct)}` }, fmtPct(w.tagesPct))
            )
          )
        )
      )
    );
  }

  // Allokation (Donut + Legende mit Direktwerten)
  const allocBox = document.getElementById('allocation');
  if (hasPositions && d.totalEur > 0) {
    const sorted = [...d.positions].filter((p) => p.valueEur != null).sort((a, b) => b.valueEur - a.valueEur);
    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7);
    const slices = top.map((p, i) => ({
      label: p.symbol,
      value: p.valueEur,
      color: CAT_COLORS[i],
      text: `${fmtEur(p.valueEur)} (${fmtPct((p.valueEur / d.totalEur) * 100, false)})`,
    }));
    if (rest.length) {
      const restSum = rest.reduce((s, p) => s + (p.valueEur ?? 0), 0);
      slices.push({ label: 'Weitere', value: restSum, color: CAT_COLORS[7], text: fmtEur(restSum) });
    }
    allocBox.replaceChildren(
      el('div', { class: 'donut-wrap' },
        donut(slices),
        el('div', { class: 'donut-legend' },
          slices.map((s) =>
            el('div', { class: 'row' },
              el('span', { class: 'sq', style: `background:${s.color}` }),
              el('span', { class: 'lname' }, s.label),
              el('span', { class: 'lval' }, s.text)
            )
          )
        )
      )
    );
  } else {
    allocBox.replaceChildren(el('div', { class: 'empty' }, 'Sobald Positionen da sind, erscheint hier die Aufteilung.'));
  }
}

// ---------- News-Feed ----------

async function loadNews() {
  const box = document.getElementById('newsfeed');
  let feed;
  try {
    feed = await api.get('/api/newsfeed');
  } catch (err) {
    box.replaceChildren(el('div', { class: 'notice err' }, `News nicht erreichbar: ${err.message}`));
    return;
  }

  const items = feed.items || [];
  if (!items.length) {
    box.replaceChildren(el('div', { class: 'empty' }, 'Keine News gefunden.'));
    return;
  }

  const nodes = items.map((n) =>
    el('article', { class: 'news-item' },
      el('div', { class: 'news-meta' },
        el('span', {}, n.source || '—'),
        el('span', {}, fmtAgo(n.pubDate))
      ),
      el('div', { class: 'news-title' }, el('a', { href: n.link, target: '_blank', rel: 'noopener' }, n.title)),
      makeExplainable(
        el('div', { class: 'news-badges' },
          sentimentBadge(n.sentiment),
          categoryBadge(n.category),
          (n.betroffen || []).slice(0, 4).map((b) =>
            el('a', { class: 'badge chip', href: `./analyse.html?symbol=${encodeURIComponent(b.symbol)}`, title: b.why === 'direkt' ? 'direkt betroffen' : `betroffen über ${b.why}` },
              b.symbol, b.why === 'direkt' ? '' : ' ~')
          )
        ),
        n
      ),
      n.erklaerung ? el('div', { class: 'news-explain' }, n.erklaerung) : null
    )
  );

  const notices = (feed.feedErrors || []).map((f) => el('div', { class: 'notice' }, `Feed nicht erreichbar: ${f}`));
  const filterInfo = feed.gefiltert
    ? [el('div', { class: 'news-meta', style: 'padding:4px 0 8px' }, `${feed.gefiltert} unwichtige Meldungen ausgefiltert — gezeigt wird nur Marktrelevantes.`)]
    : [];
  box.replaceChildren(...notices, ...filterInfo, ...nodes);
}

loadDashboard();
loadNews();
