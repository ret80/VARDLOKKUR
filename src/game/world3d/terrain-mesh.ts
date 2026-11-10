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

import { T, isSolidTileId, elevLevel, ELEV_LEVELS } from '../generators/types';

/** Пикселей на мировую единицу (совпадает с T). */
export const PX_PER_UNIT = T;
/** Высота одной террасы в мировых единицах. */
export const TERRACE_HEIGHT = 0.6;
/**
 * Глубина пандуса на открытом стыке (в пикселях).
 *
 * 1.6 тайла даёт уклон ~20° на один уровень: такой пандус остаётся
 * проходимым в navmesh (recast эродирует края высоты агента) и легче для
 * восприятия, чем прежние крутые 33°.
 */
const RAMP_DEPTH_PX = T * 0.9;

/**
 * Ступеней в марше лестницы. Совпадает с RAMP_STEPS в 2D-арте пандуса
 * (geometry/tile-geom.ts): три проступи на один марш.
 */
const RAMP_STEPS = 3;

/**
 * Высота каменной грани уступа в пикселях текстуры на уровень перепада.
 * Повторяет CLIFF_STEP_PX из 2D-арта (geometry/tile-geom.ts) — по нему
 * нарисована полоса камня в текстуре земли.
 */
const FACE_STEP_PX = 6;
/** Потолок высоты каменной грани в пикселях (FACE_CAP там же). */
const FACE_CAP_PX = T - 2;
/** Ширина боковой (запад/восток) каменной грани в пикселях (SIDE_PX там же). */
const SIDE_PX = 3;

/** Биты маски стен (см. generators/terrain-walls WallBit). */
const WB_N = 1, WB_E = 2, WB_S = 4, WB_W = 8;

/** Код стены подземелья (Tile.DWALL). */
export const DWALL_TILE = 20;
/** Высота стены подземелья в мировых единицах (~1 тайл). */
export const DUNGEON_WALL_H = 1.4;
/** Сколько пикселей сверху тайла стены — плита, ниже — фасад-кирпич. */
const DWALL_CAP_PX = 5;

/** Высота невидимых стен в nav-геометрии (заведомо выше walkableClimb). */
const NAV_WALL_HEIGHT = 1.5;

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export interface TerrainMesh {
  /** Верхние поверхности + пандусы (с текстурой земли). */
  ground: MeshData;
  /** Вертикальные утёсы (каменные грани). */
  cliffs: MeshData;
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
  isDungeon: boolean;
}

class MeshBuilder {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

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
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  toMesh(): MeshData {
    return {
      positions: new Float32Array(this.pos),
      uvs: new Float32Array(this.uv),
      indices: new Uint32Array(this.idx),
    };
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
        const blocked = !inBounds || wallBit(x, y, side.bit);

        // Закрытый стык — вертикальная стена и для рендера, и для navmesh:
        // высота выше walkableClimb, поэтому recast не соединит поверхности.
        if (blocked) {
          const yHigh = nl > lvl ? yAtLevel(nl) : yAtLevel(lvl + 1);
          addCliff(cliffs, x, y, side.bit, yTop, yHigh, u, v);
          // Навигационная стена намеренно высокая: она невидима и служит только
          // разрезом navmesh. Её высота должна быть заведомо больше
          // walkableClimb (см. navmesh3d.ts), иначе recast «переступает» утёс.
          addNavWall(nav, x, y, side.bit, yTop, yTop + NAV_WALL_HEIGHT);
          continue;
        }

        if (nl <= lvl) continue; // подъём рисует только низкая клетка
        addRamp(ground, cliffs, nav, x, y, side.bit, yTop, yAtLevel(nl), u, v);
      }
    }
  }

  return {
    ground: ground.toMesh(),
    cliffs: cliffs.toMesh(),
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
 * Пиксельные границы полосы камня в текстуре земли — та же геометрия, что
 * рисует 2D-арт (edgeFace/sideFace в geometry/tile-geom.ts).
 *
 * Северный/южный уступ в арте — горизонтальная полоса во всю ширину тайла
 * у его края; западный/восточный — узкая колонка во всю высоту тайла.
 * Раньше грань растягивала 4×16 px столбик на всю стену и читалась серой
 * мутью, а не камнем с кромкой.
 */
function faceBandRows(py0: number, py1: number, north: boolean, levels: number): [number, number] {
  const h = Math.min(FACE_CAP_PX, FACE_STEP_PX * Math.max(1, levels));
  return north ? [py0, py0 + h] : [py1 - h, py1];
}

/** Колонка боковой грани (запад/восток) в пикселях тайла. */
function sideFaceCols(px0: number, px1: number, west: boolean, levels: number): [number, number] {
  const w = Math.min(5, SIDE_PX + Math.max(1, levels) - 1);
  return west ? [px0, px0 + w] : [px1 - w, px1];
}

/** Сколько уровней террас между нижней и верхней кромками грани. */
function levelsBetween(yLow: number, yHigh: number): number {
  return Math.max(1, Math.round((yHigh - yLow) / TERRACE_HEIGHT));
}

/** Вертикальная грань утёса на стыке клеток. */
function addCliff(
  b: MeshBuilder,
  x: number, y: number,
  bit: number,
  yLow: number, yHigh: number,
  u: (px: number) => number,
  v: (py: number) => number,
): void {
  const x0 = x * T, x1 = x * T + T, y0 = y * T, y1 = y * T + T;
  const levels = levelsBetween(yLow, yHigh);
  const va = v(y0), vb = v(y1);

  switch (bit) {
    case WB_N: {
      const [ra, rb] = faceBandRows(y0, y1, true, levels);
      b.quad(
        x0 / T, yLow, y0 / T,
        x1 / T, yLow, y0 / T,
        x1 / T, yHigh, y0 / T,
        x0 / T, yHigh, y0 / T,
        u(x0), v(rb), u(x1), v(rb), u(x1), v(ra), u(x0), v(ra),
      );
      break;
    }
    case WB_S: {
      const [ra, rb] = faceBandRows(y0, y1, false, levels);
      b.quad(
        x1 / T, yLow, y1 / T,
        x0 / T, yLow, y1 / T,
        x0 / T, yHigh, y1 / T,
        x1 / T, yHigh, y1 / T,
        u(x1), v(rb), u(x0), v(rb), u(x0), v(ra), u(x1), v(ra),
      );
      break;
    }
    case WB_W: {
      const [ca, cb] = sideFaceCols(x0, x1, true, levels);
      b.quad(
        x0 / T, yLow, y1 / T,
        x0 / T, yLow, y0 / T,
        x0 / T, yHigh, y0 / T,
        x0 / T, yHigh, y1 / T,
        u(ca), vb, u(cb), vb, u(cb), va, u(ca), va,
      );
      break;
    }
    default: { // WB_E
      const [ca, cb] = sideFaceCols(x0, x1, false, levels);
      b.quad(
        x1 / T, yLow, y0 / T,
        x1 / T, yLow, y1 / T,
        x1 / T, yHigh, y1 / T,
        x1 / T, yHigh, y0 / T,
        u(ca), va, u(cb), va, u(cb), vb, u(ca), vb,
      );
      break;
    }
  }
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
      g.quad(
        x0 / T, yHigh, ya,
        x1 / T, yHigh, ya,
        x1 / T, yLow, yb,
        x0 / T, yLow, yb,
        u(x0), v(y0), u(x1), v(y0), u(x1), v(y0 + d), u(x0), v(y0 + d),
      );
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
      g.quad(
        x0 / T, yLow, ya,
        x1 / T, yLow, ya,
        x1 / T, yHigh, yb,
        x0 / T, yHigh, yb,
        u(x0), v(y1 - d), u(x1), v(y1 - d), u(x1), v(y1), u(x0), v(y1),
      );
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
      g.quad(
        xa, yHigh, y0 / T,
        xa, yHigh, y1 / T,
        xb, yLow, y1 / T,
        xb, yLow, y0 / T,
        u(x0), v(y0), u(x0), v(y1), u(x0 + d), v(y1), u(x0 + d), v(y0),
      );
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
      g.quad(
        xa, yLow, y0 / T,
        xa, yLow, y1 / T,
        xb, yHigh, y1 / T,
        xb, yHigh, y0 / T,
        u(x1 - d), v(y0), u(x1 - d), v(y1), u(x1), v(y1), u(x1), v(y0),
      );
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
  const levels = levelsBetween(yLow, yHigh);
  // Полоса камня в текстуре для подступенков: марш вдоль z берёт грань у
  // края тайла, марш вдоль x — колонку боковой грани.
  const [bandA, bandB] = faceBandRows(y0, y1, bit === WB_N, levels);
  const [colA, colB] = sideFaceCols(x0, x1, bit === WB_W, levels);

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

    // Подступенок под задней кромкой проступи — по полосе камня.
    const yBot = yTop - stepH;
    const [rx1, rz1] = at(sB, c0);
    const [rx2, rz2] = at(sB, c1);
    const uA = alongZ ? u(c0) : u(colA);
    const uB = alongZ ? u(c1) : u(colB);
    const vTop = alongZ ? v(bandA) : v(y0);
    const vBot = alongZ ? v(bandB) : v(y1);
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
