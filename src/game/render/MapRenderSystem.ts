/* MapRenderSystem.ts — загрузка графики карты в RenderQueue (task_14).
 *
 * При загрузке карты создаёт Graphics-объекты и кладёт их в очередь:
 *  1. Ground — ОДИН Graphics-батч на все тайлы (layer=0)
 *  2. Стены/деревья/камни — ОДИН Graphics-батч на все стены (layer=40)
 *  3. Дома/руины — ОДИН Graphics-батч на все дома (layer=40)
 *
 * Вся графика — процедурная геометрия (Graphics-примитивы), без текстур.
 * Сортировка и применение zIndex — в RenderQueue.flush().
 *
 * Ключевое отличие от legacy: один Graphics = один PixiJS display object,
 * все тайлы рисуются в ЛОКАЛЬНЫХ координатах батча. Порядок рисования = Z-sort.
 */

import type { IRenderer, GraphicsHandle, LayerHandle } from '../renderer/IRenderer';
import type { RenderQueue } from './RenderQueue';
import { RENDER_LAYER } from './RenderQueue';
import { T, Tl, type WorldData } from '../world';
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

/** Информация о стене для батчинга */
interface WallEntry {
  x: number;
  y: number;
  tile: number;
  variant: number;
  renderY: number; // Y для сортировки
}

/** Информация о доме для батчинга */
interface HouseEntry {
  x: number;
  y: number;
  hw: number;
  hh: number;
  variant: number;
  isRuined: boolean;
  renderY: number; // Y для сортировки
}

export class MapRenderSystem {
  /** Ground-батч (все тайлы фона в одном Graphics) */
  private groundG: GraphicsHandle | null = null;

  /** Батч всех стен (деревья, камни, палисады и т.д.) */
  private wallG: GraphicsHandle | null = null;

  /** Батч всех домов/руин */
  private houseG: GraphicsHandle | null = null;

  /** Handle слоя tiles (для ground-батча) */
  private _tileLayerHandle: LayerHandle | null = null;

  /** Handle слоя dynamic (для стен/домов) */
  private _dynamicLayerHandle: LayerHandle | null = null;

  /** Установить handle'ы слоёв (вызывается один раз при инициализации) */
  setLayerHandles(tileLayer: LayerHandle, dynamicLayer: LayerHandle): void {
    this._tileLayerHandle = tileLayer;
    this._dynamicLayerHandle = dynamicLayer;
  }

  /**
   * Загрузить графику карты: ground-батч + стены-батч + дома-батч.
   * Каждый батч — ОДИН Graphics, все тайлы рисуются в ЛОКАЛЬНЫХ координатах.
   */
  loadMap(map: WorldData, renderer: IRenderer, queue: RenderQueue): void {
    if (!map?.tiles || !map.W || !map.H) {
      logger.error('map-render', `Invalid map data: tiles=${!!map?.tiles}, W=${map?.W}, H=${map?.H}`);
      return;
    }
    const { W, H } = map;

    // ===== 1. Ground: один Graphics на все тайлы (layer=0) =====
    const groundG = renderer.createGraphics(this._tileLayerHandle ?? undefined);
    renderer.setGraphicsPosition(groundG, { x: 0, y: 0 });
    drawTileBatch(renderer, groundG, map);
    queue.enqueue({
      x: 0, y: 0, layer: RENDER_LAYER.GROUND, alpha: 1, visible: true, handle: groundG,
    });
    this.groundG = groundG;

    // ===== 2. Стены: собираем все стены в список, сортируем по Y =====
    const walls: WallEntry[] = [];
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

    // Создаём ОДИН Graphics-батч для всех стен
    const wallG = renderer.createGraphics(this._dynamicLayerHandle ?? undefined);
    renderer.setGraphicsPosition(wallG, { x: 0, y: 0 });

    // Рисуем все стены в локальных координатах батча
    for (const w of walls) {
      // Локальные координаты = смещение от позиции батча
      // legacy: якорь — низ объекта, локальный сдвиг (-8, -20)
      renderer.setGraphicsPosition(wallG, { x: w.x - 8, y: w.y - 20 });
      drawWallGeometry(renderer, wallG, w.tile, w.variant, map.dungeonId);
      // Сбрасываем позицию обратно в (0,0) для следующего тайла
      renderer.setGraphicsPosition(wallG, { x: 0, y: 0 });
    }

    // Средний Y для сортировки в RenderQueue
    const avgWallY = walls.length > 0
      ? walls.reduce((sum, w) => sum + w.renderY, 0) / walls.length
      : 0;

    queue.enqueue({
      x: 0, y: 0, layer: RENDER_LAYER.DYNAMIC, alpha: 1, visible: true, handle: wallG,
    });
    this.wallG = wallG;

    // ===== 3. Дома: собираем все дома в список, сортируем по Y =====
    const ruinedTiles = new Set<number>();
    for (const r of map.ruinedHouses ?? []) {
      for (let dy = 0; dy < r.h; dy++) {
        for (let dx = 0; dx < r.w; dx++) ruinedTiles.add((r.y + dy) * W + (r.x + dx));
      }
    }

    const houses: HouseEntry[] = [];
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

        const m = houseMetrics(hw, hh);
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

    // Создаём ОДИН Graphics-батч для всех домов
    const houseG = renderer.createGraphics(this._dynamicLayerHandle ?? undefined);
    renderer.setGraphicsPosition(houseG, { x: 0, y: 0 });

    // Рисуем все дома в локальных координатах батча
    for (const h of houses) {
      const m = houseMetrics(h.hw, h.hh);
      // локальные координаты дома = legacy canvas-координаты
      renderer.setGraphicsPosition(houseG, {
        x: h.x - m.marginX,
        y: h.y + h.hh * T + 1 - (m.wallTop + m.wallH + m.foundH),
      });
      drawHouseGeometry(renderer, houseG, h.hw, h.hh, h.variant, h.isRuined, this.roofSnow);
      // Сбрасываем позицию обратно в (0,0) для следующего дома
      renderer.setGraphicsPosition(houseG, { x: 0, y: 0 });
    }

    queue.enqueue({
      x: 0, y: 0, layer: RENDER_LAYER.DYNAMIC, alpha: 1, visible: true, handle: houseG,
    });
    this.houseG = houseG;

    logger.info('map-render', `Map loaded: 1 ground + 1 wall-batch (${walls.length} tiles) + 1 house-batch (${houses.length} blocks)`);
  }

  /** Флаг снега на крышах (устанавливается перед loadMap) */
  roofSnow = false;

  /** Очистить всю графику карты: удалить записи из очереди и уничтожить Graphics */
  clear(renderer: IRenderer, queue: RenderQueue): void {
    // Уничтожаем старые Graphics
    const toDestroy = [this.groundG, this.wallG, this.houseG];
    for (const h of toDestroy) {
      if (h === null) continue;
      queue.remove(h);
      try {
        renderer.destroyGraphics(h);
      } catch {
        // уже уничтожен
      }
    }
    this.groundG = null;
    this.wallG = null;
    this.houseG = null;

    // === КРИТИЧНО: очищаем старые спрайты из layer containers ===
    // Старый код создавал спрайты per-tile и добавлял их в tileLayerContainer
    // (zIndex=10 в worldContainer). Эти спрайты НЕ уничтожаются clearTiles(),
    // потому что clearTiles() чистит legacy _tileLayer (не добавлен в stage).
    // Старые спрайты перекрывают новый ground-батч (zIndex=0 в worldContainer).
    const wc = renderer.getWorldContainer();
    if (wc) {
      for (let i = wc.children.length - 1; i >= 0; i--) {
        const child = wc.children[i];
        // Layer containers: sortableChildren + zIndex
        const isLayerContainer = (child as any)?.sortableChildren === true && (child as any)?.zIndex != null;
        if (isLayerContainer && child.children) {
          // Уничтожаем все спрайты/graphics внутри layer container
          for (let j = child.children.length - 1; j >= 0; j--) {
            const sprite = child.children[j];
            if (sprite && typeof sprite.destroy === 'function') {
              try {
                sprite.destroy({ children: true, texture: true });
              } catch {
                // игнорируем
              }
            }
          }
        }
      }
    }
  }
}
