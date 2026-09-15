# Refactoring Render Pipeline — Этап 4: EntityLayer

## 1. Проблема

`RenderPipeline` создан (`render-pipeline.ts`), интерфейс `IRenderLayer` определён (`render-layer.ts`), но слои не реализованы. `RenderSystem` живёт в `ecs-systems/render-system.ts` как самостоятельный класс, не интегрированный в пайплайн.

Текущий вызов рендеринга в `ecs-game-loop.ts`:
```ts
renderSystem(world, {
  world, time, dt, app, float: floatLayer,
  cameraController, gameWorld, dynamic, sceneManager,
  hintLayer, playerEid, getNpcSig, talkedSig, nearestInteractable
});
```

Нужно обернуть `RenderSystem` в `EntityLayer`, реализующий `IRenderLayer`.

---

## 2. Целевая архитектура

```
RenderPipeline
├── EntityLayer (priority: 10) — обёртка над RenderSystem
│   ├── renderSprites()
│   ├── renderSortSystem()
│   ├── renderVisibilitySystem()
│   ├── renderFlashSystem()
│   ├── RenderSystem.render() — диспетчеризация через реестры
│   └── interaction hint
```

### Интерфейс `IRenderLayer`

```ts
interface IRenderLayer {
  init(app: Application, ctx: RenderLayerContext): void;
  update(ctx: RenderLayerContext): void;
  render(ctx: RenderLayerContext): void;
  resize(viewW: number, viewH: number): void;
  destroy(): void;
}
```

### `RenderLayerContext`

```ts
interface RenderLayerContext {
  dt: number;
  time: number;
  world: World;
  fxWorld?: Container;
}
```

Нужно расширить контекст для `EntityLayer`:
- `app: Application` — для app.render() (но RenderPipeline вызывает app.render() после всех слоёв)
- `cameraController: CameraController` — слежение камеры
- `gameWorld: Container` — world контейнер
- `dynamic: Container` — dynamic children для сортировки
- `float: FloatTextLayer` — плавающий текст
- `hintLayer: Container` — подсказки взаимодействия
- `playerEid: number` — ID игрока
- `sceneManager: { cleanupDestroyedSprites(...) }` — очистка
- `getNpcSig?, talkedSig?` — NPC маркеры
- `nearestInteractable?` — взаимодействие

---

## 3. Реализация

### Шаг 4.1. Расширить `RenderLayerContext`

**Файл:** `src/game/engine/render-layer.ts`

Добавить обязательные поля для `EntityLayer`:

```ts
import type { Application, Container } from 'pixi.js';
import type { World } from 'bitecs';
import type { CameraController } from '../engine/camera-controller';
import type { FloatTextLayer } from '../renderers/float/FloatTextLayer';
import type { InteractableHit } from '../ecs/ecs-systems/interaction-system';
import type { SceneManager } from '../engine/scene-manager';

export interface RenderLayerContext {
  dt: number;
  time: number;
  world: World;
  fxWorld?: Container;

  // EntityLayer-specific
  app?: Application;
  cameraController?: CameraController;
  gameWorld?: Container;
  dynamic?: Container;
  float?: FloatTextLayer;
  hintLayer?: Container;
  playerEid?: number;
  sceneManager?: SceneManager;
  getNpcSig?: (npcId: string) => string;
  talkedSig?: Map<string, string>;
  nearestInteractable?: InteractableHit | null;
}
```

### Шаг 4.2. Создать `EntityLayer`

**Файл:** `src/game/engine/layers/EntityLayer.ts`

```ts
/* engine/layers/EntityLayer.ts — EntityLayer для RenderPipeline */

import type { Application, Container } from 'pixi.js';
import type { World } from 'bitecs';
import type { IRenderLayer, RenderLayerContext } from '../render-layer';
import type { CameraController } from '../camera-controller';
import type { FloatTextLayer } from '../../renderers/float/FloatTextLayer';
import type { InteractableHit } from '../../ecs/ecs-systems/interaction-system';
import type { SceneManager } from '../scene-manager';
import { RenderSystem } from '../../ecs/ecs-systems/render-system';

/**
 * EntityLayer — слой сущностей ECS (игрок, враги, дропы, NPC, объекты).
 *
 * Обёртка над RenderSystem, реализующая IRenderLayer.
 * Выполняет:
 * 1. update(): renderSprites, renderSortSystem, renderVisibilitySystem, renderFlashSystem
 * 2. render(): диспетчеризация через реестры (enemyRegistry, dropRegistry, ...)
 */
export class EntityLayer implements IRenderLayer {
  readonly name = 'entity-layer';
  readonly priority = 10;

  private renderSystem: RenderSystem | null = null;
  private initialized = false;

  init(
    _app: Application,
    ctx: RenderLayerContext
  ): void {
    // RenderSystem уже является синглтоном (см. render-system.ts)
    // Здесь мы просто помечаем слой как инициализированный
    this.initialized = true;
  }

  update(_ctx: RenderLayerContext): void {
    // Пред-рендер обновления (если нужны)
    // Сейчас вся логика update встроена в RenderSystem.render()
  }

  render(ctx: RenderLayerContext): void {
    if (!this.initialized) return;
    if (!ctx.cameraController || !ctx.gameWorld || !ctx.dynamic) return;
    if (ctx.playerEid === undefined) return;

    const opts = {
      world: ctx.world,
      time: ctx.time,
      dt: ctx.dt,
      app: ctx.app!,
      float: ctx.float!,
      cameraController: ctx.cameraController,
      gameWorld: ctx.gameWorld,
      dynamic: ctx.dynamic,
      sceneManager: ctx.sceneManager!,
      hintLayer: ctx.hintLayer!,
      playerEid: ctx.playerEid!,
      getNpcSig: ctx.getNpcSig,
      talkedSig: ctx.talkedSig,
      nearestInteractable: ctx.nearestInteractable,
    };

    // Вызвать RenderSystem.render()
    RenderSystem.render(opts);
  }

  resize(_viewW: number, _viewH: number): void {
    // Камера обновляется через cameraController.resize()
  }

  destroy(): void {
    this.renderSystem = null;
    this.initialized = false;
  }
}
```

### Шаг 4.3. Сделать `RenderSystem` статическим

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`

Текущий код:
```ts
const _renderSystemInstance = new RenderSystem();
export function renderSystem(world, opts) {
  _renderSystemInstance.render(world, opts);
}
```

Нужно сделать публичный статический метод:
```ts
export class RenderSystem {
  // ... существующий код ...

  /** Публичный статический метод для вызова из EntityLayer */
  static render(opts: RenderSystemOptions): void {
    _renderSystemInstance.render(opts);
  }
}
```

### Шаг 4.4. Зарегистрировать `EntityLayer` в `RenderPipeline`

**Файл:** `src/game/engine/engine.ts` (или где создаётся `RenderPipeline`)

```ts
import { RenderPipeline } from './render-pipeline';
import { EntityLayer } from './layers/EntityLayer';

// В init():
this.pipeline = new RenderPipeline();
const entityLayer = new EntityLayer();
this.pipeline.addLayer(entityLayer);
this.pipeline.init(app, context);
```

---

## 4. Контрольные точки

- [ ] `tsc --noEmit` чистый
- [ ] `EntityLayer` реализует `IRenderLayer`
- [ ] `RenderSystem.render()` вызывается из `EntityLayer.render()`
- [ ] Визуально игра не изменилась
- [ ] `grep -n "renderSystem(" src/game/ecs/ecs-systems/render-system.ts` — только статический обёртка

---

## 5. Риски

| Риск | Митигация |
|------|-----------|
| `RenderLayerContext` слишком большой | Поля опциональные (`?`), только `EntityLayer` использует свои |
| `SceneManager` тип не найден | Проверить путь импорта, возможно нужен barrel-export |
| `InteractableHit` циклический импорт | Использовать string-type import или переместить тип |
| app.render() вызывается дважды | `RenderPipeline.render()` НЕ должен вызывать app.render() — это делает `ecs-game-loop.ts` |

---

## 6. Следующие этапы

После завершения Этапа 4:
- **Этап 5:** ParticleLayer — перенос из FxManager
- **Этап 6:** FogLayer — перенос из FxManager.redrawFog
- **Этап 7:** OverlayLayer — виньетка, фейд, снег
- **Этап 8:** HintLayer — подсказки взаимодействия
- **Этап 9:** Удаление `ecs-game-loop.ts` рендер-логики, полная интеграция с `RenderPipeline`

---

## Отчёт о проделанной работе

### Дата: 2026-09-15

### Реализовано: Этап 4 — EntityLayer

#### Что сделано:

1. **Создан файл:** `src/game/engine/layers/EntityLayer.ts`
   - Класс `EntityLayer` реализует `IRenderLayer`
   - `init()` — помечает слой как инициализированный
   - `update()` — пустой (вся логика в RenderSystem)
   - `render()` — собирает `RenderSystemOptions` из `RenderLayerContext` и вызывает `RenderSystem.render(opts)`
   - `resize()` — пустой (камера через `cameraController`)
   - `destroy()` — очистка состояния

2. **Обновлён файл:** `src/game/engine/render-layer.ts`
   - Добавлены опциональные поля в `RenderLayerContext`:
     - `app?: Application`
     - `cameraController?: CameraController`
     - `gameWorld?: Container`
     - `dynamic?: Container`
     - `float?: FloatTextLayer`
     - `hintLayer?: Container`
     - `playerEid?: number`
     - `sceneManager?: SceneManager`
     - `getNpcSig?: (npcId: string) => string`
     - `talkedSig?: Map<string, string>`
     - `nearestInteractable?: InteractableHit | null`

3. **Обновлён файл:** `src/game/ecs/ecs-systems/render-system.ts`
   - Добавлен статический метод `RenderSystem.render(opts)` для вызова из `EntityLayer`
   - Сохранена обратная совместимость с функцией `renderSystem(world, opts)`

4. **Создан barrel-экспорт:** `src/game/engine/layers/index.ts`
   - Экспортирует `EntityLayer`

#### Проверки:
- [ ] `npx tsc --noEmit` — требуется запуск
- [ ] Визуальное сравнение — требуется запуск игры
- [ ] `grep -rn "switch (" src/game/renderers/` — проверка на отсутствие switch

#### Зависимости для следующих этапов:
- Этап 5 (ParticleLayer) зависит от Этапа 4
- Этап 6 (FogLayer) зависит от Этапа 4
- Этап 7 (OverlayLayer) зависит от Этапа 4
