@echo off
REM ============================================================
REM ローカルLLM(Ollama)がこの仕事に使えるかを測る試験。
REM ダブルクリックで実行できる。実験用で、部品DBには書き込まない。
REM
REM PowerShellでフォルダを行き来してパスで止まることが続いたため、
REM start.bat と同じ場所に置いた。中身は tools\local_llm\try_classify.py。
REM
REM 引数はそのまま渡る。何も付けなければ入っているモデルを一覧表示する:
REM   ローカルLLMを試す.bat --model qwen2.5:7b --n 20
REM ============================================================
cd /d %~dp0

py tools\local_llm\try_classify.py %*
if errorlevel 1 goto :err

echo.
echo 終わりました。「誤答の内訳」と「種別ごとの出来」を見てください。
goto :end

:err
echo.
echo 途中で止まりました。上のメッセージを確認してください。

:end
echo.
pause
