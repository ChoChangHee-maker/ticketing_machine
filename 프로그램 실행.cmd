@echo off
chcp 65001 >nul
cd /d "%~dp0ticket-assistant"
if not exist "node_modules\vite\package.json" (
  echo 먼저 의존성을 설치합니다.
  call npm.cmd install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo 티켓팅 도우미를 시작합니다. http://127.0.0.1:5174/
call npm.cmd run dev -- --open
pause
