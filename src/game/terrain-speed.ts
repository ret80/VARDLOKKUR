/* terrain-speed.ts — скорость перемещения существ по поверхности.
 *
 * База (коэффициент 1): дорога (PATH) и каменный пол подземелья (DFLOOR).
 * Снег, трава и болото замедляют движение. Значения — множители к базовой
 * скорости сущности.
 */

import { T, Tl, type WorldData } from "./world";

/** Множитель скорости для тайла (1 = дорога/пол подземелья). */
export function tileSpeedMul(t: number): number {
  switch (t) {
    case Tl.PATH:
    case Tl.DFLOOR:
    case Tl.STAIRS:
    case Tl.VILLAGE:
      return 1;
    case Tl.MEADOW:
      return 0.9;
    case Tl.SHORE:
      return 0.88;
    case Tl.FOREST:
      return 0.85;
    case Tl.SNOW:
      return 0.72;
    case Tl.SNOW2:
      return 0.68;
    case Tl.GRASS:
      return 0.7;
    case Tl.SWAMP:
    case Tl.DEADTREE:
    case Tl.FIR:
      return 0.6;
    case Tl.POOL:
      return 0.5;
    case Tl.SCREE:
      return 0.62;
    case Tl.CLIFF:
      return 0.55;
    case Tl.MTN:
      return 0.66;
    case Tl.WASTE:
      return 0.85;
    default:
      return 1;
  }
}

/** Множитель скорости поверхности в пиксельной точке мира. */
export function speedMulAt(map: WorldData | null | undefined, x: number, y: number): number {
  if (!map || !map.tiles || !map.W || !map.H) return 1;
  const tx = Math.floor(x / T);
  const ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= map.W || ty >= map.H) return 1;
  return tileSpeedMul(map.tiles[ty * map.W + tx]);
}
