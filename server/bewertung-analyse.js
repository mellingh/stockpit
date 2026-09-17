// Sensitivität, Monte Carlo und die Pflichtprüfungen einer Bewertung.
// Wie `bewertung.js` rein funktional: „heute" wird hereingereicht statt
// gelesen, damit Prüfungen testbar und Ergebnisse reproduzierbar bleiben.

import { rechne, szenarien, szenarioWert, szenarioWerte, regelFuer, perzentil } from './bewertung.js';
import { SCHWELLEN, VERBOTE } from './bewertung-regeln.js';

const zahl = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const TAG_MS = 24 * 60 * 60 * 1000;

/** Ganze Kalendertage zwischen zwei Daten (wie `wannVon` im Frontend). */
function tageZwischen(von, bis) {
  const a = new Date(von);
  const b = new Date(bis);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const aT = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bT = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bT - aT) / TAG_MS);
}

// ---------- Sensitivität ----------

/**
 * Für jede Annahme: wie ändert sich der Wert je Aktie, wenn man sie um 10 %
 * nach oben und unten verschiebt? Sortiert nach Einfluss, größter zuerst —
 * damit sofort sichtbar ist, woran das Ergebnis wirklich hängt.
 *
 * Gemessene Ist-Zahlen (Quelle Geschäftsbericht) werden als `gemessen`
 * gekennzeichnet und aus der Treiberliste herausgehalten: die Aktienanzahl
 * teilt den gesamten Wert und landet deshalb rechnerisch immer ganz oben,
 * obwohl an ihr nichts unsicher ist. Sie dort stehen zu lassen würde die
 * echten Stellschrauben verdecken. In der vollen Tabelle bleibt sie sichtbar.
 */
export function sensitivitaet(modell, schritt = SCHWELLEN.sensitivitaetSchritt ?? 0.1) {
  const basis = szenarioWerte(modell.annahmen, 'base');
  const basisWert = rechne(modell, basis).wertJeAktie;
  if (basisWert == null) return { basisWert: null, zeilen: [] };

  const zeilen = [];
  for (const a of modell.annahmen) {
    const w0 = zahl(basis[a.id]);
    if (w0 == null || w0 === 0) continue;

    const hoch = rechne(modell, { ...basis, [a.id]: w0 * (1 + schritt) }).wertJeAktie;
    const runter = rechne(modell, { ...basis, [a.id]: w0 * (1 - schritt) }).wertJeAktie;
    if (hoch == null || runter == null) continue;

    const spanne = Math.abs(hoch - runter);
    if (spanne === 0) continue;
    zeilen.push({
      id: a.id,
      label: a.label,
      gruppe: a.gruppe ?? null,
      gemessen: a.quelle === 'geschaeftsbericht',
      basis: w0,
      hoch,
      runter,
      spanne,
      wirkungPct: basisWert !== 0 ? spanne / Math.abs(basisWert) : null,
    });
  }
  zeilen.sort((x, y) => y.spanne - x.spanne);
  return { basisWert, schritt, zeilen, treiber: zeilen.filter((z) => !z.gemessen) };
}

// ---------- Monte Carlo ----------

/** Reproduzierbarer Zufallsgenerator (mulberry32) — gleicher Seed, gleiche Zahlen. */
function prng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ziehung aus einer Dreiecksverteilung (Minimum, wahrscheinlichster Wert, Maximum). */
function dreieck(u, min, modus, max) {
  if (!(max > min)) return modus;
  const f = (modus - min) / (max - min);
  if (u < f) return min + Math.sqrt(u * (max - min) * (modus - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - modus));
}

/**
 * Verteilung je Annahme. Sie wird aus dem Szenario-Regelwerk abgeleitet
 * (Worst = Minimum, Base = wahrscheinlichster Wert, Best = Maximum), kann aber
 * je Annahme überschrieben werden. So bleiben Szenarien und Simulation
 * konsistent — sonst beschreiben sie zwei verschiedene Welten.
 */
export function verteilungFuer(annahme) {
  if (annahme.verteilung?.min != null && annahme.verteilung?.max != null) {
    return {
      min: annahme.verteilung.min,
      modus: annahme.verteilung.modus ?? annahme.wert,
      max: annahme.verteilung.max,
      quelle: 'eigene',
    };
  }
  const w = szenarioWert(annahme, 'worst');
  const b = szenarioWert(annahme, 'base');
  const s = szenarioWert(annahme, 'best');
  if (w == null || b == null || s == null) return null;
  return { min: Math.min(w, s), modus: b, max: Math.max(w, s), quelle: 'regelwerk' };
}

/**
 * Monte-Carlo-Simulation. Erfolgswahrscheinlichkeiten werden als
 * Bernoulli-Ereignis behandelt, nicht als stetiger Faktor: ein Medikament wird
 * entweder zugelassen oder nicht. Das erzeugt die realistische, mehrgipflige
 * Verteilung, die ein simpler Erwartungswert verwischt.
 */
export function monteCarlo(modell, laeufe, seed = 1) {
  const rnd = prng(seed);
  const basis = szenarioWerte(modell.annahmen, 'base');

  // Verteilungen einmal vorbereiten, nicht je Lauf.
  const stellschrauben = modell.annahmen
    .map((a) => ({ a, v: a.bernoulli ? null : verteilungFuer(a) }))
    .filter((x) => x.a.bernoulli || x.v);

  const ergebnisse = [];
  for (let i = 0; i < laeufe; i++) {
    const w = { ...basis };
    for (const { a, v } of stellschrauben) {
      if (a.bernoulli) {
        // Erfolgswahrscheinlichkeit: Münzwurf statt Erwartungswert.
        const p = zahl(basis[a.id]) ?? 0;
        w[a.id] = rnd() < p ? 1 : 0;
      } else {
        w[a.id] = dreieck(rnd(), v.min, v.modus, v.max);
      }
    }
    const r = rechne(modell, w).wertJeAktie;
    if (r != null) ergebnisse.push(r);
  }

  ergebnisse.sort((a, b) => a - b);
  const p = (q) => perzentil(ergebnisse, q);
  return {
    laeufe: ergebnisse.length,
    seed,
    p10: p(0.10),
    p25: p(0.25),
    median: p(0.50),
    p75: p(0.75),
    p90: p(0.90),
    min: ergebnisse[0] ?? null,
    max: ergebnisse[ergebnisse.length - 1] ?? null,
    mittel: ergebnisse.length ? ergebnisse.reduce((s, x) => s + x, 0) / ergebnisse.length : null,
    histogramm: histogramm(ergebnisse),
  };
}

/** Grobes Histogramm für die Anzeige (die Mehrgipfligkeit soll sichtbar sein). */
function histogramm(werte, koerbe = 40) {
  if (!werte.length) return [];
  const min = werte[0];
  const max = werte[werte.length - 1];
  if (!(max > min)) return [{ von: min, bis: max, anzahl: werte.length }];
  const breite = (max - min) / koerbe;
  const zaehler = new Array(koerbe).fill(0);
  for (const v of werte) {
    const i = Math.min(koerbe - 1, Math.floor((v - min) / breite));
    zaehler[i]++;
  }
  return zaehler.map((anzahl, i) => ({ von: min + i * breite, bis: min + (i + 1) * breite, anzahl }));
}

// ---------- Pflichtprüfungen ----------

const warn = (stufe, id, text, hinweis) => ({ stufe, id, text, hinweis: hinweis ?? null });

/**
 * Alle automatischen Prüfungen. `heute` wird übergeben, damit die Funktion
 * rein bleibt. `markt` enthält die Vergleichswerte aus Yahoo
 * (enterpriseValue, umsatz, kursStand, naechsteZahlen, operativesErgebnis …).
 */
export function pruefungen(modell, ergebnis, heute = new Date(), markt = {}) {
  const w = [];
  const base = ergebnis.base ?? null;

  // 1. Konzentration — hängt alles an einer Position? Nur sinnvoll, wenn es
  // überhaupt mehrere gibt: beim Multiples-Verfahren ist die eine Position
  // zwangsläufig 100 % und die Warnung wäre reines Rauschen. Der DCF ist
  // ebenfalls ausgenommen — dort ist „Endwert vs. Prognosezeitraum" keine
  // Positionskonzentration, dafür gibt es die eigene 75-Prozent-Regel.
  const konzentrationPruefen = modell.verfahren !== 'dcf' && (base?.beitraege?.length ?? 0) > 1;
  const groesste = base?.beitraege?.[0];
  if (konzentrationPruefen && groesste?.anteil != null && groesste.anteil > SCHWELLEN.konzentrationAnteil) {
    w.push(warn('rot', 'konzentration',
      'Eine Position macht ' + Math.round(groesste.anteil * 100) + ' % des Gesamtwerts aus: ' + groesste.label + '.',
      'Die Bewertung ist faktisch eine Wette auf diese eine Position.'));
  }

  // 2. Interne Konsistenz gegen den Markt
  const evGerechnet = base?.kern?.enterpriseValue;
  if (zahl(evGerechnet) != null && zahl(markt.enterpriseValue) != null && markt.enterpriseValue !== 0) {
    const abw = Math.abs(evGerechnet - markt.enterpriseValue) / Math.abs(markt.enterpriseValue);
    if (abw > SCHWELLEN.konsistenzAbweichung) {
      w.push(warn('gelb', 'konsistenz',
        'Der gerechnete Enterprise Value weicht ' + Math.round(abw * 100) + ' % vom aktuellen Marktwert ab.',
        'Das kann die These sein — oder ein Eingabefehler bei Kennzahl oder Multiple.'));
    }
  }

  // 3. Plausibilität des Wachstumspfads
  if (zahl(markt.umsatz) != null && markt.umsatz > 0) {
    for (const z of modell.zeilen ?? []) {
      const su = modell.annahmen.find((a) => a.id === 'zeile.' + z.id + '.spitzenumsatz');
      if (su && zahl(su.wert) != null && su.wert > markt.umsatz * SCHWELLEN.spitzenumsatzVielfaches && !z.begruendung) {
        w.push(warn('gelb', 'wachstumspfad.' + z.id,
          'Spitzenumsatz für „' + z.name + '" liegt über dem ' + SCHWELLEN.spitzenumsatzVielfaches + '-fachen des heutigen Umsatzes.',
          'Bitte mit Zeithorizont begründen.'));
      }
    }
  }

  // 4. Endwertanteil im DCF
  const anteil = base?.kern?.endwertAnteil;
  if (zahl(anteil) != null && anteil > SCHWELLEN.endwertAnteil) {
    w.push(warn('rot', 'endwert',
      Math.round(anteil * 100) + ' % des Werts stammen aus dem Endwert.',
      'Ein DCF, der fast nur aus dem Endwert besteht, ist eine als Rechnung getarnte Meinung.'));
  }
  if (base?.kern?.endwertUndefiniert) {
    w.push(warn('rot', 'endwert.undefiniert',
      'Die ewige Wachstumsrate liegt nicht unter den Kapitalkosten — es gibt keinen Endwert.',
      'Gordon Growth ist dann nicht definiert; der Wert zeigt nur den Prognosezeitraum.'));
  }

  // 5. Doppelzählung
  const gesehen = new Map();
  for (const z of modell.zeilen ?? []) {
    const schluessel = (z.indikation ?? z.markt ?? '').trim().toLowerCase();
    if (!schluessel) continue;
    if (gesehen.has(schluessel) && !z.ueberschneidungPct) {
      w.push(warn('gelb', 'doppelt.' + z.id,
        '„' + z.name + '" und „' + gesehen.get(schluessel) + '" nennen dieselbe Indikation, ohne dass eine Überschneidung hinterlegt ist.',
        'Ohne Überschneidungsangabe zählt das Modell denselben Umsatz zweimal.'));
    }
    gesehen.set(schluessel, z.name);
  }

  // 6. Vorzeichenprüfung der Equity Bridge
  const cash = modell.annahmen.find((a) => a.id === 'bridge.cash')?.wert;
  const schulden = modell.annahmen.find((a) => a.id === 'bridge.schulden')?.wert;
  if (modell.verfahren !== 'residual' && !zahl(cash) && !zahl(schulden)) {
    w.push(warn('rot', 'bridge.leer',
      'Zahlungsmittel und Finanzverbindlichkeiten stehen beide auf null.',
      'Das ist fast immer ein Eingabefehler, nicht eine schuldenfreie Firma.'));
  }

  // 7. Alter der Annahmen
  for (const a of modell.annahmen) {
    if (!a.stand) continue;
    const tage = tageZwischen(a.stand, heute);
    if (tage == null) continue;
    if (tage > SCHWELLEN.annahmeRotTage) {
      w.push(warn('rot', 'alt.' + a.id, 'Annahme „' + a.label + '" ist ' + tage + ' Tage alt.'));
    } else if (tage > SCHWELLEN.annahmeGelbTage) {
      w.push(warn('gelb', 'alt.' + a.id, 'Annahme „' + a.label + '" ist ' + tage + ' Tage alt.'));
    }
  }

  // 8. Neue Quartalszahlen seit dem Stand einer Annahme
  if (markt.letzteZahlen) {
    for (const a of modell.annahmen) {
      if (!a.stand || a.quelle === 'geschaeftsbericht') continue;
      const diff = tageZwischen(a.stand, markt.letzteZahlen);
      if (diff != null && diff > 0) {
        w.push(warn('gelb', 'zahlenNeuer.' + a.id,
          'Seit dem Stand von „' + a.label + '" wurden neue Quartalszahlen veröffentlicht.',
          'Bitte prüfen, ob die Annahme noch trägt.'));
      }
    }
  }

  // 9. Kurs und Bewertungsdatum auseinander
  if (modell.kursStand && modell.stand) {
    const diff = Math.abs(tageZwischen(modell.kursStand, modell.stand) ?? 0);
    if (diff > SCHWELLEN.kursAlterTage) {
      w.push(warn('rot', 'kursAlt',
        'Der hinterlegte Kurs ist ' + diff + ' Tage vom Bewertungsdatum entfernt.',
        'Ein Vergleich mit einem veralteten Kurs führt zu einer falschen Abweichung.'));
    }
  }

  // 10. Konglomeratsabschlag auf null gesetzt
  const abschlag = modell.annahmen.find((a) => a.id === 'sotp.konglomeratsabschlag');
  if (abschlag && zahl(abschlag.wert) === 0 && !abschlag.notiz) {
    w.push(warn('gelb', 'abschlagNull',
      'Der Konglomeratsabschlag steht auf 0 % ohne Begründung.',
      'Er bildet ab, dass Segmente voneinander abhängen und nicht einzeln verkäuflich sind.'));
  }

  // 11. Zu viele manuelle Überschreibungen → kein regelbasiertes Szenario mehr
  for (const fall of ['worst', 'base', 'best']) {
    const n = modell.annahmen.filter((a) => zahl(a.ueberschrieben?.[fall]) != null).length;
    if (n > SCHWELLEN.maxUeberschreibungen) {
      w.push(warn('gelb', 'ueberschrieben.' + fall,
        n + ' Werte im ' + fall.toUpperCase() + ' Case sind von Hand gesetzt.',
        'Das ist dann kein regelbasiertes Szenario mehr, sondern eine freie Schätzung.'));
    }
  }

  // 12. Verfahrensverbote
  const verbot = VERBOTE[modell.verfahren];
  if (verbot) {
    const treffer = modell.annahmen.filter((a) => verbot.felder.some((f) => a.id.includes(f)));
    if (treffer.length && (!verbot.nurWenn || (verbot.nurWenn === 'verlust' && (zahl(markt.nettoergebnis) ?? 0) < 0))) {
      w.push(warn('rot', 'verbot', 'Für dieses Verfahren ungeeignete Kennzahlen im Modell.', verbot.grund));
    }
  }

  // 13. Leere Pflichtzeilen: ein rNPV ohne Spitzenumsätze zeigt nur den
  // Kassenbestand. Ohne diesen Hinweis sieht das aus wie ein Ergebnis.
  const leereZeilen = (modell.zeilen ?? []).filter((z) => {
    const a = modell.annahmen.find((x) => x.id === 'zeile.' + z.id + '.spitzenumsatz' || x.id === 'zeile.' + z.id + '.kennzahl');
    return a && !zahl(a.wert);
  });
  if (leereZeilen.length) {
    const alle = leereZeilen.length === (modell.zeilen ?? []).length;
    w.push(warn(alle ? 'rot' : 'gelb', 'zeilenLeer',
      alle
        ? 'Für keine der ' + leereZeilen.length + ' Zeilen ist ein Wert gesetzt.'
        : leereZeilen.length + ' von ' + modell.zeilen.length + ' Zeilen haben keinen Wert.',
      alle
        ? 'Das Ergebnis zeigt damit nur die Equity Bridge — also im Wesentlichen den Kassenbestand, nicht den Wert des Geschäfts.'
        : 'Diese Zeilen tragen nichts zum Wert bei.'));
  }

  // 14. Peer-Multiple ohne Peer-Gruppe: das Modell rechnet dann mit dem
  // Marktmultiple der Aktie selbst und gibt zwangsläufig den heutigen Kurs
  // zurück. Das sieht nach Bestätigung aus, ist aber ein Zirkelschluss.
  const ohnePeers = modell.annahmen.filter(
    (a) => a.quelle === 'peer_gruppe' && (a.peers ?? []).filter((v) => zahl(v) != null).length < 2,
  );
  if (ohnePeers.length) {
    w.push(warn('gelb', 'peersFehlen',
      ohnePeers.length === 1
        ? 'Für „' + ohnePeers[0].label + '" ist keine Peer-Gruppe hinterlegt.'
        : ohnePeers.length + ' Multiples haben keine Peer-Gruppe.',
      'Ohne Vergleichsgruppe rechnet das Modell mit dem Marktmultiple dieser Aktie und gibt näherungsweise den heutigen Kurs zurück — das ist ein Zirkelschluss, keine Bewertung.'));
  }

  // 15. Verwässerung bei Firmen, die Geld verbrennen
  const monate = zahl(markt.liquiditaetMonate);
  const verw = modell.annahmen.find((a) => a.id === 'bridge.verwaesserung');
  if ((zahl(markt.operativesErgebnis) ?? 0) < 0 && monate != null && monate < SCHWELLEN.liquiditaetMonate) {
    const stufe = zahl(verw?.wert) ? 'info' : 'gelb';
    w.push(warn(stufe, 'verwaesserung',
      'Operativ negativ, Liquidität reicht rechnerisch ' + Math.round(monate) + ' Monate.',
      'Eine Kapitalerhöhung ist wahrscheinlich — die künftige Verwässerung sollte gesetzt sein.'));
  }

  // 16. Sehr breite Spanne. Beim DCF multiplizieren sich Wachstum, Marge und
  // Kapitalkosten über den Prognosezeitraum und den Endwert — das Regelwerk
  // erzeugt dann leicht einen Faktor 5 zwischen den Rändern. Das ist keine
  // Fehlrechnung, macht die Ränder aber wertlos: sie zeigen, wie empfindlich
  // das Verfahren ist, nicht, was die Aktie wert sein könnte.
  const u = ergebnis.worst?.wertJeAktie;
  const o = ergebnis.best?.wertJeAktie;
  if (zahl(u) != null && zahl(o) != null && u > 0 && o / u > SCHWELLEN.spanneFaktor) {
    w.push(warn('info', 'spanneBreit',
      'Best Case liegt beim ' + (o / u).toFixed(1).replace('.', ',') + '-fachen des Worst Case.',
      'Kleine Änderungen an Wachstum, Marge und Kapitalkosten multiplizieren sich über den Prognosezeitraum. '
      + 'Der Base Case und die Sensitivitätstabelle sind hier aussagekräftiger als die Ränder.'));
  }

  const rang = { rot: 0, gelb: 1, info: 2 };
  return w.sort((a, b) => rang[a.stufe] - rang[b.stufe]);
}

/** Zählt, wie viele Annahmen im jeweiligen Fall von Hand gesetzt wurden. */
export function ueberschreibungen(modell) {
  const out = {};
  for (const fall of ['worst', 'base', 'best']) {
    out[fall] = modell.annahmen.filter((a) => zahl(a.ueberschrieben?.[fall]) != null).length;
  }
  return out;
}

/** Sammelt die Begründungen, die im Ergebnis mit ausgewiesen werden müssen. */
export function begruendungen(modell) {
  const raus = new Map();
  for (const a of modell.annahmen) {
    const r = regelFuer(a);
    if (r?.begruendung) raus.set(r.schluessel, { regel: r.label, text: r.begruendung });
  }
  return [...raus.values()];
}

/**
 * Ein vollständiges Ergebnis: Szenarien, Simulation, Sensitivität, Beiträge,
 * Warnungen und die ausgewiesenen Begründungen. Das ist die einzige Funktion,
 * die der Server aufruft — Frontend und Export arbeiten auf derselben Struktur.
 *
 * Bewusst KEIN Kauf- oder Verkaufsurteil: das Ergebnis liefert Zahlen und
 * benennt, woran sie hängen. Die Entscheidung trifft der Nutzer.
 */
export function gesamtergebnis(modell, { markt = {}, heute = new Date(), laeufe, seed = 1 } = {}) {
  const faelle = szenarien(modell);
  const kurs = zahl(modell.kurs);
  const abweichung = (wert) => (kurs && zahl(wert) != null ? (wert - kurs) / kurs : null);

  const sens = sensitivitaet(modell);
  const mc = monteCarlo(modell, laeufe ?? SCHWELLEN.monteCarloLaeufe ?? 10000, seed);

  return {
    modell,
    stand: heute instanceof Date ? heute.toISOString() : heute,
    kurs,
    waehrung: modell.waehrung,
    szenarien: {
      worst: { wertJeAktie: faelle.worst.wertJeAktie, abweichung: abweichung(faelle.worst.wertJeAktie) },
      base: { wertJeAktie: faelle.base.wertJeAktie, abweichung: abweichung(faelle.base.wertJeAktie) },
      best: { wertJeAktie: faelle.best.wertJeAktie, abweichung: abweichung(faelle.best.wertJeAktie) },
    },
    detail: faelle,
    beitraege: faelle.base.beitraege,
    equity: faelle.base.equity,
    kern: faelle.base.kern,
    monteCarlo: mc,
    sensitivitaet: sens,
    warnungen: pruefungen(modell, faelle, heute, markt),
    begruendungen: begruendungen(modell),
    ueberschreibungen: ueberschreibungen(modell),
    markt,
  };
}
