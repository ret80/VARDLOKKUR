/* village-mesh.ts — 3D-геометрия деревни: дома и частокол.
 *
 * До этого дома и забор рисовались 2D-артом и в 3D подставлялись билбордами.
 * У частокола арт лежит ниже точки привязки (локальные y 1..15 при базе 0),
 * поэтому в 3D он уходил под землю и «исчезал»; дома же читались плоскими
 * картинками. Здесь обе сущности получают настоящую геометрию:
 *
 *   - дом  = фундамент + сруб (бокс) + двускатная кровля + дверь/окна;
 *   - забор = вертикальные плоскости по внешнему периметру частокола
 *             с пиксельной текстурой кольев и перекладин.
 *
 * Геометрия в мировых единицах three.js (16 px = 1 юнит), ось Y — вверх.
 */

import { T, Tl, Biome, type WorldData } from '../world';
import { isSolidTileId } from '../generators/types';
import type { MeshData } from './terrain-mesh';

/* ============================================================
 * Палитра (взята из house-geom.ts / wall-geom.ts)
 * ============================================================ */

/** Цвета дома */
const C = {
  foundation: 0x565e6a,
  foundationTop: 0x6a737f,
  wall: 0x5a4430,
  wallSide: 0x42311f,
  wallTop: 0x6a543c,
  beam: 0x241a10,
  roof: 0x4a3626,
  roofSide: 0x362718,
  roofRidge: 0x8a7452,
  door: 0x2a1c10,
  window: 0xf8e0a0,
  windowCold: 0xb8d0e8,
  snow: 0xeef6fc,
  ruinWall: 0x3a3229,
} as const;

/** Цвет частокола (для отрисовки текстуры) */
const FENCE = {
  body: 0x4e3c28,
  light: 0x63503a,
  shadow: 0x3a2c1c,
  tip: 0x6e5840,
  rail: 0x5a4632,
  railDark: 0x463626,
} as const;

/** Высота сруба и кровли (мировые единицы) */
const HOUSE_WALL_H = 1.7;
const HOUSE_ROOF_H = 1.5;
const ROOF_OVERHANG = 0.32;
const FOUNDATION_H = 0.18;
/** Высота частокола: 20 px арта = 1.25 юнита */
const FENCE_H = 1.25;

/* ============================================================
 * Сборщик мешей (позиции + UV + индексы)
 * ============================================================ */

class PartBuilder {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

  /** Квад по четырём точкам с UV; ориентация не важна — материал DoubleSide. */
  quad(
    ax: number, ay: number, az: number, ua: number, va: number,
    bx: number, by: number, bz: number, ub: number, vb: number,
    cx: number, cy: number, cz: number, uc: number, vc: number,
    dx: number, dy: number, dz: number, ud: number, vd: number,
  ): void {
    const base = this.pos.length / 3;
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    this.uv.push(ua, va, ub, vb, uc, vc, ud, vd);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Ось-выровненный бокс (без нижней грани — она на земле). */
  box(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
  ): void {
    // Юг (+Z) и север (−Z)
    this.quad(x0, y0, z1, 0, 0, x1, y0, z1, 1, 0, x1, y1, z1, 1, 1, x0, y1, z1, 0, 1);
    this.quad(x1, y0, z0, 0, 0, x0, y0, z0, 1, 0, x0, y1, z0, 1, 1, x1, y1, z0, 0, 1);
    // Восток (+X) и запад (−X)
    this.quad(x1, y0, z1, 0, 0, x1, y0, z0, 1, 0, x1, y1, z0, 1, 1, x1, y1, z1, 0, 1);
    this.quad(x0, y0, z0, 0, 0, x0, y0, z1, 1, 0, x0, y1, z1, 1, 1, x0, y1, z0, 0, 1);
    // Верх
    this.quad(x0, y1, z1, 0, 0, x1, y1, z1, 1, 0, x1, y1, z0, 1, 1, x0, y1, z0, 0, 1);
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  toMesh(): MeshData {
    return {
      positions: new Float32Array(this.pos),
      uvs: new Float32Array(this.uv),
      indices: new Uint32Array(this.idx),
    };
  }
}

/* ============================================================
 * Дома
 * ============================================================ */

export interface HouseBlock {
  /** Левый верхний тайл дома */
  x: number;
  y: number;
  /** Размер в тайлах */
  w: number;
  h: number;
  /** Детерминированный вариант (окна/цвет) */
  variant: number;
  ruined: boolean;
  snow: boolean;
}

/** Одна цветная часть здания: готова к превращению в THREE.Mesh. */
export interface Part {
  color: number;
  data: MeshData;
}

/**
 * Найти блоки домов на карте (те же, что рисует createMapTileGraphics:
 * прямоугольники подряд идущих тайлов HOUSE).
 */
export function collectHouses(map: WorldData, roofSnow: boolean): HouseBlock[] {
  const { W, H, tiles } = map;
  const blocks: HouseBlock[] = [];
  const inRuins = new Set<number>();
  for (const r of map.ruinedHouses ?? []) {
    for (let dy = 0; dy < r.h; dy++)
      for (let dx = 0; dx < r.w; dx++) inRuins.add((r.y + dy) * W + (r.x + dx));
  }
  const seen = new Set<string>();

  // Детерминированный вариант — как в map-render-system
  const rnd = (x: number, y: number, s: number): number => {
    const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== Tl.HOUSE) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;

      let hw = 1;
      let hh = 1;
      while (x + hw < W && tiles[y * W + (x + hw)] === Tl.HOUSE) hw++;
      while (y + hh < H) {
        let rowOk = true;
        for (let dx = 0; dx < hw; dx++) {
          if (tiles[(y + hh) * W + (x + dx)] !== Tl.HOUSE) { rowOk = false; break; }
        }
        if (!rowOk) break;
        hh++;
      }
      for (let dy = 0; dy < hh; dy++)
        for (let dx = 0; dx < hw; dx++) seen.add(`${x + dx},${y + dy}`);

      const variant = (rnd(x, y, 13) > 0.5 ? 1 : 0) | (rnd(x, y, 11) > 0.6 ? 2 : 0);
      const snow = roofSnow && !!map.biomes && map.biomes[y * W + x] === Biome.SNOW;
      blocks.push({
        x, y, w: hw, h: hh, variant,
        ruined: inRuins.has(y * W + x),
        snow,
      });
    }
  }
  return blocks;
}

/**
 * Двускатная кровля: два ската разной светлоты (свет — «с юга»),
 * треугольные фронтоны и светлый конёк. Без освещения в сцене разница
 * тонов и есть весь объём, поэтому скаты идут в разные сборщики.
 */
function addGableRoof(
  south: PartBuilder,
  north: PartBuilder,
  gables: PartBuilder,
  trim: PartBuilder,
  x0: number, z0: number, x1: number, z1: number,
  yEave: number, rise: number,
  ridgeAlongX: boolean,
): void {
  if (ridgeAlongX) {
    const zc = (z0 + z1) / 2;
    const yR = yEave + rise;
    // Южный (к камере) и северный скаты
    south.quad(x0, yEave, z1, 0, 0, x1, yEave, z1, 1, 0, x1, yR, zc, 1, 1, x0, yR, zc, 0, 1);
    north.quad(x1, yEave, z0, 0, 0, x0, yEave, z0, 1, 0, x0, yR, zc, 1, 1, x1, yR, zc, 0, 1);
    // Фронтоны (треугольники на торцах)
    gables.quad(x0, yEave, z1, 0, 0, x0, yEave, z0, 1, 0, x0, yR, zc, 0.5, 1, x0, yR, zc, 0.5, 1);
    gables.quad(x1, yEave, z0, 0, 0, x1, yEave, z1, 1, 0, x1, yR, zc, 0.5, 1, x1, yR, zc, 0.5, 1);
    // Конёк
    trim.quad(x0, yR - 0.05, zc - 0.07, 0, 0, x1, yR - 0.05, zc - 0.07, 1, 0, x1, yR + 0.05, zc + 0.07, 1, 1, x0, yR + 0.05, zc + 0.07, 0, 1);
  } else {
    const xc = (x0 + x1) / 2;
    const yR = yEave + rise;
    // Два ската вдоль оси Z
    south.quad(x0, yEave, z0, 0, 0, x0, yEave, z1, 1, 0, xc, yR, z1, 1, 1, xc, yR, z0, 0, 1);
    north.quad(x1, yEave, z1, 0, 0, x1, yEave, z0, 1, 0, xc, yR, z0, 1, 1, xc, yR, z1, 0, 1);
    // Фронтоны
    gables.quad(x0, yEave, z1, 0, 0, x1, yEave, z1, 1, 0, xc, yR, z1, 0.5, 1, xc, yR, z1, 0.5, 1);
    gables.quad(x1, yEave, z0, 0, 0, x0, yEave, z0, 1, 0, xc, yR, z0, 0.5, 1, xc, yR, z0, 0.5, 1);
    trim.quad(xc - 0.07, yR - 0.05, z0, 0, 0, xc - 0.07, yR - 0.05, z1, 1, 0, xc + 0.07, yR + 0.05, z1, 1, 1, xc + 0.07, yR + 0.05, z0, 0, 1);
  }
}

/**
 * 3D-дома карты.
 *
 * @param heightAtY высота поверхности по индексам тайла (для рельефа)
 */
export function buildHouses3D(
  map: WorldData,
  houses: HouseBlock[],
  heightAtTile: (tx: number, ty: number) => number,
): Part[] {
  const foundation = new PartBuilder();
  const walls = new PartBuilder();
  const wallsSide = new PartBuilder();
  const roofSouth = new PartBuilder();
  const roofNorth = new PartBuilder();
  const roofsMid = new PartBuilder();
  const trim = new PartBuilder();
  const snowParts = new PartBuilder();
  const details = new PartBuilder();
  const dark = new PartBuilder();
  /** Окна: цвет зависит от варианта дома, поэтому копятся отдельными частями. */
  const windows: Part[] = [];

  for (const hs of houses) {
    const x0 = hs.x;
    const z0 = hs.y;
    const x1 = hs.x + hs.w;
    const z1 = hs.y + hs.h;
    const baseY = heightAtTile(hs.x, hs.y);

    // Фундамент чуть шире сруба
    foundation.box(x0 - 0.06, baseY, z0 - 0.06, x1 + 0.06, baseY + FOUNDATION_H, z1 + 0.06);

    // Сруб
    const wy0 = baseY + FOUNDATION_H;
    const wy1 = wy0 + HOUSE_WALL_H;
    const wx0 = x0 + 0.08, wz0 = z0 + 0.08, wx1 = x1 - 0.08, wz1 = z1 - 0.08;
    const wallTarget = hs.ruined ? dark : walls;
    wallTarget.box(wx0, wy0, wz0, wx1, wy1, wz1);
    // Боковые грани чуть темнее — «объём» без освещения
    wallsSide.quad(wx1, wy0, wz1, 0, 0, wx1, wy0, wz0, 1, 0, wx1, wy1, wz0, 1, 1, wx1, wy1, wz1, 0, 1);
    wallsSide.quad(wx0, wy0, wz0, 0, 0, wx0, wy0, wz1, 1, 0, wx0, wy1, wz1, 1, 1, wx0, wy1, wz0, 0, 1);

    if (hs.ruined) {
      // Руины: только обломки стен, без кровли
      const halfH = wy1 - 0.55;
      dark.quad(wx0, halfH, wz1, 0, 0, wx1, halfH, wz1, 1, 0, wx1, wy1, wz1, 1, 1, wx0, wy1, wz1, 0, 1);
      continue;
    }

    // Кровля: южный скат светлее северного, конёк и карниз — светлое дерево
    const ridgeAlongX = hs.w >= hs.h;
    const ey0 = wy1;
    const rise = HOUSE_ROOF_H;
    const ox = ROOF_OVERHANG;
    addGableRoof(roofSouth, roofNorth, roofsMid, trim, wx0 - ox, wz0 - ox, wx1 + ox, wz1 + ox, ey0, rise, ridgeAlongX);

    // Светлый карниз по южному краю
    trim.quad(wx0 - ox, ey0 - 0.02, wz1 + ox, 0, 0, wx1 + ox, ey0 - 0.02, wz1 + ox, 1, 0, wx1 + ox, ey0 + 0.09, wz1 + ox, 1, 1, wx0 - ox, ey0 + 0.09, wz1 + ox, 0, 1);

    // Снег на скатах
    if (hs.snow) {
      const zc = (wz0 + wz1) / 2;
      snowParts.quad(wx0 - ox + 0.1, ey0 + rise - 0.35, zc - 0.16, 0, 0, wx1 + ox - 0.1, ey0 + rise - 0.35, zc - 0.16, 1, 0, wx1 + ox - 0.1, ey0 + rise + 0.02, zc, 1, 1, wx0 - ox + 0.1, ey0 + rise + 0.02, zc, 0, 1);
      snowParts.quad(wx1 + ox - 0.1, ey0 + rise - 0.35, zc + 0.16, 0, 0, wx0 - ox + 0.1, ey0 + rise - 0.35, zc + 0.16, 1, 0, wx0 - ox + 0.1, ey0 + rise + 0.02, zc, 1, 1, wx1 + ox - 0.1, ey0 + rise + 0.02, zc, 0, 1);
    }

    // Дверь и окна на южном фасаде (к камере)
    const dz = wz1 + 0.012;
    const doorW = 0.7;
    const doorH = Math.min(1.05, HOUSE_WALL_H - 0.35);
    const doorX = (wx0 + wx1) / 2 - doorW / 2;
    details.quad(
      doorX, wy0, dz, 0, 0,
      doorX + doorW, wy0, dz, 1, 0,
      doorX + doorW, wy0 + doorH, dz, 1, 1,
      doorX, wy0 + doorH, dz, 0, 1,
    );
    // Тёмная рама двери
    dark.quad(
      doorX - 0.08, wy0, dz + 0.004, 0, 0,
      doorX + doorW + 0.08, wy0, dz + 0.004, 1, 0,
      doorX + doorW + 0.08, wy0 + doorH + 0.08, dz + 0.004, 1, 1,
      doorX - 0.08, wy0 + doorH + 0.08, dz + 0.004, 0, 1,
    );

    const winColor = hs.variant & 1 ? C.window : C.windowCold;
    const winPart = new PartBuilder();
    const winY = wy0 + HOUSE_WALL_H * 0.5;
    const winSize = 0.28;
    const wxs = [wx0 + (wx1 - wx0) * 0.18, wx0 + (wx1 - wx0) * 0.82 - winSize];
    for (const wxo of wxs) {
      winPart.quad(
        wxo, winY, dz, 0, 0,
        wxo + winSize, winY, dz, 1, 0,
        wxo + winSize, winY + winSize, dz, 1, 1,
        wxo, winY + winSize, dz, 0, 1,
      );
    }
    windows.push({ color: winColor, data: winPart.toMesh() });
  }

  const out: Part[] = [];
  if (!foundation.empty) out.push({ color: C.foundation, data: foundation.toMesh() });
  if (!walls.empty) out.push({ color: C.wall, data: walls.toMesh() });
  if (!wallsSide.empty) out.push({ color: C.wallSide, data: wallsSide.toMesh() });
  if (!roofSouth.empty) out.push({ color: C.roof, data: roofSouth.toMesh() });
  if (!roofNorth.empty) out.push({ color: C.roofSide, data: roofNorth.toMesh() });
  if (!roofsMid.empty) out.push({ color: C.roofSide, data: roofsMid.toMesh() });
  if (!trim.empty) out.push({ color: C.wallTop, data: trim.toMesh() });
  if (!details.empty) out.push({ color: C.door, data: details.toMesh() });
  if (!snowParts.empty) out.push({ color: C.snow, data: snowParts.toMesh() });
  if (!dark.empty) out.push({ color: C.beam, data: dark.toMesh() });
  for (const d of windows) out.push(d);
  return out;
}

/* ============================================================
 * Частокол
 * ============================================================ */

/**
 * Тесктура кольев: прозрачный верх (остриё), два пояса перекладин.
 * 16×20 px — ровно один тайл частокола.
 */
export function makeFenceTexture(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 20;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;

  const px = (x: number, y: number, w: number, h: number, c: number): void => {
    ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
    ctx.fillRect(x, y, w, h);
  };

  // Колья: остриё + тело (свет/тень по краям)
  for (let x = 0; x < 16; x += 4) {
    px(x + 1, 0, 1, 1, FENCE.tip);
    px(x, 1, 3, 1, FENCE.rail);
    px(x, 2, 1, 18, FENCE.light);
    px(x + 1, 2, 1, 18, FENCE.body);
    px(x + 2, 2, 1, 18, FENCE.shadow);
  }
  // Перекладины
  px(0, 7, 16, 1, FENCE.rail);
  px(0, 8, 16, 1, FENCE.railDark);
  px(0, 14, 16, 1, FENCE.rail);
  px(0, 15, 16, 1, FENCE.railDark);
  return cv;
}

/** Частокол по внешнему периметру: вертикальные плоскости на стыках. */
export function buildFence3D(
  map: WorldData,
  heightAtTile: (tx: number, ty: number) => number,
): MeshData | null {
  const { W, H, tiles } = map;
  const pal = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && tiles[y * W + x] === Tl.PALISADE;

  const b = new PartBuilder();
  let quads = 0;

  const face = (
    ax: number, az: number, bx: number, bz: number,
    baseY: number, u0: number, u1: number,
  ): void => {
    const topY = baseY + FENCE_H;
    b.quad(
      ax, baseY, az, u0, 0,
      bx, baseY, bz, u1, 0,
      bx, topY, bz, u1, 1,
      ax, topY, az, u0, 1,
    );
    quads++;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== Tl.PALISADE) continue;
      const baseY = heightAtTile(x, y);
      const X0 = x, X1 = x + 1, Z0 = y, Z1 = y + 1;

      // Каждая сторона, где сосед — не частокол (и не солид), получает полотно.
      if (!pal(x, y - 1) && !solid(map, x, y - 1)) face(X0, Z0, X1, Z0, baseY, 0, 1);
      if (!pal(x, y + 1) && !solid(map, x, y + 1)) face(X1, Z1, X0, Z1, baseY, 0, 1);
      if (!pal(x + 1, y) && !solid(map, x + 1, y)) face(X1, Z0, X1, Z1, baseY, 0, 1);
      if (!pal(x - 1, y) && !solid(map, x - 1, y)) face(X0, Z1, X0, Z0, baseY, 0, 1);
    }
  }

  if (quads === 0) return null;
  return b.toMesh();
}

/** Солид ли тайл (частокол не должен смотреть в скалу/дом). */
function solid(map: WorldData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.W || y >= map.H) return true;
  const t = map.tiles[y * map.W + x];
  return isSolidTileId(t) && t !== Tl.PALISADE;
}

/** Пиксели в мировые юниты (для внешних проверок). */
export const VILLAGE_PX_PER_UNIT = T;
