// Dashboard: Portfolio-Kennzahlen, Positionen, Watchlist, Allokation,
// Termin-Radar und der KI-bewertete News-Feed.
import { api } from './api.js';
import {
  el, fmtEur, fmtMoney, fmtPct, fmtAgo, fmtDate, fmtCompact, signClass,
  sparkline, donut, CAT_COLORS, markActiveNav, newsBadgesRow, newsEinordnung, chevronIcon, attachSearch, collapsible,
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

// Kleine Icon-Knöpfe (Stift/Kreuz) am Zeilenende — Ändern/Löschen direkt
// in der Tabelle, seit die separate Portfolio-Seite weg ist
function iconBtn(art, title, onclick) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const pfade = art === 'stift'
    ? ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z']
    : ['M18 6 6 18', 'm6 6 12 12'];
  for (const d of pfade) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return el('button', { class: `icon-btn${art === 'kreuz' ? ' danger' : ''}`, type: 'button', title, onclick }, svg);
}

// Position direkt in der Zeile bearbeiten (Stückzahl + Ø-Kaufkurs)
function editPosition(p, row, spalten) {
  const stueck = el('input', { type: 'number', step: 'any', min: '0', value: p.shares, style: 'width:90px;height:36px' });
  const kurs = el('input', { type: 'number', step: 'any', min: '0', value: p.buyPrice ?? '', placeholder: 'Ø-Kaufkurs', style: 'width:120px;height:36px' });
  const editor = el('tr', {},
    el('td', { class: 'name-cell' }, p.name, el('span', { class: 'sym' }, p.symbol)),
    el('td', { colspan: String(spalten - 1) },
      el('div', { class: 'inline-add', style: 'margin:0;justify-content:flex-end' },
        el('span', { class: 'sym' }, 'Stück'), stueck,
        el('span', { class: 'sym' }, 'Ø-Kaufkurs'), kurs,
        el('button', { class: 'btn small', type: 'button', style: 'height:36px;padding:0 14px', onclick: async () => {
          await api.patch(`/api/positions/${p.id}`, {
            shares: Number(stueck.value),
            buyPrice: kurs.value === '' ? null : Number(kurs.value),
          });
          loadDashboard();
        } }, 'Speichern'),
        el('button', { class: 'btn ghost small', type: 'button', style: 'height:36px;padding:0 14px', onclick: () => loadDashboard() }, 'Abbrechen')
      )
    )
  );
  row.replaceWith(editor);
  stueck.focus();
}

// Kleine Zweitzeile unter dem Tages-%: vor-/nachbörslicher Kurs (US-Werte)
function prepostMini(ab) {
  if (ab?.pct == null) return null;
  return el('span', {
    class: `prepost-mini ${signClass(ab.pct)}`,
    title: ab.phase === 'pre' ? 'Vorbörslicher Handel (Pre-Market)' : 'Nachbörslicher Handel (After-Hours)',
  }, `${ab.phase === 'pre' ? 'Pre' : 'Post'} ${fmtPct(ab.pct)}`);
}

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

  // Wichtige Termine: zwei kompakte Spalten nebeneinander — links "Deine
  // Werte", rechts "Markt-Events". Das Entscheidende (EPS-Erwartung,
  // Prognose) steht direkt in der Zeile; Klick führt zur Analyse bzw.
  // zum Kalender. Kein Aufklappen, minimaler Platz.
  if (d.termine?.length) {
    const eigene = d.termine.filter((t) => t.typ !== 'Markt');
    const markt = d.termine.filter((t) => t.typ === 'Markt').slice(0, 3);

    const wannVon = (t) =>
      t.days === 0
        ? `heute ${new Date(t.date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
        : t.days === 1
          ? 'morgen'
          : new Date(t.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

    const fmtEps = (v) => (v > 0 ? '+' : '') + Number(v).toFixed(2).replace('.', ',');
    const eigeneZeile = (t) =>
      el('a', { class: 'trow', href: `./analyse.html?symbol=${encodeURIComponent(t.symbol)}`, title: `${t.name} — ${t.typ}, ${fmtDate(t.date)}` },
        el('span', { class: 'wann' }, wannVon(t)),
        el('span', { class: 'badge chip chip-sm' }, t.symbol),
        el('span', { class: 'tinfo' },
          t.typ === 'Quartalszahlen' ? 'Quartalszahlen' : 'Ex-Dividende',
          t.epsErwartet != null
            ? el('span', { class: `eps ${t.epsErwartet > 0 ? 'pos' : t.epsErwartet < 0 ? 'neg' : ''}` },
                `EPS erw. ${fmtEps(t.epsErwartet)}`)
            : null,
          // Zahlen sind raus: tatsächliches EPS daneben, gefärbt nach Überraschung
          t.epsTatsaechlich != null
            ? el('span', { class: `eps ${t.ueberraschungPct > 0 ? 'pos' : t.ueberraschungPct < 0 ? 'neg' : ''}` },
                `Ist ${fmtEps(t.epsTatsaechlich)}${t.ueberraschungPct != null ? ` (${t.ueberraschungPct > 0 ? '+' : ''}${String(t.ueberraschungPct).replace('.', ',')} %)` : ''}`)
            : null
        )
      );

    const marktZeile = (t) => {
      const kurzTitel = t.name.replace(/\s*\((Monat|Jahr|Quartal)\)/g, '');
      return el('a', { class: 'trow', href: './kalender.html', title: `${t.name} — Prognose ${t.prognose ?? '–'}, vorher ${t.vorher ?? '–'}` },
        el('span', { class: 'wann' }, wannVon(t)),
        el('span', { class: 'badge chip-sm' }, t.waehrung === 'USD' ? '🇺🇸' : '🇪🇺'),
        el('span', { class: 'tinfo' },
          kurzTitel,
          t.prognose ? el('span', { class: 'eps' }, `Prog. ${t.prognose}`) : null,
          // Wert ist veröffentlicht: Ist-Wert daneben, grün/rot je nach Trend
          t.aktuell
            ? el('span', { class: `eps ${t.aktuellTrend === 'gut' ? 'pos' : t.aktuellTrend === 'schlecht' ? 'neg' : ''}` },
                `Ist ${t.aktuell}`)
            : null
        )
      );
    };

    document.getElementById('termine-wrap').replaceChildren(
      el('section', { class: 'panel', style: 'margin-bottom:18px;padding-bottom:14px' },
        el('h2', { class: 'panel-title' }, 'Wichtige Termine', el('span', { class: 'hint' }, ' · nächste 14 Tage')),
        el('div', { class: 'termine-grid' },
          el('div', { class: 'termine-col' },
            el('div', { class: 'tcol-head' }, 'Deine Werte'),
            eigene.length ? eigene.map(eigeneZeile) : el('div', { class: 'empty', style: 'padding:10px 0' }, 'Keine Termine deiner Werte.')
          ),
          el('div', { class: 'termine-col' },
            el('div', { class: 'tcol-head' }, 'Markt-Events'),
            markt.length ? markt.map(marktZeile) : el('div', { class: 'empty', style: 'padding:10px 0' }, 'Keine großen Markt-Events.')
          )
        )
      )
    );
  }

  // Positionsliste — Ändern/Löschen direkt in der Zeile (Icons erscheinen beim Hover)
  const posBox = document.getElementById('positions');
  if (!hasPositions) {
    posBox.replaceChildren(
      el('div', { class: 'empty' },
        el('div', { class: 'big' }, 'Noch keine Positionen.'),
        el('div', {}, 'Über „+ Position hinzufügen“ unten legst du deine erste Position an — die Kurse laufen dann automatisch hier ein.')
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
          el('th', { class: 'num' }, 'G/V'),
          el('th', {}, '')
        )
      ),
      el('tbody', {},
        d.positions.map((p) => {
          const row = el('tr', { class: 'rowlink', onclick: () => (location.href = `./analyse.html?symbol=${encodeURIComponent(p.symbol)}`) },
            el('td', { class: 'name-cell' }, p.name, el('span', { class: 'sym' }, `${p.symbol} · ${p.shares} Stk.`)),
            el('td', { class: 'num' }, fmtMoney(p.preis, p.waehrung)),
            el('td', { class: `num ${signClass(p.tagesPct)}` }, fmtPct(p.tagesPct), prepostMini(p.ausserboerslich)),
            el('td', {}, sparkline(p.sparkline)),
            el('td', { class: 'num' }, fmtEur(p.valueEur)),
            el('td', { class: `num ${signClass(p.gewinnEur)}` },
              `${fmtEur(p.gewinnEur)}`,
              el('span', { class: 'dim' }, ` (${fmtPct(p.gewinnPct)})`)
            ),
            el('td', { class: 'row-actions', onclick: (e) => e.stopPropagation() },
              iconBtn('stift', 'Stückzahl / Ø-Kaufkurs ändern', () => editPosition(p, row, 7)),
              iconBtn('kreuz', 'Position löschen', async () => {
                await api.del(`/api/positions/${p.id}`);
                loadDashboard();
              })
            )
          );
          return row;
        })
      )
    );
    posBox.replaceChildren(table);
  }

  // Watchlist: eigene, beschriftete Tabelle (gleiche Lesart wie Positionen)
  const watchBox = document.getElementById('watchlist');
  if (!d.watchlist.length) {
    watchBox.replaceChildren(el('div', { class: 'empty' }, 'Keine beobachteten Werte — über „+ Wert beobachten“ unten hinzufügen.'));
  } else {
    watchBox.replaceChildren(
      el('table', { class: 'data' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'Wert'),
            el('th', { class: 'num' }, 'Kurs'),
            el('th', { class: 'num' }, 'Heute'),
            el('th', {}, 'Trend', el('span', {class:'th-sub'}, ' 30 T.')),
            el('th', {}, '')
          )
        ),
        el('tbody', {},
          d.watchlist.map((w) =>
            el('tr', { class: 'rowlink', onclick: () => (location.href = `./analyse.html?symbol=${encodeURIComponent(w.symbol)}`) },
              el('td', { class: 'name-cell' }, w.name, el('span', { class: 'sym' }, w.symbol)),
              el('td', { class: 'num' }, fmtMoney(w.preis, w.waehrung)),
              el('td', { class: `num ${signClass(w.tagesPct)}` }, fmtPct(w.tagesPct), prepostMini(w.ausserboerslich)),
              el('td', {}, sparkline(w.sparkline)),
              el('td', { class: 'row-actions', onclick: (e) => e.stopPropagation() },
                iconBtn('kreuz', 'Von der Watchlist entfernen', async () => {
                  await api.del(`/api/watchlist/${encodeURIComponent(w.symbol)}`);
                  loadDashboard();
                })
              )
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
  // Kompakt halten: erst 5 News, der Rest aufklappbar
  const erste = nodes.slice(0, 5);
  const rest = nodes.slice(5);
  box.replaceChildren(...notices, ...filterInfo, ...erste,
    ...(rest.length ? [collapsible(`Mehr anzeigen (${rest.length})`, rest)] : []));
}

// ---------- Inline-Hinzufügen direkt im Dashboard ----------
// Unter jeder Tabelle sitzt ein dezenter "+ …"-Knopf; Klick klappt das
// Formular auf (Knopf wird zu "Schließen"), nach dem Anlegen klappt es zu.

function bindAddForm(btnId, boxId, bauen) {
  const btn = document.getElementById(btnId);
  const box = document.getElementById(boxId);
  if (!btn || !box) return;
  const label = btn.textContent;
  let gebaut = false;
  const zuklappen = () => {
    box.hidden = true;
    btn.textContent = label;
  };
  btn.addEventListener('click', () => {
    if (!gebaut) {
      bauen(box, zuklappen);
      gebaut = true;
    }
    if (box.hidden) {
      box.hidden = false;
      btn.textContent = 'Schließen';
      box.querySelector('input')?.focus();
    } else {
      zuklappen();
    }
  });
}

// Position: Wert suchen, Stückzahl + Ø-Kaufkurs eingeben, fertig
bindAddForm('add-pos-btn', 'add-pos-form', (box, zuklappen) => {
  let gewaehlt = null;
  const hinweis = el('div', { class: 'notice', hidden: 'hidden' });
  const suche = el('input', { type: 'text', placeholder: 'Name oder Ticker …', autocomplete: 'off' });
  const form = el('form', { class: 'inline-add' },
    el('span', { class: 'search-wrap', style: 'flex:2;min-width:180px' }, suche),
    el('input', { type: 'number', step: 'any', min: '0', name: 'shares', placeholder: 'Stück', required: 'required', style: 'flex:1;min-width:90px' }),
    el('input', { type: 'number', step: 'any', min: '0', name: 'buyPrice', placeholder: 'Ø-Kaufkurs', style: 'flex:1;min-width:110px' }),
    el('button', { class: 'btn small', type: 'submit' }, 'Hinzufügen')
  );
  attachSearch(suche, (r) => {
    gewaehlt = r;
    suche.value = `${r.symbol} — ${r.name}`;
    hinweis.hidden = true;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!gewaehlt) {
      hinweis.hidden = false;
      hinweis.textContent = 'Bitte zuerst über die Suche einen Wert auswählen.';
      return;
    }
    const knopf = form.querySelector('button');
    knopf.disabled = true;
    try {
      await api.post('/api/positions', { symbol: gewaehlt.symbol, shares: form.shares.value, buyPrice: form.buyPrice.value || null });
      gewaehlt = null;
      form.reset();
      zuklappen();
      loadDashboard();
      loadNews();
    } catch (err) {
      hinweis.hidden = false;
      hinweis.textContent = `Fehler: ${err.message}`;
    } finally {
      knopf.disabled = false;
    }
  });
  box.append(form, hinweis);
});

// Watchlist: Wert suchen → direkt beobachten.
// Wichtig: erst in den .search-wrap einhängen, DANN attachSearch —
// sonst findet die Vorschlagsbox ihren Anker nicht.
bindAddForm('add-watch-btn', 'add-watch-form', (box, zuklappen) => {
  const suche = el('input', { type: 'text', placeholder: 'Name oder Ticker suchen …', autocomplete: 'off' });
  box.append(el('div', { class: 'inline-add' }, el('span', { class: 'search-wrap', style: 'flex:1' }, suche)));
  attachSearch(suche, async (r) => {
    suche.value = '';
    zuklappen();
    await api.post('/api/watchlist', { symbol: r.symbol }).catch(() => {});
    loadDashboard();
    loadNews();
  });
});

loadDashboard();
loadNews();
