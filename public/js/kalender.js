// Wirtschaftskalender: Events der Woche, gruppiert nach Tag,
// gefiltert nach Marktwirkung. Zeiten in lokaler Zeitzone.
import { api } from './api.js';
import { el, markActiveNav } from './ui.js';

markActiveNav();

const WAEHRUNG_LABEL = {
  USD: '🇺🇸 USA', EUR: '🇪🇺 Eurozone', GBP: '🇬🇧 UK', JPY: '🇯🇵 Japan',
  CNY: '🇨🇳 China', CHF: '🇨🇭 Schweiz', CAD: '🇨🇦 Kanada', AUD: '🇦🇺 Australien', NZD: '🇳🇿 Neuseeland',
};

const IMPACT = {
  High: { dot: 'red', label: 'hoch' },
  Medium: { dot: 'yellow', label: 'mittel' },
  Low: { dot: 'gray', label: 'gering' },
  Holiday: { dot: 'gray', label: 'Feiertag' },
};

let events = [];
let filter = 'high';

function passes(e) {
  if (filter === 'all') return true;
  if (filter === 'med') return e.wichtigkeit === 'High' || e.wichtigkeit === 'Medium';
  return e.wichtigkeit === 'High';
}

function render() {
  const box = document.getElementById('calendar');
  const list = events.filter(passes);
  if (!list.length) {
    box.replaceChildren(el('div', { class: 'empty' }, 'Keine Termine mit diesem Filter in dieser Woche.'));
    return;
  }

  // Nach Tag gruppieren
  const byDay = new Map();
  for (const e of list) {
    const d = new Date(e.zeit);
    const key = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }

  const nodes = [];
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  for (const [day, dayEvents] of byDay) {
    nodes.push(
      el('div', { class: 'kpi-label', style: `margin:18px 0 6px;${day === today ? 'color:var(--accent)' : ''}` },
        day === today ? `${day} — heute` : day)
    );
    nodes.push(
      el('table', { class: 'data' },
        el('tbody', {},
          dayEvents.map((e) => {
            const imp = IMPACT[e.wichtigkeit] ?? IMPACT.Low;
            const time = new Date(e.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return el('tr', {},
              el('td', { class: 'num', style: 'text-align:left;width:64px' }, time),
              el('td', { style: 'width:38px' }, el('span', { class: `dot ${imp.dot}`, title: `Marktwirkung: ${imp.label}` })),
              el('td', { style: 'width:130px;white-space:nowrap' }, WAEHRUNG_LABEL[e.waehrung] ?? e.waehrung),
              el('td', { class: 'name-cell' }, e.titel),
              el('td', { class: 'num dim' }, e.prognose ? `Prognose ${e.prognose}` : ''),
              el('td', { class: 'num dim' }, e.vorher ? `Vorher ${e.vorher}` : '')
            );
          })
        )
      )
    );
  }
  box.replaceChildren(...nodes);
}

document.querySelectorAll('.chart-toolbar .rng').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chart-toolbar .rng').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    filter = btn.dataset.imp;
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
