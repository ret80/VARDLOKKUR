/* tile-geom.ts — геометрическая отрисовка ground-тайлов (task_14).
 *
 * drawTileBatch(renderer, g, map) — ОДИН Graphics на все тайлы фона.
 * Вся отрисовка через Graphics-примитивы (drawRect), без текстур.
 * Координаты батча — мировые (x*T, y*T), позиция g = (0,0).
 */

import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';
import { T, Tl, type WorldData } from '../world';
import { rgb } from './geom-utils';

/** Детерминированный шум для dither-крапа */
const rnd = (x: number, y: number, s: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Нарисовать один тайл типа t в заданных координатах.
 */
function drawTileLocal(g: GraphicsHandle, t: number, x: number, y: number, renderer: IRenderer): void {
  const tileRect = { x, y, width: T, height: T };

  // dither-тайл: базовый цвет + 6 пикселей тёмного/светлого крапа
  const dither = (base: number, dark: number, light: number) => {
    renderer.drawRect(g, tileRect, rgb(base));
    for (let i = 0; i < 6; i++) {
      const px = x + Math.floor(rnd(x, y, i) * T);
      const py = y + Math.floor(rnd(y, x, i + 9) * T);
      renderer.drawRect(g, { x: px, y: py, width: 1, height: 1 }, rgb(i % 2 ? dark : light));
    }
  };

  switch (t) {
    case Tl.WATER: dither(0x0a1620, 0x081219, 0x12303e); break;
    case Tl.SHORE: dither(0x4a5a64, 0x3d4d57, 0x5a6a74); break;
    case Tl.SNOW: dither(0x8b98a6, 0x7e8b99, 0x9aa7b5); break;
    case Tl.SNOW2: dither(0x7e8b99, 0x717e8c, 0x8d9aa8); break;
    case Tl.PATH: dither(0x55636e, 0x495762, 0x61707b); break;
    case Tl.FOREST: dither(0x26333c, 0x1e2a32, 0x2e3d47); break;
    case Tl.MTN: dither(0x5f6b78, 0x525e6b, 0x6d7986); break;
    case Tl.SWAMP: dither(0x2c3a3e, 0x243034, 0x354347); break;
    case Tl.POOL:
      dither(0x1b2a30, 0x152127, 0x223339);
      renderer.drawRect(g, { x: x + 3, y: y + 4, width: 5, height: 1 }, rgb(0x2a4a55));
      renderer.drawRect(g, { x: x + 8, y: y + 10, width: 4, height: 1 }, rgb(0x2a4a55));
      break;
    case Tl.VILLAGE: dither(0x635a4c, 0x575043, 0x6f6658); break;
    case Tl.RUINS: dither(0x4e5a68, 0x424d5a, 0x5c6875); break;
    case Tl.CAVE: dither(0x2b3646, 0x222b38, 0x343f50); break;
    case Tl.CAVEWALL:
      renderer.drawRect(g, tileRect, rgb(0x12181f));
      renderer.drawRect(g, { x, y, width: T, height: 6 }, rgb(0x1a222c));
      break;
    case Tl.STAIRS:
      dither(0x39424e, 0x2b3646, 0x4e5a68);
      renderer.drawRect(g, { x: x + 2, y: y + 3, width: 12, height: 2 }, rgb(0x222b38));
      renderer.drawRect(g, { x: x + 3, y: y + 7, width: 10, height: 2 }, rgb(0x222b38));
      renderer.drawRect(g, { x: x + 4, y: y + 11, width: 8, height: 2 }, rgb(0x222b38));
      break;
    case Tl.DFLOOR: dither(0x39424e, 0x2f3844, 0x445060); break;
    case Tl.DWALL:
      renderer.drawRect(g, tileRect, rgb(0x10151c));
      renderer.drawRect(g, { x, y, width: T, height: 5 }, rgb(0x232c38));
      break;
    case Tl.ALTAR: dither(0x1a222c, 0x141a22, 0x232c38); break;
    case Tl.TREE: dither(0x1c262e, 0x161f26, 0x232e37); break;
    case Tl.ROCK: dither(0x5f6b78, 0x525e6b, 0x6d7986); break;
    case Tl.PALISADE: dither(0x3a3020, 0x2e2618, 0x46382a); break;
    case Tl.HOUSE: renderer.drawRect(g, tileRect, rgb(0x2c2620)); break;
    case Tl.COLUMN: dither(0x4e5a68, 0x424d5a, 0x5c6875); break;
    default:
      renderer.drawRect(g, tileRect, rgb(0x10151c));
  }
}

/**
 * Нарисовать все ground-тайлы карты в один Graphics-батч.
 * Батч живёт в мировых координатах (позиция Graphics = 0,0).
 * Все тайлы рисуются в ЛОКАЛЬНЫХ координатах батча (x*T, y*T),
 * позиция Graphics НЕ меняется — иначе весь батч сдвинется.
 */
export function drawTileBatch(renderer: IRenderer, g: GraphicsHandle, map: WorldData): void {
  if (!map?.tiles || !map.W || !map.H) return;
  const { W, H } = map;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = map.tiles[y * W + x];
      // Рисуем в локальных координатах батча — позиция Graphics = (0,0)
      drawTileLocal(g, t, x * T, y * T, renderer);
    }
  }
}
