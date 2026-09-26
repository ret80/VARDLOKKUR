# Отчёты о проделанной работе

### Анализ краша после смерти игрока (2026-09-26)
- **Статус:** Исправлена корневая причина
- **Измененные файлы:** 
  - `src/game/ecs/ecs-map-loader.ts` — удалён вызов `resetAllComponents()` из `clearWorld()`
- **Описание изменений:** 
  - **Корневая проблема:** `resetAllComponents()` очищал AoS-массивы, но `removeEntity` в bitecs уже очищает entityMasks. Это создавало потенциальную рассинхронизацию.
  - **Как работает bitecs:** 
    1. `removeEntity(world, eid)` → очищает `entityMasks[i][eid] = 0`
    2. `query(world, [Position, Velocity])` → проверяет masks, НЕ трогает AoS
    3. AoS-массивы — внешние, bitecs их не трогает
  - **Почему `resetAllComponents()` вреден:** Он очищает AoS после того как masks уже очищены. Если где-то сущность есть в masks, но AoS ещё не инициализирован — краш `Cannot read properties of undefined`.
  - **Решение:** Удалить `resetAllComponents()` — bitecs сам управляет жизненным циклом через masks. После `removeEntity` сущность не вернётся в `query()`.
- **Следующие шаги:** Проверить игру — краш после смерти игрока должен исчезнуть

### Этап 1: Архитектурный переход на AoS (Array of Structures) и регистрация в `bitecs`
- **Статус:** Выполнено
- **Измененные файлы:** 
  - `src/game/ecs/ecs-components.ts` — все компоненты переписаны с SoA (Float32Array/Uint8Array) на AoS (aos())
  - `src/game/ecs/ecs-world.ts` — добавлена регистрация компонентов через registerComponents()
  - `src/game/ecs/index.ts` — удалены setSoA/getSoA из экспортов
- **Описание изменений:** 
  - Все компоненты переписаны с SoA на AoS с использованием `aos()` из bitecs
  - Компоненты регистрируются при создании мира через `registerComponents(world, [components])`
  - Созданы AoS-компоненты: Position, Velocity, Health, Radius, Time, Direction, RenderLayer, Player, Enemy, Projectile, Drop, NPC, Chest, Pedestal, Shrine, Door, Barrier, Altar, MapState, Dead, Hidden, Taken, Magnet, Moving, Attacking, Aiming, Frozen, Flashing, Slowed, Returning, ShrineLit, EnemyAI, Sprite, PhysicsBody
  - Маркерные компоненты (Dead, Hidden, etc.) зарегистрированы через aos<{}>()
  - Обновлена функция resetAllComponents() для очистки AoS-массивов
  - Обновлены ECS-хелперы для здоровья (damageEntityEcs, healEntityEcs, fullHealEntityEcs, increaseMaxHpEcs)
  - Удалены вспомогательные функции setSoA, getSoA, setSoANum, getSoANum, setSoAString, getSoAString, setSoAObject, getSoAObject
- **Следующие шаги:** Этап 2 — Устранение мира префабов (Prefab World) и клонирования из entity-factory.ts

### Этап 2: Удаление prefabWorld и клонирования
- **Статус:** Не начат
- **Планируемые изменения:** 
  - Удалить prefabWorld из entity-factory.ts
  - Убрать клонирование сущностей
  - Обновить entity-factory.ts под AoS

### Этап 3: Обновление ECS-систем под AoS
- **Статус:** В процессе
- **Осталось файлов:** 16 файлов с ошибками (всего ~1526 ошибок)
- **Основные файлы:**
  - `src/game/ecs/ecs-systems/ai-system.ts` (472 ошибки)
  - `src/game/ecs/entity-factory.ts` (318 ошибок)
  - `src/game/ecs/ecs-systems/combat-system.ts` (205 ошибок)
  - `src/game/renderers/ecs-mappers.ts` (69 ошибок)
  - `src/game/ecs/ecs-game-loop.ts` (62 ошибки)
  - и другие...

### Этап 4: Рефакторинг debug-api.ts
- **Статус:** Выполнено
- **Изменения:** Все обращения к компонентам обновлены на AoS синтаксис (Position[eid].x вместо Position.x[eid])

### Этап 5: Обновление ecs-bridge.ts и финальная очистка
- **Статус:** Выполнено
- **Изменения:** Все вспомогательные функции обновлены на AoS синтаксис

---

### Исправление краша после смерти игрока (2026-09-26)

#### Часть 1: Корневая причина — `resetAllComponents()`

- **Статус:** Исправлена
- **Измененные файлы:** 
  - `src/game/ecs/ecs-map-loader.ts` — удалён вызов `resetAllComponents()` из `clearWorld()` и его импорт
- **Описание изменений:** 
  - **Корневая проблема:** `resetAllComponents()` очищал AoS-массивы (`array.length = 0`), но `removeEntity` в bitecs уже очищает entityMasks. Это создавало рассинхронизацию между bitecs masks и AoS-массивами.
  - **Как работает bitecs:**
    1. `removeEntity(world, eid)` → устанавливает `entityMasks[i][eid] = 0`
    2. `query(world, [Position, Velocity])` → проверяет masks. Если mask = 0, сущность НЕ возвращается
    3. AoS-массивы (`Position`, `Velocity` и т.д.) — внешние JS-массивы. Bitecs их **не трогает**
  - **Почему `resetAllComponents()` вреден:** Он очищает AoS после того как masks уже очищены. Если где-то сущность есть в masks, но AoS ещё не инициализирован — краш `Cannot read properties of undefined`.
  - **Почему это не нужно:** После `removeEntity` masks = 0 → `query()` вернёт пустой результат для этой сущности. AoS-данные мёртвых сущностей не нужны. При новой карте: `removeEntity` всех → masks все = 0 → новые сущности создаются с нуля через `addEntity` + `addComponents`.
  - **Решение:** Удалить `resetAllComponents()` — bitecs сам управляет жизненным циклом через masks.

#### Часть 2: Защита от рассинхронизации masks/AoS в ECS-системах

- **Статус:** Выполнено
- **Измененные файлы:**
  - `src/game/ecs/ecs-game-loop.ts` — защита в блоке движения сущностей без физики (строка 503)
  - `src/game/ecs/ecs-systems/physics-system.ts` — 6 функций
  - `src/game/ecs/ecs-systems/combat-system.ts` — 3 функции
  - `src/game/ecs/ecs-systems/drops-system.ts` — 1 функция
  - `src/game/ecs/ecs-systems/life-system.ts` — 4 функции
  - `src/game/debug/debug-api.ts` — 3 функции
- **Описание изменений:**
  Добавлена защита `if (!component[eid]) continue` во всех местах, где `query()` возвращает сущность, но AoS-элемент может быть `undefined`:

  **physics-system.ts:**
  - `syncPositionToBody()` — проверка `Position[eid]` перед чтением x/y
  - `syncVelocityToBody()` — проверка `Velocity[eid]` перед чтением x/y
  - `syncBodyToPosition()` — проверка `Position[eid]` перед записью x/y
  - `createBodyForEntity()` — проверка `Position[eid]` перед созданием физического тела
  - `checkEntityOverlap()` — проверка `Position[eid]` и `Radius[eid]` для проверяемой сущности и всех кандидатов
  - `findOverlappingEntities()` — аналогичная защита

  **combat-system.ts:**
  - `projectileUpdateSystem()` — локализация `Position`, `Velocity`, `Projectile`, `Time` в переменные с проверкой на undefined
  - `projectileEnemyCollisionSystem()` — проверка всех Position/Radius перед вычислением дистанции
  - `updateProjectilesEcs()` — полная перепись с локализацией компонентных данных в локальные переменные и проверкой на undefined

  **drops-system.ts:**
  - `dropsUpdateSystem()` — проверка `Position`, `Drop`, `Time` перед каждой операцией

  **life-system.ts:**
  - `lifeCheckSystem()` — проверка `Health[eid]` перед чтением current
  - `magnetSystem()` — проверка `Position` и `Velocity` для дропов
  - `returningProjectileSystem()` — проверка `Position`, `Velocity`, `Projectile` для возвращающихся снарядов
  - `stateTimerSystem()` — проверка `Player` и `Enemy` перед чтением таймеров

  **debug-api.ts:**
  - `getEnemiesState()` — проверка `Enemy`, `Position`, `Health` для каждого врага
  - `getDropsState()` — проверка `Drop`, `Position` для каждого дропа
  - `getProjectilesState()` — проверка `Projectile`, `Position`, `Velocity` для каждого снаряда

- **Технические детали:**
  - Вместо прямого доступа `Position[eid].x` используется `const pos = Position[eid]; if (!pos) continue; pos.x`
  - Это защищает от крашей при любой рассинхронизации bitecs masks и AoS-массивов
  - Все изменения проверены через `tsc --noEmit` — компиляция проходит без ошибок

- **Следующие шаги:** Проверить игру — краш после смерти игрока должен исчезнуть.

