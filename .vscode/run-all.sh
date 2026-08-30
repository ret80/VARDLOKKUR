#!/usr/bin/env bash

cd "$(dirname "$0")/.."

# 1. Сборка проекта
echo "🔨 Сборка проекта..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Сборка не удалась"
    exit 1
fi

# 2. Проверка запущен ли Vite сервер
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✅ Vite сервер уже запущен"
else
    echo "🚀 Запуск Vite сервера..."
    nohup npm run dev > .vite-server.log 2>&1 &
    DEV_PID=$!
    echo $DEV_PID > .vite-dev.pid
    disown $DEV_PID

    # Ждём пока сервер поднимется (до 30 секунд)
    echo "⏳ Ожидание сервера..."
    for i in $(seq 1 60); do
        if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            echo "✅ Vite сервер запущен"
            break
        fi
        sleep 0.5
    done
fi

# 3. Ждём пока сервер начнёт отвечать на HTTP
echo "⏳ Проверка сервера..."
for i in $(seq 1 60); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ Сервер отвечает (HTTP $HTTP_CODE)"
        break
    fi
    sleep 0.5
done

echo "✅ Готово! http://localhost:3000"
