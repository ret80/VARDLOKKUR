/* terrain-mesh.ts — построение 3D-поверхности мира из тайловой карты.
 *
 * Мир 2D-тайловый (T = 16 px) и уже содержит поле высот `height` (0..1),
 * квантованное в уровни террас (ELEV_LEVELS = 6), и маску стен-уступов `walls`
 * (WallBit N/E/S/W на клетке-«ниже»).
 *
 * Отсюда строятся:
 *   1) визуальный меш: верхние квады клеток + вертикальные утёсы по маске walls
 *      + пандусы на открытых перепадах высот (переход разрешён);
 *   2) навигационная геометрия: только проходимые верхние квады и пандусы.
 *
 * Масштаб: 16 px = 1 мировая единица (three.js), высота уровня террасы = 0.6.
 * Ось Y — вверх, игровые (x, y) → (x/16, ·, y/16).
 */

import { T, Tl, Biome, isSolidTileId, elevLevel, ELEV_LEVELS } from '../generators/types';
import { TERRAIN_STAIRS_ENABLED } from '../generators/terrain-walls';
import { FALL_FOAM_V } from './waterfall-texture';
import { CLIFF_ROWS } from './cliff-texture';

/** Пикселей на мировую единицу (совпадает с T). */
export const PX_PER_UNIT = T;
/**
 * Высота одной террасы в мировых единицах.
 *
 * Раньше было 0.6 — с камеры 46° уступ читался тонкой полоской и не
 * отличался от площадки. 0.9 — это чуть выше персонажа (14 px), как на
 * референсе: обрыв виден как стена, а не как шов.
 */
export const TERRACE_HEIGHT = 0.9;
/**
 * Глубина пандуса на открытом стыке (в пикселях).
 *
 * 1.6 тайла даёт уклон ~20° на один уровень: такой пандус остаётся
 * проходимым в navmesh (recast эродирует края высоты агента) и легче для
 * восприятия, чем прежние крутые 33°.
 */
const RAMP_DEPTH_PX = T;

/**
 * Ступеней в марше лестницы.
 *
 * Было 4: каждая ступень — четверть террасы (0.225 ед.) и текстурный срез в
 * четверть ряда кладки, поэтому марш читался как стопка тонких полос породы,
 * а не как ступени. Теперь ступень = ровно один ряд кладки (0.45 ед. при
 * TERRACE_HEIGHT 0.9 и CLIFF_ROWS 2), марш из двух ступеней.
 */
const RAMP_STEPS = 2;

/** Биты маски стен (см. generators/terrain-walls WallBit). */
const WB_N = 1, WB_E = 2, WB_S = 4, WB_W = 8;

/** Код стены подземелья (Tile.DWALL). */
export const DWALL_TILE = 20;
/** Высота стены подземелья в мировых единицах (~1 тайл). */
export const DUNGEON_WALL_H = 1.4;
/** Вынос травяного козырька за плоскость утёса (в мировых единицах). */
const LIP_OUT = 0.18;

/** Сколько пикселей сверху тайла стены — плита, ниже — фасад-кирпич. */
const DWALL_CAP_PX = 5;

/** Высота невидимых стен в nav-геометрии (заведомо выше walkableClimb). */
const NAV_WALL_HEIGHT = 1.5;

/**
 * Ширина кромки-обводки на ВЕРХНЕЙ клетке уступа (в пикселях тайла).
 *
 * Камера смотрит с юга, поэтому видна только южная грань утёса; с севера, востока
 * и запада перепад высот на глаз не читался — особенно если грунт плато и низа
 * совпадает по тайлам. Поэтому по кромке плато поверх грунта кладётся полоска
 * кладки: она видна со всех четырёх сторон и обозначает границу перепада.
 */
const RIM_PX = 4;
/** Подъём кромки над грунтом (в мировых единицах) — без мерцания на стыке. */
const RIM_UP = 0.012;

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Необязательный тон по вершинам (sRGB 0..1) — используется для граней утёсов. */
  colors?: Float32Array;
}

export interface TerrainMesh {
  /** Верхние поверхности + проступи лестниц (с текстурой земли). */
  ground: MeshData;
  /** Вертикальные утёсы и подступенки — тайловая текстура блоков породы. */
  cliffs: MeshData;
  /** Травяные козырьки на верхней кромке утёсов (текстура земли). */
  lips: MeshData;
  /** Обводка кромки уступа на верхней клетке — полоска кладки (текстура стены). */
  rims: MeshData;
  /** Водные грани на перепаде «вода над водой» — водопады ручья. */
  waterfalls: MeshData;
  /**
   * Боксы стен подземелья. UV — в координатах холста батча стен (а не земли),
   * поэтому в рендерере для них отдельная текстура.
   */
  dungeonWalls: MeshData;
  /** Геометрия для генерации navmesh (только проходимая поверхность). */
  nav: { positions: Float32Array; indices: Uint32Array };
  /** Высота поверхности (в мировых единицах) по игровым пикселям. */
  heightAt(xPx: number, yPx: number): number;
  /** Высота клетки (в мировых единицах) по индексам. */
  heightAtTile(tx: number, ty: number): number;
  /**
   * Размер и смещение холста батча стен подземелья (px). Нужны рендереру,
   * чтобы превратить пиксельные UV мешей в UV текстуры.
   */
  wallTexture?: TextureRegion;
  /** Размер и смещение холста земли (px). */
  groundTexture?: TextureRegion;
}

/** Минимальный контракт карты, нужный для геометрии. */
export interface TerrainMap {
  W: number;
  H: number;
  tiles: Uint8Array | ArrayLike<number>;
  height?: Float32Array | ArrayLike<number>;
  walls?: Uint8Array | ArrayLike<number>;
  /** Биомы клеток — задают тон грани утёса. */
  biomes?: Uint8Array | ArrayLike<number>;
  isDungeon: boolean;
}

class MeshBuilder {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];
  /** Тон вершин (sRGB); включается, если задан хотя бы один `tint`. */
  private readonly col: number[] = [];
  private tint: readonly [number, number, number] = [1, 1, 1];

  /** Задать тон для всех следующих квадов (sRGB 0..1). */
  setTint(r: number, g: number, b: number): void {
    this.tint = [r, g, b];
  }

  /** Добавить квад. Точки задаются в мировых единицах, UV — в единицах текстуры. */
  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    ua: number, va: number, ub: number, vb: number,
    uc: number, vc: number, ud: number, vd: number,
  ): void {
    // Горизонтальные квады (пол и пандусы) ориентируем нормалью вверх:
    // three.js/Recast используют CCW winding, иначе поверхность «смотрит» вниз.
    if (crossY(ax, ay, az, bx, by, bz, cx, cy, cz) < 0) {
      this.push(ax, ay, az, dx, dy, dz, cx, cy, cz, bx, by, bz,
        ua, va, ud, vd, uc, vc, ub, vb);
      return;
    }
    this.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz,
      ua, va, ub, vb, uc, vc, ud, vd);
  }

  private push(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    ua: number, va: number, ub: number, vb: number,
    uc: number, vc: number, ud: number, vd: number,
  ): void {
    const base = this.pos.length / 3;
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    this.uv.push(ua, va, ub, vb, uc, vc, ud, vd);
    const [tr, tg, tb] = this.tint;
    // Тон пишется только если он хоть раз отличался от белого: экономим память
    // на мешах, которым цвет не нужен (земля, козырьки).
    if (this.col.length > 0 || tr !== 1 || tg !== 1 || tb !== 1) {
      while (this.col.length < base * 3) this.col.push(1, 1, 1);
      for (let i = 0; i < 4; i++) this.col.push(tr, tg, tb);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  get isEmpty(): boolean {
    return this.idx.length === 0;
  }

  toMesh(): MeshData {
    const mesh: MeshData = {
      positions: new Float32Array(this.pos),
      uvs: new Float32Array(this.uv),
      indices: new Uint32Array(this.idx),
    };
    if (this.col.length > 0) {
      // Добиваем белым вершины, добавленные до первого `setTint`.
      while (this.col.length < (this.pos.length / 3) * 3) this.col.push(1, 1, 1);
      mesh.colors = new Float32Array(this.col);
    }
    return mesh;
  }
}

class NavBuilderData {
  readonly pos: number[] = [];
  readonly idx: number[] = [];

  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
  ): void {
    const base = this.pos.length / 3;
    if (crossY(ax, ay, az, bx, by, bz, cx, cy, cz) < 0) {
      this.pos.push(ax, ay, az, dx, dy, dz, cx, cy, cz, bx, by, bz);
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      return;
    }
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** Y-компонента нормали треугольника (a, b, c). */
function crossY(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  return uz * vx - ux * vz;
}

/**
 * Холст запечённой текстуры: смещение и размер в пикселях карты.
 *
 * Канвас Graphics обрезан по границам нарисованных тайлов, а не по размеру
 * карты (например, у подземелья края пустые), поэтому UV нельзя считать
 * от W*T — иначе текстура съезжает и часть пола остаётся прозрачной.
 */
export interface TextureRegion {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface TerrainMeshOptions {
  /** Холст батча земли (по умолчанию — вся карта). */
  groundTexture?: TextureRegion;
  /** Холст батча стен подземелья: смещение и размер (px). */
  wallTexture?: TextureRegion;
}

export function buildTerrainMesh(map: TerrainMap, opts: TerrainMeshOptions = {}): TerrainMesh {
  const { W, H } = map;
  const texW = W * T;
  const texH = H * T;
  const levels = new Uint8Array(W * H);

  const levelAt = (tx: number, ty: number): number => {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return -1;
    if (map.isDungeon) return 0;
    const h = map.height;
    if (!h || h.length !== W * H) return 0;
    return elevLevel(h[ty * W + tx] ?? 0);
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) levels[y * W + x] = levelAt(x, y);
  }

  const yAtLevel = (lvl: number): number => lvl * TERRACE_HEIGHT;

  const ground = new MeshBuilder();
  const cliffs = new MeshBuilder();
  const lips = new MeshBuilder();
  const rims = new MeshBuilder();
  const waterfalls = new MeshBuilder();
  const dungeonWalls = new MeshBuilder();
  const nav = new NavBuilderData();

  // UV считаются в координатах реальных холстов, а не в пикселях карты.
  const wallTex = opts.wallTexture ?? { offsetX: 0, offsetY: 0, width: texW, height: texH };
  const uw = (px: number): number => (px - wallTex.offsetX) / Math.max(1, wallTex.width);
  const vw = (py: number): number => 1 - (py - wallTex.offsetY) / Math.max(1, wallTex.height);
  const groundTex = opts.groundTexture ?? { offsetX: 0, offsetY: 0, width: texW, height: texH };

  const wallBit = (x: number, y: number, bit: number): boolean => {
    const w = map.walls;
    if (!w || w.length !== W * H) return false;
    return ((w[y * W + x] ?? 0) & bit) !== 0;
  };

  /** UV по пиксельным координатам холста земли (canvas: y вниз). */
  const u = (px: number): number => (px - groundTex.offsetX) / Math.max(1, groundTex.width);
  const v = (py: number): number => 1 - (py - groundTex.offsetY) / Math.max(1, groundTex.height);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lvl = levels[y * W + x] ?? 0;
      const yTop = yAtLevel(lvl);
      const x0 = x * T, x1 = x * T + T;
      const y0 = y * T, y1 = y * T + T;
      const solid = isSolidTileId(map.tiles[y * W + x] ?? 0);
      const isDungeonWall = map.isDungeon && (map.tiles[y * W + x] ?? 0) === DWALL_TILE;

      // ── Верхняя поверхность клетки ──
      ground.quad(
        x0 / T, yTop, y0 / T,
        x1 / T, yTop, y0 / T,
        x1 / T, yTop, y1 / T,
        x0 / T, yTop, y1 / T,
        u(x0), v(y0), u(x1), v(y0), u(x1), v(y1), u(x0), v(y1),
      );
      if (!solid) {
        nav.quad(
          x0 / T, yTop, y0 / T,
          x1 / T, yTop, y0 / T,
          x1 / T, yTop, y1 / T,
          x0 / T, yTop, y1 / T,
        );
      }

      // ── Стены подземелья: боксы вместо батча DWALL ──
      if (isDungeonWall) {
        addDungeonWallBox(dungeonWalls, x, y, uw, vw, DUNGEON_WALL_H);
        continue;
      }

      // ── Утёсы и пандусы по сторонам ──
      const sides: Array<{ bit: number; nb: [number, number] }> = [
        { bit: WB_N, nb: [x, y - 1] },
        { bit: WB_E, nb: [x + 1, y] },
        { bit: WB_S, nb: [x, y + 1] },
        { bit: WB_W, nb: [x - 1, y] },
      ];

      for (const side of sides) {
        const [nx, ny] = side.nb;
        const inBounds = nx >= 0 && ny >= 0 && nx < W && ny < H;
        const nl = inBounds ? (levels[ny * W + nx] ?? -1) : -1;
        const t = map.tiles[y * W + x] ?? 0;
        const nt = inBounds ? (map.tiles[ny * W + nx] ?? 0) : -1;
        // Оба тайла — вода: стык читается как водопад ручья.
        const waterOverWater = isWaterTile(t) && isWaterTile(nt);
        // Ступеньки выключены (см. TERRAIN_STAIRS_ENABLED): любой ПОДЪЁМ без
        // бита стены — всё равно утёс. Иначе на берегу и у кромки воды остаются
        // марши-лесенки там, где маска стен не ставится (вода непроходима).
        const blocked = !inBounds || wallBit(x, y, side.bit)
          || (!TERRAIN_STAIRS_ENABLED && nl > lvl);

        // Закрытый стык — вертикальная стена и для рендера, и для navmesh:
        // высота выше walkableClimb, поэтому recast не соединит поверхности.
        if (blocked) {
          const yHigh = nl > lvl ? yAtLevel(nl) : yAtLevel(lvl + 1);
          if (waterOverWater) {
            addWaterfall(waterfalls, x, y, side.bit, yTop, yHigh);
          } else {
            cliffs.setTint(...cliffTintAt(inBounds ? nx : x, inBounds ? ny : y, map));
            addCliff(cliffs, x, y, side.bit, yTop, yHigh);
            // Козырёк — только с грунта: у воды и у солидов (скалы/деревья)
            // он висел бы в воздухе над чужой моделью.
            const upperIsLand = !inBounds || (!isWaterTile(nt) && !isSolidTileId(nt));
            if (upperIsLand) addLip(lips, x, y, side.bit, yHigh, u, v);
          }
          // Навигационная стена намеренно высокая: она невидима и служит только
          // разрезом navmesh. Её высота должна быть заведомо больше
          // walkableClimb (см. navmesh3d.ts), иначе recast «переступает» утёс.
          addNavWall(nav, x, y, side.bit, yTop, yTop + NAV_WALL_HEIGHT);
          continue;
        }

        // Сосед НИЖЕ — это мы стоим на плато: кладём по своей кромке полоску
        // кладки поверх грунта. Стену ставит низкая клетка (бит у неё), и с
        // трёх сторон её грани не видно — обводка даёт читаемую границу.
        // Кромку ставим по ЛЮБОМУ перепаду вниз, а не только там, где у нижней
        // клетки есть бит стены: у воды и у солидов биты не ставятся, и полоса
        // рвалась пропусками. Перепад виден — значит и кромка нужна.
        if (nl < lvl) {
          // По сливу ручья кромку не ведём: полоса перекрывала струю, а
          // перепад и так читается водопадом.
          if (waterOverWater) continue;
          // Бит стены у нижней клетки ставится только между ПРОХОДИМЫМИ
          // клетками. Над водой и над солидом (скала, дерево) грань утёса
          // не рисует никто — дорисовываем её здесь, иначе под кромкой дыра.
          if (isSolidTileId(nt)) {
            cliffs.setTint(...cliffTintAt(nx, ny, map));
            addCliff(cliffs, x, y, side.bit, yAtLevel(nl), yTop);
          }
          addRim(rims, x, y, side.bit, yTop, uw, vw);
          continue;
        }
        if (nl <= lvl) continue; // подъём рисует только низкая клетка
        cliffs.setTint(...cliffTintAt(x, y, map));
        addRamp(ground, cliffs, nav, x, y, side.bit, yTop, yAtLevel(nl), u, v);
      }
    }
  }

  return {
    ground: ground.toMesh(),
    cliffs: cliffs.toMesh(),
    lips: lips.toMesh(),
    rims: rims.toMesh(),
    waterfalls: waterfalls.toMesh(),
    dungeonWalls: dungeonWalls.toMesh(),
    wallTexture: wallTex,
    groundTexture: groundTex,
    nav: { positions: new Float32Array(nav.pos), indices: new Uint32Array(nav.idx) },
    heightAt(xPx: number, yPx: number): number {
      const tx = Math.floor(xPx / T);
      const ty = Math.floor(yPx / T);
      const l = levelAt(tx, ty);
      return yAtLevel(l < 0 ? 0 : l);
    },
    heightAtTile(tx: number, ty: number): number {
      const l = levelAt(tx, ty);
      return yAtLevel(l < 0 ? 0 : l);
    },
  };
}

/**
 * Высота полосы пены у основания водопада (мировые единицы).
 *
 * Пена фиксированной высоты, а не доля от перепада: иначе на сбросе в три
 * террасы брызги разъезжались в белое полотно.
 */
const FALL_FOAM_H = 0.2;

/** Вода: море и озёра/ручьи (POOL) — на них нет травяного козырька. */
function isWaterTile(t: number): boolean {
  return t === Tl.WATER || t === Tl.POOL || t === Tl.STREAM;
}

/**
 * Тон грани утёса по биому (sRGB; умножается на серую текстуру блоков).
 *
 * Раньше грань брала полосу из текстуры земли и растягивала 4×16 px на всю
 * стену — получалась серая муть. Теперь стена — тайловая текстура блоков, а
 * биом задаёт только тон: снег светлее и холоднее, топь — самая тёмная.
 */
const CLIFF_TINT: Record<number, readonly [number, number, number]> = {
  [Biome.SNOW]: [0.86, 0.84, 0.82],
  [Biome.FOREST]: [0.56, 0.40, 0.27],
  [Biome.SWAMP]: [0.42, 0.33, 0.25],
  [Biome.MEADOW]: [0.68, 0.51, 0.34],
  [Biome.RUINS]: [0.62, 0.53, 0.44],
  [Biome.RIDGE]: [0.66, 0.59, 0.50],
};
const CLIFF_TINT_DEFAULT: readonly [number, number, number] = [0.66, 0.50, 0.34];

/** Тон грани по биому клетки (без данных о биомах — нейтральный камень). */
function cliffTintAt(x: number, y: number, map: TerrainMap): readonly [number, number, number] {
  const biomes = map.biomes;
  if (!biomes) return CLIFF_TINT_DEFAULT;
  const b = biomes[y * map.W + x];
  return CLIFF_TINT[b] ?? CLIFF_TINT_DEFAULT;
}

/**
 * Вертикальная грань утёса на стыке клеток.
 *
 * UV — в единицах текстуры блоков: по ширине ровно один тайл (u = индекс
 * клетки), по высоте — по абсолютной высоте в уровнях террас (v = y /
 * TERRACE_HEIGHT). Поэтому слои породы сходятся у соседних клеток и не
 * растягиваются на высоких стенах.
 */
function addCliff(
  b: MeshBuilder,
  x: number, y: number,
  bit: number,
  yLow: number, yHigh: number,
): void {
  const x0 = x * T, x1 = x * T + T, y0 = y * T, y1 = y * T + T;
  const uA = x, uB = x + 1;                 // U — вдоль Z для запад/восток
  const vA = yLow / TERRACE_HEIGHT;
  const vB = yHigh / TERRACE_HEIGHT;

  switch (bit) {
    case WB_N:
      b.quad(
        x0 / T, yLow, y0 / T,
        x1 / T, yLow, y0 / T,
        x1 / T, yHigh, y0 / T,
        x0 / T, yHigh, y0 / T,
        uA, vA, uB, vA, uB, vB, uA, vB,
      );
      break;
    case WB_S:
      b.quad(
        x1 / T, yLow, y1 / T,
        x0 / T, yLow, y1 / T,
        x0 / T, yHigh, y1 / T,
        x1 / T, yHigh, y1 / T,
        uB, vA, uA, vA, uA, vB, uB, vB,
      );
      break;
    case WB_W:
      b.quad(
        x0 / T, yLow, y1 / T,
        x0 / T, yLow, y0 / T,
        x0 / T, yHigh, y0 / T,
        x0 / T, yHigh, y1 / T,
        uB, vA, uA, vA, uA, vB, uB, vB,
      );
      break;
    default: // WB_E
      b.quad(
        x1 / T, yLow, y0 / T,
        x1 / T, yLow, y1 / T,
        x1 / T, yHigh, y1 / T,
        x1 / T, yHigh, y0 / T,
        uA, vA, uB, vA, uB, vB, uA, vB,
      );
      break;
  }
}

/**
 * Травяной козырёк на верхней кромке утёса: узкая полоска грунта верхней
 * террасы, выступающая над стеной.
 *
 * Берёт одну строку (или столбец) текстуры земли у кромки ВЕРХНЕЙ клетки —
 * цвет козырька точно совпадает с травой плато, как на референсе, где дёрн
 * свисает над обрывом. Над водой козырёк не ставится.
 */
/**
 * Обводка кромки уступа на ВЕРХНЕЙ клетке плато.
 *
 * Камера смотрит с юга: южную грань утёса видно хорошо, а северную, восточную
 * и западную — почти нет (а если тайл плато совпадает с тайлом низа, границы
 * не видно вообще). Поэтому по кромке плато поверх грунта кладётся ПМЛОСКА
 * кладки: стена как бы наползает на верхний тайл, и перепад читается с любой
 * стороны.
 */
function addRim(
  b: MeshBuilder,
  x: number, y: number,
  bit: number,
  yTop: number,
  uw: (px: number) => number,
  vw: (py: number) => number,
): void {
  const R = RIM_PX / T;
  const yR = yTop + RIM_UP;
  const x0 = x, x1 = x + 1, z0 = y, z1 = y + 1;
  const u0 = uw(x * T), u1 = uw(x * T + T);
  const uz0 = uw(y * T), uz1 = uw(y * T + T);
  const vT = vw(0);            // кромка у стены
  const vB = vw(RIM_PX);       // внутрь плато

  switch (bit) {
    case WB_N:
      b.quad(x0, yR, z0, x1, yR, z0, x1, yR, z0 + R, x0, yR, z0 + R,
        u0, vT, u1, vT, u1, vB, u0, vB);
      break;
    case WB_S:
      b.quad(x0, yR, z1 - R, x1, yR, z1 - R, x1, yR, z1, x0, yR, z1,
        u0, vB, u1, vB, u1, vT, u0, vT);
      break;
    case WB_W:
      b.quad(x0, yR, z0, x0, yR, z1, x0 + R, yR, z1, x0 + R, yR, z0,
        uz0, vT, uz1, vT, uz1, vB, uz0, vB);
      break;
    default: // WB_E
      b.quad(x1 - R, yR, z0, x1 - R, yR, z1, x1, yR, z1, x1, yR, z0,
        uz0, vB, uz1, vB, uz1, vT, uz0, vT);
      break;
  }
}

function addLip(
  b: MeshBuilder,
  x: number, y: number,
  bit: number,
  yHigh: number,
  u: (px: number) => number,
  v: (py: number) => number,
): void {
  const x0 = x * T, x1 = x * T + T, y0 = y * T, y1 = y * T + T;
  const yL = yHigh - 0.015;      // чуть ниже плато — без мерцания на стыке
  const o = LIP_OUT;

  switch (bit) {
    case WB_N: {
      const vv = v((y - 1) * T + T - 0.5);   // нижняя кромка клетки-плато
      b.quad(
        x0 / T, yL, y0 / T,
        x1 / T, yL, y0 / T,
        x1 / T, yL, (y0 + o * T) / T,
        x0 / T, yL, (y0 + o * T) / T,
        u(x0), vv, u(x1), vv, u(x1), vv, u(x0), vv,
      );
      break;
    }
    case WB_S: {
      const vv = v((y + 1) * T + 0.5);       // верхняя кромка плато южнее
      b.quad(
        x0 / T, yL, (y1 - o * T) / T,
        x1 / T, yL, (y1 - o * T) / T,
        x1 / T, yL, y1 / T,
        x0 / T, yL, y1 / T,
        u(x0), vv, u(x1), vv, u(x1), vv, u(x0), vv,
      );
      break;
    }
    case WB_W: {
      const uu = u((x - 1) * T + T - 0.5);
      b.quad(
        x0 / T, yL, y0 / T,
        (x0 + o * T) / T, yL, y0 / T,
        (x0 + o * T) / T, yL, y1 / T,
        x0 / T, yL, y1 / T,
        uu, v(y0), uu, v(y0), uu, v(y1), uu, v(y1),
      );
      break;
    }
    default: { // WB_E
      const uu = u((x + 1) * T + 0.5);
      b.quad(
        (x1 - o * T) / T, yL, y0 / T,
        x1 / T, yL, y0 / T,
        x1 / T, yL, y1 / T,
        (x1 - o * T) / T, yL, y1 / T,
        uu, v(y0), uu, v(y0), uu, v(y1), uu, v(y1),
      );
      break;
    }
  }
}

/**
 * Водопад на перепаде «вода над водой»: падающая струя и пена у основания.
 *
 * Раньше здесь ставились пояса воды из атласа земли — по одному на каждый
 * уровень перепада. Ручей, спускавшийся ступеньками, превращался в широкую
 * стену с белыми полосами, то есть читался как «вода течёт по уступам».
 *
 * Теперь это одна вертикальная струя во всю высоту сброса (собственная
 * текстура водопада, см. waterfall-texture.ts) и полоса пены у основания —
 * как на референсе.
 */
function addWaterfall(
  b: MeshBuilder,
  x: number, y: number,
  bit: number,
  yLow: number, yHigh: number,
): void {
  const x0 = x * T, x1 = x * T + T, y0 = y * T, y1 = y * T + T;

  /** Ширина грани: две точки на плоскости стыка, в пикселях карты. */
  let ax: number, az: number, bx: number, bz: number;
  switch (bit) {
    case WB_N: ax = x0; az = y0; bx = x1; bz = y0; break;
    case WB_S: ax = x1; az = y1; bx = x0; bz = y1; break;
    case WB_W: ax = x0; az = y1; bx = x0; bz = y0; break;
    default: ax = x1; az = y0; bx = x1; bz = y1; break;   // WB_E
  }

  /** Квад грани: yA..yB по высоте, UV — u 0..1 по ширине, va..vb по v. */
  const face = (yA: number, yB: number, va: number, vb: number): void => {
    b.quad(
      ax / T, yA, az / T,
      bx / T, yA, bz / T,
      bx / T, yB, bz / T,
      ax / T, yB, az / T,
      0, va, 1, va, 1, vb, 0, vb,
    );
  };

  // Пена — фиксированной высоты у основания; струя занимает всё остальное.
  const foamTop = Math.min(yHigh, yLow + FALL_FOAM_H);
  const bodyH = yHigh - foamTop;
  if (bodyH > 0.001) {
    // Чем выше сброс, тем длиннее струи: v тянется из тела текстуры (0.25..1),
    // поэтому на высоких падениях вода не повторяет пену по всей стене.
    const vTop = Math.min(1, FALL_FOAM_V + 0.75 * bodyH);
    face(foamTop, yHigh, FALL_FOAM_V, vTop);
  }
  if (foamTop > yLow) face(yLow, foamTop, 0, FALL_FOAM_V);
}

/**
 * Лестница на открытом перепаде высот: заходит внутрь низкой клетки и
 * поднимается до уровня соседа.
 *
 * Навигация остаётся ровным пандусом (recast не соединяет ступеньки мельче
 * walkableClimb), а визуально строится настоящий марш: RAMP_STEPS проступей
 * из текстуры земли и столько же подступенков из полосы камня. Раньше марш
 * был одним наклонным квадом — с камеры 58° он читался как тонкая плита.
 */
function addRamp(
  g: MeshBuilder,
  cliffs: MeshBuilder,
  nav: NavBuilderData,
  x: number, y: number,
  bit: number,
  yLow: number, yHigh: number,
  u: (px: number) => number,
  v: (py: number) => number,
): void {
  const x0 = x * T, x1 = x * T + T, y0 = y * T, y1 = y * T + T;
  const d = Math.min(RAMP_DEPTH_PX, T);

  switch (bit) {
    case WB_N: {
      // пандус внутрь клетки от северного стыка
      const ya = y0 / T, yb = (y0 + d) / T;
      // Наклонную плиту больше не рисуем: поверхность марша — только ступени
      // (визуальный слой ниже), а пандус остаётся исключительно в navmesh.
      nav.quad(
        x0 / T, yHigh, ya,
        x1 / T, yHigh, ya,
        x1 / T, yLow, yb,
        x0 / T, yLow, yb,
      );
      break;
    }
    case WB_S: {
      const ya = (y1 - d) / T, yb = y1 / T;
      nav.quad(
        x0 / T, yLow, ya,
        x1 / T, yLow, ya,
        x1 / T, yHigh, yb,
        x0 / T, yHigh, yb,
      );
      break;
    }
    case WB_W: {
      const xa = x0 / T, xb = (x0 + d) / T;
      nav.quad(
        xa, yHigh, y0 / T,
        xa, yHigh, y1 / T,
        xb, yLow, y1 / T,
        xb, yLow, y0 / T,
      );
      break;
    }
    default: { // WB_E
      const xa = (x1 - d) / T, xb = x1 / T;
      nav.quad(
        xa, yLow, y0 / T,
        xa, yLow, y1 / T,
        xb, yHigh, y1 / T,
        xb, yHigh, y0 / T,
      );
      break;
    }
  }

  // ── Визуал: настоящий марш из ступеней ──
  const alongZ = bit === WB_N || bit === WB_S;
  // Край марша (у верхней террасы) и направление спуска — внутрь клетки.
  const edge = bit === WB_N ? y0 : bit === WB_S ? y1 : bit === WB_W ? x0 : x1;
  const dir = bit === WB_N || bit === WB_W ? 1 : -1;
  const c0 = alongZ ? x0 : y0;
  const c1 = alongZ ? x1 : y1;
  const stepD = d / RAMP_STEPS;
  const stepH = (yHigh - yLow) / RAMP_STEPS;

  /** Точка марша в пикселях: s — вдоль марша от края, c — поперёк. */
  const at = (s: number, c: number): [number, number] =>
    alongZ ? [c, edge + dir * s] : [edge + dir * s, c];

  for (let i = 0; i < RAMP_STEPS; i++) {
    const sA = i * stepD;
    const sB = (i + 1) * stepD;
    const yTop = yHigh - i * stepH;

    // Проступь — по текстуре земли, чтобы цвет совпадал с поверхностью.
    const [ax, az] = at(sA, c0);
    const [bx, bz] = at(sA, c1);
    const [cx, cz] = at(sB, c1);
    const [dx, dz] = at(sB, c0);
    g.quad(
      ax / T, yTop, az / T,
      bx / T, yTop, bz / T,
      cx / T, yTop, cz / T,
      dx / T, yTop, dz / T,
      u(ax), v(az), u(bx), v(bz), u(cx), v(cz), u(dx), v(dz),
    );

    // Подступенок под задней кромкой проступи — блоки породы (та же текстура,
    // что у утёсов).
    const yBot = yTop - stepH;
    const [rx1, rz1] = at(sB, c0);
    const [rx2, rz2] = at(sB, c1);
    const uA = alongZ ? x : y;
    const uB = alongZ ? x + 1 : y + 1;
    // Один подступенок = один ряд кладки: v растянут на весь нижний ряд
    // текстуры (шов у основания, светлая кромка сверху). Абсолютная высота тут
    // не годилась — срез в четверть ряда давал слоёную стену.
    const vBot = 0.5;
    const vTop = 0.5 + 1 / CLIFF_ROWS;
    cliffs.quad(
      rx1 / T, yBot, rz1 / T,
      rx2 / T, yBot, rz2 / T,
      rx2 / T, yTop, rz2 / T,
      rx1 / T, yTop, rz1 / T,
      uA, vBot, uB, vBot, uB, vTop, uA, vTop,
    );
  }
}

/**
 * Стена уступа в навигационной геометрии (блокирует проход через стык).
 *
 * Строится КОРОБКОЙ, а не одной плоскостью: recast растеризует геометрию по
 * вокселям, и нулевая толщина не давала гарантированного препятствия —
 * с увеличенным walkableClimb путь проходил сквозь утёс.
 */
function addNavWall(
  nav: NavBuilderData,
  x: number, y: number,
  bit: number,
  yLow: number, yHigh: number,
): void {
  const X0 = x, X1 = x + 1, Z0 = y, Z1 = y + 1;
  // Плоскость ровно по стыку: тонкая геометрия не должна сужать проходы,
  // иначе на карте с узкими террасными коридорами navmesh распадается.
  switch (bit) {
    case WB_N:
      nav.quad(X0, yLow, Z0, X1, yLow, Z0, X1, yHigh, Z0, X0, yHigh, Z0);
      break;
    case WB_S:
      nav.quad(X1, yLow, Z1, X0, yLow, Z1, X0, yHigh, Z1, X1, yHigh, Z1);
      break;
    case WB_W:
      nav.quad(X0, yLow, Z1, X0, yLow, Z0, X0, yHigh, Z0, X0, yHigh, Z1);
      break;
    default:
      nav.quad(X1, yLow, Z0, X1, yLow, Z1, X1, yHigh, Z1, X1, yHigh, Z0);
      break;
  }
}

/**
 * Бокс стены подземелья: 4 вертикальные грани с фасадом-кирпичом из тайлсета
 * подземелья + плита-крышка сверху.
 *
 * Раньше грани красились одним цветом (семпл текстуры земли в точке 0.5,0.5),
 * из-за чего в подземелье стены получались почти чёрными: цвет пола
 * (0x141a22) умножался на серый материал.
 */
function addDungeonWallBox(
  b: MeshBuilder,
  x: number, y: number,
  uw: (px: number) => number,
  vw: (py: number) => number,
  height: number,
): void {
  const X0 = x, X1 = x + 1, Z0 = y, Z1 = y + 1;
  const yBase = 0;
  const yTop = height;

  // Пиксельные границы тайла и полосы тайлсета.
  const px0 = x * T, px1 = (x + 1) * T;
  const py0 = y * T, py1 = (y + 1) * T;
  const uA = uw(px0), uB = uw(px1);
  const vBottom = vw(py1);          // низ тайла — низ фасада
  const vFacade = vw(py0 + DWALL_CAP_PX); // верх фасада под плитой

  // Вертикальная грань: uA→uB по ширине, vBottom→vFacade по высоте.
  const face = (
    ax: number, az: number, bx: number, bz: number,
    uLeft: number, uRight: number,
  ): void => {
    b.quad(
      ax, yBase, az,
      bx, yBase, bz,
      bx, yTop, bz,
      ax, yTop, az,
      uLeft, vBottom, uRight, vBottom, uRight, vFacade, uLeft, vFacade,
    );
  };

  face(X0, Z1, X1, Z1, uA, uB);   // юг (к камере) — фасад
  face(X1, Z0, X0, Z0, uB, uA);   // север — зеркально
  face(X1, Z0, X1, Z1, uA, uB);   // восток
  face(X0, Z1, X0, Z0, uB, uA);   // запад

  // Крышка — весь тайл целиком: сверху массив породы выглядит ровно как
  // 2.5D-тайл на карте (плита + канты), а не как серая заливка.
  b.quad(
    X0, yTop, Z0,
    X1, yTop, Z0,
    X1, yTop, Z1,
    X0, yTop, Z1,
    uA, vw(py0), uB, vw(py0), uB, vw(py1), uA, vw(py1),
  );
}

/** Сколько уровней высоты в мире (для отладки/тестов). */
export const MAX_LEVEL = ELEV_LEVELS;
