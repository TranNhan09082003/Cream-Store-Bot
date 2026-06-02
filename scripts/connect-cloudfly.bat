@echo off
echo ====================================
echo   Cenar Store - SSH Setup Helper
echo ====================================
echo.
echo Ban se duoc ket noi vao server CloudFly.
echo Khi hoi password, nhap: 9DzsgMZE3xUmyk1T
echo.
echo Sau khi vao, PASTE lenh ben duoi (right-click de paste):
echo.
echo -----------------------------------------------
echo apt update -y ^&^& apt install -y curl ^&^& curl -fsSL https://raw.githubusercontent.com/TranNhan09082003/Cream-Store-Bot/main/scripts/setup-cloudfly.sh ^| bash
echo -----------------------------------------------
echo.
pause
ssh root@103.179.189.36
