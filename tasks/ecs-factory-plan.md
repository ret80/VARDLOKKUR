### 📋 Фаза 1: Создание ядра Фабрики (Foundation)
**Цель**: Создать центральный класс/модуль `EntityFactory`, который инкапсулирует логику создания ECS-сущностей, не загрязняя её кодом графики (PixiJS) или физики (Planck).

* **Целевые файлы**: 
  - `src/game/ecs/entity-factory.ts` (создать)
  - `src/game/ecs/ecs-components.ts` (только для чтения, чтобы знать компоненты)
* **Инструкция для ИИ-агента**:
  1. Создай файл `src/game/ecs/entity-factory.ts`.
  2. Экспортируй класс `EntityFactory`, который принимает в конструкторе `world: World` (из `bitecs`).
  3. Реализуй метод `createProjectile(kind: string, x: number, y: number, vx: number, vy: number, dmg: number, lifetime: number): number`. Внутри используй `addEntity` и `addComponents`, а затем заполни данные, как это сейчас сделано в `fireProjectileEcs` (используя `poolAdd` и `StringPool`).
  4. Реализуй метод `createDrop(kind: string, x: number, y: number): number` по аналогии с логикой из `ecs-bridge.ts` или `drops-system.ts`.
  5. Экспортируй экземпляр или фабричную функцию для инициализации.
* **Критерий успеха**: Файл создан, TypeScript компилируется (`tsc --noEmit` проходит без ошибок), методы возвращают корректный `eid` (Entity ID).

---

### 📋 Фаза 2: Рефакторинг системы боя (Combat System)
**Цель**: Устранить дублирование кода создания снарядов в `combat-system.ts`, перенаправив его в новую фабрику.

* **Целевые файлы**: 
  - `src/game/ecs/ecs-systems/combat-system.ts`
  - `src/game/ecs/ecs-game-loop.ts` (для передачи экземпляра фабрики, если нужно)
* **Инструкция для ИИ-агента**:
  1. Импортируй `EntityFactory` в `combat-system.ts`.
  2. Измени сигнатуры функций `axeThrowSystem`, `arrowShootSystem` и `fireProjectileEcs`, чтобы они принимали экземпляр `factory: EntityFactory` вместо `world: World` (или добавь его первым аргументом).
  3. Замени ручной вызов `addEntity` и `addComponents` внутри этих функций на вызов `factory.createProjectile(...)`.
  4. Убедись, что колбэк `onProjectileSpawn(eid)` (который создает графику) вызывается *после* получения `eid` из фабрики.
* **Критерий успеха**: В `combat-system.ts` больше нет прямых вызовов `addEntity` и `addComponents` для снарядов. Логика боя работает как раньше, но код стал короче на ~30-40 строк.

---

### 📋 Фаза 3: Рефакторинг моста ECS и внешних систем (Bridge & Map)
**Цель**: Отделить чистое создание ECS-сущности от навешивания графики и физики в `ecs-bridge.ts` и `ecs-map-loader.ts`.

* **Целевые файлы**: 
  - `src/game/ecs/entity-factory.ts` (дополнить)
  - `src/game/ecs/ecs-bridge.ts`
  - `src/game/ecs/ecs-map-loader.ts`
* **Инструкция для ИИ-агента**:
  1. В `EntityFactory` добавь метод `createEnemy(kind: EnemyKind, x: number, y: number, hp: number, radius: number, speed: number, dmg: number): number`. Используй логику из текущей функции `createEnemyEntity` или `createEnemyInEcs`, но *без* кода PixiJS и Planck.
  2. В `ecs-bridge.ts` перепиши функцию `createEnemyInEcs`. Теперь она должна:
     - Вызывать `factory.createEnemy(...)` для получения `eid`.
     - Затем добавлять компонент `Sprite`, регистрировать его в `SpriteRegistry`.
     - Затем вызывать `createBodyForEntity` для Planck.js.
  3. Проделай аналогичную операцию для `createPlayerInEcs`, `createChestInEcs` и т.д., если они создают сущности вручную.
* **Критерий успеха**: `ecs-bridge.ts` больше не содержит ручной инициализации массивов компонентов (типа `Position.x[eid] = x`). Он только координирует вызов Фабрики и последующее навешивание side-эффектов (графика/физика).

---

### 📋 Фаза 4: Интеграция с системой инициализации (Prefabs)
**Цель**: Активировать неиспользуемый потенциал `init-system.ts`, заставив Фабрику использовать префабы для мгновенного клонирования состояний (оптимизация).

* **Целевые файлы**: 
  - `src/game/ecs/ecs-systems/init-system.ts`
  - `src/game/ecs/entity-factory.ts`
* **Инструкция для ИИ-агента**:
  1. В `init-system.ts` убедись, что функции `createPlayerPrefab`, `createEnemyPrefabs` и т.д. сохраняют свои `eid` в экспортируемый объект или Map (например, `export const PREFABS = { player: eid, enemy_goblin: eid }`).
  2. В `EntityFactory` добавь метод `clonePrefab(prefabEid: number, x: number, y: number): number`.
  3. Реализуй логику клонирования: создай новый `eid`, пройди по всем компонентам, которые есть у `prefabEid` (можно использовать хелпер или явный список), и скопируй значения из массивов компонентов префаба в новый `eid`, перезаписав только `Position.x` и `Position.y`.
  4. Обнови методы `createEnemy` и `createProjectile` в Фабрике, чтобы они использовали `clonePrefab` вместо ручной настройки каждого поля.
* **Критерий успеха**: Создание новых сущностей требует минимума кода. Добавление нового поля в компонент автоматически подхватывается из префаба, если оно там инициализировано.

---

### 📋 Фаза 5: Очистка, документация и валидация
**Цель**: Удалить устаревший код, обновить документацию и убедиться в стабильности системы.

* **Целевые файлы**: 
  - `tasks/ecs-factory-plan.md`
  - Весь проект (для финальной проверки)
* **Инструкция для ИИ-агента**:
  1. Заполни файл `tasks/ecs-factory-plan.md` кратким описанием проделанной работы, архитектурными решениями и примером использования `EntityFactory`.
  2. Выполни глобальный поиск по репозиторию (`grep` или поиск в IDE) по паттернам `addEntity(world)` и `addComponents(world, eid`. Убедись, что они остались *только* внутри `entity-factory.ts` и `init-system.ts` (для создания самих префабов).
  3. Если в `ecs-game-loop.ts` или `fog-system.ts` остались ручные создания сущностей (например, спавн призраков), перенеси их в `EntityFactory` (метод `createFogGhost`).
  4. Запусти сборку проекта (`npm run build` или `npm run type-check`) и убедись в отсутствии ошибок TypeScript.
* **Критерий успеха**: 
  - Нулевое дублирование логики инициализации компонентов.
  - Файл `tasks/ecs-factory-plan.md` заполнен.
  - Проект успешно компилируется, линтер (`eslint`) не выдает ошибок.

