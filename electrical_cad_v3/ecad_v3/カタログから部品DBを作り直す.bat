@echo off
cd /d %~dp0
echo カタログCSVから部品DBを作り直します...
py tools\rebuild_parts_db.py
pause
