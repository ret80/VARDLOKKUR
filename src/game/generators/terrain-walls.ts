/* terrain-walls.ts — террасы с настоящими уступами.
 *
 * Пока перепад высот был только отрисовкой, игрок спокойно «проходил» сквозь
 * возвышенность. Здесь мы решаем, ГДЕ возвышенность непроходима:
 *
 *   - вычисляем по полю высот битовую маску стен по каждой стороне клетки
 *     (сосед выше → стена на этом стыке);
 *   - стены есть со всех сторон террасы, т.е. с плато нельзя «упасть»;
 *   - подъём и спуск разрешены только там, где «пробит» пандус:
 *       * дороги и площади поселений (PATH/VILLAGE) и лестницы подземелий (STAIRS);
 *       * рёбра, которых требует связность мира — ищем их BFS'ом по высотам.
 *
 * Стена лежит только у стыка (полоса ~3px), а не на всей клетке — коллизия
 * повторяет нарисованный уступ, а не перекрывает клетку целиком.
 * Пандус = клетка с уровнем разного уровня, но БЕЗ бита стены.
 */
import { WorldData, Tl, Vec, T, idx, inB, isSolidTileId, elevLevel } from "./types";

/** Биты стен по сторонам клетки. */
export const WallBit = { N: 1, E: 2, S: 4, W: 8 } as const;
export type WallBitValue = (typeof WallBit)[keyof typeof WallBit];

/** [dx, dy, бит стороны, противоположный бит] — идём от ТЕКУЩЕЙ клетки к соседу. */
export const WALL_DIRS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, -1, WallBit.N, WallBit.S],
  [1, 0, WallBit.E, WallBit.W],
  [0, 1, WallBit.S, WallBit.N],
  [-1, 0, WallBit.W, WallBit.E],
];

/** Толщина физической стены в пикселях. Стык клеток — центр полосы. */
export const WALL_COLLIDER_T = 3;

const walkable = (w: WorldData, i: number): boolean => !isSolidTileId(w.tiles[i]);

/**
 * Тайлы, которые рельефом не рисуются (см. isReliefExempt в tile-geom):
 * вода, берег, дороги, озера, площади поселений, лестницы.
 *
 * Стены строятся только между «обычным» рельефом с обеих сторон: иначе
 * игрок упирался бы в невидимую стену на берегу/дороге/озере. Побочно
 * дороги становятся готовыми пандусами — по ним подъём разрешён.
 */
function isReliefExempt(t: number): boolean {
  return t === Tl.WATER || t === Tl.SHORE || t === Tl.PATH || t === Tl.POOL
    || t === Tl.VILLAGE || t === Tl.STAIRS || t === Tl.DFLOOR || t === Tl.HOUSE;
}

/**
 * Построить маску стен уступов и пробить пандусы.
 *
 * @param w    оверворлд с `height`
 * @param from стартовая точка (спавн игрока), от которой гарантируется связность
 * @returns битовая маска по клеткам либо null, если поле высот нет (подземелья)
 */
export function buildTerrainWalls(w: WorldData, from?: Vec): Uint8Array | null {
  const { W, H, tiles, height } = w;
  if (!height || height.length !== W * H) return null;

  const lv = (i: number): number => elevLevel(height[i]);
  const walls = new Uint8Array(W * H);

  /* 1. Стены там, где сосед выше (все 4 стороны — терраса закрыта по кругу).
        Обе клетки обязаны быть «обычным» рельефом — иначе стена не видна. */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(w, x, y);
      if (!walkable(w, i) || isReliefExempt(tiles[i])) continue;
      const li = lv(i);
      for (const [dx, dy, bit] of WALL_DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inB(w, nx, ny)) continue;
        const ni = ny * W + nx;
        if (!walkable(w, ni) || isReliefExempt(tiles[ni])) continue;
        if (lv(ni) > li) walls[i] |= bit;
      }
    }
  }

  /* 2. Гарантия связности: BFS по графу террас от спавна. Террасу, в которую
        иначе не попасть, открываем одним пандусом — пандусов ровно столько,
        сколько нужно связности, всё остальное остаётся стенами. */
  const start = spawnCell(w, from);
  if (start >= 0) carveForConnectivity(w, walls, start);

  w.walls = walls;
  return walls;
}

/** Клетка спавна (или ближайшая проходимая) в индексах. */
function spawnCell(w: WorldData, from?: Vec): number {
  const { W, H, tiles } = w;
  const px = from ?? w.spawn;
  const sx = Math.floor((px?.x ?? 0) / T);
  const sy = Math.floor((px?.y ?? 0) / T);
  const at = (x: number, y: number): number => (inB(w, x, y) && !isSolidTileId(tiles[y * W + x]) ? y * W + x : -1);
  const direct = at(sx, sy);
  if (direct >= 0) return direct;
  for (let r = 1; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const i = at(sx + dx, sy + dy);
        if (i >= 0) return i;
      }
    }
  }
  // крайний фолбэк: первая проходимая клетка
  for (let i = 0; i < W * H; i++) if (!isSolidTileId(tiles[i])) return i;
  return -1;
}

/**
 * Пробить пандусы — по одному на террасу.
 *
 * Сначала мир разбивается на «регионы»: связные области одного уровня
 * (дороги и площади попадают в регионы как обычные клетки, но стен у них
 * нет — они и так проход). Затем BFS по графу соседства регионов: каждый
 * новый регион открывается РОВНО одним пандусом — на первом найденном стыке.
 *
 * Так связность гарантирована, а стен остаётся максимум. Прошлый вариант
 * (0/1-BFS по клеткам) «пробивал» всю границу террас: на острове снималось
 * ~73% бит, и почти каждый уступ превращался в лесенку.
 */
function carveForConnectivity(w: WorldData, walls: Uint8Array, start: number): void {
  const { W, H, height } = w;
  const n = W * H;
  if (!height) return;
  /** Проходимость для связности: солиды не проходим, остальное — да. */
  const walk = (i: number): boolean => !isSolidTileId(w.tiles[i]);

  /* 1. Регионы одинакового уровня (flood fill по 4 сторонам). */
  const region = new Int32Array(n).fill(-1);
  const members: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (region[i] !== -1 || !walk(i)) continue;
    const id = members.length;
    const lvl = elevLevel(height[i]);
    const cells: number[] = [];
    const stack: number[] = [i];
    region[i] = id;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of WALL_DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!inB(w, nx, ny)) continue;
        const ni = ny * W + nx;
        if (region[ni] !== -1 || !walk(ni)) continue;
        if (elevLevel(height[ni]) !== lvl) continue;
        region[ni] = id;
        stack.push(ni);
      }
    }
    members.push(cells);
  }

  /* 2. BFS по регионам: новый регион = один пробитый стык. */
  const startRegion = region[start];
  if (startRegion < 0) return;
  const seen = new Uint8Array(members.length);
  seen[startRegion] = 1;
  const queue: number[] = [startRegion];
  for (let qi = 0; qi < queue.length; qi++) {
    const r = queue[qi];
    for (const c of members[r]) {
      const cx = c % W, cy = (c / W) | 0;
      const clv = elevLevel(height[c]);
      for (const [dx, dy, bit, opp] of WALL_DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!inB(w, nx, ny)) continue;
        const ni = ny * W + nx;
        if (!walk(ni)) continue;
        const nr = region[ni];
        if (nr === r || seen[nr]) continue;
        seen[nr] = 1;
        // Стык регионов разного уровня — пробиваем пандус.
        const nlv = elevLevel(height[ni]);
        if (clv < nlv) walls[c] &= ~bit;
        else if (nlv < clv) walls[ni] &= ~opp;
        queue.push(nr);
      }
    }
  }
}

/**
 * Разрешён ли переход из клетки `i` в клетку `ni` по направлению `bit`
 * (один из `WallBit`): стена хранится на клетке-«ниже», поэтому проверяем обе.
 */
export function edgeOpen(walls: Uint8Array, i: number, ni: number, bit: number): boolean {
  const row = WALL_DIRS.find((d) => d[2] === bit);
  if (!row) return false;
  const opp = row[3];
  return !(walls[i] & bit) && !(walls[ni] & opp);
}
