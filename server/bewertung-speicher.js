// Persistenz der Bewertungen: eigene Datei `data/bewertungen.json`, damit
// portfolio.json schlank bleibt. Wie dort: lokal, menschenlesbar, gitignored.
//
// Jede gespeicherte Bewertung ist UNVERÄNDERLICH — eine Änderung hängt eine
// neue Version an, überschreibt aber nie eine alte. Nur so lässt sich in sechs
// Monaten prüfen, welche Annahme sich als falsch erwiesen hat.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'bewertungen.json');

const LEER = { bewertungen: [] };

function load() {
  try {
    const roh = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { ...LEER, ...roh };
  } catch {
    return structuredClone(LEER);
  }
}

function save(daten) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(daten, null, 2), 'utf8');
}

const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Übersicht ohne die schweren Modelldaten. */
export function listeBewertungen() {
  return load().bewertungen.map((b) => {
    const letzte = b.versionen[b.versionen.length - 1];
    return {
      id: b.id,
      symbol: b.symbol,
      name: b.name,
      verfahren: letzte?.modell?.verfahren ?? null,
      erstellt: b.erstellt,
      geaendert: letzte?.zeit ?? b.erstellt,
      versionen: b.versionen.length,
      wertJeAktie: letzte?.wertJeAktie ?? null,
      kurs: letzte?.modell?.kurs ?? null,
      waehrung: letzte?.modell?.waehrung ?? null,
    };
  }).sort((a, b) => String(b.geaendert).localeCompare(String(a.geaendert)));
}

/** Eine Bewertung mit allen Versionen; `version` wählt eine bestimmte aus. */
export function holeBewertung(id, version) {
  const b = load().bewertungen.find((x) => x.id === id);
  if (!b) return null;
  if (version == null) return b;
  const v = b.versionen.find((x) => x.version === Number(version));
  return v ? { ...b, versionen: [v] } : null;
}

/**
 * Speichert eine neue Version. Ohne `id` entsteht eine neue Bewertung.
 * `wertJeAktie` wird für die Übersichtsliste mitgeschrieben, damit sie sich
 * ohne Nachrechnen anzeigen lässt.
 */
export function speichereVersion({ id, modell, notiz, markt, wertJeAktie }) {
  const daten = load();
  const jetzt = new Date().toISOString();
  let eintrag = id ? daten.bewertungen.find((x) => x.id === id) : null;

  if (!eintrag) {
    eintrag = {
      id: id ?? neueId(),
      symbol: modell.symbol,
      name: modell.name,
      erstellt: jetzt,
      versionen: [],
    };
    daten.bewertungen.push(eintrag);
  }

  const version = {
    version: (eintrag.versionen[eintrag.versionen.length - 1]?.version ?? 0) + 1,
    zeit: jetzt,
    notiz: notiz ?? null,
    wertJeAktie: wertJeAktie ?? null,
    // Marktwerte zum Zeitpunkt der Bewertung — sonst laufen die
    // Konsistenzpruefungen beim spaeteren Oeffnen ins Leere.
    markt: markt ?? {},
    modell,
  };
  eintrag.versionen.push(version);
  save(daten);
  return { id: eintrag.id, version: version.version };
}

export function loescheBewertung(id) {
  const daten = load();
  const vorher = daten.bewertungen.length;
  daten.bewertungen = daten.bewertungen.filter((x) => x.id !== id);
  if (daten.bewertungen.length === vorher) return false;
  save(daten);
  return true;
}
