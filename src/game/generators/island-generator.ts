/* Генерация острова с биомами, хребтом-кольцом с перевалами и руинами */
import { mulberry, NoiseGenerator } from "../noise";
import { WorldData, Tl, Vec, Biome, idx, inB } from "./types";

/** Центр острова и биом-карты */
export const ICX = 100, ICY = 70;
/** Радиус центральной снежной гряды (алтарь в центре) */
export const R_SNOW = 9;
/** Внешний радиус хребта-кольца */
export const R_RIDGE_OUT = 18;
/** Начало прибрежной пустоши */
export const R_WASTE = 46;
/** Число перевалов в хребте */
const PASS_COUNT = 4;
/** Полуширина перевала (рад) */
const PASS_HALF = 0.17;

export interface IslandResult {
  w: WorldData;
  cx: number;
  cy: number;
  /** Совместимость: внешний радиус хребта */
  R1: number;
  /** Совместимость: середина внешней зоны */
  R2: number;
  /** Совместимость: прибрежная полоса */
  R3: number;
  /** Центр карманных руин */
  ruinC: Vec;
  /** Углы перевалов хребта (рад) */
  ridgePasses: number[];
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
  private ridgePasses: number[] = [];
  private ruinC: Vec = { x: 0, y: 0 };

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
    this.buildRuins();
    this.smoothBiomes();
    this.protectReserved();
    this.applyBiomesToTiles();
    const w = this.createWorldData();
    return {
      w,
      cx: this.cx,
      cy: this.cy,
      R1: R_RIDGE_OUT,
      R2: 34,
      R3: R_WASTE,
      ruinC: this.ruinC,
      ridgePasses: this.ridgePasses,
    };
  }

  /* ---------- Ф1.1 Форма острова (эллипс + шум) ---------- */
  private buildIsland(): void {
    const RX = 94, RY = 64;
    const normDist = (x: number, y: number) => Math.hypot((x - this.cx) / RX, (y - this.cy) / RY);
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const d = normDist(x, y) + (this.noiseIsland.value(x * 0.055, y * 0.055) - 0.5) * 0.22;
        if (d > 1) this.setTile(x, y, Tl.WATER);
        else if (d > 0.93) this.setTile(x, y, Tl.SHORE);
      }
    }
  }

  /* ---------- Ф1.2 Карта биомов: центр-снег, кольцо-хребет с перевалами, сектора ---------- */
  private buildBiomes(): void {
    // Перевалы в кольце хребта
    const base = this.rng() * Math.PI * 2;
    this.ridgePasses = [];
    for (let i = 0; i < PASS_COUNT; i++) {
      this.ridgePasses.push(base + i * (Math.PI * 2 / PASS_COUNT) + (this.rng() - 0.5) * 0.5);
    }

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
    if (r < R_RIDGE_OUT && !this.nearPass(ang)) return Biome.RIDGE;
    return this.sectorBiome(ang);
  }

  private nearPass(ang: number): boolean {
    const TAU = Math.PI * 2;
    for (const p of this.ridgePasses) {
      let d = Math.abs(ang - p) % TAU;
      if (d > Math.PI) d = TAU - d;
      if (d < PASS_HALF) return true;
    }
    return false;
  }

  /** Сектора: лес — север, топи — запад, луга — юг, пустошь — восток и берег */
  private sectorBiome(ang: number): number {
    const TAU = Math.PI * 2;
    let a = ang % TAU;
    if (a < 0) a += TAU;
    const P = Math.PI;
    if (a >= P * 1.25 && a < P * 1.75) return Biome.FOREST; // 225°..315° (север)
    if (a >= P * 0.75 && a < P * 1.25) return Biome.SWAMP;  // 135°..225° (запад)
    if (a >= P * 0.25 && a < P * 0.75) return Biome.MEADOW; // 45°..135° (юг)
    return Biome.WASTE;                                      // восток + берег
  }

  /* ---------- Ф1.3 Карман руин ---------- */
  private buildRuins(): void {
    // Ищем площадку на суше в среднем радиусе
    for (let tries = 0; tries < 80; tries++) {
      const ang = this.rng() * Math.PI * 2;
      const dist = 32 + this.rng() * 12;
      const x = Math.round(this.cx + Math.cos(ang) * dist);
      const y = Math.round(this.cy + Math.sin(ang) * dist);
      if (!inB(this, x, y)) continue;
      const t = this.tiles[idx(this, x, y)];
      if (t === Tl.WATER || t === Tl.SHORE) continue;
      let land = 0;
      for (let dy = -7; dy <= 7; dy++)
        for (let dx = -7; dx <= 7; dx++) {
          const tt = this.getTile(x + dx, y + dy);
          if (tt !== Tl.WATER && tt !== Tl.SHORE) land++;
        }
      if (land < 170) continue;
      this.ruinC = { x, y };
      break;
    }
    if (this.ruinC.x === 0 && this.ruinC.y === 0) {
      this.ruinC = { x: this.cx - 30, y: this.cy + 24 };
    }
    this.stampRuins();
  }

  private stampRuins(): void {
    for (let y = this.ruinC.y - 11; y <= this.ruinC.y + 11; y++) {
      for (let x = this.ruinC.x - 11; x <= this.ruinC.x + 11; x++) {
        if (!inB(this, x, y)) continue;
        const i = idx(this, x, y);
        if (this.tiles[i] === Tl.WATER || this.tiles[i] === Tl.SHORE) continue;
        const d = Math.hypot(x - this.ruinC.x, (y - this.ruinC.y) * 1.15)
          + (this.noiseA.value(x * 0.2, y * 0.2) - 0.5) * 4;
        if (d < 9) this.biomes[i] = Biome.RUINS;
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

  /** Возвращает зарезервированные области (центр-снег, карман руин) после сглаживания */
  private protectReserved(): void {
    for (let y = this.cy - R_SNOW; y <= this.cy + R_SNOW; y++) {
      for (let x = this.cx - R_SNOW; x <= this.cx + R_SNOW; x++) {
        if (!inB(this, x, y)) continue;
        if (Math.hypot(x - this.cx, y - this.cy) <= R_SNOW - 1) {
          this.biomes[idx(this, x, y)] = Biome.SNOW;
        }
      }
    }
    this.stampRuins();
  }

  /* ---------- Ф1.4 Биом → тайлы ---------- */
  private applyBiomesToTiles(): void {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = idx(this, x, y);
        const t = this.tiles[i];
        if (t === Tl.WATER || t === Tl.SHORE) continue;
        switch (this.biomes[i]) {
          case Biome.RIDGE: this.tiles[i] = Tl.MTN; break;
          case Biome.FOREST: this.tiles[i] = Tl.FOREST; break;
          case Biome.SWAMP: this.tiles[i] = Tl.SWAMP; break;
          case Biome.MEADOW: this.tiles[i] = Tl.MEADOW; break;
          case Biome.RUINS: this.tiles[i] = Tl.RUINS; break;
          case Biome.SNOW: this.tiles[i] = Tl.SNOW; break;
          // Пустошь — бесплодная земля (снег остаётся только в центре)
          default: this.tiles[i] = Tl.WASTE;
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
  private getTile(x: number, y: number): number {
    return this.inBounds(x, y) ? this.tiles[idx(this, x, y)] : Tl.WATER;
  }
  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
}
