@echo off
REM Batch file to run humanizer from command line
REM Usage: humanize.bat input.txt [ghost_mini|ghost_pro] [light|medium|strong]

setlocal enabledelayedexpansion

if "%1"=="" (
    echo Usage: humanize.bat input.txt [engine] [strength]
    echo Example: humanize.bat mytext.txt ghost_mini medium
    echo.
    echo Engines: ghost_mini ^(default^), ghost_pro
    echo Strength: light, medium ^(default^), strong
    exit /b 1
)

set INPUT_FILE=%1
set ENGINE=%2
set STRENGTH=%3

if "%ENGINE%"=="" set ENGINE=ghost_mini
if "%STRENGTH%"=="" set STRENGTH=medium

if not exist "%INPUT_FILE%" (
    echo Error: File not found: %INPUT_FILE%
    exit /b 1
)

echo Processing %INPUT_FILE% with %ENGINE% ^(%STRENGTH%^)...
echo.

"e:\Websites\Humanizer Engine\.venv\Scripts\python.exe" -c "import sys; from humanizer import humanize; text = open(r'%INPUT_FILE%', encoding='utf-8').read(); result = humanize(text, mode='%ENGINE%', strength='%STRENGTH%'); print(result); sys.stderr.write(f'\n\nDone! Words: {len(result.split())}\n')"

if errorlevel 1 (
    echo.
    echo Error during processing
    exit /b 1
)

echo.
echo Output saved to: %INPUT_FILE%.humanized.txt
"e:\Websites\Humanizer Engine\.venv\Scripts\python.exe" -c "import sys; from humanizer import humanize; text = open(r'%INPUT_FILE%', encoding='utf-8').read(); result = humanize(text, mode='%ENGINE%', strength='%STRENGTH%'); open(r'%INPUT_FILE%.humanized.txt', 'w', encoding='utf-8').write(result); print(f'Processed {len(result.split())} words')"
