# Анализ архитектуры VARDLOKKUR — Проблемы и рекомендации по SOLID

Проект — 2D top-down RPG с северо-скандинавской тематикой на PixiJS. Архитектура частично следует ECS-паттерну (9 систем в `system/`), но есть серьёзные нарушения SOLID.

---

## 🔴 Критические проблемы

### 1. Engine — God Class (~1180 строк)
**Нарушение: SRP (Single Responsibility Principle)**

`Engine` делает ВСЁ: инициализация PixiJS, ввод, физика, бой, AI, квесты, диалоги, HUD, туман, частицы, загрузка карт, спавн врагов, управление экранами, рендеринг всех сущностей, миникарта, таймер, эффекты.

**Что делать:**
- Вынести **input handling** в отдельный `InputSystem` (обработка клавиатуры, виртуальный джойстик, маппинг клавиш на события)
- Вынести **screen/state management** в `StateManager` (title → play → pause → death → victory, fade transitions)
- Вынести **entity lifecycle** (clearEntities, spawnEnemy, loadMap, ensureSpawnSafety) в `EntityManager`
- Вынести **map loading** (buildMapTextures, loadMap, minimap) в `MapManager`
- `Engine` должен остаться оркестратором: ~200 строк, создающий и связывающий системы

### 2. GameState — Mutable Shared State (162 строки)
**Нарушение: OCP (Open/Closed Principle) + SRP**

`GameState` — это мутациябельный объект со 100+ полями, который все системы читают и пишут напрямую. Это anti-pattern, заменяющий DI-контейнер.

**Что делать:**
- Разделить на **Domain Models** (Player, Enemy, Drop — immutable данные сущностей)
- Создать **GameStore** с инкапсулированным состоянием и методами `getState()`, `setState()`, `applyAction()`
- Системы должны получать только те данные, которые им нужны (dependency injection), а не весь GameState

### 3. Дубликат `event_bus.ts`
**Нарушение: DRY**

`src/game/event_bus.ts` (76 строк, generic EventBus + GameEvents) и `src/game/event-bus.ts` (30 строк, типизированный EventBus). Оба экспортируют `EventBus`, но с разной типизацией.

**Что делать:**
- Удалить `event_bus.ts` (старый, без типизации GameEvents)
- Оставить `event-bus.ts` (правильный, с `GameEvents` типизацией)
- Обновить все импорты

---

## 🟡 Средние проблемы

### 4. DialogueSystem — огромный switch/case (~238 строк)
**Нарушение: OCP (Open/Closed Principle)**

Каждый новый NPC требует модификации `dialogueFor()` и `applyDialogueEffects()` с их switch/case.

**Что делать:**
- Создать `DialogueDefinition` интерфейс: `{ id, name, lines: (flags) => string[], onEnd: (flags) => void }`
- Вынести диалоги в JSON или отдельный модуль `dialogues.ts` с декларативным описанием
- `DialogueSystem` станет thin dispatcher

### 5. DropsSystem.collectDrop — switch/case на 100 строк
**Нарушение: SRP + OCP**

`collectDrop` содержит всю бизнес-логику для каждого типа дропа + toast-сообщения.

**Что делать:**
- Создать `DropDefinition` с `onCollect(flags, player, bus)` callback
- Или использовать Strategy pattern: `DropHandler` interface

### 6. QuestSystem — смешение данных и логики (~323 строки)
**Нарушение: SRP**

`questDefs()`, `questDesc()`, `trackedTarget()` — всё в одном классе. `trackedTarget()` содержит switch/case на 75 строк с прямой работой координатами.

**Что делать:**
- Вынести описания квестов в `quest-definitions.ts` (декларативные данные)
- `QuestSystem` оставить только логику прогресса
- `QuestTracker` — отдельный класс для определения цели стрелки

### 7. Тесная связанность систем
**Нарушение: DIP (Dependency Inversion Principle)**

- `CombatSystem` зависит от `PhysicsSystem` (конкретный класс)
- `HudSystem` зависит от `QuestSystem` (конкретный класс)
- `DialogueSystem` зависит от `FxManager` (конкретный класс)
- `AISystem` зависит от `PhysicsSystem`

**Что делать:**
- Определить интерфейсы: `IPhysics`, `IFxManager`, `IQuestProvider`
- Системы зависят от интерфейсов, а не от конкретных классов
- Это позволит заменять реализации (например, другую физику) без изменения систем

---

## 🟢 Мелкие проблемы

### 8. Повторяющиеся утилиты
Функции `dist2`, `clamp`, `px` дублируются в каждом файле систем. Вынести в `src/game/utils.ts`.

### 9. `PhysicsSystem` использует `any`
```typescript
private state: any; // GameState, но без прямых импортов
```
Это нарушает безопасность типов. Заменить на строгий интерфейс `IPhysicsState`.

### 10. `entities.ts` смешивает данные и рендеринг (~966 строк)
Хотя файл пытается разделить IPlayerData/IEnemyData и рендереры, сами сущности (Player, Enemy, Projectile, Drop) содержат PixiJS `Graphics` (`g: Graphics`), что смешивает логику и представление.

**Что делать:**
- Сущности должны содержать только данные (x, y, hp, kind...)
- `Graphics` должен управляться рендерером, а не храниться в сущности
- Это позволит тестировать логику без PixiJS

### 11. `world.ts` — генерация мира (~1211+ строк)
Содержит IslandGenerator, VillageGenerator, GlobalRoadGenerator, NavBuilder — каждый из которых заслуживает отдельного файла.

---

## 📊 Итоговая таблица приоритетов

| # | Проблема | Нарушение | Сложность | Влияние |
|---|----------|-----------|-----------|---------|
| 1 | Engine — God Class | SRP | Высокая | Критическое |
| 2 | GameState — shared mutable state | OCP + SRP | Высокая | Критическое |
| 3 | Дубликат event_bus.ts | DRY | Низкая | Среднее |
| 4 | DialogueSystem switch/case | OCP | Средняя | Среднее |
| 5 | DropsSystem switch/case | OCP | Средняя | Среднее |
| 6 | QuestSystem смешение | SRP | Средняя | Среднее |
| 7 | Тесная связанность систем | DIP | Средняя | Высокое |
| 8-11 | Утилиты, any, entities, world | Разное | Низкая | Низкое |

---

## Рекомендуемый порядок рефакторинга

1. **#3** — Удалить дубликат `event_bus.ts` (быстро, безопасно)
2. **#8** — Вынести утилиты в `utils.ts` (быстро, безопасно)
3. **#7** — Определить интерфейсы для систем (IPhysics, IFxManager и т.д.)
4. **#1** — Разбор Engine на подсистемы (самый impactful)
5. **#2** — Рефакторинг GameState → GameStore
6. **#4, #5, #6** — Декларативные определения диалогов, дропов, квестов
7. **#10** — Отделить Graphics от сущностей
8. **#11** — Разбить world.ts на модули генерации
