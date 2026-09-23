# 🎯 Финальный план: RenderQueue + MapRenderSystem

## Архитектура

```
MapRenderSystem.loadMap()
  ├─ Ground: 1 GraphicsHandle (все тайлы батчатся)
  ├─ Walls:  ~500 GraphicsHandle (дерево = 1 Graphics)
  └─ Houses: ~50 GraphicsHandle (дом = 1 Graphics)
       ↓
   RenderQueue.enqueue()
   ├─ isVisibleInViewport() → отбрасываем если вне экрана
   └─ добавляем RenderEntry {x, y, layer, alpha, visible, handle}
       ↓
   renderSortSystem УДАЛЁН
       ↓
   queue.flush(renderer)
   └─ сортировка по (layer, y) + setGraphicsPosition
```

---

## 📋 Пошаговая реализация

### Этап 1: RenderQueue

**Файл:** `src/game/render/RenderQueue.ts`

```typescript
import type { IRenderer, GraphicsHandle } from "../renderer/IRenderer";

export interface RenderEntry {
  x: number;
  y: number;
  layer: number;
  alpha: number;
  visible: boolean;
  handle: GraphicsHandle;
}

export class RenderQueue {
  private entries: RenderEntry[] = [];

  enqueue(entry: RenderEntry, renderer: IRenderer): void {
    // Viewport Culling: если вне экрана — не добавляем
    if (!renderer.isVisibleInViewport({ x: entry.x, y: entry.y }, 32)) return;
    this.entries.push(entry);
  }

  remove(handle: GraphicsHandle): void {
    this.entries = this.entries.filter(e => e.handle !== handle);
  }

  clear(renderer: IRenderer): void {
    for (const entry of this.entries) {
      renderer.destroyGraphics(entry.handle);
    }
    this.entries.length = 0;
  }

  flush(renderer: IRenderer): void {
    // Сортировка: layer по возрастанию, y по возрастанию
    this.entries.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      return a.y - b.y;
    });

    for (const entry of this.entries) {
      renderer.setGraphicsPosition(entry.handle, { x: entry.x, y: entry.y });
      renderer.setGraphicsAlpha(entry.handle, entry.alpha);
      renderer.setGraphicsVisible(entry.handle, entry.visible);
      renderer.setGraphicsZIndex(entry.handle, entry.layer * 100000 + Math.round(entry.y));
    }
  }
}
```

---

### Этап 2: Geometry Drawers

**Файл:** `src/game/geometry/tile-geom.ts`

```typescript
import type { IRenderer, GraphicsHandle } from "../renderer/IRenderer";
import { T, Tl, WorldData } from "../world";

const TILE_COLORS: Record<number, { r: number; g: number; b: number }> = {
  [Tl.WATER]:  { r: 0.04, g: 0.09, b: 0.13 },
  [Tl.SHORE]:  { r: 0.29, g: 0.35, b: 0.39 },
  [Tl.SNOW]:   { r: 0.55, g: 0.60, b: 0.65 },
  [Tl.SNOW2]:  { r: 0.49, g: 0.55, b: 0.60 },
  [Tl.PATH]:   { r: 0.33, g: 0.39, b: 0.43 },
  [Tl.FOREST]: { r: 0.15, g: 0.20, b: 0.24 },
  [Tl.TREE]:   { r: 0.11, g: 0.15, b: 0.18 },
  [Tl.ROCK]:   { r: 0.32, g: 0.36, b: 0.42 },
  // ... все из старого tiles.ts
};

const rnd = (x: number, y: number, s: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

// ОДИН Graphics на ВСЕ тайлы карты
export function drawTileBatch(
  renderer: IRenderer,
  g: GraphicsHandle,
  map: WorldData
): void {
  renderer.clearGraphics(g);

  for (let y = 0; y < map.H; y++) {
    for (let x = 0; x < map.W; x++) {
      const tile = map.tiles[y * map.W + x];
      const base = TILE_COLORS[tile] ?? { r: 0.1, g: 0.1, b: 0.1 };

      // Bottom-Origin: тайл рисуется в отрицательных Y
      renderer.drawRect(
        g,
        { x: x * T, y: -(y * T + T), width: T, height: T },
        { r: base.r, g: base.g, b: base.b, a: 1 },
        true
      );

      // Dithering (шум) из старого tiles.ts
      for (let i = 0; i < 6; i++) {
        const px = x * T + Math.floor(rnd(x, y, i) * T);
        const py = -(y * T + T) + Math.floor(rnd(y, x, i + 9) * T);
        const c = i % 2
          ? { r: base.r * 0.7, g: base.g * 0.7, b: base.b * 0.7, a: 1 }
          : { r: Math.min(1, base.r * 1.3), g: Math.min(1, base.g * 1.3), b: Math.min(1, base.b * 1.3), a: 1 };
        renderer.drawRect(g, { x: px, y: py, width: 1, height: 1 }, c, true);
      }
    }
  }
}
```

**Файл:** `src/game/geometry/wall-geom.ts`

```typescript
import type { IRenderer, GraphicsHandle } from "../renderer/IRenderer";
import { Tl } from "../world";

const hexToRgb = (hex: number) => ({
  r: ((hex >> 16) & 255) / 255,
  g: ((hex >> 8) & 255) / 255,
  b: (hex & 255) / 255,
  a: 1
});

// Один Graphics на одно дерево/камень
export function drawWallGeometry(
  renderer: IRenderer,
  g: GraphicsHandle,
  type: number,
  variant: number,
  dungeonId: number,
  canvasH = 36
): void {
  renderer.clearGraphics(g);

  // P(x, yFromTop, w, h, color) — Bottom-Origin инверсия Y
  const P = (x: number, yFromTop: number, w: number, h: number, colorHex: number) => {
    renderer.drawRect(
      g,
      { x, y: -(canvasH - yFromTop), width: w, height: h },
      hexToRgb(colorHex),
      true
    );
  };

  // Перенос всей логики из paintWall() tiles.ts
  if (type === Tl.TREE) {
    // Ель / Сосна
    if (variant & 1) {
      P(7, 4, 3, 12, 0x241d14);
      P(7, 4, 1, 12, 0x2f2618);
      P(3, 2, 11, 3, 0x1d2b22);
      // ... вся остальная логика
    }
  } else if (type === Tl.ROCK) {
    P(2, 5, 12, 10, 0x4e5a68);
    // ...
  }
  // ... другие типы
}
```

**Файл:** `src/game/geometry/house-geom.ts`

```typescript
import type { IRenderer, GraphicsHandle } from "../renderer/IRenderer";
import { houseMetrics } from "../tiles";

const hexToRgb = (hex: number, alpha = 1) => ({
  r: ((hex >> 16) & 255) / 255,
  g: ((hex >> 8) & 255) / 255,
  b: (hex & 255) / 255,
  a: alpha
});

export function drawHouseGeometry(
  renderer: IRenderer,
  g: GraphicsHandle,
  hw: number,
  hh: number,
  v: number,
  ruined = false,
  roofSnow = true
): void {
  renderer.clearGraphics(g);
  const { canvasH, canvasW, marginX, wallW, wallH, topPad, wallTop, foundH } = houseMetrics(hw, hh);

  // R(x, yFromTop, w, h, color) — Bottom-Origin
  const R = (x: number, yFromTop: number, w: number, h: number, colorHex: number, alpha = 1) => {
    renderer.drawRect(
      g,
      { x, y: -(canvasH - yFromTop), width: w, height: h },
      hexToRgb(colorHex, alpha),
      true
    );
  };

  // CIRC(x, yFromTop, r, color) → drawEllipse
  const CIRC = (x: number, yFromTop: number, r: number, colorHex: number, alpha = 1) => {
    renderer.drawEllipse(
      g, x, -(canvasH - yFromTop), r, r,
      hexToRgb(colorHex, alpha)
    );
  };

  // POLY(points, color) → drawPoly с Bottom-Origin
  const POLY = (points: [number, number][], colorHex: number, alpha = 1) => {
    const flat = points.flatMap(([x, yFromTop]) => [x, -(canvasH - yFromTop)]);
    renderer.drawPoly(g, flat, hexToRgb(colorHex, alpha));
  };

  // HOLE — замена destination-out (полупрозрачный тёмный прямоугольник)
  const HOLE = (x: number, yFromTop: number, w: number, h: number) => {
    renderer.drawRect(
      g,
      { x, y: -(canvasH - yFromTop), width: w, height: h },
      { r: 0.1, g: 0.08, b: 0.06, a: 0.45 },
      true
    );
  };

  // Перенос всей логики из paintHouse() tiles.ts
  // Фундамент
  R(marginX, wallTop + wallH, wallW, foundH, 0x2a1f14);
  // Стены
  R(marginX, wallTop, wallW, wallH, 0x4a3624);
  // Крыша (двускатная)
  POLY([
    [marginX, wallTop],
    [marginX + wallW / 2, topPad],
    [marginX + wallW, wallTop]
  ], 0x3a2a1a);

  // Окна, двери, камин — CIRC и R
  // Руины — HOLE вместо destination-out
}
```

---

### Этап 3: MapRenderSystem

**Файл:** `src/game/render/MapRenderSystem.ts`

```typescript
import type { IRenderer, GraphicsHandle } from "../renderer/IRenderer";
import type { WorldData } from "../world";
import { Tl } from "../world";
import { RenderQueue, RenderEntry } from "./RenderQueue";
import { drawTileBatch } from "../geometry/tile-geom";
import { drawWallGeometry } from "../geometry/wall-geom";
import { drawHouseGeometry } from "../geometry/house-geom";

export class MapRenderSystem {
  private groundHandle: GraphicsHandle | null = null;
  private wallHandles: GraphicsHandle[] = [];
  private houseHandles: GraphicsHandle[] = [];

  loadMap(
    map: WorldData,
    renderer: IRenderer,
    queue: RenderQueue,
    tileLayer: any,
    dynamicLayer: any
  ): void {
    // === 1. GROUND: один Graphics на все тайлы ===
    this.groundHandle = renderer.createGraphics(tileLayer);
    drawTileBatch(renderer, this.groundHandle, map);

    queue.enqueue({
      x: 0,
      y: 0,
      layer: 0,
      alpha: 1,
      visible: true,
      handle: this.groundHandle
    }, renderer);

    // === 2. WALLS: отдельный Graphics на каждую стену ===
    for (let y = 0; y < map.H; y++) {
      for (let x = 0; x < map.W; x++) {
        const tile = map.tiles[y * map.W + x];
        if (tile === Tl.TREE || tile === Tl.ROCK || tile === Tl.PALISADE || tile === Tl.COLUMN) {
          const handle = renderer.createGraphics(dynamicLayer);
          const variant = (x + y) & 3;
          drawWallGeometry(renderer, handle, tile, variant, 0);

          this.wallHandles.push(handle);

          // Bottom-Origin: (x, y) — это "ноги" объекта
          queue.enqueue({
            x: x * 16 + 8,
            y: (y + 1) * 16,
            layer: 40,
            alpha: 1,
            visible: true,
            handle: handle
          }, renderer);
        }
      }
    }

    // === 3. HOUSES: отдельный Graphics на каждый дом ===
    // Логика детектирования домов (hw, hh, variant, ruined, roofSnow)
    // переносится из старого map-loader-service.ts
    for (const house of detectHouses(map)) {
      const handle = renderer.createGraphics(dynamicLayer);
      drawHouseGeometry(renderer, handle, house.hw, house.hh, house.v, house.ruined, house.roofSnow);

      this.houseHandles.push(handle);

      queue.enqueue({
        x: house.x * 16,
        y: (house.y + house.hh) * 16, // Bottom-Origin: низ дома
        layer: 40,
        alpha: 1,
        visible: true,
        handle: handle
      }, renderer);
    }
  }

  clear(renderer: IRenderer, queue: RenderQueue): void {
    queue.clear(renderer);

    this.groundHandle = null;
    this.wallHandles.length = 0;
    this.houseHandles.length = 0;
  }
}

// Заглушка для детектирования домов
function detectHouses(map: WorldData): any[] {
  // Перенос логики из map-loader-service.ts
  return [];
}
```

---

### Этап 4: Интеграция в engine.ts

```typescript
// src/game/engine.ts
import { RenderQueue } from "./render/RenderQueue";
import { MapRenderSystem } from "./render/MapRenderSystem";

const renderQueue = new RenderQueue();
const mapRenderSystem = new MapRenderSystem();

async function loadMapEcs(map: WorldData) {
  // Очистка старого мира
  mapRenderSystem.clear(renderer, renderQueue);

  // Загрузка карты через MapRenderSystem
  mapRenderSystem.loadMap(
    map,
    renderer,
    renderQueue,
    tileLayer,
    dynamicLayer
  );
}

// В игровом цикле:
function gameLoop() {
  // ... физика, AI, input ...

  // Динамические сущности добавляют себя в queue
  renderDynamicEntities(renderQueue, renderer);

  // Один flush в конце кадра
  renderQueue.flush(renderer);
  renderer.render();
}
```

---

### Этап 5: Удаление Legacy

| Удалить | Причина |
|---------|---------|
| `buildAllTileTextures()` из `tiles.ts` | Заменено на `drawTileBatch()` |
| `WallTextureCache`, `HouseTextureCache`, `GroundTileCache` | Не нужны |
| `createTextureFromCanvas()` | Не нужен |
| `renderSortSystem` | Заменён на `queue.flush()` |
| `MapLoaderService` | Заменён на `MapRenderSystem` |
| `__isMapSprite` костыли | Не нужны |
| `clearEcsLayerContainers` | `queue.clear()` делает это |

---

## 📊 Сводка

| Слой | Что | Graphics |
|------|-----|----------|
| `layer = 0` | Ground (вся карта) | **1** Graphics |
| `layer = 20` | Дропы (динамика) | По 1 на дроп |
| `layer = 40` | Стены, дома, NPC, враги, игрок | По 1 на объект |

**Y-sort:** `zIndex = layer * 100000 + Math.round(y)`

**Viewport Culling:** Встроен в `RenderQueue.enqueue()` — невидимое отбрасывается сразу.

**Очистка:** `queue.clear(renderer)` корректно вызывает `destroyGraphics()` для всех handle'ов.

План готов к реализации.