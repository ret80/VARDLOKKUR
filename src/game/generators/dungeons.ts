/* Генерация данжинов: Склеп, Корень Иггдрасиля, Каменная Крепость */
import { mulberry } from "../noise";
import { px } from "../utils";
import { WorldData, Vec, Tl, idx, inB, EnemyKind, DungeonCfg, isSolidTileId } from "./types";
import { tileAt, setTile } from "./utils";
import { NavBuilder } from "./nav-builder";
import { resolveDungeonTiles } from "../dungeon-tiles";
import { logger } from "../debug/logger";
import {
  carveLayout,
  generateLayout,
  graphDistances,
  validateLayout,
  type DungeonLayout,
  type LayoutOptions,
  type LayoutRoom,
} from "./dungeon-layout";

function baseDungeon(cfg: DungeonCfg, W: number, H: number, exitSpot: Vec): WorldData {
  return {
    W, H, tiles: new Uint8Array(W * H).fill(Tl.DWALL), nav: null as unknown as import("navmesh").NavMesh,
    dungeonWall: new Uint8Array(W * H),
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
     ruinedHouses: [],
  };
}

function finalizeDungeon(w: WorldData, rng: () => number, cfg: DungeonCfg, pool: EnemyKind[]) {
  // Дверь босса: если генератор уже задал её (w.doors не пуст) — не трогаем.
  if (w.doors.length === 0) {
    const br = w.bossRoom;
    const bx = Math.floor(br.x / 16), by = Math.floor(br.y / 16);
    const bw = Math.floor(br.w / 16), bh = Math.floor(br.h / 16);
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
  }

  for (const c of w.chests) setTile(w, c.x, c.y, Tl.DFLOOR);

  // Подземелья стали крупнее (id 0 — 88×60), поэтому лимит спавнов выше.
  if (w.spawns.length > 24) w.spawns.length = 24;
  for (const s of w.spawns) {
    if (!pool.includes(s.kind)) s.kind = pool[Math.floor(rng() * pool.length)];
  }
  // Финальный проход автотайлинга стен (после всех правок tiles).
  resolveDungeonTiles(w);
  const navBuilder = new NavBuilder();
  w.nav = navBuilder.build(w);
}

// Склеп Хранителя — процедурная планировка «комнаты + коридоры» (dungeon-layout.ts).
const CRYPT_W = 88, CRYPT_H = 60;

/** Опции планировки Склепа: просторнее дефолта, тупиковая арена босса. */
const CRYPT_LAYOUT: Partial<LayoutOptions> = {
  targetRooms: 14, minRooms: 8, margin: 3, padding: 2,
  corridorWidth: 2, mainWidth: 3, bossMinW: 16, bossMinH: 12,
};

/** Случайная клетка пола внутри комнаты (с отступом от края). */
function randomFloorInRoom(w: WorldData, r: LayoutRoom, rng: () => number): Vec | null {
  const m = 1, iw = r.w - 2 * m, ih = r.h - 2 * m;
  if (iw > 0 && ih > 0) {
    for (let t = 0; t < 48; t++) {
      const x = r.x + m + Math.floor(rng() * iw);
      const y = r.y + m + Math.floor(rng() * ih);
      if (inB(w, x, y) && w.tiles[idx(w, x, y)] === Tl.DFLOOR) return { x, y };
    }
  }
  return null;
}

/** Любая клетка пола внутри комнаты (страховка). */
function anyFloorInRoom(w: WorldData, r: LayoutRoom): Vec | null {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++)
      if (inB(w, x, y) && w.tiles[idx(w, x, y)] === Tl.DFLOOR) return { x, y };
  return null;
}

function roomFloorTile(w: WorldData, r: LayoutRoom, rng: () => number): Vec | null {
  return randomFloorInRoom(w, r, rng) ?? anyFloorInRoom(w, r);
}

function genCrypt(seed: number, cfg: DungeonCfg, exitSpot: Vec): WorldData {
  const rng = mulberry((seed ^ 0x5eed) + cfg.id * 7919);
  const baseSeed = (seed ^ 0x5eed) + cfg.id * 7919;
  const W = CRYPT_W, H = CRYPT_H;

  let w = baseDungeon(cfg, W, H, exitSpot);
  let layout: DungeonLayout | null = null;
  let bossEntrance: Vec | null = null;

  // До 20 попыток: планировка пересобирается, пока не пройдёт проверку связности.
  for (let attempt = 0; attempt < 20; attempt++) {
    const lrng = mulberry(baseSeed + attempt * 104729);
    const candidate = generateLayout(lrng, W, H, CRYPT_LAYOUT);
    if (!candidate) continue;
    const map = baseDungeon(cfg, W, H, exitSpot);
    const carved = carveLayout(map.tiles, W, H, candidate, lrng, Tl.DFLOOR, CRYPT_LAYOUT);
    const be = candidate.edges.find((e) => e.a === candidate.boss || e.b === candidate.boss);
    const expected = be ? be.width : undefined;
    const check = validateLayout(map.tiles, W, H, candidate, Tl.DFLOOR, expected);
    if (!check.ok) continue;
    w = map;
    layout = candidate;
    bossEntrance = carved.bossEntrance;
    logger.info("dungeon", `genCrypt: планировка принята с попытки ${attempt} (комнат=${candidate.rooms.length}, рёбер=${candidate.edges.length})`);
    break;
  }

  if (!layout) {
    logger.warn("dungeon", "genCrypt: процедурная планировка не сложилась, резервная карта");
    return fallbackCrypt(cfg, exitSpot);
  }

  const rooms = layout.rooms;
  const dist = graphDistances(layout);

  // --- Вход: лестница и точка спавна в комнате входа ---
  const entryRoom = rooms[layout.entry];
  const stairPt = roomFloorTile(w, entryRoom, rng) ?? { x: Math.round(entryRoom.cx), y: Math.round(entryRoom.cy) };
  setTile(w, stairPt.x, stairPt.y, Tl.STAIRS);
  w.entryStairs = px(stairPt.x, stairPt.y);
  const spawnPt = roomFloorTile(w, entryRoom, rng) ?? stairPt;
  w.spawn = px(spawnPt.x, spawnPt.y);

  // --- Комната босса и дверь (единственный проход) ---
  const bossRoom = rooms[layout.boss];
  w.bossRoom = { x: bossRoom.x * 16, y: bossRoom.y * 16, w: bossRoom.w * 16, h: bossRoom.h * 16 };
  w.bossSpot = px(Math.round(bossRoom.cx), Math.round(bossRoom.cy));
  if (bossEntrance) w.doors.push({ x: bossEntrance.x * 16 + 8, y: bossEntrance.y * 16 + 8 });

  // --- Колонны в больших залах (до сундуков, чтобы не занять их клетки) ---
  for (let i = 0; i < rooms.length; i++) {
    if (i === layout.entry || i === layout.boss) continue;
    const r = rooms[i];
    if (r.w < 11 || r.h < 8) continue;
    for (const [dx, dy] of [[2, 2], [r.w - 3, 2], [2, r.h - 3], [r.w - 3, r.h - 3]] as [number, number][]) {
      const x = r.x + dx, y = r.y + dy;
      if (!inB(w, x, y) || w.tiles[idx(w, x, y)] !== Tl.DFLOOR) continue;
      // Колонна — только на открытой площадке (не перекрывая проходы).
      let open = true;
      for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        if (!inB(w, x + nx, y + ny) || w.tiles[idx(w, x + nx, y + ny)] !== Tl.DFLOOR) { open = false; break; }
      }
      if (open) setTile(w, x, y, Tl.COLUMN);
    }
  }

  // --- Ключ — в самой далёкой от входа комнате (кроме босса) ---
  let keyRoom = -1, keyDist = -1;
  for (let i = 0; i < rooms.length; i++) {
    if (i === layout.entry || i === layout.boss) continue;
    if (dist[i] > keyDist) { keyDist = dist[i]; keyRoom = i; }
  }
  if (keyRoom >= 0) {
    const p = roomFloorTile(w, rooms[keyRoom], rng);
    if (p) w.chests.push({ x: p.x, y: p.y, item: "key" });
  }
  for (let i = 0; i < rooms.length; i++) {
    if (i === layout.entry || i === layout.boss || i === keyRoom) continue;
    if (rng() < 0.42) {
      const p = roomFloorTile(w, rooms[i], rng);
      if (p) w.chests.push({ x: p.x, y: p.y, item: rng() < 0.3 ? "heartPiece" : "arrows" });
    }
  }

  // --- Враги: плотность растёт с размером комнаты и расстоянием от входа ---
  for (let i = 0; i < rooms.length; i++) {
    if (i === layout.entry) continue;
    const r = rooms[i];
    let n = Math.max(1, Math.min(4, Math.round((r.w * r.h) / 22)));
    if (i === layout.boss) n = Math.min(n, 2);
    if (dist[i] > 1) n += Math.min(2, dist[i] - 1);
    for (let k = 0; k < n; k++) {
      const p = roomFloorTile(w, r, rng);
      if (!p) break;
      w.spawns.push({ kind: cfg.pool[Math.floor(rng() * cfg.pool.length)], x: p.x * 16 + 8, y: p.y * 16 + 8 });
    }
  }

  // --- Декор: осколки/кости ---
  const ambientCount = 4 + Math.floor(rng() * 4);
  for (let k = 0; k < ambientCount; k++) {
    const i = Math.floor(rng() * rooms.length);
    if (i === layout.entry || i === layout.boss) continue;
    const p = roomFloorTile(w, rooms[i], rng);
    if (p) w.ambient.push({ kind: rng() < 0.5 ? "shard" : "bones", x: p.x, y: p.y });
  }

  finalizeDungeon(w, rng, cfg, cfg.pool);
  return w;
}

/** Резервная карта Склепа (если процедурная планировка не сложилась). */
function fallbackCrypt(cfg: DungeonCfg, exitSpot: Vec): WorldData {
  const w = baseDungeon(cfg, CRYPT_W, CRYPT_H, exitSpot);
  // Главный зал
  for (let y = 26; y < 54; y++) for (let x = 12; x < 76; x++) setTile(w, x, y, Tl.DFLOOR);
  // Арена босса
  const BRX = 30, BRY = 6, BRW = 28, BRH = 16;
  for (let y = BRY; y < BRY + BRH; y++) for (let x = BRX; x < BRX + BRW; x++) setTile(w, x, y, Tl.DFLOOR);
  // Единственный проход босс → зал (ширина 2)
  for (let y = BRY + BRH - 1; y <= 27; y++) for (let x = 43; x <= 44; x++) setTile(w, x, y, Tl.DFLOOR);
  w.bossRoom = { x: BRX * 16, y: BRY * 16, w: BRW * 16, h: BRH * 16 };
  w.bossSpot = px(BRX + Math.floor(BRW / 2), BRY + Math.floor(BRH / 2));
  w.doors.push({ x: 43.5 * 16 + 8, y: (BRY + BRH) * 16 + 8 });
  setTile(w, 44, 50, Tl.STAIRS);
  w.entryStairs = px(44, 50);
  w.spawn = px(44, 49);
  w.chests.push({ x: 16, y: 30, item: "key" }, { x: 70, y: 50, item: "arrows" });
  w.spawns.push(
    { kind: cfg.pool[0], x: 20 * 16 + 8, y: 34 * 16 + 8 },
    { kind: cfg.pool[1 % cfg.pool.length], x: 66 * 16 + 8, y: 44 * 16 + 8 },
    { kind: cfg.pool[2 % cfg.pool.length], x: 44 * 16 + 8, y: 12 * 16 + 8 },
  );
  finalizeDungeon(w, mulberry((cfg.id * 7919) ^ 0x5eed), cfg, cfg.pool);
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
    w.bossRoom = { x: minx * 16, y: miny * 16, w: (maxx - minx + 1) * 16, h: (maxy - miny + 1) * 16 };
    w.bossSpot = px(Math.round(big.cx), Math.round(big.cy));

    let keyRegion = regions[regions.length - 1];
    let bd = -1;
    for (const r of regions) {
      if (r === big) continue;
      const d = Math.hypot(r.cx - ex, r.cy - ey);
      if (d > bd) { bd = d; keyRegion = r; }
    }
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const kx = clamp(Math.round(keyRegion.cx), 2, W - 3), ky = clamp(Math.round(keyRegion.cy), 2, H - 3);
    w.chests.push({ x: kx, y: ky, item: "key" });
    w.spawns.push({ kind: "shroom", x: kx * 16 + 8, y: (ky - 2) * 16 + 8 });
    w.spawns.push({ kind: "shroom", x: (kx + 2) * 16 + 8, y: ky * 16 + 8 });
    for (let r = 1; r < Math.min(4, regions.length); r++) {
      const reg = regions[r];
      w.chests.push({ x: clamp(Math.round(reg.cx) + 1, 2, W - 3), y: clamp(Math.round(reg.cy), 2, H - 3), item: rng() < 0.5 ? "arrows" : "heartPiece" });
    }

    let sp = 0;
    for (const r of regions) {
      if (r === big || sp > 9) break;
      const n = 1 + Math.floor(arng() * 2);
      for (let k = 0; k < n; k++) {
        const c = r.cells[Math.floor(arng() * r.cells.length)];
        w.spawns.push({ kind: arng() < 0.6 ? "shroom" : "crawler", x: (c % W) * 16 + 8, y: Math.floor(c / W) * 16 + 8 });
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
  w.bossRoom = { x: 22 * 16, y: 16 * 16, w: 14 * 16, h: 11 * 16 };
  w.bossSpot = px(29, 22);
  w.chests.push({ x: 15, y: 14, item: "key" }, { x: 42, y: 26, item: "arrows" });
  w.spawns.push({ kind: "shroom", x: 20 * 16 + 8, y: 26 * 16 + 8 }, { kind: "crawler", x: 38 * 16 + 8, y: 18 * 16 + 8 });
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
  w.bossRoom = { x: bx0 * 16, y: by0 * 16, w: BW * 16, h: BH * 16 };
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
        x: (roomX(c) + 2 + Math.floor(rng() * (RW - 4))) * 16 + 8,
        y: (roomY(r) + 2 + Math.floor(rng() * (RH - 4))) * 16 + 8,
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
