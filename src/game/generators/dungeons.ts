/* Генерация данжинов: Склеп, Корень Иггдрасиля, Каменная Крепость */
import { mulberry } from "../noise";
import { px } from "../utils";
import { WorldData, Vec, Tl, idx, inB, EnemyKind, DungeonCfg, isSolidTileId } from "./types";
import { tileAt, setTile } from "./utils";
import { NavBuilder } from "./nav-builder";

function baseDungeon(cfg: DungeonCfg, W: number, H: number, exitSpot: Vec): WorldData {
  return {
    W, H, tiles: new Uint8Array(W * H).fill(Tl.DWALL), nav: null as unknown as import("navmesh").NavMesh,
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
  w.bossRoom = { x: BRX * 16, y: BRY * 16, w: BRW * 16, h: BRH * 16 };
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
        x: (cellX(cell.c) + 2 + Math.floor(rng() * 4)) * 16 + 8,
        y: (cellY(cell.r) + 2 + Math.floor(rng() * 3)) * 16 + 8,
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
