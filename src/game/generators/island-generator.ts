/* Генерация острова: снежная гора из 3 вложенных террас в центре и
   3 сектора-биома вокруг (лес/топи/луга), см. tasks/world_gen_imp_3.md */
import { mulberry, NoiseGenerator } from "../noise";
import { WorldData, Tl, Vec, Biome, idx, inB, elevLevel } from "./types";
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
    const dx = x - this.cx, dy = y - this.cy;
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

  /** Поле высот: ровные «столы» террас по биомам (финальная раскладка) */
  private assignHeights(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const b = this.biomes[i];
        if (b === Biome.WATER) { this.height[i] = H_WATER; continue; }
        if (b === Biome.SNOW) { this.height[i] = LEVEL_HEIGHT[this.mountainTier(x, y)]; continue; }
        if (b === Biome.SWAMP) { this.height[i] = H_BASE; continue; } // топь — всегда база
        this.height[i] = b === Biome.MEADOW && this.isHillSpot(x, y) ? H_SPOT : H_BASE;
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

  /* ---------- Ф1.4 Биом → тайлы с учётом высот/склонов ---------- */
  /**
   * Раскладка тайлов по биому, высоте и крутизне склона.
   *
   * Высоты задают рельеф, но ВСЕ наземные тайлы здесь — проходимые
   * (никаких солидов), чтобы не рвать дороги и связность мира.
   * Иллюзию «стен»/уступов даёт отдельная отрисовка обрывов в tile-geom
   * (cliff-face по перепаду высот между соседями).
   */
  private applyBiomesToTiles(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const t = this.tiles[i];
        if (t === Tl.WATER || t === Tl.SHORE) continue;
        const h = this.height[i];
        const lv = elevLevel(h);
        // Перепад уровней с соседями: 0 — ровная площадка, ≥1 — уступ/склон
        let dLv = 0;
        if (x > 0 && x < this.W - 1 && y > 0 && y < this.H - 1) {
          dLv = Math.max(
            Math.abs(elevLevel(this.height[idx(this, x + 1, y)]) - lv),
            Math.abs(elevLevel(this.height[idx(this, x - 1, y)]) - lv),
            Math.abs(elevLevel(this.height[idx(this, x, y + 1)]) - lv),
            Math.abs(elevLevel(this.height[idx(this, x, y - 1)]) - lv),
          );
        }
        const onStep = dLv >= 1;      // кромка террасы
        const onBigStep = dLv >= 2;   // высокий уступ
        switch (this.biomes[i]) {
          case Biome.FOREST:
            // Лес живёт на базовом уровне; кромки террас — каменистые осыпи
            if (onBigStep) this.tiles[i] = Tl.CLIFF;
            else if (onStep) this.tiles[i] = Tl.SCREE;
            else this.tiles[i] = Tl.FOREST;
            break;
          case Biome.SWAMP:
            // Низина без террас; лужи — по шуму (высота тут постоянная)
            if (this.noiseA.value(x * 0.13, y * 0.13) > 0.68) this.tiles[i] = Tl.POOL;
            else this.tiles[i] = Tl.SWAMP;
            break;
          case Biome.MEADOW:
            // Возвышенности-пятна (9): кромка — осыпь, плоская вершина —
            // тёмная роща (декор досеет деревья)
            if (onBigStep) this.tiles[i] = Tl.CLIFF;
            else if (onStep) this.tiles[i] = Tl.SCREE;
            else if (lv >= 1) this.tiles[i] = Tl.FOREST;
            else this.tiles[i] = Tl.MEADOW;
            break;
          case Biome.SNOW:
          default:
            // Горные террасы: уступы — камень, плато — по уровням
            // (предгорье тёмно-серое, высокогорье серое, вершина белая)
            if (onBigStep) this.tiles[i] = Tl.CLIFF;
            else if (onStep) this.tiles[i] = Tl.MTN;
            else if (lv >= 5) this.tiles[i] = Tl.SNOW;
            else if (lv >= 3) this.tiles[i] = Tl.SNOW2;
            else this.tiles[i] = Tl.MTN;
            break;
        }
      }
    }
  }

  /* ---------- WorldData ---------- */
  private createWorldData(): WorldData {
    const w: WorldData = {
      W: this.W, H: this.H, tiles: this.tiles, nav: null as unknown as import("navmesh").NavMesh,
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
