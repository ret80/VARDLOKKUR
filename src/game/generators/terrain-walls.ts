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

/**
 * Ступеньки, пандусы и лестницы в рельефе — ВКЛЮЧЕНЫ.
 *
 * По террасам снова можно подниматься, но не где попало: лестница одна на
 * регион (см. carveForConnectivity) и ставится в наиболее «зажатом» месте —
 * так, чтобы слева и справа от неё была стена, а не угол террасы. Ширина —
 * одна клетка, либо две, если рядом есть подходящая пара.
 *
 * Флаг оставлен, чтобы отключить лестницы одним значением.
 */
export const TERRAIN_STAIRS_ENABLED = true;

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
      const ti = tiles[i];
      const li = lv(i);

      // Вода над водой: перепад ручья. Такой бит ставится и на непроходимой
      // воде (WATER в SOLID), по нему 3D-меш рисует грань водопада — иначе
      // вода нижней террасы висела бы в воздухе без видимого слива.
      // POOL проверяется тоже, но с него проход НЕ прерывается: лужа
      // проходима и её стены к верхним соседям ставит обычный проход ниже.
      if (ti === Tl.WATER || ti === Tl.POOL || ti === Tl.STREAM) {
        for (const [dx, dy, bit] of WALL_DIRS) {
          const nx = x + dx, ny = y + dy;
          if (!inB(w, nx, ny)) continue;
          const ni = ny * W + nx;
          const nt = tiles[ni];
          if (nt !== Tl.WATER && nt !== Tl.POOL && nt !== Tl.STREAM) continue;
          if (lv(ni) > li) walls[i] |= bit;
        }
      }

      if (!walkable(w, i)) continue;
      for (const [dx, dy, bit] of WALL_DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inB(w, nx, ny)) continue;
        const ni = ny * W + nx;
        if (!walkable(w, ni)) continue;
        if (lv(ni) <= li) continue;
        if (TERRAIN_STAIRS_ENABLED && isRampSurface(ti) && isRampSurface(tiles[ni])) continue; // ступенька
        walls[i] |= bit;
      }
    }
  }

  /* 2. Гарантия связности: BFS по графу террас от спавна. Террасу, в которую
        иначе не попасть, открываем одним пандусом — пандусов ровно столько,
        сколько нужно связности, всё остальное остаётся стенами. */
  const start = spawnCell(w, from);
  if (TERRAIN_STAIRS_ENABLED && start >= 0) carveForConnectivity(w, walls, start);

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

  /* 2. Регионы соединяем ЛЕСТНИЦАМИ: каждый новый регион открывается одним
        стыком, выбранным по оценке (не в углу, по возможности — сразу двумя
        клетками в ширину).

        Проходов два: сначала соединяем только то, где с обеих сторон
        продолжается кромка (лестница между стенами), и лишь потом — то, что
        иначе осталось бы отрезанным. Так угол становится крайним случаем. */
  const startRegion = region[start];
  if (startRegion < 0) return;
  const seen = new Uint8Array(members.length);
  seen[startRegion] = 1;
  const openRegions = new Set<number>([startRegion]);
  /* Очистку препятствий откладываем до конца: превращённая в тропу клетка
     становится проходимой, и её регион ещё не посчитан. */
  const touched = new Set<number>();
  /* Открытые стыки — их кромку восстанавливать нельзя. */
  const opened = new Set<number>();
  const key = (i: number, bit: number): number => i * 16 + bit;

  const connect = (allowCorner: boolean, maxOne: boolean = false): boolean => {
    let carvedAny = false;
    for (;;) {
      let best: { c: number; ni: number; bit: number; opp: number; dx: number; dy: number; nr: number; score: number } | null = null;
      for (const r of openRegions) {
        const list = members[r];
        if (!list) continue;
        for (const c of list) {
          const cx = c % W, cy = (c / W) | 0;
          for (const dir of WALL_DIRS) {
            const [dx, dy, bit, opp] = dir;
            const nx = cx + dx, ny = cy + dy;
            if (!inB(w, nx, ny)) continue;
            const ni = ny * W + nx;
            if (!walk(ni)) continue;
            const nr = region[ni];
            if (nr < 0 || nr === r || seen[nr]) continue;
            // Нормализуем направление: оцениваем стык от НИЖНЕЙ клетки к
            // ВЫСОКОЙ, иначе спуск всегда считается угловым.
            const clv0 = elevLevel(height[c]);
            const nlv0 = elevLevel(height[ni]);
            let fc = c, fdir: readonly [number, number, number, number] = dir, ftarget = nr;
            if (clv0 > nlv0) {
              fc = ni;
              fdir = ([-dx, -dy, opp, bit] as unknown) as readonly [number, number, number, number];
              ftarget = r;
            }
            const flanks = stairFlanks(w, walls, region, fc, fdir, ftarget);
            // На прямом участке кромки: с обеих сторон уступ продолжается, без
            // поворота/угла террасы. Угловые стыки допускаем только когда без
            // них регион не связать (второй проход).
            if (!allowCorner && flanks.corners > 0) continue;
            const sc = stairValue(flanks);
            if (!best || sc > best.score) best = { c, ni, bit, opp, dx, dy, nr, score: sc };
          }
        }
      }
      if (!best) return carvedAny;
      // (сдвиг вдоль края не удался — угловые лестницы остаются редкими,
      //  необходимыми для связности; визуально они одиночные ступени, а не
      //  обёртка вокруг угла.)

      seen[best.nr] = 1;
      openRegions.add(best.nr);

      const clv = elevLevel(height[best.c]);
      const nlv = elevLevel(height[best.ni]);
      // Нормализуем: дальше работаем от НИЖНЕЙ клетки — на ней лежит бит стены.
      const lowIsC = clv < nlv;
      const lowCell = lowIsC ? best.c : best.ni;
      const lbit = lowIsC ? best.bit : best.opp;
      const lobit = lowIsC ? best.opp : best.bit;
      const ldx = lowIsC ? best.dx : -best.dx;
      const ldy = lowIsC ? best.dy : -best.dy;
      walls[lowCell] &= ~lbit;
      walls[lowIsC ? best.ni : best.c] &= ~lobit;
      opened.add(key(lowCell, lbit));
      clearStairApproach(w, lowCell, ldx, ldy, touched);
      carvedAny = true;
      if (maxOne) return true;

      // Вторая створка: соседняя клетка того же уровня, упирающаяся в тот же
      // регион. Лестница становится шириной в две клетки.
      const lx = lowCell % W, ly = (lowCell / W) | 0;
      for (const fb of flankBits(lbit)) {
        const row = WALL_DIRS.find((d) => d[2] === fb);
        if (!row) continue;
        const fx = lx + row[0], fy = ly + row[1];
        if (!inB(w, fx, fy)) continue;
        const fi = fy * W + fx;
        if (isSolidTileId(w.tiles[fi])) continue;
        if (elevLevel(height[fi]) !== clv) continue;
        if (region[fi] !== region[lowCell]) continue;
        const hx = fx + ldx, hy = fy + ldy;
        if (!inB(w, hx, hy)) continue;
        const hi = hy * W + hx;
        if (!walk(hi)) continue;
        if (region[hi] !== best.nr) continue;
        if (elevLevel(height[hi]) !== nlv) continue;
        if (!(walls[fi] & lbit)) continue;
        walls[fi] &= ~lbit;
        walls[hi] &= ~lobit;
        opened.add(key(fi, lbit));
        clearStairApproach(w, fi, ldx, ldy, touched);
        break;
      }
    }
    return carvedAny;
  };

  // Сначала — только прямые участки кромки (не на углах террас). Если
  // какой-то регион иначе недостижим, прорубаем ему один стык в лучшем
  // доступном месте — только там, где это нужно для связности.
  connect(false);
  connect(true);

  /* Очищенные клетки раньше были препятствиями — стен на них никто не считал.
     Восстанавливаем кромку, иначе через дырку от камня можно подняться без
     лестницы. Открытые стыки при этом не закрываем. */
  for (const i of touched) {
    if (isSolidTileId(w.tiles[i])) continue;
    const cx = i % W, cy = (i / W) | 0;
    const li = elevLevel(height[i]);
    for (const [dx, dy, bit, opp] of WALL_DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inB(w, nx, ny)) continue;
      const ni = ny * W + nx;
      if (isSolidTileId(w.tiles[ni])) continue;
      const nl = elevLevel(height[ni]);
      if (nl > li && !opened.has(key(i, bit))) walls[i] |= bit;
      else if (nl < li && !opened.has(key(ni, opp))) walls[ni] |= opp;
    }
  }
}

/**
 * Тайлы-препятствия: их нельзя ставить на лестницу и перед ней, иначе подъём
 * ведёт в тупик (или через лестницу протянут забор).
 */
const STAIR_BLOCKERS = new Set<number>([
  Tl.TREE, Tl.FIR, Tl.DEADTREE, Tl.ROCK, Tl.COLUMN, Tl.RUINS, Tl.PALISADE,
]);

/**
 * Убрать препятствия с лестницы: на самой клетке подъёма и в двух шагах
 * вокруг по её оси. Забор превращается в деревенский двор, деревья и камни —
 * в тропу. Дома и постройки не трогаем — их обходят оценкой.
 */
function clearStairApproach(
  w: WorldData,
  lowCell: number,
  dx: number,
  dy: number,
  touched: Set<number>,
): void {
  const { W } = w;
  const lx = lowCell % W, ly = (lowCell / W) | 0;
  for (let k = -1; k <= 2; k++) {
    const x = lx + dx * k, y = ly + dy * k;
    if (!inB(w, x, y)) continue;
    const i = y * W + x;
    const t = w.tiles[i];
    if (!STAIR_BLOCKERS.has(t)) continue;
    w.tiles[i] = t === Tl.PALISADE ? Tl.VILLAGE : Tl.PATH;
    touched.add(i);
  }
}

/** Перпендикулярные стыку стороны клетки: по ним лестница «зажата». */
function flankBits(bit: number): readonly [number, number] {
  return bit === WallBit.N || bit === WallBit.S
    ? ([WallBit.E, WallBit.W] as const)
    : ([WallBit.N, WallBit.S] as const);
}

/** Бока лестницы: стены по обе стороны, углы, вторая створка, помехи. */
interface StairFlanks {
  /** Сколько боков продолжает кромка (стена слева/справа). */
  walled: number;
  /** Бок с кромкой, но стык уже открыт — там вторая створка. */
  open: number;
  /** Бок, где кромка повернула или кончилась: это угол. */
  corners: number;
  /** Сколько боков годятся под вторую створку. */
  twins: number;
  /** Сколько препятствий на самой лестнице и на подходе. */
  blocked: number;
}

/**
 * Разобрать бока стыка.
 *
 * «Стена слева/справа» — это ПРОДОЛЖЕНИЕ кромки террасы вбок, а не стена
 * самого тайла: именно она видна рядом с лестницей. Кромка продолжается, если
 * соседняя клетка того же уровня тоже упирается вверх в том же направлении.
 * Где кромка поворачивает или кончается — там угол.
 */
function stairFlanks(
  w: WorldData,
  walls: Uint8Array,
  region: Int32Array,
  c: number,
  dir: readonly [number, number, number, number],
  targetRegion: number,
): StairFlanks {
  const { W, height } = w;
  const fl: StairFlanks = { walled: 0, open: 0, corners: 0, twins: 0, blocked: 0 };
  if (!height) return fl;
  const [dx, dy, bit] = dir;
  const cx = c % W, cy = (c / W) | 0;
  const lvl = elevLevel(height[c]);

  for (const [px, py] of [[-dy, dx], [dy, -dx]] as const) {
    const fx = cx + px, fy = cy + py;
    const fi = inB(w, fx, fy) ? fy * W + fx : -1;
    if (fi < 0 || isSolidTileId(w.tiles[fi])) { fl.walled++; continue; } // край/вода = стена
    if (elevLevel(height[fi]) !== lvl) { fl.corners++; continue; }       // кромка повернула
    const hx = fx + dx, hy = fy + dy;
    const hi = inB(w, hx, hy) ? hy * W + hx : -1;
    if (hi < 0 || elevLevel(height[hi]) <= lvl) { fl.corners++; continue; } // кромка кончилась
    if (!(walls[fi] & bit)) { fl.open++; continue; } // створка уже открыта
    fl.walled++;
    if (region[hi] === targetRegion && region[fi] === region[c]) fl.twins++;
  }

  /* Препятствие на самой лестнице или на подходе делает её бесполезной:
     игрок поднимается и упирается в камень, дерево или забор. */
  for (let k = -1; k <= 2; k++) {
    const sx = cx + dx * k, sy = cy + dy * k;
    if (!inB(w, sx, sy)) continue;
    if (STAIR_BLOCKERS.has(w.tiles[sy * W + sx])) fl.blocked++;
  }
  return fl;
}

/** Численная оценка стыка: больше — лучше. */
function stairValue(f: StairFlanks): number {
  return (f.walled + f.open >= 2 ? 2000 : 0)
    + (f.walled + f.open) * 400
    - f.corners * 300
    + f.twins * 40
    - f.blocked * 250;
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
