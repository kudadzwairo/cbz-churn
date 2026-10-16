@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js and npm are required to start the staff screen.
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo Node.js and npm are required to start the staff screen.
  exit /b 1
)

where py >nul 2>&1
if not errorlevel 1 (
  py -3 scripts\ensure_env.py
) else (
  python scripts\ensure_env.py
)
if errorlevel 1 exit /b 1

set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo The virtual environment was not created.
  exit /b 1
)

call :next_free_port 8000 API_PORT
if errorlevel 1 exit /b 1
call :next_free_port 5173 UI_PORT
if errorlevel 1 exit /b 1

if not "%API_PORT%"=="8000" echo Port 8000 is in use. The API will use %API_PORT%.
if not "%UI_PORT%"=="5173" echo Port 5173 is in use. The staff screen will use %UI_PORT%.

pushd frontend
node --input-type=module -e "import 'vite'" >nul 2>&1
if errorlevel 1 (
  echo Frontend packages do not match this operating system. Reinstalling them.
  popd
  if exist frontend\node_modules rmdir /s /q frontend\node_modules
  pushd frontend
  call npm install
  if errorlevel 1 (
    popd
    exit /b 1
  )
)
popd

echo.
echo CBZ churn worklist: http://127.0.0.1:%UI_PORT%
echo API:                http://127.0.0.1:%API_PORT%/api/health
echo Close the two server windows to stop the app.
echo.

set "CBZ_API_PORT=%API_PORT%"
set "CBZ_UI_PORT=%UI_PORT%"
start "CBZ API" "%PY%" -m uvicorn backend.main:app --host 127.0.0.1 --port %API_PORT%
start "CBZ UI" /D "%CD%\frontend" cmd /c "npm run dev -- --host 127.0.0.1 --port %UI_PORT% --strictPort"
exit /b 0

:next_free_port
set "PORT=%~1"
set /a LIMIT=%~1+20
:port_loop
"%PY%" -c "import socket,sys; p=int(sys.argv[1]); c=socket.socket(); c.settimeout(0.2); busy=c.connect_ex(('127.0.0.1', p))==0; c.close(); sys.exit(1) if busy else None; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('127.0.0.1', p)); s.close()" !PORT!
if not errorlevel 1 (
  set "%~2=!PORT!"
  exit /b 0
)
set /a PORT+=1
if !PORT! GTR !LIMIT! (
  echo No free port found from %~1 to !LIMIT!.
  exit /b 1
)
goto port_loop
