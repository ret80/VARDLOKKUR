/* map-render-system.ts — ECS-система рендеринга карты (рефакторинг MapRenderSystem).
 *
 * Архитектура (Data-Oriented Design):
 *  1. EcsMapLoader при загрузке карты ОДИН раз генерирует геометрию батчей
 *     (земля / стены / дома) и сохраняет GraphicsHandle в компоненте MapState
 *     синглтон-сущности карты (см. createMapEntity в ecs-map-loader.ts).
 *  2. mapRenderSystem(world) вызывается каждый кадр в фазе рендеринга
 *     (ecs-game-loop.ts, вместе с renderSystem). Она делает query(world, [MapState])
 *     и регистрирует статичные хэндлы в общем RenderQueue через upsert()
 *     с правильными слоями (RENDER_LAYER.GROUND для земли, RENDER_LAYER.DYNAMIC
 *     для стен и домов). Новые Graphics система НЕ создаёт.
 *  3. Если сущность MapState уничтожена (переход на другую локацию), система
 *     выгружает устаревшие батчи: удаляет записи из RenderQueue и уничтожает
 *     Graphics через IRenderer.
 *
 * Сортировка, viewport culling и финальные вызовы IRenderer — в RenderQueue.flush().
 */

import { query, type World } from 'bitecs';
import type { IRenderer, GraphicsHandle, LayerHandle } from '../renderer/IRenderer';
import { getRenderQueue, RENDER_LAYER, type RenderEntry, type Viewport } from './RenderQueue';
import {
  MapState,
  MAP_GROUND_QUEUE_KEY,
  MAP_WALLS_QUEUE_KEY,
  MAP_HOUSES_QUEUE_KEY,
} from '../ecs/ecs-components';
import { T } from '../world';

/** Описание одного статичного батча карты */
interface MapBatchDef {
  /** Ключ записи в RenderQueue (стабилен между кадрами) */
  key: string;
  /** Компонентный массив с GraphicsHandle */
  handles: Int32Array;
  /** Слой отрисовки */
  layer: number;
}

const BATCH_DEFS: MapBatchDef[] = [
  { key: MAP_GROUND_QUEUE_KEY, handles: MapState.groundHandle, layer: RENDER_LAYER.GROUND },
  { key: MAP_WALLS_QUEUE_KEY, handles: MapState.wallsHandle, layer: RENDER_LAYER.DYNAMIC },
  { key: MAP_HOUSES_QUEUE_KEY, handles: MapState.housesHandle, layer: RENDER_LAYER.DYNAMIC },
];

/** Значение «хэндл не создан» (handle'ы IRenderer >= 1) */
const NO_HANDLE = 0;

/**
 * Опции mapRenderSystem (передаются из ecs-game-loop при каждом кадре).
 */
export interface MapRenderSystemOptions {
  renderer?: IRenderer;
  /** Handle слоя tiles (для ground-батча) */
  tileLayer?: LayerHandle;
  /** Handle слоя dynamic (для стен/домов) */
  dynamicLayer?: LayerHandle;
  /** Параметры камеры (для bounding box батчей в viewport culling) */
  viewport?: Viewport;
}

/**
 * mapRenderSystem — ECS-система: синглтон-сущность карты → RenderQueue.
 *
 * Вызывается каждый кадр в фазе render() игрового цикла:
 *   mapRenderSystem(world, { renderer, tileLayer, dynamicLayer, viewport });
 */
export function mapRenderSystem(world: World, opts: MapRenderSystemOptions = {}): void {
  const queue = getRenderQueue();
  if (!queue) return;

  // Найди синглтон-сущность карты (в мире должна быть не более одной)
  let mapEid = -1;
  for (const eid of query(world, [MapState])) {
    mapEid = eid;
    break;
  }

  // === Сущности MapState нет (или она уничтожена при переходе на другую
  //     локацию) — выгрузить все батчи карты из очереди и уничтожить их ===
  if (mapEid < 0) {
    unloadAllMapBatches(queue, opts.renderer);
    // Принудительно скрываем legacy-спрайты карты (layer containers), если
    // они остались в worldContainer после teardown. В новом ECS-пути карта
    // рисуется только батчами из RenderQueue — любые прямые спрайты слоёв
    // перекрывают новый рендер (замена legacy MapRenderSystem.clear()).
    hideLegacyLayerSprites(opts.renderer);
    return;
  }

  const wPx = MapState.width[mapEid] * T;
  const hPx = MapState.height[mapEid] * T;

  for (const def of BATCH_DEFS) {
    const handle = def.handles[mapEid];

    // Хэндл не создан или уже уничтожен вне системы — убираем запись из очереди
    if (handle === NO_HANDLE || !isHandleAlive(queue, opts.renderer, handle)) {
      const taken = queue.takeByKey(def.key);
      if (taken !== null && taken !== handle && isHandleAlive(queue, opts.renderer, taken)) {
        destroyHandle(opts.renderer, taken);
      }
      if (handle !== NO_HANDLE) def.handles[mapEid] = NO_HANDLE;
      continue;
    }

    // Статичный батч покрывает всю карту — bounding box нужен для viewport culling
    const entry = queue.upsert(def.key, (): RenderEntry => ({
      x: 0,
      y: 0,
      width: wPx,
      height: hPx,
      layer: def.layer,
      alpha: 1,
      visible: true,
      handle: handle as GraphicsHandle,
    }));

    // Обновляем актуальные данные (при перезагрузке карты handle мог смениться)
    entry.handle = handle as GraphicsHandle;
    entry.layer = def.layer;
    entry.alpha = 1;
    entry.visible = true;
    entry.width = wPx;
    entry.height = hPx;
  }
}

/** Проверить, жив ли ещё GraphicsHandle (если доступен IRenderer) */
function isHandleAlive(
  _queue: ReturnType<typeof getRenderQueue>,
  renderer: IRenderer | undefined,
  handle: number
): boolean {
  if (!renderer) return true; // без рендерера не можем проверить — считаем живым
  try {
    // Обращение к несуществующему handle в PixiJSRenderer логирует warning,
    // но не бросает исключение; проверяем наличие внутреннего объекта.
    const g = (renderer as any).getGraphicsPixi?.(handle as GraphicsHandle);
    return !!g && !g.destroyed;
  } catch {
    return false;
  }
}

/** Уничтожить GraphicsHandle через IRenderer (безопасно) */
function destroyHandle(renderer: IRenderer | undefined, handle: GraphicsHandle): void {
  if (!renderer) return;
  try {
    renderer.destroyGraphics(handle);
  } catch {
    // уже уничтожен — игнорируем
  }
}

/** Выгрузить все батчи карты из очереди и уничтожить их Graphics */
function unloadAllMapBatches(
  queue: NonNullable<ReturnType<typeof getRenderQueue>>,
  renderer: IRenderer | undefined
): void {
  for (const def of BATCH_DEFS) {
    const handle = queue.takeByKey(def.key);
    if (handle !== null) destroyHandle(renderer, handle);
  }
}

/**
 * Скрыть legacy-спрайты/графику внутри layer containers worldContainer.
 * Вызывается один раз при выгрузке карты (когда сущность MapState удалена).
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
// Генерация геометрии батчей (вызывается ОДИН раз — ecs-map-loader)
// ============================================================

import { Tl, type WorldData } from '../world';
import { logger } from '../debug/logger';
import { drawTileBatch } from '../geometry/tile-geom';
import { drawWallGeometry } from '../geometry/wall-geom';
import { drawHouseGeometry, houseMetrics } from '../geometry/house-geom';

/** Детерминированный шум вариантов (как в legacy tiles.ts) */
const rnd = (x: number, y: number, s: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Типы тайлов, отрисовываемые как вертикальные объекты (стены) */
const WALL_TILES = new Set<number>([
  Tl.TREE, Tl.ROCK, Tl.PALISADE, Tl.COLUMN, Tl.DWALL, Tl.CAVEWALL,
]);

/** Результат процедурной генерации батчей карты */
export interface MapBatches {
  groundHandle: GraphicsHandle;
  wallsHandle: GraphicsHandle;
  housesHandle: GraphicsHandle;
}

/**
 * Создать статичные Graphics-батчи карты (земля, стены, дома).
 *
 * Вызывается ОДИН раз при загрузке карты (EcsMapLoader.createMapEntity).
 * Процедурная геометрия рисуется в ЛОКАЛЬНЫХ координатах батча через ox/oy —
 * позиция самого Graphics всегда (0,0). Возвращённые хэндлы сохраняются
 * в компонент MapState; регистрация в RenderQueue — задача mapRenderSystem.
 */
export function createMapBatches(
  map: WorldData,
  renderer: IRenderer,
  opts: { tileLayer?: LayerHandle; dynamicLayer?: LayerHandle; roofSnow?: boolean } = {},
): MapBatches {
  if (!map?.tiles || !map.W || !map.H) {
    throw new Error(
      `Invalid map data: tiles=${!!map?.tiles}, W=${map?.W}, H=${map?.H}`,
    );
  }
  const { W, H } = map;
  const roofSnow = opts.roofSnow ?? false;

  // ===== 1. Ground: один Graphics на все тайлы (layer=0) =====
  const groundG = renderer.createGraphics(opts.tileLayer);
  renderer.setGraphicsPosition(groundG, { x: 0, y: 0 });
  drawTileBatch(renderer, groundG, map);

  // ===== 2. Стены: собираем все стены в список, сортируем по Y =====
  const walls: { x: number; y: number; tile: number; variant: number; renderY: number }[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = map.tiles[y * W + x];
      if (!WALL_TILES.has(t)) continue;
      const variant =
        t === Tl.TREE ? ((rnd(x, y, 13) > 0.5 ? 1 : 0) | (rnd(x, y, 13) > 0.7 ? 2 : 0))
        : t === Tl.ROCK ? (rnd(x, y, 11) > 0.5 ? 1 : 0)
        : t === Tl.COLUMN ? ((rnd(x, y, 11) > 0.5 ? 1 : 0) | (rnd(x, y, 13) > 0.7 ? 2 : 0))
        : 0;

      walls.push({
        x: x * T,
        y: y * T,
        tile: t,
        variant,
        renderY: y * T + T, // якорь — низ объекта для Y-sort
      });
    }
  }

  // Сортируем стены по Y (сверху вниз) — порядок рисования = Z-sort
  walls.sort((a, b) => a.renderY - b.renderY);

  // Создаём ОДИН Graphics-батч для всех стен; геометрия рисуется в мировых
  // координатах тайла (w.x, w.y), позиция Graphics = (0, 0)
  const wallG = renderer.createGraphics(opts.dynamicLayer);
  renderer.setGraphicsPosition(wallG, { x: 0, y: 0 });
  for (const w of walls) {
    drawWallGeometry(renderer, wallG, w.tile, w.variant, map.dungeonId, w.x, w.y);
  }

  // ===== 3. Дома: собираем все дома в список, сортируем по Y =====
  const ruinedTiles = new Set<number>();
  for (const r of map.ruinedHouses ?? []) {
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) ruinedTiles.add((r.y + dy) * W + (r.x + dx));
    }
  }

  const houses: { x: number; y: number; hw: number; hh: number; variant: number; isRuined: boolean; renderY: number }[] = [];
  const houseSeen = new Set<string>();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (map.tiles[y * W + x] !== Tl.HOUSE) continue;
      const key = `${x},${y}`;
      if (houseSeen.has(key)) continue;

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
        for (let dx = 0; dx < hw; dx++) houseSeen.add(`${x + dx},${y + dy}`);
      }

      const isRuined = ruinedTiles.has(y * W + x);
      const v = (rnd(x, y, 13) > 0.5 ? 1 : 0) | (rnd(x, y, 11) > 0.6 ? 2 : 0);

      houses.push({
        x: x * T,
        y: y * T,
        hw, hh,
        variant: v,
        isRuined,
        renderY: y * T + hh * T, // якорь Y — низ фундамента
      });
    }
  }

  // Сортируем дома по Y (сверху вниз) — порядок рисования = Z-sort
  houses.sort((a, b) => a.renderY - b.renderY);

  // Создаём ОДИН Graphics-батч для всех домов; локальные координаты блока
  // вычисляются так же, как в legacy (через метрики дома)
  const houseG = renderer.createGraphics(opts.dynamicLayer);
  renderer.setGraphicsPosition(houseG, { x: 0, y: 0 });
  for (const h of houses) {
    const m = houseMetrics(h.hw, h.hh);
    const ox = h.x - m.marginX;
    const oy = h.y + h.hh * T + 1 - (m.wallTop + m.wallH + m.foundH);
    drawHouseGeometry(renderer, houseG, h.hw, h.hh, h.variant, h.isRuined, roofSnow, ox, oy);
  }

  logger.info('map-render', `Map batches created: 1 ground + 1 wall-batch (${walls.length} tiles) + 1 house-batch (${houses.length} blocks)`);

  return { groundHandle: groundG, wallsHandle: wallG, housesHandle: houseG };
}

/**
 * Уничтожить батчи карты через IRenderer и удалить их записи из RenderQueue.
 * Используется при teardown карты (переход на другую локацию), если сущность
 * MapState была удалена ДО того, как mapRenderSystem успела их выгрузить.
 */
export function destroyMapBatches(
  renderer: IRenderer,
  handles: (GraphicsHandle | number | null | undefined)[],
): void {
  const queue = getRenderQueue();
  for (const h of handles) {
    if (h === null || h === undefined || h === NO_HANDLE) continue;
    const handle = h as GraphicsHandle;
    // Удалить записи очереди по ключам, ссылающиеся на этот handle
    if (queue) {
      for (const def of BATCH_DEFS) {
        const entry = queue.getByKey(def.key);
        if (entry && entry.handle === handle) queue.takeByKey(def.key);
      }
      queue.remove(handle);
    }
    destroyHandle(renderer, handle);
  }
}
