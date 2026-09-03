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

    # Ждём пока сервер поднимется
    for i in $(seq 1 60); do
        if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            echo "✅ Vite сервер запущен"
            break
        fi
        sleep 0.5
    done
fi

# 3. Проверяем что сервер отвечает
for i in $(seq 1 30); do
    if curl -s http://localhost:3000/VARDLOKKUR/ > /dev/null 2>&1 ; then
        echo "✅ Сервер отвечает"
        break
    fi
    sleep 0.5
done

echo "✅ Готово! Запусти F5 для отладки"
