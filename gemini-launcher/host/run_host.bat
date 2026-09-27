@echo off
setlocal
cd /d "%~dp0"
"C:\Users\29580\.local\bin\uv.exe" run python -u "%~dp0host.py" %*
