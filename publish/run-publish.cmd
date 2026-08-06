@echo off
setlocal
set "HERE=%~dp0"
set "MANIFEST=%~1"
set "LOGDIR=%HERE%logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo ==================== >> "%LOGDIR%\%~n1.log"
echo [%DATE% %TIME%] publish %MANIFEST% >> "%LOGDIR%\%~n1.log"
"C:\nvm4w\nodejs\node.exe" "%HERE%publish.mjs" --manifest "%HERE%%MANIFEST%" >> "%LOGDIR%\%~n1.log" 2>&1
set "RC=%ERRORLEVEL%"
echo [exit %RC%] >> "%LOGDIR%\%~n1.log"
endlocal & exit /b %RC%
