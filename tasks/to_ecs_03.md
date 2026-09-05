Изучила файл анализа. Он дал более полную картину: часть подсистем уже выделена в отдельные классы (`StateManager`, `InputSystem`, `DialogueSystem`, `HudSystem`, `QuestSystem`, `PlanckWorld`), и у `EventBus` уже есть метод `off()`. Это меняет приоритеты — фокус смещается с создания (уже создано) на доработку и очистку.

Вот подробный, пошаговый план с конкретными классами, файлами и действиями.

---

## Фаза 1. Разрыв циклических зависимостей и централизация типов

### 1.1. Создать `src/game/models.ts` — центральный модуль типов

**Создать новый файл** `src/game/models.ts` и перенести в него следующие типы из `engine.ts`:

| Тип | Откуда перенести | Кому нужен |
|-----|-----------------|-----------|
| `Screen` | `engine.ts` | `store/game-store.ts`, `state/state-manager.ts`, `App.tsx` |
| `HudData` | `engine.ts` | `hud/hud-system.ts`, `App.tsx` |
| `DialogueData` | `engine.ts` | `dialogue/dialogue-system.ts`, `dialogues.ts`, `App.tsx` |
| `Stats` | `engine.ts` | `hud/hud-system.ts` |
| `EngineCallbacks` | `engine.ts` | `App.tsx`, `store/game-store.ts` |
| `VirtualInput` | `engine.ts` | `input/input-system.ts`, `ecs/ecs-game-loop.ts` |

**Действия в `engine.ts`:**
- Удалить определения этих типов
- Добавить `export * from './models'` для обратной совместимости
- Или, что лучше — обновить все импорты в зависимых файлах на `from '../models'`

**Действия в `store/game-store.ts`:**
- Заменить `import { Screen } from '../engine'` → `import { Screen } from '../models'`

**Действия в `dialogues.ts`:**
- Заменить `import { DialogueData } from './engine'` → `import { DialogueData } from './models'`

### 1.2. Перенести `QuestView` из `types.ts` в `models.ts`

**Действия:**
- Перенести интерфейс `QuestView` из `src/game/types.ts` в `src/game/models.ts`
- Обновить все импорты: `from './types'` и `from '../types'` → `from './models'` / `from '../models'`
- **Удалить файл** `src/game/types.ts` (он содержит только `QuestView`)

### 1.3. Проверить и исправить оставшиеся циклы

**Проверить через `madge --circular src/`:**
- `engine.ts` → `store/game-store.ts` → `engine.ts` (после 1.1 должен разорваться)
- `dialogues.ts` → `engine.ts` → `dialogues.ts` (после 1.1 должен разорваться)
- `quest-targets.ts` → `engine.ts` (использует `require()` — см. Фазу 4.2)

---

## Фаза 2. Устранение дублирования состояния

### 2.1. Удалить дублирование флагов между `Engine` и `FlagDomain`

**Текущее состояние:**
- `Engine` хранит `private flags: GameFlags` (plain object)
- `GameStore` хранит `FlagDomain` (инкапсулированная модель)
- Код в `engine.ts` напрямую мутирует `this.flags.hasSword = true` и т. д.

**Действия:**

1. В `engine.ts` **удалить поле** `private flags: GameFlags`
2. Все обращения `this.flags.*` заменить на `this.store.flags.*` (через методы `FlagDomain`)
3. Прямые мутации заменить на вызовы методов:

| Было в `engine.ts` | Стало |
|---------------------|-------|
| `this.flags.hasSword = true` | `this.store.flags.setSword(true)` |
| `this.flags.hasAxe = true` | `this.store.flags.setAxe(true)` |
| `this.flags.hasBow = true` | `this.store.flags.setBow(true)` |
| `this.flags.hasHammer = true` | `this.store.flags.setHammer(true)` |
| `this.flags.arrows = N` | `this.store.flags.setArrows(N)` |
| `if (this.flags.hasSword)` | `if (this.store.flags.hasSword)` |

4. Если в `FlagDomain` не хватает методов-сеттеров — **добавить их**. Проверить, что `FlagDomain` уже имеет: `hasItem`, `hasEnhancement`, `getArrows`. Добавить: `setSword`, `setAxe`, `setBow`, `setHammer`, `setArrows`, `addItem`, `removeItem` (если отсутствуют).

5. В `startGame()` сброс флагов: заменить прямую инициализацию объекта на `this.store.flags.reset()` (метод `reset()` добавить в `FlagDomain`, если отсутствует).

### 2.2. Удалить дублирование состояния игрока

**Текущее состояние:**
- `Engine` хранит `private player: IPlayerData` (plain object)
- `GameStore` хранит `PlayerDomain` (инкапсулированная модель)
- ECS хранит `Player`-компонент (SoA: `moving`, `animT`, `swingT`, `hurtT`, `slowT`, `hasSword`, `runes` и т. д.)

**Действия:**

1. В `engine.ts` **удалить поле** `private player: IPlayerData`
2. Все обращения `this.player.*` заменить на `this.store.player.*` (через `PlayerDomain`)
3. Прямые мутации заменить на вызовы методов `PlayerDomain`:

| Было | Стало |
|------|-------|
| `this.player.hp -= dmg` | `this.store.player.takeDamage(dmg)` |
| `this.player.hp += heal` | `this.store.player.heal(heal)` |
| `this.player.swingT = 0` | `this.store.player.setSwingT(0)` |
| `this.player.hurtT = 0.3` | `this.store.player.setHurtT(0.3)` |

4. Если в `PlayerDomain` не хватает методов — **добавить их**. Проверить, что `PlayerDomain` уже имеет: `takeDamage`, `heal`. Добавить сеттеры для таймеров: `setSwingT`, `setHurtT`, `setSlowT`, `setAnimT` (если отсутствуют).

5. В `respawn()` — использовать `PlayerDomain.reset()` вместо прямой мутации.

### 2.3. Удалить дублирование `getEnemyStats`

**Текущее состояние** — статистика врагов определена в трёх местах:
- `engine.ts` — `private getEnemyStats(kind)` (private метод)
- `ecs/ecs-bridge.ts` — своя `getEnemyStats(kind)` (private функция)
- `entities.ts` — `ENEMY_STATS` (экспортируемый объект)

**Действия:**

1. В `engine.ts` — **удалить** метод `getEnemyStats()`, заменить все вызовы на `import { ENEMY_STATS } from './entities'` и доступ `ENEMY_STATS[kind]`
2. В `ecs/ecs-bridge.ts` — **удалить** функцию `getEnemyStats()`, заменить на `import { ENEMY_STATS } from '../entities'`
3. Оставить единственный источник истины: `ENEMY_STATS` в `entities.ts`

---

## Фаза 3. Декомпозиция `engine.ts` (God Object)

### 3.1. Вынести `ViewportController`

**Создать класс** `src/game/engine/viewport-controller.ts`:

```typescript
export class ViewportController {
  constructor(private app: Application, private world: Container) {}
  applyViewSize(w: number, h: number): void { /* ... */ }
  applyView(x: number, y: number): void { /* ... */ }
  getZoom(): number { return ZOOM; }
  resize(w: number, h: number): void { /* ... */ }
}
```

**Перенести из `engine.ts`:**
- Метод `applyViewSize()`
- Метод `applyView()`
- Константу `ZOOM`
- Логику камеры в `tick()` (строки, где вызывается `applyView`)

**В `engine.ts`:** заменить на `this.viewport.applyView(...)`.

### 3.2. Вынести `SceneManager`

**Создать класс** `src/game/engine/scene-manager.ts`:

```typescript
export class SceneManager {
  tileLayer: Container;
  world: Container;
  dynamic: Container;
  fxWorld: Container;
  floatLayer: Container;
  fxScreen: Container;
  fadeG: Graphics;

  constructor(app: Application) { /* создать все контейнеры, добавить в stage */ }
  resize(w: number, h: number): void { /* ... */ }
  destroy(): void { /* удалить все контейнеры */ }
}
```

**Перенести из `engine.ts`:**
- Создание всех слоёв: `tileLayer`, `world`, `dynamic`, `fxWorld`, `floatLayer`, `fxScreen`, `fadeG`
- Логику добавления контейнеров в `app.stage`
- Методы, связанные с очисткой слоёв при загрузке новой карты

**В `engine.ts`:** заменить `this.tileLayer` → `this.scene.tileLayer` и т. д.

### 3.3. Вынести `MapLoaderService`

**Создать класс** `src/game/engine/map-loader-service.ts`:

```typescript
export class MapLoaderService {
  constructor(
    private scene: SceneManager,
    private store: GameStore,
    private ecsWorld: World,
    private bus: EventBus
  ) {}

  async loadMap(data: WorldData): Promise<void> { /* из loadMap() */ }
  async loadMapEcs(data: WorldData): Promise<void> { /* из loadMapEcs() */ }
  buildTileTextures(): void { /* построение тайловых текстур */ }
  clearTiles(): void { /* очистка tileLayer + уничтожение текстур */ }
}
```

**Перенести из `engine.ts`:**
- Метод `loadMap()` целиком
- Метод `loadMapEcs()` целиком
- Логику создания `EcsMapLoader`
- Логику построения `mmBase` (для миникарты)
- Логику обновления `this.store.setMap()` / `this.store.setOw()`

**В `engine.ts`:** заменить на `await this.mapLoader.loadMapEcs(data)`.

### 3.4. Вынести `PlayerLifecycle`

**Создать класс** `src/game/engine/player-lifecycle.ts`:

```typescript
export class PlayerLifecycle {
  constructor(
    private store: GameStore,
    private state: StateManager,
    private bus: EventBus,
    private ecsWorld: World
  ) {}

  respawn(): void { /* из Engine.respawn() */ }
  useStoredHeart(): void { /* из Engine.useStoredHeart() */ }
  resetPlayerFlags(): void { /* сброс флагов при респавне */ }
  initPlayerDomain(): void { /* инициализация PlayerDomain */ }
}
```

**Перенести из `engine.ts`:**
- Метод `respawn()`
- Метод `useStoredHeart()`
- Логику сброса флагов при респавне
- Инициализацию `PlayerDomain`

**В `engine.ts`:** заменить на `this.playerLifecycle.respawn()`.

### 3.5. Вынести `ScreenRouter`

**Создать класс** `src/game/engine/screen-router.ts`:

```typescript
export class ScreenRouter {
  constructor(
    private state: StateManager,
    private bus: EventBus,
    private store: GameStore
  ) {}

  handlePause(): void { /* из Engine */ }
  handleInventory(): void { /* из Engine */ }
  handleQuests(): void { /* из Engine */ }
  handleSnow(): void { /* из Engine */ }
  closeOverlay(): void { /* из Engine */ }
  setScreen(screen: Screen): void { /* из Engine */ }
}
```

**Перенести из `engine.ts`:**
- Метод `handlePause()`
- Метод `handleInventory()`
- Метод `handleQuests()`
- Метод `handleSnow()`
- Метод `closeOverlay()`
- Метод `setScreen()`

**В `engine.ts`:** заменить на делегирование `this.screenRouter.handlePause()`.

### 3.6. Устранить пересоздание `EcsGameLoop`

**Текущее состояние:** `loadMapEcs()` строки 609–647 полностью пересоздаёт `EcsGameLoop` через `createEcsGameLoop()` при каждой загрузке карты.

**Действия:**

1. В `ecs/ecs-game-loop.ts` **добавить метод** `updateConfig(config: Partial<EcsGameLoopConfig>): void`:
   ```typescript
   updateConfig(config: Partial<EcsGameLoopConfig>): void {
     if (config.planckWorld) this.config.planckWorld = config.planckWorld;
     if (config.map) this.config.map = config.map;
     if (config.playerEid !== undefined) this.config.playerEid = config.playerEid;
     // ... остальные поля
   }
   ```

2. В `EcsGameLoop` **добавить метод** `setPlanckWorld(world: PlanckWorld): void` (если ещё не существует — анализ говорит, что он есть в интерфейсе, проверить реализацию)

3. В `engine.ts` — заменить пересоздание на `this.ecsGameLoop.updateConfig({ planckWorld, map, playerEid })`

### 3.7. Результат: `Engine` после декомпозиции

**`Engine` остаётся тонким оркестратором (~200–300 строк):**

```typescript
export class Engine {
  private app: Application;
  private bus: EventBus;
  private store: GameStore;
  private state: StateManager;
  private input: InputSystem;
  private quests: QuestSystem;
  private dialogue: DialogueSystem;
  private hud: HudSystem;
  private audio: AudioEngine;
  private fx: FxManager;

  // Новые подсистемы:
  private viewport: ViewportController;
  private scene: SceneManager;
  private mapLoader: MapLoaderService;
  private playerLifecycle: PlayerLifecycle;
  private screenRouter: ScreenRouter;

  private ecsWorld: World;
  private ecsGameLoop: EcsGameLoop;

  // Методы:
  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) { /* создание подсистем */ }
  startGame(): void { /* инициализация + первая загрузка карты */ }
  tick(rdt: number): void { /* делегирование в ecsGameLoop.tick() + viewport + hud */ }
  destroy(): void { /* очистка всех подсистем */ }
}
```

---

## Фаза 4. Типобезопасность

### 4.1. Заменить `any` в `EventBus`

**Текущее состояние** (по анализу): типы событий содержат `any` (`enemy: any`, `kind: any`, `g: any`, `screen: any`).

**Действия в `event-bus.ts`:**

| Поле события | Было | Стало |
|-------------|------|-------|
| `enemy` | `any` | `number` (eid) |
| `kind` | `any` | `EnemyKind` (импорт из `generators/types`) |
| `g` | `any` | `Graphics` (из `pixi.js`) |
| `screen` | `any` | `Screen` (из `models.ts`) |
| `data` (в `hud:dirty`) | `any` | `HudData` (из `models.ts`) |

**Действия в файлах, слушающих события:**
- Проверить, что все обработчики корректно типизированы
- Если обработчик использует `any` — заменить на конкретный тип

### 4.2. Удалить `require()` в ES-модулях

**Текущее состояние:**
- `quest-targets.ts` (строки 19, 31) — использует `require()` внутри ES-модуля
- `engine.ts` (строки 172, 181) — использует `require()`

**Действия в `quest-targets.ts`:**
- Заменить `const X = require('...')` на статический `import X from '...'` в начале файла
- Если циклическая зависимость — после Фазы 1 она должна быть разорвана, и статический импорт сработает

**Действия в `engine.ts`:**
- Заменить `require()` на статический `import` в начале файла
- Если это lazy-loading для избежания цикла — после Фазы 1 использовать обычный импорт

### 4.3. Убрать dynamic `import()` в горячем пути

**Текущее состояние** в `engine.ts` — метод `float()` при каждом вызове динамически импортирует модули:

```typescript
private float(x, y, text, color) {
  import('./ecs/ecs-systems/render-system').then(({ addFloatText }) => {
    import("pixi.js").then(({ Text }) => {
      addFloatText(this.floatLayer, { createText: (t, s) => new Text({ ...s, text: t }) }, x, y, text, color);
    });
  });
}
```

**Действия в `engine.ts`:**
1. Добавить в начале файла:
   ```typescript
   import { addFloatText } from './ecs/ecs-systems/render-system';
   import { Text } from 'pixi.js';
   ```
2. Переписать `float()`:
   ```typescript
   private float(x: number, y: number, text: string, color: number) {
     addFloatText(this.scene.floatLayer, { createText: (t, s) => new Text({ ...s, text: t }) }, x, y, text, color);
   }
   ```

### 4.4. Типизировать поля `Engine`

| Поле в `engine.ts` | Было | Стало |
|---------------------|------|-------|
| `this.ecsWorld` | `any` | `World<WorldContext>` (из `bitecs`) |
| `this.ecsPlayerBody` | `any` | `Body` (из `planck-js`) |
| `this.ecsGameLoop` | `EcsGameLoop` (интерфейс) | Оставить, но проверить, что интерфейс полностью типизирован |

### 4.5. Удалить дублирующий `EngineCallbacks` из `game-store.ts`

**Текущее состояние:** `EngineCallbacks` определён и в `engine.ts`, и в `game-store.ts` — с `any` в полях `onHud` и `onStats`.

**Действия:**
1. Удалить определение `EngineCallbacks` из `store/game-store.ts`
2. Импортировать из `models.ts`: `import { EngineCallbacks } from '../models'`
3. Типизировать `onHud: (data: HudData) => void` и `onStats: (data: Stats) => void`

---

## Фаза 5. Завершение ECS-миграции

### 5.1. Завершить конвертацию AoS → SoA для всех компонентов

**Проверить каждый компонент** на соответствие SoA (массивы примитивов, а не массивы объектов):

| Компонент | Текущий тип | Действие |
|-----------|-------------|----------|
| `Sprite` | `ref[]` (Uint32Array) — индекс в `SpriteRegistry` | ✅ SoA, проверить корректность `query()` |
| `PhysicsBody` | `body[]` (Uint32Array) — индекс в `PhysicsBodyRegistry` | ✅ SoA, проверить `query()` |
| `NPC` | `id`, `name` — через `StringPool` | ✅ SoA, проверить |
| `Chest` | `item` — через `StringPool`, `opened` | ✅ SoA |
| `Pedestal` | `id` — через `StringPool`, `guardsLeft`, `guardsSpawned` | ✅ SoA |
| `Shrine` | `lit` | ✅ SoA |
| `Door` | `open`, `locked` | ✅ SoA |
| `Barrier` | `active` | ✅ SoA |
| `Altar` | `runes` | ✅ SoA |
| `EnemyAI` | `path[]` — массив путей | ❓ Проверить: если `path` — массив объектов, это AoS. Конвертировать в `pathIndex[]` + `PathRegistry` |

**Если `EnemyAI.path` — AoS:**
1. Создать `PathRegistry: Vec[][]` (массив массивов точек)
2. В `EnemyAI` заменить `path: Vec[]` на `pathId: Uint32Array` (индекс в registry)
3. Обновить `ai-system.ts` — доступ через `PathRegistry[EnemyAI.pathId[eid]]`

### 5.2. Удалить legacy-функции из ECS-систем

**В `drops-system.ts` — удалить:**
- `spawnDropLegacy()` 
- `updateDropsLegacy()`
- `spawnWorldDropsLegacy()`

**В `fog-system.ts` — удалить:**
- `updateFogLegacy()`
- `fogHolesLegacy()`
- `createFogState()` (если помечена как legacy)

**Действия:**
1. Найти все вызовы этих функций (через `grep -r "Legacy" src/`)
2. Если вызовы есть — заменить на ECS-аналоги:
   - `spawnDropLegacy()` → `spawnDrop()`
   - `updateDropsLegacy()` → `dropsUpdateSystem()`
   - `spawnWorldDropsLegacy()` → `spawnWorldDrops()`
   - `updateFogLegacy()` → `fogUpdateSystem()`
   - `fogHolesLegacy()` → удалить (если не используется)
3. **Удалить функции** из файлов
4. **Обновить barrel exports** в `ecs/ecs-systems/index.ts` — удалить экспорты удалённых функций

### 5.3. Отделить рендереры от `entities.ts`

**Текущее состояние:** `entities.ts` содержит **и** старые модели данных (`Player`, `Enemy`, `Projectile` — типы), **и** рендереры (`PlayerRenderer`, `EnemyRenderer`, и т. д.), **и** `ENEMY_STATS`. Рендереры используются ECS `ecs-render-helpers.ts`.

**Действия:**

1. **Создать** `src/game/renderers/` директорию
2. **Перенести рендереры** из `entities.ts` в отдельные файлы:

| Рендерер | Новый файл |
|----------|-----------|
| `PlayerRenderer` | `src/game/renderers/player-renderer.ts` |
| `EnemyRenderer` | `src/game/renderers/enemy-renderer.ts` |
| `NpcRenderer` | `src/game/renderers/npc-renderer.ts` |
| `DropRenderer` | `src/game/renderers/drop-renderer.ts` |
| `ProjectileRenderer` | `src/game/renderers/projectile-renderer.ts` |
| `ChestRenderer` | `src/game/renderers/chest-renderer.ts` |
| `PedestalRenderer` | `src/game/renderers/pedestal-renderer.ts` |
| `ShrineRenderer` | `src/game/renderers/shrine-renderer.ts` |
| `DoorRenderer` | `src/game/renderers/door-renderer.ts` |
| `BarrierRenderer` | `src/game/renderers/barrier-renderer.ts` |
| `AltarRenderer` | `src/game/renderers/altar-renderer.ts` |

3. **Перенести интерфейсы данных** (`IPlayerData`, `IEnemyData`, `INpcData`, `IDropData`, `IProjectileData`, `IChestData`, `IPedestalData`, `IShrineData`, `IDoorData`, `IBarrierData`, `IAltarData`, `IPlayerExtra`) в `src/game/models.ts`

4. **Перенести `ENEMY_STATS`** в `src/game/entities.ts` (оставить) — или лучше в `src/game/balance.ts` (новый файл), поскольку это балансные данные, а не сущности

5. **Удалить старые типы данных** (`Player`, `Enemy`, `Projectile` — plain objects) из `entities.ts`, если они не используются нигде, кроме как в ECS bridge (где уже есть SoA-эквиваленты)

6. **Обновить импорты** в `ecs-render-helpers.ts` — импортировать рендереры из `renderers/`

---

## Фаза 6. Рефакторинг `App.tsx`

### 6.1. Вынести SVG-иконки

**Создать** `src/components/icons/` и перенести:

| Иконка | Новый файл |
|--------|-----------|
| Меч | `src/components/icons/SwordIcon.tsx` |
| Топор | `src/components/icons/AxeIcon.tsx` |
| Лук | `src/components/icons/BowIcon.tsx` |
| Молот | `src/components/icons/HammerIcon.tsx` |
| Сердце | `src/components/icons/HeartIcon.tsx` |
| Стрела | `src/components/icons/ArrowIcon.tsx` |
| Руна | `src/components/icons/RuneIcon.tsx` |

Каждый файл: `export function SwordIcon() { return (<svg>...</svg>); }`

### 6.2. Вынести экраны

**Создать** `src/components/screens/` и перенести:

| Экран | Новый файл | Что перенести |
|-------|-----------|---------------|
| Title | `TitleScreen.tsx` | JSX титульного экрана + логика кнопки "Start" |
| Pause | `PauseScreen.tsx` | JSX паузы + кнопки Resume/Quit |
| Death | `DeathScreen.tsx` | JSX экрана смерти + статистика |
| Victory | `VictoryScreen.tsx` | JSX победы |
| Quests | `QuestsScreen.tsx` | JSX списка квестов + отслеживаемый квест |
| Inventory | `InventoryScreen.tsx` | JSX инвентаря (предметы, руны, оружие) |
| Map | `MapScreen.tsx` | JSX большой карты (canvas) |

### 6.3. Вынести HUD

**Создать** `src/components/hud/HudBar.tsx` — перенести JSX полосы здоровья, статусов, оружия, рун, зоны, таймера, мини-карты.

### 6.4. Вынести хук `useEngine`

**Создать** `src/hooks/useEngine.ts`:

```typescript
export function useEngine(canvasRef: RefObject<HTMLCanvasElement>) {
  const [hud, setHud] = useState<HudData | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [dialogue, setDialogue] = useState<DialogueData | null>(null);
  // ...
  useEffect(() => {
    const engine = new Engine(canvasRef.current!, {
      onHud: setHud,
      onScreen: setScreen,
      onDialogue: setDialogue,
      // ...
    });
    return () => engine.destroy();
  }, []);
  return { hud, screen, dialogue, engine };
}
```

### 6.5. Результат: `App.tsx` после рефакторинга

`App.tsx` становится композицией (~100–150 строк):

```tsx
export default function App() {
  const { hud, screen, dialogue, ... } = useEngine(canvasRef);
  return (
    <>
      <canvas ref={canvasRef} />
      {screen === 'play' && <HudBar data={hud} />}
      {screen === 'pause' && <PauseScreen ... />}
      {screen === 'death' && <DeathScreen ... />}
      {dialogue && <DialogueView data={dialogue} />}
      {/* ... */}
    </>
  );
}
```

---

## Фаза 7. Очистка структуры проекта

### 7.1. Удалить `world.ts` (дублирующий barrel export)

**Текущее состояние:** `world.ts` — переэкспорт из `generators/`.

**Действия:**
1. Найти все импорты `from './world'` и `from '../world'` (через `grep -r "from.*world" src/`)
2. Заменить на `from './generators'` или прямой путь к нужному модулю
3. **Удалить файл** `world.ts`

### 7.2. Переименовать `vite.config.js` → `vite.config.ts`

**Действия:**
1. `git mv vite.config.js vite.config.ts`
2. Переписать на TypeScript (добавить типы для плагинов, опций)
3. Проверить, что Vite корректно подхватывает `.ts` конфиг

### 7.3. Исправить конфликт `main.cjs` с `"type": "module"`

**Текущее состояние:** `package.json` имеет `"type": "module"`, но `main.cjs` (Electron) — CommonJS.

**Действия (вариант 1 — ESM):**
1. Переименовать `main.cjs` → `main.mjs`
2. Переписать `require()` на `import` 
3. Обновить `"main"` в `package.json` → `"main.mjs"`

**Действия (вариант 2 — CJS локально):**
1. Оставить `main.cjs`
2. Понять, что это не конфликтует (Electron подхватывает CJS по расширению)

### 7.4. Добавить инструменты качества кода

**Создать файлы:**
- `eslint.config.js` (flat config для ESLint 9+) — правила: `@typescript-eslint`, `no-unused-vars`, `no-explicit-any` (как warning)
- `.prettierrc` — единый стиль форматирования
- `vitest.config.ts` — конфигурация тестов

**Добавить devDependencies:**
- `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
- `prettier`
- `vitest`

**Добавить scripts в `package.json`:**
- `"lint": "eslint src/"`
- `"lint:fix": "eslint src/ --fix"`
- `"format": "prettier --write src/"`
- `"test": "vitest"`

### 7.5. Добавить базовые тесты для чистых модулей

**Создать** `src/game/__tests__/`:

| Файл | Что тестировать |
|------|----------------|
| `utils.test.ts` | `clamp`, `dist2` — граничные случаи, корректность |
| `noise.test.ts` | `mulberry` — детерминированность (одинаковый seed → одинаковый результат), `NoiseGenerator` — диапазон значений |
| `flag-domain.test.ts` | `FlagDomain` — set/get, `reset()`, `hasItem`, `hasEnhancement` |
| `player-domain.test.ts` | `PlayerDomain` — `takeDamage`, `heal`, таймеры, смерть |
| `drop-handlers.test.ts` | `DropHandlerRegistry` — регистрация, обработка по типу |

---

## Фаза 8. Исправление конкретных багов

### 8.1. `mmBase` с non-null assertion

**В `engine.ts`** (или после переноса — в `MapLoaderService`):

```typescript
// Было:
drawBigMap(ctx, this.mmBase!, ...);

// Стало:
if (!this.mmBase) return;
drawBigMap(ctx, this.mmBase, ...);
```

### 8.2. Minimap с заглушками

**В `engine.ts`** (или в `HudSystem`):

```typescript
// Было:
drawMinimap(ctx, mmBase, player, { shrines: [], pedestals: [], target: null });

// Стало: передавать актуальные данные из ECS
const shrines = query(this.ecsWorld, [Shrine, Position]).map(eid => ({
  x: Position.x[eid], y: Position.y[eid], lit: Shrine.lit[eid]
}));
const pedestals = query(this.ecsWorld, [Pedestal, Position]).map(eid => ({
  x: Position.x[eid], y: Position.y[eid], taken: Pedestal.taken[eid]
}));
const target = this.questTracker.getTarget();
drawMinimap(ctx, mmBase, player, { shrines, pedestals, target });
```

### 8.3. `dialogueActive` передаётся по значению

**Текущее состояние:** в `createEcsGameLoop` булевы значения `talkedSig` и `dialogueActive` передаются как примитивы. Мутации в game loop не отражаются на `Engine`.

**Действия:**

1. Создать тип-обёртку:
   ```typescript
   interface Ref<T> { value: T }
   ```

2. В `Engine`:
   ```typescript
   private talkedSigRef: Ref<number> = { value: 0 };
   private dialogueActiveRef: Ref<boolean> = { value: false };
   ```

3. В `EcsGameLoopConfig` заменить `talkedSig: number` → `talkedSig: Ref<number>`, `dialogueActive: boolean` → `dialogueActive: Ref<boolean>`

4. В game loop: `config.dialogueActive.value = true` вместо `config.dialogueActive = true`

5. В `Engine`: читать `this.dialogueActiveRef.value`

### 8.4. Очистка слушателей EventBus при пересоздании систем

**Текущее состояние:** при загрузке новой карты (если game loop пересоздаётся — Фаза 3.6 это исправляет, но до этого момента):
- Старые подписки на `enemy:killed`, `drop:collected` и т. д. остаются
- Новые подписки добавляются поверх

**Действия:**
- После Фазы 3.6 (обновление config вместо пересоздания) — проблема исчезнет
- До этого: в `loadMapEcs()` перед пересозданием вызывать `this.bus.clear()` и заново регистрировать все обработчики
- **Альтернатива:** в `EcsGameLoop` сохранять ссылки на обработчики и отписывать их в `destroy()` через `bus.off()`

### 8.5. Очистка тайловых текстур при загрузке новой карты

**В `MapLoaderService.loadMapEcs()`** (после переноса из `engine.ts`):

```typescript
// Добавить перед загрузкой новых тайлов:
clearTiles(): void {
  for (const child of this.scene.tileLayer.children) {
    if (child instanceof Sprite) {
      child.destroy({ texture: true, baseTexture: true });
    }
  }
  this.scene.tileLayer.removeChildren();
}
```

Вызывать `this.clearTiles()` в начале `loadMapEcs()`.

---

## Фаза 9. Финальная реорганизация директорий

### Целевая структура

```
src/
├── main.tsx
├── App.tsx                          # композиция экранов (~150 строк)
├── components/
│   ├── icons/                       # SVG-иконки
│   ├── hud/
│   │   └── HudBar.tsx
│   └── screens/
│       ├── TitleScreen.tsx
│       ├── PauseScreen.tsx
│       ├── DeathScreen.tsx
│       ├── VictoryScreen.tsx
│       ├── QuestsScreen.tsx
│       ├── InventoryScreen.tsx
│       └── MapScreen.tsx
├── hooks/
│   └── useEngine.ts
├── game/
│   ├── models.ts                    # все общие типы
│   ├── engine.ts                    # тонкий оркестратор (~250 строк)
│   ├── engine/                      # подсистемы Engine
│   │   ├── viewport-controller.ts
│   │   ├── scene-manager.ts
│   │   ├── map-loader-service.ts
│   │   ├── player-lifecycle.ts
│   │   └── screen-router.ts
│   ├── balance.ts                   # ENEMY_STATS (перенесено из entities.ts)
│   ├── renderers/                   # рендереры (перенесено из entities.ts)
│   │   ├── player-renderer.ts
│   │   ├── enemy-renderer.ts
│   │   └── ... (11 файлов)
│   ├── store/
│   │   ├── index.ts                 # GameStore
│   │   ├── player-domain.ts
│   │   └── flag-domain.ts
│   ├── state/
│   │   └── state-manager.ts
│   ├── input/
│   │   └── input-system.ts
│   ├── quests/
│   │   ├── quest-system.ts
│   │   ├── quest-definitions.ts
│   │   ├── quest-tracker.ts
│   │   ├── quest-provider.ts
│   │   └── quest-targets.ts
│   ├── dialogue/
│   │   └── dialogue-system.ts
│   ├── dialogues.ts
│   ├── hud/
│   │   └── hud-system.ts
│   ├── physics/
│   │   └── planck-world.ts
│   ├── ecs/
│   │   ├── index.ts
│   │   ├── ecs-components.ts
│   │   ├── ecs-utils.ts
│   │   ├── ecs-relations.ts
│   │   ├── ecs-bridge.ts
│   │   ├── ecs-game-loop.ts
│   │   ├── ecs-map-loader.ts
│   │   ├── ecs-render-helpers.ts
│   │   └── ecs-systems/
│   │       ├── index.ts
│   │       ├── movement-system.ts
│   │       ├── physics-system.ts
│   │       ├── combat-system.ts
│   │       ├── ai-system.ts
│   │       ├── life-system.ts
│   │       ├── drops-system.ts
│   │       ├── fog-system.ts
│   │       ├── interaction-system.ts
│   │       ├── render-system.ts
│   │       ├── world-system.ts
│   │       └── init-system.ts
│   ├── generators/                   # без изменений
│   ├── audio.ts
│   ├── fx.ts
│   ├── tiles.ts
│   ├── map-display.ts
│   ├── noise.ts
│   ├── utils.ts
│   ├── drop-handlers.ts
│   ├── event-bus.ts
│   └── __tests__/
│       ├── utils.test.ts
│       ├── noise.test.ts
│       ├── flag-domain.test.ts
│       ├── player-domain.test.ts
│       └── drop-handlers.test.ts
```

**Файлы для удаления:**
- `src/game/types.ts` (после переноса `QuestView` в `models.ts`)
- `src/game/world.ts` (после переноса импортов на `generators/`)

**Файлы для переименования:**
- `vite.config.js` → `vite.config.ts`
- `main.cjs` → `main.mjs` (если выбран ESM-вариант)

**Файлы для создания:**
- `src/game/models.ts`
- `src/game/engine/viewport-controller.ts`
- `src/game/engine/scene-manager.ts`
- `src/game/engine/map-loader-service.ts`
- `src/game/engine/player-lifecycle.ts`
- `src/game/engine/screen-router.ts`
- `src/game/balance.ts`
- `src/game/renderers/` (11 файлов)
- `src/components/icons/` (7 файлов)
- `src/components/screens/` (7 файлов)
- `src/components/hud/HudBar.tsx`
- `src/hooks/useEngine.ts`
- `eslint.config.js`
- `.prettierrc`
- `vitest.config.ts`
- `src/game/__tests__/` (5 файлов)

---

## Порядок выполнения (приоритезированный)

| Шаг | Фаза | Оценка | Риск | Контрольная точка |
|-----|------|--------|------|-------------------|
| 1 | 1.1–1.2. Создать `models.ts`, перенести типы | 2 ч | Низкий | `madge --circular` — нет циклов |
| 2 | 8.1. Фикс `mmBase` null-check | 10 мин | Низкий | — |
| 3 | 8.3. Фикс `dialogueActive` по значению (`Ref<T>`) | 30 мин | Средний | Диалоги работают |
| 4 | 2.1. Удалить дубл. флаги | 3 ч | Высокий | Нет `this.flags.*` вне `FlagDomain` |
| 5 | 2.2. Удалить дубл. состояние игрока | 3 ч | Высокий | Нет `this.player.*` вне `PlayerDomain` |
| 6 | 2.3. Удалить дубл. `getEnemyStats` | 30 мин | Низкий | Единственный источник `ENEMY_STATS` |
| 7 | 4.1. Убрать `any` из EventBus | 2 ч | Средний | `grep -r ": any" event-bus.ts` — пусто |
| 8 | 4.2–4.3. Убрать `require()` и dynamic import | 1 ч | Низкий | `grep -r "require(" src/` — пусто |
| 9 | 4.4–4.5. Типизировать Engine, убрать дубл. `EngineCallbacks` | 1 ч | Низкий | `tsc --noEmit` проходит |
| 10 | 3.1–3.5. Декомпозиция `engine.ts` | 10 ч | Высокий | `engine.ts` < 300 строк |
| 11 | 3.6. `EcsGameLoop.updateConfig()` | 2 ч | Средний | Game loop не пересоздаётся |
| 12 | 5.1. Доконвертировать AoS → SoA | 4 ч | Высокий | Все компоненты — SoA |
| 13 | 5.2. Удалить legacy-функции | 1 ч | Средний | `grep -r "Legacy" src/` — пусто |
| 14 | 5.3. Отделить рендереры от `entities.ts` | 3 ч | Средний | `entities.ts` удалён/минимален |
| 15 | 8.2. Minimap с реальными данными | 1 ч | Низкий | На миникарте видны святилища |
| 16 | 8.5. Очистка тайловых текстур | 30 мин | Низкий | Нет утечки текстур |
| 17 | 6.1–6.4. Рефакторинг `App.tsx` | 5 ч | Низкий | `App.tsx` < 200 строк |
| 18 | 7.1. Удалить `world.ts` | 30 мин | Низкий | — |
| 19 | 7.2–7.4. Конфигурация проекта | 2 ч | Низкий | `npm run lint` работает |
| 20 | 7.5. Базовые тесты | 3 ч | Низкий | `npm test` — 5 файлов, зелёный |
| 21 | 9. Финальная реорганизация директорий | 1 ч | Низкий | Структура соответствует плану |

**Итого:** ~42 часа работы, 21 шаг.

Начать с шага 1 (создание `models.ts`) — он разрывает циклы и разблокирует все последующие шаги. Продолжить с шагов 2–3 (быстрые фиксы багов), затем 4–9 (типобезопасность и дублирование), и только потом 10–14 (масштабная декомпозиция и ECS-миграция).

С какого шага начнём? Могу подготовить код для первого.