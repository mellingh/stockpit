# CLAUDE.md — Projektkontext Stockpit

Lokales Aktien-Portfolio-Dashboard für Micha (GitHub: mellingh). Deutsch als UI- und Doku-Sprache.
App-Name: **Stockpit** (Stock + Cockpit; die früheren Namen "Aktien-Cockpit" und "Kurswerk"
hat Micha verworfen — Repo und Ordner heißen ebenfalls stockpit).

## Harte Anforderungen (nicht verhandelbar)

- **Null laufende Kosten**: keine Abos, keine API-Keys, keine Tokens, kein Login — auch nicht optional.
- Läuft **komplett lokal** (Node.js-Server + Browser), muss per Ordner-Kopie/Klon + `start.bat` weitergebbar sein (Zielgruppe: auch Michas Vater, kein Techniker).
- Persönliche Daten (`data/portfolio.json`) bleiben lokal und sind gitignored — niemals committen.

## Stack & Architektur (bewusst minimal)

- **Kein Framework, kein Build-Schritt**: Express-Server (`server/`) + drei statische Vanilla-JS-Seiten (`public/`), ES-Module direkt im Browser.
- Start: `npm start` oder `start.bat` (prüft Node, installiert bei Erstlauf) → http://localhost:3001
- `server/index.js` = alle API-Routen; Module: `yahoo.js` (Daten), `indicators.js` (SMA/RSI/MACD/Perf), `news.js` (RSS+Ticker-News), `sentiment.js` (lokale KI), `analysis.js` (Kategorisierung, Betroffenheits-Mapping, Relevanz-Filter, Erklärtexte, Gesamt-Score), `trials.js` (clinicaltrials), `calendar.js` (Wirtschaftskalender), `storage.js` (JSON-Datei), `cache.js` (TTL-Cache gegen Rate-Limits).

## Datenquellen (alle kostenlos, ohne Key)

| Quelle | Wofür | Achtung |
|---|---|---|
| `yahoo-finance2` **v4** | Kurse, Historie, Fundamentaldaten, Analysten (`recommendationMean` = Finviz-Recom 1–5, `recommendationTrend`, `upgradeDowngradeHistory`), Termine, Suche, FX | v4 ist **Klassen-API**: `new YahooFinance({suppressNotices: [...]})` — nicht das v2-Singleton-Muster verwenden |
| `Xenova/finbert` via `@huggingface/transformers` | News-Sentiment, lokal, Download einmalig nach `models/` (gitignored) | englisch; dt. Fallback `Xenova/bert-base-multilingual-uncased-sentiment`; Modelle per env `SENTIMENT_MODEL_EN`/`_MULTI` tauschbar |
| RSS (CNBC, MarketWatch, tagesschau) | Makro-News | Liste in `news.js` `MACRO_FEEDS` |
| clinicaltrials.gov API v2 | Studien bei Healthcare-Aktien | Sponsor-Suche ist wortbasiert („Moderna“ findet „ModernaTX“ nicht) → Fallback über `query.term` + Sponsor-Filter ist in `trials.js` eingebaut |
| investing.com-Widget (`sslecal2.investing.com`, lang=8=Deutsch) | Wirtschaftskalender **mit Aktuell-Werten** | blockt Node-Fetch per TLS-Fingerprint (403) → Server ruft `curl` auf (ab Win10 vorinstalliert); Fallback: ForexFactory-Feed (`nfs.faireconomy.media/ff_calendar_thisweek.json`, ohne Aktuell) |
| stockanalysis.com (`/stocks/{ticker}/ratings/`, serverseitig gerendert) | Analysten-Ratings **mit Kursziel je Bank** | nur US-Ticker (mit Suffix → Yahoo-Fallback ohne Kursziele); Spalten von hinten parsen (vorne Mobil-Duplikate) |
| TradingView Lightweight Charts (aus node_modules über `/vendor` serviert) | Candlestick-Chart | Marker pro Tag bündeln (sonst stapeln sie sich) |

## Produktentscheidungen (nicht rückgängig machen / nicht wieder vorschlagen)

- **X/Twitter-Experten-Modul wurde entfernt** (kostenloses Mitlesen unzuverlässig, Nitter geblockt). Nicht wieder einbauen, auch keine Bild-Auswertung von Posts (bräuchte Vision-Modell — als zu aufwendig verworfen).
- **News-Relevanz-Filter** (`analysis.js` → `isRelevant`): Portfolio-/Watchlist-News immer und zuerst; Makro nur bei Marktbewegern (Fed/EZB/Zins/Inflation/Geopolitik/Präsident); Fokus-Sektoren **Fintech, Biotech, Tech** (Michas Schwerpunkte); Ratgeber-/Boulevard-Artikel raus.
- Kursziele je einzelner Bank gibt es kostenlos nicht → nur Konsens-Spanne + Rating-Historie je Bank zeigen; ehrlich kommunizieren.
- Gesamteinschätzung = Technik + Analysten + News-Sentiment, jede Komponente offen begründet (keine Blackbox).
- **Snowflake-Analyse** (`server/snowflake.js`, SWS-Stil): 5 Dimensionen (Wert/Zukunft/Vergangenheit/Bilanz/Dividende) je 0–5, regelbasiert, plus Stärken/Risiken in Klartext. **Financial Services**: Bilanz über ROE/Marge bewerten (D/E, Current Ratio, FCF fehlen bei Banken strukturell) und nie als Schwachpunkt ausrufen, wenn Datenlage fehlt — in der Übersichts-Querkarte der Analyse-Seite mit SVG-Radar (`radarChart` in ui.js).
- Dashboard-Allokation gruppiert nach **Sektor** (ETFs eigener Topf), nicht nach Einzelwerten. Die frühere Klumpenrisiko-Warnung wurde auf Michas Wunsch **komplett entfernt** — nicht wieder einbauen.
- "Wichtige Termine": zwei kompakte Spalten (Deine Werte | Markt-Events), Überschriften neutral grau, kein rotes "heute", kleine Chips (`chip-sm`), Kernwerte direkt in der Zeile (EPS farbig nach Vorzeichen, Prognose), kein Aufklappen — Zeilen verlinken zu Analyse bzw. Kalender.
- Platzsparen mit `<details>`-Akkordeons (`collapsible()` in ui.js) — Micha mag aufklappbare Elemente; nichts darf horizontal scrollen (Seite max 1440px, 3-spaltiges Grid). Aufklapp-Indikator: klassisches SVG-Chevron (`chevronIcon()` in ui.js), gut sichtbar.
- **Keine nackten Score-Zahlen im UI** (Micha-Feedback): Gesamteinschätzung und Technik zeigen nur das farbige Urteil (Bullisch/Neutral/Bärisch) — keine Skalen, keine "+28"-Werte, keine Begründungs-Panels.
- News-Darstellung (Runde 8): Ticker-Chips OBEN in der Meta-Zeile, dann großer Titel, dann Badge-Zeile (`newsBadgesRow()`) OHNE %-Zahl (verwirrte Micha), darunter aufklappbare "Einordnung" (`newsEinordnung()`) mit ausführlicher Erklärung inkl. KI-Sicherheit.
- Chart im TradingView-Stil: Zeiträume 1T/1W (Intraday via `getIntraday`) + 1M/6M/1J/5J/Max, OHLC-Zeile oben links folgt dem Fadenkreuz, Rad-Zoom + Achsen-Drag aktiv. **News-Marker im Chart wurden komplett entfernt** (Micha-Feedback: verwirrend, TradingView hat sie auch nicht) — nicht wieder einbauen.
- Fundamentaldaten haben kein eigenes Panel: Kernwerte im Kennzahlen-Strip unterm Chart, Rest im Kennzahlen-Akkordeon (ETF-Profil bleibt eigenes Panel).
- Seeking Alpha, nasdaq.com, nyse.com, justETF: geprüft und verworfen (Paywall/redundant).

## Konventionen

- UI-Texte deutsch, `Intl`-Formatierung `de-DE`, EUR als Anzeigewährung im Dashboard (FX über Yahoo `USDEUR=X`).
- Design (Michas Wunsch, Feedback-Runde 3): **TradingView/Finviz Dark Mode** — neutrales Schwarz/Grau (#0b0e13), Blau als Akzent (#4c8dff), Grün/Rot nur für Markt, Gelb (--warn) nur für Ampel/Sterne. Sans (Instrument Sans) für alles inkl. großer Zahlen, Mono für Kursdaten — keine Serifen mehr. Fonts lokal in `public/fonts/`. Chart-Kategorienfarben sind eine validierte Palette — nicht frei ändern.
- Portfolio: **kein Kaufdatum** (bewusst entfernt — Micha kauft in Tranchen, es zählt nur Stückzahl + Ø-Kaufkurs).
- `replaceChildren()` nie mit möglichen `null`-Kindern aufrufen (rendert als Text "null") — `setChildren()`-Helfer in `analyse.js` nutzen.
- Nie Browser-confirm()/alert(). Löschen/Entfernen passiert OHNE Rückfrage (Micha-Wunsch, Runde 9) — `confirmDialog()` in ui.js existiert für Fälle, wo eine Bestätigung wirklich nötig wäre. Eingabefelder: einheitlich 42px hoch, überall Placeholder.
- Analysten-Monatssäulen: Strong Buy OBEN (wie Yahoo); Technik-Signale sortiert grün → gelb → rot.
- Fehler-Zustände immer benutzerfreundlich abfangen (Feed down, Ticker unbekannt, offline) — App darf nie leer/kaputt aussehen.
- Ehrliche Grenzen im UI/README benennen statt Features vorzutäuschen. Überall gilt: keine Anlageberatung.

## Verifikation nach Änderungen

Testfälle: US-Aktie (NVDA), deutsche Aktie (SAP.DE), Biotech (MRNA → Studien-Panel), ETF (VUAA.DE), Fintech (KLAR). Gemischtes EUR/USD-Depot → Gesamtwert plausibel. Indikatoren ggf. gegen Handrechnung prüfen (SMA = Schnitt der letzten n Schlusskurse).

## Windows-Eigenheiten (Michas Heim-PC)

- gh CLI liegt unter `C:\Program Files\GitHub CLI\gh.exe` (nicht im PATH).
- HTTPS-Push brauchte `git config http.sslBackend schannel`.
- Git-Identität pro Repo: mellingh + `159627479+mellingh@users.noreply.github.com`.
