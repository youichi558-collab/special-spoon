@echo off
cd /d %~dp0
echo 部品DBを開きます...
rem サーバーが待ち受けを始めてからブラウザを開く(server.py が開く)。
rem CAD(start.bat)が既に動いている場合、ここのサーバーは起動できずに
rem 終了するが、その場合もタブは開く(server.py 側で面倒を見ている)。
py server.py --open /parts.html
pause
