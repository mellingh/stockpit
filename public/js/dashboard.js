// Dashboard: Portfolio-Kennzahlen, Positionen, Watchlist, Allokation,
// Termin-Radar und der KI-bewertete News-Feed.
import { api } from './api.js';
import {
  el, fmtEur, fmtMoney, fmtPct, fmtAgo, fmtDate, fmtCompact, signClass,
  sparkline, donut, CAT_COLORS, markActiveNav, newsBadgesRow, newsEinordnung, chevronIcon,
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

  // Termin-Radar: kompakte Chips, Klick klappt Details auf
  if (d.termine?.length) {
    const strip = el('div', { class: 'termine-strip' });
    const detailBox = el('div');
    let offenesDetail = null;

    for (const t of d.termine) {
      const istMarkt = t.typ === 'Markt';
      const datum = new Date(t.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const wann = t.days === 0 ? 'heute' : t.days === 1 ? 'morgen' : `in ${t.days} Tagen`;
      const chip = el('button', { class: `termin${!istMarkt && t.days <= 2 ? ' soon' : ''}${istMarkt ? ' markt' : ''}`, type: 'button', title: 'Klicken für Details' },
        istMarkt ? el('b', {}, '🏛 Markt') : el('b', {}, t.symbol),
        el('span', {},
          el('span', { class: 'termin-typ' },
            istMarkt ? (t.name.length > 34 ? t.name.slice(0, 34) + '…' : t.name) : t.typ === 'Quartalszahlen' ? '📊 Quartalszahlen' : '💰 Ex-Dividende'),
          el('span', { class: 'termin-datum' }, ` · ${datum}`)
        ),
        el('span', { class: 'days' }, wann),
        chevronIcon(16)
      );
      chip.addEventListener('click', () => {
        document.querySelectorAll('.termin.open').forEach((c) => c.classList.remove('open'));
        if (offenesDetail === t) {
          detailBox.replaceChildren();
          offenesDetail = null;
          return;
        }
        offenesDetail = t;
        chip.classList.add('open');
        const zeit = new Date(t.date).toLocaleString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        const fakten = istMarkt
          ? [
              ['Ereignis', t.name],
              ['Termin', `${zeit} Uhr`],
              ['Währungsraum', t.waehrung === 'USD' ? '🇺🇸 USA' : '🇪🇺 Eurozone'],
              t.prognose ? ['Prognose', t.prognose] : null,
              t.vorher ? ['Vorherig', t.vorher] : null,
            ].filter(Boolean)
          : [
              ['Unternehmen', t.name],
              ['Ereignis', t.typ],
              ['Termin', `${zeit} Uhr`],
              t.epsErwartet != null ? ['Erwartetes EPS', (t.epsErwartet > 0 ? '+' : '') + Number(t.epsErwartet).toFixed(2).replace('.', ',')] : null,
              t.umsatzErwartet != null ? ['Erwarteter Umsatz', fmtCompact(t.umsatzErwartet)] : null,
            ].filter(Boolean);
        detailBox.replaceChildren(
          el('div', { class: 'news-explain-detail', style: 'margin-top:10px' },
            el('dl', { class: 'facts' }, fakten.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))])),
            istMarkt
              ? el('div', { class: 'dim', style: 'font-size:12px;margin-top:6px' }, 'Marktweiter Termin — betrifft potenziell alle deine Werte.')
              : t.typ === 'Quartalszahlen'
                ? el('div', { class: 'dim', style: 'font-size:12px;margin-top:6px' }, 'Rund um Quartalszahlen sind stärkere Kursschwankungen üblich — Positionsgröße im Blick behalten.')
                : null,
            istMarkt
              ? el('a', { class: 'btn ghost small', style: 'justify-self:start;margin-top:6px', href: './kalender.html' }, 'Zum Kalender →')
              : el('a', { class: 'btn ghost small', style: 'justify-self:start;margin-top:6px', href: `./analyse.html?symbol=${encodeURIComponent(t.symbol)}` }, 'Zur Analyse →')
          )
        );
      });
      strip.append(chip);
    }

    document.getElementById('termine-wrap').replaceChildren(
      el('section', { class: 'panel', style: 'margin-bottom:18px' },
        el('h2', { class: 'panel-title' }, 'Wichtige Termine', el('span', { class: 'hint' }, ' · dein Portfolio + große Markt-Events · Klick für Details')),
        strip,
        detailBox
      )
    );
  }

  // Klumpenrisiko: warnen, wenn eine Position das Depot dominiert
  const groesste = d.positions.filter((p) => p.valueEur != null).sort((a, b) => b.valueEur - a.valueEur)[0];
  if (groesste && d.totalEur > 0 && groesste.valueEur / d.totalEur > 0.5) {
    const anteil = Math.round((groesste.valueEur / d.totalEur) * 100);
    document.getElementById('termine-wrap').append(
      el('div', { class: 'notice', style: 'margin-bottom:18px' },
        `⚠ Klumpenrisiko: ${groesste.symbol} macht ${anteil} % deines Depots aus — ein einzelner schlechter Tag dieses Werts schlägt voll durch.`)
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
          el('th', {}, 'Trend', el('span', {class:'th-sub'}, ' 30 T.')),
          el('th', { class: 'num' }, 'Wert (EUR)'),
          el('th', { class: 'num' }, 'G/V')
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
            )
          )
        )
      )
    );
    posBox.replaceChildren(table);
  }

  // Watchlist: eigene, beschriftete Tabelle (gleiche Lesart wie Positionen)
  const watchBox = document.getElementById('watchlist');
  if (!d.watchlist.length) {
    watchBox.replaceChildren(el('div', { class: 'empty' }, 'Keine beobachteten Werte. Im Portfolio hinzufügen.'));
  } else {
    watchBox.replaceChildren(
      el('table', { class: 'data' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'Wert'),
            el('th', { class: 'num' }, 'Kurs'),
            el('th', { class: 'num' }, 'Heute'),
            el('th', {}, 'Trend', el('span', {class:'th-sub'}, ' 30 T.'))
          )
        ),
        el('tbody', {},
          d.watchlist.map((w) =>
            el('tr', { class: 'rowlink', onclick: () => (location.href = `./analyse.html?symbol=${encodeURIComponent(w.symbol)}`) },
              el('td', { class: 'name-cell' }, w.name, el('span', { class: 'sym' }, w.symbol)),
              el('td', { class: 'num' }, fmtMoney(w.preis, w.waehrung)),
              el('td', { class: `num ${signClass(w.tagesPct)}` }, fmtPct(w.tagesPct)),
              el('td', {}, sparkline(w.sparkline))
            )
          )
        )
      )
    );
  }

  // Allokation nach Sektor (ETFs als eigene Gruppe) — vom Server gruppiert
  const allocBox = document.getElementById('allocation');
  if (hasPositions && d.totalEur > 0 && d.allokation?.length) {
    const top = d.allokation.slice(0, 7);
    const rest = d.allokation.slice(7);
    const slices = top.map((g, i) => ({
      label: g.label,
      value: g.valueEur,
      color: CAT_COLORS[i],
      pct: (g.valueEur / d.totalEur) * 100,
      symbole: g.symbole ?? [],
      text: `${fmtEur(g.valueEur)} (${fmtPct((g.valueEur / d.totalEur) * 100, false)})`,
    }));
    if (rest.length) {
      const restSum = rest.reduce((s, g) => s + g.valueEur, 0);
      slices.push({ label: 'Weitere', value: restSum, color: CAT_COLORS[7], pct: (restSum / d.totalEur) * 100, symbole: [], text: fmtEur(restSum) });
    }
    // Legende: Prozent groß und markant, Symbole + Betrag als Zweitzeile
    allocBox.replaceChildren(
      el('div', { class: 'donut-wrap' },
        donut(slices),
        el('div', { class: 'donut-legend' },
          slices.map((s) =>
            el('div', { class: 'row alloc-row' },
              el('span', { class: 'sq', style: `background:${s.color}` }),
              el('div', { class: 'alloc-main' },
                el('div', { class: 'alloc-top' },
                  el('span', { class: 'lname' }, s.label),
                  el('span', { class: 'alloc-pct' }, fmtPct(s.pct, false))
                ),
                el('div', { class: 'alloc-sub' },
                  s.symbole.length ? el('span', { class: 'alloc-syms' }, s.symbole.join(' · ')) : null,
                  el('span', {}, fmtEur(s.value))
                )
              )
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
      // Betroffene Ticker stehen prominent VORN in der Meta-Zeile
      el('div', { class: 'news-meta' },
        (n.betroffen || []).slice(0, 4).map((b) =>
          el('a', { class: 'badge chip chip-strong', href: `./analyse.html?symbol=${encodeURIComponent(b.symbol)}`, title: b.why === 'direkt' ? 'direkt betroffen' : `betroffen über ${b.why}` },
            b.symbol, b.why === 'direkt' ? '' : ' ~')
        ),
        el('span', {}, n.source || '—'),
        el('span', {}, fmtAgo(n.pubDate))
      ),
      el('div', { class: 'news-title' }, el('a', { href: n.link, target: '_blank', rel: 'noopener' }, n.title)),
      newsBadgesRow(n),
      newsEinordnung(n)
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
