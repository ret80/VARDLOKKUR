/* Утилиты для работы с тайлами мира */
import { WorldData, Tl, isSolidTileId, idx, inB, Vec } from "./types";
import { clamp } from "../utils";
import { mulberry } from "../noise";

export function tileAt(w: WorldData, x: number, y: number): number {
  return inB(w, x, y) ? w.tiles[idx(w, x, y)] : Tl.DWALL;
}

export function solidTileAt(w: WorldData, x: number, y: number): boolean {
  return isSolidTileId(tileAt(w, x, y));
}

export function setTile(w: WorldData, x: number, y: number, t: number) {
  if (inB(w, x, y)) w.tiles[idx(w, x, y)] = t;
}

/** Найти проходимую клетку рядом с ориентиром. Предпочитает VILLAGE и PATH. */
export function findWalkableNear(w: WorldData, fx: number, fy: number, r: number, rng: () => number): Vec {
  const walkable = (t: number) => !isSolidTileId(t) && t !== Tl.WATER && t !== Tl.POOL;
  const villagePref = (t: number) => t === Tl.VILLAGE || t === Tl.PATH;
  for (let tries = 0; tries < 300; tries++) {
    const x = Math.round(fx + (rng() * 2 - 1) * r);
    const y = Math.round(fy + (rng() * 2 - 1) * r);
    if (!inB(w, x, y)) continue;
    const t = w.tiles[idx(w, x, y)];
    if (!walkable(t)) continue;
    if (villagePref(t)) return { x, y };
  }
  for (let tries = 0; tries < 300; tries++) {
    const x = Math.round(fx + (rng() * 2 - 1) * r);
    const y = Math.round(fy + (rng() * 2 - 1) * r);
    if (!inB(w, x, y)) continue;
    const t = w.tiles[idx(w, x, y)];
    if (walkable(t)) return { x, y };
  }
  for (let rad = 1; rad < 90; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = Math.round(fx) + dx, y = Math.round(fy) + dy;
        if (!inB(w, x, y)) continue;
        const t = w.tiles[idx(w, x, y)];
        if (walkable(t)) return { x, y };
      }
    }
  }
  return { x: clamp(Math.round(fx), 2, w.W - 3), y: clamp(Math.round(fy), 2, w.H - 3) };
}

export function clearAround(w: WorldData, cx: number, cy: number, r: number, floor?: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inB(w, x, y)) continue;
      const cur = w.tiles[idx(w, x, y)];
      if (cur === Tl.WATER || cur === Tl.PALISADE || cur === Tl.HOUSE) continue;
      if (isSolidTileId(cur)) setTile(w, x, y, floor !== undefined ? floor : Tl.SNOW);
    }
  }
}

export function findFree(w: WorldData, fx: number, fy: number, r: number, pref: number | undefined, rng: () => number): Vec {
  const landT = (t: number) => !isSolidTileId(t) && t !== Tl.WATER && t !== Tl.POOL && t !== Tl.PATH && t !== Tl.VILLAGE;
  for (let tries = 0; tries < 400; tries++) {
    const x = Math.round(fx + (rng() * 2 - 1) * r);
    const y = Math.round(fy + (rng() * 2 - 1) * r);
    if (!inB(w, x, y)) continue;
    const t = w.tiles[idx(w, x, y)];
    if (!landT(t)) continue;
    if (pref !== undefined && t !== pref && tries < 300) continue;
    return { x, y };
  }
  for (let rad = 1; rad < 90; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = Math.round(fx) + dx, y = Math.round(fy) + dy;
        if (!inB(w, x, y)) continue;
        const t = w.tiles[idx(w, x, y)];
        if (landT(t) && (pref === undefined || t === pref)) return { x, y };
      }
    }
  }
  return { x: clamp(Math.round(fx), 2, w.W - 3), y: clamp(Math.round(fy), 2, w.H - 3) };
}

export function floodReach(w: WorldData, sx: number, sy: number): Uint8Array {
  const reach = new Uint8Array(w.W * w.H);
  const q: number[] = [sy * w.W + sx];
  reach[q[0]] = 1;
  while (q.length) {
    const c = q.pop()!;
    const x = c % w.W, y = Math.floor(c / w.W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inB(w, nx, ny)) continue;
      const ni = ny * w.W + nx;
      if (reach[ni] || isSolidTileId(w.tiles[ni])) continue;
      reach[ni] = 1; q.push(ni);
    }
  }
  return reach;
}

export function zoneFor(w: WorldData, tx: number, ty: number): string {
  if (w.isDungeon) return w.dungeonName;
  for (const z of w.zones) {
    if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) return z.name;
  }
  const t = tileAt(w, tx, ty);
  switch (t) {
    case Tl.VILLAGE: case Tl.PALISADE: case Tl.HOUSE: return "Поселение";
    case Tl.MTN: case Tl.ROCK: return "Хребет Нидов";
    case Tl.SWAMP: case Tl.POOL: return "Замерзшие Топи";
    case Tl.RUINS: case Tl.COLUMN: case Tl.STAIRS: return "Руины Времени";
    case Tl.FOREST: case Tl.TREE: return "Мёртвый Лес";
    default: return "Мёрзлая пустошь";
  }
}
