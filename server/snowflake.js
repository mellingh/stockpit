// "Snowflake"-Analyse im Stil von Simply Wall St: fünf Dimensionen
// (Wert, Zukunft, Vergangenheit, Bilanz, Dividende) je 0–5 Punkte,
// dazu Stärken/Risiken in Klartext. Alles regelbasiert aus den
// Yahoo-Rohdaten — transparent, keine Blackbox.

const clamp = (v) => Math.max(0, Math.min(5, Math.round(v * 10) / 10));

export function computeSnowflake({ fundamental: f, kennzahlen: k, analysts, technik, termine, sektor }) {
  if (!f) return null; // ETFs u. Ä. haben keine Fundamentaldaten

  // Banken/Finanzwerte: Debt/Equity, Current Ratio und FCF sind dort
  // strukturell nicht aussagekräftig (Yahoo liefert sie meist gar nicht) —
  // die Bilanz-Dimension wird deshalb anders bewertet.
  const istFinanzwert = sektor === 'Financial Services';

  const staerken = [];
  const risiken = [];
  const pct = (v) => `${Math.round(v * 100)} %`;

  // ---- WERT: Ist der Preis fair? ----
  let wert = 0;
  const kgv = f.kgvForward ?? f.kgv;
  if (kgv != null && kgv > 0) {
    if (kgv < 15) wert += 2;
    else if (kgv < 25) wert += 1.25;
    else if (kgv < 40) wert += 0.5;
    if (kgv > 60) risiken.push({ t: `Hohe Bewertung: PE Ratio ${Math.round(kgv)} — viel Zukunft ist eingepreist`, info: 'PE Ratio (Kurs-Gewinn-Verhältnis, dt. KGV): wie viele Jahresgewinne man für die Aktie bezahlt. Werte über ~60 gelten als sehr teuer.' });
  }
  if (k?.peg != null && k.peg > 0) {
    if (k.peg < 1) { wert += 1.5; staerken.push({ t: `Günstig fürs Wachstum: PEG ${k.peg.toFixed(2)} (unter 1)`, info: 'PEG Ratio = PE Ratio (KGV) geteilt durch das erwartete Gewinnwachstum. Unter 1 heißt: Der Preis ist im Verhältnis zum Wachstum niedrig.' }); }
    else if (k.peg < 2) wert += 0.75;
  }
  const upside = analysts?.targets?.upsidePct;
  if (upside != null) {
    if (upside > 25) { wert += 1.5; staerken.push({ t: `Analysten sehen ${Math.round(upside)} % Kurspotenzial zum Ø-Kursziel`, info: 'Ø-Kursziel = Durchschnitt der Kursziele aller Banken, die die Aktie bewerten.' }); }
    else if (upside > 10) wert += 0.75;
    else if (upside < -10) risiken.push({ t: `Kurs liegt ${Math.abs(Math.round(upside))} % über dem Ø-Kursziel der Analysten`, info: 'Ø-Kursziel = Durchschnitt der Kursziele aller Banken — der Markt ist hier schon optimistischer als die Profis.' });
  }

  // ---- ZUKUNFT: Wächst das Geschäft? ----
  let zukunft = 0;
  if (f.umsatzwachstum != null) {
    if (f.umsatzwachstum > 0.15) { zukunft += 2; staerken.push(`Starkes Umsatzwachstum: +${pct(f.umsatzwachstum)} ggü. Vorjahresquartal`); }
    else if (f.umsatzwachstum > 0.05) zukunft += 1.25;
    else if (f.umsatzwachstum < 0) risiken.push(`Umsatz schrumpft (${pct(f.umsatzwachstum)})`);
  }
  if (f.gewinnwachstum != null) {
    if (f.gewinnwachstum > 0.15) zukunft += 1.5;
    else if (f.gewinnwachstum > 0) zukunft += 0.75;
  }
  if (analysts?.mean != null) {
    if (analysts.mean <= 2) zukunft += 1.5;
    else if (analysts.mean <= 2.5) zukunft += 1;
    else if (analysts.mean >= 3.5) risiken.push('Analysten-Konsens tendiert Richtung Verkaufen');
  }

  // ---- VERGANGENHEIT: Hat die Firma geliefert? ----
  let vergangenheit = 0;
  if (k?.epsTtm != null) {
    if (k.epsTtm > 0) vergangenheit += 1.25;
    else risiken.push({ t: 'Nicht profitabel: negatives Ergebnis je Aktie (12 Monate)', info: 'Ergebnis je Aktie (EPS) = Gewinn geteilt durch die Zahl der Aktien — negativ bedeutet: Die Firma macht unterm Strich Verlust.' });
  }
  if (k?.roe != null) {
    if (k.roe > 0.15) { vergangenheit += 1.5; staerken.push({ t: `Hohe Eigenkapitalrendite: ROE ${pct(k.roe)}`, info: 'ROE (Return on Equity) = Gewinn im Verhältnis zum Eigenkapital — zeigt, wie effizient das Geld der Aktionäre arbeitet.' }); }
    else if (k.roe > 0) vergangenheit += 0.75;
  }
  if (f.nettomarge != null) {
    if (f.nettomarge > 0.1) vergangenheit += 1;
    else if (f.nettomarge > 0) vergangenheit += 0.5;
    else risiken.push({ t: `Negative Nettomarge (${pct(f.nettomarge)})`, info: 'Nettomarge = Gewinn in Prozent vom Umsatz — negativ heißt: Von jedem umgesetzten Euro bleibt ein Verlust.' });
  }
  const perfJahr = k?.performance?.jahr;
  if (perfJahr != null) {
    if (perfJahr > 15) vergangenheit += 1.25;
    else if (perfJahr > 0) vergangenheit += 0.5;
  }

  // ---- BILANZ: Wie gesund sind die Finanzen? ----
  let bilanz = 0;
  let bilanzOhneDaten = false;
  if (istFinanzwert) {
    // Banken-Bilanz über Profitabilität statt klassischer Kennzahlen bewerten
    bilanz = 2.5;
    if (k?.roe != null && k.roe > 0.12) bilanz += 1.25;
    if (f.nettomarge != null && f.nettomarge > 0.15) bilanz += 1.25;
    else if (f.nettomarge != null && f.nettomarge < 0) bilanz -= 1.5;
  } else {
    const hatBilanzDaten = f.verschuldung != null || k?.currentRatio != null || f.freeCashflow != null;
    if (!hatBilanzDaten) {
      // Keine Datenlage ≠ schwache Bilanz — neutral werten und im Fazit ignorieren
      bilanz = 2.5;
      bilanzOhneDaten = true;
    } else {
      if (f.verschuldung != null) {
        if (f.verschuldung < 50) { bilanz += 2; staerken.push(`Solide Bilanz: Verschuldung nur ${Math.round(f.verschuldung)} % des Eigenkapitals`); }
        else if (f.verschuldung < 100) bilanz += 1.25;
        else if (f.verschuldung > 150) risiken.push(`Hohe Verschuldung: ${Math.round(f.verschuldung)} % des Eigenkapitals`);
      } else {
        bilanz += 1;
      }
      if (k?.currentRatio != null) {
        if (k.currentRatio > 1.5) bilanz += 1.5;
        else if (k.currentRatio > 1) bilanz += 0.75;
        else risiken.push({ t: `Kurzfristige Verbindlichkeiten übersteigen das Umlaufvermögen (Current Ratio ${k.currentRatio.toFixed(2)})`, info: 'Current Ratio = schnell verfügbares Vermögen geteilt durch kurzfristige Schulden — unter 1 wird es eng, wenn Rechnungen fällig werden.' });
      }
      if (f.freeCashflow != null) {
        if (f.freeCashflow > 0) { bilanz += 1.5; staerken.push({ t: 'Positiver Free Cashflow — Geschäft trägt sich selbst', info: 'Free Cashflow = Geld, das nach allen laufenden Kosten und Investitionen tatsächlich übrig bleibt.' }); }
        else risiken.push({ t: 'Negativer Free Cashflow — verbrennt derzeit Geld', info: 'Free Cashflow = Geld, das nach Kosten und Investitionen übrig bleibt — negativ: Die Firma braucht laufend frisches Kapital.' });
      }
    }
  }

  // ---- DIVIDENDE ----
  let dividende = 0;
  if (f.dividendenrendite != null && f.dividendenrendite > 0) {
    if (f.dividendenrendite > 3) dividende += 2.5;
    else if (f.dividendenrendite > 1.5) dividende += 1.5;
    else dividende += 0.75;
    if (f.ausschuettungsquote != null) {
      if (f.ausschuettungsquote > 0.15 && f.ausschuettungsquote < 0.7) dividende += 1.5;
      else if (f.ausschuettungsquote >= 0.9) risiken.push({ t: `Ausschüttungsquote ${pct(f.ausschuettungsquote)} — Dividende kaum verdient`, info: 'Ausschüttungsquote = Anteil des Gewinns, der als Dividende ausgezahlt wird — über 90 % ist auf Dauer kaum zu halten.' });
      else dividende += 0.5;
    }
  }

  // ---- Weitere Warnsignale ----
  if (k?.shortFloat != null && k.shortFloat > 0.1) {
    risiken.push({ t: `Short Float ${pct(k.shortFloat)} — viele Wetten auf fallende Kurse`, info: 'Short Float = Anteil der frei handelbaren Aktien, die leerverkauft sind. Leerverkäufer verdienen nur bei fallendem Kurs — ein hoher Wert zeigt viel Skepsis.' });
  }
  if (termine?.earnings) {
    const tage = Math.round((new Date(termine.earnings) - Date.now()) / 86_400_000);
    if (tage >= 0 && tage <= 7) risiken.push(`Quartalszahlen in ${tage === 0 ? 'wenigen Stunden' : `${tage} Tag${tage === 1 ? '' : 'en'}`} — erhöhte Schwankung möglich`);
  }
  if (technik?.ampel === 'green') staerken.push({ t: 'Technischer Aufwärtstrend (Kurs über den gleitenden Durchschnitten)', info: 'Gleitende Durchschnitte (SMA 50/200) = geglättete Kurslinien der letzten 50 bzw. 200 Handelstage — notiert der Kurs darüber, gilt das als Aufwärtstrend.' });

  const scores = {
    wert: clamp(wert),
    zukunft: clamp(zukunft),
    vergangenheit: clamp(vergangenheit),
    bilanz: clamp(bilanz),
    dividende: clamp(dividende),
  };

  // Kurz-Fazit aus den zwei stärksten/schwächsten Dimensionen
  const NAMEN = { wert: 'Bewertung', zukunft: 'Wachstumsaussichten', vergangenheit: 'bisherige Entwicklung', bilanz: 'Bilanz', dividende: 'Dividende' };
  const sortiert = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [besteKey, besteVal] = sortiert[0];
  // "Keine Dividende" ist bei Wachstumsaktien normal — als Schwachpunkt
  // nur nennen, wenn sonst alles solide ist. Bilanz ohne Datenlage bzw.
  // bei Banken ebenfalls nicht als Schwachpunkt ausrufen.
  const schwKandidaten = sortiert.filter(
    ([key]) => key !== 'dividende' && !(key === 'bilanz' && (bilanzOhneDaten || istFinanzwert))
  );
  const [schwKey, schwVal] =
    schwKandidaten[schwKandidaten.length - 1][1] < 2.5 ? schwKandidaten[schwKandidaten.length - 1] : sortiert[sortiert.length - 1];
  let fazit;
  if (besteVal >= 3.5 && schwVal >= 2.5) fazit = `Rundes Profil — besonders stark bei ${NAMEN[besteKey]}.`;
  else if (besteVal >= 3.5) fazit = `Stark bei ${NAMEN[besteKey]}, Schwachpunkt ist die ${NAMEN[schwKey]}.`;
  else if (besteVal >= 2) fazit = `Durchwachsenes Profil — am ehesten überzeugt die ${NAMEN[besteKey]}.`;
  else fazit = 'Aktuell wenig überzeugende Fundamentaldaten — eher eine Wette auf die Zukunft.';

  return { scores, staerken: staerken.slice(0, 4), risiken: risiken.slice(0, 4), fazit };
}
