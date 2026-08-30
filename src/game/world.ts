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

/* многослойный сглаженный решёточный шум */
function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  const rng = mulberry(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const hash = (x: number, y: number) => perm[(perm[x & 255] + y) & 255] / 255;
  const sm = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = sm(x - ix), fy = sm(y - iy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x: number, y: number, octaves = 4) => {
    let v = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      v += noise(x * f, y * f) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return v / norm;
  };
}

/* навигационная сетка: сливаем проходимые тайлы в прямоугольники */
function buildNav(w: WorldData): NavMesh {
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

function carvePath(w: WorldData, x0: number, y0: number, x1: number, y1: number, horizFirst: boolean) {
  const put = (x: number, y: number) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
      const xx = x + dx, yy = y + dy;
      if (!inB(w, xx, yy)) continue;
      const cur = w.tiles[idx(w, xx, yy)];
      if (cur === Tl.WATER || cur === Tl.PALISADE || cur === Tl.HOUSE) continue;
      setTile(w, xx, yy, Tl.PATH);
    }
  };
  if (horizFirst) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y0);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(x1, y);
  } else {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(x0, y);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y1);
  }
}

/* умная дорога: A* по стоимости рельефа */
function carveRoad(w: WorldData, a: Vec, b: Vec, rng: () => number) {
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
  const sx = clampi(a.x, 1, W - 2), sy = clampi(a.y, 1, H - 2);
  const gx = clampi(b.x, 1, W - 2), gy = clampi(b.y, 1, H - 2);
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
  if (!found) { carvePath(w, sx, sy, gx, gy, rng() < 0.5); return; }
  const path: number[] = [];
  let c = gy * W + gx;
  while (c !== -1) { path.push(c); c = came[c]; }
  for (const i of path) {
    const x = i % W, y = Math.floor(i / W);
    const t = w.tiles[i];
    if (t !== Tl.WATER && t !== Tl.PALISADE && t !== Tl.HOUSE && t !== Tl.STAIRS && t !== Tl.ALTAR && t !== Tl.VILLAGE) {
      setTile(w, x, y, Tl.PATH);
    }
  }
}

function clearAround(w: WorldData, cx: number, cy: number, r: number, floor?: number) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (!inB(w, x, y)) continue;
    const cur = w.tiles[idx(w, x, y)];
    if (cur === Tl.WATER || cur === Tl.PALISADE || cur === Tl.HOUSE) continue;
    if (isSolidTileId(cur)) setTile(w, x, y, floor !== undefined ? floor : Tl.SNOW);
  }
}

/* ============================== ПОСЕЛЕНИЯ ============================== */
interface VillageBox { x0: number; y0: number; x1: number; y1: number; gate: Vec; houses: HouseDef[] }
interface HouseDef { x: number; y: number; w: number; h: number }

const HOUSE_SIZES = [
  { w: 2, h: 2 },
  { w: 2, h: 3 },
  { w: 3, h: 2 },
  { w: 3, h: 3 },
];

function canPlaceHouse(w: WorldData, hx: number, hy: number, hw: number, hh: number, placed: HouseDef[]): boolean {
  // Проверка границ
  if (hx < 1 || hy < 1 || hx + hw >= w.W - 1 || hy + hh >= w.H - 1) return false;
  
  // Проверка наложения на другие дома (с буфером 1 клетка)
  for (const h of placed) {
    if (hx < h.x + h.w + 1 && hx + hw + 1 > h.x && hy < h.y + h.h + 1 && hy + hh + 1 > h.y) {
      return false;
    }
  }
  
  // Проверка: не перекрывать ли ворота и подход к ним
  return true;
}

function placeHouse(w: WorldData, hx: number, hy: number, hw: number, hh: number): void {
  for (let y = hy; y < hy + hh; y++) {
    for (let x = hx; x < hx + hw; x++) {
      setTile(w, x, y, Tl.HOUSE);
    }
  }
}

function makeVillage(w: WorldData, cx: number, cy: number, rw: number, rh: number, rng: () => number, houses: number): VillageBox {
  // Забор по периметру
  for (let y = cy; y <= cy + rh; y++) {
    for (let x = cx; x <= cx + rw; x++) {
      if (!inB(w, x, y)) continue;
      const border = x === cx || x === cx + rw || y === cy || y === cy + rh;
      setTile(w, x, y, border ? Tl.PALISADE : Tl.VILLAGE);
    }
  }
  
  // Ворота внизу по центру
  const gx = cx + Math.floor(rw / 2);
  const gy = cy + rh;
  setTile(w, gx, gy, Tl.VILLAGE); 
  setTile(w, gx + 1, gy, Tl.VILLAGE);
  
  // Зона ворот и подхода (дорога будет огибать эту зону)
  const gateZone = { x: gx - 2, y: gy - 4, w: 5, h: 5 };
  
  const placed: HouseDef[] = [];
  let tries = 0;
  
  while (placed.length < houses && tries++ < 300) {
    // Выбираем случайный размер дома
    const size = HOUSE_SIZES[Math.floor(rng() * HOUSE_SIZES.length)];
    const hw = size.w;
    const hh = size.h;
    
    // Пытаемся разместить дом
    const hx = cx + 1 + Math.floor(rng() * (rw - hw - 2));
    const hy = cy + 1 + Math.floor(rng() * (rh - hh - 2));
    
    // Не размещать слишком близко к воротам
    if (hx + hw > gateZone.x && hx < gateZone.x + gateZone.w &&
        hy + hh > gateZone.y && hy < gateZone.y + gateZone.h) {
      continue;
    }
    
    if (!canPlaceHouse(w, hx, hy, hw, hh, placed)) continue;
    
    placeHouse(w, hx, hy, hw, hh);
    placed.push({ x: hx, y: hy, w: hw, h: hh });
  }
  
  return { x0: cx, y0: cy, x1: cx + rw, y1: cy + rh, gate: { x: gx, y: gy }, houses: placed };
}

function makeFort(w: WorldData, cx: number, cy: number, rw: number, rh: number, rng: () => number): VillageBox {
  // Стены с башнями по углам
  for (let y = cy; y <= cy + rh; y++) {
    for (let x = cx; x <= cx + rw; x++) {
      if (!inB(w, x, y)) continue;
      const border = x === cx || x === cx + rw || y === cy || y === cy + rh;
      if (border) {
        const corner = (x === cx || x === cx + rw) && (y === cy || y === cy + rh);
        setTile(w, x, y, corner ? Tl.COLUMN : Tl.ROCK);
      } else {
        setTile(w, x, y, Tl.VILLAGE);
      }
    }
  }
  
  // Ворота внизу по центру
  const gx = cx + Math.floor(rw / 2);
  const gy = cy + rh;
  setTile(w, gx, gy, Tl.VILLAGE); 
  setTile(w, gx + 1, gy, Tl.VILLAGE);
  setTile(w, gx, gy - 1, Tl.VILLAGE); 
  setTile(w, gx + 1, gy - 1, Tl.VILLAGE);
  
  const gateZone = { x: gx - 2, y: gy - 4, w: 5, h: 5 };
  const placed: HouseDef[] = [];
  let tries = 0;
  
  while (placed.length < 4 && tries++ < 300) {
    const size = HOUSE_SIZES[Math.floor(rng() * HOUSE_SIZES.length)];
    const hw = size.w;
    const hh = size.h;
    
    const hx = cx + 1 + Math.floor(rng() * (rw - hw - 2));
    const hy = cy + 1 + Math.floor(rng() * (rh - hh - 2));
    
    if (hx + hw > gateZone.x && hx < gateZone.x + gateZone.w &&
        hy + hh > gateZone.y && hy < gateZone.y + gateZone.h) {
      continue;
    }
    
    if (!canPlaceHouse(w, hx, hy, hw, hh, placed)) continue;
    
    placeHouse(w, hx, hy, hw, hh);
    placed.push({ x: hx, y: hy, w: hw, h: hh });
  }
  
  return { x0: cx, y0: cy, x1: cx + rw, y1: cy + rh, gate: { x: gx, y: gy }, houses: placed };
}

function makeRuinedVillage(w: WorldData, cx: number, cy: number, rw: number, rh: number, rng: () => number): VillageBox {
  // Разрушенные стены
  for (let y = cy; y <= cy + rh; y++) {
    for (let x = cx; x <= cx + rw; x++) {
      if (!inB(w, x, y)) continue;
      setTile(w, x, y, Tl.RUINS);
      const border = x === cx || x === cx + rw || y === cy || y === cy + rh;
      if (border && rng() < 0.55) {
        setTile(w, x, y, rng() < 0.5 ? Tl.PALISADE : Tl.COLUMN);
      }
    }
  }
  
  // Проемы в стенах
  for (let i = 0; i < 3; i++) {
    const side = Math.floor(rng() * 4);
    if (side === 0) { const x = cx + 1 + Math.floor(rng() * (rw - 1)); setTile(w, x, cy, Tl.RUINS); setTile(w, x + 1, cy, Tl.RUINS); }
    if (side === 1) { const x = cx + 1 + Math.floor(rng() * (rw - 1)); setTile(w, x, cy + rh, Tl.RUINS); setTile(w, x + 1, cy + rh, Tl.RUINS); }
    if (side === 2) { const y = cy + 1 + Math.floor(rng() * (rh - 1)); setTile(w, cx, y, Tl.RUINS); setTile(w, cx, y + 1, Tl.RUINS); }
    if (side === 3) { const y = cy + 1 + Math.floor(rng() * (rh - 1)); setTile(w, cx + rw, y, Tl.RUINS); setTile(w, cx + rw, y + 1, Tl.RUINS); }
  }
  
  const placed: HouseDef[] = [];
  let tries = 0;
  
  while (placed.length < 5 && tries++ < 300) {
    const size = HOUSE_SIZES[Math.floor(rng() * HOUSE_SIZES.length)];
    const hw = size.w;
    const hh = size.h;
    
    const hx = cx + 1 + Math.floor(rng() * (rw - hw - 2));
    const hy = cy + 1 + Math.floor(rng() * (rh - hh - 2));
    
    if (!canPlaceHouse(w, hx, hy, hw, hh, placed)) continue;
    
    const burnt = rng() < 0.55;
    for (let y = hy; y < hy + hh; y++) {
      for (let x = hx; x < hx + hw; x++) {
        if (burnt) {
          setTile(w, x, y, (x + y) % 2 === 0 ? Tl.COLUMN : Tl.RUINS);
        } else {
          setTile(w, x, y, Tl.HOUSE);
        }
      }
    }
    placed.push({ x: hx, y: hy, w: hw, h: hh });
  }
  
  // Ворота
  const gx = cx + Math.floor(rw / 2);
  const gy = cy + rh;
  setTile(w, gx, gy, Tl.RUINS); 
  setTile(w, gx + 1, gy, Tl.RUINS);
  setTile(w, gx, gy - 1, Tl.RUINS); 
  setTile(w, gx + 1, gy - 1, Tl.RUINS);
  
  return { x0: cx, y0: cy, x1: cx + rw, y1: cy + rh, gate: { x: gx, y: gy }, houses: placed };
}

/* ============================== ОВЕРВОРЛД ============================== */
export function generateOverworld(seed: number): WorldData {
  const rng = mulberry(seed);
  const W = 200, H = 140;
  const w: WorldData = {
    W, H, tiles: new Uint8Array(W * H).fill(Tl.SNOW), nav: null as unknown as NavMesh,
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

  /* ---- БОЛЬШОЙ ОСТРОВ В ЦЕНТРЕ КАРТЫ, ВОКРУГ — МОРЕ ----
     Форма острова — эллипс; шум лишь размывает береговую линию (±0.1),
     поэтому все ключевые точки (норм. дистанция ≤ 0.77) гарантированно на суше. */
  const ICX = W / 2, ICY = H / 2, RX = 94, RY = 64;
  const coastN = makeNoise(seed ^ 0x5ea);
  const normDist = (x: number, y: number) => Math.hypot((x - ICX) / RX, (y - ICY) / RY);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = normDist(x, y) + (coastN(x * 0.055, y * 0.055) - 0.5) * 0.22;
    if (d > 1) setTile(w, x, y, Tl.WATER);
    else if (d > 0.93) setTile(w, x, y, Tl.SHORE);
  }

  /* радиальные зоны: Хребет Нидов -> Мёртвый Лес -> Замерзшие Топи -> пустоши */
  const cx = W / 2 + (rng() * 8 - 4);
  const cy = H / 2 - 4 + (rng() * 6 - 3);
  const n1 = makeNoise(seed ^ 0xa11ce);
  const n2 = makeNoise(seed ^ 0xb0b);
  const R1 = 24, R2 = 42, R3 = 54;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const cur0 = w.tiles[idx(w, x, y)];
    if (cur0 === Tl.WATER || cur0 === Tl.SHORE) continue;
    const d = Math.hypot((x - cx) * 0.92, y - cy) + (n1(x * 0.07, y * 0.07) - 0.5) * 13;
    if (d < R1) setTile(w, x, y, Tl.MTN);
    else if (d < R2) setTile(w, x, y, Tl.FOREST);
    else if (d < R3) setTile(w, x, y, rng() < 0.42 ? Tl.SWAMP : Tl.FOREST);
    else if (n2(x * 0.05, y * 0.05) < 0.24) setTile(w, x, y, Tl.SNOW2);
  }

  /* руины на юго-западе острова */
  const ruinsC = { x: 44 + Math.floor(rng() * 8), y: 88 + Math.floor(rng() * 6) };
  for (let y = ruinsC.y - 10; y <= ruinsC.y + 10; y++) for (let x = ruinsC.x - 11; x <= ruinsC.x + 11; x++) {
    if (!inB(w, x, y)) continue;
    const d = Math.hypot(x - ruinsC.x, (y - ruinsC.y) * 1.2) + (n2(x * 0.2, y * 0.2) - 0.5) * 5;
    if (d < 9 && w.tiles[idx(w, x, y)] !== Tl.WATER && w.tiles[idx(w, x, y)] !== Tl.SHORE) setTile(w, x, y, Tl.RUINS);
  }

  /* сглаживание границ */
  const baseOf = (t: number) => (t === Tl.FOREST || t === Tl.MTN || t === Tl.SWAMP || t === Tl.RUINS || t === Tl.SNOW) ? t : -1;
  for (let iter = 0; iter < 2; iter++) {
    const copy = w.tiles.slice();
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const t = copy[idx(w, x, y)];
      if (baseOf(t) < 0) continue;
      const cnt = new Map<number, number>();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const b = baseOf(copy[idx(w, x + dx, y + dy)]);
        if (b >= 0) cnt.set(b, (cnt.get(b) ?? 0) + 1);
      }
      const own = cnt.get(t) ?? 0;
      let maj = t, mv = 0;
      cnt.forEach((v, k) => { if (v > mv) { mv = v; maj = k; } });
      if (own <= 2 && mv >= 5) setTile(w, x, y, maj);
    }
  }

  /* поселения: целое (юг), форт (восток), сожжённая деревня (запад) —
     все глубоко на суше, норм. дистанция до кромки острова ≤ 0.61 */
  const vA = makeVillage(w, 92 + Math.floor(rng() * 5), 96, 15, 12, rng, 4);
  const vB = makeFort(w, 146 + Math.floor(rng() * 4), 58, 13, 11, rng);
  const vR = makeRuinedVillage(w, 38 + Math.floor(rng() * 4), 56, 11, 9, rng);
  w.villageA = vA.gate; w.villageB = vB.gate;
  w.ruinedVillage = { x: vR.x0 + 5, y: vR.y0 + 4 };
  const gate = vA.gate;
  /* страховка: под воротами и стартовой площадью всегда суша */
  const ensureLand = (px: number, py: number, r: number) => {
    for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) {
      if (inB(w, x, y) && w.tiles[idx(w, x, y)] === Tl.WATER) setTile(w, x, y, Tl.SNOW);
    }
  };
  ensureLand(gate.x, gate.y, 5);
  ensureLand(vB.gate.x, vB.gate.y, 4);
  ensureLand(vR.gate.x, vR.gate.y, 4);

  /* алтарь Древа */
  clearAround(w, w.treeAltar.x, w.treeAltar.y + 3, 6, Tl.SNOW2);
  setTile(w, w.treeAltar.x, w.treeAltar.y, Tl.ALTAR);
  w.arena = { x: w.treeAltar.x * T + 8, y: (w.treeAltar.y + 3) * T + 8, r: 84 };
  w.snakeSpot = { x: w.treeAltar.x * T + 8, y: (w.treeAltar.y + 2) * T };

  const landT = (t: number) => !SOLID.has(t) && t !== Tl.WATER && t !== Tl.POOL && t !== Tl.PATH && t !== Tl.VILLAGE;
  const findFree = (fx: number, fy: number, r: number, pref?: number): Vec => {
    for (let tries = 0; tries < 400; tries++) {
      const x = Math.round(fx + (rng() * 2 - 1) * r);
      const y = Math.round(fy + (rng() * 2 - 1) * r);
      if (!inB(w, x, y)) continue;
      const t = w.tiles[idx(w, x, y)];
      if (!landT(t)) continue;
      if (pref !== undefined && t !== pref && tries < 300) continue;
      return { x, y };
    }
    /* запасной вариант: спиральный поиск ближайшей суши — предмет НИКОГДА не окажется в воде */
    for (let rad = 1; rad < 90; rad++) {
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = Math.round(fx) + dx, y = Math.round(fy) + dy;
        if (!inB(w, x, y)) continue;
        const t = w.tiles[idx(w, x, y)];
        if (landT(t) && (pref === undefined || t === pref)) return { x, y };
      }
    }
    return { x: clampi(Math.round(fx), 2, W - 3), y: clampi(Math.round(fy), 2, H - 3) };
  };

  /* входы в три подземелья */
  const mkEntry = (fx: number, fy: number, pref: number, id: number, name: string) => {
    const p = findFree(fx, fy, 9, pref);
    setTile(w, p.x, p.y, Tl.STAIRS);
    clearAround(w, p.x, p.y, 1);
    w.dungeonEntries.push({ x: p.x, y: p.y, id, name });
    return p;
  };
  mkEntry(cx + 6, cy + 2, Tl.MTN, 2, "Каменная Крепость");
  mkEntry(cx - R1 - 10, cy + 6, Tl.FOREST, 1, "Корень Иггдрасиля");
  mkEntry(ruinsC.x, ruinsC.y, Tl.RUINS, 0, "Склеп Хранителя");

  /* дороги */
  carveRoad(w, vA.gate, vB.gate, rng);
  carveRoad(w, vA.gate, { x: w.treeAltar.x, y: w.treeAltar.y + 8 }, rng);
  for (const e of w.dungeonEntries) carveRoad(w, vA.gate, { x: e.x, y: e.y }, rng);
  carveRoad(w, vA.gate, { x: vR.gate.x, y: vR.gate.y }, rng);
  carveRoad(w, vA.gate, { x: ruinsC.x, y: ruinsC.y }, rng);
  const midRoad = { x: Math.round((vA.gate.x + vB.gate.x) / 2), y: Math.round((vA.gate.y + vB.gate.y) / 2) };
  w.bundleSpot = findFree(midRoad.x, midRoad.y, 4);

  /* святилища */
  const shrineSpots: Vec[] = [
    { x: vA.x0 - 3, y: vA.y1 - 2 },
    findFree(cx - R1 - 8, cy - 10, 6),
    findFree(cx + R1 + 8, cy - 6, 6),
    { x: vB.x0 - 3, y: vB.y1 },
  ];
  for (const s of shrineSpots) {
    clearAround(w, s.x, s.y, 1);
    w.shrines.push({ x: s.x, y: s.y });
  }

  /* ключевые точки квестов — все в глубине острова */
  w.bearSpot = findFree(cx + R2 + 6, cy + 14, 8, Tl.SWAMP);
  setTile(w, w.bearSpot.x, w.bearSpot.y, Tl.POOL);
  w.hornSpot = findFree(cx + 10, cy - 8, 9, Tl.MTN);
  w.meadSpot = findFree(cx - R1 - 14, cy - 6, 9, Tl.FOREST);
  w.oreSpot = findFree(cx - 8, cy + 8, 9, Tl.MTN);
  w.mossSpot = findFree(cx + R2 + 4, cy + 4, 8, Tl.SWAMP);
  w.amberSpot = findFree(cx + 14, cy + 8, 9, Tl.MTN);
  w.flowerSpot = findFree(ruinsC.x + 6, ruinsC.y - 4, 8, Tl.RUINS);
  w.diarySpot = { x: vR.x0 + 2 + Math.floor(rng() * 6), y: vR.y0 + 2 + Math.floor(rng() * 4) };
  setTile(w, w.diarySpot.x, w.diarySpot.y, Tl.RUINS);
  w.relicSpot = findFree(44, 50, 9);
  w.oldAltar = findFree(w.relicSpot.x + 7, w.relicSpot.y + 3, 5);
  setTile(w, w.oldAltar.x, w.oldAltar.y, Tl.ALTAR);
  clearAround(w, w.oldAltar.x, w.oldAltar.y, 1);
  w.stashSpot = findFree(ruinsC.x - 4, ruinsC.y + 5, 6);

  /* колонны в руинах */
  for (let i = 0; i < 10; i++) {
    const p = findFree(ruinsC.x, ruinsC.y, 8, Tl.RUINS);
    setTile(w, p.x, p.y, Tl.COLUMN);
  }

  /* пьедесталы Забытых Рун */
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
    const p = findFree(c.x, c.y, 6);
    clearAround(w, p.x, p.y, 2);
    w.pedestals.push({ x: p.x, y: p.y, guards: guardPool[i] });
  });

  /* сундуки на поверхности */
  const bowSpot = findFree(cx - R1 - 8, cy + 12, 9, Tl.FOREST);
  const arrowsSpot = findFree(cx + 6, cy - 12, 9, Tl.MTN);
  const heartSpot = findFree(cx + R2 + 8, cy + 2, 9);
  w.chests.push(
    { x: bowSpot.x, y: bowSpot.y, item: "bow" },
    { x: arrowsSpot.x, y: arrowsSpot.y, item: "arrows" },
    { x: heartSpot.x, y: heartSpot.y, item: "heartPiece" },
  );
  for (const c of w.chests) clearAround(w, c.x, c.y, 1);

  /* NPC */
  w.npcs.push(
    { id: "eirik", name: "Эйрик Старший", x: gate.x - 4, y: gate.y - 7 },
    { id: "astrid", name: "Астрид", x: gate.x + 3, y: gate.y - 8 },
    { id: "harald", name: "Харальд", x: gate.x - 4, y: gate.y - 3 },
    { id: "raven", name: "Ворон-Говорун", x: gate.x + 3, y: gate.y - 3 },
    { id: "daughter", name: "Безымянная Дочь", x: Math.round(cx - R1 - 10), y: Math.round(cy + 6) },
    { id: "sigrid", name: "Сигрид", x: vB.gate.x - 3, y: vB.gate.y - 5 },
    { id: "brand", name: "Бранд", x: vB.gate.x + 2, y: vB.gate.y - 6 },
    { id: "shaman", name: "Шаман Ульв", x: vB.gate.x, y: vB.gate.y - 4 },
    { id: "refugee", name: "Беженка Гюнн", x: vR.gate.x + 3, y: vR.gate.y + 2 },
    { id: "merchant", name: "Торговец Фьолнир", x: midRoad.x + 2, y: midRoad.y + 1 },
  );
  for (const n of w.npcs) {
    if (!inB(w, n.x, n.y) || SOLID.has(tileAt(w, n.x, n.y))) {
      const p = findFree(n.x, n.y, 3);
      n.x = p.x; n.y = p.y;
    }
    clearAround(w, n.x, n.y, 1);
  }

  /* души-странники */
  const soulSpots = [
    findFree(cx - R2 - 6, cy + 12, 5),
    findFree(cx + R2 + 10, cy - 10, 5),
    { x: ruinsC.x - 8, y: ruinsC.y - 6 },
  ];
  for (const s of soulSpots) { clearAround(w, s.x, s.y, 1); w.souls.push(s); }

  /* ледяные осколки и кости — только на суше (findFree со спиральным fallback) */
  for (let i = 0; i < 24; i++) {
    const a = rng() * Math.PI * 2, rr = 12 + rng() * 46;
    const p = findFree(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75, 3);
    if (!w.ambient.some((x) => Math.abs(x.x - p.x) < 4 && Math.abs(x.y - p.y) < 4)) {
      w.ambient.push({ kind: "shard", x: p.x, y: p.y });
    }
  }
  for (let i = 0; i < 10; i++) {
    const p = findFree(ruinsC.x + (rng() * 2 - 1) * 12, ruinsC.y + (rng() * 2 - 1) * 11, 3, Tl.RUINS);
    if (!w.ambient.some((x) => Math.abs(x.x - p.x) < 4 && Math.abs(x.y - p.y) < 4)) {
      w.ambient.push({ kind: "bones", x: p.x, y: p.y });
    }
  }

  /* украшение биомов */
  const n3 = makeNoise(seed ^ 0xdeed);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = idx(w, x, y);
    const t = w.tiles[i];
    const v = n3(x * 0.16, y * 0.16);
    if (t === Tl.FOREST) { if (v > 0.5) setTile(w, x, y, Tl.TREE); }
    else if (t === Tl.MTN) { if (v > 0.56) setTile(w, x, y, Tl.ROCK); }
    else if (t === Tl.SWAMP) { if (v > 0.66) setTile(w, x, y, Tl.POOL); }
    else if (t === Tl.SNOW) {
      if (v > 0.74) setTile(w, x, y, Tl.TREE);
      else if (v < 0.24) setTile(w, x, y, Tl.SNOW2);
    } else if (t === Tl.RUINS) { if (v > 0.76) setTile(w, x, y, Tl.COLUMN); }
  }
  for (const n of w.npcs) clearAround(w, n.x, n.y, 1);
  for (const c of w.chests) clearAround(w, c.x, c.y, 1);
  for (const p of w.pedestals) clearAround(w, p.x, p.y, 1);
  for (const e of w.dungeonEntries) clearAround(w, e.x, e.y, 1);
  for (const s of w.shrines) clearAround(w, s.x, s.y, 1);
  for (const s of w.souls) clearAround(w, s.x, s.y, 1);
  for (const a of w.ambient) clearAround(w, a.x, a.y, 0);
  clearAround(w, w.treeAltar.x, w.treeAltar.y + 3, 5, Tl.SNOW2);
  setTile(w, w.treeAltar.x, w.treeAltar.y, Tl.ALTAR);
  clearAround(w, w.oldAltar.x, w.oldAltar.y, 1);
  setTile(w, w.oldAltar.x, w.oldAltar.y, Tl.ALTAR);

  /* враги по экосистеме колец — спавн только в разрешённых зонах */
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
  
  // Зоны где монстры НЕ могут спавниться (поселения + буфер вокруг)
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
    gate, vB.gate, w.treeAltar,
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
    // Проверка: не в поселении ли
    if (isInNoSpawnZone(x, y)) continue;
    if (Math.hypot(gate.x - x, gate.y + 2 - y) < 40) continue;
    if (pois.some((p) => Math.hypot(p.x - x, p.y - y) < 8)) continue;
    const d = Math.hypot((x - cx) * 0.92, y - cy);
    const kinds = kindsFor(t, d);
    w.spawns.push({ kind: kinds[Math.floor(rng() * kinds.length)], x: x * T + 8, y: y * T + 8 });
    placed++;
  }
  // В сожжённой деревне можно спавнить немного врагов (она разрушена)
  for (let i = 0; i < 3; i++) {
    const x = vR.x0 + 2 + Math.floor(rng() * (vR.x1 - vR.x0 - 4));
    const y = vR.y0 + 2 + Math.floor(rng() * (vR.y1 - vR.y0 - 4));
    if (!SOLID.has(tileAt(w, x, y))) w.spawns.push({ kind: i === 2 ? "crawler" : "draugr", x: x * T + 8, y: y * T + 8 });
  }

  /* связность: всё важное достижимо от ворот */
  const reach = floodReach(w, gate.x, gate.y - 1);
  const ensure = (p: Vec) => {
    if (!inB(w, p.x, p.y) || !reach[idx(w, p.x, p.y)]) carveRoad(w, gate, p, rng);
  };
  for (const e of w.dungeonEntries) ensure(e);
  ensure({ x: w.treeAltar.x, y: w.treeAltar.y + 8 });
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

  w.zones = [
    { x: vA.x0, y: vA.y0, w: vA.x1 - vA.x0, h: vA.y1 - vA.y0, name: "Поселение выживших" },
    { x: vB.x0, y: vB.y0, w: vB.x1 - vB.x0, h: vB.y1 - vB.y0, name: "Воронья Гавань" },
    { x: vR.x0, y: vR.y0, w: vR.x1 - vR.x0, h: vR.y1 - vR.y0, name: "Сожжённая Деревня" },
    { x: w.treeAltar.x - 8, y: w.treeAltar.y - 3, w: 17, h: 17, name: "Корни Иггдрасиля" },
    { x: Math.round(cx - R1 - 20), y: Math.round(cy - 20), w: 40, h: 40, name: "Мёртвый Лес" },
    { x: Math.round(cx - 24), y: Math.round(cy - 22), w: 48, h: 44, name: "Хребет Нидов" },
    { x: Math.round(cx + R1 - 4), y: Math.round(cy - 10), w: 44, h: 44, name: "Замерзшие Топи" },
    { x: ruinsC.x - 14, y: ruinsC.y - 12, w: 28, h: 24, name: "Руины Времени" },
  ];

  // герой приходит в себя рядом с Эйриком
  for (let y = gate.y - 6; y <= gate.y - 3; y++) for (let x = gate.x - 4; x <= gate.x + 2; x++) {
    if (!inB(w, x, y)) continue;
    const t = w.tiles[idx(w, x, y)];
    if (t === Tl.HOUSE || t === Tl.TREE || t === Tl.ROCK || t === Tl.COLUMN) setTile(w, x, y, Tl.VILLAGE);
  }
  w.spawn = px(gate.x, gate.y - 5);
  w.nav = buildNav(w);
  return w;
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
  w.nav = buildNav(w);
}

/* Склеп Хранителя: лабиринт коридоров с камерами-усыпальницами */
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
  // дополнительные сундуки в каждой второй камере
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

/* Корень Иггдрасиля: органичные пещеры (клеточный автомат + flood fill) */
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
    // сундуки в средних гротах
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

/* Каменная Крепость: форт с башнями и широкими маршами */
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
  // сундук в каждой оставшейся башне
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

/* три подземелья основной саги */
export const DUNGEONS: DungeonCfg[] = [
  { id: 0, name: "Склеп Хранителя", boss: "reaper", bossReward: "axe", pool: ["draugr", "crawler", "raven"] },
  { id: 1, name: "Корень Иггдрасиля", boss: "spider", bossReward: "bow", pool: ["shroom", "crawler", "raven"] },
  { id: 2, name: "Каменная Крепость", boss: "giant", bossReward: "hammer", pool: ["draugr", "frost", "varg"] },
];
