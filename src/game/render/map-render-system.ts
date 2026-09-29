/* map-render-system.ts — ECS-система рендеринга карты.
 *
 * Архитектура:
 *  1. Ground: ОДИН Graphics на ВСЮ карту (через drawTileBatch).
 *     Рисуются ОДИН раз при загрузке карты, каждый кадр — один draw call.
 *  2. Стены: один Graphics на каждый тайл (варианты деревьев/скал).
 *  3. Дома: один Graphics на каждый блок домов.
 *  4. mapRenderSystem(world, opts) вызывается каждый кадр:
 *     — ground: один entry в RenderQueue.
 *     — стены/дома: enqueue видимых тайлов.
 *  5. RenderQueue.flush() — сортировка по (layer, y) -> Z-sort.
 *
 * Важно: тайлы статичны — рисуем ОДИН раз при загрузке карты.
 */

import { query, type World } from 'bitecs';
import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';
import { getRenderQueue, RENDER_LAYER, type Viewport } from './RenderQueue';
import { MapState, MapTiles } from '../ecs/ecs-components';
import { T, Tl, type WorldData } from '../world';
import { drawTileBatch, drawTileLocal } from '../geometry/tile-geom';
import { drawWallGeometry } from '../geometry/wall-geom';
import { drawHouseGeometry, houseMetrics } from '../geometry/house-geom';
import { logger } from '../debug/logger';

/** Ground Graphics для карты (один на всю карту) */
let _groundGraphics: GraphicsHandle | null = null;

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
 * Каждый кадр:
 *  1. Вычисление видимого диапазона тайлов из viewport.
 *  2. Для каждого видимого тайла: enqueue из MapTiles (без перерисовки).
 *  3. RenderQueue.flush() — сортировка по (layer, y), viewport culling, zIndex.
 *
 * Тайлы статичны — рисуются ОДИН раз при загрузке карты.
 */
export function mapRenderSystem(world: World, opts: MapRenderSystemOptions = {}): void {
  const queue = getRenderQueue();
  if (!queue) return;
  const viewport = opts.viewport;

  // Проверяем, загружена ли карта
  let mapEid = -1;
  let mapW = 0, mapH = 0;
  for (const eid of query(world, [MapState])) {
    mapEid = eid;
    mapW = MapState[eid].width;
    mapH = MapState[eid].height;
    break;
  }

  // Карта не загружена -> очередь уже пуста (flush очищает после каждого кадра)
  if (mapEid < 0) {
    hideLegacyLayerSprites(opts.renderer);
    return;
  }

  // === 1. Ground: единый Graphics на всю карту ===
  if (_groundGraphics) {
    queue.enqueue({
      x: 0,
      y: 0,
      width: mapW * T,
      height: mapH * T,
      layer: RENDER_LAYER.GROUND,
      alpha: 1,
      visible: true,
      skipCull: true, // ground всегда рисуем (viewport culling не нужен)
      handle: _groundGraphics,
    });
  }

  // === 2. Wall тайлы — отдельный Graphics на каждый тайл (варианты) ===
  if (viewport) {
    const startTileX = Math.max(0, Math.floor(viewport.camX / T));
    const endTileX = Math.min(mapW - 1, Math.ceil((viewport.camX + viewport.viewW) / T));
    const startTileY = Math.max(0, Math.floor(viewport.camY / T));
    const endTileY = Math.min(mapH - 1, Math.ceil((viewport.camY + viewport.viewH) / T));

    for (let y = startTileY; y <= endTileY; y++) {
      for (let x = startTileX; x <= endTileX; x++) {
        const tile = MapTiles.get(`wall_${x}_${y}`);
        if (tile && tile.handle) {
          queue.enqueue({
            x: tile.x,
            y: tile.y,
            width: T,
            height: T,
            layer: tile.layer,
            alpha: 1,
            visible: true,
            handle: tile.handle as GraphicsHandle,
          });
        }
      }
    }

    // === 3. House тайлы — отдельный Graphics на каждый дом ===
    const HOUSE_CULL_PAD = T * 4; // запас для bounding box дома
    for (const [key, tile] of MapTiles) {
      if (!key.startsWith('house_')) continue;
      if (!tile.handle) continue;
      // AABB-пересечение bounding box дома с viewport
      const houseW = T * 4;
      const houseH = T * 4;
      if (
        tile.x + houseW + HOUSE_CULL_PAD >= viewport.camX &&
        tile.x - HOUSE_CULL_PAD <= viewport.camX + viewport.viewW &&
        tile.y + houseH + HOUSE_CULL_PAD >= viewport.camY &&
        tile.y - HOUSE_CULL_PAD <= viewport.camY + viewport.viewH
      ) {
        queue.enqueue({
          x: tile.x,
          y: tile.y,
          width: T * 4, // запас для bounding box дома
          height: T * 4,
          layer: tile.layer,
          alpha: 1,
          visible: true,
          handle: tile.handle as GraphicsHandle,
        });
      }
    }
    // Конец if (viewport) для walls/houses
  }

  // === 4. Скрываем legacy-спрайты карты ===
  hideLegacyLayerSprites(opts.renderer);
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
 * Создать Graphics для карты (земля, стены, дома).
 *
 * Вызывается ОДИН раз при загрузке карты (EcsMapLoader.createMapEntity).
 * Ground: ОДИН Graphics на ВСЮ карту (через drawTileBatch).
 * Стены: один Graphics на каждый тайл (варианты).
 * Дома: один Graphics на каждый блок домов.
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

  // ===== 1. Ground: ОДИН Graphics на ВСЮ карту =====
  const groundG = renderer.createGraphics();
  drawTileBatch(renderer, groundG, map);
  _groundGraphics = groundG as GraphicsHandle;
  count++;

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
  // Ground — уничтожаем единый Graphics
  if (_groundGraphics) {
    try {
      renderer.destroyGraphics(_groundGraphics);
    } catch {
      // уже уничтожен
    }
    _groundGraphics = null;
  }

  // Стены и дома — уничтожаем по MapTiles
  for (const [key, tile] of MapTiles) {
    if (tile.handle) {
      try {
        renderer.destroyGraphics(tile.handle as GraphicsHandle);
      } catch {
        // уже уничтожен
      }
    }
  }
  MapTiles.clear();
  _legacyHiddenOnce = false;
}
