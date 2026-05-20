@echo off
if "%~1"=="" (
    echo Drop SVG file here.
    pause
    exit /b 1
)

set INKSCAPE=C:\Program Files\Inkscape\bin\inkscape.com

:loop
if "%~1"=="" goto end
echo Converting: %~nx1
"%INKSCAPE%" --export-type=pdf "%~1"
echo Done: %~dpn1.pdf
shift
goto loop

:end
pause
