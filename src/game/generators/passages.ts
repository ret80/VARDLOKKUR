/* passages.ts — расчёт «клеток-проходов» и защита их от коллайдер-тел.
 *
 * Проход = клетка, по которой гарантированно идёт сквозное движение игрока:
 *   - дорожное покрытие (PATH), площади поселений (VILLAGE), лестницы (STAIRS);
 *   - открытый стык террас разных уровней (рампа/ступенька): ребро без бита
 *     стены между клетками с разными elevLevel — единственные места, где можно
 *     пересечь уступ (см. terrain-walls: buildTerrainWalls/carveForConnectivity).
 *
 * Клетки прохода должны оставаться СВОБОДНЫМИ от коллайдер-тел: тело радиуса R
 * стоящее на 1-клеточной дороге, оставляет зазор 16−2R px, а игроку нужно
 * 2·PLAYER_BODY_R = 10 px. Т.е. любое тело ближе (R + PLAYER_BODY_R) px к
 * центру клетки-прохода делает проход непроходимым. Радиусы тел заданы
 * физикой: игрок 5 (ecs-bridge), пьедестал/святилище 6, алтарь 8
 * (ecs-map-loader), враги — ENEMY_STATS[].r.
 */
import { WorldData, Tl, idx, inB, elevLevel, isSolidTileId, T } from "./types";
import { WALL_DIRS, edgeOpen } from "./terrain-walls";

/** Радиус тела игрока в пикселях (ecs-bridge: createPlayerInEcs). */
export const PLAYER_BODY_R = 5;
/** Радиус статического тела пьедестала/святилища (ecs-map-loader). */
export const STATIC_BODY_R = 6;

/** Является ли клетка «проходом» по тайлу (дорога/площадь/лестница). */
export const isPassageTile = (t: number): boolean =>
  t === Tl.PATH || t === Tl.VILLAGE || t === Tl.STAIRS;

/**
 * Маска клеток-проходов: дорожное покрытие + открытые стыки террас.
 * Требует `w.walls` (buildTerrainWalls уже вызван).
 */
export function passageMask(w: WorldData): Uint8Array {
  const mask = new Uint8Array(w.W * w.H);
  for (let i = 0; i < w.W * w.H; i++) if (isPassageTile(w.tiles[i])) mask[i] = 1;
  const { walls, height } = w;
  if (!walls || !height) return mask;
  for (let y = 0; y < w.H; y++) {
    for (let x = 0; x < w.W; x++) {
      const i = idx(w, x, y);
      if (mask[i] || isSolidTileId(w.tiles[i])) continue;
      for (const [dx, dy, bit] of WALL_DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inB(w, nx, ny)) continue;
        const ni = ny * w.W + nx;
        if (isSolidTileId(w.tiles[ni])) continue;
        if (elevLevel(height[i]) === elevLevel(height[ni])) continue;
        if (edgeOpen(walls, i, ni, bit)) { mask[i] = 1; mask[ni] = 1; break; }
      }
    }
  }
  return mask;
}

/**
 * Клетки, где тело радиуса `bodyR` (px, центр = центр клетки) перекрывает
 * какой-либо проход: центр тела ближе `bodyR + PLAYER_BODY_R` px к центру
 * клетки-прохода.
 */
export function forbiddenMask(w: WorldData, passages: Uint8Array, bodyR: number): Uint8Array {
  const out = new Uint8Array(w.W * w.H);
  const need = (bodyR + PLAYER_BODY_R) * (bodyR + PLAYER_BODY_R);
  const rc = Math.ceil((bodyR + PLAYER_BODY_R) / T);
  for (let y = 0; y < w.H; y++) {
    for (let x = 0; x < w.W; x++) {
      if (!passages[idx(w, x, y)]) continue;
      const px = x * T + T / 2, py = y * T + T / 2;
      for (let dy = -rc; dy <= rc; dy++) {
        for (let dx = -rc; dx <= rc; dx++) {
          const nx = x + dx, ny = y + dy;
          if (!inB(w, nx, ny)) continue;
          const ni = ny * w.W + nx;
          if (out[ni]) continue;
          const ddx = (nx * T + T / 2) - px, ddy = (ny * T + T / 2) - py;
          if (ddx * ddx + ddy * ddy < need) out[ni] = 1;
        }
      }
    }
  }
  return out;
}
