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

rem ---- Muss gebaut werden? ----
rem Beim ersten Start (kein web\dist) und nach jedem Update (git pull aendert
rem den Stand, der Stempel in web\dist\.build-stempel passt dann nicht mehr).
set BUILD_NOETIG=0
if not exist node_modules set BUILD_NOETIG=1
if not exist web\node_modules set BUILD_NOETIG=1
if not exist web\dist set BUILD_NOETIG=1

set AKTUELLER_STAND=
for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do set AKTUELLER_STAND=%%i
if "%AKTUELLER_STAND%"=="" goto stempel_fertig
set GEBAUTER_STAND=
if exist web\dist\.build-stempel set /p GEBAUTER_STAND=<web\dist\.build-stempel
if not "%AKTUELLER_STAND%"=="%GEBAUTER_STAND%" set BUILD_NOETIG=1
:stempel_fertig

if "%BUILD_NOETIG%"=="0" goto starten

echo Stockpit wird vorbereitet ^(beim ersten Start bzw. nach einem Update, ca. 1-2 Minuten^)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo Installation fehlgeschlagen. Bitte Internetverbindung pruefen.
  pause
  exit /b 1
)
call npm install --prefix web --no-audit --no-fund
if errorlevel 1 (
  echo Installation der Oberflaeche fehlgeschlagen. Bitte Internetverbindung pruefen.
  pause
  exit /b 1
)
call npm run build --prefix web
if errorlevel 1 (
  echo Bau der Oberflaeche fehlgeschlagen.
  pause
  exit /b 1
)
rem Umleitung VOR dem echo: endet der Hash auf einer Ziffer, wuerde "echo hash>datei"
rem die Ziffer sonst als Datei-Deskriptor interpretieren und verschlucken
if not "%AKTUELLER_STAND%"=="" >web\dist\.build-stempel echo %AKTUELLER_STAND%

:starten
echo Starte Stockpit...
start "" http://localhost:3001
node server/index.js
pause
