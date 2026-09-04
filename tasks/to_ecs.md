# План миграции VARDLOKKUR на bitECS

## Обзор

VARDLOKKUR — 2D top-down action-adventure игра на React + TypeScript + PixiJS + Planck.js.
Текущая архитектура использует "ECS-lite" паттерн: сущности — это plain TypeScript интерфейсы,
системы — standalone классы, коммуникация через EventBus.

bitECS — минималистичная, data-oriented ECS библиотека (~5kb minzipped) с поддержкой:
- Struct of Arrays (SoA) и Array of Structures (AoS) компонентов
- Query-based системы (без навязанного понятия "System")
- Relations (ChildOf, IsA, и кастомные)
- Observers (onAdd, onRemove, onSet, onGet)
- Prefabs с наследованием
- Hierarchical queries

---

## Фаза 0: Подготовка (безопасный старт)

### 0.1 Установка зависимости
```bash
npm i bitecs
```

### 0.2 Создание модуля ECS-обёртки
Создать `src/game/ecs/` с файлами:
- `ecs-world.ts` — инициализация мира bitECS
- `ecs-components.ts` — определение всех компонентов
- `ecs-utils.ts` — вспомогательные функции (createEntity, addComponents и т.д.)

### 0.3 Добавить флаг переключения
В `game-store.ts` добавить флаг `useECS: boolean`, по умолчанию `false`.
Это позволит включать/выключать ECS без удаления старого кода.

---

## Фаза 1: Определение компонентов (Mapping)

### 1.1 Компоненты сущностей (`src/game/ecs/components/entity-components.ts`)

| Текущий тип | Компонент bitECS | Формат | Описание |
|---|---|---|---|
| `Player` | `Player` | AoS | `level, exp, name` и т.д. |
| | `Position` | SoA | `x: Float32Array, y: Float32Array` |
| | `Velocity` | SoA | `x: Float32Array, y: Float32Array` |
| | `Health` | SoA | `current: number[], max: number[]` |
| | `Animation` | SoA | `frame, timer, state` |
| `Enemy` | `Enemy` | AoS | `kind, state, pathIndex` |
| | `EnemyData` | AoS | `hp, kind, behaviorState` |
| | `Path` | SoA | `waypoints: {x[], y[]}, currentIndex` |
| | `Target` | Relation | `TargetOf(enemyEid)` |
| `Projectile` | `Projectile` | AoS | `kind, damage, lifetime` |
| | `Velocity` | SoA | `x, y` |
| | `Lifetime` | SoA | `remaining: number[]` |
| `Drop` | `Drop` | AoS | `kind, magnet, lifetime` |
| | `Magnet` | SoA | `active: boolean[]` |

### 1.2 Компоненты мира/окружения
| Текущий тип | Компонент bitECS | Формат |
|---|---|---|
| Map tile | `Tile` | AoS | `type, solid` |
| Map tile body | `PhysicsBody` | AoS | `bodyRef: any` (Planck.js Body) |
| NPC | `NPC` | AoS | `kind, dialogueId, signature` |
| Chest | `Chest` | AoS | `opened: boolean[], lootTable` |
| Shrine | `Shrine` | AoS | `activated: boolean[]` |
| Pedestal | `Pedestal` | AoS | `hasItem: boolean[]` |
| Door | `Door` | AoS | `open: boolean[]` |

### 1.3 Компоненты графики
| Текущий тип | Компонент bitECS | Формат |
|---|---|---|
| `g: Graphics` | `Sprite` | SoA/AoS | `spriteRef: any` (PixiJS Sprite) |
| | `RenderLayer` | SoA | `layer: number[]` (z-order) |

> **Важно:** PixiJS Graphics/Sprite объекты хранятся как `any` в компонентах.
> Это допустимо — bitECS позволяет компоненты быть любым JS-объектом.

### 1.4 Relations (связи)
```typescript
// Иерархия: родитель -> дети
const ChildOf = createRelation({ autoRemoveSubject: true });

// Префабы: сущность -> тип
const IsA = getIsA(); // уже есть в bitECS

// Цель атаки: враг -> цель
const Targeting = createRelation({ exclusive: true });

// Содержимое инвентаря: инвентарь -> предмет
const Contains = createRelation({
  store: () => ({ amount: [] as number[] })
});
```

---

## Фаза 2: Базовые системы (ядро)

### 2.1 Система инициализации мира (`ecs-systems/init-system.ts`)
- Создание мира bitECS
- Регистрация компонентов
- Создание префабов (PlayerPrefab, EnemyPrefabs, и т.д.)
- Загрузка начальной карты (сущности тайлов, bodies)

### 2.2 Система ввода (`ecs-systems/input-system.ts`)
- Оставим как есть — InputSystem уже decoupled
- Вместо EventBus → component mutation:
  - `InputAction` компонент с флагами (jump, attack, interact)
  - InputSystem обновляет `InputAction` компоненты игроков

### 2.3 Система движения (`ecs-systems/movement-system.ts`)
```typescript
const movementSystem = (world: World) => {
  const { Position, Velocity } = world.components;
  const dt = world.time.delta / 1000;
  
  for (const eid of query(world, [Position, Velocity])) {
    Position.x[eid] += Velocity.x[eid] * dt;
    Position.y[eid] += Velocity.y[eid] * dt;
  }
};
```

### 2.4 Система физики (`ecs-systems/physics-system.ts`)
- Интеграция с Planck.js
- Обновление Planck.js body позиций из Position компонентов
- Collision detection через Planck.js contact listeners
- Collision → добавление `Collision` компонента на сущности

### 2.5 Система жизней и смерти (`ecs-systems/life-system.ts`)
```typescript
const lifeSystem = (world: World) => {
  for (const eid of query(world, [Health])) {
    if (Health.current[eid] <= 0) {
      addComponent(world, eid, Dead); // маркер для удаления
    }
  }
};

// Отдельный проход для удаления:
const cleanupDead = (world: World) => {
  for (const eid of query(world, [Dead])) {
    removeEntity(world, eid);
  }
};
```

---

## Фаза 3: Игровые системы

### 3.1 Combat System (`ecs-systems/combat-system.ts`)
- Sword/axe attacks → создание Projectile сущностей
- Projectile collision → damage через Health компонент
- Projectile lifetime → auto-removal через Lifetime компонент

### 3.2 AI System (`ecs-systems/ai-system.ts`)
- BehaviorRegistry → система, которая читает Enemy kind и применяет логику
- Path following → query(world, [Enemy, Path, Position])
- State machine → Enemy.state компонент

### 3.3 Drops System (`ecs-systems/drops-system.ts`)
- Spawn drops на смерть врага
- Magnet pull → velocity toward player
- Collection → proximity check (Position player vs Position drop)

### 3.4 Fog System (`ecs-systems/fog-system.ts`)
- Fog waves → создание FogWave сущностей
- Ghost spawning → создание Ghost сущностей с IsA(Enemy)

### 3.5 Interaction System (`ecs-systems/interaction-system.ts`)
- Proximity-based interaction с NPC, chests, shrines
- Chest opening → set Chest.opened[eid] = true

### 3.6 Quest System (`ecs-systems/quest-system.ts`)
- Quest tracking → Flag компонент на игроке
- Progression → observe(world, onSet(Flag), callback)

### 3.7 Dialogue System (`ecs-systems/dialogue-system.ts`)
- Dialogue state → DialogueState компонент
- NPC dialogue → query(world, [NPC, Position]) + proximity

---

## Фаза 4: Рендеринг

### 4.1 Render System (`ecs-systems/render-system.ts`)
- Заменяет текущий RenderSystem
- Каждый рендерер — функция, принимающая world + components
- Sprite компоненты содержат ссылки на PixiJS Sprite

```typescript
const renderSystem = (world: World, app: Application) => {
  const { Position, Sprite, RenderLayer } = world.components;
  
  for (const eid of query(world, [Position, Sprite, RenderLayer])) {
    const sprite = Sprite.ref[eid];
    sprite.x = Position.x[eid];
    sprite.y = Position.y[eid];
    sprite.alpha = RenderLayer.alpha ? RenderLayer.alpha[eid] : 1;
  }
  
  app.stage.children.sort((a, b) => {
    // sort by render layer
  });
  app.render();
};
```

### 4.2 Entity Renderers
Каждый текущий `*Renderer` (PlayerRenderer, EnemyRenderer и т.д.) →
функция-обработчик в RenderSystem, которая обновляет спрайты на основе компонентов.

### 4.3 Map Renderer
- Map tiles → Tile компоненты + Sprite компоненты
- query(world, [Tile, Sprite]) для рендеринга

---

## Фаза 5: Интеграция и Engine

### 5.1 Engine refactor (`src/game/engine.ts`)
- Создаётся ECS World в `init()`
- Все системы регистрируются как функции-пайплайны
- Главный цикл:
```typescript
const gameLoop = (world: World) => {
  inputSystem(world);
  movementSystem(world);
  physicsSystem(world);
  combatSystem(world);
  aiSystem(world);
  dropsSystem(world);
  fogSystem(world);
  questSystem(world);
  interactionSystem(world);
  lifeSystem(world);
  renderSystem(world, app);
  requestAnimationFrame(() => gameLoop(world));
};
```

### 5.2 Game Store integration
- GameStore → read-only source of truth для React UI
- ECS world → authoritative source для game entities
- HUD System → push state из ECS в GameStore для React

### 5.3 EventBus deprecation
- Постепенно заменяем EventBus на component-based коммуникацию
- Критические события (dialogue:start, screen:change) → остаются как события
- Game events → можно заменить на компоненты состояния

---

## Фаза 6: Оптимизация

### 6.1 SoA оптимизация
- Критические компоненты (Position, Velocity) → Float32Array
- Меньше критичные → number[] или AoS объекты

### 6.2 Query оптимизация
- Использовать `asBuffer` для hot paths
- Минимизировать количество query вызовов в кадре
- Group queries по common component sets

### 6.3 Memory management
- Entity ID recycling через Dead маркер
- Monitor aliveCount через world.entities.aliveCount

---

## Структура нового каталога

```
src/game/
  ecs/
    ecs-world.ts          # createWorld, time management
    ecs-components.ts     # все компоненты (экспортируются)
    ecs-prefabs.ts        # префабы сущностей
    ecs-utils.ts          # вспомогательные функции
    ecs-systems/
      init-system.ts
      input-system.ts
      movement-system.ts
      physics-system.ts
      life-system.ts
      combat-system.ts
      ai-system.ts
      drops-system.ts
      fog-system.ts
      interaction-system.ts
      quest-system.ts
      dialogue-system.ts
      render-system.ts
  engine.ts               # refactor: orchestrate ECS systems
  entities.ts             # ← можно удалить или оставить как data interfaces
  store/
    world-entities.ts     # ← можно удалить (данные в ECS)
```

---

## Риски иmitigation

| Риск | Mitigation |
|---|---|
| PixiJS Sprite management в SoA | Использовать AoS для Sprite компонент (`Sprite.ref: any[]`) |
| Planck.js Body привязка | Хранить `bodyRef: any` в компоненте PhysicsBody |
| EventBus → component transition | Dual-mode: оба работают параллельно, постепенно мигрируем |
| React UI sync | HUD System push-ит данные из ECS в GameStore |
| Сложность рефакторинга | Фазовый подход: сначала компоненты, потом системы, потом рендер |
| Performance regression | Benchmarks до/после, SoA для hot paths |

---

## Порядок выполнения (приоритеты)

1. **Фаза 0** — установка + обёртка + флаг переключения
2. **Фаза 1** — определение всех компонентов
3. **Фаза 2** — ядро: инициализация, движение, физика, жизни
4. **Фаза 3** — игровые системы (combat, AI, drops, fog, interaction, quest, dialogue)
5. **Фаза 4** — рендеринг
6. **Фаза 5** — интеграция с Engine и GameStore
7. **Фаза 6** — оптимизация

**Всего шагов: ~7 фаз, ~20-30 подзадач**

---

## Критерии завершения миграции

- [ ] Все сущности (Player, Enemy, Projectile, Drop, NPC, Chest, и т.д.) — ECS entities
- [ ] Все системы работают как ECS systems (query-based)
- [ ] Рендеринг работает через Sprite компоненты
- [ ] EventBus полностью заменён или отсутствует
- [ ] GameStore sync работает корректно (HUD, меню)
- [ ] Все карты загружаются корректно
- [ ] Перфоманс не хуже предыдущей версии
- [ ] Старый код entities.ts и world-entities.ts удалён
