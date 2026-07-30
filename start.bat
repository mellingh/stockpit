@echo off
title Stockpit
cd /d "%~dp0"

rem ---- Voraussetzung pruefen: Node.js ----
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js ist nicht installiert.
  echo  Bitte einmalig kostenlos installieren: https://nodejs.org  ^(LTS-Version^)
  echo  Danach diese Datei erneut doppelklicken.
  echo.
  pause
  exit /b 1
)

rem ---- Abhaengigkeiten beim ersten Start installieren ----
if not exist node_modules (
  echo Erster Start: Abhaengigkeiten werden installiert ^(einmalig, ca. 1-2 Minuten^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Installation fehlgeschlagen. Bitte Internetverbindung pruefen.
    pause
    exit /b 1
  )
)

rem ---- Oberflaeche beim ersten Start bauen (einmalig) ----
if not exist web\node_modules (
  echo Oberflaeche wird vorbereitet ^(einmalig^)...
  call npm install --prefix web --no-audit --no-fund
  if errorlevel 1 (
    echo Installation der Oberflaeche fehlgeschlagen. Bitte Internetverbindung pruefen.
    pause
    exit /b 1
  )
)
if not exist web\dist (
  echo Oberflaeche wird gebaut ^(einmalig, ca. 30 Sekunden^)...
  call npm run build --prefix web
  if errorlevel 1 (
    echo Bau der Oberflaeche fehlgeschlagen.
    pause
    exit /b 1
  )
)

rem ---- Server starten und Browser oeffnen ----
echo Starte Stockpit...
start "" http://localhost:3001
node server/index.js
pause
