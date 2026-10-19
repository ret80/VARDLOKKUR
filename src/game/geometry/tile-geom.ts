/* tile-geom.ts — геометрическая отрисовка ground-тайлов (task_14).
 *
 * drawTileBatch(renderer, g, map) — ОДИН Graphics на все тайлы фона.
 * Вся отрисовка через Graphics-примитивы (drawRect), без текстур.
 * Координаты батча — мировые (x*T, y*T), позиция g = (0,0).
 */

import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';
import { T, Tl, Biome, ELEV_LEVELS, elevLevel, isSolidTileId, type WorldData } from '../world';
import { WallBit } from '../generators/terrain-walls';
import { rgb } from './geom-utils';

/** Ground-тайл биома (для камня: он не должен менять грунт под собой) */
function groundTileForBiome(b: number): number {
  switch (b) {
    case Biome.FOREST: return Tl.FOREST;
    case Biome.SWAMP: return Tl.SWAMP;
    case Biome.MEADOW: return Tl.MEADOW;
    case Biome.SNOW: return Tl.SNOW;
    default: return Tl.ROCK;
  }
}

/** Детерминированный шум для dither-крапа */
const rnd = (x: number, y: number, s: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Ширина переходной полосы между биомами (в тайлах) */
const BIOME_BAND = 4;

/** «Чистый» грунт биома (его можно смешивать на стыке биомов) */
function isPlainGround(t: number): boolean {
  return t === Tl.SNOW || t === Tl.SNOW2 || t === Tl.FOREST
    || t === Tl.SWAMP || t === Tl.MEADOW;
}

/**
 * Предрасчёт мягких границ биомов: для каждой клетки — ближайший «другой»
 * биом и расстояние до него (в пределах BIOME_BAND). Логика мира не меняется —
 * это только визуальный переход между грунтами.
 */
function computeBiomeEdges(map: WorldData, W: number, H: number): { nearBiome: Int8Array; nearDist: Uint8Array } | null {
  const biomes = map.biomes;
  if (!biomes || biomes.length !== W * H) return null;
  const N = W * H;
  const BAND = BIOME_BAND;
  const nearBiome = new Int8Array(N).fill(-1);
  const nearDist = new Uint8Array(N).fill(BAND + 1);
  const LAND = [Biome.SNOW, Biome.FOREST, Biome.SWAMP, Biome.MEADOW];
  const NB: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const b of LAND) {
    const dist = new Int16Array(N).fill(-1);
    const q: number[] = [];
    for (let i = 0; i < N; i++) if (biomes[i] === b) { dist[i] = 0; q.push(i); }
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const d = dist[cur];
      if (d >= BAND) continue;
      const x = cur % W, y = (cur / W) | 0;
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (dist[ni] !== -1 || biomes[ni] === Biome.WATER) continue;
        dist[ni] = d + 1;
        q.push(ni);
      }
    }
    for (let i = 0; i < N; i++) {
      const d = dist[i];
      if (d > 0 && d < nearDist[i]) { nearDist[i] = d; nearBiome[i] = b; }
    }
  }
  return { nearBiome, nearDist };
}

/**
 * Нарисовать один тайл типа t в заданных локальных координатах (0,0 для per-tile Graphics).
 * @param g     GraphicsHandle
 * @param t     тип тайла
 * @param x,y   локальные координаты внутри Graphics (обычно 0,0)
 */
export function drawTileLocal(g: GraphicsHandle, t: number, x: number, y: number, renderer: IRenderer): void {
  const tileRect = { x, y, width: T, height: T };

  // dither-тайл: базовый цвет + 6 пикселей тёмного/светлого крапа
  const dither = (base: number, dark: number, light: number) => {
    renderer.drawRect(g, tileRect, rgb(base));
    for (let i = 0; i < 6; i++) {
      const px = x + Math.floor(rnd(x, y, i) * T);
      const py = y + Math.floor(rnd(y, x, i + 9) * T);
      renderer.drawRect(g, { x: px, y: py, width: 1, height: 1 }, rgb(i % 2 ? dark : light));
    }
  };

  switch (t) {
    case Tl.WATER: dither(0x0a1620, 0x081219, 0x12303e); break;
    case Tl.SHORE: dither(0x4a5a64, 0x3d4d57, 0x5a6a74); break;
    case Tl.SNOW: dither(0x8b98a6, 0x7e8b99, 0x9aa7b5); break;
    case Tl.SNOW2: dither(0x7e8b99, 0x717e8c, 0x8d9aa8); break;
    case Tl.PATH: dither(0x55636e, 0x495762, 0x61707b); break;
    case Tl.FOREST: dither(0x26333c, 0x1e2a32, 0x2e3d47); break;
    case Tl.MTN: dither(0x5f6b78, 0x525e6b, 0x6d7986); break;
    case Tl.SWAMP: dither(0x2c3a3e, 0x243034, 0x354347); break;
    case Tl.POOL:
      dither(0x1b2a30, 0x152127, 0x223339);
      renderer.drawRect(g, { x: x + 3, y: y + 4, width: 5, height: 1 }, rgb(0x2a4a55));
      renderer.drawRect(g, { x: x + 8, y: y + 10, width: 4, height: 1 }, rgb(0x2a4a55));
      break;
    case Tl.VILLAGE:
    // PALISADE — стена поверх обычного деревенского грунта (не спец-тайл)
    case Tl.PALISADE: dither(0x635a4c, 0x575043, 0x6f6658); break;
    case Tl.RUINS: dither(0x4e5a68, 0x424d5a, 0x5c6875); break;
    case Tl.CAVE: dither(0x2b3646, 0x222b38, 0x343f50); break;
    case Tl.CAVEWALL:
      renderer.drawRect(g, tileRect, rgb(0x12181f));
      renderer.drawRect(g, { x, y, width: T, height: 6 }, rgb(0x1a222c));
      break;
    case Tl.STAIRS:
      dither(0x39424e, 0x2b3646, 0x4e5a68);
      renderer.drawRect(g, { x: x + 2, y: y + 3, width: 12, height: 2 }, rgb(0x222b38));
      renderer.drawRect(g, { x: x + 3, y: y + 7, width: 10, height: 2 }, rgb(0x222b38));
      renderer.drawRect(g, { x: x + 4, y: y + 11, width: 8, height: 2 }, rgb(0x222b38));
      break;
    case Tl.DFLOOR:
      // t00 из SVG/tile_set_d01.svg: тёмная заливка + линии сетки сверху/слева
      renderer.drawRect(g, tileRect, rgb(0x141a22));
      renderer.drawRect(g, { x, y, width: T, height: 1 }, rgb(0x0a0e14));
      renderer.drawRect(g, { x, y, width: 1, height: T }, rgb(0x0a0e14));
      break;
    case Tl.DWALL:
      // fallback: стены подземелья рисуются отдельным батчем (drawDungeonWallBatch)
      renderer.drawRect(g, tileRect, rgb(0x0a0e14));
      break;
    case Tl.ALTAR: dither(0x1a222c, 0x141a22, 0x232c38); break;
    case Tl.TREE: dither(0x1c262e, 0x161f26, 0x232e37); break;
    case Tl.ROCK: dither(0x5f6b78, 0x525e6b, 0x6d7986); break;
    // Осыпь на склоне: прохладный серо-синий щебень с крапом
    case Tl.SCREE:
      dither(0x59636f, 0x4b5561, 0x6a7480);
      for (let i = 0; i < 4; i++) {
        const sx = x + Math.floor(rnd(x, y, i + 41) * (T - 3));
        const sy = y + Math.floor(rnd(y, x, i + 53) * (T - 3));
        renderer.drawRect(g, { x: sx, y: sy, width: 2, height: 2 }, rgb(i % 2 ? 0x424b57 : 0x77818d));
      }
      break;
    // Уступ/обрыв: тёмный камень, горизонтальные слои
    case Tl.CLIFF:
      dither(0x424b57, 0x39424e, 0x4e5864);
      renderer.drawRect(g, { x, y: y + 3, width: T, height: 1 }, rgb(0x2b333d));
      renderer.drawRect(g, { x, y: y + 10, width: T, height: 1 }, rgb(0x2b333d));
      renderer.drawRect(g, { x, y, width: T, height: 1 }, rgb(0x5b6673));
      break;
    case Tl.HOUSE: renderer.drawRect(g, tileRect, rgb(0x2c2620)); break;
    // COLUMN: ground-тайл под 3D-колонной (RUINS-стиль)
    case Tl.COLUMN: dither(0x4e5a68, 0x424d5a, 0x5c6875); break;
    case Tl.MEADOW: dither(0x5f6b52, 0x55614a, 0x69755c); break;
    case Tl.WASTE: dither(0x544a3c, 0x484033, 0x605645); break;
    // Грунт под травой — луг. Сама трава (объёмный пучок) рисуется
    // отдельным 3D-спрайтом в слое стен (см. wall-geom / map-render-system).
    case Tl.GRASS: dither(0x5f6b52, 0x55614a, 0x69755c); break;
    // Ствол-тайлы болотных деревьев: грунт топей под 3D-спрайтом
    case Tl.DEADTREE:
    case Tl.FIR: dither(0x2c3a3e, 0x243034, 0x354347); break;
    default:
      renderer.drawRect(g, tileRect, rgb(0x10151c));
  }
}

/**
 * Нарисовать все ground-тайлы карты в один Graphics-батч.
 * Батч живёт в мировых координатах (позиция Graphics = 0,0).
 * Все тайлы рисуются в ЛОКАЛЬНЫХ координатах батча (x*T, y*T),
 * позиция Graphics НЕ меняется — иначе весь батч сдвинется.
 */
export function drawTileBatch(renderer: IRenderer, g: GraphicsHandle, map: WorldData): void {
  if (!map?.tiles || !map.W || !map.H) return;
  const { W, H } = map;
  const biomes = map.biomes;
  const edges = computeBiomeEdges(map, W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let t = map.tiles[i];
      // Камень — это объект ПОВЕРХ грунта: под ним остаётся тайл биома
      // (луг/лес/болото/снег), а не серый «каменный» грунт.
      if (t === Tl.ROCK && biomes) t = groundTileForBiome(biomes[i]);
      // Дерево на заснеженной горе: под ним снег СВОЕЙ ТЕРРАСЫ (вершина —
      // светлый, высокогорье — тёмный), а не тёмный «лесной» ковёр —
      // деревья стоят в снегу. Спрайт со снегом рисуется слоем стен.
      if (t === Tl.TREE && biomes && biomes[i] === Biome.SNOW) {
        t = map.height && map.height.length === W * H && elevLevel(map.height[i]) < 5
          ? Tl.SNOW2
          : Tl.SNOW;
      }
      // Плавный переход между биомами: у стыка часть клеток «перетекает»
      // в грунт соседнего биома (снег не упирается в луга жёсткой линией).
      if (edges && isPlainGround(t)) {
        const d = edges.nearDist[i];
        if (d <= BIOME_BAND) {
          const nb = edges.nearBiome[i];
          if (nb >= 0 && rnd(x, y, 91) < 0.5 * (BIOME_BAND + 1 - d) / BIOME_BAND) {
            t = groundTileForBiome(nb);
          }
        }
      }
      // Рисуем в локальных координатах батча — позиция Graphics = (0,0)
      drawTileLocal(g, t, x * T, y * T, renderer);
    }
  }

  // Второй проход: иллюзия высоты по полю высот (обрывы, тени рельефа).
  if (map.height && map.height.length === W * H) {
    drawRelief(renderer, g, map, W, H);
  }
}

/** Тайлы, на которых рельеф не рисуется вовсе: вода и постройки. */
function isReliefExempt(t: number): boolean {
  return t === Tl.WATER || t === Tl.HOUSE;
}

/** «Благоустроенные» тайлы: у них свой ровный тон — объёмную подсветку по
 *  высоте на них не накладываем (дорога, площадь, лестница, берег, озеро). */
function isReliefFlat(t: number): boolean {
  return t === Tl.SHORE || t === Tl.POOL || t === Tl.PATH
    || t === Tl.VILLAGE || t === Tl.STAIRS;
}

/** Высота грани уступа в пикселях на один уровень перепада */
const CLIFF_STEP_PX = 6;

/** Потолок высоты грани: не закрывает весь тайл — снизу остаётся место под тень */
const FACE_CAP = T - 2;

/** Ширина боковой (W/E) грани в пикселях */
const SIDE_PX = 3;

/** Ступеней на пандусе (ширина полосы — RAMP_STEPS*2) */
const RAMP_STEPS = 3;

/** Палитра камня уступа: тело / тень / светлая кромка («лип») / слои камня */
interface RockPal { face: number; dark: number; lip: number; strata: number }

/** Палитра пандуса: тело / линия ступени / светлая кромка */
interface RampPal { body: number; step: number; lip: number }

interface ReliefPal { rock: RockPal; ramp: RampPal }

/* Палитры утверждены в SVG/relief.svg (генератор: scripts/gen-relief-svg.mjs).
 * Грань наследует тон грунта своей террасы: в снегу — светлый холодный камень
 * со снежной кромкой, в топях — самый тёмный, на осыпи — каменный тон. */
const MEADOW_PAL: ReliefPal = {
  rock: { face: 0x474f57, dark: 0x363e46, lip: 0x707b86, strata: 0x2c343d },
  ramp: { body: 0x5a646e, step: 0x3b434c, lip: 0x7d8894 },
};
const FOREST_PAL: ReliefPal = {
  rock: { face: 0x3a444d, dark: 0x2b343c, lip: 0x5c6874, strata: 0x222b33 },
  ramp: { body: 0x454f59, step: 0x2d363e, lip: 0x66727e },
};
const SWAMP_PAL: ReliefPal = {
  rock: { face: 0x384348, dark: 0x2a3337, lip: 0x5a666b, strata: 0x222b2e },
  ramp: { body: 0x434e53, step: 0x2b3438, lip: 0x636f74 },
};
const SNOW_PAL: ReliefPal = {
  rock: { face: 0x5d6a77, dark: 0x4a5763, lip: 0xc8d3dc, strata: 0x3e4a57 },
  ramp: { body: 0x76838f, step: 0x525f6b, lip: 0xd6e0e8 },
};
const MTN_PAL: ReliefPal = {
  rock: { face: 0x4c5662, dark: 0x3a434f, lip: 0x7d8997, strata: 0x303843 },
  ramp: { body: 0x5f6a76, step: 0x3f4854, lip: 0x8b97a4 },
};
const SCREE_PAL: ReliefPal = {
  rock: { face: 0x49535f, dark: 0x38414c, lip: 0x7a8490, strata: 0x2e3640 },
  ramp: { body: 0x5b6570, step: 0x3c4550, lip: 0x87929d },
};

/** Примитив отрисовки рельефа: прямоугольник в мировых координатах батча. */
type ReliefPainter = (x: number, y: number, w: number, h: number, c: number, a?: number) => void;

/** Палитра рельефа: осыпь — каменный тон, остальное — по биому верхней террасы. */
function reliefPalFor(t: number, b: number | undefined): ReliefPal {
  if (t === Tl.SCREE) return SCREE_PAL;
  switch (b) {
    case Biome.SNOW: return SNOW_PAL;
    case Biome.FOREST: return FOREST_PAL;
    case Biome.SWAMP: return SWAMP_PAL;
    case Biome.MEADOW: return MEADOW_PAL;
    default: return MTN_PAL;
  }
}

/** Стороны стыка: [dx, dy, бит] — тот же порядок, что в WALL_DIRS (terrain-walls). */
const EDGES: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, WallBit.N],
  [1, 0, WallBit.E],
  [0, 1, WallBit.S],
  [-1, 0, WallBit.W],
];

/**
 * Стык-ступенька: открытый (без бита) стык двух ПРОХОДИМЫХ клеток.
 *
 * Правило зеркалит generators/terrain-walls (buildTerrainWalls): бита нет либо
 * когда обе клетки — «пандусные» тайлы (дорога/площадь/лестница/берег/озеро),
 * либо когда стык пробила BFS связности. Твёрдые тайлы (скала, деревья, дома)
 * бита не получают — там стену заменяет сама коллизия тайла.
 */
function isStepEdge(t: number, nt: number, m: number, bit: number): boolean {
  return (m & bit) === 0 && !isSolidTileId(t) && !isSolidTileId(nt);
}

/** Грань уступа на стыке клетки (x,y) со стороной (dx,dy). */
function edgeFace(P: ReliefPainter, x0: number, y0: number, dx: number, dy: number, d: number, rock: RockPal): void {
  const faceH = Math.min(FACE_CAP, CLIFF_STEP_PX * d);
  if (dy < 0) faceBand(P, x0, y0, faceH, rock, true);
  else if (dy > 0) faceBand(P, x0, y0 + T - faceH, faceH, rock, false);
  else sideFace(P, x0, y0, dx < 0, d, rock);
}

/** Пробитый проход (пандус) на стыке со стороной (dx,dy) — там, где стены нет. */
function edgeRamp(P: ReliefPainter, x0: number, y0: number, dx: number, dy: number, ramp: RampPal): void {
  if (dy !== 0) rampBandH(P, x0, dy < 0 ? y0 : y0 + T, ramp);
  else rampBandV(P, x0, y0, dx < 0, ramp);
}

/**
 * Второй проход отрисовки: перепады рельефа и видимые пандусы.
 *
 * Иллюзия 2.5D без реального Z, на террасах (см. ELEV_LEVELS). Камера смотрит
 * сверху с юга, поэтому из вертикальных граней видны только те, что смотрят
 * на зрителя:
 *  - если сосед ВЫШЕ с севера или сбоку — на самом стыке рисуется каменная
 *    «грань» (высотой N*CLIFF_STEP_PX), и там же стоит коллизия;
 *  - если сосед ВЫШЕ с юга (dy>0) — саму грань НЕ рисуем: её закрывает наша
 *    верхняя терраса, но на её северной кромке (первая строка верхнего тайла)
 *    остаётся светлая линия стыка, как у прочих граней;
 *  - на углу, где боковая стена и южная грань сходятся по диагонали,
 *    вырез докрашивается угловым блоком — стык смыкается буквой Г;
 *  - открытый стык двух проходимых клеток — это ступенька (дорога, площадь,
 *    берег или пробитый связностью подъём): рисуется светлой «лесенкой»,
 *    чтобы подъём всегда был виден;
 *  - стык с водой (Tl.WATER): вода ниже суши на любой уровень, поэтому такую
 *    кромку рисуем отдельно — скальный обрыв высотой max(1, перепад) на суше
 *    у воды (южная грань и боковые стенки), камень по биому самой суши;
 *    обрыв развёрнут подножием к воде, а светлая кромка-кап остаётся на суше;
 *  - высокие террасы чуть светлее, низкие — темнее (объём).
 *
 * Стена/пандус приходят из `map.walls` (см. generators/terrain-walls): бит стоит
 * на НИЖНЕМ тайле и указывает на более высокого соседа. Если маски нет —
 * рисуем как раньше: только северные обрывы по полю высот, без пандусов.
 *
 * Цвета берутся из палитр, утверждённых в SVG/relief.svg, — по биому ВЕРХНЕЙ
 * террасы (камень наследует тон грунта, который видно сверху; у берега — по
 * биому суши).
 */
function drawRelief(renderer: IRenderer, g: GraphicsHandle, map: WorldData, W: number, H: number): void {
  const height = map.height!;
  const biomes = map.biomes;
  const walls = map.walls && map.walls.length === W * H ? map.walls : null;
  const lv = (x: number, y: number) => elevLevel(height[y * W + x]);
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const P: ReliefPainter = (x, y, w, h, c, a = 1) =>
    renderer.drawRect(g, { x, y, width: w, height: h }, rgb(c, a));
  /** Тайл соседа; за картой — 0 */
  const tileAt = (x: number, y: number) => (inb(x, y) ? map.tiles[y * W + x] : 0);
  /** Биом соседа (для тона камня); за картой или без данных — undefined */
  const biomeAt = (x: number, y: number): number | undefined =>
    inb(x, y) && biomes && biomes.length === W * H ? biomes[y * W + x] : undefined;
  /** Перепад уровней к соседу (dx,dy): 0, если соседа нет, его тайл не «земля»
   *  (вода/постройка) или его уровень не выше нашего. */
  const stepTo = (x: number, y: number, dx: number, dy: number): number => {
    const nx = x + dx, ny = y + dy;
    if (!inb(nx, ny) || isReliefExempt(map.tiles[ny * W + nx])) return 0;
    const d = lv(nx, ny) - lv(x, y);
    return d > 0 ? d : 0;
  };
  /** Палитра рельефа соседа (x+dx, y+dy), чей уровень выше нашего */
  const palTo = (x: number, y: number, dx: number, dy: number): ReliefPal =>
    reliefPalFor(tileAt(x + dx, y + dy), biomeAt(x + dx, y + dy));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const t = map.tiles[i];
      if (isReliefExempt(t)) continue;
      const h = height[i];
      const my = elevLevel(h);
      const x0 = x * T, y0 = y * T;

      // Сосед сверху выше по уровню (нужен только для ветки без маски стен).
      const dN = stepTo(x, y, 0, -1);

      // --- Общий объём: высокие террасы чуть светлее, низкие темнее ---
      // (тон рисуется до рельефа, чтобы грани оставались контрастными;
      //  на «благоустроенных» тайлах тон не трогаем — у них свой ровный цвет)
      if (!isReliefFlat(t)) {
        const tone = my / ELEV_LEVELS;
        if (tone > 0.5) {
          renderer.drawRect(g, { x: x0, y: y0, width: T, height: T }, rgb(0xdbe5ee, Math.min(0.13, (tone - 0.5) * 0.34)));
        } else if (h < 0.28) {
          renderer.drawRect(g, { x: x0, y: y0, width: T, height: T }, rgb(0x081018, Math.min(0.15, (0.28 - h) * 0.5)));
        }
      }

      if (walls) {
        const m = walls[i];
        for (const [dx, dy, bit] of EDGES) {
          const nx = x + dx, ny = y + dy;

          // --- Берег: скальный обрыв вдоль воды ---
          // Вода всегда ниже суши и помечена exempt, поэтому stepTo её не видит
          // (а за картой tileAt = 0 = Tl.WATER — потому ограничиваемся inb).
          // Южная грань (dy>0) и боковые стенки видны сверху; северную (dy<0)
          // закрывает собственная суша — её не рисуем. Палитра камня — по биому
          // САМОЙ суши: вода биома не имеет. Обрыв развёрнут подножием к воде:
          // светлая кромка-кап остаётся на суше (как у террас, где кромка всегда
          // у верхней террасы), к воде камень темнеет, а подножие в воду не
          // заходит — иначе у самой воды светится серая кайма.
          if (inb(nx, ny) && map.tiles[ny * W + nx] === Tl.WATER) {
            const dw = Math.max(1, my - lv(nx, ny));
            const rock = reliefPalFor(t, biomeAt(x, y)).rock;
            if (dy > 0) {
              const fh = Math.min(FACE_CAP, CLIFF_STEP_PX * dw);
              faceBand(P, x0, y0 + T - fh, fh, rock, true, true);
            } else if (dy === 0) {
              sideFace(P, x0, y0, dx < 0, dw, rock, true);
            }
            continue;
          }

          const d = stepTo(x, y, dx, dy);
          if (d <= 0) continue;
          const nt = tileAt(nx, ny);
          const pal = reliefPalFor(nt, biomeAt(nx, ny));
          // «Лесенка» на каждом открытом стыке проходимых клеток: ступенька
          // дороги/площади или пробитый BFS подъём. Всё остальное — каменная
          // грань, в том числе к непроходимой скале (коллизию даёт сам тайл).
          if (isStepEdge(t, nt, m, bit)) edgeRamp(P, x0, y0, dx, dy, pal.ramp);
          else if (dy <= 0) edgeFace(P, x0, y0, dx, dy, d, pal.rock);
          // Сосед выше ЮЖНЕЕ (dy>0): сам обрыв закрывает верхняя терраса, но на
          // её северной кромке остаётся светлая линия стыка — как у всех прочих
          // граней (цвет — по биому верхнего тайла). Строка — первая строка
          // верхней террасы, там же, где начинается боковая стена у угла.
          else P(x0, y0 + T, T, 1, pal.rock.lip);
        }

        // --- Угол террасы: смыкаем боковую стену с южной гранью ---
        // Диагональный сосед (x+dx, y-1) выше, а оба ортогональных (сбоку и с
        // севера) — не выше: тогда боковая стена верхней террасы (её рисует наш
        // северный сосед) и южная грань (её рисует наш боковой сосед) сходятся
        // по диагонали, оставляя Г-образный вырез на нашем углу. Докрашиваем
        // вырез той же колонкой, что и боковая стена, — светлая кромка
        // заворачивает за угол и стык смыкается.
        for (const dxi of [-1, 1] as const) {
          const nx = x + dxi, ny = y - 1;
          if (!inb(nx, ny)) continue;
          if (stepTo(x, y, dxi, -1) <= 0) continue;
          if (stepTo(x, y, dxi, 0) > 0 || stepTo(x, y, 0, -1) > 0) continue;
          // соседи рисуют именно камень, а не «лесенку»-пандус
          if ((walls[(y - 1) * W + x] & (dxi > 0 ? WallBit.E : WallBit.W)) === 0) continue;
          if ((walls[y * W + x + dxi] & WallBit.N) === 0) continue;
          // размеры — как у соседних стен, чтобы блок сомкнулся с ними встык
          const cw = Math.min(5, SIDE_PX + stepTo(x, y - 1, dxi, 0) - 1);
          const ch = Math.min(FACE_CAP, CLIFF_STEP_PX * stepTo(x + dxi, y, 0, -1));
          cornerBlock(P, x0, y0, dxi, cw, ch, reliefPalFor(tileAt(x + dxi, y - 1), biomeAt(x + dxi, y - 1)).rock);
        }
      } else if (dN > 0) {
        // Маски стен нет (подземелья/тесты) — старое правило: только север.
        edgeFace(P, x0, y0, 0, -1, dN, palTo(x, y, 0, -1).rock);
      }
    }
  }
}

/**
 * Каменная грань высотой faceH, занимающая полосу [top, top+faceH) на тайле.
 *
 * lipAtTop — северный уступ: светлая кромка (кап травы верхней террасы) сверху,
 * подножие снизу. lipAtTop=false — южный уступ, зеркально: подножие сверху,
 * кромка внизу, у самого стыка с верхним соседом.
 * noBase=true — не рисуем подножие и его тень (обрыв к воде: подножие ушло бы
 * в воду, где линия только мешает).
 */
function faceBand(P: ReliefPainter, x0: number, top: number, faceH: number, rock: RockPal, lipAtTop: boolean, noBase = false): void {
  const mid = faceH >> 1;
  P(x0, top, T, faceH, rock.face);
  if (lipAtTop) P(x0, top + mid, T, faceH - mid, rock.dark);
  else P(x0, top, T, faceH - mid, rock.dark);

  // горизонтальные слои камня
  if (faceH >= 6) {
    P(x0, top + Math.max(2, Math.round(faceH * 0.34)), T, 1, rock.strata);
    P(x0, top + Math.round(faceH * 0.72), T, 1, rock.strata);
  }

  // светлая кромка у границы с верхней террасой и тень под капом
  P(x0, lipAtTop ? top : top + faceH - 1, T, 1, rock.lip);
  P(x0, lipAtTop ? top + 1 : top + faceH - 2, T, 1, rock.dark);

  // подножие: тёмная кромка и мягкая тень, падающая на грунт перед гранью
  if (!noBase) {
    const baseY = lipAtTop ? top + faceH : top - 1;
    P(x0, baseY, T, 1, rock.strata);
    P(x0, lipAtTop ? baseY + 1 : top - 2, T, 1, 0x10151c, 0.28);
    P(x0, lipAtTop ? baseY + 2 : top - 3, T, 1, 0x10151c, 0.14);
  }

  // случайные сколы по кромке подножия
  const nickY = lipAtTop ? top + faceH - 1 : top;
  for (let n = 0; n < 4; n++) {
    const nx = x0 + Math.floor(rnd(x0 / T, top / T, n + 71) * T);
    const nw = 1 + Math.floor(rnd(top / T, x0 / T, n + 83) * 2);
    P(nx, nickY, nw, 1, rock.strata);
  }
}

/**
 * Боковая (вертикальная) грань. Бит стены стоит на НИЖНЕМ тайле и указывает
 * на более высокого соседа: westHigher=true — западный сосед выше.
 * flip=true — полоса остаётся на той же стороне тайла, но светлая кромка уходит
 * на противоположный край: так рисуется обрыв к воде (вода ниже, а кромка-кап
 * должна остаться на суше, а не у воды).
 */
function sideFace(P: ReliefPainter, x0: number, y0: number, westHigher: boolean, dN: number, rock: RockPal, flip = false): void {
  const faceW = Math.min(5, SIDE_PX + dN - 1);
  const sx = westHigher ? x0 : x0 + T - faceW;
  const capWest = westHigher !== flip;            // где светлая кромка (верх обрыва)
  const edgeHigh = capWest ? sx : sx + faceW - 1; // кромка у границы с верхней террасой
  const edgeLow = capWest ? sx + faceW - 1 : sx;  // подножие, смотрящее на нижнюю террасу

  P(sx, y0, faceW, T, rock.face);
  P(edgeLow, y0, 1, T, rock.dark);
  P(edgeHigh, y0, 1, T, rock.lip);
  if (faceW >= 4) P(sx + (faceW >> 1), y0, 1, T, rock.strata);
  // тень на нижнем грунте у подножия
  P(westHigher ? sx + faceW : sx - 1, y0, 1, T, 0x10151c, 0.3);
}

/**
 * Угловой блок террасы: вырез на стыке боковой стены и южной грани.
 * Заливается той же колонкой, что и боковая стена (светлая кромка — со стороны
 * верхней террасы), но только на высоту её южной грани.
 */
function cornerBlock(P: ReliefPainter, x0: number, y0: number, dx: number, faceW: number, faceH: number, rock: RockPal): void {
  const capWest = dx < 0;                       // диагональ выше с запада — кромка на западе
  const bx = capWest ? x0 : x0 + T - faceW;
  const edgeHigh = capWest ? bx : bx + faceW - 1;
  const edgeLow = capWest ? bx + faceW - 1 : bx;

  P(bx, y0, faceW, faceH, rock.face);
  P(edgeLow, y0, 1, faceH, rock.dark);
  P(edgeHigh, y0, 1, faceH, rock.lip);
  if (faceW >= 4) P(bx + (faceW >> 1), y0, 1, faceH, rock.strata);
}

/**
 * Разрешённый подъём (пандус) поперёк горизонтального стыка на высоте yEdge:
 * светлая «лесенка» из ступеней вместо тёмного обрыва — иначе непонятно,
 * где можно подняться на террасу.
 */
function rampBandH(P: ReliefPainter, x0: number, yEdge: number, ramp: RampPal): void {
  const band = RAMP_STEPS * 2;
  const top = yEdge - (band >> 1);
  P(x0, top, T, band, ramp.body);
  for (let s = 0; s < RAMP_STEPS; s++) {
    const sy = top + s * 2;
    P(x0, sy, T, 1, s === 0 ? ramp.lip : ramp.body);
    P(x0, sy + 1, T, 1, ramp.step);
  }
  P(x0, top + band, T, 1, 0x10151c, 0.22);
  // бортики, чтобы пандус читался как законченный проход
  P(x0, top, 1, band, ramp.step);
  P(x0 + T - 1, top, 1, band, ramp.step);
}

/** То же для вертикального стыка: westHigher=true — западный сосед выше. */
function rampBandV(P: ReliefPainter, x0: number, y0: number, westHigher: boolean, ramp: RampPal): void {
  const band = RAMP_STEPS * 2;
  const sx = westHigher ? x0 - (band >> 1) : x0 + T - (band >> 1);
  P(sx, y0, band, T, ramp.body);
  for (let s = 0; s < RAMP_STEPS; s++) {
    const px = sx + s * 2;
    P(px, y0, 1, T, s === 0 ? ramp.lip : ramp.body);
    P(px + 1, y0, 1, T, ramp.step);
  }
  P(westHigher ? sx + band : sx - 1, y0, 1, T, 0x10151c, 0.22);
  P(sx, y0, band, 1, ramp.step);
  P(sx, y0 + T - 1, band, 1, ramp.step);
}
