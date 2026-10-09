@echo off
cd /d %~dp0
echo Kuvemo を起動します...
rem サーバーが待ち受けを始めてからブラウザを開く(server.py が開く)。
rem 先に start でブラウザを開くと、まだ待ち受けていないポートに
rem 繋ぎに行って一瞬「アクセスできません」になる(2026-09-21)。
py server.py --open /
pause
