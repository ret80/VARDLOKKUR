/* Процедурная генерация Нидов: холодный остров с радиальными биомами,
   сеть дорог (A*), три тематических подземелья и навигационная сетка. */
import { NavMesh } from "navmesh";

export const T = 16;

export const Tl = {
  WATER: 0, SHORE: 1, SNOW: 2, SNOW2: 3, PATH: 4, FOREST: 5, TREE: 6, ROCK: 7,
  MTN: 8, SWAMP: 9, POOL: 10, VILLAGE: 11, PALISADE: 12, HOUSE: 13, RUINS: 14,
  COLUMN: 15, CAVE: 16, CAVEWALL: 17, STAIRS: 18, DFLOOR: 19, DWALL: 20, ALTAR: 21,
} as const;

const SOLID = new Set<number>([
  Tl.WATER, Tl.TREE, Tl.ROCK, Tl.PALISADE, Tl.HOUSE, Tl.COLUMN, Tl.CAVEWALL, Tl.DWALL,
]);
export const isSolidTileId = (id: number) => SOLID.has(id);

export type ChestItem = "bow" | "arrows" | "heartPiece" | "key";
export type EnemyKind = "draugr" | "varg" | "raven" | "shroom" | "crawler" | "frost" | "reaper" | "spider" | "giant" | "snake";
export type BossReward = "axe" | "bow" | "hammer";
export type DropKind = "heart" | "arrows" | "axe" | "sword" | "bear" | "hammer" | "bow" | "horn" | "mead" | "ore" | "moss" | "amber" | "flower" | "diary" | "bundle" | "relic" | "shard" | "bones" | "rune";
export type ProjectileKind = "arrow" | "axe" | "spore" | "fire";

export interface Vec { x: number; y: number }
export interface ChestDef { x: number; y: number; item: ChestItem }
export interface PedestalDef { x: number; y: number; guards: EnemyKind[] }
export interface NpcDef { id: string; name: string; x: number; y: number }
export interface ShrineDef { x: number; y: number }
export interface SpawnDef { kind: EnemyKind; x: number; y: number }
export interface ZoneRect { x: number; y: number; w: number; h: number; name: string }
export interface DungeonEntry { x: number; y: number; id: number; name: string }
export interface AmbientDef { kind: "shard" | "bones"; x: number; y: number }

export interface WorldData {
  W: number; H: number;
  tiles: Uint8Array;
  nav: NavMesh;
  isDungeon: boolean;
  dungeonId: number;
  dungeonName: string;
  bossReward: BossReward | null;
  spawn: Vec;
  zones: ZoneRect[];
  shrines: ShrineDef[];
  npcs: NpcDef[];
  chests: ChestDef[];
  pedestals: PedestalDef[];
  spawns: SpawnDef[];
  doors: Vec[];
  souls: Vec[];
  ambient: AmbientDef[];
  dungeonEntries: DungeonEntry[];
  exitSpot: Vec;
  hornSpot: Vec; meadSpot: Vec; oreSpot: Vec; bearSpot: Vec;
  mossSpot: Vec; amberSpot: Vec; flowerSpot: Vec;
  diarySpot: Vec; bundleSpot: Vec; relicSpot: Vec;
  oldAltar: Vec; stashSpot: Vec; ruinedVillage: Vec;
  treeAltar: Vec; arena: { x: number; y: number; r: number }; snakeSpot: Vec;
  villageA: Vec; villageB: Vec;
  bossRoom: { x: number; y: number; w: number; h: number }; bossSpot: Vec; entryStairs: Vec;
}

export const idx = (w: { W: number }, x: number, y: number) => y * w.W + x;
export const inB = (w: { W: number; H: number }, x: number, y: number) => x >= 0 && y >= 0 && x < w.W && y < w.H;
export function tileAt(w: WorldData, x: number, y: number): number {
  return inB(w, x, y) ? w.tiles[idx(w, x, y)] : Tl.DWALL;
}
export function solidTileAt(w: WorldData, x: number, y: number): boolean {
  return isSolidTileId(tileAt(w, x, y));
}
function setTile(w: WorldData, x: number, y: number, t: number) {
  if (inB(w, x, y)) w.tiles[idx(w, x, y)] = t;
}
const px = (tx: number, ty: number): Vec => ({ x: tx * T + T / 2, y: ty * T + T / 2 });
const clampi = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================== ШУМ ============================== */
class NoiseGenerator {
  private perm: Uint8Array;
  constructor(seed: number) {
    this.perm = new Uint8Array(512);
    const rng = mulberry(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  private hash(x: number, y: number): number {
    return this.perm[(this.perm[x & 255] + y) & 255] / 255;
  }
  private smooth(t: number): number { return t * t * (3 - 2 * t); }
  public value(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = this.smooth(x - ix), fy = this.smooth(y - iy);
    const a = this.hash(ix, iy), b = this.hash(ix + 1, iy);
    const c = this.hash(ix, iy + 1), d = this.hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  public fbm(x: number, y: number, octaves = 4): number {
    let v = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      v += this.value(x * f, y * f) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return v / norm;
  }
}

/* ============================== НАВИГАЦИЯ ============================== */
class NavBuilder {
  public build(w: WorldData): NavMesh {
    const { W, H } = w;
    const walk = (x: number, y: number) => inB(w, x, y) && !SOLID.has(w.tiles[idx(w, x, y)]);
    interface Run { x: number; y: number; len: number; id: number }
    const rows: Run[][] = [];
    let id = 0;
    for (let y = 0; y < H; y++) {
      const rs: Run[] = [];
      let x = 0;
      while (x < W) {
        if (walk(x, y)) {
          let len = 0;
          while (x + len < W && walk(x + len, y)) len++;
          rs.push({ x, y, len, id: id++ });
          x += len;
        } else x++;
      }
      rows.push(rs);
    }
    const polys: { x: number; y: number }[][] = [];
    const used = new Set<number>();
    for (let y = 0; y < H; y++) {
      for (const r of rows[y]) {
        if (used.has(r.id)) continue;
        used.add(r.id);
        let x0 = r.x, len = r.len, yy = y;
        outer: while (yy + 1 < H) {
          const below = rows[yy + 1];
          const match = below.find((b) => b.x <= x0 && b.x + b.len >= x0 + len);
          if (!match) break;
          for (let cx = x0; cx < x0 + len; cx++) if (!walk(cx, yy + 1)) break outer;
          for (const b of below) if (b.x < x0 + len && b.x + b.len > x0) used.add(b.id);
          yy++;
        }
        const shrink = 1.2;
        polys.push([
          { x: x0 * T + shrink, y: y * T + shrink },
          { x: (x0 + len) * T - shrink, y: y * T + shrink },
          { x: (x0 + len) * T - shrink, y: (yy + 1) * T - shrink },
          { x: x0 * T + shrink, y: (yy + 1) * T - shrink },
        ]);
      }
    }
    return new NavMesh(polys, 1.2);
  }
}

/* ============================== ГЕНЕРАТОР ОСТРОВА ============================== */
class IslandGenerator {
  private W: number = 200;
  private H: number = 140;
  private tiles!: Uint8Array;
  private rng: () => number;
  private noise: NoiseGenerator;

  constructor(seed: number) {
    this.rng = mulberry(seed);
    this.noise = new NoiseGenerator(seed ^ 0x5ea);
    this.tiles = new Uint8Array(this.W * this.H).fill(Tl.SNOW);
  }

  public generate(): { w: WorldData; cx: number; cy: number; R1: number; R2: number; ruinsC: { x: number; y: number } } {
    this.buildIsland();
    const { cx, cy, R1, R2 } = this.buildBiomes();
    const ruinsC = this.buildRuins();
    this.smoothBiomes();
    const w = this.createWorldData();
    return { w, cx, cy, R1, R2, ruinsC };
  }

  private buildIsland(): void {
    const ICX = this.W / 2, ICY = this.H / 2, RX = 94, RY = 64;
    const normDist = (x: number, y: number) => Math.hypot((x - ICX) / RX, (y - ICY) / RY);
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const d = normDist(x, y) + (this.noise.value(x * 0.055, y * 0.055) - 0.5) * 0.22;
        if (d > 1) this.setTile(x, y, Tl.WATER);
        else if (d > 0.93) this.setTile(x, y, Tl.SHORE);
      }
    }
  }

  private buildBiomes(): { cx: number; cy: number; R1: number; R2: number } {
    const cx = this.W / 2 + (this.rng() * 8 - 4);
    const cy = this.H / 2 - 4 + (this.rng() * 6 - 3);
    const R1 = 24, R2 = 42, R3 = 54;
    const n1 = new NoiseGenerator(this.rng() * 100000 | 0);
    const n2 = new NoiseGenerator(this.rng() * 100000 | 0);
    
    for (let y = 2; y < this.H - 2; y++) {
      for (let x = 2; x < this.W - 2; x++) {
        const cur = this.getTile(x, y);
        if (cur === Tl.WATER || cur === Tl.SHORE) continue;
        const d = Math.hypot((x - cx) * 0.92, y - cy) + (n1.value(x * 0.07, y * 0.07) - 0.5) * 13;
        if (d < R1) this.setTile(x, y, Tl.MTN);
        else if (d < R2) this.setTile(x, y, Tl.FOREST);
        else if (d < R3) this.setTile(x, y, this.rng() < 0.42 ? Tl.SWAMP : Tl.FOREST);
        else if (n2.value(x * 0.05, y * 0.05) < 0.24) this.setTile(x, y, Tl.SNOW2);
      }
    }
    return { cx, cy, R1, R2 };
  }

  private buildRuins(): { x: number; y: number } {
    const ruinsC = { x: 44 + Math.floor(this.rng() * 8), y: 88 + Math.floor(this.rng() * 6) };
    const n2 = new NoiseGenerator(this.rng() * 100000 | 0);
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
      const copy = this.tiles.slice();
      for (let y = 2; y < this.H - 2; y++) {
        for (let x = 2; x < this.W - 2; x++) {
          const t = copy[idx({ W: this.W }, x, y)];
          if (baseOf(t) < 0) continue;
          const cnt = new Map<number, number>();
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const b = baseOf(copy[idx({ W: this.W }, x + dx, y + dy)]);
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
      W: this.W, H: this.H, tiles: this.tiles, nav: null as unknown as NavMesh,
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
    };
    return w;
  }

  private setTile(x: number, y: number, t: number): void {
    if (this.inBounds(x, y)) this.tiles[idx({ W: this.W }, x, y)] = t;
  }
  private getTile(x: number, y: number): number {
    return this.inBounds(x, y) ? this.tiles[idx({ W: this.W }, x, y)] : Tl.WATER;
  }
  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
}

/* ============================== ГЕНЕРАТОР ПОСЕЛЕНИЙ ============================== */
enum Edge { North = 0, East = 1, South = 2, West = 3 }

interface GateDef { x: number; y: number; edge: Edge }
export interface HouseDef { x: number; y: number; w: number; h: number }
export interface VillageResult { 
  x0: number; y0: number; x1: number; y1: number; 
  gate: Vec; gateEdge: Edge; 
  houses: HouseDef[];
  // Возвращаем только позиции для жителей (статистов), но не более 3
  residentSpots: Vec[];
}

class VillageGenerator {
  private rng: () => number;
  private houseSizes = [
    { w: 2, h: 2 },
    { w: 2, h: 3 },
    { w: 3, h: 2 },
    { w: 3, h: 3 },
  ];

  constructor(rng: () => number) {
    this.rng = rng;
  }

  public generate(w: WorldData, cx: number, cy: number, rw: number, rh: number): VillageResult {
    // Матрица занятости
    const occupied: boolean[][] = [];
    for (let y = 0; y < rh; y++) {
      occupied[y] = new Array(rw).fill(false);
    }

    const isOccupied = (lx: number, ly: number): boolean => {
      if (lx < 0 || lx >= rw || ly < 0 || ly >= rh) return true;
      return occupied[ly][lx];
    };

    const isFree = (x: number, y: number): boolean => {
      const lx = x - cx, ly = y - cy;
      return !isOccupied(lx, ly);
    };

    const isFreeArea = (x: number, y: number, w: number, h: number, margin = 1): boolean => {
      for (let dy = -margin; dy < h + margin; dy++) {
        for (let dx = -margin; dx < w + margin; dx++) {
          const lx = (x + dx) - cx, ly = (y + dy) - cy;
          if (lx < 0 || lx >= rw || ly < 0 || ly >= rh) return false;
          if (occupied[ly][lx]) return false;
        }
      }
      return true;
    };

    const mark = (x: number, y: number) => {
      const lx = x - cx, ly = y - cy;
      if (lx >= 0 && lx < rw && ly >= 0 && ly < rh) {
        occupied[ly][lx] = true;
      }
    };

    const markArea = (x: number, y: number, w: number, h: number) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          mark(x + dx, y + dy);
        }
      }
    };

    // ШАГ 1: Ворота (2x2)
    const gate = this.placeGate(w, cx, cy, rw, rh);
    markArea(gate.x, gate.y, 2, 2);

    // ШАГ 2: Забор (периметр, кроме ворот)
    this.buildFence(w, cx, cy, rw, rh, gate, mark);

    // ШАГ 3: Дома
    const houses = this.placeHouses(w, cx, cy, rw, rh, gate, isFreeArea, markArea);

    // ШАГ 4: Дороги от домов к воротам
    this.buildRoads(w, houses, gate, cx, cy, rw, rh, isFree, mark);

    // ШАГ 5: Собираем свободные места для жителей (не более 3)
    const residentSpots = this.collectResidentSpots(w, cx, cy, rw, rh, isFree);

    const gateCenter: Vec = { x: gate.x + 1, y: gate.y + 1 };
    return { 
      x0: cx, y0: cy, x1: cx + rw, y1: cy + rh, 
      gate: gateCenter, gateEdge: gate.edge, 
      houses,
      residentSpots
    };
  }

  private placeGate(w: WorldData, cx: number, cy: number, rw: number, rh: number): GateDef {
    const edges: Edge[] = [Edge.North, Edge.East, Edge.South, Edge.West];
    const edge = edges[Math.floor(this.rng() * edges.length)];
    const gs = 2;

    let gx: number, gy: number;
    switch (edge) {
      case Edge.North:
        gx = cx + 1 + Math.floor(this.rng() * Math.max(1, rw - gs - 1));
        gy = cy;
        break;
      case Edge.South:
        gx = cx + 1 + Math.floor(this.rng() * Math.max(1, rw - gs - 1));
        gy = cy + rh - gs + 1;
        break;
      case Edge.West:
        gx = cx;
        gy = cy + 1 + Math.floor(this.rng() * Math.max(1, rh - gs - 1));
        break;
      case Edge.East:
        gx = cx + rw - gs + 1;
        gy = cy + 1 + Math.floor(this.rng() * Math.max(1, rh - gs - 1));
        break;
    }

    for (let dy = 0; dy < gs; dy++) {
      for (let dx = 0; dx < gs; dx++) {
        const tx = gx + dx, ty = gy + dy;
        if (inB(w, tx, ty)) setTile(w, tx, ty, Tl.VILLAGE);
      }
    }
    return { x: gx, y: gy, edge };
  }

  private buildFence(w: WorldData, cx: number, cy: number, rw: number, rh: number, gate: GateDef, mark: (x: number, y: number) => void): void {
    for (let y = cy; y <= cy + rh; y++) {
      for (let x = cx; x <= cx + rw; x++) {
        if (!inB(w, x, y)) continue;
        if (x >= gate.x && x < gate.x + 2 && y >= gate.y && y < gate.y + 2) continue;
        const isBorder = (x === cx || x === cx + rw || y === cy || y === cy + rh);
        if (isBorder) {
          setTile(w, x, y, Tl.PALISADE);
          mark(x, y);
        } else {
          setTile(w, x, y, Tl.VILLAGE);
        }
      }
    }
  }

  private placeHouses(
    w: WorldData, cx: number, cy: number, rw: number, rh: number,
    gate: GateDef,
    isFreeArea: (x: number, y: number, w: number, h: number, margin?: number) => boolean,
    markArea: (x: number, y: number, w: number, h: number) => void
  ): HouseDef[] {
    const houses: HouseDef[] = [];
    let mainHousePlaced = false;
    
    let freeVillage = 0;
    for (let y = cy; y < cy + rh; y++) {
      for (let x = cx; x < cx + rw; x++) {
        if (w.tiles[y * w.W + x] === Tl.VILLAGE) freeVillage++;
      }
    }

    const targetArea = Math.floor(freeVillage * 0.35);
    let occupiedArea = 0;
    let attempts = 0;
    const maxAttempts = 5000;

    while (occupiedArea < targetArea && attempts < maxAttempts) {
      attempts++;
      
      let sizeIndex = Math.floor(this.rng() * this.houseSizes.length);
      let size = this.houseSizes[sizeIndex];
      
      if (size.w === 3 && size.h === 3 && mainHousePlaced) {
        let found = false;
        for (let i = 0; i < this.houseSizes.length; i++) {
          const s = this.houseSizes[i];
          if (s.w !== 3 || s.h !== 3) {
            size = s;
            found = true;
            break;
          }
        }
        if (!found) continue;
      }

      const hx = cx + 1 + Math.floor(this.rng() * (rw - size.w - 2));
      const hy = cy + 1 + Math.floor(this.rng() * (rh - size.h - 2));

      if (!isFreeArea(hx, hy, size.w, size.h, 1)) continue;

      const gateDist = Math.max(
        Math.abs(hx + size.w/2 - (gate.x + 1)),
        Math.abs(hy + size.h/2 - (gate.y + 1))
      );
      if (gateDist < 4) continue;

      for (let dy = 0; dy < size.h; dy++) {
        for (let dx = 0; dx < size.w; dx++) {
          setTile(w, hx + dx, hy + dy, Tl.HOUSE);
        }
      }
      markArea(hx, hy, size.w, size.h);
      
      if (size.w === 3 && size.h === 3) mainHousePlaced = true;
      houses.push({ x: hx, y: hy, w: size.w, h: size.h });
      occupiedArea += size.w * size.h;
    }
    return houses;
  }

  private buildRoads(
    w: WorldData, houses: HouseDef[], gate: GateDef,
    cx: number, cy: number, rw: number, rh: number,
    isFree: (x: number, y: number) => boolean,
    mark: (x: number, y: number) => void
  ): void {
    const gateCX = gate.x + 1;
    const gateCY = gate.y + 1;

    for (const house of houses) {
      const startX = house.x + Math.floor(house.w / 2);
      const startY = house.y + Math.floor(house.h / 2);
      
      let path: Vec[] = [];
      let curX = startX;
      let curY = startY;
      
      // Вертикальная часть
      const stepY = curY < gateCY ? 1 : -1;
      let hitRoad = false;
      
      while (curY !== gateCY && !hitRoad) {
        const nextY = curY + stepY;
        if (nextY < cy || nextY >= cy + rh) break;
        
        if (isFree(curX, nextY)) {
          const tile = w.tiles[nextY * w.W + curX];
          if (tile === Tl.PALISADE || tile === Tl.HOUSE || tile === Tl.WATER) break;
          if (tile === Tl.PATH) { hitRoad = true; break; }
          path.push({ x: curX, y: nextY });
          curY = nextY;
        } else {
          const tile = w.tiles[nextY * w.W + curX];
          if (tile === Tl.PATH) { hitRoad = true; }
          break;
        }
      }

      // Горизонтальная часть, если не дошли до ворот и не уперлись в дорогу
      if (curY !== gateCY && !hitRoad && path.length > 0) {
        const last = path[path.length - 1];
        curX = last.x;
        curY = last.y;
        
        const stepX = curX < gateCX ? 1 : -1;
        while (curX !== gateCX && !hitRoad) {
          const nextX = curX + stepX;
          if (nextX < cx || nextX >= cx + rw) break;
          
          if (isFree(nextX, curY)) {
            const tile = w.tiles[curY * w.W + nextX];
            if (tile === Tl.PALISADE || tile === Tl.HOUSE || tile === Tl.WATER) break;
            if (tile === Tl.PATH) { hitRoad = true; break; }
            path.push({ x: nextX, y: curY });
            curX = nextX;
          } else {
            const tile = w.tiles[curY * w.W + nextX];
            if (tile === Tl.PATH) { hitRoad = true; }
            break;
          }
        }
      }

      // Если дорога не дошла до ворот и не уперлась в дорогу, обрезаем
      if (!hitRoad && (curX !== gateCX || curY !== gateCY)) {
        const dist = Math.abs(curX - gateCX) + Math.abs(curY - gateCY);
        if (dist > 2 && path.length > 0) {
          const last = path[path.length - 1];
          const lastDist = Math.abs(last.x - gateCX) + Math.abs(last.y - gateCY);
          if (lastDist > 3) path.pop();
        }
      }

      // Размещаем дорогу
      for (const p of path) {
        if (isFree(p.x, p.y)) {
          const tile = w.tiles[p.y * w.W + p.x];
          if (tile !== Tl.PALISADE && tile !== Tl.HOUSE && tile !== Tl.WATER) {
            setTile(w, p.x, p.y, Tl.PATH);
            mark(p.x, p.y);
          }
        }
      }
    }
  }

  private collectResidentSpots(
    w: WorldData, cx: number, cy: number, rw: number, rh: number,
    isFree: (x: number, y: number) => boolean
  ): Vec[] {
    // Собираем все свободные клетки (VILLAGE или PATH) внутри деревни
    const candidates: Vec[] = [];
    for (let y = cy + 1; y < cy + rh; y++) {
      for (let x = cx + 1; x < cx + rw; x++) {
        if (!inB(w, x, y)) continue;
        const tile = w.tiles[y * w.W + x];
        if ((tile === Tl.VILLAGE || tile === Tl.PATH) && isFree(x, y)) {
          candidates.push({ x, y });
        }
      }
    }

    // Перемешиваем
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Сортируем: сначала те, у кого есть сосед-дорога
    const hasRoadNeighbor = (pos: Vec): boolean => {
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = pos.x + dx, ny = pos.y + dy;
        if (!inB(w, nx, ny)) continue;
        if (w.tiles[ny * w.W + nx] === Tl.PATH) return true;
      }
      return false;
    };

    const withRoad = candidates.filter(p => hasRoadNeighbor(p));
    const withoutRoad = candidates.filter(p => !hasRoadNeighbor(p));
    const sorted = [...withRoad, ...withoutRoad];

    // Берём максимум 3 места
    const count = Math.min(3, sorted.length);
    return sorted.slice(0, count);
  }
}

/* ============================== ГЕНЕРАТОР ГЛОБАЛЬНЫХ ДОРОГ ============================== */
class GlobalRoadGenerator {
  private rng: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  public buildRoad(w: WorldData, from: Vec, to: Vec): void {
    const { W, H } = w;
    const cost = (x: number, y: number): number => {
      const t = w.tiles[idx(w, x, y)];
      if (SOLID.has(t) && t !== Tl.PALISADE) return Infinity;
      switch (t) {
        case Tl.WATER: case Tl.PALISADE: case Tl.HOUSE: return Infinity;
        case Tl.PATH: return 0.35;
        case Tl.SNOW: case Tl.SNOW2: return 1;
        case Tl.FOREST: return 2.4;
        case Tl.MTN: return 2.8;
        case Tl.SWAMP: return 3.4;
        case Tl.POOL: return 4;
        case Tl.RUINS: return 1.9;
        case Tl.SHORE: return 1.4;
        case Tl.VILLAGE: case Tl.STAIRS: case Tl.ALTAR: return 1;
        default: return 1.2;
      }
    };

    const sx = clampi(from.x, 1, W - 2), sy = clampi(from.y, 1, H - 2);
    const gx = clampi(to.x, 1, W - 2), gy = clampi(to.y, 1, H - 2);
    const N = W * H;
    const g = new Float64Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const h = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);
    const open: { i: number; f: number }[] = [{ i: sy * W + sx, f: h(sx, sy) }];
    g[sy * W + sx] = 0;
    let found = false, iter = 0;

    while (open.length && iter++ < 14000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
      const cur = open.splice(bi, 1)[0].i;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cy = Math.floor(cur / W);
      if (cx === gx && cy === gy) { found = true; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (closed[ni]) continue;
        const c = cost(nx, ny);
        if (c === Infinity) continue;
        const ng = g[cur] + c;
        if (ng < g[ni]) {
          g[ni] = ng; came[ni] = cur;
          open.push({ i: ni, f: ng + h(nx, ny) });
        }
      }
    }

    if (!found) {
      this.carvePath(w, sx, sy, gx, gy);
      return;
    }

    const path: number[] = [];
    let c = gy * W + gx;
    while (c !== -1) { path.push(c); c = came[c]; }
    for (const i of path) {
      const x = i % W, y = Math.floor(i / W);
      const t = w.tiles[i];
      if (t !== Tl.WATER && t !== Tl.PALISADE && t !== Tl.HOUSE && t !== Tl.STAIRS && t !== Tl.ALTAR) {
        setTile(w, x, y, Tl.PATH);
      }
    }
  }

  private carvePath(w: WorldData, x0: number, y0: number, x1: number, y1: number): void {
    const put = (x: number, y: number) => {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (!inB(w, xx, yy)) continue;
        const cur = w.tiles[idx(w, xx, yy)];
        if (cur === Tl.WATER || cur === Tl.PALISADE || cur === Tl.HOUSE) continue;
        setTile(w, xx, yy, Tl.PATH);
      }
    };
    const horizFirst = this.rng() < 0.5;
    if (horizFirst) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y0);
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(x1, y);
    } else {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(x0, y);
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y1);
    }
  }
}

/* ============================== ГЕНЕРАТОР МИРА ============================== */
export function generateOverworld(seed: number): WorldData {
  const rng = mulberry(seed);
  const W = 200, H = 140;

  // 1. Остров
  const islandGen = new IslandGenerator(seed);
  const { w: baseWorld, cx, cy, R1, R2, ruinsC } = islandGen.generate();
  const w = baseWorld;

  // 2. Поселения
  const villageGen = new VillageGenerator(rng);
  const vA = villageGen.generate(w, 92 + Math.floor(rng() * 5), 96, 15, 12);
  const vB = villageGen.generate(w, 146 + Math.floor(rng() * 4), 58, 13, 11);
  const vR = villageGen.generate(w, 38 + Math.floor(rng() * 4), 56, 11, 9);
  
  // Разрушаем сожжённую деревню
  for (let y = vR.y0; y <= vR.y1; y++) {
    for (let x = vR.x0; x <= vR.x1; x++) {
      if (!inB(w, x, y)) continue;
      const t = w.tiles[y * w.W + x];
      if (t === Tl.HOUSE && rng() < 0.5) {
        setTile(w, x, y, rng() < 0.5 ? Tl.COLUMN : Tl.RUINS);
      }
      if (t === Tl.PALISADE && rng() < 0.4) {
        setTile(w, x, y, rng() < 0.5 ? Tl.COLUMN : Tl.RUINS);
      }
    }
  }

  w.villageA = vA.gate;
  w.villageB = vB.gate;
  w.ruinedVillage = { x: vR.x0 + 5, y: vR.y0 + 4 };

  // 3. Глобальные дороги
  const roadGen = new GlobalRoadGenerator(rng);
  const gate = vA.gate;

  const treeAltar = { x: 100, y: 24 };
  clearAround(w, treeAltar.x, treeAltar.y + 3, 6, Tl.SNOW2);
  setTile(w, treeAltar.x, treeAltar.y, Tl.ALTAR);
  w.treeAltar = treeAltar;
  w.arena = { x: treeAltar.x * T + 8, y: (treeAltar.y + 3) * T + 8, r: 84 };
  w.snakeSpot = { x: treeAltar.x * T + 8, y: (treeAltar.y + 2) * T };

  const dungeonEntries: { x: number; y: number; id: number; name: string }[] = [];
  const mkEntry = (fx: number, fy: number, pref: number, id: number, name: string) => {
    const p = findFree(w, fx, fy, 9, pref, rng);
    setTile(w, p.x, p.y, Tl.STAIRS);
    clearAround(w, p.x, p.y, 1);
    dungeonEntries.push({ x: p.x, y: p.y, id, name });
    return p;
  };
  mkEntry(cx + 6, cy + 2, Tl.MTN, 2, "Каменная Крепость");
  mkEntry(cx - R1 - 10, cy + 6, Tl.FOREST, 1, "Корень Иггдрасиля");
  mkEntry(ruinsC.x, ruinsC.y, Tl.RUINS, 0, "Склеп Хранителя");
  w.dungeonEntries = dungeonEntries;

  roadGen.buildRoad(w, gate, vB.gate);
  roadGen.buildRoad(w, gate, { x: treeAltar.x, y: treeAltar.y + 8 });
  for (const e of dungeonEntries) roadGen.buildRoad(w, gate, { x: e.x, y: e.y });
  roadGen.buildRoad(w, gate, { x: vR.gate.x, y: vR.gate.y });
  roadGen.buildRoad(w, gate, { x: ruinsC.x, y: ruinsC.y });

  // 4. NPC и жители — распределение по локациям (task_01.md)
  const allNpcs: NpcDef[] = [];

  // Вспомогательная: добавить NPC и очистить вокруг
  const addNpc = (id: string, name: string, x: number, y: number) => {
    allNpcs.push({ id, name, x, y });
    clearAround(w, x, y, 1);
  };

  // --- Поселение выживших (vA) ---
  // Эйрик Старший — центральная площадь
  {
    const cx = Math.round((vA.x0 + vA.x1) / 2);
    const cy = Math.round((vA.y0 + vA.y1) / 2);
    const p = findWalkableNear(w, cx, cy, 4, rng);
    addNpc("eirik", "Эйрик Старший", p.x, p.y);
  }

  // Астрид — восточная часть (у дома с травами)
  {
    const ex = vA.x1 - 3;
    const ey = Math.round((vA.y0 + vA.y1) / 2);
    const p = findWalkableNear(w, ex, ey, 3, rng);
    addNpc("astrid", "Астрид", p.x, p.y);
  }

  // Харальд — южная окраина (у кузницы/горна)
  {
    const hx = Math.round((vA.x0 + vA.x1) / 2);
    const hy = vA.y1 - 2;
    const p = findWalkableNear(w, hx, hy, 3, rng);
    addNpc("harald", "Харальд", p.x, p.y);
  }

  // --- Воронья Гавань (vB) ---
  // Сигрид — у северных ворот
  {
    const sx = Math.round((vB.x0 + vB.x1) / 2);
    const sy = vB.y0 + 2;
    const p = findWalkableNear(w, sx, sy, 3, rng);
    addNpc("sigrid", "Сигрид", p.x, p.y);
  }

  // Бранд — западная стена, ближе к лесу
  {
    const bx = vB.x0 + 2;
    const by = Math.round((vB.y0 + vB.y1) / 2);
    const p = findWalkableNear(w, bx, by, 3, rng);
    addNpc("brand", "Бранд", p.x, p.y);
  }

  // --- Сожжённая Деревня (vR) ---
  // Беженка Гюнн — у входа в руины
  {
    const rx = vR.x0 + Math.round((vR.x1 - vR.x0) / 2);
    const ry = vR.y0 + 2;
    const p = findWalkableNear(w, rx, ry, 3, rng);
    addNpc("refugee", "Беженка Гюнн", p.x, p.y);
  }

  // --- Мёртвый Лес ---
  // Шаман Ульв — поляна в центре лесной зоны (за пределами R1)
  {
    const forestCX = Math.round(cx - R1 - 14);
    const forestCY = Math.round(cy - 14);
    const p = findWalkableNear(w, forestCX, forestCY, 8, rng);
    addNpc("shaman", "Шаман Ульв", p.x, p.y);
  }

  // --- Перекрёсток дорог между vA и vB ---
  // Торговец Фьолнир — примерно на полпути
  {
    const midX = Math.round((vA.gate.x + vB.gate.x) / 2);
    const midY = Math.round((vA.gate.y + vB.gate.y) / 2);
    const p = findWalkableNear(w, midX, midY, 6, rng);
    addNpc("merchant", "Торговец Фьолнир", p.x, p.y);
  }

  // --- Корни Иггдрасиля ---
  // Безымянная Дочь — у подножия алтаря (рядом с деревом)
  {
    const dtx = treeAltar.x;
    const dty = treeAltar.y + 4;
    const p = findWalkableNear(w, dtx, dty, 4, rng);
    addNpc("daughter", "Безымянная Дочь", p.x, p.y);
  }

  // --- Руины Времени ---
  // Ворон-Говорун — на вершине разрушенной колонны (рядом с ruinsC)
  {
    const rtx = ruinsC.x;
    const rty = ruinsC.y - 3;
    const p = findWalkableNear(w, rtx, rty, 6, rng);
    addNpc("raven", "Ворон-Говорун", p.x, p.y);
  }

  // --- Статисты (жители) ---
  // 3 статиста из vA
  for (let i = 0; i < Math.min(3, vA.residentSpots.length); i++) {
    const pos = vA.residentSpots[i];
    allNpcs.push({
      id: `villager_A_${i}`,
      name: "Поселенец",
      x: pos.x,
      y: pos.y
    });
  }

  // 3 статиста из vB
  for (let i = 0; i < Math.min(3, vB.residentSpots.length); i++) {
    const pos = vB.residentSpots[i];
    allNpcs.push({
      id: `villager_B_${i}`,
      name: "Поселенец",
      x: pos.x,
      y: pos.y
    });
  }

  w.npcs = allNpcs;

  // Остальные элементы (святилища, сундуки, души и т.д.)
  const midRoad = { x: Math.round((vA.gate.x + vB.gate.x) / 2), y: Math.round((vA.gate.y + vB.gate.y) / 2) };
  w.bundleSpot = findFree(w, midRoad.x, midRoad.y, 4, undefined, rng);

  const shrineSpots: Vec[] = [
    { x: vA.x0 - 3, y: vA.y1 - 2 },
    findFree(w, cx - R1 - 8, cy - 10, 6, undefined, rng),
    findFree(w, cx + R1 + 8, cy - 6, 6, undefined, rng),
    { x: vB.x0 - 3, y: vB.y1 },
  ];
  for (const s of shrineSpots) {
    clearAround(w, s.x, s.y, 1);
    w.shrines.push({ x: s.x, y: s.y });
  }

  w.bearSpot = findFree(w, cx + R2 + 6, cy + 14, 8, Tl.SWAMP, rng);
  setTile(w, w.bearSpot.x, w.bearSpot.y, Tl.POOL);
  w.hornSpot = findFree(w, cx + 10, cy - 8, 9, Tl.MTN, rng);
  w.meadSpot = findFree(w, cx - R1 - 14, cy - 6, 9, Tl.FOREST, rng);
  w.oreSpot = findFree(w, cx - 8, cy + 8, 9, Tl.MTN, rng);
  w.mossSpot = findFree(w, cx + R2 + 4, cy + 4, 8, Tl.SWAMP, rng);
  w.amberSpot = findFree(w, cx + 14, cy + 8, 9, Tl.MTN, rng);
  w.flowerSpot = findFree(w, ruinsC.x + 6, ruinsC.y - 4, 8, Tl.RUINS, rng);
  w.diarySpot = { x: vR.x0 + 2 + Math.floor(rng() * 6), y: vR.y0 + 2 + Math.floor(rng() * 4) };
  setTile(w, w.diarySpot.x, w.diarySpot.y, Tl.RUINS);
  w.relicSpot = findFree(w, 44, 50, 9, undefined, rng);
  w.oldAltar = findFree(w, w.relicSpot.x + 7, w.relicSpot.y + 3, 5, undefined, rng);
  setTile(w, w.oldAltar.x, w.oldAltar.y, Tl.ALTAR);
  clearAround(w, w.oldAltar.x, w.oldAltar.y, 1);
  w.stashSpot = findFree(w, ruinsC.x - 4, ruinsC.y + 5, 6, undefined, rng);

  // Сундуки
  const bowSpot = findFree(w, cx - R1 - 8, cy + 12, 9, Tl.FOREST, rng);
  const arrowsSpot = findFree(w, cx + 6, cy - 12, 9, Tl.MTN, rng);
  const heartSpot = findFree(w, cx + R2 + 8, cy + 2, 9, undefined, rng);
  w.chests = [
    { x: bowSpot.x, y: bowSpot.y, item: "bow" },
    { x: arrowsSpot.x, y: arrowsSpot.y, item: "arrows" },
    { x: heartSpot.x, y: heartSpot.y, item: "heartPiece" },
  ];

  // Души
  const soulSpots = [
    findFree(w, cx - R2 - 6, cy + 12, 5, undefined, rng),
    findFree(w, cx + R2 + 10, cy - 10, 5, undefined, rng),
    { x: ruinsC.x - 8, y: ruinsC.y - 6 },
  ];
  w.souls = soulSpots;

  // Колонны в руинах
  for (let i = 0; i < 10; i++) {
    const p = findFree(w, ruinsC.x, ruinsC.y, 8, Tl.RUINS, rng);
    setTile(w, p.x, p.y, Tl.COLUMN);
  }

  // Пьедесталы
  const guardPool: EnemyKind[][] = [
    ["draugr", "raven"], ["varg", "varg"], ["draugr", "shroom"],
    ["frost", "raven"], ["draugr", "draugr", "crawler"],
  ];
  const pedestalCenters = [
    { x: cx - R1 - 12, y: cy + 8 },
    { x: cx + 12, y: cy - 10 },
    { x: cx + R2 + 5, y: cy + 7 },
    { x: ruinsC.x + 5, y: ruinsC.y + 3 },
    { x: cx - R2 - 8, y: cy - 7 },
  ];
  pedestalCenters.forEach((c, i) => {
    const p = findFree(w, c.x, c.y, 6, undefined, rng);
    clearAround(w, p.x, p.y, 2);
    w.pedestals.push({ x: p.x, y: p.y, guards: guardPool[i] });
  });

  // Украшения
  const n3 = new NoiseGenerator(rng() * 100000 | 0);
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = idx(w, x, y);
      const t = w.tiles[i];
      const v = n3.value(x * 0.16, y * 0.16);
      if (t === Tl.FOREST) { if (v > 0.5) setTile(w, x, y, Tl.TREE); }
      else if (t === Tl.MTN) { if (v > 0.56) setTile(w, x, y, Tl.ROCK); }
      else if (t === Tl.SWAMP) { if (v > 0.66) setTile(w, x, y, Tl.POOL); }
      else if (t === Tl.SNOW) {
        if (v > 0.74) setTile(w, x, y, Tl.TREE);
        else if (v < 0.24) setTile(w, x, y, Tl.SNOW2);
      } else if (t === Tl.RUINS) { if (v > 0.76) setTile(w, x, y, Tl.COLUMN); }
    }
  }

  // Чистка
  for (const n of w.npcs) clearAround(w, n.x, n.y, 1);
  for (const c of w.chests) clearAround(w, c.x, c.y, 1);
  for (const p of w.pedestals) clearAround(w, p.x, p.y, 1);
  for (const e of w.dungeonEntries) clearAround(w, e.x, e.y, 1);
  for (const s of w.shrines) clearAround(w, s.x, s.y, 1);
  for (const s of w.souls) clearAround(w, s.x, s.y, 1);
  for (const a of w.ambient) clearAround(w, a.x, a.y, 0);
  clearAround(w, treeAltar.x, treeAltar.y + 3, 5, Tl.SNOW2);
  setTile(w, treeAltar.x, treeAltar.y, Tl.ALTAR);
  clearAround(w, w.oldAltar.x, w.oldAltar.y, 1);
  setTile(w, w.oldAltar.x, w.oldAltar.y, Tl.ALTAR);

  // Враги
  const kindsFor = (t: number, d: number): EnemyKind[] => {
    if (d < R1 + 2) return ["frost", "varg", "frost"];
    switch (t) {
      case Tl.FOREST: return ["shroom", "raven", "draugr"];
      case Tl.MTN: return ["frost", "varg", "draugr"];
      case Tl.SWAMP: return ["crawler", "draugr", "crawler"];
      case Tl.RUINS: return ["draugr", "frost", "crawler"];
      default: return ["varg", "raven", "draugr"];
    }
  };
  
  const noSpawnZones = [
    { x0: vA.x0 - 8, y0: vA.y0 - 8, x1: vA.x1 + 8, y1: vA.y1 + 8 },
    { x0: vB.x0 - 8, y0: vB.y0 - 8, x1: vB.x1 + 8, y1: vB.y1 + 8 },
    { x0: vR.x0 - 6, y0: vR.y0 - 6, x1: vR.x1 + 6, y1: vR.y1 + 6 },
  ];
  
  const isInNoSpawnZone = (x: number, y: number): boolean => {
    for (const z of noSpawnZones) {
      if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return true;
    }
    return false;
  };
  
  const pois = [
    gate, vB.gate, treeAltar,
    ...w.dungeonEntries.map((e) => ({ x: e.x, y: e.y })),
    ...w.shrines, ...w.npcs, ...w.chests.map((c) => ({ x: c.x, y: c.y })),
    ...w.pedestals.map((p) => ({ x: p.x, y: p.y })),
  ];
  let placed = 0;
  for (let tries = 0; tries < 4000 && placed < 84; tries++) {
    const x = 3 + Math.floor(rng() * (W - 6));
    const y = 3 + Math.floor(rng() * (H - 6));
    const t = w.tiles[idx(w, x, y)];
    if (SOLID.has(t) || t === Tl.PATH || t === Tl.POOL || t === Tl.VILLAGE || t === Tl.WATER || t === Tl.SHORE) continue;
    if (isInNoSpawnZone(x, y)) continue;
    if (Math.hypot(gate.x - x, gate.y + 2 - y) < 40) continue;
    if (pois.some((p) => Math.hypot(p.x - x, p.y - y) < 8)) continue;
    const d = Math.hypot((x - cx) * 0.92, y - cy);
    const kinds = kindsFor(t, d);
    w.spawns.push({ kind: kinds[Math.floor(rng() * kinds.length)], x: x * T + 8, y: y * T + 8 });
    placed++;
  }
  for (let i = 0; i < 3; i++) {
    const x = vR.x0 + 2 + Math.floor(rng() * (vR.x1 - vR.x0 - 4));
    const y = vR.y0 + 2 + Math.floor(rng() * (vR.y1 - vR.y0 - 4));
    if (!SOLID.has(tileAt(w, x, y))) w.spawns.push({ kind: i === 2 ? "crawler" : "draugr", x: x * T + 8, y: y * T + 8 });
  }

  // Связность
  const reach = floodReach(w, gate.x, gate.y - 1);
  const ensure = (p: Vec) => {
    if (!inB(w, p.x, p.y) || !reach[idx(w, p.x, p.y)]) roadGen.buildRoad(w, gate, p);
  };
  for (const e of w.dungeonEntries) ensure(e);
  ensure({ x: treeAltar.x, y: treeAltar.y + 8 });
  ensure(vB.gate);
  ensure({ x: vR.x0 + 5, y: vR.y1 + 1 });
  for (const s of w.shrines) ensure(s);
  for (const c of w.chests) ensure(c);
  for (const p of w.pedestals) ensure(p);
  for (const n of w.npcs) ensure(n);
  for (const s of w.souls) ensure(s);
  for (const p of [w.bearSpot, w.hornSpot, w.meadSpot, w.oreSpot, w.mossSpot,
    w.amberSpot, w.flowerSpot, w.diarySpot, w.bundleSpot, w.relicSpot, w.oldAltar, w.stashSpot]) {
    ensure(p);
  }

  // Зоны
  w.zones = [
    { x: vA.x0, y: vA.y0, w: vA.x1 - vA.x0, h: vA.y1 - vA.y0, name: "Поселение выживших" },
    { x: vB.x0, y: vB.y0, w: vB.x1 - vB.x0, h: vB.y1 - vB.y0, name: "Воронья Гавань" },
    { x: vR.x0, y: vR.y0, w: vR.x1 - vR.x0, h: vR.y1 - vR.y0, name: "Сожжённая Деревня" },
    { x: treeAltar.x - 8, y: treeAltar.y - 3, w: 17, h: 17, name: "Корни Иггдрасиля" },
    { x: Math.round(cx - R1 - 20), y: Math.round(cy - 20), w: 40, h: 40, name: "Мёртвый Лес" },
    { x: Math.round(cx - 24), y: Math.round(cy - 22), w: 48, h: 44, name: "Хребет Нидов" },
    { x: Math.round(cx + R1 - 4), y: Math.round(cy - 10), w: 44, h: 44, name: "Замерзшие Топи" },
    { x: ruinsC.x - 14, y: ruinsC.y - 12, w: 28, h: 24, name: "Руины Времени" },
  ];

  // Стартовая позиция — рядом с Эйриком Старшим (главный наставник в vA)
  const eirikNpc = w.npcs.find((n) => n.id === "eirik");
  if (eirikNpc) {
    // Спавним на 2 клетки "перед" Эйриком (в сторону ворот, чтобы игрок выходил к нему)
    const spawnTileNearEirik: Vec = { x: eirikNpc.x, y: eirikNpc.y };
    // Ищем свободную клетку рядом с Эйриком
    const spawnSpot = findWalkableNear(w, spawnTileNearEirik.x, spawnTileNearEirik.y, 2, rng);
    // Убедимся, что спавн не совпадает с Эйриком
    if (spawnSpot.x === eirikNpc.x && spawnSpot.y === eirikNpc.y) {
      // Пробуем сдвинуться в сторону центра деревни
      spawnSpot.x = Math.round((vA.x0 + vA.x1) / 2);
      spawnSpot.y = eirikNpc.y + 2;
      const alt = findWalkableNear(w, spawnSpot.x, spawnSpot.y, 2, rng);
      spawnSpot.x = alt.x;
      spawnSpot.y = alt.y;
    }
    w.spawn = px(spawnSpot.x, spawnSpot.y);
  } else {
    // Фоллбэк: старые ворота
    const spawnTile: Vec = { x: 0, y: 0 };
    switch (vA.gateEdge) {
      case Edge.South: spawnTile.x = gate.x + 1; spawnTile.y = gate.y - 2; break;
      case Edge.North: spawnTile.x = gate.x + 1; spawnTile.y = gate.y + 2; break;
      case Edge.West: spawnTile.x = gate.x + 2; spawnTile.y = gate.y + 1; break;
      case Edge.East: spawnTile.x = gate.x - 2; spawnTile.y = gate.y + 1; break;
    }
    w.spawn = px(spawnTile.x, spawnTile.y);
  }

  const navBuilder = new NavBuilder();
  w.nav = navBuilder.build(w);

  return w;
}

/* ============================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============================== */

/** Найти проходимую клетку (VILLAGE/PATH/FOREST/SNOW и т.д.) рядом с ориентиром.
  * Предпочитает VILLAGE и PATH, избегает твёрдых тайлов. */
function findWalkableNear(w: WorldData, fx: number, fy: number, r: number, rng: () => number): Vec {
  const walkable = (t: number) => !SOLID.has(t) && t !== Tl.WATER && t !== Tl.POOL;
  const villagePref = (t: number) => t === Tl.VILLAGE || t === Tl.PATH;
  // Сначала пытаемся найти VILLAGE/PATH рядом
  for (let tries = 0; tries < 300; tries++) {
    const x = Math.round(fx + (rng() * 2 - 1) * r);
    const y = Math.round(fy + (rng() * 2 - 1) * r);
    if (!inB(w, x, y)) continue;
    const t = w.tiles[idx(w, x, y)];
    if (!walkable(t)) continue;
    if (villagePref(t)) return { x, y };
  }
  // Затем любая проходимая
  for (let tries = 0; tries < 300; tries++) {
    const x = Math.round(fx + (rng() * 2 - 1) * r);
    const y = Math.round(fy + (rng() * 2 - 1) * r);
    if (!inB(w, x, y)) continue;
    const t = w.tiles[idx(w, x, y)];
    if (walkable(t)) return { x, y };
  }
  // Фоллбэк: расширяем радиус
  for (let rad = 1; rad < 90; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = Math.round(fx) + dx, y = Math.round(fy) + dy;
        if (!inB(w, x, y)) continue;
        const t = w.tiles[idx(w, x, y)];
        if (walkable(t)) return { x, y };
      }
    }
  }
  return { x: clampi(Math.round(fx), 2, w.W - 3), y: clampi(Math.round(fy), 2, w.H - 3) };
}

function clearAround(w: WorldData, cx: number, cy: number, r: number, floor?: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inB(w, x, y)) continue;
      const cur = w.tiles[idx(w, x, y)];
      if (cur === Tl.WATER || cur === Tl.PALISADE || cur === Tl.HOUSE) continue;
      if (isSolidTileId(cur)) setTile(w, x, y, floor !== undefined ? floor : Tl.SNOW);
    }
  }
}

function findFree(w: WorldData, fx: number, fy: number, r: number, pref: number | undefined, rng: () => number): Vec {
  const landT = (t: number) => !SOLID.has(t) && t !== Tl.WATER && t !== Tl.POOL && t !== Tl.PATH && t !== Tl.VILLAGE;
  for (let tries = 0; tries < 400; tries++) {
    const x = Math.round(fx + (rng() * 2 - 1) * r);
    const y = Math.round(fy + (rng() * 2 - 1) * r);
    if (!inB(w, x, y)) continue;
    const t = w.tiles[idx(w, x, y)];
    if (!landT(t)) continue;
    if (pref !== undefined && t !== pref && tries < 300) continue;
    return { x, y };
  }
  for (let rad = 1; rad < 90; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = Math.round(fx) + dx, y = Math.round(fy) + dy;
        if (!inB(w, x, y)) continue;
        const t = w.tiles[idx(w, x, y)];
        if (landT(t) && (pref === undefined || t === pref)) return { x, y };
      }
    }
  }
  return { x: clampi(Math.round(fx), 2, w.W - 3), y: clampi(Math.round(fy), 2, w.H - 3) };
}

function floodReach(w: WorldData, sx: number, sy: number): Uint8Array {
  const reach = new Uint8Array(w.W * w.H);
  const q: number[] = [sy * w.W + sx];
  reach[q[0]] = 1;
  while (q.length) {
    const c = q.pop()!;
    const x = c % w.W, y = Math.floor(c / w.W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inB(w, nx, ny)) continue;
      const ni = ny * w.W + nx;
      if (reach[ni] || SOLID.has(w.tiles[ni])) continue;
      reach[ni] = 1; q.push(ni);
    }
  }
  return reach;
}

export function zoneFor(w: WorldData, tx: number, ty: number): string {
  if (w.isDungeon) return w.dungeonName;
  for (const z of w.zones) {
    if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) return z.name;
  }
  const t = tileAt(w, tx, ty);
  switch (t) {
    case Tl.VILLAGE: case Tl.PALISADE: case Tl.HOUSE: return "Поселение";
    case Tl.MTN: case Tl.ROCK: return "Хребет Нидов";
    case Tl.SWAMP: case Tl.POOL: return "Замерзшие Топи";
    case Tl.RUINS: case Tl.COLUMN: case Tl.STAIRS: return "Руины Времени";
    case Tl.FOREST: case Tl.TREE: return "Мёртвый Лес";
    default: return "Мёрзлая пустошь";
  }
}

/* ============================== ДАНЖЕНЫ ============================== */
export interface DungeonCfg {
  id: number;
  name: string;
  boss: EnemyKind;
  bossReward: BossReward;
  pool: EnemyKind[];
}

function baseDungeon(cfg: DungeonCfg, W: number, H: number, exitSpot: Vec): WorldData {
  return {
    W, H, tiles: new Uint8Array(W * H).fill(Tl.DWALL), nav: null as unknown as NavMesh,
    isDungeon: true, dungeonId: cfg.id, dungeonName: cfg.name, bossReward: cfg.bossReward,
    spawn: { x: 0, y: 0 }, zones: [], shrines: [], npcs: [], chests: [],
    pedestals: [], spawns: [], doors: [], souls: [], ambient: [], dungeonEntries: [],
    exitSpot, hornSpot: { x: 0, y: 0 }, meadSpot: { x: 0, y: 0 }, oreSpot: { x: 0, y: 0 },
    bearSpot: { x: 0, y: 0 }, mossSpot: { x: 0, y: 0 }, amberSpot: { x: 0, y: 0 },
    flowerSpot: { x: 0, y: 0 }, diarySpot: { x: 0, y: 0 }, bundleSpot: { x: 0, y: 0 },
    relicSpot: { x: 0, y: 0 }, oldAltar: { x: 0, y: 0 }, stashSpot: { x: 0, y: 0 },
    ruinedVillage: { x: 0, y: 0 }, treeAltar: { x: 0, y: 0 }, arena: { x: 0, y: 0, r: 0 },
    snakeSpot: { x: 0, y: 0 }, villageA: { x: 0, y: 0 }, villageB: { x: 0, y: 0 },
    bossRoom: { x: 0, y: 0, w: 0, h: 0 }, bossSpot: { x: 0, y: 0 }, entryStairs: { x: 0, y: 0 },
  };
}

function finalizeDungeon(w: WorldData, rng: () => number, cfg: DungeonCfg, pool: EnemyKind[]) {
  const br = w.bossRoom;
  const bx = Math.floor(br.x / T), by = Math.floor(br.y / T);
  const bw = Math.floor(br.w / T), bh = Math.floor(br.h / T);
  const doorCandidates: Vec[] = [];
  for (let x = bx; x < bx + bw; x++) {
    for (const [y, dy] of [[by - 1, -1], [by + bh, 1]] as [number, number][]) {
      if (tileAt(w, x, y) === Tl.DFLOOR && tileAt(w, x, y + dy) !== Tl.DFLOOR) doorCandidates.push(px(x, y));
    }
  }
  for (let y = by; y < by + bh; y++) {
    for (const [x, dx] of [[bx - 1, -1], [bx + bw, 1]] as [number, number][]) {
      if (tileAt(w, x, y) === Tl.DFLOOR && tileAt(w, x + dx, y) !== Tl.DFLOOR) doorCandidates.push(px(x, y));
    }
  }
  doorCandidates.sort((a, b) => Math.abs(a.x - w.bossSpot.x) - Math.abs(b.x - w.bossSpot.x));
  if (doorCandidates.length) w.doors.push(doorCandidates[0]);
  else w.doors.push(px(bx + Math.floor(bw / 2), by + bh));

  for (const c of w.chests) setTile(w, c.x, c.y, Tl.DFLOOR);

  if (w.spawns.length > 16) w.spawns.length = 16;
  for (const s of w.spawns) {
    if (!pool.includes(s.kind)) s.kind = pool[Math.floor(rng() * pool.length)];
  }
  const navBuilder = new NavBuilder();
  w.nav = navBuilder.build(w);
}

// Склеп Хранителя
function genCrypt(seed: number, cfg: DungeonCfg, exitSpot: Vec): WorldData {
  const rng = mulberry((seed ^ 0x5eed) + cfg.id * 7919);
  const w = baseDungeon(cfg, 60, 45, exitSpot);
  const COLS = 6, ROWS = 4, CW = 9, CH = 8;
  const cellX = (c: number) => 3 + c * CW;
  const cellY = (r: number) => 12 + r * CH;
  const cells: { c: number; r: number }[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push({ c, r });
  const ci = (c: number, r: number) => r * COLS + c;

  const adj: number[][] = cells.map(() => []);
  const visited = new Uint8Array(cells.length);
  const stack = [ci(Math.floor(rng() * COLS), 0)];
  visited[stack[0]] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const cc = cells[cur];
    const nb: number[] = [];
    if (cc.c > 0 && !visited[ci(cc.c - 1, cc.r)]) nb.push(ci(cc.c - 1, cc.r));
    if (cc.c < COLS - 1 && !visited[ci(cc.c + 1, cc.r)]) nb.push(ci(cc.c + 1, cc.r));
    if (cc.r > 0 && !visited[ci(cc.c, cc.r - 1)]) nb.push(ci(cc.c, cc.r - 1));
    if (cc.r < ROWS - 1 && !visited[ci(cc.c, cc.r + 1)]) nb.push(ci(cc.c, cc.r + 1));
    if (!nb.length) { stack.pop(); continue; }
    const next = nb[Math.floor(rng() * nb.length)];
    adj[cur].push(next); adj[next].push(cur);
    visited[next] = 1;
    stack.push(next);
  }

  for (const cell of cells) {
    const x0 = cellX(cell.c), y0 = cellY(cell.r);
    for (let y = y0 + 1; y < y0 + CH - 2; y++) for (let x = x0 + 1; x < x0 + CW - 2; x++) setTile(w, x, y, Tl.DFLOOR);
  }
  for (let i = 0; i < cells.length; i++) {
    for (const j of adj[i]) {
      if (j <= i) continue;
      const a = cells[i], b = cells[j];
      if (a.r === b.r) {
        const x0 = Math.min(cellX(a.c), cellX(b.c)) + CW - 2;
        const y0 = cellY(a.r) + 2;
        for (let x = x0; x < x0 + 3; x++) for (let y = y0; y < y0 + 2; y++) setTile(w, x, y, Tl.DFLOOR);
      } else {
        const x0 = cellX(a.c) + 3;
        const y0 = Math.min(cellY(a.r), cellY(b.r)) + CH - 2;
        for (let x = x0; x < x0 + 2; x++) for (let y = y0; y < y0 + 3; y++) setTile(w, x, y, Tl.DFLOOR);
      }
    }
  }

  const BRX = 22, BRY = 2, BRW = 15, BRH = 8;
  for (let y = BRY; y < BRY + BRH; y++) for (let x = BRX; x < BRX + BRW; x++) setTile(w, x, y, Tl.DFLOOR);
  for (let x = 28; x <= 30; x++) for (let y = BRY + BRH - 1; y <= cellY(0) + 2; y++) setTile(w, x, y, Tl.DFLOOR);
  w.bossRoom = { x: BRX * T, y: BRY * T, w: BRW * T, h: BRH * T };
  w.bossSpot = px(BRX + Math.floor(BRW / 2), BRY + Math.floor(BRH / 2));

  const ec = 2 + Math.floor(rng() * 2);
  const ex = cellX(ec) + 4, ey = cellY(ROWS - 1) + CH - 3;
  setTile(w, ex, ey, Tl.STAIRS);
  w.entryStairs = px(ex, ey);
  w.spawn = px(ex, ey - 2);

  const dist = new Array(cells.length).fill(-1);
  const q = [ci(ec, ROWS - 1)]; dist[q[0]] = 0;
  while (q.length) {
    const c = q.shift()!;
    for (const n of adj[c]) if (dist[n] === -1) { dist[n] = dist[c] + 1; q.push(n); }
  }
  let far = 0;
  for (let i = 0; i < cells.length; i++) if (dist[i] > dist[far]) far = i;
  const farCell = cells[far];
  w.chests.push({ x: cellX(farCell.c) + 3, y: cellY(farCell.r) + 2, item: "key" });
  cells.forEach((cell, i) => {
    if (i % 2 === 0 || i === ci(ec, ROWS - 1) || i === far) return;
    if (rng() < 0.5) {
      w.chests.push({ x: cellX(cell.c) + 2 + Math.floor(rng() * 3), y: cellY(cell.r) + 2, item: rng() < 0.3 ? "heartPiece" : "arrows" });
    }
  });

  cells.forEach((cell, i) => {
    if (i === ci(ec, ROWS - 1) || dist[i] <= 0) return;
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      w.spawns.push({
        kind: cfg.pool[Math.floor(rng() * cfg.pool.length)],
        x: (cellX(cell.c) + 2 + Math.floor(rng() * 4)) * T + 8,
        y: (cellY(cell.r) + 2 + Math.floor(rng() * 3)) * T + 8,
      });
    }
  });
  finalizeDungeon(w, rng, cfg, cfg.pool);
  return w;
}

// Корень Иггдрасиля
function genRoot(seed: number, cfg: DungeonCfg, exitSpot: Vec): WorldData {
  const rng = mulberry((seed ^ 0x5eed) + cfg.id * 7919);
  const W = 60, H = 45;
  for (let attempt = 0; attempt < 8; attempt++) {
    const w = baseDungeon(cfg, W, H, exitSpot);
    const arng = mulberry(seed + attempt * 101 + cfg.id * 31);
    let grid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) grid[i] = arng() < 0.44 ? 1 : 0;
    for (let y = 0; y < H; y++) { grid[y * W] = 1; grid[y * W + W - 1] = 1; }
    for (let x = 0; x < W; x++) { grid[x] = 1; grid[(H - 1) * W + x] = 1; }
    for (let iter = 0; iter < 5; iter++) {
      const next = grid.slice();
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) walls += grid[(y + dy) * W + x + dx];
        next[y * W + x] = walls >= 5 ? 1 : 0;
      }
      grid = next;
    }
    for (let i = 0; i < W * H; i++) if (!grid[i]) w.tiles[i] = Tl.DFLOOR;

    const regions: { cells: number[]; cx: number; cy: number }[] = [];
    const seen = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (grid[i] || seen[i]) continue;
      const cells: number[] = [];
      const q = [i]; seen[i] = 1;
      let sx = 0, sy = 0;
      while (q.length) {
        const c = q.pop()!;
        cells.push(c);
        sx += c % W; sy += Math.floor(c / W);
        const cx = c % W, cy = Math.floor(c / W);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = (cy + dy) * W + cx + dx;
          if (!grid[ni] && !seen[ni]) { seen[ni] = 1; q.push(ni); }
        }
      }
      if (cells.length >= 14) regions.push({ cells, cx: sx / cells.length, cy: sy / cells.length });
      else for (const c of cells) w.tiles[c] = Tl.DWALL;
    }
    if (!regions.length) continue;
    regions.sort((a, b) => b.cells.length - a.cells.length);
    const big = regions[0];
    if (big.cells.length < 100) continue;

    for (let r = 1; r < regions.length; r++) {
      const a = regions[r], b = big;
      let ax = Math.round(a.cx), ay = Math.round(a.cy);
      const bx = Math.round(b.cx), by = Math.round(b.cy);
      while (ax !== bx) {
        for (let t = -1; t <= 1; t++) if (inB(w, ax, ay + t)) setTile(w, ax, ay + t, Tl.DFLOOR);
        ax += Math.sign(bx - ax);
      }
      while (ay !== by) {
        for (let t = -1; t <= 1; t++) if (inB(w, ax + t, ay)) setTile(w, ax + t, ay, Tl.DFLOOR);
        ay += Math.sign(by - ay);
      }
    }

    const ex = Math.floor(W / 2), ey = H - 4;
    for (let y = ey - 2; y <= ey + 1; y++) for (let x = ex - 2; x <= ex + 2; x++) if (inB(w, x, y)) setTile(w, x, y, Tl.DFLOOR);
    setTile(w, ex, ey, Tl.STAIRS);
    w.entryStairs = px(ex, ey);
    w.spawn = px(ex, ey - 1);
    let ty = ey - 2;
    while (ty > 2 && tileAt(w, ex, ty) !== Tl.DFLOOR) {
      for (let t = -1; t <= 1; t++) if (inB(w, ex + t, ty)) setTile(w, ex + t, ty, Tl.DFLOOR);
      ty--;
    }

    let minx = W, maxx = 0, miny = H, maxy = 0;
    for (const c of big.cells) {
      const x = c % W, y = Math.floor(c / W);
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    w.bossRoom = { x: minx * T, y: miny * T, w: (maxx - minx + 1) * T, h: (maxy - miny + 1) * T };
    w.bossSpot = px(Math.round(big.cx), Math.round(big.cy));

    let keyRegion = regions[regions.length - 1];
    let bd = -1;
    for (const r of regions) {
      if (r === big) continue;
      const d = Math.hypot(r.cx - ex, r.cy - ey);
      if (d > bd) { bd = d; keyRegion = r; }
    }
    const kx = clampi(Math.round(keyRegion.cx), 2, W - 3), ky = clampi(Math.round(keyRegion.cy), 2, H - 3);
    w.chests.push({ x: kx, y: ky, item: "key" });
    w.spawns.push({ kind: "shroom", x: kx * T + 8, y: (ky - 2) * T + 8 });
    w.spawns.push({ kind: "shroom", x: (kx + 2) * T + 8, y: ky * T + 8 });
    for (let r = 1; r < Math.min(4, regions.length); r++) {
      const reg = regions[r];
      w.chests.push({ x: clampi(Math.round(reg.cx) + 1, 2, W - 3), y: clampi(Math.round(reg.cy), 2, H - 3), item: rng() < 0.5 ? "arrows" : "heartPiece" });
    }

    let sp = 0;
    for (const r of regions) {
      if (r === big || sp > 9) break;
      const n = 1 + Math.floor(arng() * 2);
      for (let k = 0; k < n; k++) {
        const c = r.cells[Math.floor(arng() * r.cells.length)];
        w.spawns.push({ kind: arng() < 0.6 ? "shroom" : "crawler", x: (c % W) * T + 8, y: Math.floor(c / W) * T + 8 });
        sp++;
      }
    }
    finalizeDungeon(w, rng, cfg, cfg.pool);
    return w;
  }
  const w = baseDungeon(cfg, W, H, exitSpot);
  for (let y = 12; y < 32; y++) for (let x = 12; x < 46; x++) {
    if (Math.hypot(x - 29, (y - 22) * 1.4) < 15) setTile(w, x, y, Tl.DFLOOR);
  }
  for (let y = 32; y < H - 3; y++) for (let x = 27; x <= 31; x++) setTile(w, x, y, Tl.DFLOOR);
  setTile(w, 29, H - 4, Tl.STAIRS);
  w.entryStairs = px(29, H - 4);
  w.spawn = px(29, H - 5);
  w.bossRoom = { x: 22 * T, y: 16 * T, w: 14 * T, h: 11 * T };
  w.bossSpot = px(29, 22);
  w.chests.push({ x: 15, y: 14, item: "key" }, { x: 42, y: 26, item: "arrows" });
  w.spawns.push({ kind: "shroom", x: 20 * T + 8, y: 26 * T + 8 }, { kind: "crawler", x: 38 * T + 8, y: 18 * T + 8 });
  finalizeDungeon(w, rng, cfg, cfg.pool);
  return w;
}

// Каменная Крепость
function genFortress(seed: number, cfg: DungeonCfg, exitSpot: Vec): WorldData {
  const rng = mulberry((seed ^ 0x5eed) + cfg.id * 7919);
  const w = baseDungeon(cfg, 60, 45, exitSpot);
  const RW = 13, RH = 9;
  const roomX = (c: number) => 4 + c * 18;
  const roomY = (r: number) => 4 + r * 13;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x0 = roomX(c), y0 = roomY(r);
    for (let y = y0; y < y0 + RH; y++) for (let x = x0; x < x0 + RW; x++) setTile(w, x, y, Tl.DFLOOR);
  }
  for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) {
    const x0 = roomX(c) + RW, y0 = roomY(r) + 3;
    for (let x = x0; x < x0 + 5; x++) for (let y = y0; y < y0 + 3; y++) setTile(w, x, y, Tl.DFLOOR);
  }
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const x0 = roomX(c) + 5, y0 = roomY(r) + RH;
    for (let x = x0; x < x0 + 3; x++) for (let y = y0; y < y0 + 4; y++) setTile(w, x, y, Tl.DFLOOR);
  }
  const bx0 = roomX(1) - 1, by0 = roomY(1) - 1, BW = RW + 2, BH = RH + 2;
  for (let y = by0; y < by0 + BH; y++) for (let x = bx0; x < bx0 + BW; x++) setTile(w, x, y, Tl.DFLOOR);
  for (const [px2, py2] of [[2, 2], [BW - 3, 2], [2, BH - 3], [BW - 3, BH - 3]] as [number, number][]) {
    setTile(w, bx0 + px2, by0 + py2, Tl.COLUMN);
  }
  w.bossRoom = { x: bx0 * T, y: by0 * T, w: BW * T, h: BH * T };
  w.bossSpot = px(roomX(1) + Math.floor(RW / 2), roomY(1) + Math.floor(RH / 2));

  const ex = roomX(1) + Math.floor(RW / 2), ey = roomY(2) + RH - 2;
  setTile(w, ex, ey, Tl.STAIRS);
  w.entryStairs = px(ex, ey);
  w.spawn = px(ex, ey - 2);

  const corners = [[0, 0], [2, 0], [0, 2], [2, 2]] as [number, number][];
  const kc = corners[Math.floor(rng() * corners.length)];
  w.chests.push({ x: roomX(kc[0]) + 2, y: roomY(kc[1]) + 2, item: "key" });
  const oc = corners.filter((c) => c !== kc)[Math.floor(rng() * 3)];
  w.chests.push({ x: roomX(oc[0]) + RW - 3, y: roomY(oc[1]) + 2, item: rng() < 0.5 ? "arrows" : "heartPiece" });
  for (const [c, r] of [[1, 0], [0, 1], [2, 1]] as [number, number][]) {
    if (rng() < 0.6) w.chests.push({ x: roomX(c) + 3, y: roomY(r) + 3, item: "arrows" });
  }

  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if ((c === 1 && r === 1) || (c === 1 && r === 2)) continue;
    const n = 2 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      w.spawns.push({
        kind: cfg.pool[Math.floor(rng() * cfg.pool.length)],
        x: (roomX(c) + 2 + Math.floor(rng() * (RW - 4))) * T + 8,
        y: (roomY(r) + 2 + Math.floor(rng() * (RH - 4))) * T + 8,
      });
    }
  }
  finalizeDungeon(w, rng, cfg, cfg.pool);
  return w;
}

export function generateDungeon(seed: number, cfg: DungeonCfg, exitSpot: Vec): WorldData {
  if (cfg.id === 0) return genCrypt(seed, cfg, exitSpot);
  if (cfg.id === 1) return genRoot(seed, cfg, exitSpot);
  return genFortress(seed, cfg, exitSpot);
}

export const DUNGEONS: DungeonCfg[] = [
  { id: 0, name: "Склеп Хранителя", boss: "reaper", bossReward: "axe", pool: ["draugr", "crawler", "raven"] },
  { id: 1, name: "Корень Иггдрасиля", boss: "spider", bossReward: "bow", pool: ["shroom", "crawler", "raven"] },
  { id: 2, name: "Каменная Крепость", boss: "giant", bossReward: "hammer", pool: ["draugr", "frost", "varg"] },
];