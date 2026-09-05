Теперь позвольте мне получить ключевые исходные файлы, чтобы получить фрагменты кода для плана.
Теперь у меня есть полная картина. Позвольте мне получить оставшуюся часть `engine.ts`, чтобы изучить методы загрузки и тиканья (tick methods).
У меня есть полное представление о кодовой базе. Вот окончательный план миграции.

---

# Финальный план миграции VARDLOKKUR на ECS (bitECS)

## Текущее состояние

Проект находится в **продвинутой переходной фазе**: ECS-слой (`src/game/ecs/`) создан и интегрирован, компоненты конвертированы в SoA, 17-шаговый игровой цикл работает. Однако остаются критические проблемы:

### Что уже работает
- **Компоненты** в `ecs-components.ts` — все конвертированы в SoA (typed arrays): `Position`, `Velocity`, `Health`, `Player`, `Enemy`, `Projectile`, `Drop`, `NPC`, `Chest`, `Pedestal`, `Shrine`, `Door`, `Barrier`, `Altar`, `Sprite`, `PhysicsBody` — все используют `Float32Array`, `Uint8Array`, `Uint32Array` и registry-массивы для объектов.
- **Префабы** в `init-system.ts` — инициализация для всех 11 типов врагов, игрока, снарядов, дропов, NPC, объектов окружения.
- **Сущности** создаются через `ecs-bridge.ts` (`createPlayerInEcs`, `createEnemyInEcs`, `createNpcInEcs`, `createChestInEcs`, `createPedestalInEcs`, `createShrineInEcs`, `createDoorInEcs`, `createBarrierInEcs`, `createAltarInEcs`, `createProjectileInEcs`, `createDropInEcs`).
- **Игровой цикл** в `ecs-game-loop.ts` — 17 шагов: ввод → движение → физика Planck → AI → снаряды → дропы → туман → двери/зоны → жизнь/смерть.
- **ECS-системы**: `movement-system.ts`, `physics-system.ts`, `combat-system.ts` (sword/axe/arrow/projectiles/damage), `ai-system.ts` (12 поведений врагов), `life-system.ts`, `drops-system.ts`, `fog-system.ts`, `interaction-system.ts`, `render-system.ts`, `world-system.ts`.
- **Рендеринг** через `ecs-render-helpers.ts` → `entities.ts` renderers.
- **Загрузка карт** через `EcsMapLoader` в `ecs-map-loader.ts`.
- **StringPool** для строковых полей в SoA-компонентах.

### Критические проблемы (регрессии и пробелы)

| # | Проблема | Файл | Причина |
|---|----------|------|---------|
| 1 | **Пустые callback-заглушки** в game loop | `ecs-game-loop.ts` шаги 13–14 | `onEnemyHit`, `onEnemyKilled`, `onPlayerDamaged`, `onSnakeDeath`, `audio.clang`, `audio.hit`, `audio.freeze` — все `() => {}` |
| 2 | **Пересоздание EcsGameLoop** при каждой загрузке карты | `engine.ts` `loadMapEcs()` | `createEcsGameLoop()` вызывается заново → утечка слушателей EventBus, потеря состояния fog |
| 3 | **`dialogueActive` передаётся по значению** | `engine.ts` → `EcsGameLoopConfig` | Мутации `config.dialogueActive = true` в game loop не видны в `Engine.tick()` |
| 4 | **Миникарта без оверлеев** | `engine.ts` `tick()` | `shrines: []`, `pedestals: []` — хардкод пустых массивов вместо ECS queries |
| 5 | **Legacy-функции в ECS-системах** | `drops-system.ts`, `fog-system.ts` | `spawnDropLegacy`, `updateDropsLegacy`, `spawnWorldDropsLegacy`, `updateFogLegacy`, `fogHolesLegacy` |
| 6 | **Дублирование `ENEMY_STATS`** | `entities.ts` vs `ecs-bridge.ts` | `getEnemyStats()` определена локально в bridge вместо импорта `ENEMY_STATS` |
| 7 | **Dynamic import в горячем пути** | `engine.ts` `float()` | `import('...').then(...)` каждый кадр при создании плавающего текста |
| 8 | **Циклические зависимости** | `engine.ts` ↔ `store/game-store.ts`, `dialogues.ts` ↔ `engine.ts` | Типы `Screen`, `HudData`, `DialogueData`, `EngineCallbacks` определены в `engine.ts` |
| 9 | **`any` типизация** | `EcsGameLoopConfig`, `EventBus` | `map: any`, `flags: any`, `hud: any`, `quests: any`, `dialogue: any` |

---

## Фаза 1. Исправление критических регрессий

### 1.1. Привязка callback'ов в game loop к реальным системам

**Файл:** `src/game/ecs/ecs-game-loop.ts`

Текущий код в шаге 13 (`updateProjectilesEcs`) передаёт пустые заглушки:

```typescript
// Текущее (шаг 13):
updateProjectilesEcs(
  world, dt, peid, flags.ghostBane, _planckWorld,
  (eid) => {},     // onProjectileRemove — НУЖНО: удалить Graphics + Planck body
  addFloat,        // onFloatText — OK
  () => {},        // audio.clang — НУЖНО: () => audio.clang()
  () => {},        // audio.hit — НУЖНО: () => audio.hit()
  () => {},        // audio.freeze — НУЖНО: () => audio.freeze()
  () => {},        // onEnemyHit — НУЖНО: (eid) => { Flashing[eid] = 1; bus.emit('enemy:hit', {eid}) }
  () => {},        // onEnemyKilled — НУЖНО: (eid, kind) => { bus.emit('enemy:killed', {eid, kind}); quests.onEnemyKilled?.(kind) }
  () => {},        // onPlayerDamaged — НУЖНО: (dmg, sx, sy) => { bus.emit('player:damaged', {dmg, sx, sy}) }
  () => {},        // onSnakeDeath — НУЖНО: () => { flags.snakeDead = true; bus.emit('snake:death', {}); bus.emit('boss:killed', {kind:'snake'}) }
  playerDomain
);
```

**Действия:**

1. Импортировать `audio` и `Flashing` в `ecs-game-loop.ts`:
```typescript
import { audio } from '../audio';
import { Flashing } from './ecs-components';
```

2. Заменить все заглушки на реальные вызовы:
```typescript
updateProjectilesEcs(
  world, dt, peid, flags.ghostBane, _planckWorld,
  (eid) => {
    // onProjectileRemove: удалить Graphics из dynamic, удалить Planck body
    const spriteRef = SpriteRegistry[Sprite.ref[eid] - 1];
    if (spriteRef && spriteRef.parent) spriteRef.parent.removeChild(spriteRef);
    spriteRef?.destroy();
    const body = PhysicsBodyRegistry[PhysicsBody.body[eid] - 1];
    if (body) _planckWorld.world.destroyBody(body);
  },
  addFloat,
  () => audio.clang(),
  () => audio.hit(),
  () => audio.freeze(),
  (enemyEid: number) => {
    Flashing[enemyEid] = 1;
    Enemy.flashT[enemyEid] = 0.2;
  },
  (enemyEid: number, kind: string) => {
    bus.emit('enemy:killed', { eid: enemyEid, kind });
  },
  (dmg: number, sx: number, sy: number) => {
    bus.emit('player:damaged', { dmg, sx, sy });
  },
  () => {
    flags.snakeDead = true;
    bus.emit('boss:killed', { kind: 'snake' });
  },
  playerDomain
);
```

3. Аналогично для шага 14 (`dropsUpdateSystem`) — привязать `onDropRemove`:
```typescript
dropsUpdateSystem(
  world, dt, peid, store, bus,
  (eid: number) => {
    // Удалить Graphics + Planck body дропа
    const spriteRef = SpriteRegistry[Sprite.ref[eid] - 1];
    if (spriteRef && spriteRef.parent) spriteRef.parent.removeChild(spriteRef);
    spriteRef?.destroy();
  },
  playerDomain,
  getDropRegistry()
);
```

4. Для шага 15 (`fogUpdateSystem`) — передать реальный callback спавна призраков:
```typescript
fogUpdateSystem(
  world, peid, dt, rdt, _fogState, map, flags, bus,
  (kind: string, x: number, y: number) => {
    // Создать врага-призрака через ECS bridge
    const g = new Graphics();
    g.position.set(x, y);
    const eid = createEnemyInEcs(
      world, kind as EnemyKind, x, y, g, _planckWorld,
      Cat.Ghost, Cat.Ghost | Cat.Player | Cat.Projectile
    );
    dynamic.addChild(g);
    return eid;
  },
  () => flags.runes
);
```

### 1.2. Устранение пересоздания EcsGameLoop

**Файлы:** `src/game/ecs/ecs-game-loop.ts`, `src/game/engine.ts`

Текущий код в `engine.ts` `loadMapEcs()` полностью пересоздаёт game loop:

```typescript
// Текущее (engine.ts loadMapEcs):
this.ecsGameLoop = createEcsGameLoop({
  world: this.ecsWorld,
  bus: this.bus,
  store: this.store,
  planckWorld: this.ecsMapLoader.planckWorld,
  // ... 30+ параметров
});
```

**Действия:**

1. В `EcsGameLoop` интерфейс добавить метод `updateConfig`:
```typescript
export interface EcsGameLoop {
  tick: (rdt: number, timeScale: number) => void;
  render: (rdt: number) => void;
  realT: number;
  setPlayerEid: (eid: number) => void;
  getPlayerEid: () => number;
  isDungeonBossDead: (id: number) => boolean;
  getDropsForTransition: () => Array<{ kind: string; x: number; y: number; life: number; ambientIdx?: number }>;
  setPlanckWorld: (pw: PlanckWorld) => void;
  updateConfig: (config: Partial<EcsGameLoopConfig>) => void;  // ← ДОБАВИТЬ
}
```

2. В `createEcsGameLoop` реализовать `updateConfig`:
```typescript
return {
  tick,
  render,
  // ... существующие методы ...
  updateConfig: (config: Partial<EcsGameLoopConfig>) => {
    if (config.planckWorld) _planckWorld = config.planckWorld;
    if (config.map !== undefined) config_map = config.map;
    if (config.playerEid !== undefined) _playerEid = config.playerEid;
    if (config.flags) _flags = config.flags;
    // и т.д. для всех изменяемых полей
  },
};
```

3. В `engine.ts` `loadMapEcs()` заменить пересоздание на `updateConfig`:
```typescript
// БЫЛО:
this.ecsGameLoop = createEcsGameLoop({ /* 30+ параметров */ });

// СТАЛО:
if (this.ecsGameLoop) {
  this.ecsGameLoop.setPlanckWorld(this.ecsMapLoader.planckWorld);
  this.ecsGameLoop.setPlayerEid(result.playerEid);
  this.ecsGameLoop.updateConfig({
    map,
    flags: this.store.flags,
  });
}
```

### 1.3. Исправление `dialogueActive` по значению

**Файлы:** `src/game/ecs/ecs-game-loop.ts`, `src/game/engine.ts`

Текущий код: `dialogueActive: boolean` в `EcsGameLoopConfig` передаётся по значению. Мутации в game loop не видны в `Engine.tick()`, где `this.dialogueActive` остаётся `false`.

**Действия:**

1. Создать тип-обёртку в `ecs-game-loop.ts`:
```typescript
interface Ref<T> { value: T; }
```

2. Изменить тип в `EcsGameLoopConfig`:
```typescript
export interface EcsGameLoopConfig {
  // ...
  dialogueActive: Ref<boolean>;    // ← было boolean
  talkedSig: Ref<Map<string, string>>; // ← было Map (по значению ссылки, но лучше обернуть)
  // ...
}
```

3. В `engine.ts`:
```typescript
private dialogueActiveRef: Ref<boolean> = { value: false };
private talkedSigRef: Ref<Map<string, string>> = { value: new Map() };

// В createEcsGameLoop config:
dialogueActive: this.dialogueActiveRef,
talkedSig: this.talkedSigRef,
```

4. В game loop: `config.dialogueActive.value = true` вместо `config.dialogueActive = true`.

5. В `engine.ts` `tick()` и `advanceDialogue()`: `this.dialogueActiveRef.value` вместо `this.dialogueActive`.

### 1.4. Миникарта с реальными ECS-данными

**Файл:** `src/game/engine.ts` метод `tick()`

Текущий код передаёт пустые массивы:
```typescript
drawMinimap(ctx, this.mmBase, {
  shrines: [],          // ← ПУСТО
  pedestals: [],       // ← ПУСТО
  // ...
});
```

**Действия:**

1. Импортировать `query` и нужные компоненты в `engine.ts`:
```typescript
import { query } from 'bitecs';
import { Shrine, Pedestal, Position, ShrineLit, Taken } from './ecs/ecs-components';
import { poolGet, StringPool } from './ecs/ecs-components';
```

2. В `tick()` заменить на ECS queries:
```typescript
const shrines = this.ecsWorld
  ? Array.from(query(this.ecsWorld, [Shrine, Position])).map(eid => ({
      x: Position.x[eid], y: Position.y[eid], lit: Shrine.lit[eid]
    }))
  : [];

const pedestals = this.ecsWorld
  ? Array.from(query(this.ecsWorld, [Pedestal, Position])).map(eid => ({
      x: Position.x[eid], y: Position.y[eid], taken: Pedestal.taken[eid]
    }))
  : [];

drawMinimap(ctx, this.mmBase, {
  map: this.map,
  player: this.store.player,
  shrines,
  secretKnown: this.store.flags.secretKnown,
  stashSpot: this.ow?.stashSpot ?? { x: 0, y: 0 },
  nornsFavor: this.store.flags.nornsFavor,
  pedestals,
  target: this.quests.trackedTarget(),
  realT: this.realT,
});
```

---

## Фаза 2. Удаление legacy-функций из ECS-систем

### 2.1. Очистка `drops-system.ts`

**Файл:** `src/game/ecs/ecs-systems/drops-system.ts`

Файл содержит параллельные API: ECS (`spawnDrop`, `dropsUpdateSystem`, `rollDropsForEnemy`, `spawnWorldDrops`) и legacy (`spawnDropLegacy`, `updateDropsLegacy`, `spawnWorldDropsLegacy`, `createDropsState`, `DropsState`).

**Действия:**

1. Удалить функции:
   - `spawnDropLegacy()` — вся логика уже в `spawnDrop()`
   - `updateDropsLegacy()` — логика в `dropsUpdateSystem()`
   - `spawnWorldDropsLegacy()` — логика в `spawnWorldDrops()`
   - `createDropsState()` — состояние больше не нужно (drops в ECS)
   - Интерфейсы `DropsState` — удалить

2. Оставить `DropRt` интерфейс только если он используется в `getDropsForTransition()` в game loop. Если можно заменить на inline-тип — заменить.

3. Обновить barrel exports в `ecs-systems/index.ts` — удалить экспорты удалённых функций.

### 2.2. Очистка `fog-system.ts`

**Файл:** `src/game/ecs/ecs-systems/fog-system.ts`

**Действия:**

1. Удалить функции:
   - `updateFogLegacy()`
   - `fogHolesLegacy()`
   - Дублирующий экспорт `type FogState as LegacyFogState`

2. Обновить barrel exports в `ecs-systems/index.ts`.

---

## Фаза 3. Разрыв циклических зависимостей

### 3.1. Создание `src/game/models.ts`

**Создать новый файл** `src/game/models.ts` и перенести в него типы из `engine.ts`:

```typescript
// src/game/models.ts

export type Screen = 'title' | 'play' | 'pause' | 'death' | 'victory' | 'quests' | 'inventory' | 'map';

export interface HudData {
  hp: number;
  maxHp: number;
  runes: number;
  arrows: number;
  hearts: number;
  zone: string;
  timer: number;
  deaths: number;
  hasSword: boolean;
  hasAxe: boolean;
  hasBow: boolean;
  hasHammer: boolean;
  hasKey: boolean;
  trackedQuest: string | null;
  quests: import('./quests/quest-provider').QuestView[];
}

export interface DialogueData {
  id: string;
  npc: string;
  text: string;
  choices: Array<{ text: string; next: number | null; cond?: () => boolean }>;
}

export interface Stats {
  kills: number;
  deaths: number;
  timer: number;
}

export interface EngineCallbacks {
  onHud: (data: HudData) => void;
  onScreen: (s: Screen) => void;
  onDialogue: (d: DialogueData | null) => void;
  onToast: (msg: string) => void;
  onStats: (s: Stats) => void;
}

export interface VirtualInput {
  ix: number;
  iy: number;
  atk: boolean;
  axe: boolean;
  bow: boolean;
  act: boolean;
}
```

**Действия в `engine.ts`:**
- Удалить определения перенесённых типов
- Заменить на `import type { Screen, HudData, DialogueData, Stats, EngineCallbacks, VirtualInput } from './models'`

**Действия в зависимых файлах:**
- `store/game-store.ts`: `import { Screen, EngineCallbacks } from '../models'`
- `dialogues.ts`: `import { DialogueData } from './models'`
- `dialogue/dialogue-system.ts`: `import { DialogueData } from '../models'`
- `hud/hud-system.ts`: `import { HudData, Stats } from '../models'`
- `input/input-system.ts`: `import { VirtualInput } from '../models'`
- `App.tsx`: `import { Screen, HudData, DialogueData, EngineCallbacks } from './game/models'`

### 3.2. Перенос `QuestView` из `types.ts` в `models.ts`

- Переместить интерфейс `QuestView` из `src/game/types.ts` в `src/game/models.ts`
- Обновить все импорты: `from './types'` / `from '../types'` → `from './models'` / `from '../models'`
- **Удалить файл** `src/game/types.ts`

### 3.3. Устранение `require()` в ES-модулях

В `quest-targets.ts` и `engine.ts` используется `require()` внутри ES-модулей. После разрыва циклов (шаг 3.1) заменить на статические `import`.

---

## Фаза 4. Устранение дублирования состояния

### 4.1. Дублирование флагов `Engine` ↔ `FlagDomain`

**Текущее состояние:** `Engine` не имеет собственного `flags` поля (уже использует `this.store.flags`), но `EcsGameLoopConfig.flags` передаёт `this.store.flags` (объект `FlagDomain`) как `any`. Прямые мутации `flags.hasSword = true` встречаются в `interaction-system.ts` и `combat-system.ts`.

**Действия:**

1. Типизировать `flags` в `EcsGameLoopConfig`:
```typescript
import type { FlagDomain } from '../store/flag-domain';
export interface EcsGameLoopConfig {
  flags: FlagDomain;  // ← было any
}
```

2. Проверить, что все мутации `flags.*` в ECS-системах идут через методы `FlagDomain`, а не через прямую запись. Если методы отсутствуют — добавить:
   - `setSword(val: boolean)`, `setAxe(val: boolean)`, `setBow(val: boolean)`, `setHammer(val: boolean)`
   - `setArrows(n: number)`, `addRunes(n: number)`
   - `reset()`

### 4.2. Дублирование `ENEMY_STATS`

**Текущее состояние:** `ENEMY_STATS` определён в `entities.ts` и экспортируется. `ecs-bridge.ts` имеет локальную `getEnemyStats()`. `init-system.ts` импортирует `ENEMY_STATS` из `entities.ts`.

**Действия:**

1. В `ecs-bridge.ts` удалить локальную `getEnemyStats()`:
```typescript
// УДАЛИТЬ:
function getEnemyStats(kind: EnemyKind) { /* ... */ }

// ЗАМЕНИТЬ на:
import { ENEMY_STATS } from '../entities';
// Использование: ENEMY_STATS[kind] вместо getEnemyStats(kind)
```

2. Вынести `ENEMY_STATS` в `src/game/balance.ts` (новый файл), чтобы `entities.ts` не был единственным источником балансных данных. Обновить импорты.

### 4.3. Устранение dynamic import в горячем пути

**Файл:** `src/game/engine.ts` метод `float()`

Текущий код:
```typescript
private float(x: number, y: number, text: string, color: number) {
  addFloatText(this.floatLayer, { createText: (t, s) => new Text({ ...s, text: t }) }, x, y, text, color);
}
```

Это уже исправлено (статический импорт `addFloatText` и `Text` в начале файла). Проверить, что нигде больше нет dynamic `import()` в горячем пути.

---

## Фаза 5. Декомпозиция `engine.ts`

`engine.ts` (~700 строк) — God Object, содержащий инициализацию PixiJS, создание слоёв, загрузку карт, игровой цикл, обработку экранов, респавн, диалоги, HUD, вьюпорт.

### 5.1. Вынести `ViewportController`

**Создать:** `src/game/engine/viewport-controller.ts`

```typescript
import { Application } from 'pixi.js';

const ZOOM = 1.18;

export class ViewportController {
  viewW = 480;
  viewH = 270;
  cam = { x: 0, y: 0 };

  constructor(private container: HTMLElement, private app: Application) {}

  applyViewSize(): void { /* из Engine.applyViewSize() */ }
  applyView(): void { /* из Engine.applyView() */ }
  getZoom(): number { return ZOOM; }
  resize(): void { /* resize app.renderer */ }
}
```

Перенести из `engine.ts`: метод `applyViewSize()`, метод `applyView()`, константу `ZOOM`, поля `viewW`, `viewH`, `cam`.

### 5.2. Вынести `SceneManager`

**Создать:** `src/game/engine/scene-manager.ts`

```typescript
import { Application, Container, Graphics } from 'pixi.js';
import { FxManager } from '../fx';

export class SceneManager {
  tileLayer = new Container();
  world = new Container();
  dynamic = new Container();
  fxWorld = new Container();
  floatLayer = new Container();
  fxScreen = new Graphics();
  fadeG = new Graphics();

  constructor(app: Application, fx: FxManager) {
    this.world.sortableChildren = true;
    this.tileLayer.sortableChildren = true;
    this.fxWorld.addChild(fx.worldParticleGraphics);
    this.world.addChild(this.tileLayer);
    this.world.addChild(this.dynamic);
    this.world.addChild(this.fxWorld);
    this.world.addChild(this.floatLayer);
    app.stage.addChild(this.world);
    app.stage.addChild(this.fxScreen);
    app.stage.addChild(this.fadeG);
  }

  destroy(): void { /* cleanup */ }
}
```

### 5.3. Вынести `MapLoaderService`

**Создать:** `src/game/engine/map-loader-service.ts`

```typescript
import type { WorldData, Vec } from '../world';
import type { GameStore } from '../store';
import type { World } from 'bitecs';
import type { PlanckWorld } from '../physics/planck-world';
import { EcsMapLoader } from '../ecs/ecs-map-loader';
import { buildAllTileTextures } from '../tiles';
import { buildMinimapBase } from '../map-display';
import { Sprite, Container } from 'pixi.js';
import { WallTextureCache, HouseTextureCache } from '../tiles';

export class MapLoaderService {
  wallCache = new WallTextureCache();
  houseCache = new HouseTextureCache();
  mmBase: ImageData | null = null;
  ecsMapLoader: EcsMapLoader | null = null;

  constructor(
    private scene: SceneManager,
    private store: GameStore,
    private ecsWorld: World,
  ) {}

  loadMapEcs(map: WorldData, spawn: Vec, roofSnow: boolean, playerG: Graphics, playerDomain: any) {
    this.clearTiles();
    const tileResult = buildAllTileTextures(map, roofSnow);
    // ... добавить спрайты в tileLayer ...
    this.ecsMapLoader = new EcsMapLoader({ /* ... */ });
    const result = this.ecsMapLoader.loadMap(playerG, playerDomain);
    this.mmBase = buildMinimapBase(map);
    return result;
  }

  clearTiles(): void {
    for (const child of [...this.scene.tileLayer.children]) {
      if (child instanceof Sprite) child.destroy({ texture: true, baseTexture: true });
    }
    this.scene.tileLayer.removeChildren();
  }
}
```

### 5.4. Вынести `PlayerLifecycle`

**Создать:** `src/game/engine/player-lifecycle.ts`

```typescript
import type { GameStore } from '../store';
import type { StateManager } from '../state/state-manager';
import type { EventBus } from '../event-bus';
import { T, WorldData, Vec } from '../world';

export class PlayerLifecycle {
  constructor(
    private store: GameStore,
    private state: StateManager,
    private bus: EventBus,
  ) {}

  respawn(ow: WorldData, map: WorldData): void { /* из Engine.respawn() */ }
  useStoredHeart(floatFn: (x: number, y: number, t: string, c: number) => void): void { /* из Engine.useStoredHeart() */ }
}
```

### 5.5. Вынести `ScreenRouter`

**Создать:** `src/game/engine/screen-router.ts`

```typescript
import type { StateManager } from '../state/state-manager';
import type { EventBus } from '../event-bus';
import type { GameStore } from '../store';
import type { Screen } from '../models';

export class ScreenRouter {
  constructor(
    private state: StateManager,
    private bus: EventBus,
    private store: GameStore,
  ) {}

  handlePause(): void { /* из Engine.handlePause() */ }
  handleInventory(): void { /* из Engine.handleInventory() */ }
  handleQuests(): void { /* из Engine.handleQuests() */ }
  handleSnow(): void { /* из Engine.handleSnow() */ }
  closeOverlay(): void { /* из Engine.closeOverlay() */ }
  setScreen(s: Screen): void { /* из Engine.setScreen() */ }
}
```

### 5.6. Результат: `Engine` после декомпозиции

```typescript
export class Engine {
  private app: Application;
  private bus = new EventBus();
  private store!: GameStore;
  private playerDomain!: PlayerDomain;
  private input: InputSystem;
  private state = new StateManager();
  private quests!: QuestSystem;
  private dialogue!: DialogueSystem;
  private hud!: HudSystem;
  private fx = new FxManager();

  // Подсистемы
  private viewport!: ViewportController;
  private scene!: SceneManager;
  private mapLoader!: MapLoaderService;
  private playerLifecycle!: PlayerLifecycle;
  private screenRouter!: ScreenRouter;

  // ECS
  private ecsWorld!: World;
  private ecsGameLoop!: EcsGameLoop;

  constructor(container: HTMLElement, cbs: EngineCallbacks, debugMode = false) { /* ~50 строк */ }
  async startGame(): void { /* ~40 строк */ }
  private tick(rdt: number): void { /* ~20 строк — делегирование */ }
  destroy(): void { /* ~10 строк */ }
}
```

---

## Фаза 6. Типобезопасность

### 6.1. Убрать `any` из `EcsGameLoopConfig`

```typescript
// Текущее:
export interface EcsGameLoopConfig {
  map: any;          // → WorldData
  ow: any;           // → WorldData
  flags: any;        // → FlagDomain
  playerDomain: any; // → PlayerDomain
  hud: any;          // → HudSystem
  quests: any;       // → QuestSystem
  dialogue: any;     // → DialogueSystem
  // ...
}

// Должно быть:
import type { WorldData, Vec } from '../world';
import type { FlagDomain } from '../store/flag-domain';
import type { PlayerDomain } from '../store/player-domain';
import type { HudSystem } from '../../hud/hud-system';
import type { QuestSystem } from '../../quests/quest-system';
import type { DialogueSystem } from '../../dialogue/dialogue-system';

export interface EcsGameLoopConfig {
  map: WorldData | null;
  ow: WorldData | null;
  flags: FlagDomain;
  playerDomain: PlayerDomain;
  hud: HudSystem;
  quests: QuestSystem;
  dialogue: DialogueSystem;
  // ...
}
```

### 6.2. Типизировать `EventBus`

```typescript
// event-bus.ts — заменить any на конкретные типы
interface GameEvents {
  'enemy:killed': { eid: number; kind: string };
  'player:damaged': { dmg: number; sx: number; sy: number };
  'player:died': {};
  'player:healed': { amount: number };
  'player:respawned': {};
  'boss:killed': { kind: string };
  'dialogue:start': { id: string };
  'dialogue:end': {};
  'screen:change': { screen: Screen };
  'hud:dirty': {};
  'hud:float': { x: number; y: number; text: string; color: number };
  'toast': { msg: string };
  'fx:burst': { x: number; y: number; color: number; count: number; speed: number; life: number; size: number; yvel: number };
  'engine:enter-dungeon': { dungeonId: number };
  'engine:exit-dungeon': { spawn: Vec };
  'input:pause': {};
  'input:inventory': {};
  'input:quests': {};
  'input:mute': {};
  'input:use-heart': {};
  'input:toggle-snow': {};
  'input:close-overlay': {};
  'pedestal:guardKilled': { pedestalIndex: number };
  'pedestal:unsealed': { pedestalId: string };
  'fog:waveEnd': {};
  'snake:death': {};
  'quest:reveal': { questId: string };
}
```

### 6.3. Типизировать `ecsWorld` в `engine.ts`

```typescript
// Текущее:
private ecsWorld: any = null;

// Должно быть:
import type { World } from 'bitecs';
import type { WorldContext } from './ecs/ecs-world';
private ecsWorld: World<WorldContext> | null = null;
```

---

## Фаза 7. Отделение рендереров от `entities.ts`

### 7.1. Разделение файла

`entities.ts` (~35 КБ) содержит: data-интерфейсы, рендер-функции, `ENEMY_STATS`.

**Действия:**

1. Создать директорию `src/game/renderers/` и перенести рендер-функции:

| Функция | Новый файл |
|---------|-----------|
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

2. Data-интерфейсы (`IPlayerData`, `IEnemyData`, `INpcData`, и т.д.) перенести в `src/game/models.ts`.

3. `ENEMY_STATS` перенести в `src/game/balance.ts`.

4. Удалить старые plain-object типы (`Player`, `Enemy`, `Projectile` — не интерфейсы) если они не используются нигде кроме ECS bridge.

5. Обновить импорты в `ecs-render-helpers.ts`:
```typescript
import { PlayerRenderer } from '../renderers/player-renderer';
import { EnemyRenderer } from '../renderers/enemy-renderer';
// ...
```

---

## Фаза 8. Рефакторинг `App.tsx`

### 8.1. Вынести хук `useEngine`

**Создать:** `src/hooks/useEngine.ts`

```typescript
import { useEffect, useState, useRef, type RefObject } from 'react';
import { Engine } from './game/engine';
import type { Screen, HudData, DialogueData } from './game/models';

export function useEngine(canvasRef: RefObject<HTMLCanvasElement>) {
  const [hud, setHud] = useState<HudData | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [dialogue, setDialogue] = useState<DialogueData | null>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, {
      onHud: setHud,
      onScreen: setScreen,
      onDialogue: setDialogue,
      onToast: () => {},
      onStats: () => {},
    });
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  return { hud, screen, dialogue, engine: engineRef.current };
}
```

### 8.2. Вынести экраны в `src/components/screens/`

- `TitleScreen.tsx`, `PauseScreen.tsx`, `DeathScreen.tsx`, `VictoryScreen.tsx`, `QuestsScreen.tsx`, `InventoryScreen.tsx`, `MapScreen.tsx`
- Вынести HUD в `src/components/hud/HudBar.tsx`
- Вынести SVG-иконки в `src/components/icons/`

### 8.3. Результат: `App.tsx` ~100–150 строк

```tsx
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { hud, screen, dialogue, engine } = useEngine(canvasRef);

  return (
    <>
      <canvas ref={canvasRef} className="pixi" />
      {screen === 'play' && hud && <HudBar data={hud} engine={engine} />}
      {screen === 'pause' && <PauseScreen engine={engine} />}
      {screen === 'death' && <DeathScreen engine={engine} />}
      {dialogue && <DialogueView data={dialogue} engine={engine} />}
      {screen === 'quests' && <QuestsScreen engine={engine} />}
      {screen === 'inventory' && <InventoryScreen engine={engine} />}
      {screen === 'map' && <MapScreen engine={engine} />}
    </>
  );
}
```

---

## Фаза 9. Очистка структуры проекта

### 9.1. Финальная структура директорий

```
src/
├── main.tsx
├── App.tsx
├── components/
│   ├── icons/
│   ├── hud/
│   │   └── HudBar.tsx
│   └── screens/
├── hooks/
│   └── useEngine.ts
├── game/
│   ├── models.ts
│   ├── balance.ts
│   ├── engine.ts
│   ├── engine/
│   │   ├── viewport-controller.ts
│   │   ├── scene-manager.ts
│   │   ├── map-loader-service.ts
│   │   ├── player-lifecycle.ts
│   │   └── screen-router.ts
│   ├── renderers/
│   ├── ecs/
│   │   ├── ecs-components.ts
│   │   ├── ecs-world.ts
│   │   ├── ecs-utils.ts
│   │   ├── ecs-relations.ts
│   │   ├── ecs-bridge.ts
│   │   ├── ecs-game-loop.ts
│   │   ├── ecs-map-loader.ts
│   │   ├── ecs-render-helpers.ts
│   │   ├── index.ts
│   │   └── ecs-systems/
│   │       ├── init-system.ts
│   │       ├── input-system.ts
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
│   │       └── index.ts
│   ├── quests/
│   ├── dialogue/
│   ├── hud/
│   ├── input/
│   ├── state/
│   ├── physics/
│   ├── store/
│   ├── generators/
│   ├── dialogues.ts
│   ├── drop-handlers.ts
│   ├── audio.ts
│   ├── fx.ts
│   ├── tiles.ts
│   ├── map-display.ts
│   ├── noise.ts
│   ├── utils.ts
│   ├── event-bus.ts
│   └── __tests__/
```

### 9.2. Файлы для удаления

- `src/game/types.ts` (после переноса `QuestView` в `models.ts`)
- `tasks/to_ecs_01.md`, `tasks/to_ecs_02.md`, `tasks/to_ecs_03.md`
- `doc/analysis_01.md` (заменён этим планом)

### 9.3. Инструменты качества

- `eslint.config.js` (flat config, `@typescript-eslint`, `no-explicit-any` как warning)
- `.prettierrc`
- `vitest.config.ts`
- Scripts в `package.json`: `"lint"`, `"lint:fix"`, `"format"`, `"test"`

---

## Порядок выполнения

| Шаг | Фаза | Описание | Зависимости | Риск |
|-----|------|----------|-------------|------|
| 1 | 1.1 | Привязка callback'ов в game loop | — | Высокий |
| 2 | 1.2 | `updateConfig` вместо пересоздания loop | 1 | Средний |
| 3 | 1.3 | `Ref<T>` для `dialogueActive` | — | Средний |
| 4 | 1.4 | Миникарта с ECS-данными | — | Низкий |
| 5 | 2.1 | Удаление legacy drops-функций | 1 | Средний |
| 6 | 2.2 | Удаление legacy fog-функций | 1 | Средний |
| 7 | 3.1 | Создание `models.ts` | — | Низкий |
| 8 | 3.2 | Перенос `QuestView`, удаление `types.ts` | 7 | Низкий |
| 9 | 3.3 | Устранение `require()` | 7 | Низкий |
| 10 | 4.1 | Типизация `flags` в config | 7 | Низкий |
| 11 | 4.2 | Устранение дубля `ENEMY_STATS` | — | Низкий |
| 12 | 5.1–5.5 | Декомпозиция `engine.ts` | 7–10 | Высокий |
| 13 | 6.1 | Убрать `any` из `EcsGameLoopConfig` | 7, 10 | Средний |
| 14 | 6.2 | Типизировать `EventBus` | 7 | Средний |
| 15 | 6.3 | Типизировать `ecsWorld` | — | Низкий |
| 16 | 7.1 | Отделение рендереров | — | Средний |
| 17 | 8.1–8.3 | Рефакторинг `App.tsx` | 12 | Низкий |
| 18 | 9.1 | Финальная реорганизация | 1–17 | Низкий |
| 19 | 9.2 | Удаление устаревших файлов | 18 | Низкий |
| 20 | 9.3 | Инструменты качества | 18 | Низкий |

Начинать с шагов 1–4 (исправление регрессий), затем 7 (создание `models.ts` — разрывает циклы и разблокирует типизацию), затем 5–6 (очистка legacy), затем 10–15 (типобезопасность), и только потом 12 (декомпозиция engine.ts — самый рискованный шаг).

---

## Контрольные точки

- После шага 4: **играбельность** — враги получают урон, умирают, дропы подбираются, туман спавнит призраков, диалоги блокируют ввод.
- После шага 6: `grep -r "Legacy" src/game/ecs/` — пусто.
- После шага 9: `madge --circular src/` — нет циклов.
- После шага 15: `tsc --noEmit` — без ошибок, `grep -r ": any" src/game/ecs/` — пусто.
- После шага 18: `engine.ts` < 300 строк, `App.tsx` < 200 строк.