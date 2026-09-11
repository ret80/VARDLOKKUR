Теперь у меня полная картина. Я изучила репозиторий, прочитала все ключевые файлы системы рендеринга, архитектурную документацию и существующий план рефакторинга. Вот подробный разбор.

---

## Текущее состояние системы рендеринга

### Структура из 5 частей

| Часть | Технология | Где живёт | Как вызывается |
|-------|-----------|-----------|---------------|
| **Тайлы** | Canvas2D → PixiJS Texture/Sprite | `tiles.ts` (27K), `map-display.ts` (8K) | Одноразово при загрузке карты через `buildAllTileTextures()`; миникарта — отдельный Canvas2D каждый кадр |
| **Объекты** | PixiJS Graphics (пиксель-арт) | `renderers/` (~40 файлов), `render-system.ts` (19K) | Каждый кадр: ECS `query` → маппер → `RendererRegistry.get(kind).render(g, data, ctx)` |
| **Частицы** | PixiJS Graphics | `fx.ts` (15K), `FxManager` | `burst()` добавляет, `updateParticles()` двигает в tick(); отрисовка — на `worldParticleG` в `fxWorld` |
| **Туман** | Canvas2D → PixiJS RenderTexture | `fx.ts` (`FxManager.redrawFog`), `fog-system.ts` (логика) | Вызов `fx.redrawFog(...)` из `ecs-game-loop.ts` **после** `renderSystem()` |
| **Текст/Сообщения** | PixiJS Text | `renderers/float/FloatTextLayer.ts` (класс), `render-system.ts` (функции) | `addFloatText()` из `render-system.ts` — **класс `FloatTextLayer` не используется** |

### Слои сцены (PixiJS Containers)

```
app.stage
├── world (gameWorld) — позиционируется камерой
│   ├── tileLayer      — тайлы (PixiJS Sprites)
│   ├── dynamic         — сущности (PixiJS Graphics, sortableChildren)
│   ├── fxWorld         — частицы (worldParticleG)
│   └── floatLayer      — плавающий текст
├── fxScreen            — снег (экранные эффекты)
├── vignette            — виньетка
├── fogVignette         — туман
├── fadeG               — фейд (переходы)
└── hintLayer           — подсказка взаимодействия
```

---

## Деконструкция проблем

### 1. Дублирование ECS-мапперов

В `renderers/ecs-mappers.ts` — полноценные мапперы `eidToEnemyData`, `eidToDropData` и т.д. В `render-system.ts` — **их полные копии** с теми же именами, но без импорта из `ecs-mappers.ts`. Часть мапперов в `render-system.ts` вообще отдают `x: 0, y: 0` (забыли проставить позицию), хотя в `ecs-mappers.ts` позиция читается правильно.

**Последствие:** при изменении ECS-компонента нужно править маппер в двух местах; рассинхронизация уже привела к багам с координатами.

### 2. `FloatTextLayer` — мёртвый код

Класс `FloatTextLayer` создан, экспортируется, но **никто его не инстанцирует**. `engine.ts` вызывает `addFloatText(this.scene.floatLayer, text, x, y, color)` из `render-system.ts`. В `render-system.ts` функции `addFloatText` и `updateFloatTexts` дублируют логику `FloatTextLayer.add` и `FloatTextLayer.update` почти дословно.

### 3. Создание рендереров каждый кадр

В `render-system.ts`:

```ts
function renderPlayerEcs(world, playerEid, ctx) {
  const renderer = new PlayerRenderer();  // ← new каждый кадр!
  renderer.render(ref, data, ctx);
}

function renderChestsEcs(world, ctx) {
  for (const eid of query(world, [SpriteComp, Chest])) {
    const renderer = new ChestRenderer();  // ← new каждый кадр, для каждого сундука!
    renderer.render(ref, data, ctx);
  }
}
```

То же для `PedestalRenderer`, `ShrineRenderer`, `DoorRenderer`, `BarrierRenderer`, `AltarRenderer`. Для объектов окружения нет реестра — они создаются через `new` в цикле. При 20 сундуках на карте это 20 инстанцирований в кадр.

### 4. Туман — пост-хок добавление

`renderSystem()` выполняет весь рендер сущностей, вызывает `app.render()` в конце. **После** этого `ecs-game-loop.ts` вызывает `fx.redrawFog()`, который рисует на Canvas2D и обновляет RenderTexture. Это значит, что туман обновляется уже после PixiJS-рендера и виден только в следующем кадре — есть потенциальный лаг в 1 кадр.

### 5. Частицы не интегрированы в пайплайн

`FxManager` — самостоятельный монолит, который:
- Хранит массив частиц и снежинок
- Сам рисует на `worldParticleG` (Graphics)
- Не реализует `Renderer<T>` и не проходит через реестр
- Не имеет связи с ECS (частицы — не сущности, а массив в менеджере)

### 6. Технологическая фрагментация

| Слой | Технология рендеринга |
|------|----------------------|
| Тайлы (карта) | Canvas2D → PixiJS Texture |
| Миникарта / Большая карта | Canvas2D (полностью standalone) |
| Сущности | PixiJS Graphics (векторный пиксель-арт) |
| Частицы | PixiJS Graphics (вектор) |
| Туман | Canvas2D → PixiJS RenderTexture (procedural mask) |
| Виньетка | Canvas2D → PixiJS Texture |
| Снег | PixiJS Graphics (вектор) |
| Плавающий текст | PixiJS Text |
| Подсказка взаимодействия | PixiJS Graphics |

### 7. `render-system.ts` — 19K-символьный файл-функция

Несмотря на SOLID-рефакторинг рендереров, оркестратор остался процедурным монолитом. Содержит: камеру, сортировку, видимость, флеш, мапперы (дубли!), диспетчеризацию, плавающий текст, подсказки, очистку destroyed спрайтов. Не класс — функция.

### 8. `RenderSystemOptions` — 14 полей, передаются как объект

Это уже лучше, чем позиционные аргументы, но конфигурация разбросана: `app`, `cam`, `gameWorld`, `dynamic`, `floatLayer`, `hintLayer` — всё это части сцены, которые можно инкапсулировать.

---

## Предлагаемая архитектура

### Концепция: `RenderPipeline` + `IRenderLayer`

Унификация через **единый конвейер слоёв**. Каждый из 5 типов рендеринга становится слоем с общим интерфейсом:

```typescript
interface IRenderLayer {
  readonly name: string;
  readonly priority: number;       // порядок отрисовки
  init(ctx: RenderPipelineContext): void;
  update(dt: number, ctx: RenderPipelineContext): void;
  render(ctx: RenderPipelineContext): void;
  resize(w: number, h: number): void;
  clear(): void;
}

interface RenderPipelineContext {
  time: number;
  dt: number;
  app: Application;
  cam: { x: number; y: number };
  playerEid: number;
  world: World;       // ECS
  viewport: { w: number; h: number };
  [key: string]: unknown;
}
```

### Схема

```
RenderPipeline
├── TileLayer          (priority: 0)  — тайлы, статические спрайты
├── EntityLayer        (priority: 10) — динамические сущности через RenderSystem
├── ParticleLayer      (priority: 20) — частицы, снег
├── FloatTextLayer     (priority: 30) — плавающий текст
├── FogLayer           (priority: 40) — туман как post-process
├── OverlayLayer       (priority: 50) — виньетка, фейд
└── HintLayer          (priority: 60) — подсказки взаимодействия
```

### Структура директорий

```
src/game/render/
├── pipeline/
│   ├── RenderPipeline.ts         — оркестратор слоёв
│   ├── types.ts                  — IRenderLayer, RenderPipelineContext
│   └── RenderLayerBase.ts        — базовый класс с дефолтами
├── layers/
│   ├── TileLayer.ts
│   ├── EntityLayer.ts            — обёртка над RenderSystem (реестры)
│   ├── ParticleLayer.ts          — перенос из FxManager
│   ├── FogLayer.ts               — перенос из FxManager.redrawFog
│   ├── FloatTextLayer.ts         — уже есть, интегрировать
│   ├── OverlayLayer.ts           — виньетка, фейд, снег
│   └── HintLayer.ts              — подсказка взаимодействия
├── renderers/                    — существующая SOLID-структура
│   ├── core/                     — types, registry, primitives
│   ├── player/
│   ├── enemy/
│   ├── npc/
│   ├── drop/
│   ├── projectile/
│   ├── objects/
│   └── float/
├── mappers/
│   └── ecs-mappers.ts            — единое место ECS → data мапперов
├── scene/
│   └── SceneManager.ts           — управление PixiJS Containers
└── camera/
    └── CameraController.ts       — слежение, clamp, zoom
```

---

## Пошаговый план рефакторинга

### Этап 0. Подготовка и фиксация базовой линии

**Задачи:**
- Создать ветку `refactor/unified-render`
- Запустить `npx tsc --noEmit` и зафиксировать текущее состояние (ошибки/предупреждения)
- Сделать скриншоты ключевых сцен: игрок в деревне, бой с врагом, волна тумана, плавающий текст урона
- Записать список всех файлов, импортирующих из `render-system.ts` и `fx.ts`

**Критерии успешности:**
- Ветка создана, baseline-скриншоты сохранены
- `tsc --noEmit` проходит без новых ошибок
- Список зависимостей составлен и проверен

---

### Этап 1. Извлечение мапперов и устранение дублирования

**Задачи:**
1. Удалить локальные мапперы из `render-system.ts` (`eidToEnemyData`, `eidToDropData`, `eidToProjectileData`, `eidToNpcData`, `eidToChestData`, `eidToPedestalData`, `eidToShrineData`, `eidToDoorData`, `eidToBarrierData`, `eidToAltarData`, `eidToPlayerRenderData`)
2. Импортировать мапперы из `renderers/ecs-mappers.ts` (там они уже есть и правильнее — с реальной позицией)
3. Исправить мапперы в `ecs-mappers.ts`: добавить недостающие поля, если есть расхождения (сверить с удалёнными копиями — возможно, в `render-system.ts` есть поля, которых нет в `ecs-mappers.ts`)
4. Обновить сигнатуры мапперов: они принимают `(eid, world)` — убедиться, что вызовы в `render-system.ts` передают `world`

**Файлы:**
- `src/game/ecs/ecs-systems/render-system.ts` — удалить ~200 строк дубликатов
- `src/game/renderers/ecs-mappers.ts` — проверить полноту

**Критерии успешности:**
- `grep -n "function eidTo" src/game/ecs/ecs-systems/render-system.ts` — пусто
- `tsc --noEmit` — без ошибок
- Визуально игра не изменилась (сравнить со скриншотами)
- Все сущности отрисовываются в правильных позициях (не в 0,0)

---

### Этап 2. Кэширование рендереров объектов

**Задачи:**
1. Создать `objectRegistry` в `renderers/objects/index.ts`:
```typescript
import { RendererRegistry } from "../core/registry";
import { ChestRenderer } from "./ChestRenderer";
// ...

class SingletonRegistry<TKey extends string, TData> extends RendererRegistry<TKey, TData> {
  getOrThrow(key: TKey): Renderer<TData> {
    const r = this.get(key);
    if (!r) throw new Error(`Renderer not found: ${key}`);
    return r;
  }
}

export const objectRegistry = new SingletonRegistry<string, any>()
  .register("chest", new ChestRenderer())
  .register("pedestal", new PedestalRenderer())
  .register("shrine", new ShrineRenderer())
  .register("door", new DoorRenderer())
  .register("barrier", new BarrierRenderer())
  .register("altar", new AltarRenderer());
```
2. Создать `playerRenderer` как синглтон (один экземпляр, не `new` каждый кадр)
3. Переписать функции в `render-system.ts`:
```typescript
const _playerRenderer = new PlayerRenderer();

function renderPlayerEcs(world, playerEid, ctx) {
  // ...
  _playerRenderer.render(ref, data, ctx);  // без new
}

function renderObjectsEcs(world, ctx) {
  // chests
  for (const eid of query(world, [SpriteComp, Chest])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    objectRegistry.getOrThrow("chest").render(ref, eidToChestData(eid, world), ctx);
  }
  // pedestals, shrines, doors, barriers, altar — аналогично
}
```
4. Объединить `renderChestsEcs`, `renderPedestalsEcs`, `renderShrinesEcs`, `renderDoorsEcs`, `renderBarrierEcs`, `renderAltarEcs` в одну функцию `renderObjectsEcs`

**Критерии успешности:**
- `grep -n "new.*Renderer()" src/game/ecs/ecs-systems/render-system.ts` — пусто
- `tsc --noEmit` — без ошибок
- Визуально игра не изменилась
- Профиль: количество аллокаций в кадре уменьшилось (проверить через DevTools Performance)

---

### Этап 3. Активация `FloatTextLayer` и удаление дубл-функций

**Задачи:**
1. В `engine.ts` заменить:
```typescript
// Было:
import { addFloatText } from './ecs/ecs-systems/render-system';
private float(x, y, text, color) {
  addFloatText(this.scene.floatLayer, text, x, y, color);
}

// Стало:
import { FloatTextLayer } from './renderers/float/FloatTextLayer';
private floatTextLayer: FloatTextLayer;

// В init():
this.floatTextLayer = new FloatTextLayer(this.scene.floatLayer);

private float(x, y, text, color) {
  this.floatTextLayer.add(x, y, text, color);
}
```
2. Передать `FloatTextLayer` в `RenderSystemOptions` (вместо `floatLayer: Container`)
3. В `render-system.ts` заменить `updateFloatTexts(floatLayer, dt)` на `floatTextLayer.update(dt)`
4. Удалить функции `addFloatText` и `updateFloatTexts` из `render-system.ts`
5. Проверить `store/game-store.ts` на наличие `FloatText` / `addFloatText` / `removeFloatText` — если есть и не используются после замены, удалить

**Критерии успешности:**
- `grep -rn "addFloatText\|updateFloatTexts" src/game/` — пусто (кроме `FloatTextLayer`)
- `grep -rn "FloatText" src/game/store/` — пусто или помечено как deprecated
- `tsc --noEmit` — без ошибок
- Плавающий текст (урон, "блок", сообщения) отображается корректно

---

### Этап 4. Извлечение `CameraController`

**Задачи:**
1. Создать `src/game/render/camera/CameraController.ts`:
```typescript
export class CameraController {
  constructor(
    private target: Container,
    private viewport: { w: number; h: number }
  ) {}

  follow(playerEid: number, world: World): void {
    if (playerEid < 0) return;
    this.cam.x = Position.x[playerEid] - this.viewport.w / 2;
    this.cam.y = Position.y[playerEid] - this.viewport.h / 2;
    this.target.position.set(-Math.round(this.cam.x), -Math.round(this.cam.y));
  }

  resize(w: number, h: number): void {
    this.viewport = { w, h };
  }

  get cam() { return { x: this._x, y: this._y }; }
  private _x = 0; private _y = 0;
}
```
2. Перенести логику слежения камеры из `renderSystem()` в `CameraController.follow()`
3. В `ecs-game-loop.ts` вызывать `camera.follow()` до `renderSystem()`

**Критерии успешности:**
- Камера плавно следует за игроком
- `render-system.ts` больше не содержит логики камеры
- `tsc --noEmit` — без ошибок

---

### Этап 5. Извлечение `RenderPipeline` и `IRenderLayer`

**Задачи:**
1. Создать `src/game/render/pipeline/types.ts`:
```typescript
export interface IRenderLayer {
  readonly name: string;
  readonly priority: number;
  init(ctx: RenderPipelineContext): void;
  update(dt: number, ctx: RenderPipelineContext): void;
  render(ctx: RenderPipelineContext): void;
  resize(w: number, h: number): void;
  clear(): void;
}

export interface RenderPipelineContext {
  time: number;
  dt: number;
  app: Application;
  cam: { x: number; y: number };
  playerEid: number;
  world: World;
  viewport: { w: number; h: number };
  flags: FlagDomain;
  [key: string]: unknown;
}
```

2. Создать `src/game/render/pipeline/RenderPipeline.ts`:
```typescript
export class RenderPipeline {
  private layers: IRenderLayer[] = [];
  private ctx: RenderPipelineContext;

  constructor(ctx: RenderPipelineContext) {
    this.ctx = ctx;
  }

  addLayer(layer: IRenderLayer): this {
    this.layers.push(layer);
    this.layers.sort((a, b) => a.priority - b.priority);
    layer.init(this.ctx);
    return this;
  }

  update(dt: number): void {
    for (const layer of this.layers) {
      layer.update(dt, this.ctx);
    }
  }

  render(): void {
    for (const layer of this.layers) {
      layer.render(this.ctx);
    }
    this.ctx.app.render();
  }

  resize(w: number, h: number): void {
    for (const layer of this.layers) {
      layer.resize(w, h);
    }
  }
}
```

3. Создать `EntityLayer` — обёртка над существующей логикой `renderSystem()`:
```typescript
export class EntityLayer implements IRenderLayer {
  readonly name = "entities";
  readonly priority = 10;
  private renderSystem: RenderSystem;

  init(ctx: RenderPipelineContext): void {
    this.renderSystem = new RenderSystem(/* registries */);
  }

  update(dt: number, ctx: RenderPipelineContext): void {
    // renderSprites, renderSortSystem, renderVisibilitySystem, renderFlashSystem
  }

  render(ctx: RenderPipelineContext): void {
    // диспетчеризация через реестры
    this.renderSystem.render(ctx);
  }
}
```

4. Создать `ParticleLayer` — перенос из `FxManager`:
```typescript
export class ParticleLayer implements IRenderLayer {
  readonly name = "particles";
  readonly priority = 20;
  private particles: Particle[] = [];
  private g: Graphics;

  init(ctx: RenderPipelineContext): void {
    this.g = new Graphics();
    // добавить в fxWorld
  }

  update(dt: number, ctx: RenderPipelineContext): void {
    // updateParticles logic
  }

  render(ctx: RenderPipelineContext): void {
    this.g.clear();
    for (const p of this.particles) {
      // отрисовка
    }
  }

  burst(x, y, color, n, speed, life, size, grav): void {
    // spawn particles
  }
}
```

5. Создать `FogLayer` — перенос из `FxManager.redrawFog`:
```typescript
export class FogLayer implements IRenderLayer {
  readonly name = "fog";
  readonly priority = 40;

  render(ctx: RenderPipelineContext): void {
    // redrawFog logic — теперь часть единого пайплайна
    // Вызывается ДО app.render(), не после
  }
}
```

6. Создать `FloatTextLayer` (адаптер существующего класса):
```typescript
export class FloatTextRenderLayer implements IRenderLayer {
  readonly name = "float-text";
  readonly priority = 30;
  private floatText: FloatTextLayer;

  init(ctx: RenderPipelineContext): void {
    this.floatText = new FloatTextLayer(/* container */);
  }

  update(dt: number, ctx: RenderPipelineContext): void {
    this.floatText.update(dt);
  }

  render(ctx: RenderPipelineContext): void {
    // FloatTextLayer уже рисует через addChild, ничего не нужно
  }
}
```

7. Создать `OverlayLayer` (виньетка, фейд) и `HintLayer` (подсказки) по аналогии

**Критерии успешности:**
- `RenderPipeline` создан и зарегистрирован в `engine.ts`
- Все 7 слоёв реализуют `IRenderLayer`
- `ecs-game-loop.ts` вызывает `pipeline.update(dt)` + `pipeline.render()` вместо раздельных вызовов
- `tsc --noEmit` — без ошибок
- Визуально игра не изменилась
- Туман обновляется в том же кадре, что и остальной рендер (нет 1-кадрового лага)

---

### Этап 6. Превращение `RenderSystem` в класс

**Задачи:**
1. Превратить процедурные функции `renderSystem()`, `renderSprites()`, `renderSortSystem()`, `renderVisibilitySystem()`, `renderFlashSystem()` в методы класса:
```typescript
export class RenderSystem {
  constructor(
    private readonly enemyRegistry: RendererRegistry<string, IEnemyData>,
    private readonly npcRegistry: RendererRegistry<string, INpcData>,
    private readonly dropRegistry: RendererRegistry<string, IDropData>,
    private readonly projectileRegistry: RendererRegistry<string, IProjectileData>,
    private readonly objectRegistry: RendererRegistry<string, any>,
    private readonly playerRenderer: PlayerRenderer,
  ) {}

  render(world: World, opts: RenderOptions): void {
    this.updateSprites(world);
    this.sortSprites(world, opts.dynamic);
    this.updateVisibility(world, opts.playerEid, opts.time);
    this.updateFlash(world, opts.time);
    this.dispatchEntities(world, opts);
  }

  private dispatchEntities(world: World, opts: RenderOptions): void {
    const ctx: RenderContext = { time: opts.time };
    this.renderPlayer(world, opts.playerEid, ctx);
    this.renderByRegistry(world, [SpriteComp, Enemy], Enemy.kind, this.enemyRegistry, StringPool.enemyKinds, ctx, eidToEnemyData);
    // ... и т.д.
  }
}
```
2. Инстанцировать один `RenderSystem` в `EntityLayer.init()`
3. Удалить свободные функции из `render-system.ts` (они теперь методы класса)

**Критерии успешности:**
- `render-system.ts` содержит класс `RenderSystem`, не экспортирует свободные функции
- `EntityLayer` владеет единственным экземпляром `RenderSystem`
- `tsc --noEmit` — без ошибок
- Визуально игра не изменилась

---

### Этап 7. Интеграция частиц в `ParticleLayer`

**Задачи:**
1. Перенести `Particle[]`, `Snowflake[]`, `burst()`, `updateParticles()`, `updateSnow()` из `FxManager` в `ParticleLayer`
2. Перенести отрисовку частиц: в `ParticleLayer.render()` рисовать на `Graphics` (который в `fxWorld`)
3. Перенести снег: либо в `ParticleLayer`, либо в `OverlayLayer` (снег — экранный эффект)
4. `engine.ts` и `ecs-game-loop.ts` вызывают `particleLayer.burst(...)` вместо `fx.burst(...)`
5. Оставить в `FxManager` только виньетку и фейд (или тоже перенести в `OverlayLayer`)

**Критерии успешности:**
- `FxManager` больше не существует (или пустая оболочка для обратной совместимости)
- `ParticleLayer.burst()` вызывается из ECS-событий `fx:burst`
- Частицы (кровь, искры, эффекты смерти) отображаются корректно
- Снег падает
- `tsc --noEmit` — без ошибок

---

### Этап 8. Интеграция тумана в `FogLayer`

**Задачи:**
1. Перенести `redrawFog()`, `buildFogVignette()`, `buildNoiseTexture()`, `fogWaveNoise()` из `FxManager` в `FogLayer`
2. `FogLayer.render()` вызывается в общем пайплайне **до** `app.render()` (исправление 1-кадрового лага)
3. `ecs-game-loop.ts` больше не вызывает `fx.redrawFog()` отдельно
4. `FogLayer` получает данные из `FogState` (ECS) через `RenderPipelineContext`

**Критерии успешности:**
- `ecs-game-loop.ts render()` не содержит вызова `fx.redrawFog()`
- Туман корректно сжимается/расширяется
- Туман обновляется в том же кадре (визуально — нет двойного изображения или задержки)
- `tsc --noEmit` — без ошибок

---

### Этап 9. Унификация миникарты

**Задачи:**
1. Опционально: перенести `map-display.ts` в `render/layers/MinimapLayer.ts`, реализующий `IRenderLayer`
2. Или оставить как есть (миникарта — Canvas2D вне PixiJS, работает корректно)
3. Если переносится — `MinimapLayer.render()` рисует на отдельном `<canvas>`, не в PixiJS

**Критерии успешности (если переносится):**
- Миникарта обновляется корректно
- Святилища, пьедесталы, игрок, цель — видны
- `tsc --noEmit` — без ошибок

**Критерии успешности (если оставляется):**
- Задокументировано, что миникарта — отдельная подсистема
- Нет дублирования логики ECS-запросов

---

### Этап 10. Очистка и финальная интеграция

**Задачи:**
1. Удалить `FxManager` (или сделать пустой deprecated-оболочкой)
2. Удалить свободные функции из `render-system.ts`
3. Удалить дублирующие импорты из `entities.ts` (переэкспорт-барел для обратной совместимости)
4. Обновить `doc/arch_02.md` с новой архитектурой
5. Обновить barrel-экспорты: `render/index.ts` экспортирует `RenderPipeline`, `IRenderLayer`, слои
6. Финальные проверки:
   - `npx tsc --noEmit` — без ошибок
   - `npm test` (vitest) — без падений
   - `grep -rn "switch (" src/game/renderers/` — пусто
   - `grep -rn "new.*Renderer()" src/game/ecs/` — пусто
   - `grep -rn "addFloatText\|updateFloatTexts" src/game/` — только в `FloatTextLayer.ts`
   - `grep -rn "function eidTo" src/game/ecs/ecs-systems/render-system.ts` — пусто

**Критерии успешности:**
- Все grep-проверки проходят
- `tsc --noEmit` и `npm test` — зелёные
- Сравнение со скриншотами этапа 0 — визуально идентично
- Добавление нового врага: создание 1 файла + 1 строка `.register()` (OCP)
- Добавление нового слоя: реализация `IRenderLayer` + `pipeline.addLayer()` (OCP)

---

## Сводная таблица этапов

| Этап | Что | Зависимости | Риск |
|------|-----|-------------|------|
| 0 | Baseline | — | Низкий |
| 1 | Устранение дублей мапперов | 0 | Низкий |
| 2 | Кэширование рендереров | 1 | Низкий |
| 3 | Активация FloatTextLayer | 1 | Средний (задействует engine.ts) |
| 4 | CameraController | 1 | Низкий |
| 5 | RenderPipeline + IRenderLayer | 2, 3, 4 | Высокий (крупный шаг) |
| 6 | RenderSystem → класс | 5 | Средний |
| 7 | ParticleLayer | 5 | Средний (перенос из FxManager) |
| 8 | FogLayer | 5, 7 | Средний (перенос + фикс лага) |
| 9 | Minimap (опционально) | 5 | Низкий |
| 10 | Очистка | 1–9 | Низкий |

Этапы 1–4 можно делать параллельно (независимы). Этап 5 — ключевой, после него 6–8 идут по шаблону. Этап 9 опционален — миникарта работает и так.

---

## Риски и митигация

| Риск | Митигация |
|------|-----------|
| Визуальные артефакты при переносе | Скриншоты до/после на каждом этапе; перенос кода дословно, без «улучшений» |
| Циклические импорты | Слои импортируют только `core/types` + `ecs-components`; слои не зависят друг от друга |
| Поломка `ecs-game-loop.ts` | Заменять вызовы по одному, проверять после каждого |
| Lag тумана при интеграции | Этап 8: `FogLayer.render()` вызывается до `app.render()`, а не после — это **исправляет** существующий баг |
| Производительность при абстракции | `IRenderLayer` — тонкий интерфейс, overhead — один вызов метода на слой (7 слоёв × 60fps = 420 вызовов/сек, ничтожно) |

---

Если нужно, могу начать с описания конкретного этапа в виде инструкций для ИИ-агента с точными правками по строкам.