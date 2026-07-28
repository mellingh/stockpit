# CLAUDE.md — Projektkontext Aktien-Cockpit

Lokales Aktien-Portfolio-Dashboard für Micha (GitHub: mellingh). Deutsch als UI- und Doku-Sprache.

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
| ForexFactory-Feed (`nfs.faireconomy.media/ff_calendar_thisweek.json`) | Wirtschaftskalender | nur aktuelle Woche |
| TradingView Lightweight Charts (aus node_modules über `/vendor` serviert) | Candlestick-Chart | Marker pro Tag bündeln (sonst stapeln sie sich) |

## Produktentscheidungen (nicht rückgängig machen / nicht wieder vorschlagen)

- **X/Twitter-Experten-Modul wurde entfernt** (kostenloses Mitlesen unzuverlässig, Nitter geblockt). Nicht wieder einbauen, auch keine Bild-Auswertung von Posts (bräuchte Vision-Modell — als zu aufwendig verworfen).
- **News-Relevanz-Filter** (`analysis.js` → `isRelevant`): Portfolio-/Watchlist-News immer und zuerst; Makro nur bei Marktbewegern (Fed/EZB/Zins/Inflation/Geopolitik/Präsident); Fokus-Sektoren **Fintech, Biotech, Tech** (Michas Schwerpunkte); Ratgeber-/Boulevard-Artikel raus.
- Kursziele je einzelner Bank gibt es kostenlos nicht → nur Konsens-Spanne + Rating-Historie je Bank zeigen; ehrlich kommunizieren.
- Gesamteinschätzung = Technik + Analysten + News-Sentiment, jede Komponente offen begründet (keine Blackbox).
- Seeking Alpha, nasdaq.com, nyse.com, justETF: geprüft und verworfen (Paywall/redundant).

## Konventionen

- UI-Texte deutsch, `Intl`-Formatierung `de-DE`, EUR als Anzeigewährung im Dashboard (FX über Yahoo `USDEUR=X`).
- Design: dunkles Terminal-Design, Fonts lokal in `public/fonts/` (Fraunces/Instrument Sans/Spline Sans Mono), Chart-Kategorienfarben sind eine validierte Palette — nicht frei ändern.
- `replaceChildren()` nie mit möglichen `null`-Kindern aufrufen (rendert als Text "null") — `setChildren()`-Helfer in `analyse.js` nutzen.
- Fehler-Zustände immer benutzerfreundlich abfangen (Feed down, Ticker unbekannt, offline) — App darf nie leer/kaputt aussehen.
- Ehrliche Grenzen im UI/README benennen statt Features vorzutäuschen. Überall gilt: keine Anlageberatung.

## Verifikation nach Änderungen

Testfälle: US-Aktie (NVDA), deutsche Aktie (SAP.DE), Biotech (MRNA → Studien-Panel), ETF (VUAA.DE), Fintech (KLAR). Gemischtes EUR/USD-Depot → Gesamtwert plausibel. Indikatoren ggf. gegen Handrechnung prüfen (SMA = Schnitt der letzten n Schlusskurse).

## Windows-Eigenheiten (Michas Heim-PC)

- gh CLI liegt unter `C:\Program Files\GitHub CLI\gh.exe` (nicht im PATH).
- HTTPS-Push brauchte `git config http.sslBackend schannel`.
- Git-Identität pro Repo: mellingh + `159627479+mellingh@users.noreply.github.com`.
