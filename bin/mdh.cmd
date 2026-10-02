@echo off
setlocal EnableExtensions DisableDelayedExpansion
node "%~dp0..\src\cli.js" %*
exit /b %errorlevel%