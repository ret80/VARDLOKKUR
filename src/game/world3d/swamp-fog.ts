/* swamp-fog.ts — туман над болотом для 3D-сцены.
 *
 * В 2D туман был просто шейдером поверх экрана. В 3D так нельзя: нужна
 * привязка к миру, а полноценный объёмный туман (ray-marching по фрусталям)
 * слишком дорог для тайловой игры. Поэтому используется дешёвый и
 * общепринятый приём — «ковёр» из полупрозрачных горизонтальных слоёв с
 * мягкой облачной текстурой:
 *
 *   - по клеткам биома SWAMP кладутся плоскости на двух высотах (низкая —
 *     гуще, высокая — реже): вместе они читаются как объёмная дымка;
 *   - UV берутся из мировых координат: дымка непрерывна через границы клеток;
 *   - текстура бесшовная и медленно дрейфует (см. ThreeJSRenderer.render).
 *
 * Туман НЕ ставится над деревьями, скалами, домами и частоколом: иначе дымка
 * висела бы внутри модели. Над водой/лужами — ставится, там туман и нужен.
 */

import { Biome, Tl, type WorldData } from '../world';
import type { MeshData } from './terrain-mesh';

/** Клетки, над которыми туман не нужен (объекты стоят над землёй). */
const NO_FOG = new Set<number>([
  Tl.TREE, Tl.FIR, Tl.DEADTREE, Tl.ROCK, Tl.COLUMN, Tl.HOUSE, Tl.PALISADE,
]);

/**
 * Меш тумана для одного слоя.
 *
 * @param yOffset высота слоя над поверхностью террасы (мировые единицы)
 */
export function buildSwampFog(
  map: WorldData,
  heightAtTile: (tx: number, ty: number) => number,
  yOffset: number,
): MeshData | null {
  const { W, H, tiles, biomes } = map;
  if (!biomes || biomes.length !== W * H) return null;

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  /** Масштаб текстуры на мир: меньше — крупнее облака и заметнее повтор. */
  const SCALE = 0.35;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (biomes[y * W + x] !== Biome.SWAMP) continue;
      if (NO_FOG.has(tiles[y * W + x])) continue;

      const h = heightAtTile(x, y) + yOffset;

      const base = pos.length / 3;
      const corners: ReadonlyArray<readonly [number, number]> = [
        [-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5],
      ];
      for (const [cx, cz] of corners) {
        const wx = x + 0.5 + cx, wz = y + 0.5 + cz;
        pos.push(wx, h, wz);
        // UV — прямо из мировых координат: облако непрерывно перетекает через
        // границы клеток и не распадается на прямоугольные «заплатки».
        uv.push(wx * SCALE, wz * SCALE);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  if (idx.length === 0) return null;
  return {
    positions: new Float32Array(pos),
    uvs: new Float32Array(uv),
    indices: new Uint32Array(idx),
  };
}

/**
 * Бесшовная текстура дымки: набор мягких «облаков» с прозрачным краем.
 *
 * Каждое пятно рисуется девять раз со сдвигом на ±размер холста — поэтому на
 * стыках текстурных координат узор сходится иRepeatWrapping не даёт шва.
 */
export function createSwampFogTexture(): HTMLCanvasElement {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;

  ctx.clearRect(0, 0, S, S);
  const rnd = (i: number, s: number): number => {
    const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  for (let i = 0; i < 22; i++) {
    const cx = rnd(i, 3.1) * S;
    const cy = rnd(i, 9.7) * S;
    const r = 7 + rnd(i, 5.3) * 15;
    const alpha = 0.16 + rnd(i, 7.9) * 0.2;
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        const g = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, r);
        g.addColorStop(0, `rgba(228,238,242,${alpha.toFixed(3)})`);
        g.addColorStop(1, 'rgba(228,238,242,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return cv;
}
