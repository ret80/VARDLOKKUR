/* Генерация данжинов: Склеп, Корень Иггдрасиля, Каменная Крепость */
import { mulberry } from "../noise";
import { px } from "../utils";
import { WorldData, Vec, Tl, idx, inB, EnemyKind, DungeonCfg, isSolidTileId, type DoorDir, type DoorSpec } from "./types";
import { tileAt, setTile, floodReach } from "./utils";
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

function finalizeDungeon(w: WorldData, rng: () => number, cfg: DungeonCfg, pool: EnemyKind[], maxSpawns = 24) {
  // Дверь босса: если генератор уже задал её (w.doors не пуст) — не трогаем.
  if (w.doors.length === 0) {
    const br = w.bossRoom;
    const bx = Math.floor(br.x / 16), by = Math.floor(br.y / 16);
    const bw = Math.floor(br.w / 16), bh = Math.floor(br.h / 16);
    const doorCandidates: DoorSpec[] = [];
    for (let x = bx; x < bx + bw; x++) {
      for (const [y, dy] of [[by - 1, -1], [by + bh, 1]] as [number, number][]) {
        if (tileAt(w, x, y) === Tl.DFLOOR && tileAt(w, x, y + dy) !== Tl.DFLOOR) {
          doorCandidates.push({ ...px(x, y), dir: dy < 0 ? "up" : "down" });
        }
      }
    }
    for (let y = by; y < by + bh; y++) {
      for (const [x, dx] of [[bx - 1, -1], [bx + bw, 1]] as [number, number][]) {
        if (tileAt(w, x, y) === Tl.DFLOOR && tileAt(w, x + dx, y) !== Tl.DFLOOR) {
          doorCandidates.push({ ...px(x, y), dir: dx < 0 ? "left" : "right" });
        }
      }
    }
    doorCandidates.sort((a, b) => Math.abs(a.x - w.bossSpot.x) - Math.abs(b.x - w.bossSpot.x));
    if (doorCandidates.length) w.doors.push(doorCandidates[0]);
    else w.doors.push({ ...px(bx + Math.floor(bw / 2), by + bh), dir: "down" });
  }

  for (const c of w.chests) setTile(w, c.x, c.y, Tl.DFLOOR);

  // Подземелья стали крупнее (id 0 — 88×60), поэтому лимит спавнов выше.
  // Крупная пещера Корня Иггдрасиля передаёт свой лимит через maxSpawns.
  if (w.spawns.length > maxSpawns) w.spawns.length = maxSpawns;
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
  let bossDir: DoorDir = "down";

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
    bossDir = carved.bossDir ?? "down";
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
  if (bossEntrance) w.doors.push({ x: bossEntrance.x * 16 + 8, y: bossEntrance.y * 16 + 8, dir: bossDir });

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
  w.doors.push({ x: 43.5 * 16 + 8, y: (BRY + BRH) * 16 + 8, dir: "down" });
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

// Корень Иггдрасиля — пещерный лабиринт (DFS-лабиринт, «растрёпанный» в пещеру)
// с отдельной герметичной ареной босса.
const ROOT_W = 60, ROOT_H = 45;
/** Сторона клетки пещерного лабиринта (в тайлах). */
const ROOT_CS = 5;
/** Внутренний прямоугольник арены босса (в тайлах). */
const ROOT_ARENA_AX = 22, ROOT_ARENA_AY = 3, ROOT_ARENA_W = 17, ROOT_ARENA_H = 12;
/** Лимит врагов: лабиринт просторнее Склепа, поэтому спавнов больше. */
const ROOT_MAX_SPAWNS = 30;

/** Тайл входит в зарезервированный под арену босса блок (кольцо + зал). */
function rootArenaReserved(x: number, y: number): boolean {
  return x >= ROOT_ARENA_AX - 1 && x <= ROOT_ARENA_AX + ROOT_ARENA_W &&
         y >= ROOT_ARENA_AY - 1 && y <= ROOT_ARENA_AY + ROOT_ARENA_H;
}

/**
 * Пещерный лабиринт: DFS-лабиринт на грубой сетке (коридоры шириной 2 тайла),
 * затем петли и «растрёпанные» края — получается извилистая пещера.
 * Клетки, пересекающие блок арены босса, из лабиринта исключаются.
 */
function carveRootLabyrinth(w: WorldData, arng: () => number): void {
  const W = w.W, H = w.H;
  const MW = Math.floor((W - 2) / ROOT_CS), MH = Math.floor((H - 2) / ROOT_CS);
  const x0 = (cx: number) => 1 + cx * ROOT_CS;
  const y0 = (cy: number) => 1 + cy * ROOT_CS;
  const dig = (x: number, y: number) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) w.tiles[y * W + x] = Tl.DFLOOR; };
  const cellFloor = (cx: number, cy: number) => {
    const bx = x0(cx), by = y0(cy);
    for (let y = by + 1; y <= by + 2; y++) for (let x = bx + 1; x <= bx + 2; x++) dig(x, y);
  };
  const passage = (cx: number, cy: number, nx: number, ny: number) => {
    const bx = x0(cx), by = y0(cy);
    if (nx === cx + 1) { const x = bx + 3; for (let y = by + 1; y <= by + 2; y++) { dig(x, y); dig(x + 1, y); } }
    else if (nx === cx - 1) { const x = x0(nx) + 3; for (let y = by + 1; y <= by + 2; y++) { dig(x, y); dig(x + 1, y); } }
    else if (ny === cy + 1) { const y = by + 3; for (let x = bx + 1; x <= bx + 2; x++) { dig(x, y); dig(x, y + 1); } }
    else { const y = y0(ny) + 3; for (let x = bx + 1; x <= bx + 2; x++) { dig(x, y); dig(x, y + 1); } }
  };
  const blocked = (cx: number, cy: number) => {
    const bx = x0(cx), by = y0(cy);
    return rootArenaReserved(bx, by) || rootArenaReserved(bx + ROOT_CS, by) ||
           rootArenaReserved(bx, by + ROOT_CS) || rootArenaReserved(bx + ROOT_CS, by + ROOT_CS) ||
           rootArenaReserved(bx + 2, by + 2);
  };
  const isBlocked = new Uint8Array(MW * MH);
  for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) if (blocked(cx, cy)) isBlocked[cy * MW + cx] = 1;

  // Стартовая клетка — первая свободная.
  let sx = -1, sy = -1;
  for (let cy = 0; cy < MH && sx < 0; cy++) for (let cx = 0; cx < MW; cx++) if (!isBlocked[cy * MW + cx]) { sx = cx; sy = cy; break; }
  if (sx < 0) return;

  const visited = new Uint8Array(MW * MH);
  visited[sy * MW + sx] = 1; cellFloor(sx, sy);
  const stack: [number, number][] = [[sx, sy]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = dirs.length - 1; i > 0; i--) { const j = Math.floor(arng() * (i + 1)); const t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t; }
    let moved = false;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const ni = ny * MW + nx;
      if (visited[ni] || isBlocked[ni]) continue;
      visited[ni] = 1; cellFloor(nx, ny); passage(cx, cy, nx, ny);
      stack.push([nx, ny]); moved = true; break;
    }
    if (!moved) stack.pop();
  }

  // Петли: иногда убираем стену между соседними клетками — пещера не должна быть чистым деревом.
  for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) {
    if (isBlocked[cy * MW + cx]) continue;
    if (cx + 1 < MW && !isBlocked[cy * MW + cx + 1] && arng() < 0.22) passage(cx, cy, cx + 1, cy);
    if (cy + 1 < MH && !isBlocked[(cy + 1) * MW + cx] && arng() < 0.22) passage(cx, cy, cx, cy + 1);
  }

  // «Растрёпанные» края + сглаживание: стены у пола с шансом становятся полом,
  // а тонкие выступы срезаются. Обе операции только добавляют пол (не рвут связность).
  const isFloor = (x: number, y: number) => w.tiles[y * W + x] === Tl.DFLOOR;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x;
    if (w.tiles[i] === Tl.DFLOOR || rootArenaReserved(x, y)) continue;
    const nf = (isFloor(x - 1, y) ? 1 : 0) + (isFloor(x + 1, y) ? 1 : 0) + (isFloor(x, y - 1) ? 1 : 0) + (isFloor(x, y + 1) ? 1 : 0);
    if (nf > 0 && arng() < 0.42) w.tiles[i] = Tl.DFLOOR;
  }
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x;
    if (w.tiles[i] === Tl.DFLOOR || rootArenaReserved(x, y)) continue;
    const nf = (isFloor(x - 1, y) ? 1 : 0) + (isFloor(x + 1, y) ? 1 : 0) + (isFloor(x, y - 1) ? 1 : 0) + (isFloor(x, y + 1) ? 1 : 0);
    if (nf >= 3) w.tiles[i] = Tl.DFLOOR;
  }
}

/**
 * Соединить весь недостижимый пол с достижимым: BFS сквозь породу от уже
 * достижимых тайлов до ближайшего отрезанного, затем прорубить путь.
 * Запретные тайлы (кольцо арены босса) не трогаем — обходим их.
 */
function connectRootFloor(w: WorldData, ex: number, ey: number, forbidden: (x: number, y: number) => boolean): void {
  const W = w.W, H = w.H, N = W * H;
  for (let guard = 0; guard < 64; guard++) {
    const reach = floodReach(w, ex, ey);
    let target = -1;
    for (let i = 0; i < N; i++) if (w.tiles[i] === Tl.DFLOOR && !reach[i]) { target = i; break; }
    if (target < 0) return;

    const prev = new Int32Array(N).fill(-1);
    const seen = new Uint8Array(N);
    const q: number[] = [];
    for (let i = 0; i < N; i++) if (reach[i]) { seen[i] = 1; q.push(i); }
    let found = false;
    for (let qi = 0; qi < q.length && !found; qi++) {
      const c = q[qi];
      const x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const ni = ny * W + nx;
        if (seen[ni] || forbidden(nx, ny)) continue;
        seen[ni] = 1; prev[ni] = c; q.push(ni);
        if (ni === target) { found = true; break; }
      }
    }
    if (!found) return; // принципиально недостижимо
    for (let c = target; c >= 0; c = prev[c]) w.tiles[c] = Tl.DFLOOR;
  }
}

/**
 * Собрать Корень Иггдрасиля: лабиринт-пещера, вход снизу, герметичная арена
 * босса наверху, сундуки и враги. true — уровень пригоден для игры.
 */
function buildRootDungeon(w: WorldData, arng: () => number, rng: () => number, cfg: DungeonCfg): boolean {
  const W = w.W, H = w.H;
  carveRootLabyrinth(w, arng);

  // Вход снизу: площадка, лестница и прорубленный вверх подход до пола пещеры.
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

  // Мелкие полости (уже прохода игрока) засыпаем — они остались от «растрёпанных» краёв.
  const seen = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (w.tiles[i] !== Tl.DFLOOR || seen[i]) continue;
    const q = [i]; seen[i] = 1;
    const cells: number[] = [];
    while (q.length) {
      const c = q.pop()!; cells.push(c);
      const cx = c % W, cy = Math.floor(c / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const ni = (cy + dy) * W + cx + dx;
        if (w.tiles[ni] === Tl.DFLOOR && !seen[ni]) { seen[ni] = 1; q.push(ni); }
      }
    }
    if (cells.length < 14) for (const c of cells) w.tiles[c] = Tl.DWALL;
  }

  // Арена босса: зал, обнесённый кольцом стен, с единственным проходом вниз.
  const dcx = ROOT_ARENA_AX + (ROOT_ARENA_W >> 1);
  for (let y = ROOT_ARENA_AY; y < ROOT_ARENA_AY + ROOT_ARENA_H; y++)
    for (let x = ROOT_ARENA_AX; x < ROOT_ARENA_AX + ROOT_ARENA_W; x++) setTile(w, x, y, Tl.DFLOOR);
  for (let x = ROOT_ARENA_AX - 1; x <= ROOT_ARENA_AX + ROOT_ARENA_W; x++) {
    setTile(w, x, ROOT_ARENA_AY - 1, Tl.DWALL);
    setTile(w, x, ROOT_ARENA_AY + ROOT_ARENA_H, Tl.DWALL);
  }
  for (let y = ROOT_ARENA_AY; y < ROOT_ARENA_AY + ROOT_ARENA_H; y++) {
    setTile(w, ROOT_ARENA_AX - 1, y, Tl.DWALL);
    setTile(w, ROOT_ARENA_AX + ROOT_ARENA_W, y, Tl.DWALL);
  }
  setTile(w, dcx - 1, ROOT_ARENA_AY + ROOT_ARENA_H, Tl.DFLOOR);
  setTile(w, dcx, ROOT_ARENA_AY + ROOT_ARENA_H, Tl.DFLOOR);
  setTile(w, dcx - 1, ROOT_ARENA_AY + ROOT_ARENA_H, Tl.DFLOOR);
  setTile(w, dcx, ROOT_ARENA_AY + ROOT_ARENA_H, Tl.DFLOOR);
  // Проход вниз: первый шаг прорубаем всегда, дальше идём до первого пола лабиринта.
  let dy = ROOT_ARENA_AY + ROOT_ARENA_H + 1;
  setTile(w, dcx - 1, dy, Tl.DFLOOR);
  setTile(w, dcx, dy, Tl.DFLOOR);
  dy++;
  while (dy < H - 1 && tileAt(w, dcx - 1, dy) !== Tl.DFLOOR && tileAt(w, dcx, dy) !== Tl.DFLOOR) {
    setTile(w, dcx - 1, dy, Tl.DFLOOR);
    setTile(w, dcx, dy, Tl.DFLOOR);
    dy++;
  }
  w.bossRoom = { x: ROOT_ARENA_AX * 16, y: ROOT_ARENA_AY * 16, w: ROOT_ARENA_W * 16, h: ROOT_ARENA_H * 16 };
  w.bossSpot = px(dcx, ROOT_ARENA_AY + (ROOT_ARENA_H >> 1));
  w.doors.push({ x: dcx * 16, y: (ROOT_ARENA_AY + ROOT_ARENA_H) * 16 + 8, dir: "down" });
  const inArena = (x: number, y: number) =>
    x >= ROOT_ARENA_AX && x < ROOT_ARENA_AX + ROOT_ARENA_W && y >= ROOT_ARENA_AY && y < ROOT_ARENA_AY + ROOT_ARENA_H;

  // Связность: прорубаем проходы сквозь породу ко всему отрезанному полу,
  // обходя кольцо арены, — лабиринт должен быть единым.
  connectRootFloor(w, ex, ey - 1, rootArenaReserved);

  // Клетки пола вне арены — для сундуков и врагов.
  const floorCells: Vec[] = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (tileAt(w, x, y) !== Tl.DFLOOR || inArena(x, y)) continue;
    floorCells.push({ x, y });
  }

  if (floorCells.length >= 40) {
    // Ключ — в самой дальней точке лабиринта, плюс пара сундуков вразброс.
    floorCells.sort((a, b) => Math.hypot(b.x - ex, b.y - ey) - Math.hypot(a.x - ex, a.y - ey));
    const used = new Set<number>();
    const key = floorCells[0];
    w.chests.push({ x: key.x, y: key.y, item: "key" });
    used.add(key.y * W + key.x);
    for (let i = 0, taken = 0; i < floorCells.length && taken < 3; i += 11) {
      const c = floorCells[i], ci = c.y * W + c.x;
      if (used.has(ci) || Math.hypot(c.x - ex, c.y - ey) < 9) continue;
      used.add(ci);
      w.chests.push({ x: c.x, y: c.y, item: rng() < 0.5 ? "arrows" : "heartPiece" });
      taken++;
    }

    // Враги: плотность по площади лабиринта, с уклоном в грибы.
    const target = Math.max(16, Math.min(ROOT_MAX_SPAWNS - 2, Math.round(floorCells.length / 42)));
    let placed = 0;
    for (let i = 0; i < floorCells.length && placed < target; i++) {
      const c = floorCells[i], ci = c.y * W + c.x;
      if (used.has(ci) || Math.hypot(c.x - ex, c.y - ey) < 6) continue;
      if (rng() < 0.35) continue; // разрядить плотность
      used.add(ci);
      const roll = rng();
      const kind: EnemyKind = roll < 0.62 ? "shroom" : roll < 0.86 ? "crawler" : "raven";
      w.spawns.push({ kind, x: c.x * 16 + 8, y: c.y * 16 + 8 });
      placed++;
    }

    // Стражи внутри арены.
    for (let k = 0; k < 2; k++) {
      const gx = ROOT_ARENA_AX + 2 + Math.floor(rng() * (ROOT_ARENA_W - 4));
      const gy = ROOT_ARENA_AY + 2 + Math.floor(rng() * (ROOT_ARENA_H - 4));
      w.spawns.push({ kind: k === 0 ? "shroom" : "crawler", x: gx * 16 + 8, y: gy * 16 + 8 });
    }
  }

  const reach = floodReach(w, ex, ey - 1);
  const bossReachable = reach[idx(w, dcx, ROOT_ARENA_AY + (ROOT_ARENA_H >> 1))] === 1;
  finalizeDungeon(w, rng, cfg, cfg.pool, ROOT_MAX_SPAWNS);
  return floorCells.length >= 40 && bossReachable;
}

// Корень Иггдрасиля
function genRoot(seed: number, cfg: DungeonCfg, exitSpot: Vec): WorldData {
  const rng = mulberry((seed ^ 0x5eed) + cfg.id * 7919);
  for (let attempt = 0; attempt < 6; attempt++) {
    const w = baseDungeon(cfg, ROOT_W, ROOT_H, exitSpot);
    const arng = mulberry(seed + attempt * 101 + cfg.id * 31);
    if (buildRootDungeon(w, arng, rng, cfg)) return w;
  }
  // Страховка: детерминированный seed (лабиринт всегда даёт пол).
  const w = baseDungeon(cfg, ROOT_W, ROOT_H, exitSpot);
  const arng = mulberry((cfg.id * 7919) ^ 0xbad);
  buildRootDungeon(w, arng, rng, cfg);
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
