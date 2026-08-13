@echo off
setlocal
set "HERE=%~dp0"
set "MANIFEST=%~1"
set "LOGDIR=%HERE%logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

REM ---------------------------------------------------------------
REM  ASCII ONLY. Do NOT put Korean text or emoji in this file.
REM  2026-08-11: Korean REM comments silently broke cmd parsing.
REM  No log was written AND it still returned exit 0 (false success),
REM  which the scheduler records as a successful publish.
REM  Full rationale lives in second-brain/wiki/log.md (2026-08-11).
REM
REM  NODE is pinned on purpose. The nvm symlink C:\nvm4w\nodejs gets
REM  switched to older versions for day-job work, and publish.mjs is
REM  ESM -- it dies with SyntaxError on node 10. Unattended run, so
REM  nobody sees it. Update this line when node is upgraded.
REM ---------------------------------------------------------------
set "NODE=%LOCALAPPDATA%\nvm\v22.21.1\node.exe"
if not exist "%NODE%" set "NODE=C:\nvm4w\nodejs\node.exe"

echo ==================== >> "%LOGDIR%\%~n1.log"
echo [%DATE% %TIME%] publish %MANIFEST% >> "%LOGDIR%\%~n1.log"
for /f "delims=" %%v in ('"%NODE%" --version 2^>^&1') do echo [node %%v] %NODE% >> "%LOGDIR%\%~n1.log"
"%NODE%" "%HERE%publish.mjs" --manifest "%HERE%%MANIFEST%" >> "%LOGDIR%\%~n1.log" 2>&1
set "RC=%ERRORLEVEL%"
echo [exit %RC%] >> "%LOGDIR%\%~n1.log"
endlocal & exit /b %RC%
