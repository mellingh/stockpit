// Persistenz: eine einzige JSON-Datei (data/portfolio.json).
// Bewusst simpel — portabel, menschenlesbar, per .gitignore vom Repo ausgeschlossen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'portfolio.json');

const DEFAULT_DATA = {
  positions: [], // {id, symbol, name, shares, buyPrice, currency, buyDate}
  watchlist: [], // {symbol, name}
  xAccounts: ['TheLongInvest', 'Biotech2k1', 'thestockwhale'], // X-Handles für die "Meinungen auf X"-Links (Michas Standard-Trio)
  // Quick-Links auf externe Seiten; {TICKER} wird durch das Symbol ersetzt
  webLinks: [
    { name: 'Yahoo Finance', url: 'https://de.finance.yahoo.com/quote/{TICKER}/' },
    { name: 'Simply Wall St', url: 'https://simplywall.st/stocks?search={TICKER}' },
    { name: 'TradingView', url: 'https://de.tradingview.com/chart/?symbol={TICKER}' },
    { name: 'Finviz', url: 'https://finviz.com/quote.ashx?t={TICKER}' },
  ],
};

let data = null;

function load() {
  if (data) return data;
  try {
    data = { ...DEFAULT_DATA, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    data = structuredClone(DEFAULT_DATA);
  }
  return data;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

const newId = () => Math.random().toString(36).slice(2, 10);

export function getData() {
  return load();
}

export function addPosition(pos) {
  load();
  const entry = { id: newId(), ...pos };
  data.positions.push(entry);
  save();
  return entry;
}

export function updatePosition(id, patch) {
  load();
  const pos = data.positions.find((p) => p.id === id);
  if (!pos) return null;
  Object.assign(pos, patch);
  save();
  return pos;
}

export function removePosition(id) {
  load();
  data.positions = data.positions.filter((p) => p.id !== id);
  save();
}

export function addWatch(item) {
  load();
  if (!data.watchlist.some((w) => w.symbol === item.symbol)) {
    data.watchlist.push(item);
    save();
  }
  return item;
}

export function removeWatch(symbol) {
  load();
  data.watchlist = data.watchlist.filter((w) => w.symbol !== symbol);
  save();
}

// ---------- X-Accounts (für die Schnell-Links auf der Analyse-Seite) ----------

export function getXAccounts() {
  load();
  return data.xAccounts ?? [];
}

export function addXAccount(handle) {
  load();
  if (!data.xAccounts) data.xAccounts = [];
  if (!data.xAccounts.some((h) => h.toLowerCase() === handle.toLowerCase())) {
    data.xAccounts.push(handle);
    save();
  }
  return data.xAccounts;
}

export function removeXAccount(handle) {
  load();
  data.xAccounts = (data.xAccounts ?? []).filter((h) => h.toLowerCase() !== handle.toLowerCase());
  save();
  return data.xAccounts;
}

// ---------- Web-Quick-Links (Analyse-Seitenspalte) ----------

export function getWebLinks() {
  load();
  return data.webLinks ?? [];
}

export function addWebLink(link) {
  load();
  if (!data.webLinks) data.webLinks = [];
  if (!data.webLinks.some((l) => l.url === link.url)) {
    data.webLinks.push(link);
    save();
  }
  return data.webLinks;
}

export function removeWebLink(url) {
  load();
  data.webLinks = (data.webLinks ?? []).filter((l) => l.url !== url);
  save();
  return data.webLinks;
}

// Alle Symbole, die den Nutzer interessieren (Positionen + Watchlist)
export function trackedSymbols() {
  load();
  const set = new Map();
  for (const p of data.positions) set.set(p.symbol, p.name || p.symbol);
  for (const w of data.watchlist) set.set(w.symbol, w.name || w.symbol);
  return [...set.entries()].map(([symbol, name]) => ({ symbol, name }));
}
