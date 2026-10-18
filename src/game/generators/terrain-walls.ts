/* terrain-walls.ts — террасы с настоящими уступами.
 *
 * Пока перепад высот был только отрисовкой, игрок спокойно «проходил» сквозь
 * возвышенность. Здесь мы решаем, ГДЕ возвышенность непроходима:
 *
 *   - вычисляем по полю высот битовую маску стен по каждой стороне клетки
 *     (сосед выше → стена на этом стыке);
 *   - стены есть со всех сторон террасы, т.е. с плато нельзя «упасть»;
 *   - подъём и спуск разрешены только там, где «пробит» пандус:
 *       * стык двух «пандусных» тайлов (PATH/VILLAGE/STAIRS/SHORE/POOL)
 *         разного уровня — это ступенька;
 *       * рёбра, которых требует связность мира — ищем их BFS'ом по высотам.
 *
 * Стена лежит только у стыка (полоса ~3px), а не на всей клетке — коллизия
 * повторяет нарисованный уступ, а не перекрывает клетку целиком.
 * Ступенька = стык разного уровня БЕЗ бита стены (пандусные тайлы или BFS).
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
 * «Пандусные» тайлы — по ним подъём идёт как по ступеньке: дороги, площади
 * поселений, лестницы подземелий, полоса берега и озеро.
 *
 * Стена ставится на НИЖНЕЙ клетке всякий раз, когда сосед выше, — так
 * возвышенность замкнута по кругу: и в поле, и у воды, и вдоль дорог.
 * Единственное исключение — стык двух «пандусных» тайлов разного уровня:
 * это ступенька (дорога, поднимающаяся в гору; терраса берега). Плюс стыки,
 * которые отдельно пробивает BFS связности (см. carveForConnectivity).
 */
function isRampSurface(t: number): boolean {
  return t === Tl.PATH || t === Tl.VILLAGE || t === Tl.STAIRS
    || t === Tl.SHORE || t === Tl.POOL;
}

/**
 * Сделать «пандусные» полосы ровными: берег и озёра — одна низкая терраса.
 *
 * Высоты берега берутся из того же шума, что и рельеф, поэтому вдоль полосы
 * берега набираются случайные микроперепады. На берегу рельеф не рисуется, и
 * по этим НЕВИДИМЫМ ступеням игрок поднимался сквозь уступ. Ровная полоса
 * чинит это у истока: берег/озеро — одна терраса, а стена уступа стоит ровно
 * по кромке земли (над пляжем), как и положено.
 *
 * Вызывается после ВСЕЙ раскладки тайлов (озёра-лужи появляются уже на этапе
 * декора) и не меняет вид склонов: тайлы к этому моменту расставлены.
 */
export function flattenRampSurfaces(w: { height?: Float32Array; tiles: Uint8Array }): void {
  const { height, tiles } = w;
  if (!height) return;
  const FLAT = 0.05;
  for (let i = 0; i < tiles.length; i++) {
    // Ровняем только «дикие» полосы: дороги, площади и лестницы идут по
    // рельефу ступеньками (в этом их смысл), а берег и озеро — плоские.
    const t = tiles[i];
    if (t === Tl.SHORE || t === Tl.POOL) height[i] = FLAT;
  }
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

  /* 1. Стены там, где сосед выше: стена ложится на НИЖНЮЮ клетку и смотрит на
        верхнего соседа, поэтому терраса закрыта по кругу. Исключение —
        ступенька: стык двух «пандусных» тайлов разного уровня. */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(w, x, y);
      if (!walkable(w, i)) continue;
      const ti = tiles[i];
      const li = lv(i);
      for (const [dx, dy, bit] of WALL_DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inB(w, nx, ny)) continue;
        const ni = ny * W + nx;
        if (!walkable(w, ni)) continue;
        if (lv(ni) <= li) continue;
        if (isRampSurface(ti) && isRampSurface(tiles[ni])) continue; // ступенька
        walls[i] |= bit;
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
 * (все клетки, включая «пандусные», попадают в регионы; их собственные
 * ступеньки уже открыты правилом 1). Затем BFS по графу соседства регионов:
 * каждый новый регион открывается РОВНО одним пандусом — на первом найденном
 * стыке. Открытый стык рисуется как ступенька (edgeRamp в tile-geom), поэтому
 * подъём на любую террасу всегда виден.
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
