// Wirtschaftskalender im investing.com-Stil: eine Filterzeile
// (Gestern/Heute/Morgen/Diese Woche + Wichtigkeit), Tabelle mit
// Aktuell/Prognose/Vorher — Aktuell grün/rot je nach besser/schlechter.
import { api } from './api.js';
import { el, markActiveNav } from './ui.js';

markActiveNav();

// Länderkürzel (wie bei investing.com) statt Währung — Flagge wird aus dem
// ISO-Code erzeugt (Regional-Indicator-Emojis), EU hat ein eigenes Flaggen-Emoji
const flagge = (land) =>
  land && /^[A-Z]{2}$/.test(land)
    ? String.fromCodePoint(...[...land].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '';
const landLabel = (e) => {
  const land = e.land ?? e.waehrung ?? '–';
  return `${flagge(e.land)} ${land}`.trim();
};

const IMPACT_STARS = {
  High: { stars: '★★★', cls: 's3', label: 'hohe Marktwirkung' },
  Medium: { stars: '★★☆', cls: 's2', label: 'mittlere Marktwirkung' },
  Low: { stars: '★☆☆', cls: 's1', label: 'geringe Marktwirkung' },
};

// Lokales Lexikon: Was bedeutet der Termin, und wie liest man das Ergebnis?
// Reihenfolge zählt — der erste Treffer gewinnt. Muster decken deutsche
// (investing.com) UND englische Titel (ForexFactory-Fallback) ab.
const EVENT_LEXIKON = [
  { re: /kern.*(verbraucherpreis|vpi|cpi)|core cpi/i,
    richtung: 'hoch-gut',
    was: 'Kern-Verbraucherpreisindex: Preisentwicklung ohne die schwankungsanfälligen Energie- und Lebensmittelpreise — das bevorzugte Inflationsmaß vieler Notenbanker.',
    deutung: 'Höher als die Prognose = Inflation hartnäckiger als gedacht → Zinssenkungen rücken weiter weg, oft schlecht für Aktien (besonders Tech). Niedriger = gut für Aktien.' },
  { re: /verbraucherpreis|vpi|\bcpi\b|inflationsrate/i,
    richtung: 'hoch-gut',
    was: 'Verbraucherpreisindex (CPI/VPI): misst, wie stark die Preise für einen typischen Warenkorb gegenüber dem Vormonat/Vorjahr gestiegen sind — DIE Inflations-Kennzahl.',
    deutung: 'Höher als erwartet = die Notenbank muss die Zinsen länger hoch halten → belastet Aktien und stärkt die Währung. Niedriger als erwartet = Zinssenkungshoffnung, meist gut für Aktien.' },
  { re: /pce/i,
    richtung: 'hoch-gut',
    was: 'PCE-Preisindex: das Inflationsmaß, an dem sich die US-Notenbank (Fed) offiziell orientiert — die "Kernrate" (ohne Energie/Lebensmittel) ist die wichtigste Zahl.',
    deutung: 'Höher als die Prognose = Fed bleibt restriktiv, tendenziell schlecht für Aktien; niedriger = Rückenwind für Zinssenkungen und Aktien.' },
  { re: /erzeugerpreis|\bppi\b/i,
    richtung: 'hoch-gut',
    was: 'Erzeugerpreisindex (PPI): Preise, die Produzenten verlangen — läuft der Verbraucherinflation oft ein paar Monate voraus.',
    deutung: 'Höher als erwartet = Inflationsdruck in der Pipeline; niedriger = Entspannung. Wirkt wie CPI, nur schwächer.' },
  { re: /zinssatzentscheid|zinsentscheid|leitzins|interest rate decision|federal funds rate|fomc|ezb.*(zins|entscheid)/i,
    was: 'Zinsentscheid der Notenbank: legt den Leitzins fest — den Preis des Geldes, an dem sich Kredite, Anleihen und letztlich alle Aktienbewertungen orientieren.',
    deutung: 'Senkung oder Aussicht darauf = meist gut für Aktien (billigeres Geld). Erhöhung oder "länger hoch"-Signale = Belastung. Oft bewegt die Pressekonferenz danach mehr als der Entscheid selbst.' },
  { re: /pressekonferenz|press conference|statement/i,
    was: 'Notenbank-Pressekonferenz/Statement: Hier erklärt die Notenbank ihre Entscheidung und gibt Hinweise auf den weiteren Kurs ("Forward Guidance").',
    deutung: 'Es zählt der Ton: "taubenhaft" (Zinssenkungen in Sicht) beflügelt Aktien, "falkenhaft" (Zinsen länger hoch) belastet sie. Einzelne Formulierungen können Kurssprünge auslösen.' },
  { re: /powell|lagarde|spricht|speaks|speech|rede/i,
    was: 'Rede eines Notenbank-Mitglieds: Aussagen zur Geldpolitik außerhalb der offiziellen Sitzungen.',
    deutung: 'Märkte hören auf Signale zur Zinsrichtung. Je ranghöher die Person (Fed-/EZB-Chef!), desto größer die mögliche Marktbewegung.' },
  { re: /nonfarm|payroll|beschäftigung außerhalb|beschaeftigung/i,
    richtung: 'hoch-gut',
    was: 'US-Arbeitsmarktbericht (Nonfarm Payrolls): neu geschaffene Stellen außerhalb der Landwirtschaft — der wichtigste Monatstermin für die US-Wirtschaft.',
    deutung: 'Viel stärker als erwartet = Wirtschaft heiß → Zinssenkungen unwahrscheinlicher (oft schlecht für Aktien trotz guter Konjunktur). Deutlich schwächer = Rezessionssorgen. Märkte mögen die Mitte.' },
  { re: /arbeitslosenquote|unemployment rate/i,
    richtung: 'hoch-schlecht',
    was: 'Arbeitslosenquote: Anteil der Erwerbslosen an der Erwerbsbevölkerung.',
    deutung: 'Steigende Quote = Abkühlung der Wirtschaft (kann aber Zinssenkungshoffnung wecken). Interpretation hängt stark vom Zinsumfeld ab.' },
  { re: /erstanträge|erstantraege|jobless claims|unemployment claims/i,
    richtung: 'hoch-schlecht',
    was: 'Erstanträge auf Arbeitslosenhilfe: wöchentlicher Frühindikator für den US-Arbeitsmarkt.',
    deutung: 'Weniger Anträge als erwartet = robuster Arbeitsmarkt. Anhaltend steigende Anträge = erstes Warnsignal für eine Abkühlung.' },
  { re: /adp/i,
    richtung: 'hoch-gut',
    was: 'ADP-Beschäftigungsbericht: Stellenaufbau in der US-Privatwirtschaft, erhoben vom Lohnabrechner ADP — gilt als Vorbote des offiziellen Arbeitsmarktberichts.',
    deutung: 'Wie Nonfarm Payrolls zu lesen, aber mit weniger Marktgewicht — die Korrelation zum offiziellen Bericht ist wackelig.' },
  { re: /jolts/i,
    richtung: 'hoch-gut',
    was: 'JOLTS: Zahl der offenen Stellen in den USA — zeigt, wie angespannt der Arbeitsmarkt ist.',
    deutung: 'Viele offene Stellen = Lohndruck = Inflationsrisiko → eher negativ für die Zinssenkungs-Hoffnung. Rückgang = Abkühlung ohne Entlassungen, oft markt-freundlich.' },
  { re: /\b(bip|gdp)\b/i,
    richtung: 'hoch-gut',
    was: 'Bruttoinlandsprodukt (BIP/GDP): der Gesamtwert aller produzierten Waren und Dienstleistungen — die wichtigste Kennzahl für das Wirtschaftswachstum.',
    deutung: 'Höher als die Prognose = Wirtschaft stärker als gedacht (gut für Gewinne, stärkt die Währung — kann aber Zinssenkungen bremsen). Deutlich niedriger = Konjunktursorgen.' },
  { re: /einkaufsmanagerindex|\bpmi\b|\bism\b/i,
    richtung: 'hoch-gut',
    was: 'Einkaufsmanagerindex (PMI/ISM): Umfrage unter Einkaufsleitern — der wichtigste Frühindikator für die Konjunktur.',
    deutung: 'Über 50 = Wachstum, unter 50 = Schrumpfung. Werte deutlich über/unter der Prognose bewegen die Märkte; das Dienstleistungs-PMI wiegt in den USA am schwersten.' },
  { re: /einzelhandel|retail sales/i,
    richtung: 'hoch-gut',
    was: 'Einzelhandelsumsätze: Konsumausgaben der Haushalte — in den USA hängen rund zwei Drittel der Wirtschaft am Konsum.',
    deutung: 'Stärker als erwartet = robuster Konsum, gut für die Konjunktur. Schwäche über mehrere Monate ist ein ernstes Rezessionssignal.' },
  { re: /verbrauchervertrauen|consumer confidence|uni.*michigan|consumer sentiment/i,
    richtung: 'hoch-gut',
    was: 'Verbrauchervertrauen: Umfrage, wie optimistisch Haushalte auf Wirtschaft und eigene Finanzen blicken — Frühindikator für den Konsum.',
    deutung: 'Steigende Werte stützen die Konsum-Story; bei den Michigan-Daten schauen Profis zusätzlich auf die enthaltenen Inflationserwartungen.' },
  { re: /industrieproduktion|industrial production/i,
    richtung: 'hoch-gut',
    was: 'Industrieproduktion: Ausstoß von Fabriken, Bergbau und Versorgern.',
    deutung: 'Höher als erwartet = Industrie läuft; anhaltende Rückgänge deuten auf eine Abschwächung des produzierenden Gewerbes.' },
  { re: /auftragseingänge|auftragseingaenge|durable goods|factory orders/i,
    richtung: 'hoch-gut',
    was: 'Auftragseingänge (langlebige Güter): Bestellungen für Maschinen, Fahrzeuge & Co. — zeigt die Investitionsbereitschaft der Unternehmen.',
    deutung: 'Mehr Aufträge als erwartet = Unternehmen investieren = gutes Konjunktursignal. Die Zahl schwankt stark (Flugzeug-Großaufträge!) — Kernrate beachten.' },
  { re: /baubeginne|baugenehmigungen|housing starts|building permits|hausverkäufe|home sales|immobilien/i,
    richtung: 'hoch-gut',
    was: 'Immobilienmarkt-Daten (Baubeginne/Genehmigungen/Verkäufe): der zinssensibelste Sektor der Wirtschaft.',
    deutung: 'Schwache Zahlen zeigen, dass hohe Zinsen bremsen; eine Belebung gilt als frühes Zeichen der Erholung. Wirkt v. a. auf Bau- und Baustoffwerte.' },
  { re: /rohöl|rohoel|crude oil|öl.*lager|oil inventories/i,
    was: 'Rohöl-Lagerbestände (USA): wöchentliche Veränderung der eingelagerten Ölmengen.',
    deutung: 'Höhere Bestände als erwartet = Überangebot → Ölpreis fällt (belastet Energie-Aktien, entlastet Inflation). Niedrigere = knapperes Angebot → Ölpreis steigt.' },
  { re: /handelsbilanz|trade balance/i,
    richtung: 'hoch-gut',
    was: 'Handelsbilanz: Differenz zwischen Exporten und Importen.',
    deutung: 'Für Aktien meist zweitrangig; größere Überraschungen bewegen vor allem die Währung.' },
  { re: /anleihe|auktion|auction|bond/i,
    was: 'Staatsanleihe-Auktion: Der Staat leiht sich frisches Geld; die erzielte Rendite zeigt, welche Zinsen Investoren verlangen.',
    deutung: 'Schwache Nachfrage/höhere Renditen = steigende Marktzinsen → Gegenwind für Aktien (v. a. Wachstumswerte). Meist nur bei Ausreißern kursrelevant.' },
  { re: /zew|ifo|gfk/i,
    richtung: 'hoch-gut',
    was: 'Deutscher Stimmungsindikator (ifo/ZEW/GfK): Umfragen unter Unternehmen bzw. Analysten/Verbrauchern zur Wirtschaftslage und -erwartung.',
    deutung: 'Über den Erwartungen = Konjunkturoptimismus (gut für DAX & Co.), darunter = Sorgenfalten. Der ifo-Index ist der gewichtigste der drei.' },
];

function erklaerungFuer(e) {
  const treffer = EVENT_LEXIKON.find((l) => l.re.test(e.titel));
  if (treffer) return treffer;
  return {
    was: 'Wirtschaftsindikator für die jeweilige Region — die Prognose ist der Analystenkonsens vor der Veröffentlichung.',
    deutung: 'Es zählt die Abweichung von der Prognose: Deutlich daneben bewegt die Märkte. Grün/Rot beim Aktuell-Wert = besser/schlechter als erwartet.',
  };
}

let events = [];
let impFilter = 'all';
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
  const row = el('tr', { class: 'rowlink', title: 'Klick: Was bedeutet dieser Termin?' },
    el('td', { class: 'num', style: 'text-align:left;width:56px' }, time),
    el('td', { style: 'width:88px;white-space:nowrap', title: e.waehrung ?? '' }, landLabel(e)),
    el('td', { style: 'width:64px' }, el('span', { class: `stars ${imp.cls}`, title: imp.label }, imp.stars)),
    el('td', { class: 'name-cell' }, e.titel),
    el('td', { class: `num ${aktuellCls}`, title: e.aktuellTrend ? `${e.aktuellTrend === 'gut' ? 'besser' : 'schlechter'} als Prognose` : '' }, e.aktuell ?? '–'),
    el('td', { class: 'num' }, e.prognose ?? '–'),
    el('td', { class: 'num dim' }, e.vorher ?? '–')
  );
  // Klick klappt eine Erklärung unter der Zeile auf (Akkordeon)
  row.addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next?.classList.contains('cal-detail')) {
      next.remove();
      return;
    }
    // Knappe Stichpunkte statt Fließtext: Was ist das / Lesart / Ergebnis
    const erk = erklaerungFuer(e);
    const punkte = [
      erk.was,
      ...erk.deutung.split(/(?<=\.)\s+(?=[A-ZÄÖÜ„"])/).filter(Boolean),
    ].map((p) => el('li', {}, p));
    // Devisen-Faustregel (wie bei investing.com): Wirkung auf die Landeswährung
    if (erk.richtung && e.waehrung) {
      punkte.push(el('li', {},
        erk.richtung === 'hoch-gut'
          ? `Devisen-Faustregel: Fällt der Wert höher aus als erwartet, führt das in der Regel zu einem steigenden Kurs der Landeswährung (${e.waehrung}); wird die Prognose deutlich verfehlt, schwächt das die Währung.`
          : `Devisen-Faustregel: Fällt der Wert niedriger aus als erwartet, gilt das als positiv für die Landeswährung (${e.waehrung}); ein deutlich höherer Wert schwächt sie.`));
    }
    if (e.aktuell) {
      punkte.push(
        el('li', { class: aktuellCls || 'dim' },
          el('b', {}, 'Ergebnis: '),
          `${e.aktuell} vs. Prognose ${e.prognose ?? '–'}${e.aktuellTrend ? ` — ${e.aktuellTrend === 'gut' ? 'besser' : 'schlechter'} als erwartet` : ''}.`)
      );
    }
    row.after(
      el('tr', { class: 'cal-detail' },
        el('td', { colspan: '7' },
          el('ul', { class: 'einordnung-liste', style: 'margin:0' }, punkte)
        )
      )
    );
  });
  return row;
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
    const quelle = document.getElementById('cal-quelle');
    if (quelle) quelle.textContent = `Quelle: ${d.quelle}`;
    render();
  })
  .catch((err) => {
    document.getElementById('calendar').replaceChildren(
      el('div', { class: 'notice err' }, `Kalender nicht erreichbar: ${err.message}`)
    );
  });
