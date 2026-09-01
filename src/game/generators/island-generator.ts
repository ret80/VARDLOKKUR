/* Генерация острова с биомами и руинами */
import { mulberry, NoiseGenerator } from "../noise";
import { WorldData, Tl, Vec, idx, inB } from "./types";

interface IslandState {
  W: number;
  H: number;
  tiles: Uint8Array;
  rng: () => number;
  noise: NoiseGenerator;
}

export class IslandGenerator {
  private state: IslandState;

  constructor(seed: number) {
    const rng = mulberry(seed);
    const tiles = new Uint8Array(200 * 140).fill(Tl.SNOW);
    this.state = {
      W: 200, H: 140, tiles, rng,
      noise: new NoiseGenerator(seed ^ 0x5ea),
    };
  }

  public generate(): { w: WorldData; cx: number; cy: number; R1: number; R2: number; ruinsC: Vec } {
    this.buildIsland();
    const { cx, cy, R1, R2 } = this.buildBiomes();
    const ruinsC = this.buildRuins();
    this.smoothBiomes();
    const w = this.createWorldData();
    return { w, cx, cy, R1, R2, ruinsC };
  }

  private get s(): IslandState { return this.state; }

  private buildIsland(): void {
    const ICX = this.s.W / 2, ICY = this.s.H / 2, RX = 94, RY = 64;
    const normDist = (x: number, y: number) => Math.hypot((x - ICX) / RX, (y - ICY) / RY);
    for (let y = 0; y < this.s.H; y++) {
      for (let x = 0; x < this.s.W; x++) {
        const d = normDist(x, y) + (this.s.noise.value(x * 0.055, y * 0.055) - 0.5) * 0.22;
        if (d > 1) this.setTile(x, y, Tl.WATER);
        else if (d > 0.93) this.setTile(x, y, Tl.SHORE);
      }
    }
  }

  private buildBiomes(): { cx: number; cy: number; R1: number; R2: number } {
    const cx = this.s.W / 2 + (this.s.rng() * 8 - 4);
    const cy = this.s.H / 2 - 4 + (this.s.rng() * 6 - 3);
    const R1 = 24, R2 = 42, R3 = 54;
    const n1 = new NoiseGenerator(this.s.rng() * 100000 | 0);
    const n2 = new NoiseGenerator(this.s.rng() * 100000 | 0);
    
    for (let y = 2; y < this.s.H - 2; y++) {
      for (let x = 2; x < this.s.W - 2; x++) {
        const cur = this.getTile(x, y);
        if (cur === Tl.WATER || cur === Tl.SHORE) continue;
        const d = Math.hypot((x - cx) * 0.92, y - cy) + (n1.value(x * 0.07, y * 0.07) - 0.5) * 13;
        if (d < R1) this.setTile(x, y, Tl.MTN);
        else if (d < R2) this.setTile(x, y, Tl.FOREST);
        else if (d < R3) this.setTile(x, y, this.s.rng() < 0.42 ? Tl.SWAMP : Tl.FOREST);
        else if (n2.value(x * 0.05, y * 0.05) < 0.24) this.setTile(x, y, Tl.SNOW2);
      }
    }
    return { cx, cy, R1, R2 };
  }

  private buildRuins(): Vec {
    const ruinsC = { x: 44 + Math.floor(this.s.rng() * 8), y: 88 + Math.floor(this.s.rng() * 6) };
    const n2 = new NoiseGenerator(this.s.rng() * 100000 | 0);
    for (let y = ruinsC.y - 10; y <= ruinsC.y + 10; y++) {
      for (let x = ruinsC.x - 11; x <= ruinsC.x + 11; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - ruinsC.x, (y - ruinsC.y) * 1.2) + (n2.value(x * 0.2, y * 0.2) - 0.5) * 5;
        if (d < 9 && this.getTile(x, y) !== Tl.WATER && this.getTile(x, y) !== Tl.SHORE) {
          this.setTile(x, y, Tl.RUINS);
        }
      }
    }
    return ruinsC;
  }

  private smoothBiomes(): void {
    const baseOf = (t: number) => (t === Tl.FOREST || t === Tl.MTN || t === Tl.SWAMP || t === Tl.RUINS || t === Tl.SNOW) ? t : -1;
    for (let iter = 0; iter < 2; iter++) {
      const copy = this.s.tiles.slice();
      for (let y = 2; y < this.s.H - 2; y++) {
        for (let x = 2; x < this.s.W - 2; x++) {
          const t = copy[idx({ W: this.s.W }, x, y)];
          if (baseOf(t) < 0) continue;
          const cnt = new Map<number, number>();
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const b = baseOf(copy[idx({ W: this.s.W }, x + dx, y + dy)]);
              if (b >= 0) cnt.set(b, (cnt.get(b) ?? 0) + 1);
            }
          }
          const own = cnt.get(t) ?? 0;
          let maj = t, mv = 0;
          cnt.forEach((v, k) => { if (v > mv) { mv = v; maj = k; } });
          if (own <= 2 && mv >= 5) this.setTile(x, y, maj);
        }
      }
    }
  }

  private createWorldData(): WorldData {
    const w: WorldData = {
      W: this.s.W, H: this.s.H, tiles: this.s.tiles, nav: null as unknown as import("navmesh").NavMesh,
      isDungeon: false, dungeonId: -1, dungeonName: "", bossReward: null,
      spawn: { x: 0, y: 0 }, zones: [], shrines: [], npcs: [], chests: [],
      pedestals: [], spawns: [], doors: [], souls: [], ambient: [], dungeonEntries: [],
      exitSpot: { x: 0, y: 0 }, hornSpot: { x: 0, y: 0 }, meadSpot: { x: 0, y: 0 },
      oreSpot: { x: 0, y: 0 }, bearSpot: { x: 0, y: 0 },
      mossSpot: { x: 0, y: 0 }, amberSpot: { x: 0, y: 0 }, flowerSpot: { x: 0, y: 0 },
      diarySpot: { x: 0, y: 0 }, bundleSpot: { x: 0, y: 0 }, relicSpot: { x: 0, y: 0 },
      oldAltar: { x: 0, y: 0 }, stashSpot: { x: 0, y: 0 }, ruinedVillage: { x: 0, y: 0 },
      treeAltar: { x: 100, y: 24 }, arena: { x: 0, y: 0, r: 92 }, snakeSpot: { x: 0, y: 0 },
      villageA: { x: 0, y: 0 }, villageB: { x: 0, y: 0 },
      bossRoom: { x: 0, y: 0, w: 0, h: 0 }, bossSpot: { x: 0, y: 0 }, entryStairs: { x: 0, y: 0 },
      ruinedHouses: [],
    };
    return w;
  }

  private setTile(x: number, y: number, t: number): void {
    if (this.inBounds(x, y)) this.s.tiles[idx({ W: this.s.W }, x, y)] = t;
  }
  private getTile(x: number, y: number): number {
    return this.inBounds(x, y) ? this.s.tiles[idx({ W: this.s.W }, x, y)] : Tl.WATER;
  }
  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.s.W && y < this.s.H;
  }
}
