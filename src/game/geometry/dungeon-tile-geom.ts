/* dungeon-tile-geom.ts — геометрическая отрисовка тайлсета подземелья.
 *
 * Источник: SVG/tile_set_d01.svg (тайлсет DWALL 2.5D, 16×16, без текстур).
 * Тайл стены = slab-основа + канты/контуры по N/E/W + фасад-кирпич на юге.
 * Пол (t00) = тёмная заливка + линии сетки сверху/слева.
 *
 * Вся отрисовка — примитивы IRenderer.drawRect (пиксельные блоки 1-в-1 с SVG).
 * Координаты локальные внутри Graphics; ox/oy — смещение для батчинга.
 */

import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';
import { T, Tl, type WorldData } from '../world';
import { makePainter } from './geom-utils';
import { drawTileLocal } from './tile-geom';
import { DSide, DUNGEON_FLOOR, decodeWallCode, dungeonWallCodeAt } from '../dungeon-tiles';

/** Палитра тайлсета подземелья (все цвета — 0xRRGGBB) */
export interface DungeonPalette {
  /** Пол: заливка и линии сетки */
  floor: number;
  floorLine: number;
  /** Slab-основа стены: заливка, сетка, крап */
  slab: number;
  slabGrid: number;
  slabSpeck: number;
  /** Светлый кант (сосед — пол) */
  rim: number;
  rimInner: number;
  /** Тёмный контур (сосед — пустота) */
  contour: number;
  contourInner: number;
  /** Фасад-кирпич (юг открыт) */
  facadeLine: number;
  facadeBase: number;
  facadeBrick: number;
  facadeBrickEdge: number;
}

/** Базовая палитра «d01» — цвета 1-в-1 из SVG/tile_set_d01.svg */
const PALETTE_D01: DungeonPalette = {
  floor: 0x141a22, floorLine: 0x0a0e14,
  slab: 0x39424e, slabGrid: 0x2b333d, slabSpeck: 0x4a5563,
  rim: 0x4a5563, rimInner: 0x2b333d,
  contour: 0x1a222c, contourInner: 0x2b333d,
  facadeLine: 0x202832, facadeBase: 0x10151c,
  facadeBrick: 0x232b36, facadeBrickEdge: 0x39424e,
};

/** Тонировать 24-битный цвет покомпонентными множителями */
function tint(c: number, rm: number, gm: number, bm: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 0xff) * rm)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 0xff) * gm)));
  const b = Math.max(0, Math.min(255, Math.round((c & 0xff) * bm)));
  return (r << 16) | (g << 8) | b;
}

function tintPalette(p: DungeonPalette, rm: number, gm: number, bm: number): DungeonPalette {
  return {
    floor: tint(p.floor, rm, gm, bm), floorLine: tint(p.floorLine, rm, gm, bm),
    slab: tint(p.slab, rm, gm, bm), slabGrid: tint(p.slabGrid, rm, gm, bm),
    slabSpeck: tint(p.slabSpeck, rm, gm, bm),
    rim: tint(p.rim, rm, gm, bm), rimInner: tint(p.rimInner, rm, gm, bm),
    contour: tint(p.contour, rm, gm, bm), contourInner: tint(p.contourInner, rm, gm, bm),
    facadeLine: tint(p.facadeLine, rm, gm, bm), facadeBase: tint(p.facadeBase, rm, gm, bm),
    facadeBrick: tint(p.facadeBrick, rm, gm, bm),
    facadeBrickEdge: tint(p.facadeBrickEdge, rm, gm, bm),
  };
}

/** Палитры подземелий: id 1 — зелёный (Корень), id 2 — бурый (Крепость) */
const PALETTES: Record<number, DungeonPalette> = {
  1: tintPalette(PALETTE_D01, 0.72, 1.08, 0.72),
  2: tintPalette(PALETTE_D01, 1.18, 0.98, 0.72),
};

/** Палитра тайлсета подземелья по id (0 — базовая синеватая) */
export function dungeonPalette(dungeonId: number): DungeonPalette {
  return PALETTES[dungeonId] ?? PALETTE_D01;
}

/** Отрисовать тайл пола (t00) в локальных координатах (ox, oy) */
export function drawDungeonFloor(
  renderer: IRenderer,
  g: GraphicsHandle,
  ox: number,
  oy: number,
  pal: DungeonPalette,
): void {
  const { P } = makePainter(renderer, g);
  const R = (x: number, y: number, w: number, h: number, c: number) => P(ox + x, oy + y, w, h, c);

  R(0, 0, 16, 16, pal.floor);
  R(0, 0, 16, 1, pal.floorLine); // верхняя линия сетки
  R(0, 0, 1, 16, pal.floorLine); // левая линия сетки
}

/** Отрисовать фасад-кирпич (bF) — южная сторона стены, обращённая к открытому тайлу */
function drawFacade(
  R: (x: number, y: number, w: number, h: number, c: number) => void,
  pal: DungeonPalette,
): void {
  // bF: линия + кирпичная кладка (паттерн brk 8×8: светлый верх курса + вертикальные швы)
  R(0, 5, 16, 1, pal.facadeLine);
  R(0, 6, 16, 10, pal.facadeBase);
  // тела курсов
  R(0, 6, 16, 2, pal.facadeBrick);
  R(0, 9, 16, 3, pal.facadeBrick);
  R(0, 13, 16, 3, pal.facadeBrick);
  // светлые верхние кромки курсов (pattern rows 0 и 4 → y = 8 и 12)
  R(0, 8, 16, 1, pal.facadeBrickEdge);
  R(0, 12, 16, 1, pal.facadeBrickEdge);
  // вертикальные швы (смещение курсов)
  R(3, 6, 1, 2, pal.facadeBase);  R(11, 6, 1, 2, pal.facadeBase);
  R(7, 8, 1, 1, pal.facadeBase);  R(15, 8, 1, 1, pal.facadeBase);
  R(7, 9, 1, 3, pal.facadeBase);  R(15, 9, 1, 3, pal.facadeBase);
  R(3, 12, 1, 1, pal.facadeBase); R(11, 12, 1, 1, pal.facadeBase);
  R(3, 13, 1, 3, pal.facadeBase); R(11, 13, 1, 3, pal.facadeBase);
}

/**
 * Отрисовать один тайл стены подземелья по коду в локальных координатах (ox, oy).
 * Порядок слоёв как в SVG: slab → кант N → фасад → канты W/E.
 */
export function drawDungeonWall(
  renderer: IRenderer,
  g: GraphicsHandle,
  code: number,
  ox: number,
  oy: number,
  pal: DungeonPalette,
): void {
  const { P } = makePainter(renderer, g);
  const R = (x: number, y: number, w: number, h: number, c: number) => P(ox + x, oy + y, w, h, c);

  // slab-основа + паттерн slab (сетка и крап повторяются каждые 8×8)
  R(0, 0, 16, 16, pal.slab);
  R(7, 0, 1, 16, pal.slabGrid);
  R(15, 0, 1, 16, pal.slabGrid);
  R(0, 7, 16, 1, pal.slabGrid);
  R(0, 15, 16, 1, pal.slabGrid);
  for (let cy = 0; cy < 16; cy += 8) {
    for (let cx = 0; cx < 16; cx += 8) {
      R(cx + 2, cy + 3, 1, 1, pal.slabSpeck);
      R(cx + 5, cy + 5, 1, 1, pal.slabSpeck);
      R(cx + 4, cy + 1, 1, 1, pal.slabGrid);
    }
  }

  const s = decodeWallCode(code);

  // N-кант (2px)
  if (s.n === DSide.Floor) { R(0, 0, 16, 1, pal.rim); R(0, 1, 16, 1, pal.rimInner); }
  else if (s.n === DSide.Void) { R(0, 0, 16, 1, pal.contour); R(0, 1, 16, 1, pal.contourInner); }

  // фасад на юге, если юг открыт (пол или пустота)
  if (s.s !== DSide.Wall) drawFacade(R, pal);

  // W-кант (2px)
  if (s.w === DSide.Floor) { R(0, 0, 1, 16, pal.rim); R(1, 0, 1, 16, pal.rimInner); }
  else if (s.w === DSide.Void) { R(0, 0, 1, 16, pal.contour); R(1, 0, 1, 16, pal.contourInner); }

  // E-кант (2px)
  if (s.e === DSide.Floor) { R(15, 0, 1, 16, pal.rim); R(14, 0, 1, 16, pal.rimInner); }
  else if (s.e === DSide.Void) { R(15, 0, 1, 16, pal.contour); R(14, 0, 1, 16, pal.contourInner); }
}

/**
 * Ground-батч подземелья: ОДИН Graphics на всю карту.
 * DWALL пропускается (рисуется отдельным батчем стен), DFLOOR — тайлом t00,
 * остальные тайлы (лестницы, колонны-подложки и т.п.) — как в общем пути.
 */
export function drawDungeonFloorBatch(renderer: IRenderer, g: GraphicsHandle, map: WorldData): void {
  if (!map?.tiles || !map.W || !map.H) return;
  const pal = dungeonPalette(map.dungeonId ?? 0);
  const { W, H } = map;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = map.tiles[y * W + x];
      if (t === Tl.DWALL) continue; // стены — отдельный батч
      if (t === Tl.DFLOOR) drawDungeonFloor(renderer, g, x * T, y * T, pal);
      else drawTileLocal(g, t, x * T, y * T, renderer);
    }
  }
}

/**
 * Батч стен подземелья: ОДИН Graphics на все тайлы DWALL.
 * Если WorldData.dungeonWall не заполнен — код вычисляется на месте.
 */
export function drawDungeonWallBatch(renderer: IRenderer, g: GraphicsHandle, map: WorldData): void {
  if (!map?.tiles || !map.W || !map.H) return;
  const pal = dungeonPalette(map.dungeonId ?? 0);
  const { W, H, tiles } = map;
  const codes = map.dungeonWall && map.dungeonWall.length === W * H ? map.dungeonWall : null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (tiles[i] !== Tl.DWALL) continue;
      const code = codes ? codes[i] : dungeonWallCodeAt(map, x, y);
      drawDungeonWall(renderer, g, code === DUNGEON_FLOOR ? 0 : code, x * T, y * T, pal);
    }
  }
}
