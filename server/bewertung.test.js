// Tests der Bewertungsrechnung. Laufen mit `npm test` (node --test).
// Testfall ist ein Biotech mit zwei zugelassenen Produkten, einem
// Phase-3-Kandidaten und vier frühen Programmen.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  perzentil,
  szenarioWert,
  szenarioWerte,
  equityBridge,
  rechneDcf,
  rechneRnpv,
  rechneSotp,
  rechneResidual,
  rechne,
  szenarien,
} from './bewertung.js';
import { sensitivitaet, monteCarlo, pruefungen, verteilungFuer } from './bewertung-analyse.js';
import { POS_PHASEN, RNPV_MULTIPLE } from './bewertung-regeln.js';

const MIO = 1e6;
const MRD = 1e9;

/** Annahme mit den Pflichtfeldern. */
const an = (id, label, wert, quelle, extra = {}) => ({
  id, label, wert, quelle, stand: '2026-09-01', herkunft: 'manuell', ...extra,
});

/** Testmodell: Biotech, sieben Programme. */
function biotech() {
  const zeilen = [
    { id: 'p1', name: 'Alpha', indikation: 'Bronchiektasen', phase: 'zugelassen' },
    { id: 'p2', name: 'Beta', indikation: 'Psoriasis', phase: 'zugelassen' },
    { id: 'p3', name: 'Gamma', indikation: 'Progrediente Lungenfibrose', phase: 'phase3' },
    { id: 'p4', name: 'Gamma', indikation: 'Idiopathische Lungenfibrose', phase: 'phase3', ueberschneidungPct: 0.4 },
    { id: 'p5', name: 'Delta', indikation: 'Onkologie solide', phase: 'phase1' },
    { id: 'p6', name: 'Epsilon', indikation: 'Seltene Stoffwechsel', phase: 'phase1' },
    { id: 'p7', name: 'Zeta', indikation: 'Neurologie', phase: 'praeklinisch' },
  ];
  const pos = (id) => POS_PHASEN.find((p) => p.id === id).pos;
  const spitzen = { p1: 900 * MIO, p2: 400 * MIO, p3: 1.2 * MRD, p4: 800 * MIO, p5: 300 * MIO, p6: 250 * MIO, p7: 200 * MIO };

  const annahmen = [];
  for (const z of zeilen) {
    annahmen.push(an('zeile.' + z.id + '.spitzenumsatz', z.name + ' Spitzenumsatz', spitzen[z.id], 'analystenkonsens', { einheit: 'geld', gruppe: z.name }));
    annahmen.push(an('zeile.' + z.id + '.pos', z.name + ' Erfolgswahrscheinlichkeit', pos(z.phase), 'eigene_schaetzung',
      { einheit: 'prozent', regel: 'erfolgswahrscheinlichkeit', bernoulli: z.phase !== 'zugelassen', gruppe: z.name }));
    annahmen.push(an('zeile.' + z.id + '.multiple', z.name + ' Multiple', RNPV_MULTIPLE.patentgeschuetzt, 'peer_gruppe', { einheit: 'faktor', gruppe: z.name }));
  }
  annahmen.push(an('bridge.cash', 'Zahlungsmittel', 1.5 * MRD, 'geschaeftsbericht', { einheit: 'geld', gruppe: 'Equity Bridge' }));
  annahmen.push(an('bridge.schulden', 'Finanzverbindlichkeiten', 600 * MIO, 'geschaeftsbericht', { einheit: 'geld', gruppe: 'Equity Bridge' }));
  annahmen.push(an('bridge.leasing', 'Leasing', 80 * MIO, 'geschaeftsbericht', { einheit: 'geld', gruppe: 'Equity Bridge' }));
  annahmen.push(an('bridge.minderheiten', 'Minderheitsanteile', 0, 'geschaeftsbericht', { einheit: 'geld', gruppe: 'Equity Bridge' }));
  annahmen.push(an('bridge.pensionen', 'Pensionen', 0, 'geschaeftsbericht', { einheit: 'geld', gruppe: 'Equity Bridge' }));
  annahmen.push(an('bridge.royalty', 'Royalty-Financing', 150 * MIO, 'geschaeftsbericht', { einheit: 'geld', gruppe: 'Equity Bridge' }));
  annahmen.push(an('bridge.aktien', 'Aktien voll verwässert', 120 * MIO, 'geschaeftsbericht', { einheit: 'anzahl', gruppe: 'Equity Bridge' }));
  annahmen.push(an('bridge.verwaesserung', 'Künftige Verwässerung', 0.06, 'eigene_schaetzung', { einheit: 'prozent', regel: 'verwaesserung', gruppe: 'Equity Bridge' }));

  return { symbol: 'TEST', name: 'Testbiotech', verfahren: 'rnpv', waehrung: 'USD', kurs: 40, kursStand: '2026-09-17', stand: '2026-09-17', annahmen, zeilen };
}

// ---------- Grundlagen ----------

test('Perzentil interpoliert linear', () => {
  assert.equal(perzentil([10, 20, 30, 40, 50], 0.5), 30);
  assert.equal(perzentil([10, 20], 0.25), 12.5);
  assert.equal(perzentil([], 0.5), null);
  assert.equal(perzentil([7], 0.9), 7);
});

test('Ist-Zahlen aus dem Geschäftsbericht werden in keinem Szenario skaliert', () => {
  const a = an('bridge.cash', 'Cash', 1000, 'geschaeftsbericht');
  assert.equal(szenarioWert(a, 'worst'), 1000);
  assert.equal(szenarioWert(a, 'base'), 1000);
  assert.equal(szenarioWert(a, 'best'), 1000);
});

test('Management-Guidance wird asymmetrisch gekürzt', () => {
  const a = an('x', 'Peak Sales', 1000, 'management_guidance');
  assert.equal(szenarioWert(a, 'worst'), 450);
  assert.equal(szenarioWert(a, 'base'), 650);
  assert.equal(szenarioWert(a, 'best'), 900);
});

test('Peer-Multiple nutzt Perzentile, ohne Peers die Ersatzregel', () => {
  const mit = an('m', 'Multiple', 5, 'peer_gruppe', { peers: [2, 4, 6, 8, 10] });
  assert.equal(szenarioWert(mit, 'worst'), 4);
  assert.equal(szenarioWert(mit, 'base'), 6);
  assert.equal(szenarioWert(mit, 'best'), 8);

  const ohne = an('m', 'Multiple', 4, 'peer_gruppe');
  assert.equal(szenarioWert(ohne, 'worst'), 3);
  assert.equal(szenarioWert(ohne, 'best'), 5);
});

test('Erfolgswahrscheinlichkeit wird bei 95 Prozent gedeckelt', () => {
  const a = an('p', 'PoS', 0.87, 'eigene_schaetzung', { regel: 'erfolgswahrscheinlichkeit' });
  assert.equal(szenarioWert(a, 'best'), 0.95); // 0,87 × 1,2 = 1,044 → gedeckelt
  assert.ok(Math.abs(szenarioWert(a, 'worst') - 0.609) < 1e-9);
});

test('Kapitalkosten verschieben sich in Prozentpunkten, nicht prozentual', () => {
  const a = an('k', 'WACC', 0.09, 'eigene_schaetzung', { regel: 'kapitalkosten' });
  assert.ok(Math.abs(szenarioWert(a, 'worst') - 0.11) < 1e-12);
  assert.ok(Math.abs(szenarioWert(a, 'best') - 0.08) < 1e-12);
});

test('Manuelle Überschreibung sticht die Regel', () => {
  const a = an('x', 'Peak', 1000, 'management_guidance', { ueberschrieben: { best: 2000 } });
  assert.equal(szenarioWert(a, 'best'), 2000);
  assert.equal(szenarioWert(a, 'base'), 650);
});

// ---------- Equity Bridge ----------

test('Equity Bridge rechnet Posten und Verwässerung korrekt', () => {
  const w = {
    'bridge.cash': 1000, 'bridge.schulden': 400, 'bridge.leasing': 100,
    'bridge.minderheiten': 50, 'bridge.pensionen': 30, 'bridge.royalty': 20,
    'bridge.aktien': 100, 'bridge.verwaesserung': 0.10,
  };
  const b = equityBridge(5000, w);
  assert.equal(b.equityValue, 5000 + 1000 - 400 - 100 - 50 - 30 - 20); // 5400
  assert.ok(Math.abs(b.aktien - 110) < 1e-9);
  assert.ok(Math.abs(b.wertJeAktie - 5400 / 110) < 1e-12);
});

test('Ohne Aktienanzahl gibt es keinen Wert je Aktie statt einer Division durch null', () => {
  const b = equityBridge(1000, { 'bridge.aktien': 0 });
  assert.equal(b.wertJeAktie, null);
});

// ---------- Verfahren ----------

test('rNPV multipliziert Spitzenumsatz, Wahrscheinlichkeit und Multiple', () => {
  const zeilen = [{ id: 'a', name: 'A' }];
  const w = { 'zeile.a.spitzenumsatz': 1000, 'zeile.a.pos': 0.55, 'zeile.a.multiple': 3 };
  assert.equal(rechneRnpv(w, zeilen).enterpriseValue, 1000 * 0.55 * 3);
});

test('Überschneidung kürzt den Spitzenumsatz, sonst zählt das Modell doppelt', () => {
  const zeilen = [{ id: 'a', name: 'A', ueberschneidungPct: 0.4 }];
  const w = { 'zeile.a.spitzenumsatz': 1000, 'zeile.a.pos': 1, 'zeile.a.multiple': 1 };
  assert.equal(rechneRnpv(w, zeilen).enterpriseValue, 600);
});

test('SOTP zieht den Konglomeratsabschlag ab', () => {
  const zeilen = [{ id: 's1', name: 'Handel' }, { id: 's2', name: 'Cloud' }];
  const w = {
    'zeile.s1.kennzahl': 100, 'zeile.s1.multiple': 2,
    'zeile.s2.kennzahl': 50, 'zeile.s2.multiple': 8,
    'sotp.konglomeratsabschlag': 0.2,
  };
  const r = rechneSotp(w, zeilen);
  assert.equal(r.brutto, 600);
  assert.equal(r.enterpriseValue, 480);
});

test('DCF weist den Endwertanteil aus', () => {
  const w = {
    'dcf.jahre': 10, 'dcf.umsatz': 1000, 'dcf.wachstum': 0.05, 'dcf.marge': 0.2,
    'dcf.steuerquote': 0.25, 'dcf.investitionen': 0.04, 'dcf.workingCapital': 0.1,
    'dcf.kapitalkosten': 0.09, 'dcf.ewigesWachstum': 0.02,
  };
  const r = rechneDcf(w);
  assert.equal(r.jahresreihe.length, 10);
  assert.ok(r.endwertAnteil > 0 && r.endwertAnteil < 1);
  assert.ok(Math.abs(r.barwertExplizit + r.endwert - r.enterpriseValue) < 1e-6);
});

test('Kapitalkosten werden auf Mindestabstand zur ewigen Wachstumsrate geklemmt', () => {
  // Ohne Klemme waere der Endwert FCF/(0,02-0,02) = unendlich; mit Klemme
  // rechnet das Modell mit 5 % statt 2 % Kapitalkosten und weist das aus.
  const w = { 'dcf.jahre': 5, 'dcf.umsatz': 1000, 'dcf.wachstum': 0.05, 'dcf.marge': 0.2, 'dcf.kapitalkosten': 0.02, 'dcf.ewigesWachstum': 0.02 };
  const r = rechneDcf(w);
  assert.equal(r.waccGeklemmt, true);
  assert.ok(Math.abs(r.wacc - 0.05) < 1e-12);
  assert.ok(r.endwert > 0);
});

test('Wachstum schmilzt auf die ewige Rate ab statt konstant zu bleiben', () => {
  const w = { 'dcf.jahre': 10, 'dcf.umsatz': 1000, 'dcf.wachstum': 0.60, 'dcf.marge': 0.2,
    'dcf.steuerquote': 0.25, 'dcf.kapitalkosten': 0.09, 'dcf.ewigesWachstum': 0.02 };
  const r = rechneDcf(w);
  assert.ok(Math.abs(r.wachstumStart - 0.60) < 1e-12);
  assert.ok(Math.abs(r.wachstumEnde - 0.02) < 1e-12);
  // dazwischen streng fallend
  for (let i = 1; i < r.jahresreihe.length; i++) {
    assert.ok(r.jahresreihe[i].wachstum < r.jahresreihe[i - 1].wachstum);
  }
  // und deutlich unter der Fortschreibung mit konstant 60 %
  assert.ok(r.jahresreihe[9].umsatz < 1000 * Math.pow(1.6, 10) / 5);
});
test('Residualgewinn bildet das faire KBV aus ROE und Eigenkapitalkosten', () => {
  const w = { 'res.eigenkapital': 1000, 'res.roe': 0.15, 'res.eigenkapitalkosten': 0.10, 'res.wachstum': 0.03 };
  const r = rechneResidual(w);
  assert.ok(Math.abs(r.fairesKbv - (0.15 - 0.03) / (0.10 - 0.03)) < 1e-12);
  assert.ok(Math.abs(r.equityValue - 1000 * r.fairesKbv) < 1e-9);
});

test('Residualgewinn läuft ohne Equity Bridge, aber mit Verwässerung', () => {
  const modell = {
    verfahren: 'residual',
    annahmen: [
      an('res.eigenkapital', 'EK', 1000, 'geschaeftsbericht'),
      an('res.roe', 'ROE', 0.15, 'geschaeftsbericht'),
      an('res.eigenkapitalkosten', 'CoE', 0.10, 'eigene_schaetzung'),
      an('res.wachstum', 'g', 0.03, 'eigene_schaetzung'),
      an('bridge.aktien', 'Aktien', 100, 'geschaeftsbericht'),
      an('bridge.verwaesserung', 'Verwässerung', 0, 'eigene_schaetzung', { regel: 'verwaesserung' }),
    ],
  };
  const r = rechne(modell, szenarioWerte(modell.annahmen, 'base'));
  // Kein Enterprise Value, Cash/Schulden bleiben außen vor
  assert.equal(r.kern.enterpriseValue, undefined);
  assert.ok(r.wertJeAktie > 0);
});

// ---------- Szenarien, Sensitivität, Simulation ----------

test('Szenarien sind geordnet: worst < base < best', () => {
  const s = szenarien(biotech());
  assert.ok(s.worst.wertJeAktie < s.base.wertJeAktie);
  assert.ok(s.base.wertJeAktie < s.best.wertJeAktie);
});

test('Sensitivität ist nach Einfluss sortiert und trifft den größten Treiber', () => {
  const s = sensitivitaet(biotech());
  assert.ok(s.zeilen.length > 5);
  for (let i = 1; i < s.zeilen.length; i++) assert.ok(s.zeilen[i - 1].spanne >= s.zeilen[i].spanne);
  // Gemessene Ist-Zahlen sind gekennzeichnet und aus der Treiberliste raus
  assert.ok(s.zeilen.some((z) => z.id === 'bridge.aktien' && z.gemessen));
  assert.ok(!s.treiber.some((z) => z.gemessen));
  // Oben in der Treiberliste steht ein echter Werttreiber, kein Bilanzposten
  assert.ok(s.treiber[0].id.startsWith('zeile.'));
});

test('Verteilung kommt aus dem Regelwerk und ist richtig herum sortiert', () => {
  const v = verteilungFuer(an('k', 'WACC', 0.09, 'eigene_schaetzung', { regel: 'kapitalkosten' }));
  assert.ok(v.min < v.modus && v.modus < v.max); // trotz worst > best
  assert.equal(v.quelle, 'regelwerk');
});

test('Monte Carlo ist mit gleichem Seed reproduzierbar', () => {
  const m = biotech();
  const a = monteCarlo(m, 500, 42);
  const b = monteCarlo(m, 500, 42);
  assert.equal(a.median, b.median);
  assert.equal(a.p10, b.p10);
  const c = monteCarlo(m, 500, 43);
  assert.notEqual(a.median, c.median);
});

test('Monte Carlo liefert geordnete Perzentile', () => {
  const r = monteCarlo(biotech(), 2000, 7);
  assert.ok(r.p10 <= r.p25);
  assert.ok(r.p25 <= r.median);
  assert.ok(r.median <= r.p75);
  assert.ok(r.p75 <= r.p90);
  assert.equal(r.laeufe, 2000);
});

test('Bernoulli erzeugt eine breitere Verteilung als der reine Erwartungswert', () => {
  const mitWurf = monteCarlo(biotech(), 3000, 11);
  const ohneWurf = monteCarlo(
    { ...biotech(), annahmen: biotech().annahmen.map((a) => ({ ...a, bernoulli: false })) },
    3000, 11,
  );
  const spanne = (r) => r.p90 - r.p10;
  assert.ok(spanne(mitWurf) > spanne(ohneWurf));
});

// ---------- Prüfungen ----------

test('Konzentration über 40 Prozent wird rot gemeldet', () => {
  const m = biotech();
  // Alpha auf das Zehnfache setzen → dominiert das Modell
  m.annahmen.find((a) => a.id === 'zeile.p1.spitzenumsatz').wert = 9 * MRD;
  const w = pruefungen(m, szenarien(m), new Date('2026-09-17'));
  assert.ok(w.some((x) => x.id === 'konzentration' && x.stufe === 'rot'));
});

test('Leere Equity Bridge wird als Eingabefehler erkannt', () => {
  const m = biotech();
  m.annahmen.find((a) => a.id === 'bridge.cash').wert = 0;
  m.annahmen.find((a) => a.id === 'bridge.schulden').wert = 0;
  const w = pruefungen(m, szenarien(m), new Date('2026-09-17'));
  assert.ok(w.some((x) => x.id === 'bridge.leer'));
});

test('Doppelte Indikation ohne Überschneidung wird gemeldet', () => {
  const m = biotech();
  m.zeilen.find((z) => z.id === 'p4').ueberschneidungPct = null;
  m.zeilen.find((z) => z.id === 'p4').indikation = 'Progrediente Lungenfibrose';
  const w = pruefungen(m, szenarien(m), new Date('2026-09-17'));
  assert.ok(w.some((x) => x.id.startsWith('doppelt.')));
});

test('Alte Annahmen werden gelb und rot markiert', () => {
  const m = biotech();
  m.annahmen[0].stand = '2026-01-01'; // > 180 Tage
  m.annahmen[1].stand = '2026-05-15'; // > 90 Tage
  const w = pruefungen(m, szenarien(m), new Date('2026-09-17'));
  assert.ok(w.some((x) => x.id === 'alt.' + m.annahmen[0].id && x.stufe === 'rot'));
  assert.ok(w.some((x) => x.id === 'alt.' + m.annahmen[1].id && x.stufe === 'gelb'));
});

test('Kurs und Bewertungsdatum mehr als 7 Tage auseinander wird gemeldet', () => {
  const m = { ...biotech(), kursStand: '2026-08-20', stand: '2026-09-17' };
  const w = pruefungen(m, szenarien(m), new Date('2026-09-17'));
  assert.ok(w.some((x) => x.id === 'kursAlt' && x.stufe === 'rot'));
});

test('Neue Quartalszahlen seit dem Stand einer Annahme werden gemeldet', () => {
  const m = biotech();
  const w = pruefungen(m, szenarien(m), new Date('2026-09-17'), { letzteZahlen: '2026-09-10' });
  assert.ok(w.some((x) => x.id.startsWith('zahlenNeuer.')));
});

test('Mehr als drei Überschreibungen kennzeichnen ein freies Szenario', () => {
  const m = biotech();
  for (let i = 0; i < 4; i++) m.annahmen[i].ueberschrieben = { best: 1 };
  const w = pruefungen(m, szenarien(m), new Date('2026-09-17'));
  assert.ok(w.some((x) => x.id === 'ueberschrieben.best'));
});

test('Endwertanteil über 75 Prozent wird rot gemeldet', () => {
  const m = {
    verfahren: 'dcf',
    zeilen: [],
    annahmen: [
      an('dcf.jahre', 'Jahre', 5, 'eigene_schaetzung'),
      an('dcf.umsatz', 'Umsatz', 1000, 'geschaeftsbericht'),
      an('dcf.wachstum', 'Wachstum', 0.03, 'eigene_schaetzung'),
      an('dcf.marge', 'Marge', 0.1, 'eigene_schaetzung'),
      an('dcf.steuerquote', 'Steuer', 0.25, 'geschaeftsbericht'),
      an('dcf.investitionen', 'Investitionen', 0.03, 'eigene_schaetzung'),
      an('dcf.workingCapital', 'Working Capital', 0.05, 'eigene_schaetzung'),
      an('dcf.kapitalkosten', 'WACC', 0.08, 'eigene_schaetzung', { regel: 'kapitalkosten' }),
      an('dcf.ewigesWachstum', 'g', 0.02, 'eigene_schaetzung', { regel: 'ewigesWachstum' }),
      an('bridge.cash', 'Cash', 100, 'geschaeftsbericht'),
      an('bridge.schulden', 'Schulden', 200, 'geschaeftsbericht'),
      an('bridge.aktien', 'Aktien', 100, 'geschaeftsbericht'),
      an('bridge.verwaesserung', 'Verwässerung', 0, 'eigene_schaetzung', { regel: 'verwaesserung' }),
    ],
  };
  const w = pruefungen(m, szenarien(m), new Date('2026-09-17'));
  assert.ok(w.some((x) => x.id === 'endwert'));
});
