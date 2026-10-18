/* Генерация острова: снежный центр-«гора» с перепадами высот и 3 сектора-биома вокруг */
import { mulberry, NoiseGenerator } from "../noise";
import { WorldData, Tl, Vec, Biome, idx, inB, elevLevel, ELEV_LEVELS } from "./types";

/** Центр острова и биом-карты */
export const ICX = 100, ICY = 70;
/** Радиус центрального снежного плато (алтарь в центре) */
export const R_SNOW = 24;
/** Полуоси эллипса острова (для сэмплинга прибрежных точек) */
export const ISLAND_RX = 94, ISLAND_RY = 64;

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
    this.buildHeight();
    this.buildBiomes();
    this.smoothBiomes();
    this.protectReserved();
    this.applyBiomesToTiles();
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

  /* ---------- Ф1.1b Поле высот (рельеф: гора в центре + холмы/гряды) ---------- */
  private buildHeight(): void {
    const RX = ISLAND_RX, RY = ISLAND_RY;
    let minH = 1, maxH = 0;
    const raw = new Float32Array(this.W * this.H);
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const d = Math.hypot((x - this.cx) / RX, (y - this.cy) / RY);
        // Центральный массив (гора): широкий купол с плоской вершиной.
        const dd = Math.min(1, d / 0.78);
        let h = (1 - dd * dd) * 0.95;
        // Крупные холмы (fbm-подобная сумма) — предгорья по всему острову
        const hills =
          (this.noiseHills.value(x * 0.045, y * 0.045) - 0.5) * 0.5 +
          (this.noiseHills.value(x * 0.11, y * 0.11) - 0.5) * 0.2;
        // Резкие каменистые гряды (ridged noise) — «позвоночник» рельефа
        const rn = this.noiseDetail.value(x * 0.06, y * 0.06);
        const ridge = (1 - Math.abs(rn - 0.5) * 2);
        const detail = (this.noiseDetail.value(x * 0.19, y * 0.19) - 0.5) * 0.09;
        h += hills + ridge * 0.16 + detail;
        // Чем ниже к берегу, тем меньше влияет шум (береговая линия остаётся гладкой)
        const shoreFade = Math.min(1, Math.max(0, 1 - Math.abs(d) * 0.6));
        h *= 0.45 + 0.55 * shoreFade;
        raw[y * this.W + x] = h;
        if (h > maxH) maxH = h;
        if (h < minH) minH = h;
      }
    }
    // Нормализация высот в 0..1
    const range = Math.max(0.0001, maxH - minH);
    for (let i = 0; i < this.W * this.H; i++) {
      this.height[i] = (raw[i] - minH) / range;
    }
  }

  /* ---------- Ф1.2 Карта биомов: снег-центр + 3 сектора ---------- */
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
    const dx = x - this.cx, dy = y - this.cy;
    const r = Math.hypot(dx, dy) + (this.noiseA.value(x * 0.07, y * 0.07) - 0.5) * 7;
    if (r < R_SNOW) return Biome.SNOW;
    const ang = Math.atan2(dy, dx) + (this.noiseB.value(x * 0.05, y * 0.05) - 0.5) * 0.7;
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

  /** Возвращает зарезервированную снежную «шапку» центра после сглаживания */
  private protectReserved(): void {
    for (let y = this.cy - R_SNOW; y <= this.cy + R_SNOW; y++) {
      for (let x = this.cx - R_SNOW; x <= this.cx + R_SNOW; x++) {
        if (!inB(this, x, y)) continue;
        if (Math.hypot(x - this.cx, y - this.cy) <= R_SNOW - 1) {
          this.biomes[idx(this, x, y)] = Biome.SNOW;
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
            // Предгорья: на кромках террас — каменистые осыпи
            if (onBigStep) this.tiles[i] = Tl.CLIFF;
            else if (onStep) this.tiles[i] = Tl.SCREE;
            else this.tiles[i] = Tl.FOREST;
            break;
          case Biome.SWAMP:
            // Низина: не поднимаем, только самые низкие — озерца
            if (h < 0.18 && this.noiseA.value(x * 0.13, y * 0.13) > 0.62) this.tiles[i] = Tl.POOL;
            else this.tiles[i] = Tl.SWAMP;
            break;
          case Biome.MEADOW:
            if (onBigStep) this.tiles[i] = Tl.CLIFF;
            else if (onStep) this.tiles[i] = Tl.SCREE;
            else this.tiles[i] = Tl.MEADOW;
            break;
          case Biome.SNOW:
          default:
            // Высокогорье: каменные уступы и снежная шапка
            if (onBigStep) this.tiles[i] = Tl.CLIFF;
            else if (onStep) this.tiles[i] = Tl.MTN;
            else if (lv >= ELEV_LEVELS - 2) this.tiles[i] = Tl.SNOW2;
            else this.tiles[i] = Tl.SNOW;
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
