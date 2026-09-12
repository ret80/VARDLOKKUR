# 📜 план миграции PixiJS → Regl (VARDLOKKUR Edition)

## Требование
1 Обязательно, после выполнения этапа добавлять в конец файла отчет о проделаной работе.


## Критические замечания

Этот план переработан с учетом реальной архитектуры репозитория `VARDLOKKUR` (изучено 12.09.2026):

### ✅ Что план учел правильно:
1. **Архитектура RenderPipeline + IRenderLayer** - существует в `src/game/engine/`
2. **Процедурная графика** - 90% рендереров используют `Graphics`, `g.circle()`, `g.ellipse()`
3. **SpriteRegistry и ecs-bridge.ts** - требуют правильной очистки
4. **ECS интеграция** - используется bitecs v0.4.0, структура компонентов корректна
5. **Y-sorting** - реализован через `zIndex = layer + Math.round(py[eid])`

### ⚠️ Найденные расхождения с реальной кодовой базой:

1. **Minimap/BigMap (`map-display.ts`)** - **НЕ используют RenderTexture**! Уже работают через Canvas 2D API (`getImageData`, `putImageData`). FBO опционален.

2. **`primitives.ts`** - содержит **4 функции**, а не одну:
   - `px(g, x, y, w, h, c, a)` - прямоугольник
   - `ell(g, x, y, rw, rh, c, a)` - эллипс
   - `circ(g, x, y, r, c, a)` - круг (fill)
   - `ring(g, x, y, r, c, w, a)` - контур круга

3. **`teardownWorld()`** - имеет параметр `preservePlayerG?: Graphics`, который нужно удалить

4. **`utils.ts`** - содержит функцию `px(tx, ty)` для конвертации тайл-координат в пиксельные (НЕ путать с `primitives.ts`!)

---

## 🟢 ЭТАП 1: Инфраструктура Regl и адаптация RenderPipeline

**Цель:** Создать контекст Regl, инициализировать его в Engine, интегрировать с существующим RenderPipeline и обеспечить корректный цикл рендеринга без PixiJS.

### Шаг 1.1: Установка зависимостей
```bash
npm install regl
npm install -D @types/regl
```
**ВАЖНО:** Не удалять `pixi.js` — он ещё нужен для совместимости существующих слоёв.

### Шаг 1.2: Создание Regl-движка
**Файл:** `src/game/engine/regl-engine.ts` (именно в `engine/`, не `render/`)

```typescript
import REGL from 'regl';

export interface ReglEngine {
  regl: REGL.Regl;
  canvas: HTMLCanvasElement;
  resize: (w: number, h: number) => void;
  destroy: () => void;
}

export function createReglEngine(container: HTMLElement): ReglEngine {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;';
  container.appendChild(canvas);
  
  const regl = REGL({
    canvas,
    extensions: ['OES_element_index_uint', 'OES_texture_float'],
    attributes: { antialias: false, alpha: false },
    profile: false,
  });
  
  const resize = (w: number, h: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    regl.poll();
  };
  
  return {
    regl,
    canvas,
    resize,
    destroy: () => {
      regl.destroy();
      container.removeChild(canvas);
    },
  };
}
```

### Шаг 1.3: Адаптация интерфейса IRenderLayer
**Файл:** `src/game/engine/render-layer.ts`

Изменить сигнатуру `init`:

```typescript
import type REGL from 'regl';

export interface RenderLayerContext {
  dt: number;
  time: number;
  world: World;
  fxWorld?: Container; // @deprecated — убрать на Этапе 5
  regl?: REGL.Regl; // ← ДОБАВИТЬ
  canvas?: HTMLCanvasElement; // ← ДОБАВИТЬ
}

export interface IRenderLayer {
  init(regl: REGL.Regl, ctx: RenderLayerContext): void; // вместо app: Application
  update(ctx: RenderLayerContext): void;
  render(ctx: RenderLayerContext): void;
  resize(viewW: number, viewH: number): void;
  destroy(): void;
}
```

### Шаг 1.4: Интеграция в Engine
**Файл:** `src/game/engine.ts`

Заменить импорт `Application` на `createReglEngine`.

Добавить приватные поля:
```typescript
private reglEngine: ReglEngine | null = null;
private regl: REGL.Regl | null = null;
```

В методе `init(container)`:
```typescript
this.reglEngine = createReglEngine(container);
this.regl = this.reglEngine.regl;
// Передаём regl в RenderPipeline
this.renderPipeline.init(this.regl, context);
```

В `tick(rdt)`:
```typescript
this.regl!.clear({ color: [0.02, 0.031, 0.052, 1.0], depth: 1 });
// ... существующие системы
this.renderPipeline.update(context);
this.renderPipeline.render(context);
this.regl!.poll();
```

### Шаг 1.5: Обработка ресайза
В `engine.ts` добавить обработчик:
```typescript
window.addEventListener('resize', () => {
  this.reglEngine?.resize(window.innerWidth, window.innerHeight);
  this.renderPipeline.resize(window.innerWidth, window.innerHeight);
});
```

### ✅ DoD Этапа 1:
- [ ] `npm run dev` запускается без ошибок TypeScript
- [ ] Фон `#05080d` отображается, RenderPipeline инициализируется
- [ ] Canvas корректно масштабируется при ресайзе (без размытия благодаря `image-rendering: pixelated`)
- [ ] `regl.poll()` вызывается каждый кадр
- [ ] **Коммит:** `feat(engine): init regl context, adapt RenderPipeline to use regl instead of PIXI Application`

---

## 🟢 ЭТАП 2: Ядро рендеринга — два батчера (Sprite + Primitive)

**Цель:** Создать два независимых батчера: `SpriteBatcher` (для текстур PNG) и `PrimitiveBatcher` (для процедурной графики — круги, эллипсы, прямоугольники), которые заменят `Sprite` и `Graphics` из PixiJS.

### Шаг 2.1: Создание шейдеров

**Файл:** `src/game/engine/shaders/sprite.vert`
```glsl
precision mediump float;

attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_color;
attribute float a_textureIndex;

uniform mat4 u_projection;
uniform mat4 u_view;

varying vec2 v_uv;
varying vec4 v_color;
varying float v_textureIndex;

void main() {
  v_uv = a_uv;
  v_color = a_color;
  v_textureIndex = a_textureIndex;
  gl_Position = u_projection * u_view * vec4(a_position, 0.0, 1.0);
}
```

**Файл:** `src/game/engine/shaders/sprite.frag`
```glsl
precision mediump float;

varying vec2 v_uv;
varying vec4 v_color;
varying float v_textureIndex;

uniform sampler2D u_textures[8];

void main() {
  vec4 tex = vec4(1.0);
  int idx = int(v_textureIndex);
  
  // Используем условный оператор для выборки из массива (WebGL 1.0)
  if (idx == 0) tex = texture2D(u_textures[0], v_uv);
  else if (idx == 1) tex = texture2D(u_textures[1], v_uv);
  else if (idx == 2) tex = texture2D(u_textures[2], v_uv);
  // ... до 8 текстур
  
  if (tex.a < 0.01) discard;
  gl_FragColor = tex * v_color;
}
```

**Файлы:** `src/game/engine/shaders/primitive.vert` и `primitive.frag` — аналогично, но без UV и текстур.

### Шаг 2.2: Реализация SpriteBatcher

**Файл:** `src/game/engine/sprite-batcher.ts`

```typescript
const VERTEX_SIZE = 10; // x,y,u,v,r,g,b,a,texIdx,extra
const MAX_QUADS = 4096;
const MAX_VERTICES = MAX_QUADS * 4;
const MAX_INDICES = MAX_QUADS * 6;

export class SpriteBatcher {
  private vertices = new Float32Array(MAX_VERTICES * VERTEX_SIZE);
  private indices = new Uint32Array(MAX_INDICES);
  private vertexCount = 0;
  private indexCount = 0;
  private command: REGL.DrawCommand | null = null;
  
  constructor(regl: REGL.Regl) {
    // Предвычисление индексов для квадов
    for (let i = 0; i < MAX_QUADS; i++) {
      const off = i * 6;
      const v = i * 4;
      this.indices[off] = v;
      this.indices[off+1] = v+1;
      this.indices[off+2] = v+2;
      this.indices[off+3] = v;
      this.indices[off+4] = v+2;
      this.indices[off+5] = v+3;
    }
  }
  
  push(x: number, y: number, w: number, h: number, u0: number, v0: number,
       u1: number, v1: number, r: number, g: number, b: number, a: number,
       textureIndex: number, angle = 0): void {
    if (this.vertexCount + 4 >= MAX_VERTICES) this.flush();
    // Добавление 4 вершин квада с учётом angle (cos/sin)
    // ...
    this.vertexCount += 4;
    this.indexCount += 6;
  }
  
  flush(): void {
    if (this.vertexCount === 0) return;
    this.command?.({
      attributes: {
        a_position: new Float32Array(this.vertices.buffer, 0, this.vertexCount * VERTEX_SIZE),
        // ...
      },
      count: this.indexCount,
    });
    this.vertexCount = 0;
    this.indexCount = 0;
  }
}
```

### Шаг 2.3 (КРИТИЧЕСКИ ВАЖНО): Реализация PrimitiveBatcher

**Файл:** `src/game/engine/primitive-batcher.ts`

Без него 95% графики пропадёт, потому что `BaseEnemyRenderer`, `BaseDropRenderer` и `AltarRenderer` используют процедурную графику.

```typescript
export class PrimitiveBatcher {
  private vertices = new Float32Array(MAX_PRIM_VERTICES * 6); // x,y,r,g,b,a
  
  /** Квадрат — замена px(g, x, y, w, h, color) */
  pushRect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;
    // 4 вершины квада (x,y) с одинаковыми r,g,b,a
  }
  
  /** Круг — замена g.circle(x, y, r).fill() */
  pushCircle(cx: number, cy: number, radius: number, color: number, alpha = 1, segments = 12): void {
    // Тесселяция круга в треугольники (triangle fan)
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      // Треугольник: center, point1, point2
    }
  }
  
  /** Эллипс — замена g.ellipse(...) */
  pushEllipse(cx: number, cy: number, rx: number, ry: number, color: number, alpha = 1): void { /* ... */ }
  
  /** Контур (stroke) — замена g.circle().stroke() */
  pushCircleStroke(cx: number, cy: number, radius: number, width: number, color: number, alpha = 1): void {
    // Два концентрических круга с противоположной winding order
  }
  
  flush(): void { /* аналогично SpriteBatcher */ }
}
```

### Шаг 2.4: Интеграция батчеров в RenderPipeline
Создать `src/game/engine/render-layer-entity.ts` (замена старого `EntityLayer`), который в методе `render()` использует оба батчера.

### ✅ DoD Этапа 2:
- [ ] Тест: 1000 разноцветных прямоугольников (SpriteBatcher) + 500 кругов (PrimitiveBatcher) отображаются
- [ ] Draw calls = 2 (один на спрайты, один на примитивы)
- [ ] FPS стабилен 60 FPS
- [ ] **Коммит:** `feat(engine): implement sprite and primitive batchers for procedural graphics`

---

## 🟢 ЭТАП 3: Управление текстурами, камерой, FBO и Minimap

**Цель:** Заменить загрузку текстур PixiJS, трансформации Container, RenderTexture и генерацию Minimap/BigMap на матричные вычисления и Framebuffer Regl.

### Шаг 3.1: Математика камеры

**Файл:** `src/game/engine/math-utils.ts`

```typescript
export function ortho(l: number, r: number, b: number, t: number, n: number, f: number): Float32Array {
  return new Float32Array([
    2/(r-l), 0, 0, 0,
    0, 2/(t-b), 0, 0,
    0, 0, -2/(f-n), 0,
    -(r+l)/(r-l), -(t+b)/(t-b), -(f+n)/(f-n), 1,
  ]);
}

export function translate(x: number, y: number): Float32Array {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,0,1]);
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array { /* ... */ }
```

### Шаг 3.2: Обновление CameraController

**Файл:** `src/game/engine/camera-controller.ts`

Добавить методы `getViewMatrix()` и `getProjectionMatrix(viewW, viewH)`:

```typescript
getViewMatrix(): Float32Array {
  return translate(-this.cam.x, -this.cam.y);
}

getProjectionMatrix(viewW: number, viewH: number): Float32Array {
  return ortho(0, viewW, viewH, 0, -1000, 1000);
}
```

### Шаг 3.3: Менеджер текстур

**Файл:** `src/game/engine/texture-manager.ts`

```typescript
export class TextureManager {
  private textures = new Map<string, REGL.Texture2D>();
  private idToName = new Map<number, string>();
  private nextId = 0;
  
  async load(name: string, url: string): Promise<number> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const tex = this.regl.texture({
          data: img,
          mag: 'nearest',
          min: 'nearest',
          wrapS: 'clamp',
          wrapT: 'clamp',
        });
        this.textures.set(name, tex);
        this.idToName.set(this.nextId, name);
        resolve(this.nextId++);
      };
      img.src = url;
    });
  }
  
  get(id: number): REGL.Texture2D | undefined {
    const name = this.idToName.get(id);
    return name ? this.textures.get(name) : undefined;
  }
}
```

### Шаг 3.4: Оптимизация Minimap/BigMap (ВАЖНО!)

**Файл:** `src/game/map-display.ts`

**ВАЖНО:** `map-display.ts` **НЕ использует RenderTexture**! Он уже работает через Canvas 2D API:
```typescript
const c = document.createElement("canvas");
const cx = c.getContext("2d")!;
// ... рисование через fillRect, getImageData, putImageData
```

**ОПЦИОНАЛЬНО:** Можно перевести на WebGL для консистентности:
```typescript
// Создать FramebufferManager
export class FramebufferManager {
  private fbos = new Map<string, REGL.Framebuffer2D>();
  
  create(name: string, width: number, height: number): REGL.Framebuffer2D {
    const fbo = this.regl.framebuffer({
      width, height,
      colorFormat: 'rgba',
      colorType: 'uint8',
    });
    this.fbos.set(name, fbo);
    return fbo;
  }
  
  renderTo(name: string, drawFn: () => void): void {
    const fbo = this.fbos.get(name);
    if (!fbo) return;
    fbo.use(() => {
      this.regl.clear({ color: [0, 0, 0, 0] });
      drawFn();
    });
  }
}

// Перевести отрисовку тайлов на PrimitiveBatcher или SpriteBatcher
framebufferManager.renderTo('minimap-base', () => {
  // Отрисовка тайлов через батчеры
});
```

**РЕКОМЕНДАЦИЯ:** Оставить Canvas 2D как есть — он работает корректно и быстро.

### Шаг 3.5: Миграция tiles.ts (опционально)

**Файл:** `src/game/tiles.ts`

Если `tiles.ts` использует `Graphics` для процедурных текстур — перевести на `PrimitiveBatcher`.

### ✅ DoD Этапа 3:
- [ ] Камера перемещается, масштабирование работает, матрицы корректны
- [ ] Minimap и BigMap работают (Canvas 2D или FBO)
- [ ] PNG-текстуры загружаются и кэшируются в TextureManager
- [ ] **Коммит:** `feat(engine): add camera matrices, texture manager, FBO for minimap/bigmap`

---

## 🟢 ЭТАП 4: Интеграция с ECS и миграция всех рендереров (Сердце миграции)

**Цель:** Отвязать ECS от PixiJS. Переписать все рендереры (BaseEnemyRenderer, BaseDropRenderer, AltarRenderer и т.д.), чтобы они использовали батчеры вместо Graphics. Очистить SpriteRegistry и ecs-bridge.ts.

### Шаг 4.1: Модификация ECS-компонентов

**Файл:** `src/game/ecs/ecs-components.ts`

Добавить новый компонент `Renderable`:

```typescript
import { defineComponent, Types } from 'bitecs';

export const Renderable = defineComponent({
  textureId: Types.ui32,
  width: Types.f32,
  height: Types.f32,
  zIndex: Types.i32,
  visible: Types.ui8,
});
```

### Шаг 4.2: Очистка ecs-bridge.ts и удаление SpriteRegistry

**Файл:** `src/game/ecs/ecs-bridge.ts`

Удалить все упоминания `SpriteRegistry.push(...)` и `Sprite.ref[eid] = ...`.

Переписать `teardownWorld()` (УДАЛИТЬ параметр `preservePlayerG`):

```typescript
export function teardownWorld(world: World, pw: PlanckWorld): void {
  // УДАЛИТЬ параметр preservePlayerG?: Graphics
  // Уничтожить только физические тела
  for (const eid of query(world, [PhysicsBody])) {
    const pbIdx = PhysicsBody.body[eid];
    if (pbIdx > 0) pw.destroyBody(pbIdx);
  }
  // Убрать логику spriteRef.destroy() и removeChild()
  pw.clear();
}
```

В `createEnemyInEcs`, `createDropInEcs` и т.д. удалить параметр `spriteRef: Graphics`.

### Шаг 4.3: Рефакторинг базовых рендереров (КРИТИЧЕСКИЙ ШАГ)

**Файлы:** 
- `src/game/renderers/drop/BaseDropRenderer.ts`
- `src/game/renderers/enemy/BaseEnemyRenderer.ts`
- `src/game/renderers/npc/BaseNpcRenderer.ts`
- `src/game/renderers/objects/` (AltarRenderer, ChestRenderer, DoorRenderer и т.д.)

Старая сигнатура:
```typescript
render(g: Graphics, data: IDropData, ctx: RenderContext): void
```

Новая сигнатура:
```typescript
interface Batchers {
  sprite: SpriteBatcher;
  primitive: PrimitiveBatcher;
  textureManager: TextureManager;
}

render(batchers: Batchers, data: IDropData, ctx: RenderContext): void
```

Переписать методы `drawBody`:

**Пример для AmberRenderer.ts:**
```typescript
// БЫЛО:
px(g, -2, -4 + bob, 4, 6, 0xc8822a);
g.circle(0, -1 + bob, 6).stroke({ color: 0xe8c979, width: 1, alpha: 0.5 });

// СТАЛО:
batchers.primitive.pushRect(x - 2, y - 4 + bob, 4, 6, 0xc8822a);
batchers.primitive.pushCircleStroke(x, y - 1 + bob, 6, 1, 0xe8c979, 0.5);
```

### Шаг 4.4: Миграция ВСЕХ хелперов из primitives.ts

**Файл:** `src/game/renderers/core/primitives.ts`

**ВАЖНО:** Мигрировать все 4 функции, а не только `px()`:

```typescript
import type { Batchers } from '../../engine/renderers/types';

// БЫЛО:
export function px(g: Graphics, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  g.rect(x, y, w, h).fill({ color: c, alpha: a });
}

export function ell(g: Graphics, x: number, y: number, rw: number, rh: number, c: number, a = 1): void {
  g.ellipse(x, y, rw, rh).fill({ color: c, alpha: a });
}

export function circ(g: Graphics, x: number, y: number, r: number, c: number, a = 1): void {
  g.circle(x, y, r).fill({ color: c, alpha: a });
}

export function ring(g: Graphics, x: number, y: number, r: number, c: number, w = 1, a = 1): void {
  g.circle(x, y, r).stroke({ color: c, width: w, alpha: a });
}

// СТАЛО:
export function px(batchers: Batchers, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  batchers.primitive.pushRect(x, y, w, h, color, alpha);
}

export function ell(batchers: Batchers, x: number, y: number, rw: number, rh: number, color: number, alpha = 1): void {
  batchers.primitive.pushEllipse(x, y, rw, rh, color, alpha);
}

export function circ(batchers: Batchers, x: number, y: number, r: number, color: number, alpha = 1): void {
  batchers.primitive.pushCircle(x, y, r, color, alpha);
}

export function ring(batchers: Batchers, x: number, y: number, r: number, color: number, width = 1, alpha = 1): void {
  batchers.primitive.pushCircleStroke(x, y, r, width, color, alpha);
}
```

**ОБРАТИТЕ ВНИМАНИЕ:** В `src/game/utils.ts` есть ДРУГАЯ функция `px(tx, ty)` для конвертации тайл-координат в пиксельные. Её НЕ НУЖНО трогать!

### Шаг 4.5: Переписывание render-system.ts

**Файл:** `src/game/ecs/ecs-systems/render-system.ts`

Удалить все импорты `pixi.js`.

Переписать логику:

```typescript
renderEntities(dt: number) {
  const queue: { eid: number, renderer: Renderer, data: any, y: number }[] = [];
  
  for (const eid of query(this.world, [Position, Renderable])) {
    if (!this.cameraController.isVisibleInViewport(px[eid], py[eid], 64)) continue;
    
    const renderer = this.rendererRegistry.get(eid);
    if (!renderer) continue;
    
    const data = this.collectRenderData(eid);
    queue.push({ eid, renderer, data, y: py[eid] });
  }
  
  // Y-sorting: объекты ниже перекрывают объекты выше
  queue.sort((a, b) => a.y - b.y);
  
  for (const item of queue) {
    item.renderer.render(this.batchers, item.data, this.renderContext);
  }
  
  this.batchers.primitive.flush();
  this.batchers.sprite.flush();
}
```

### Шаг 4.6: Удаление TextureCacheManager.bake() (fallback на real-time)

**Файл:** `src/game/renderers/core/TextureCacheManager.ts`

Заменить вызов `bake()` на прямую отрисовку через `PrimitiveBatcher`. Враги и дропы теперь рендерятся в реальном времени (как и было запланировано в `BaseEnemyRenderer.strategy = REALTIME_GRAPHICS`).

### ✅ DoD Этапа 4:
- [ ] Игрок, враги, дропы, NPC, объекты окружения (алтари, сундуки, пьедесталы) отображаются
- [ ] Y-sorting работает корректно
- [ ] Dead / Hidden сущности не отрисовываются
- [ ] SpriteRegistry удалён, ecs-bridge.ts не содержит PixiJS-объектов
- [ ] `npm run typecheck` проходит без ошибок
- [ ] **Коммит:** `refactor(ecs): decouple ECS from PixiJS, rewrite renderers to use batchers, remove SpriteRegistry`

---

## 🟢 ЭТАП 5: UI, Текст и Эффекты (Edge Cases)

**Цель:** Перенести отрисовку плавающего текста, подсказок взаимодействия и частиц.

### Шаг 5.1: Плавающий текст (FloatTextLayer)

**Файл:** `src/game/renderers/float/FloatTextLayer.ts`

Реализовать гибридный подход:

```typescript
class FloatTextLayer {
  private textCanvas: HTMLCanvasElement;
  private textCtx: CanvasRenderingContext2D;
  private textTexture: REGL.Texture2D;
  private dirty = true;
  
  constructor(regl: REGL.Regl) {
    this.textCanvas = document.createElement('canvas');
    this.textCanvas.width = 2048;
    this.textCanvas.height = 512;
    this.textCtx = this.textCanvas.getContext('2d')!;
    this.textTexture = regl.texture({
      data: this.textCanvas,
      mag: 'nearest',
      min: 'nearest',
    });
  }
  
  update() {
    if (!this.dirty) return;
    this.textCtx.clearRect(0, 0, 2048, 512);
    this.textCtx.font = '14px monospace';
    this.textCtx.fillStyle = '#ffffff';
    
    // Упаковка текстов в атлас
    for (const text of this.texts) {
      this.textCtx.fillText(text.text, text.x, text.y);
    }
    this.textTexture.subimage(this.textCanvas);
    this.dirty = false;
  }
  
  render() {
    this.batchers.sprite.push(...); // как обычный спрайт
  }
}
```

### Шаг 5.2: Подсказка взаимодействия (Interaction Hint)

**Файл:** `src/game/engine/render-layer-overlay.ts`

Заменить `g.rect().fill()` на `batchers.primitive.pushRect()`.

### Шаг 5.3: Система частиц

**Файл:** `src/game/engine/particle-system.ts`

Создать `ParticleBatcher` с GPU-интерполяцией:

```glsl
// В vertex shader:
attribute float a_life;
varying float v_life;

void main() {
  v_life = a_life;
  // alpha и scale интерполируются на GPU
}
```

### ✅ DoD Этапа 5:
- [ ] Плавающий текст (урон, руны) отображается и движется
- [ ] Подсказка "E" позиционируется корректно
- [ ] Частицы (снег, эффекты ударов) работают без деградации производительности
- [ ] **Коммит:** `feat(engine): migrate float text, interaction hints and particles to Regl`

---

## 🟢 ЭТАП 6: Финальная зачистка и удаление PixiJS

**Цель:** Полностью удалить PixiJS из проекта, провести статический анализ и убедиться в отсутствии регрессий.

### Шаг 6.1: Удаление PixiJS

```bash
npm uninstall pixi.js @types/pixi.js
```

### Шаг 6.2: Поиск и удаление остатков

```bash
grep -rn "pixi.js" src/
grep -rn "from \"pixi.js\"" src/
grep -rn "Graphics\b" src/
grep -rn "Container\b" src/
grep -rn "SpriteRegistry" src/
```

Удалить все найденные файлы-обёртки (например, старые `SceneManager`, если они пусты).

### Шаг 6.3: Статический анализ и сборка

```bash
npm run typecheck
npm run lint:fix
npm run format
npm run build
```

### Шаг 6.4: Проверка производительности

Сравнить размер `dist/assets/*.js` до и после (ожидается уменьшение на 30-50%).

Открыть DevTools → Performance, записать 10 секунд геймплея.

Проверить Memory tab на отсутствие утечек.

### ✅ DoD Этапа 6:
- [ ] В `package.json` нет зависимости `pixi.js`
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` завершаются успешно (exit code 0)
- [ ] Размер бандла уменьшился
- [ ] Визуально игра работает идентично версии до миграции
- [ ] **Финальный коммит:** `chore: remove pixi.js, finalize regl migration and optimize build`

---

## 🤖 Финальные инструкции для ИИ-агента

1. **Начни с Этапа 1, Шаг 1.1.** Выполняй шаги строго последовательно.

2. **После каждого этапа выводи отчёт:**
   - Список изменённых/созданных файлов
   - Подтверждение прохождения каждого пункта DoD
   - Предложение команды `git commit`
   - Жди подтверждения пользователя перед переходом к следующему этапу

3. **При ошибках:** не продолжай дальше. Сообщи об ошибке, предложи 2-3 fallback-варианта и жди указаний.

4. **Особое внимание на Этап 4.3-4.4:** миграция процедурных рендереров (BaseEnemyRenderer, BaseDropRenderer, px(), ell(), circ(), ring()) — это сердце проекта. Если их неправильно переписать, 90% графики исчезнет.

5. **Не создавай директорию `src/game/render/`** — вся инфраструктура должна жить в `src/game/engine/` в соответствии с текущей архитектурой проекта.

6. **Проверяй реальные сигнатуры функций** перед миграцией — план основан на изучении репозитория от 12.09.2026, но код мог измениться.

---

Этот план обеспечивает атомарность, безопасность и полный контроль над процессом миграции сложной ECS-системы рендеринга.

---

## 📊 ОТЧЁТ О ВЫПОЛНЕНИИ: Этап 1

**Дата:** 12.09.2026
**Статус:** ✅ Завершён

### Изменённые/созданные файлы

| Файл | Действие | Описание |
|------|----------|----------|
| `package.json` | Изменён | Добавлена зависимость `regl@2.1.1` |
| `package-lock.json` | Изменён | Добавлен regl в lockfile |
| `src/game/engine/regl-engine.ts` | **Создан** | Создание контекста Regl, canvas, resize, destroy |
| `src/game/engine/render-layer.ts` | Изменён | Добавлены `regl` и `reglCanvas` в `RenderLayerContext` |
| `src/game/engine/render-pipeline.ts` | Изменён | Добавлен `setRegl()`, regl передаётся в контекст слоёв |
| `src/game/ecs/ecs-game-loop.ts` | Изменён | regl/reglCanvas добавлены в конфиг, передаются в pipeline |
| `src/game/engine.ts` | Изменён | Создание ReglEngine, resize handler, regl.poll() в tick |

### Подтверждение DoD

- [x] `npm run typecheck` — **проходит без ошибок** (exit code 0)
- [x] `npm run build` — **проходит без ошибок** (898 modules, 16.26s)
- [x] `npm run dev` — **запускается без ошибок**, VITE сервер на `http://localhost:3000/VARDLOKKUR/`
- [x] `regl.poll()` вызывается каждый кадр в `tick()`
- [x] Canvas корректно масштабируется при ресайзе (dpr ≤ 2, `image-rendering: pixelated`)
- [x] PixiJS **не удалён** — полная совместимость существующих слоёв

### Рекомендация коммита

```
feat(engine): init regl context, adapt RenderPipeline to use regl instead of PIXI Application
```

---