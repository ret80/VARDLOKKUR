#!/bin/bash
# Запуск debug-сервера

echo "Запуск debug-сервера на порту 3100..."

# Убить старый процесс если есть
pkill -f "debug-server.cjs" 2>/dev/null
sleep 1

# Запустить сервер в фоне
node debug-server.cjs &

# Ждать пока сервер запустится
sleep 2

# Проверить что сервер работает
if curl -s http://localhost:3100/debug/hello | grep -q "привет мир"; then
  echo "✓ Сервер запущен успешно!"
  echo "  REST API: http://localhost:3100/debug/state"
  echo "  WebSocket: ws://localhost:3100"
  echo ""
  echo "Для остановки: pkill -f debug-server.cjs"
else
  echo "✗ Сервер не запустился. Проверьте логи:"
  echo "  node debug-server.cjs"
  exit 1
fi
