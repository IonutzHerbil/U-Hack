@echo off
echo Installing dependencies...
call npm install

echo.
echo Building TypeScript...
call npm run build

echo.
echo Starting the app...
call npm start
