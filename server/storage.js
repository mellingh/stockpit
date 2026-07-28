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
  experts: [
    // Vorbelegt nach Wunsch; jederzeit in der App änderbar
    { id: 'biotech2k1', name: 'Biotech2k', handle: 'Biotech2k1', tickers: [] },
  ],
  expertPosts: [], // {id, expertId, symbol, text, date, sentiment: {label, score}}
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

export function addExpert(expert) {
  load();
  const entry = { id: newId(), tickers: [], ...expert };
  data.experts.push(entry);
  save();
  return entry;
}

export function updateExpert(id, patch) {
  load();
  const e = data.experts.find((x) => x.id === id);
  if (!e) return null;
  Object.assign(e, patch);
  save();
  return e;
}

export function removeExpert(id) {
  load();
  data.experts = data.experts.filter((e) => e.id !== id);
  data.expertPosts = data.expertPosts.filter((p) => p.expertId !== id);
  save();
}

export function addExpertPost(post) {
  load();
  const entry = { id: newId(), date: new Date().toISOString(), ...post };
  data.expertPosts.push(entry);
  save();
  return entry;
}

export function removeExpertPost(id) {
  load();
  data.expertPosts = data.expertPosts.filter((p) => p.id !== id);
  save();
}

// Alle Symbole, die den Nutzer interessieren (Positionen + Watchlist)
export function trackedSymbols() {
  load();
  const set = new Map();
  for (const p of data.positions) set.set(p.symbol, p.name || p.symbol);
  for (const w of data.watchlist) set.set(w.symbol, w.name || w.symbol);
  return [...set.entries()].map(([symbol, name]) => ({ symbol, name }));
}
