/* Генерация острова: снежный центр-«гора» и 3 сектора-биома вокруг */
import { mulberry, NoiseGenerator } from "../noise";
import { WorldData, Tl, Vec, Biome, idx, inB } from "./types";

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
  private rng: () => number;
  private noiseIsland: NoiseGenerator;
  private noiseA: NoiseGenerator;
  private noiseB: NoiseGenerator;
  private cx = ICX;
  private cy = ICY;

  constructor(seed: number) {
    this.rng = mulberry(seed);
    this.tiles = new Uint8Array(this.W * this.H).fill(Tl.SNOW);
    this.biomes = new Uint8Array(this.W * this.H).fill(Biome.SNOW);
    this.noiseIsland = new NoiseGenerator(seed ^ 0x5ea);
    this.noiseA = new NoiseGenerator((seed * 2654435761) | 0);
    this.noiseB = new NoiseGenerator((seed * 40503) | 0);
  }

  public generate(): IslandResult {
    this.buildIsland();
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

  /* ---------- Ф1.4 Биом → тайлы ---------- */
  private applyBiomesToTiles(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const t = this.tiles[i];
        if (t === Tl.WATER || t === Tl.SHORE) continue;
        switch (this.biomes[i]) {
          case Biome.FOREST: this.tiles[i] = Tl.FOREST; break;
          case Biome.SWAMP: this.tiles[i] = Tl.SWAMP; break;
          case Biome.MEADOW: this.tiles[i] = Tl.MEADOW; break;
          case Biome.SNOW:
          default: this.tiles[i] = Tl.SNOW; break;
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
