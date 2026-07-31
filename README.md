# Stockpit 📈

Dein zentrales Dashboard für Aktien und ETFs — läuft **komplett lokal auf deinem Rechner**,
ohne Abos, ohne API-Keys, ohne Login, ohne Kosten.

![Stack](https://img.shields.io/badge/Stack-Node.js%20%2B%20Vanilla%20JS-informational)
![Kosten](https://img.shields.io/badge/laufende%20Kosten-0%20%E2%82%AC-success)

## Was die App kann

- **Dashboard**: Portfolio-Gesamtwert in EUR (Fremdwährungen werden automatisch umgerechnet),
  Gewinn/Verlust, Tagesveränderung, Pre-/After-Market bei US-Werten, Sektor-Allokation,
  30-Tage-Sparklines — Positionen und Watchlist werden direkt hier angelegt, geändert und gelöscht
- **Analyse**: Aktie oder ETF suchen → kompletter Bewertungs-Report:
  - Candlestick-Chart mit SMA 50/200, Volumen, Vortags-/Vorbörslich-Linien und TradingView-Bedienung
  - **Snowflake-Übersicht** (Simply-Wall-St-Stil): 5 Dimensionen, Stärken & Risiken in Klartext
  - **Analysten**: Konsens-Score 1–5 (wie die Finviz-"Recom"-Spalte), Aufschlüsselung
    Stark kaufen … Stark verkaufen, Kursziele (Tief/Ø/Hoch mit Upside) und die
    **Rating-Historie einzelner Banken inkl. Kursziel je Bank** (US-Werte)
  - **Kennzahlen-Leiste** unter dem Chart: KGV, Wachstum, Margen, Beta, Short Float, Performance, Dividende, Termine
  - **Meinungen auf X**: Ein-Klick-Links zur X-Suche deiner vertrauten Accounts, vorgefiltert auf den Ticker
  - **Biotech/Pharma**: laufende klinische Studien des Unternehmens (clinicaltrials.gov, offizielle Behörden-API)
  - **ETFs**: Kostenquote, Top-Positionen, Sektorgewichtung
- **News-Lage mit Relevanz-Filter**: nur News der letzten 7 Tage zu **deinen** Werten plus echte
  Marktbeweger (Zinsentscheide, Notenbanken, große Geopolitik) — Ratgeber- und Boulevard-Meldungen
  werden aussortiert. Eine **lokale KI** stuft jede Schlagzeile als positiv/negativ/neutral ein, und
  jede News bekommt eine Einordnung: **worum es geht** (Artikel-Teaser) und **was der Kurs daraus
  gemacht hat** (Bewegung vs. übliche Schwankung, Volumen, Folgetag)
- **Wirtschaftskalender**: Zinsentscheide, Inflationsdaten, Notenbank-Reden der Woche —
  nach Marktwirkung gefiltert, Zeiten in deiner Zeitzone
- **Termin-Radar**: Quartalszahlen und Ex-Dividenden deiner Werte + die wichtigsten Markt-Events
- **Gesamteinschätzung** pro Wert: Ampel (Bullish/Neutral/Bearish) aus Technik + Analysten + News

## Voraussetzung (einmalig)

**Node.js** (kostenlos): https://nodejs.org — die LTS-Version installieren. Das ist alles.

## Starten

Doppelklick auf **`start.bat`** — fertig.

Tipp: Einmal **`verknuepfung-erstellen.bat`** doppelklicken legt eine
**„Stockpit"-Verknüpfung auf den Desktop** — danach startest du die App von dort,
ohne den Ordner zu öffnen.

Beim allerersten Start werden automatisch die Abhängigkeiten installiert (1–2 Minuten)
und das KI-Modell heruntergeladen (~110 MB, einmalig). Danach öffnet sich das Dashboard
im Browser unter `http://localhost:3001`.

Alternativ per Terminal: `npm install` und dann `npm start`.

## Woher kommen die Daten? (alles kostenlos, ohne Anmeldung)

| Daten | Quelle |
|---|---|
| Kurse, Historie, Fundamentaldaten, Analysten, Termine | Yahoo Finance (inoffizielle Schnittstelle `yahoo-finance2`) |
| Makro-News | RSS: CNBC, MarketWatch, tagesschau Wirtschaft |
| Artikel-Teaser („Worum es geht") | og:description der Artikelseiten |
| Rating-Historie mit Kurszielen je Bank | stockanalysis.com (US-Werte) |
| Wirtschaftskalender | TradingView-Kalender (mit Ist-Werten), Fallback: investing.com-Widget → ForexFactory-Wochenfeed |
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
Der Empfänger startet mit leerem Portfolio und kann eigene X-Accounts für die Schnell-Links hinterlegen.

## Ehrliche Grenzen

- **Kurse** kommen leicht verzögert (Yahoo, kein Echtzeit-Börsenfeed) — für Swing/Longterm völlig ausreichend.
- **News-Erklärungen** sind regelbasiert + KI-Sentiment: Sie stellen Zusammenhänge her und ordnen ein,
  ersetzen aber keinen menschlichen Analysten.
- **Kursziele je Bank** gibt es frei nur für US-Ticker (stockanalysis.com) — bei anderen
  Werten zeigt die App die Konsens-Spanne (Tief/Ø/Hoch) und die Yahoo-Rating-Historie.
- Das KI-Modell versteht Englisch am besten (Finanz-News sind überwiegend englisch);
  für deutsche Feeds nutzt es ein mehrsprachiges Zweitmodell.

**Keine Anlageberatung.** Alle Angaben ohne Gewähr — die App ist ein Recherche-Werkzeug, keine Empfehlung.

## Technik (für Neugierige)

Express-Server (Node.js, `server/`) + moderne React-Oberfläche (`web/`:
Vite, React 19, TypeScript, Tailwind CSS v4, Komponenten im shadcn-Stil,
TradingView Lightweight Charts). Die Oberfläche wird beim ersten Start
einmalig gebaut (macht `start.bat` automatisch, ~30 Sekunden) und danach
als statische Dateien ausgeliefert — weiterhin kein Server-Framework,
keine Cloud, keine Telemetrie. Sentiment-Modell austauschbar über die
Umgebungsvariablen `SENTIMENT_MODEL_EN` / `SENTIMENT_MODEL_MULTI`.
Für Entwicklung: `npm run dev --prefix web` (Vite-Dev-Server mit
API-Proxy auf :3001).
