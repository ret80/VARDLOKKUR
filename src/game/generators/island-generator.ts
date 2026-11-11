/* Генерация острова: снежная гора из 3 вложенных террас в центре и
   3 сектора-биома вокруг (лес/топи/луга), см. tasks/world_gen_imp_3.md */
import { mulberry, NoiseGenerator } from "../noise";
import { WorldData, Tl, Vec, Biome, idx, inB, elevLevel, isSolidTileId } from "./types";
import { flattenRampSurfaces } from "./terrain-walls";

/** Центр острова и биом-карты */
export const ICX = 100, ICY = 70;

/**
 * Террасы горы: [полуосьX, полуосьY, уровень высоты].
 *
 * Структура строго вложена (предгорье ⊃ высокогорье ⊃ вершина): эллипсы
 * концентричны, а их полуоси попарно монотонны, поэтому точка внутри
 * внутренней террасы всегда внутри внешней. Границы колышутся по углу ОДНИМ
 * общим шумом (см. mountainTier) — вложение сохраняется точно.
 */
const MTN_ELL: ReadonlyArray<readonly [number, number, number]> = [
  [36, 31, 1],  // предгорье (тёмно-серое, как на world.png)
  [23, 17, 3],  // высокогорье (серое)
  [14, 10, 5],  // вершина (белая)
];
/** Максимальный радиус горы с учётом колыхания границ (полуось 36 × 1.11) */
export const R_MOUNT = 40;
/** Полуоси эллипса острова (для сэмплинга прибрежных точек) */
export const ISLAND_RX = 94, ISLAND_RY = 64;

/* Ровные высоты террас: и уровень (elevLevel), и тон отрисовки берутся из
   них, поэтому кромка террасы всегда резкая и одинаковая по всей карте. */
/** Океан/лужи/берег */
export const H_WATER = 0.05;
/** Базовый уровень суши (лес/топи/луга) */
export const H_BASE = 0.10;
/** Малая возвышенность-пятно (9) внутри луга */
export const H_SPOT = 0.20;
/** Высота уровней высот 0..ELEV_LEVELS */
export const LEVEL_HEIGHT: ReadonlyArray<number> = [H_BASE, H_SPOT, 0.40, 0.54, 0.70, 0.87];

/**
 * Блок нарезки террас рельефа (в тайлах).
 *
 * Внутри блока уровень высоты один и тот же, поэтому кромка террасы — прямая
 * стена длиной в блок с углом 90°, а не ступеньки по одному тайлу. Меньше 3 —
 * снова мелкая лесенка, больше 5 — террасы становятся слишком грубыми.
 */
const TERRACE_BLOCK = 4;

/**
 * Уровень плато дикой суши (лес и луг).
 *
 * Один уступ над низом: кромка плато — ОДНА стена высотой в террасу (0.9).
 * Пока уровней было четыре (0..3), склон превращался в лестницу из
 * параллельных уступов — именно её и было видно в 3D.
 */
const PLATEAU_LEVEL = 1;
/** Порог шума рельефа: выше — плато (доля плато ≈ треть суши) */
const PLATEAU_NOISE = 0.68;

export interface IslandResult {
  w: WorldData;
  cx: number;
  cy: number;
}

export class IslandGenerator {
  readonly W = 200;
  readonly H = 140;
  private tiles: Uint8Array;
  private biomes: Uint8Array;
  private height: Float32Array;
  private rng: () => number;
  private noiseIsland: NoiseGenerator;
  private noiseA: NoiseGenerator;
  private noiseB: NoiseGenerator;
  private noiseHills: NoiseGenerator;
  private noiseDetail: NoiseGenerator;
  private cx = ICX;
  private cy = ICY;

  constructor(seed: number) {
    this.rng = mulberry(seed);
    this.tiles = new Uint8Array(this.W * this.H).fill(Tl.SNOW);
    this.biomes = new Uint8Array(this.W * this.H).fill(Biome.SNOW);
    this.height = new Float32Array(this.W * this.H).fill(0);
    this.noiseIsland = new NoiseGenerator(seed ^ 0x5ea);
    this.noiseA = new NoiseGenerator((seed * 2654435761) | 0);
    this.noiseB = new NoiseGenerator((seed * 40503) | 0);
    this.noiseHills = new NoiseGenerator(seed * 131542391);
    this.noiseDetail = new NoiseGenerator(seed * 1009);
  }

  public generate(): IslandResult {
    this.buildIsland();
    this.buildBiomes();
    this.smoothBiomes();
    this.protectReserved();
    // Высоты считаем ПОСЛЕ финальной раскладки биомов: болото всегда база,
    // снег — только террасы горы, пятна-возвышенности — только на лугах.
    this.assignHeights();
    // Кромку плато и горы выравниваем по блокам: одиночные блоки-выступы
    // давали на диагонали короткие стенки в одну клетку — в 3D это читалось
    // ступеньками. После прохода кромка идёт прогонами по 2+ блока.
    this.snapPlateauBlocks();
    this.applyBiomesToTiles();
    // Ровные берег и озёра (см. flattenRampSurfaces): внутри полосы берега
    // иначе набираются невидимые микроперепады, по которым игрок поднимался
    // сквозь уступ. Поздние озёра-лужи ровняются в overworld перед стенами.
    flattenRampSurfaces({ tiles: this.tiles, height: this.height });
    const w = this.createWorldData();
    return { w, cx: this.cx, cy: this.cy };
  }

  /* ---------- Ф1.1 Форма острова (эллипс + шум) ---------- */
  private buildIsland(): void {
    const RX = ISLAND_RX, RY = ISLAND_RY;
    const normDist = (x: number, y: number) => Math.hypot((x - this.cx) / RX, (y - this.cy) / RY);
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const d = normDist(x, y) + (this.noiseIsland.value(x * 0.055, y * 0.055) - 0.5) * 0.22;
        if (d > 1) this.setTile(x, y, Tl.WATER);
        else if (d > 0.93) this.setTile(x, y, Tl.SHORE);
      }
    }
  }

  /* ---------- Ф1.2 Карта биомов: гора-снег + 3 сектора ---------- */
  private buildBiomes(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const t = this.tiles[i];
        if (t === Tl.WATER || t === Tl.SHORE) {
          this.biomes[i] = Biome.WATER;
          continue;
        }
        this.biomes[i] = this.computeBiome(x, y);
      }
    }
  }

  private computeBiome(x: number, y: number): number {
    // Снег ≡ footprint горы: сектора биомов начинаются у края горы,
    // поэтому топи/луга/лес никогда не садятся на террасы.
    if (this.mountainTier(x, y) > 0) return Biome.SNOW;
    const ang = Math.atan2(y - this.cy, x - this.cx)
      + (this.noiseB.value(x * 0.05, y * 0.05) - 0.5) * 0.7;
    return this.sectorBiome(ang);
  }

  /** Сектора (по 120°): лес — север, топи — запад-юго-запад, луга — восток */
  private sectorBiome(ang: number): number {
    const TAU = Math.PI * 2;
    const P = Math.PI;
    let a = ang % TAU;
    if (a < 0) a += TAU;
    if (a >= P * (7 / 6) && a < P * (11 / 6)) return Biome.FOREST; // 210°..330° (север)
    if (a >= P * (1 / 2) && a < P * (7 / 6)) return Biome.SWAMP;   // 90°..210° (запад)
    return Biome.MEADOW;                                           // 330°..90° (восток)
  }

  /**
   * Уровень горы в клетке: 0 — вне горы, 1 — предгорье, 3 — высокогорье,
   * 5 — вершина. Границы эллипсов колышутся по углу ОДНИМ общим множителем,
   * поэтому строгое вложение террас (6 ⊃ 7 ⊃ 8) сохраняется для любой точки.
   */
  private mountainTier(x: number, y: number): number {
    // Как и рельеф, гора сэмплится по центру блока: эллипс на квадратной
    // сетке иначе даёт кромку-лесенку с шагом в одну клетку.
    const b = TERRACE_BLOCK;
    const qx = Math.floor(x / b) * b + b / 2;
    const qy = Math.floor(y / b) * b + b / 2;
    const dx = qx - this.cx, dy = qy - this.cy;
    if (dx * dx + dy * dy > R_MOUNT * R_MOUNT) return 0;
    const ang = Math.atan2(dy, dx);
    const wob = 1 + (this.noiseHills.value(Math.cos(ang) * 1.9, Math.sin(ang) * 1.9) - 0.5) * 0.22;
    for (let k = MTN_ELL.length - 1; k >= 0; k--) {
      const [rx, ry, lv] = MTN_ELL[k];
      if (Math.hypot(dx / rx, dy / ry) * wob < 1) return lv;
    }
    return 0;
  }

  /**
   * Тёмное пятно-возвышенность (9) внутри луга: шумовой островок, который
   * обязан целиком лежать в лугу (кольцо клеток — тоже луг), чтобы терраса
   * не резала соседний биом.
   */
  private isHillSpot(x: number, y: number): boolean {
    if (this.noiseHills.value(x * 0.11 + 53.7, y * 0.11 + 21.3) < 0.75) return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!inB(this, x + dx, y + dy)) return false;
        if (this.biomes[idx(this, x + dx, y + dy)] !== Biome.MEADOW) return false;
      }
    return true;
  }

  /**
   * Уровень рельефа дикой суши: широкие террасы от низкого шума.
   *
   * Раньше вся суша, кроме горы, лежала на одном уровне (H_BASE), поэтому
   * в 3D остров выглядел плоской плитой. Теперь луг и лес поднимаются
   * широкими «столами» до 3 уровня, а перепады проходят по тем же правилам
   * уступов/пандусов (generators/terrain-walls), что и гора. Топь остаётся
   * ровной низиной — это болото.
   */
  private reliefTier(x: number, y: number): number {
    // Два уровня на всю дикую сушу: низ (0) и плато (PLATEAU_LEVEL).
    //
    // Раньше шум давал 0..3, и на склоне вставала лестница из террас по 0.9:
    // каждая со своей стеной, в 3D — марш из параллельных уступов, а не стена.
    // Промежуточных уровней больше нет, поэтому кромка плато — ОДНА стена.
    //
    // Сэмпл берётся по центру блока, а не по клетке: иначе кромка выходит
    // «лесенкой» со ступеньками в один тайл (шум на квадратной сетке).
    const b = TERRACE_BLOCK;
    const qx = Math.floor(x / b) * b + b / 2;
    const qy = Math.floor(y / b) * b + b / 2;
    const n = this.noiseHills.value(qx * 0.03 + 11.3, qy * 0.03 + 7.9);
    return n > PLATEAU_NOISE ? PLATEAU_LEVEL : 0;
  }

  /** Поле высот: ровные «столы» террас по биомам (финальная раскладка) */
  private assignHeights(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const b = this.biomes[i];
        if (b === Biome.WATER) { this.height[i] = H_WATER; continue; }
        if (b === Biome.SNOW) { this.height[i] = LEVEL_HEIGHT[this.mountainTier(x, y)]; continue; }
        if (b === Biome.SWAMP) { this.height[i] = H_BASE; continue; } // топь — всегда база
        this.height[i] = LEVEL_HEIGHT[this.reliefTier(x, y)];
      }
    }
  }

  /**
   * Выровнять кромку плато/горы по блокам нарезки.
   *
   * Поле высот постоянно внутри блока 4×4, поэтому граница уровней идёт по
   * сетке блоков. Но шум/эллипс может выставить вперёд ОДИН блок — это и есть
   * короткая стенка в четыре клетки, торчащая из ряда. Проход фильтром «по
   * большинству» 3×3 блока убирает одиночные выступы и выемки: кромка после
   * него идёт прогонами в два блока и длиннее, углы — 90°.
   *
   * Блоки с водой/берегом не трогаются — там своя геометрия (пляж, ручей).
   */
  private snapPlateauBlocks(passes = 3): void {
    const b = TERRACE_BLOCK;
    const bw = Math.ceil(this.W / b), bh = Math.ceil(this.H / b);
    const levelAt = (bx: number, by: number): number => {
      const x = Math.min(this.W - 1, bx * b + (b >> 1));
      const y = Math.min(this.H - 1, by * b + (b >> 1));
      const i = idx(this, x, y);
      const t = this.tiles[i];
      if (t === Tl.WATER || t === Tl.SHORE || t === Tl.POOL || t === Tl.STREAM) return -1;
      return elevLevel(this.height[i]);
    };

    for (let pass = 0; pass < passes; pass++) {
      const src = new Int16Array(bw * bh);
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) src[by * bw + bx] = levelAt(bx, by);

      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
          const k = by * bw + bx;
          const own = src[k];
          if (own < 0) continue;
          const cnt = new Map<number, number>();
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = bx + dx, ny = by + dy;
              if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
              const v = src[ny * bw + nx];
              if (v < 0) continue;
              cnt.set(v, (cnt.get(v) || 0) + 1);
            }
          }
          let best = own, bestN = cnt.get(own) || 0;
          for (const [v, n] of cnt) if (n > bestN) { best = v; bestN = n; }
          // Простое большинство по блокам (ничья 4:4 — оставляем как есть).
          // Так убираются одиночные блоки-выступы и выемки на диагонали: они и
          // давали короткие стенки в четыре клетки, читавшиеся ступеньками.
          if (best === own || bestN < 5) continue;
          for (let y = by * b; y < Math.min(this.H, by * b + b); y++) {
            for (let x = bx * b; x < Math.min(this.W, bx * b + b); x++) {
              const i = idx(this, x, y);
              this.height[i] = LEVEL_HEIGHT[best];
            }
          }
        }
      }
    }
  }

  /* ---------- Сглаживание биомов ---------- */
  private smoothBiomes(): void {
    for (let iter = 0; iter < 2; iter++) {
      const copy = this.biomes.slice();
      for (let y = 2; y < this.H - 2; y++) {
        for (let x = 2; x < this.W - 2; x++) {
          const i = idx(this, x, y);
          const b = copy[i];
          if (b === Biome.WATER) continue;
          const cnt = new Map<number, number>();
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const bb = copy[idx(this, x + dx, y + dy)];
              if (bb === Biome.WATER) continue;
              cnt.set(bb, (cnt.get(bb) ?? 0) + 1);
            }
          const own = cnt.get(b) ?? 0;
          let maj = b, mv = 0;
          cnt.forEach((v, k) => { if (v > mv) { mv = v; maj = k; } });
          if (own <= 2 && mv >= 5) this.biomes[i] = maj;
        }
      }
    }
  }

  /**
   * Снежный биом ≡ footprint горы ПОСЛЕ сглаживания: выпавшие из горы
   * «снежные острова» возвращаются в секторный биом, а затёртые сектором
   * клетки горы — снова снег. Иначе терраса могла «переехать» на чужой биом.
   */
  private protectReserved(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        if (this.biomes[i] === Biome.WATER) continue;
        if (this.mountainTier(x, y) > 0) this.biomes[i] = Biome.SNOW;
        else if (this.biomes[i] === Biome.SNOW) {
          const ang = Math.atan2(y - this.cy, x - this.cx)
            + (this.noiseB.value(x * 0.05, y * 0.05) - 0.5) * 0.7;
          this.biomes[i] = this.sectorBiome(ang);
        }
      }
    }
  }

  /* ---------- Ф1.4 Биом → тайлы с учётом высот ---------- */
  /**
   * Раскладка тайлов по биому и уровню высоты.
   *
   * Высоты задают рельеф, но ВСЕ наземные тайлы здесь — проходимые
   * (никаких солидов), чтобы не рвать дороги и связность мира.
   * Кромка террасы НЕ выкладывается камнем (CLIFF/SCREE): кромка несёт
   * грунт собственного плато, а сам уступ рисует оверлей рельефа в
   * tile-geom (drawRelief) гранью с палитрой биома — в снегу это светлый
   * холодный камень со снежной кромкой, а не чужая серая плита.
   * Физику уступа даёт маска стен по полю высот (terrain-walls), не тайлы.
   */
  private applyBiomesToTiles(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const t = this.tiles[i];
        if (t === Tl.WATER || t === Tl.SHORE) continue;
        const lv = elevLevel(this.height[i]);
        switch (this.biomes[i]) {
          case Biome.FOREST:
            // Лес живёт на базовом уровне; границы — дело оверлея рельефа
            this.tiles[i] = Tl.FOREST;
            break;
          case Biome.SWAMP:
            // Низина без террас; лужи — по шуму (высота тут постоянная)
            if (this.noiseA.value(x * 0.13, y * 0.13) > 0.68) this.tiles[i] = Tl.POOL;
            else this.tiles[i] = Tl.SWAMP;
            break;
          case Biome.MEADOW:
            // Возвышенности-пятна (9): тёмная роща на всём пятне, включая
            // кромку — пятно читается как тёмно-зелёное без серого обода.
            // Тайл больше НЕ зависит от уровня: рельеф луга — это высота,
            // а не смена травы на лес.
            this.tiles[i] = this.isHillSpot(x, y) ? Tl.FOREST : Tl.MEADOW;
            break;
          case Biome.SNOW:
          default:
            // Горные террасы: плато и его кромка — тайл своего уровня
            // (предгорье тёмно-серое, высокогорье серое, вершина белая)
            if (lv >= 5) this.tiles[i] = Tl.SNOW;
            else if (lv >= 3) this.tiles[i] = Tl.SNOW2;
            else this.tiles[i] = Tl.MTN;
            break;
        }
      }
    }
  }

  /* ---------- Ф1.5. Луговое озерцо с ручьём и мостом ---------- */
  /**
   * Озерцо на луговой возвышенности и ручей, стекающий в море.
   *
   * Раньше луг был просто террасами без воды: ни озёр, ни ручьёв. Теперь на
   * ровном луговом плато (уровень ≥ 2) выкапывается небольшое озерцо, а от
   * него по земле вниз идёт русло — оно тянется по террасам до моря и на
   * каждом перепаде даёт водопад (грань «вода над водой» в 3D-меше).
   *
   * Русло прорезается только по проходимому грунту: деревья и камни дороже
   * (прорубаем в крайнем случае), постройки и скалы — непроходимы для выбора.
   * Где-то посередине ручья ставится мост (тайл BRIDGE) — единственный
   * переход через водную преграду.
   */


  /* ---------- WorldData ---------- */
  private createWorldData(): WorldData {
    const w: WorldData = {
      W: this.W, H: this.H, tiles: this.tiles, nav: null as unknown as import("../navigation/nav-mesh").INavMesh,
      isDungeon: false, dungeonId: -1, dungeonName: "", bossReward: null,
      spawn: { x: 0, y: 0 }, zones: [], shrines: [], npcs: [], chests: [],
      pedestals: [], spawns: [], doors: [], souls: [], ambient: [], dungeonEntries: [],
      exitSpot: { x: 0, y: 0 }, hornSpot: { x: 0, y: 0 }, meadSpot: { x: 0, y: 0 },
      oreSpot: { x: 0, y: 0 }, bearSpot: { x: 0, y: 0 },
      mossSpot: { x: 0, y: 0 }, amberSpot: { x: 0, y: 0 }, flowerSpot: { x: 0, y: 0 },
      diarySpot: { x: 0, y: 0 }, bundleSpot: { x: 0, y: 0 }, relicSpot: { x: 0, y: 0 },
      oldAltar: { x: 0, y: 0 }, stashSpot: { x: 0, y: 0 }, ruinedVillage: { x: 0, y: 0 },
      // Алтарь Древа по дизайну живёт в топях; позицию назначает overworld.
      treeAltar: { x: this.cx, y: this.cy }, arena: { x: 0, y: 0, r: 92 }, snakeSpot: { x: 0, y: 0 },
      villageA: { x: 0, y: 0 }, villageB: { x: 0, y: 0 },
      bossRoom: { x: 0, y: 0, w: 0, h: 0 }, bossSpot: { x: 0, y: 0 }, entryStairs: { x: 0, y: 0 },
      ruinedHouses: [],
      biomes: this.biomes,
      height: this.height,
    };
    return w;
  }

  private setTile(x: number, y: number, t: number): void {
    if (this.inBounds(x, y)) this.tiles[idx(this, x, y)] = t;
  }
  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
}

/* ============================================================
   Озерцо на луговой возвышенности, ручей к морю и мост (Ф1.5)
   ============================================================ */

/** Подсказка, где хочется видеть озерцо (клетки карты). */
export interface PondHint {
  /** Точка притяжения — старт игрока: озеро ставится в этом районе. */
  near?: { x: number; y: number };
}

const POND_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

/** Детерминированный ГПСЧ (mulberry32): раскладка не зависит от Math.random. */
function pondRnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Озерцо на луговой возвышенности и ручей от него к морю.
 *
 * Вызывается из overworld ПОСЛЕ деревень и стартового спавна: раньше озеро
 * выбиралось в 20–88 клетках от центра острова (обычно на другой стороне
 * карты, мимо него просто не проходили), а на части сидов ровной луговой
 * площадки не находилось и воды не было вовсе. Здесь кандидаты сортируются
 * по близости к старту, а последний тир берёт любую ровную возвышенность —
 * озеро есть всегда.
 *
 * Вода режется тайлом STREAM: он остаётся на уровне плато, русло спускается
 * террасами (на перепадах получаются водопады), а мост ставится там, где у
 * русла есть берега. Повторный вызов ничего не ломает.
 */
export function carveHillPondStream(w: WorldData, opts: PondHint = {}): boolean {
  const { W, H, tiles, height } = w;
  if (!height || height.length !== W * H) return false;
  const N = W * H;
  const at = (x: number, y: number): number => y * W + x;
  const inb = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
  const lvAt = (x: number, y: number): number => elevLevel(height[at(x, y)]);

  for (let i = 0; i < N; i++) if (tiles[i] === Tl.STREAM) return true; // уже есть

  const near = opts.near ?? { x: W / 2, y: H / 2 };
  const dNear = (x: number, y: number): number => Math.hypot(x - near.x, y - near.y);

  // Море: вода/берег, достижимые с края карты (прошлые озёра не в счёт).
  const sea = new Uint8Array(N);
  {
    const stack: number[] = [];
    for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
    while (stack.length) {
      const i = stack.pop() as number;
      if (sea[i]) continue;
      const t = tiles[i];
      if (t !== Tl.WATER && t !== Tl.SHORE) continue;
      sea[i] = 1;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of POND_DIRS) {
        const nx = x + dx, ny = y + dy;
        if (inb(nx, ny)) stack.push(at(nx, ny));
      }
    }
  }

  // Расстояние по земле до моря: озеро не должно стоять у самой кромки.
  const seaDist = new Int32Array(N).fill(-1);
  {
    const q: number[] = [];
    for (let i = 0; i < N; i++) if (sea[i]) { seaDist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      const cx2 = cur % W, cy2 = (cur / W) | 0;
      for (const [dx, dy] of POND_DIRS) {
        const nx = cx2 + dx, ny = cy2 + dy;
        if (!inb(nx, ny)) continue;
        const ni = at(nx, ny);
        if (seaDist[ni] !== -1) continue;
        seaDist[ni] = seaDist[cur] + 1;
        q.push(ni);
      }
    }
  }

  const biomes = w.biomes;
  const soft = (t: number): boolean =>
    t === Tl.MEADOW || t === Tl.GRASS || t === Tl.FOREST || t === Tl.SWAMP;
  const rough = (t: number): boolean =>
    t === Tl.TREE || t === Tl.ROCK || t === Tl.FIR || t === Tl.DEADTREE || t === Tl.COLUMN;

  /**
   * Ровная площадка под озеро: диск радиуса r в одном уровне высоты плюс
   * кольцо отступа `margin` вокруг него.
   *
   * Кольцо нужно, чтобы озеро не легло на самый край террасы: тогда его берег
   * упирался бы в обрыв и озеро «свисало» с уступа. Если ровного места с
   * отступом нет, берём тир с меньшим радиусом и в крайнем случае без отступа.
   */
  const spotOk = (x: number, y: number, r: number, meadowOnly: boolean, margin = 2): boolean => {
    const lvl = lvAt(x, y);
    const rr = r + margin;
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) return false;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr) continue;
        const ni = at(nx, ny);
        if (lvAt(nx, ny) !== lvl) return false;   // ни края террасы, ни перепада
        if (d2 > r * r) continue;                // дальше — только кольцо отступа
        if (!soft(tiles[ni])) return false;
        if (meadowOnly && biomes && biomes[ni] !== Biome.MEADOW) return false;
      }
    }
    return true;
  };

  /** Скан площадок одного тира: по близости к старту, а не к центру карты. */
  const collect = (
    minLevel: number, r: number, dMin: number, dMax: number, seaMin: number, meadowOnly: boolean,
    margin = 2,
  ): Array<{ x: number; y: number; r: number }> => {
    const out: Array<{ x: number; y: number; r: number }> = [];
    for (let y = 6; y < H - 6; y++) {
      for (let x = 6; x < W - 6; x++) {
        const i = at(x, y);
        if (lvAt(x, y) < minLevel) continue;
        if (seaDist[i] < seaMin) continue;
        const d = dNear(x, y);
        if (d < dMin || d > dMax) continue;
        if (meadowOnly && biomes && biomes[i] !== Biome.MEADOW) continue;
        if (!soft(tiles[i])) continue;
        if (!spotOk(x, y, r, meadowOnly, margin)) continue;
        out.push({ x, y, r });
      }
    }
    return out;
  };

  // Сначала высокое ровное плато рядом со стартом, затем пониже и подальше,
  // в крайнем случае — любая ровная возвышенность: озеро должно быть всегда.
  const tiers = [
    collect(2, 4, 12, 48, 20, true, 2),
    collect(2, 3, 12, 48, 20, true, 2),
    collect(1, 3, 12, 60, 16, true, 2),
    collect(1, 2, 12, 60, 16, true, 1),
    collect(1, 2, 8, 84, 10, true, 1),
    collect(1, 1, 6, 120, 6, false, 0),
  ];
  const cands: Array<{ x: number; y: number; r: number }> = [];
  for (const list of tiers) {
    for (const c of list) {
      if (!cands.some((p) => p.x === c.x && p.y === c.y)) cands.push(c);
    }
    if (cands.length >= 8) break;
  }
  if (cands.length === 0) {
    // Нет ровной площадки — берём любую возвышенность подальше от моря.
    let best: { x: number; y: number; r: number } | null = null;
    let bestScore = -Infinity;
    for (let y = 6; y < H - 6; y++) {
      for (let x = 6; x < W - 6; x++) {
        if (lvAt(x, y) < 1) continue;
        if (!soft(tiles[at(x, y)])) continue;
        const score = seaDist[at(x, y)] - dNear(x, y) * 0.3;
        if (score > bestScore) { bestScore = score; best = { x, y, r: 1 }; }
      }
    }
    if (!best) return false;
    cands.push(best);
  }
  // Сначала самое БОЛЬШОЕ озеро (широкая терраса должна получить широкое
  // озеро, а не лужицу), при равном радиусе — ближе к старту.
  cands.sort((a, b) => b.r - a.r || dNear(a.x, a.y) - dNear(b.x, b.y)
    || lvAt(b.x, b.y) - lvAt(a.x, a.y));

  let pondSpot: Array<{ x: number; y: number }> | null = null;
  let streamPath: number[] | null = null;

  const TRIES = Math.min(cands.length, 10);
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const c = cands[attempt];

    /* --- 1. Озерцо: круг радиусом r (тир уже проверён spotOk) --- */
    const pr = c.r;
    const pond: Array<{ x: number; y: number }> = [];
    for (let dy = -pr; dy <= pr; dy++) {
      for (let dx = -pr; dx <= pr; dx++) {
        if (dx * dx + dy * dy > pr * pr) continue;
        const x = c.x + dx, y = c.y + dy;
        if (!inb(x, y)) continue;
        pond.push({ x, y });
      }
    }
    const pondSet = new Set<number>(pond.map((p) => at(p.x, p.y)));

    /* --- 2. Русло: самый дешёвый спуск к морю (Дейкстра по суше) --- */
    const dist = new Int32Array(N).fill(-1);
    const prev = new Int32Array(N).fill(-1);
    const heap: number[] = [];
    const swap = (a: number, b: number): void => {
      const t = heap[a]; heap[a] = heap[b]; heap[b] = t;
    };
    const push = (i: number): void => {
      heap.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (dist[heap[p]] <= dist[heap[k]]) break;
        swap(p, k);
        k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap.pop() as number;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l;
          if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r;
          if (m === k) break;
          swap(m, k);
          k = m;
        }
      }
      return top;
    };

    // Старт — проходимая земля вокруг озерца.
    for (const p of pond) {
      for (const [dx, dy] of POND_DIRS) {
        const nx = p.x + dx, ny = p.y + dy;
        if (!inb(nx, ny)) continue;
        const ni = at(nx, ny);
        if (pondSet.has(ni) || dist[ni] === 0) continue;
        const t = tiles[ni];
        if (!soft(t) && !rough(t)) continue;
        dist[ni] = 0;
        push(ni);
      }
    }

    for (let iter = 0; iter < 40000 && heap.length; iter++) {
      const cur = pop();
      const cx2 = cur % W, cy2 = (cur / W) | 0;
      for (const [dx, dy] of POND_DIRS) {
        const nx = cx2 + dx, ny = cy2 + dy;
        if (!inb(nx, ny)) continue;
        const ni = at(nx, ny);
        if (pondSet.has(ni)) continue;
        const t = tiles[ni];
        let cost: number;
        if (soft(t)) cost = 10;
        else if (rough(t)) cost = 90;      // прорубаем только в крайнем случае
        else continue;                     // вода, берег, постройки, скалы
        const dl = lvAt(nx, ny) - lvAt(cx2, cy2);
        if (dl > 0) cost += 30 * dl;       // подъём невыгоден
        else if (dl === 0) cost += 2;      // ровный участок почти как спуск
        else cost += 24;                   // сброс: платим за сам перепад, а не
                                           // за его высоту — ручей падает одним
                                           // водопадом, а не сыпется ступеньками
        const nd = dist[cur] + cost;
        if (dist[ni] !== -1 && dist[ni] <= nd) continue;
        dist[ni] = nd;
        prev[ni] = cur;
        push(ni);
      }
    }

    // Устье — достижимая клетка у самого берега, и обязательно НИЗКО: иначе
    // русло заканчивалось на кромке утёса над морем, спуск не рисовался и
    // водопадов не было вовсе (ручей «висел» на плато).
    let goal = -1, goalCost = Infinity, goalLv = 99;
    for (let i = 0; i < N; i++) {
      if (dist[i] < 0) continue;
      const gx = i % W, gy = (i / W) | 0;
      let nearShore = false;
      for (const [dx, dy] of POND_DIRS) {
        const nx = gx + dx, ny = gy + dy;
        if (!inb(nx, ny)) continue;
        const ni = at(nx, ny);
        if (tiles[ni] === Tl.SHORE || sea[ni]) { nearShore = true; break; }
      }
      if (!nearShore) continue;
      // Низший уровень важнее длины: устье должно стоять на уровне моря,
      // иначе ручей упирался в кромку утёса и не падал в воду.
      const gl = lvAt(gx, gy);
      if (gl < goalLv || (gl === goalLv && dist[i] < goalCost)) {
        goalLv = gl;
        goalCost = dist[i];
        goal = i;
      }
    }
    if (goal < 0) { pondSpot = pondSpot ?? pond; continue; }

    const path: number[] = [];
    let cur = goal;
    for (let guard = 0; cur !== -1 && guard < 400; guard++) {
      path.push(cur);
      cur = prev[cur];
    }
    path.reverse();
    if (path.length < 4 || path.length > 120) { pondSpot = pondSpot ?? pond; continue; }
    if (!streamPath || path.length > streamPath.length) {
      streamPath = path;
      pondSpot = pond;
    }
    if (streamPath.length >= 14) break;   // достаточно длинное русло — хватит
  }

  if (!pondSpot) return false;

  /* --- 3. Прорезаем воду --- */
  const mark = (i: number): void => {
    tiles[i] = Tl.STREAM;
    if (biomes) biomes[i] = Biome.WATER;
  };
  for (const p of pondSpot) mark(at(p.x, p.y));
  if (streamPath) {
    streamPath = extendStreamMouth(w, streamPath);
    for (const i of streamPath) mark(i);
    placeStreamBridge(w, streamPath);
  }
  return true;
}

/**
 * Устье: довести русло до самой морской воды.
 *
 * Дейкстра ведёт ручей только по суше, поэтому последняя клетка русла — это
 * ГРУНТ у берега, а между ним и морем остаётся полоса песка. В игре ручей
 * обрывался в песке, не доходя до воды. Здесь берег докапывается до первой
 * клетки моря: идём по песку (SHORE) и помечаем путь руслом.
 *
 * Высоту новых клеток ставим как у последней клетки русла: берег и так ровный,
 * новых уступов у устья не появляется.
 *
 * @returns путь с добавленными клетками устья (или исходный, если до воды
 *          не дойти за `maxLen` шагов).
 */
function extendStreamMouth(w: WorldData, path: number[], maxLen = 10): number[] {
  const { W, H, tiles, height } = w;
  if (!path.length) return path;
  const N = W * H;
  const start = path[path.length - 1];
  const seaWater = (i: number): boolean => tiles[i] === Tl.WATER;
  const touchesSea = (i: number): boolean => {
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of POND_DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (seaWater(ny * W + nx)) return true;
    }
    return false;
  };
  if (touchesSea(start)) return path;

  const prev = new Int32Array(N).fill(-1);
  const seen = new Uint8Array(N);
  const q: number[] = [start];
  seen[start] = 1;
  let found = -1;
  for (let h = 0; h < q.length && h < 300; h++) {
    const cur = q[h];
    if (cur !== start && touchesSea(cur)) { found = cur; break; }
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of POND_DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (seen[ni]) continue;
      // Идём только по песку: море не трогаем, скалы и деревья не рубим.
      if (tiles[ni] !== Tl.SHORE) continue;
      seen[ni] = 1;
      prev[ni] = cur;
      q.push(ni);
    }
  }
  if (found < 0) return path;

  const add: number[] = [];
  for (let cur = found; cur !== -1 && cur !== start; cur = prev[cur]) add.push(cur);
  if (!add.length || add.length > maxLen) return path;
  add.reverse();

  // Берег ровный по высоте; держим устье на уровне последней клетки русла,
  // чтобы в самом устье не появился новый уступ.
  if (height) {
    const hMouth = height[start];
    for (const i of add) height[i] = hMouth;
  }
  return path.concat(add);
}

/**
 * Мост через ручей: клетка русла, у которой берега с двух сторон.
 *
 * Доски должны опираться на сушу того же уровня — иначе мост висит над
 * обрывом. Из подходящих клеток берётся ближайшая к середине ручья, а если
 * ровных берегов нет вовсе — просто две суши напротив друг друга.
 */
function placeStreamBridge(w: WorldData, path: number[]): void {
  const { W, tiles, height } = w;
  if (!height) return;
  const at = (x: number, y: number): number => y * W + x;
  const inb = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < (height.length / W | 0);
  const lvAt = (x: number, y: number): number => elevLevel(height[at(x, y)]);
  const isWater = (t: number): boolean => t === Tl.WATER || t === Tl.POOL || t === Tl.STREAM;
  const water = (x: number, y: number): boolean => inb(x, y) && isWater(tiles[at(x, y)]);
  const land = (x: number, y: number): boolean => {
    if (!inb(x, y)) return false;
    const t = tiles[at(x, y)];
    if (isWater(t) || t === Tl.BRIDGE) return false;
    return !isSolidTileId(t);
  };

  // Мост — на ровном участке БЛИЖЕ К УСТЬЮ: там русло уже спустилось на
  // нижнюю террасу, берега одной высоты и переход действительно нужен. Мост
  // сразу под водопадом бесполезен: с плато на него всё равно не сойти.
  // Последние клетки русла (устье, пляж) пропускаем.
  const tail = path[Math.max(0, path.length - 5)];
  const mx = tail % W, my = (tail / W) | 0;

  const pick = (sameLevelOnly: boolean, loose = false): number => {
    let best = -1, bestD = Infinity;
    let looseBest = -1, looseScore = -Infinity;
    for (const i of path) {
      if (!isWater(tiles[i])) continue;
      const x = i % W, y = (i / W) | 0;
      const lvl = lvAt(x, y);
      const lvlOk = (bx: number, by: number): boolean =>
        !sameLevelOnly || (inb(bx, by) && lvAt(bx, by) === lvl);
      if (loose) {
        const banks = (land(x - 1, y) ? 1 : 0) + (land(x + 1, y) ? 1 : 0)
          + (land(x, y - 1) ? 1 : 0) + (land(x, y + 1) ? 1 : 0);
        const score = banks * 10 - Math.hypot(x - mx, y - my);
        if (score > looseScore) { looseScore = score; looseBest = i; }
        continue;
      }
      // Ручей течёт север-юг — мост поперёк, берега запад/восток (и наоборот).
      const acrossWE = land(x, y - 1) && land(x, y + 1)
        && water(x - 1, y) && water(x + 1, y)
        && lvlOk(x, y - 1) && lvlOk(x, y + 1);
      const acrossNS = land(x - 1, y) && land(x + 1, y)
        && water(x, y - 1) && water(x, y + 1)
        && lvlOk(x - 1, y) && lvlOk(x + 1, y);
      if (!acrossWE && !acrossNS) continue;
      const d = Math.hypot(x - mx, y - my);
      if (d < bestD) { bestD = d; best = i; }
    }
    return loose ? looseBest : best;
  };

  let best = pick(true);
  if (best < 0) best = pick(false);
  if (best < 0) best = pick(false, true);
  if (best >= 0) tiles[best] = Tl.BRIDGE;
}
