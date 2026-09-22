@echo off
chcp 65001 > nul
echo ========================================================
echo   עיריית לוד - מפת נקודות חמות | העלאה ל-GitHub
echo ========================================================
echo.
cd /d "%~dp0"
echo בודק חיבור ל-GitHub...
gh auth status
if %errorlevel% neq 0 (
    echo נא להתחבר תחילה באמצעות: gh auth login
    pause
    exit /b
)
echo.
echo יוצר מאגר ציבורי חדש בשם lod-hotspots-dashboard ומעלה את הקוד...
gh repo create lod-hotspots-dashboard --public --source=. --remote=origin --push
if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   הפרויקט הועלה בהצלחה ל-GitHub!
    echo ========================================================
) else (
    echo.
    echo אם המאגר כבר קיים, נבצע דחיפה (push):
    git push -u origin main
)
echo.
pause
