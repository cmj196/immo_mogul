@echo off
rem Starts a local server for Immo Mogul and opens it in the default browser.
rem Close this window to stop the server.
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5181/"
python -m http.server 5181 --bind 127.0.0.1
