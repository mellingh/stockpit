// Lokales Termin-Lexikon — 1:1 aus v1 (public/js/kalender.js) übernommen.
// Muster decken deutsche (investing.com) UND englische Titel (ForexFactory) ab;
// richtung steuert die Devisen-Faustregel ('hoch-gut' = höher stärkt die Währung).

export interface LexikonEintrag {
  re: RegExp;
  richtung?: 'hoch-gut' | 'hoch-schlecht';
  was: string;
  deutung: string;
}

export const EVENT_LEXIKON: LexikonEintrag[] = [
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
  { re: /beschäftigungskosten|beschaeftigungskosten|arbeitskosten|employment cost|labou?r cost|lohnwachstum|stundenlöhne|stundenloehne|wage/i,
    richtung: 'hoch-gut',
    was: 'Beschäftigungskosten/Löhne: misst, wie stark Löhne und Lohnnebenkosten steigen — steigende Löhne treiben über die Kaufkraft auch die Inflation.',
    deutung: 'Höher als erwartet = Lohndruck hält die Inflation am Leben → Notenbank bleibt vorsichtig, tendenziell schlecht für Aktien. Niedriger = Entspannung an der Lohnfront.' },
  { re: /leistungsbilanz|current account/i,
    richtung: 'hoch-gut',
    was: 'Leistungsbilanz: Saldo aus Exporten, Importen und Übertragungen — zeigt, ob ein Land mehr verkauft als kauft.',
    deutung: 'Ein Überschuss stützt tendenziell die Währung; für Aktien meist zweitrangig, wichtig eher als Konjunktursignal.' },
  { re: /geldmenge|money supply|kreditvergabe|consumer credit|konsumentenkredit|lending/i,
    was: 'Geldmenge/Kreditvergabe: wie viel Geld bzw. Kredit im Umlauf ist — ein Maß dafür, wie locker die Finanzierungsbedingungen wirklich sind.',
    deutung: 'Stark wachsende Kreditvergabe = Konsumenten und Firmen geben Geld aus (konjunkturfreundlich, aber potenziell inflationär); schrumpfende Kredite = Bremsspur in der Wirtschaft.' },
  { re: /frühindikator|fruehindikator|leading (economic )?index|conference board/i,
    was: 'Frühindikator-Index: bündelt vorlaufende Größen (Aufträge, Aktienkurse, Erwartungen) zu einem Ausblick auf die Konjunktur der nächsten Monate.',
    deutung: 'Mehrere fallende Monate in Folge gelten als Rezessionswarnung; steigende Werte signalisieren anziehende Konjunktur.' },
  { re: /zew|ifo|gfk/i,
    richtung: 'hoch-gut',
    was: 'Deutscher Stimmungsindikator (ifo/ZEW/GfK): Umfragen unter Unternehmen bzw. Analysten/Verbrauchern zur Wirtschaftslage und -erwartung.',
    deutung: 'Über den Erwartungen = Konjunkturoptimismus (gut für DAX & Co.), darunter = Sorgenfalten. Der ifo-Index ist der gewichtigste der drei.' },
];

export function erklaerungFuer(titel: string): LexikonEintrag {
  const treffer = EVENT_LEXIKON.find((l) => l.re.test(titel));
  if (treffer) return treffer;
  return {
    re: /./,
    was: 'Wirtschaftsindikator für die jeweilige Region — die Prognose ist der Analystenkonsens vor der Veröffentlichung.',
    deutung: 'Es zählt die Abweichung von der Prognose: Deutlich daneben bewegt die Märkte. Grün/Rot beim Aktuell-Wert = besser/schlechter als erwartet.',
  };
}

/** Flaggen-Emoji aus dem ISO-Ländercode (EU hat ein eigenes Emoji) */
export const flagge = (land: string | null | undefined) =>
  land && /^[A-Z]{2}$/.test(land)
    ? String.fromCodePoint(...[...land].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '';
