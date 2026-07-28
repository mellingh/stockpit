# Aktien-Cockpit 📈

Dein zentrales Dashboard für Aktien und ETFs — läuft **komplett lokal auf deinem Rechner**,
ohne Abos, ohne API-Keys, ohne Login, ohne Kosten.

![Stack](https://img.shields.io/badge/Stack-Node.js%20%2B%20Vanilla%20JS-informational)
![Kosten](https://img.shields.io/badge/laufende%20Kosten-0%20%E2%82%AC-success)

## Was die App kann

- **Dashboard**: Portfolio-Gesamtwert in EUR (Fremdwährungen werden automatisch umgerechnet),
  Gewinn/Verlust, Tagesveränderung, Allokations-Donut, 30-Tage-Sparklines und Signal-Ampel je Position
- **Analyse**: Aktie oder ETF suchen → kompletter Bewertungs-Report:
  - Candlestick-Chart mit SMA 50/200 und **News-Markern** direkt im Kursverlauf
  - **Technik** (Swing/Longterm): Trend, Golden/Death Cross, RSI(14), MACD, 52-Wochen-Spanne — mit Klartext-Begründung
  - **Analysten**: Konsens-Score 1–5 (wie die Finviz-"Recom"-Spalte), Aufschlüsselung
    Strong Buy / Kaufen / Halten / Verkaufen / Strong Sell und Kursziele (Tief/Ø/Hoch mit Upside)
  - **Fundamental**: KGV, Wachstum, Margen, Verschuldung, Free Cashflow, Dividende
  - **Biotech/Pharma**: laufende klinische Studien des Unternehmens (clinicaltrials.gov, offizielle Behörden-API)
  - **ETFs**: Kostenquote, Top-Positionen, Sektorgewichtung
- **News-Lage mit Relevanz-Filter**: primär News zu **deinen** Werten; allgemeine News nur bei
  echten Marktbewegern (Zinsentscheide, Notenbanken, große Geopolitik) und den Fokus-Sektoren
  Fintech/Biotech/Tech — Ratgeber- und Boulevard-Meldungen werden aussortiert. Eine **lokale KI**
  stuft jede Schlagzeile als positiv/negativ/neutral ein, ordnet sie Sektor und betroffenen
  Positionen zu und **erklärt die Kursreaktion** („News negativ, Kurs trotzdem +2 % — Schlimmeres war eingepreist …")
- **Analysten-Historie**: einzelne Banken (Goldman Sachs, Barclays …) mit Hoch-/Abstufungen,
  plus „Aktuelle Bewertung"-Karte
- **Kennzahlen im Finviz-Stil**: Beta, Short Float, Insider-/Institutionsanteil, ROE/ROA, PEG,
  EV/EBITDA, Performance (Woche bis Jahr), Abstand zu SMA20/50/200
- **Wirtschaftskalender**: Zinsentscheide, Inflationsdaten, Notenbank-Reden der Woche —
  nach Marktwirkung gefiltert, Zeiten in deiner Zeitzone
- **Termin-Radar**: Warnung, wenn Quartalszahlen deiner Werte anstehen
- **Gesamteinschätzung** pro Wert: Ampel aus Technik + Analysten + News,
  mit offengelegter Begründung je Komponente (keine Blackbox)

## Voraussetzung (einmalig)

**Node.js** (kostenlos): https://nodejs.org — die LTS-Version installieren. Das ist alles.

## Starten

Doppelklick auf **`start.bat`** — fertig.

Beim allerersten Start werden automatisch die Abhängigkeiten installiert (1–2 Minuten)
und das KI-Modell heruntergeladen (~110 MB, einmalig). Danach öffnet sich das Dashboard
im Browser unter `http://localhost:3001`.

Alternativ per Terminal: `npm install` und dann `npm start`.

## Woher kommen die Daten? (alles kostenlos, ohne Anmeldung)

| Daten | Quelle |
|---|---|
| Kurse, Historie, Fundamentaldaten, Analysten, Termine | Yahoo Finance (inoffizielle Schnittstelle `yahoo-finance2`) |
| Makro-News | RSS: CNBC, MarketWatch, tagesschau Wirtschaft |
| Wirtschaftskalender | ForexFactory-Wochenfeed (öffentlich, kostenlos) |
| Klinische Studien | clinicaltrials.gov (offizielle API v2) |
| News-Bewertung | **FinBERT** — KI-Modell, läuft lokal auf deinem Rechner (Transformers.js) |
| Technische Signale | selbst berechnet aus der Kurshistorie (gleiche Werte wie Finviz/TradingView) |
| Charts | TradingView Lightweight Charts (MIT-Lizenz) |

## Deine Daten bleiben bei dir

Das Portfolio liegt in `data/portfolio.json` auf deinem Rechner und wird **nie** hochgeladen
(per `.gitignore` vom Repository ausgeschlossen). Internet braucht die App nur, um Kurse
und News abzurufen — die Bewertung passiert lokal.

## App weitergeben

Repository klonen oder als ZIP herunterladen, `start.bat` doppelklicken — mehr nicht.
Der Empfänger startet mit leerem Portfolio und kann eigene Experten hinzufügen.

## Ehrliche Grenzen

- **Kurse** kommen leicht verzögert (Yahoo, kein Echtzeit-Börsenfeed) — für Swing/Longterm völlig ausreichend.
- **News-Erklärungen** sind regelbasiert + KI-Sentiment: Sie stellen Zusammenhänge her und ordnen ein,
  ersetzen aber keinen menschlichen Analysten.
- **Kursziele einzelner Banken** gibt es nur in Bezahl-Datenbanken — die App zeigt die
  Konsens-Spanne (Tief/Ø/Hoch) und die Rating-Historie je Bank.
- Das KI-Modell versteht Englisch am besten (Finanz-News sind überwiegend englisch);
  für deutsche Feeds nutzt es ein mehrsprachiges Zweitmodell.

**Keine Anlageberatung.** Alle Angaben ohne Gewähr — die App ist ein Recherche-Werkzeug, keine Empfehlung.

## Technik (für Neugierige)

Bewusst minimaler Stack: ein Express-Server (Node.js) + drei statische HTML-Seiten mit
Vanilla-JavaScript — kein Build-Schritt, kein Framework. Servercode in `server/`,
Oberfläche in `public/`. Sentiment-Modell austauschbar über die Umgebungsvariablen
`SENTIMENT_MODEL_EN` / `SENTIMENT_MODEL_MULTI`.
