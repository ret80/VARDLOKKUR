# Task_06 — Inventory legacy code after GameState → GameStore migration

Часть рефакторинга task_01 пункт #2 (GameState → GameStore + Domain Models).
Продолжение task_03, task_04, task_05.

---

## 📊 Текущее состояние

Рефакторинг GameState → GameStore **завершён функционально**. Все системы работают через `GameStore`.
`GameState` и связанные типы больше **нигде не импортируются** и являются мёртвым кодом.

---

## 🔴 LEGACY: `src/game/game-states.ts`

Файл содержит как **активные**, так и **мертвые** экспорты.

### ✅ Активные экспорты (НЕ трогать)

| Экспорт | Где используется | Назначение |
|---------|-----------------|------------|
| `GameEvents` | `event-bus.ts` | Типизированные события игры |
| `ProjectileRt` | `engine.ts` (строка 196), `combat-system.ts` (строка 9) | Runtime-тип снаряда (данные + Graphics) |
| `DropRt` | `engine.ts` (строка 197), `drops-system.ts` (строка 7) | Runtime-тип дропа (данные + Graphics) |

### ❌ Мёртвые экспорты (удалить)

| Экспорт | Строки | Причина | Заменён на |
|---------|--------|---------|-----------|
| `ChestRt` | 83-87 | Никто не импортирует из game-states.ts | `store/game-store.ts` → `store/index.ts` |
| `PedestalRt` | 89-96 | Никто не импортирует из game-states.ts | `store/game-store.ts` → `store/index.ts` |
| `ShrineRt` | 98-101 | Никто не импортирует из game-states.ts | `store/game-store.ts` → `store/index.ts` |
| `NpcRt` | 103-107 | Никто не импортирует из game-states.ts | `store/game-store.ts` → `store/index.ts` |
| `DoorRt` | 109-114 | Никто не импортирует из game-states.ts | `store/game-store.ts` → `store/index.ts` |
| `FloatText` | 116 | Никто не импортирует из game-states.ts | `store/game-store.ts` (строка 78) |
| `GameState` | 118-174 | **Главный legacy** — никто не импортирует | `GameStore` в `store/game-store.ts` |

**Итого мёртвых экспортов: 7**

---

## 🔴 LEGACY: `src/game/store/models.ts`

Файл полностью мёртвый. Ни один интерфейс **нигде не импортируется** за пределами самого файла.

| Экспорт | Где используется | Причина |
|---------|-----------------|---------|
| `PlayerModel` | Только `player-domain.ts` (строка 4, импортирует для `toModel()`) | Системы не получают PlayerModel — они получают `Player` напрямую |
| `EnemyModel` | Никогда | Никогда не импортировался |
| `DropModel` | Никогда | Никогда не импортировался |
| `ProjectileModel` | Никогда | Никогда не импортировался |

**Строк мёртвого кода: 80**

> **Примечание:** `PlayerDomain.toModel()` (строка 201-214 в player-domain.ts) возвращает `PlayerModel`, но этот метод **нигде не вызывается**. Модели созданы для будущей ECS-архитектуры (task_04 шаг 6), но никогда не были интегрированы.

---

## 🟡 ЧАСТИЧНО LEGACY: дубликаты типов

### `ProjectileRt` и `DropRt` в `game-states.ts` vs `world-entities.ts`

| Тип | game-states.ts | world-entities.ts | Где используется |
|-----|---------------|-------------------|-----------------|
| `ProjectileRt` | ✅ Импорт в engine.ts, combat-system.ts | ✅ Определён, экспортируется через store/index.ts | Импорт идёт из **game-states.ts** |
| `DropRt` | ✅ Импорт в engine.ts, drops-system.ts | ✅ Определён, экспортируется через store/index.ts | Импорт идёт из **game-states.ts** |

**Рекомендация:** Постепенно перевести импорты на `store/index.ts` (из `world-entities.ts`), чтобы убрать дублирование.
Но это **не критично** — типы идентичны.

---

## 🟡 ЧАСТИЧНО LEGACY: локальные интерфейсы в engine.ts

`engine.ts` определяет свои собственные локальные интерфейсы (строки 77-83), которые дублируют типы из `game-store.ts`:

```typescript
// engine.ts, строки 77-83
interface FloatText { txt: Text; life: number }
interface ChestRt { x: number; y: number; item: string; opened: boolean; g: Graphics }
interface PedestalRt { id: string; x: number; y: number; taken: boolean; guardsLeft: number; guardsSpawned: boolean; g: Graphics }
interface ShrineRt { x: number; y: number; g: Graphics }
interface NpcRt { id: string; name: string; x: number; y: number; g: Graphics }
interface DoorRt { x: number; y: number; open: number; locked: boolean; g: Graphics }
```

**Статус:** Эти интерфейсы локальны для engine.ts и не конфликтуют с экспортами.
Но они **дублируют** типы из `store/game-store.ts`. Можно заменить на импорты из `store/index.ts`.

---

## 📋 Сводная таблица legacy-кода

| Файл | Что legacy | Строк | Приоритет | Риск удаления |
|------|-----------|-------|-----------|--------------|
| `game-states.ts` | `GameState`, `ChestRt`, `PedestalRt`, `ShrineRt`, `NpcRt`, `DoorRt`, `FloatText` | ~56 | 🔴 Критично | Низкий (0 импортеров) |
| `store/models.ts` | Весь файл (4 интерфейса) | 80 | 🟡 Средний | Низкий (0 импортеров) |
| `engine.ts` (локальные) | 6 дублирующих интерфейсов | 7 | 🟢 Низкий | Низкий (локальные) |

---

## 📋 План очистки

### Шаг 1: Удалить мёртвые экспорты из `game-states.ts`

**Файл:** `src/game/game-states.ts`

Удалить строки 7-8, 83-116 (7 интерфейсов). Оставить:
- `GameEvents` (строки 20-77)
- `ProjectileRt` (строки 8-10) — пока активен
- `DropRt` (строки 12-14) — пока активен

**Результат:** файл сократится с 174 до ~78 строк.

**Риск:** Минимальный. 0 файлов импортируют эти типы.

---

### Шаг 2: Удалить `store/models.ts`

**Файл:** `src/game/store/models.ts`

Удалить весь файл.

**Обновить `store/index.ts`:** Удалить экспорт `PlayerModel`, `EnemyModel`, `DropModel`, `ProjectileModel` (строки 51-56).

**Обновить `player-domain.ts`:** Удалить импорт `PlayerModel` (строка 4) и метод `toModel()` (строки 201-214).

**Риск:** Низкий. Ни один внешний файл не импортирует эти типы.

---

### Шаг 3 (отложено): Убрать дублирование ProjectileRt/DropRt

**Файлы:** `engine.ts`, `combat-system.ts`, `drops-system.ts`

Заменить:
```typescript
// Было
import { ProjectileRt, DropRt } from "./game-states";

// Стало
import { type ProjectileRt, type DropRt } from "./store";
```

**Риск:** Низкий. Типы идентичны.

---

### Шаг 4 (отложено): Заменить локальные интерфейсы в engine.ts

**Файл:** `src/game/engine.ts`

Заменить локальные интерфейсы (строки 77-83) на импорты из `store/index.ts`:
```typescript
import { type ChestRt, type PedestalRt, type ShrineRt, type NpcRt, type DoorRt, type FloatText } from "./store";
```

Удалить локальные определения (строки 77-83).

**Риск:** Низкий. Типы идентичны.

---

## ✅ Критерии завершения

- [ ] `game-states.ts` не экспортирует `GameState`, `ChestRt`, `PedestalRt`, `ShrineRt`, `NpcRt`, `DoorRt`, `FloatText`
- [ ] `store/models.ts` удалён
- [ ] `store/index.ts` не экспортирует `PlayerModel`, `EnemyModel`, `DropModel`, `ProjectileModel`
- [ ] `player-domain.ts` не импортирует и не использует `PlayerModel`
- [ ] `npx tsc --noEmit` проходит без ошибок
- [ ] `npm run dev` работает корректно

---

## ⚠️ Риски

1. **Миграция на GameStore не полная** — если где-то остался неприметный импорт `GameState`, удаление сломает сборку. Но `grep` показал 0 импортеров.

2. **models.ts для будущей ECS** — модели были созданы для шага 6 (task_04), который был помечен как "отложено". Если решено продолжить ECS-архитектуру, models.ts нужно будет восстановить. Но текущий план — оставить Player как источник правды.

3. **Дублирование ProjectileRt/DropRt** — пока не критично, но лучше убрать для чистоты.

---

## 📊 Оценка объёма

| Шаг | Файл | Изменений | Сложность |
|-----|------|-----------|-----------|
| 1 | `game-states.ts` | -56 строк (7 экспортов) | Низкая |
| 2 | `store/models.ts` | -80 строк (удалить файл) | Низкая |
| 2b | `store/index.ts` | -6 строк (экспорты) | Низкая |
| 2c | `player-domain.ts` | -16 строк (импорт + toModel) | Низкая |
| 3 | 3 файла | ~3 импорта | Низкая |
| 4 | `engine.ts` | ~7 строк (импорт вместо локальных) | Низкая |
| **Итого** | | **~168 строк удалено** | **Низкая** |
