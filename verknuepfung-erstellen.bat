@echo off
title Stockpit - Desktop-Verknuepfung
rem Legt eine Verknuepfung "Stockpit" auf dem Desktop an, die start.bat
rem aus DIESEM Ordner startet - einmal doppelklicken, fertig.
rem (Eine feste .lnk-Datei laesst sich nicht mitliefern, weil sie den
rem absoluten Pfad des Ordners braucht - der ist auf jedem Rechner anders.)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $lnk = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Stockpit.lnk'); $lnk.TargetPath = '%~dp0start.bat'; $lnk.WorkingDirectory = '%~dp0'; $lnk.Description = 'Stockpit starten (lokales Aktien-Dashboard)'; $lnk.IconLocation = '%SystemRoot%\System32\shell32.dll,137'; $lnk.Save()"

if errorlevel 1 (
  echo.
  echo  Konnte die Verknuepfung nicht erstellen.
  echo.
) else (
  echo.
  echo  Fertig! Auf dem Desktop liegt jetzt die Verknuepfung "Stockpit".
  echo  Doppelklick darauf startet die App - genau wie start.bat.
  echo.
)
pause
