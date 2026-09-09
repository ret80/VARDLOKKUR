# План: Отладочный сервер для управления игрой

## Цель
Создать HTTP/WebSocket сервер, который позволяет удалённо управлять игрой и смотреть её состояние без ручного нажатия клавиш.

## Архитектура

### 1. Debug Server (Node.js, встроен в Vite dev server)
**Файл:** `src/game/debug-server.ts`

- Запускается на отдельном порту (например, 3100)
- WebSocket для двусторонней связи
- REST API для простых запросов

### 2. Debug Client API (внутри игры)
**Файл:** `src/game/debug-api.ts`

- Подключается к серверу
- Экспонирует состояние ECS в реальном времени
- Принимает команды от сервера

### 3. Debug Panel (React UI)
**Файл:** `src/components/DebugPanel.tsx`

- Встраивается в игру как overlay
- Показывает состояние игрока, врагов, туман, флаги
- Кнопки управления (респаун, спавн врагов, телепорт и т.д.)

---

## Команды сервера (WebSocket)

### Запросы от сервера → игра

| Команда | Параметры | Описание |
|---------|-----------|----------|
| `get-state` | — | Получить полное состояние игры |
| `get-player` | — | Позиция, HP, инвентарь игрока |
| `get-enemies` | — | Список всех врагов |
| `get-fog-state` | — | Состояние тумана |
| `teleport` | `{x, y}` | Телепортировать игрока |
| `set-hp` | `{hp}` | Установить HP игрока |
| `kill-player` | — | Убить игрока |
| `respawn-player` | — | Респаун игрока |
| `spawn-enemy` | `{kind, x, y}` | Спавн врага |
| `kill-enemy` | `{eid}` | Убить врага по ID |
| `remove-all-enemies` | — | Удалить всех врагов |
| `set-flag` | `{key, value}` | Установить флаг |
| `add-runes` | `{count}` | Добавить руны |
| `toggle-fog` | — | Включить/выключить туман |
| `advance-time` | `{seconds}` | Ускорить время (x10, x60) |
| `freeze` | — | Пауза игры |
| `unfreeze` | — | Снять паузу |

### Ответы от игры → сервер

| Событие | Данные | Описание |
|---------|--------|----------|
| `state` | `{player, enemies, fog, flags}` | Полное состояние |
| `player` | `{x, y, hp, maxHp, ...}` | Состояние игрока |
| `enemy-list` | `[{eid, kind, x, y, hp, state}]` | Список врагов |
| `fog-state` | `{fogActive, fogAmbient, fogLeft, ...}` | Состояние тумана |
| `flags` | `{...}` | Все игровые флаги |
| `toast` | `{msg}` | Всплывающие сообщения |

---

## REST API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/debug/state` | Получить состояние игры |
| POST | `/debug/teleport` | `{x, y}` |
| POST | `/debug/spawn-enemy` | `{kind, x, y}` |
| POST | `/debug/set-flag` | `{key, value}` |
| POST | `/debug/kill-player` | — |
| POST | `/debug/respawn` | — |

---

## Структура данных состояния

```typescript
interface DebugGameState {
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    arrows: number;
    runes: number;
    hearts: number;
    dead: boolean;
  };
  enemies: Array<{
    eid: number;
    kind: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    state: number;
    stateT: number;
    isGhost: boolean;
    leashX: number;
    leashY: number;
  }>;
  fog: {
    fogActive: boolean;
    fogAmbient: boolean;
    fogLeft: number;
    fogTimer: number;
    fogRadius: number;
    fogSpawned: boolean;
    fogWarned: boolean;
  };
  flags: {
    runes: number;
    snakeStarted: boolean;
    snakeDead: boolean;
    shrineIdx: number;
    hasSword: boolean;
    // ... все остальные флаги
  };
  map: {
    name: string;
    isDungeon: boolean;
    treeAltar: { x: number; y: number };
  };
  time: {
    elapsed: number;
    timeScale: number;
    paused: boolean;
  };
}
```

---

## Реализация

### Шаг 1: Debug API (интеграция с игрой)
- `src/game/debug-api.ts` — модуль, который собирает состояние из ECS
- Подписывается на события EventBus
- Экспонирует методы для изменения состояния
- Не зависит от сервера (можно использовать для React DevTools)

### Шаг 2: WebSocket сервер
- `src/game/debug-server.ts` — сервер на порту 3100
- Использует native `ws` или встроенный WebSocket из Vite
- Пересылает команды в игру через Debug API
- Периодически пушит состояние (10 FPS)

### Шаг 3: React Debug Panel
- `src/components/DebugPanel.tsx` — overlay поверх игры
- Подключается к WebSocket серверу
- Показывает:
  - Позиция игрока + HP
  - Список врагов с HP и состоянием
  - Состояние тумана
  - Кнопки: телепорт, спавн призраков, убить всех
  - Таймер ускорения времени

### Шаг 4: Интеграция в Vite
- Добавить порт 3100 в `vite.config.js`
- Автозапуск сервера при `npm run dev`
- Флаг `?debug` включает Debug Panel

---

## Приоритеты

1. **Блок 1: Базовый мониторинг** (1 час)
   - Debug API — сбор состояния
   - WebSocket — отправка состояния
   - React Panel — отображение данных

2. **Блок 2: Управление** (1 час)
   - Телепорт игрока
   - Спавн/удаление врагов
   - Установка HP

3. **Блок 3: Продвинутое** (1 час)
   - Ускорение времени
   - Пауза
   - Управление флагами
   - REST API

---

## Зависимости
- `ws` — WebSocket сервер (уже есть в node)
- Никаких новых UI библиотек — Tailwind CSS

---

## Итог
Этот сервер позволит:
- Видеть состояние игры без console.log
- Телепортировать игрока к алтарю
- Спавнить призраков в нужном месте
- Ускорять время для быстрого воспроизведения смерти
- Управлять флагами (snakeStarted, fogWaves и т.д.)
- Отлаживать без перезагрузки страницы
