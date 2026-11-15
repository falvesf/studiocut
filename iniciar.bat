@echo off
title StudioCut - Editor de Video Local
cd /d "%~dp0"
echo ========================================================
echo    StudioCut - Editor de Video Inteligente e Local
echo    RTX 4070 NVENC Ativado ^| Sem Marcas ^| Sem Mensalidade
echo ========================================================
echo.
echo Iniciando servidor local na porta 4000...
start "" http://localhost:4000
node server/server.js
pause

