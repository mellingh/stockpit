// Wirtschaftskalender im investing.com-Stil: Tabelle mit Sternen für
// Wichtigkeit, Prognose/Vorher-Spalten, Filter nach Tag und Marktwirkung.
import { api } from './api.js';
import { el, markActiveNav } from './ui.js';

markActiveNav();

const WAEHRUNG_LABEL = {
  USD: '🇺🇸 USD', EUR: '🇪🇺 EUR', GBP: '🇬🇧 GBP', JPY: '🇯🇵 JPY',
  CNY: '🇨🇳 CNY', CHF: '🇨🇭 CHF', CAD: '🇨🇦 CAD', AUD: '🇦🇺 AUD', NZD: '🇳🇿 NZD',
};

const IMPACT_STARS = {
  High: { stars: '★★★', cls: 's3', label: 'hohe Marktwirkung' },
  Medium: { stars: '★★☆', cls: 's2', label: 'mittlere Marktwirkung' },
  Low: { stars: '★☆☆', cls: 's1', label: 'geringe Marktwirkung' },
  Holiday: { stars: '—', cls: 's1', label: 'Feiertag' },
};

let events = [];
let impFilter = 'med';
let dayFilter = 'heute';

const dayKey = (d) => new Date(d).toLocaleDateString('de-DE');

function passesImpact(e) {
  if (impFilter === 'all') return true;
  if (impFilter === 'med') return e.wichtigkeit === 'High' || e.wichtigkeit === 'Medium';
  return e.wichtigkeit === 'High';
}

function passesDay(e) {
  if (dayFilter === 'woche') return true;
  const heute = new Date();
  if (dayFilter === 'heute') return dayKey(e.zeit) === dayKey(heute);
  const morgen = new Date(heute.getTime() + 86400000);
  return dayKey(e.zeit) === dayKey(morgen);
}

function eventRow(e) {
  const imp = IMPACT_STARS[e.wichtigkeit] ?? IMPACT_STARS.Low;
  const time = new Date(e.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return el('tr', {},
    el('td', { class: 'num', style: 'text-align:left;width:56px' }, time),
    el('td', { style: 'width:88px;white-space:nowrap' }, WAEHRUNG_LABEL[e.waehrung] ?? e.waehrung),
    el('td', { style: 'width:64px' }, el('span', { class: `stars ${imp.cls}`, title: imp.label }, imp.stars)),
    el('td', { class: 'name-cell' }, e.titel),
    el('td', { class: 'num' }, e.prognose ?? '–'),
    el('td', { class: 'num dim' }, e.vorher ?? '–')
  );
}

function render() {
  const box = document.getElementById('calendar');
  const list = events.filter((e) => passesImpact(e) && passesDay(e));

  if (!list.length) {
    box.replaceChildren(
      el('div', { class: 'empty' },
        el('div', { class: 'big' }, 'Keine Termine mit diesen Filtern.'),
        el('div', {}, dayFilter !== 'woche' ? 'Tipp: auf „Ganze Woche“ oder eine niedrigere Wichtigkeit umschalten.' : 'Tipp: niedrigere Wichtigkeit wählen.')
      )
    );
    return;
  }

  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'Zeit'), el('th', {}, 'Land'), el('th', {}, 'Wichtig'),
      el('th', {}, 'Ereignis'), el('th', { class: 'num' }, 'Prognose'), el('th', { class: 'num' }, 'Vorher')
    )
  );

  const tbody = el('tbody');
  const today = dayKey(new Date());
  let lastDay = null;
  for (const e of list) {
    const key = dayKey(e.zeit);
    // Bei Wochenansicht: Tages-Trennzeile wie bei investing.com
    if (dayFilter === 'woche' && key !== lastDay) {
      lastDay = key;
      const label = new Date(e.zeit).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
      tbody.append(
        el('tr', { class: 'day-sep' },
          el('td', { colspan: '6' }, key === today ? `${label} — heute` : label)
        )
      );
    }
    tbody.append(eventRow(e));
  }

  box.replaceChildren(el('table', { class: 'data cal-table' }, thead, tbody));
}

// Filter-Knöpfe: Tag (heute/morgen/Woche) und Wichtigkeit getrennt
document.querySelectorAll('[data-day]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-day]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    dayFilter = btn.dataset.day;
    render();
  });
});
document.querySelectorAll('[data-imp]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-imp]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    impFilter = btn.dataset.imp;
    render();
  });
});

api
  .get('/api/calendar')
  .then((d) => {
    events = d.events || [];
    render();
  })
  .catch((err) => {
    document.getElementById('calendar').replaceChildren(
      el('div', { class: 'notice err' }, `Kalender nicht erreichbar: ${err.message}`)
    );
  });
