# Финальный план: RenderQueue + MapRenderSystem

## Суть

1. **RenderQueue** — плоский массив записей `{ x, y, layer, alpha, visible, handle }`.
   Сортировка по `(layer, y)` каждый кадр. В кадре 1000–1500 объектов — тривиально.
2. **MapRenderSystem** — при загрузке карты создаёт `Graphics`-объекты
   (ground-батч + стены + дома) и кладёт их в RenderQueue.
3. **Динамические сущности** (враги, игрок, NPC, дропы) — тоже в RenderQueue.
4. В конце кадра: `queue.flush(renderer)` — одна сортировка, один проход.

## Что удаляем

- `buildAllTileTextures`, `WallTextureCache`, `HouseTextureCache`, `GroundTileCache`
- `__isMapSprite`-костыли, `clearEcsLayerContainers`
- `MapLoaderService` (заменяется на `MapRenderSystem`)
- `renderSortSystem` (заменяется на `queue.flush`)

## Пошаговый план

### Этап 1: RenderQueue (`src/game/render/RenderQueue.ts`)

```ts
export interface RenderEntry {
  x: number;
  y: number;
  layer: number;       // 0=ground, 20=drop, 40=dynamic
  alpha: number;
  visible: boolean;
  handle: GraphicsHandle;
}

export class RenderQueue {
  private entries: RenderEntry[] = [];
  enqueue(e: RenderEntry): void;
  remove(handle: GraphicsHandle): void;
  clear(renderer: IRenderer): void;
  flush(renderer: IRenderer): void;
}
```

### Этап 2: Geometry drawers (`src/game/geometry/`)

- `tile-geom.ts` — `drawTileBatch(renderer, g, map)` — один Graphics на все тайлы.
- `wall-geom.ts` — `drawWallGeometry(renderer, g, type, variant, dungeonId)` — перенос `paintWall()`.
- `house-geom.ts` — `drawHouseGeometry(renderer, g, hw, hh, v, ruined, roofSnow)` — перенос `paintHouse()`.

### Этап 3: MapRenderSystem (`src/game/render/MapRenderSystem.ts`)

```ts
export class MapRenderSystem {
  loadMap(map, renderer, queue, layers): void {
    // 1. Ground: ОДИН Graphics на все тайлы (layer=0)
    // 2. Walls: отдельный Graphics на каждый (layer=40)
    // 3. Houses: отдельный Graphics на каждый (layer=40)
  }
  clear(renderer, queue): void;
}
```

### Этап 4: Интеграция

- `engine.ts` — `loadMapEcs` вызывает `mapRenderSystem.loadMap(...)`.
- `RenderSystem.render()` — динамические сущности обновляют записи в queue.
- `renderSortSystem` удаляется.
- `MapLoaderService` удаляется.

### Этап 5: Очистка

- `clearWorld` вызывает `mapRenderSystem.clear()`.
- `queue.clear(renderer)` вызывает `destroyGraphics` для всех.

## Слой (layer)

| layer | Что |
|-------|-----|
| 0 | Ground-тайлы (фон) |
| 20 | Дропы |
| 40 | Стены, дома, NPC, враги, игрок, снаряды |

## Y-sort

`zIndex = layer * 100000 + Math.round(y)`

## Гарантии

- 28 000 ECS-сущностей на тайлы — НЕТ.
- Один `Graphics` для всего ground-слоя.
- Стены/дома — по одному `Graphics` на объект.
- Одна система сортировки.
