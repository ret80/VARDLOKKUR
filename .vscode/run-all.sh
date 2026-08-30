#!/usr/bin/env bash

cd "$(dirname "$0")/.."

# 1. Сборка проекта
echo "🔨 Сборка проекта..."
npm run build

# 2. Проверка запущен ли Vite сервер
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✅ Vite сервер уже запущен"
else
    echo "🚀 Запуск Vite сервера..."
    npm run dev &
    DEV_PID=$!
    echo $DEV_PID > .vite-dev.pid

    # Ждём пока сервер поднимется (до 30 секунд)
    for i in $(seq 1 60); do
        if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            echo "✅ Vite сервер запущен"
            break
        fi
        sleep 0.5
    done
fi

# 3. Открываем в Chrome
open -a "Google Chrome" http://localhost:3000

echo "✅ Готово!"
