/* map-render-system.ts — ECS-система рендеринга карты (per-tile Graphics).
 *
 * Архитектура:
 *  1. При загрузке карты (EcsMapLoader) создаётся ПО ОДНОМУ Graphics на каждый
 *     видимый тайл земли, стены и дома. Каждый Graphics рисуется в (0,0).
 *  2. Каждый Graphics регистрируется в MapTiles с координатами (x,y).
 *  3. mapRenderSystem(world, opts) вызывается каждый кадр:
 *     — регистрирует все тайлы из MapTiles в RenderQueue.
 *     — RenderQueue сортирует по (layer, y) -> корректный Z-sort.
 *  4. Если карта уничтожена -> все Graphics уничтожаются.
 *
 * Y-sort: zIndex = layer * 100000 + Math.round(y)
 * Каждый тайл -> отдельный Graphics, поэтому игрок может зайти ЗА дом.
 */

import { query, type World } from 'bitecs';
import type { IRenderer, GraphicsHandle, LayerHandle } from '../renderer/IRenderer';
import { getRenderQueue, RENDER_LAYER, type RenderEntry, type Viewport } from './RenderQueue';
import { MapState, MapTiles, type MapTileInfo } from '../ecs/ecs-components';
import { T, Tl, type WorldData } from '../world';
import { drawTileLocal } from '../geometry/tile-geom';
import { drawWallGeometry } from '../geometry/wall-geom';
import { drawHouseGeometry, houseMetrics } from '../geometry/house-geom';
import { logger } from '../debug/logger';

/** Значение "хэндл не создан" (handle'ы IRenderer >= 1) */
const NO_HANDLE = 0;

/**
 * Опции mapRenderSystem (передаются из ecs-game-loop при каждом кадре).
 */
export interface MapRenderSystemOptions {
  renderer?: IRenderer;
  /** Параметры камеры (для viewport culling) */
  viewport?: Viewport;
  /** Снег на крышах домов */
  roofSnow?: boolean;
}

/**
 * mapRenderSystem -> ECS-система: per-tile Graphics -> RenderQueue.
 *
 * Вызывается каждый кадр в фазе render() игрового цикла.
 * Регистрация всех видимых тайлов в RenderQueue для сортировки по (layer, y).
 */
export function mapRenderSystem(world: World, opts: MapRenderSystemOptions = {}): void {
  const queue = getRenderQueue();
  if (!queue) return;
  const viewport = opts.viewport;

  // Проверяем, загружена ли карта
  let mapEid = -1;
  for (const eid of query(world, [MapState])) {
    mapEid = eid;
    break;
  }

  // Карта не загружена -> очищаем RenderQueue от тайлов карты
  if (mapEid < 0) {
    clearMapTilesFromQueue(queue);
    hideLegacyLayerSprites(opts.renderer);
    return;
  }

  // === Регистрируем все тайлы карты в RenderQueue ===
  for (const [key, tile] of MapTiles) {
    const handle = tile.handle;
    if (handle === NO_HANDLE) continue;

    // Проверяем, жив ли Graphics
    if (opts.renderer) {
      try {
        const g = (opts.renderer as any).getGraphicsPixi?.(handle as GraphicsHandle);
        if (!g || g.destroyed) {
          MapTiles.delete(key);
          continue;
        }
      } catch {
        MapTiles.delete(key);
        continue;
      }
    }

    // Добавляем в очередь (upsert по ключу)
    queue.upsert(key, (): RenderEntry => ({
      x: tile.x,
      y: tile.y,
      width: T,
      height: T,
      layer: tile.layer,
      alpha: 1,
      visible: true,
      handle: handle as GraphicsHandle,
    }));
  }

  // === Скрываем legacy-спрайты карты ===
  hideLegacyLayerSprites(opts.renderer);
}

/** Очистить все записи тайлов карты из RenderQueue */
function clearMapTilesFromQueue(queue: ReturnType<typeof getRenderQueue>): void {
  if (!queue) return;
  for (const key of MapTiles.keys()) {
    queue.takeByKey(key);
  }
}

/**
 * Скрыть legacy-спрайты/графику внутри layer containers worldContainer.
 * Вызывается при выгрузке карты (когда сущность MapState удалена).
 */
let _legacyHiddenOnce = false;
function hideLegacyLayerSprites(renderer: IRenderer | undefined): void {
  if (!renderer || _legacyHiddenOnce) return;
  const wc = renderer.getWorldContainer();
  if (!wc) return;
  _legacyHiddenOnce = true;
  for (const child of wc.children ?? []) {
    // Layer containers: sortableChildren + zIndex
    if ((child as any)?.sortableChildren === true && (child as any)?.zIndex != null) {
      for (const sprite of child.children ?? []) {
        sprite.visible = false;
      }
    }
  }
}

// ============================================================
// Генерация per-tile Graphics (вызывается ОДИН раз -> ecs-map-loader)
// ============================================================

/**
 * Создать per-tile Graphics для карты (земля, стены, дома).
 *
 * Вызывается ОДИН раз при загрузке карты (EcsMapLoader.createMapEntity).
 * Каждый тайл получает СВОЙ GraphicsHandle, который рисуется в (0,0).
 * Координаты (x,y) сохраняются в MapTiles.
 * Регистрация в RenderQueue -> задача mapRenderSystem (каждый кадр).
 */
export function createMapTileGraphics(
  map: WorldData,
  renderer: IRenderer,
  opts: { roofSnow?: boolean } = {},
): void {
  if (!map?.tiles || !map.W || !map.H) {
    throw new Error(
      "Invalid map data: tiles=" + !!map?.tiles + ", W=" + map?.W + ", H=" + map?.H,
    );
  }

  const { W, H } = map;
  const roofSnow = opts.roofSnow ?? false;
  let count = 0;

  // Детерминированный шум вариантов
  const rnd = (x: number, y: number, s: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };

  // ===== 1. Ground: один Graphics на каждый тайл (ВСЕХ, включая деревья/дома) =====
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = map.tiles[y * W + x];

      const g = renderer.createGraphics();
      renderer.setGraphicsPosition(g, { x: 0, y: 0 });
      drawTileLocal(g, t, 0, 0, renderer);

      const key = x + "_" + y;
      MapTiles.set(key, {
        handle: g as GraphicsHandle,
        x: x * T,
        y: y * T,
        layer: RENDER_LAYER.GROUND,
      });

      count++;
    }
  }

  // ===== 2. Стены: один Graphics на каждый тайл =====
  const WALL_TILES = new Set<number>([
    Tl.TREE, Tl.ROCK, Tl.PALISADE, Tl.COLUMN, Tl.DWALL, Tl.CAVEWALL,
  ]);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = map.tiles[y * W + x];
      if (!WALL_TILES.has(t)) continue;

      const variant =
        t === Tl.TREE ? ((rnd(x, y, 13) > 0.5 ? 1 : 0) | (rnd(x, y, 13) > 0.7 ? 2 : 0))
        : t === Tl.ROCK ? (rnd(x, y, 11) > 0.5 ? 1 : 0)
        : t === Tl.COLUMN ? ((rnd(x, y, 11) > 0.5 ? 1 : 0) | (rnd(x, y, 13) > 0.7 ? 2 : 0))
        : 0;

      const g = renderer.createGraphics();
      renderer.setGraphicsPosition(g, { x: 0, y: 0 });
      drawWallGeometry(renderer, g, t, variant, map.dungeonId ?? 0, 0, 0);

      const key = "wall_" + x + "_" + y;
      MapTiles.set(key, {
        handle: g as GraphicsHandle,
        x: x * T,
        y: y * T,
        layer: RENDER_LAYER.DYNAMIC,
      });

      count++;
    }
  }

  // ===== 3. Дома: один Graphics на каждый блок домов =====
  const ruinedTiles = new Set<number>();
  for (const r of map.ruinedHouses ?? []) {
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) ruinedTiles.add((r.y + dy) * W + (r.x + dx));
    }
  }

  const houseSeen = new Set<string>();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (map.tiles[y * W + x] !== Tl.HOUSE) continue;
      const key = x + "," + y;
      if (houseSeen.has(key)) continue;

      // Найти размер блока
      let hw = 1, hh = 1;
      while (x + hw < W && map.tiles[y * W + (x + hw)] === Tl.HOUSE) hw++;
      while (y + hh < H) {
        let rowOk = true;
        for (let dx = 0; dx < hw; dx++) {
          if (map.tiles[(y + hh) * W + (x + dx)] !== Tl.HOUSE) { rowOk = false; break; }
        }
        if (!rowOk) break;
        hh++;
      }
      for (let dy = 0; dy < hh; dy++) {
        for (let dx = 0; dx < hw; dx++) houseSeen.add((x + dx) + "," + (y + dy));
      }

      const isRuined = ruinedTiles.has(y * W + x);
      const v = (rnd(x, y, 13) > 0.5 ? 1 : 0) | (rnd(x, y, 11) > 0.6 ? 2 : 0);

      const g = renderer.createGraphics();
      renderer.setGraphicsPosition(g, { x: 0, y: 0 });

      // Метрики дома для локальных координат
      const m = houseMetrics(hw, hh);
      const ox = 0 - m.marginX; // локально в Graphics
      const oy = hh * T + 1 - (m.wallTop + m.wallH + m.foundH);
      drawHouseGeometry(renderer, g, hw, hh, v, isRuined, roofSnow, ox, oy);

      const hkey = "house_" + x + "_" + y;
      MapTiles.set(hkey, {
        handle: g as GraphicsHandle,
        x: x * T,
        y: y * T,
        layer: RENDER_LAYER.DYNAMIC,
      });

      count++;
    }
  }

  logger.info("map-render", "Map tile graphics created: " + count + " Graphics (ground + walls + houses)");
}

/**
 * Уничтожить все per-tile Graphics карты через IRenderer.
 */
export function destroyAllMapTileGraphics(
  renderer: IRenderer,
): void {
  for (const [key, tile] of MapTiles) {
    try {
      renderer.destroyGraphics(tile.handle as GraphicsHandle);
    } catch {
      // уже уничтожен
    }
  }
  MapTiles.clear();
  _legacyHiddenOnce = false;
}
