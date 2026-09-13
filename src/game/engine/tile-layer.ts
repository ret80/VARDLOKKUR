/* tile-layer.ts — Слой отрисовки тайлов карты (ground + стены/дома)
 *
 * Замена удалённого PixiJS tileLayer/dynamic на Regl-рендеринг:
 * - ground — один большой канвас → один квад на весь экран
 * - стены/дома — атлас канвасов → квады с UV + viewport culling
 *
 * Порядок отрисовки: ground → стены/дома (zIndex = Y + T, y-sorting
 * обеспечивается порядком пуша в батч — батчер рисует в порядке добавления).
 */

import type REGL from 'regl';
import type { IRenderLayer, RenderLayerContext } from './render-layer';
import { buildTileAtlas, destroyAtlas, entryToUV, type TileAtlas } from './tile-atlas';
import { logger } from '../debug/logger';
import { T } from '../generators/types';

// ============================================================
// Типы входных данных
// ============================================================

/** Элемент стены/дома для отрисовки (из buildAllTileTextures) */
export interface TileWallEntry {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  zIndex: number;
}

/** Данные карты для TileLayer (результат buildAllTileTextures) */
export interface TileMapData {
  /** Большой ground-канвас (вся карта) */
  groundCanvas: HTMLCanvasElement;
  /** Стены/дома: canvas + позиция в мире + zIndex */
  walls: TileWallEntry[];
}

// ============================================================
// TileLayer
// ============================================================

export class TileLayer implements IRenderLayer {
  private regl: REGL.Regl | null = null;

  /** Ground-текстура (вся карта одним квадом) */
  private groundTexture: REGL.Texture2D | null = null;
  private groundW = 0;
  private groundH = 0;

  /** Атлас стен/домов */
  private atlas: TileAtlas | null = null;
  /** Отсортированный по zIndex список стен с UV */
  private wallEntries: Array<{ x: number; y: number; w: number; h: number; u0: number; v0: number; u1: number; v1: number }> = [];

  /** Размеры viewport (для culling) */
  private viewW = 1024;
  private viewH = 768;

  /** Камера (обновляется каждый кадр из контекста) */
  private cam: { x: number; y: number } = { x: 0, y: 0 };

  init(_app: unknown, ctx: RenderLayerContext): void {
    this.regl = ctx.regl ?? null;
  }

  update(ctx: RenderLayerContext): void {
    if (ctx.cam) this.cam = ctx.cam;
  }

  /**
   * Загрузить данные карты (вызывается при загрузке новой карты).
   * Строит ground-текстуру и атлас стен/домов.
   */
  setMap(data: TileMapData): void {
    if (!this.regl) {
      logger.warn('tile-layer', 'setMap() called before init() — regl not available');
      return;
    }

    // Освободить предыдущие ресурсы
    this.clearMap();

    // Ground: вся карта одним канвасом → одна GPU-текстура
    this.groundTexture = this.regl.texture({
      data: data.groundCanvas,
      width: data.groundCanvas.width,
      height: data.groundCanvas.height,
      mag: 'nearest',
      min: 'nearest',
      wrapS: 'clamp',
      wrapT: 'clamp',
    });
    this.groundW = data.groundCanvas.width;
    this.groundH = data.groundCanvas.height;

    // Атлас стен/домов
    const canvases = data.walls.map((w) => w.canvas);
    this.atlas = buildTileAtlas(canvases, this.regl);

    // Сортируем стены по zIndex (y-sorting: нижние перекрывают верхние)
    const sorted = [...data.walls].sort((a, b) => a.zIndex - b.zIndex);
    this.wallEntries = [];
    for (const wall of sorted) {
      const entry = this.atlas.entries.get(wall.canvas);
      if (!entry) continue;
      const uv = entryToUV(entry, this.atlas.width, this.atlas.height);
      this.wallEntries.push({
        x: wall.x,
        y: wall.y,
        w: wall.canvas.width,
        h: wall.canvas.height,
        u0: uv.u0,
        v0: uv.v0,
        u1: uv.u1,
        v1: uv.v1,
      });
    }

    logger.info('tile-layer', `Map loaded: ground ${this.groundW}x${this.groundH}, ${this.wallEntries.length} walls (atlas ${this.atlas.width}x${this.atlas.height})`);
  }

  /** Освободить GPU-ресурсы карты (перед загрузкой новой) */
  clearMap(): void {
    if (this.atlas) {
      destroyAtlas(this.atlas);
      this.atlas = null;
    }
    this.groundTexture = null;
    this.wallEntries = [];
  }

  render(ctx: RenderLayerContext): void {
    const batchers = ctx.batchers;
    if (!batchers) return;

    // DEBUG
    const w = window as any;
    w.__tileRender = (w.__tileRender || 0) + 1;
    w.__tileCam = { ...this.cam };
    w.__tileGround = !!this.groundTexture;
    w.__tileWalls = this.wallEntries.length;

    const cam = this.cam;
    const viewLeft = cam.x;
    const viewTop = cam.y;
    const viewRight = cam.x + this.viewW;
    const viewBottom = cam.y + this.viewH;

    // ── Ground: один квад на весь экран (с culling по видимой части) ──
    if (this.groundTexture) {
      // Видимая часть ground в мировых координатах
      const gx0 = Math.max(0, viewLeft);
      const gy0 = Math.max(0, viewTop);
      const gx1 = Math.min(this.groundW, viewRight);
      const gy1 = Math.min(this.groundH, viewBottom);
        if (gx1 > gx0 && gy1 > gy0) {
          w.__tileGroundPush = (w.__tileGroundPush || 0) + 1;
          batchers.sprite.setTextures([this.groundTexture]);
        batchers.sprite.push(
          gx0, gy0, gx1 - gx0, gy1 - gy0,
          gx0 / this.groundW, gy0 / this.groundH,
          gx1 / this.groundW, gy1 / this.groundH,
          1, 1, 1, 1,
          0
        );
      }
    }

    // ── Стены/дома: квады из атласа с viewport culling ──
    if (this.atlas) {
      batchers.sprite.setTextures([this.atlas.texture]);
      let pushed = 0;
      for (const w of this.wallEntries) {
        // Culling: элемент должен пересекаться с viewport (+ запас на размер)
        if (w.x + w.w < viewLeft || w.x > viewRight || w.y + w.h < viewTop || w.y > viewBottom) {
          continue;
        }
        pushed++;
        batchers.sprite.push(
          w.x, w.y, w.w, w.h,
          w.u0, w.v0, w.u1, w.v1,
          1, 1, 1, 1,
          0
        );
      }
      (window as any).__tileWallsPushed = pushed;
    }
  }

  resize(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
  }

  destroy(): void {
    this.clearMap();
    this.regl = null;
  }
}
