@echo off
title Aktien-Dashboard
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

rem ---- Server starten und Browser oeffnen ----
echo Starte Aktien-Dashboard...
start "" http://localhost:3001
node server/index.js
pause
