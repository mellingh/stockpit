// Verwaltung: Positionen und Watchlist.
import { api } from './api.js';
import { el, fmtMoney, attachSearch, markActiveNav, confirmDialog } from './ui.js';

markActiveNav();

const $ = (id) => document.getElementById(id);

// ---------- Neue Position ----------

let picked = null;

attachSearch($('pos-search'), (r) => {
  picked = r;
  const note = $('pos-picked');
  note.hidden = false;
  note.textContent = `Ausgewählt: ${r.name} (${r.symbol}, ${r.exchange || '–'}${r.type === 'ETF' ? ', ETF' : ''})`;
});

$('add-position').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!picked) {
    $('pos-picked').hidden = false;
    $('pos-picked').textContent = 'Bitte zuerst über die Suche einen Wert auswählen.';
    return;
  }
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    await api.post('/api/positions', {
      symbol: picked.symbol,
      shares: form.shares.value,
      buyPrice: form.buyPrice.value || null,
    });
    picked = null;
    form.reset();
    $('pos-picked').hidden = true;
    $('pos-search').value = '';
    await renderPositions();
  } catch (err) {
    $('pos-picked').hidden = false;
    $('pos-picked').textContent = `Fehler: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Positionsliste ----------

async function renderPositions() {
  const box = $('positions-list');
  const d = await api.get('/api/dashboard').catch(() => null);
  if (!d) {
    box.replaceChildren(el('div', { class: 'notice err' }, 'Positionen konnten nicht geladen werden.'));
    return;
  }
  if (!d.positions.length) {
    box.replaceChildren(el('div', { class: 'empty' }, 'Noch keine Positionen angelegt.'));
    return;
  }
  box.replaceChildren(
    el('table', { class: 'data' },
      el('thead', {},
        el('tr', {},
          el('th', {}, 'Wert'),
          el('th', { class: 'num' }, 'Stück'),
          el('th', { class: 'num' }, 'Ø-Kaufkurs'),
          el('th', {}, '')
        )
      ),
      el('tbody', {},
        d.positions.map((p) => {
          const row = el('tr', {},
            el('td', { class: 'name-cell' }, p.name, el('span', { class: 'sym' }, p.symbol)),
            el('td', { class: 'num' }, String(p.shares)),
            el('td', { class: 'num' }, fmtMoney(p.buyPrice, p.currency || p.waehrung)),
            el('td', { style: 'text-align:right;white-space:nowrap' },
              el('button', { class: 'btn ghost small', type: 'button', onclick: () => editPosition(p, row) }, 'Ändern'),
              ' ',
              el('button', { class: 'btn danger small', type: 'button', onclick: async () => {
                if (!(await confirmDialog(`Position ${p.symbol} (${p.name}) wirklich löschen?`))) return;
                await api.del(`/api/positions/${p.id}`);
                renderPositions();
              } }, 'Löschen')
            )
          );
          return row;
        })
      )
    )
  );
}

function editPosition(p, row) {
  const sharesInput = el('input', { type: 'number', step: 'any', min: '0', value: p.shares, style: 'width:90px' });
  const priceInput = el('input', { type: 'number', step: 'any', min: '0', value: p.buyPrice ?? '', style: 'width:110px' });
  row.children[1].replaceChildren(sharesInput);
  row.children[2].replaceChildren(priceInput);
  row.children[3].replaceChildren(
    el('button', { class: 'btn small', type: 'button', onclick: async () => {
      await api.patch(`/api/positions/${p.id}`, {
        shares: Number(sharesInput.value),
        buyPrice: priceInput.value === '' ? null : Number(priceInput.value),
      });
      renderPositions();
    } }, 'Speichern'),
    ' ',
    el('button', { class: 'btn ghost small', type: 'button', onclick: renderPositions }, 'Abbrechen')
  );
}

// ---------- Watchlist ----------

attachSearch($('watch-search'), async (r) => {
  $('watch-search').value = '';
  await api.post('/api/watchlist', { symbol: r.symbol }).catch((err) => alert(err.message));
  renderWatchlist();
});

async function renderWatchlist() {
  const box = $('watch-list');
  const d = await api.get('/api/dashboard').catch(() => null);
  if (!d?.watchlist?.length) {
    box.replaceChildren(el('div', { class: 'empty' }, 'Keine beobachteten Werte.'));
    return;
  }
  box.replaceChildren(
    el('table', { class: 'data' },
      el('tbody', {},
        d.watchlist.map((w) =>
          el('tr', {},
            el('td', { class: 'name-cell' }, w.name, el('span', { class: 'sym' }, w.symbol)),
            el('td', { style: 'text-align:right' },
              el('button', { class: 'btn danger small', type: 'button', onclick: async () => {
                await api.del(`/api/watchlist/${encodeURIComponent(w.symbol)}`);
                renderWatchlist();
              } }, 'Entfernen')
            )
          )
        )
      )
    )
  );
}

renderPositions();
renderWatchlist();
