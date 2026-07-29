// Wirtschaftskalender im investing.com-Stil: eine Filterzeile
// (Gestern/Heute/Morgen/Diese Woche + Wichtigkeit), Tabelle mit
// Aktuell/Prognose/Vorher — Aktuell grün/rot je nach besser/schlechter.
import { api } from './api.js';
import { el, markActiveNav } from './ui.js';

markActiveNav();

const WAEHRUNG_LABEL = {
  USD: '🇺🇸 USD', EUR: '🇪🇺 EUR', GBP: '🇬🇧 GBP', JPY: '🇯🇵 JPY',
  CNY: '🇨🇳 CNY', CHF: '🇨🇭 CHF', CAD: '🇨🇦 CAD', AUD: '🇦🇺 AUD', NZD: '🇳🇿 NZD',
  INR: '🇮🇳 INR', KRW: '🇰🇷 KRW', BRL: '🇧🇷 BRL', SGD: '🇸🇬 SGD', HKD: '🇭🇰 HKD',
};

const IMPACT_STARS = {
  High: { stars: '★★★', cls: 's3', label: 'hohe Marktwirkung' },
  Medium: { stars: '★★☆', cls: 's2', label: 'mittlere Marktwirkung' },
  Low: { stars: '★☆☆', cls: 's1', label: 'geringe Marktwirkung' },
};

let events = [];
let impFilter = 'med';
let dayFilter = 'heute';

const dayKey = (d) => new Date(d).toLocaleDateString('de-DE');
const offsetDay = (n) => dayKey(new Date(Date.now() + n * 86400000));

function passes(e) {
  if (impFilter === 'high' && e.wichtigkeit !== 'High') return false;
  if (impFilter === 'med' && e.wichtigkeit === 'Low') return false;
  if (dayFilter === 'woche') return true;
  const target = { gestern: offsetDay(-1), heute: offsetDay(0), morgen: offsetDay(1) }[dayFilter];
  return dayKey(e.zeit) === target;
}

function eventRow(e) {
  const imp = IMPACT_STARS[e.wichtigkeit] ?? IMPACT_STARS.Low;
  const time = new Date(e.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const aktuellCls = e.aktuellTrend === 'gut' ? 'pos' : e.aktuellTrend === 'schlecht' ? 'neg' : '';
  return el('tr', {},
    el('td', { class: 'num', style: 'text-align:left;width:56px' }, time),
    el('td', { style: 'width:88px;white-space:nowrap' }, WAEHRUNG_LABEL[e.waehrung] ?? e.waehrung ?? '–'),
    el('td', { style: 'width:64px' }, el('span', { class: `stars ${imp.cls}`, title: imp.label }, imp.stars)),
    el('td', { class: 'name-cell' }, e.titel),
    el('td', { class: `num ${aktuellCls}`, title: e.aktuellTrend ? `${e.aktuellTrend === 'gut' ? 'besser' : 'schlechter'} als Prognose` : '' }, e.aktuell ?? '–'),
    el('td', { class: 'num' }, e.prognose ?? '–'),
    el('td', { class: 'num dim' }, e.vorher ?? '–')
  );
}

function render() {
  const box = document.getElementById('calendar');
  const list = events.filter(passes);

  if (!list.length) {
    box.replaceChildren(
      el('div', { class: 'empty' },
        el('div', { class: 'big' }, 'Keine Termine mit diesen Filtern.'),
        el('div', {}, 'Tipp: „Diese Woche“ wählen oder die Wichtigkeit auf „Alle“ stellen.')
      )
    );
    return;
  }

  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'Zeit'), el('th', {}, 'Land'), el('th', {}, 'Relev.'), el('th', {}, 'Termin'),
      el('th', { class: 'num' }, 'Aktuell'), el('th', { class: 'num' }, 'Prognose'), el('th', { class: 'num' }, 'Vorherig')
    )
  );

  const tbody = el('tbody');
  const today = dayKey(new Date());
  let lastDay = null;
  for (const e of list) {
    const key = dayKey(e.zeit);
    if (dayFilter === 'woche' && key !== lastDay) {
      lastDay = key;
      const label = new Date(e.zeit).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
      tbody.append(el('tr', { class: 'day-sep' }, el('td', { colspan: '7' }, key === today ? `${label} — heute` : label)));
    }
    tbody.append(eventRow(e));
  }

  box.replaceChildren(el('table', { class: 'data cal-table' }, thead, tbody));
}

document.querySelectorAll('[data-day]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-day]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    dayFilter = btn.dataset.day;
    render();
  });
});

document.getElementById('imp-select').addEventListener('change', (e) => {
  impFilter = e.target.value;
  render();
});

api
  .get('/api/calendar')
  .then((d) => {
    events = d.events || [];
    const quelle = document.getElementById('cal-quelle');
    if (quelle) quelle.textContent = `Quelle: ${d.quelle}`;
    render();
  })
  .catch((err) => {
    document.getElementById('calendar').replaceChildren(
      el('div', { class: 'notice err' }, `Kalender nicht erreichbar: ${err.message}`)
    );
  });
