@echo off
chcp 65001 >nul
cd /d "%~dp0ticket-assistant"
call npm.cmd run browser:install
pause
