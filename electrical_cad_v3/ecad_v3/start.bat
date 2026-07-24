@echo off
cd /d %~dp0
echo 電気回路図エディタを起動します...
start http://localhost:8080
py server.py
pause
