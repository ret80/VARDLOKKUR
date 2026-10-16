/* dungeon-layout.ts — процедурная планировка подземелья: комнаты + граф + коридоры.
 *
 * Чистая детерминированная логика (без ECS и рендера): по seed-генератору
 * строит набор комнат разного размера и формы, связывает их графом
 * (MST + дополнительные рёбра-циклы) и вырезает пол в Uint8Array.
 *
 * Схема — «cyclic room-and-corridor» (TinyKeep / Adonaac, современная
 * альтернатива BSP и клеточному автомату):
 *   1) размещение непересекающихся комнат разного размера (с паддингом);
 *   2) форма комнаты: rect / L / cross / round (выбирается детерминированно);
 *   3) граф: полный список рёбер → MST (гарантия связности) → доп. рёбра (циклы);
 *   4) вход — комната у нижнего края; босс — ЛИСТ MST, самый далёкий от входа;
 *   5) коридоры L-формы (ширина 2, главный путь 2→3), босс-коридор — последним.
 *
 * Модуль не знает про Tl: тайл пола передаётся в carveLayout/validateLayout.
 */

import type { DoorDir } from "./types";

/** Форма комнаты */
export type RoomShape = "rect" | "L" | "cross" | "round";
/** Роль комнаты */
export type RoomKind = "normal" | "entry" | "boss";

export interface LayoutRoom {
  /** Левый верхний угол (тайлы) */
  x: number;
  y: number;
  /** Размер (тайлы) */
  w: number;
  h: number;
  /** Центр (тайлы, дробный) */
  cx: number;
  cy: number;
  shape: RoomShape;
  kind: RoomKind;
}

export interface LayoutEdge {
  a: number;
  b: number;
  /** Ширина коридора (тайлы), 2 или 3 */
  width: number;
}

export interface DungeonLayout {
  rooms: LayoutRoom[];
  edges: LayoutEdge[];
  entry: number;
  boss: number;
}

export interface LayoutOptions {
  /** Сколько комнат пытаться разместить */
  targetRooms: number;
  /** Минимум комнат для успешной генерации */
  minRooms: number;
  /** Отступ от краёв карты (тайлы) */
  margin: number;
  /** Минимальный зазор между комнатами (тайлы) */
  padding: number;
  /** Базовая ширина коридора */
  corridorWidth: number;
  /** Ширина коридора главного пути (вход → босс) */
  mainWidth: number;
  /** Минимальный размер арены босса */
  bossMinW: number;
  bossMinH: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  targetRooms: 14,
  minRooms: 8,
  margin: 3,
  padding: 2,
  corridorWidth: 2,
  mainWidth: 3,
  bossMinW: 15,
  bossMinH: 11,
};

export interface CarveResult {
  /** Центр единственного прохода в комнату босса (тайлы, дробный) или null. */
  bossEntrance: { x: number; y: number } | null;
  /** Сколько тайлов прохода открыто в стене комнаты босса. */
  bossOpenings: number;
  /** Сторона стены комнаты босса, в которой пробит проход (или null). */
  bossDir: DoorDir | null;
}

export interface ValidationResult {
  ok: boolean;
  /** Сколько комнат недостижимо от входа (по полу). */
  unreachable: number;
  /** Сколько проходов открыто в стене комнаты босса. */
  bossOpenings: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/* ===================== размещение комнат ===================== */

/** Категории размеров комнат (базовый размер + вес выбора) */
const SIZE_CATS: readonly { w: number; h: number; weight: number }[] = [
  { w: 6, h: 5, weight: 3 }, // малая
  { w: 9, h: 7, weight: 4 }, // средняя
  { w: 12, h: 9, weight: 2 }, // большая
  { w: 15, h: 6, weight: 1 }, // галерея (широкая)
  { w: 6, h: 12, weight: 1 }, // галерея (высокая)
];

const SHAPES: readonly { s: RoomShape; weight: number }[] = [
  { s: "rect", weight: 5 },
  { s: "L", weight: 3 },
  { s: "cross", weight: 1 },
  { s: "round", weight: 2 },
];

function weightedPick<T extends { weight: number }>(rng: () => number, items: readonly T[]): T {
  let total = 0;
  for (const it of items) total += it.weight;
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function rectOverlaps(x: number, y: number, w: number, h: number, r: Rect, pad: number): boolean {
  return x < r.x + r.w + pad && x + w + pad > r.x && y < r.y + r.h + pad && y + h + pad > r.y;
}

/** Форма зависит от размера: мелким комнатам сложные формы не идут. */
function pickShape(rng: () => number, w: number, h: number): RoomShape {
  const allowed: { s: RoomShape; weight: number }[] = [];
  for (const it of SHAPES) {
    if (it.s === "rect") allowed.push(it);
    else if (it.s === "L" && w >= 7 && h >= 6) allowed.push(it);
    else if (it.s === "cross" && w >= 9 && h >= 8) allowed.push(it);
    else if (it.s === "round" && w >= 7 && h >= 6) allowed.push(it);
  }
  return weightedPick(rng, allowed).s;
}

function placeRooms(rng: () => number, W: number, H: number, opts: LayoutOptions): LayoutRoom[] {
  const rooms: LayoutRoom[] = [];
  const maxAttempts = opts.targetRooms * 60;
  for (let attempt = 0; attempt < maxAttempts && rooms.length < opts.targetRooms; attempt++) {
    const cat = weightedPick(rng, SIZE_CATS);
    const maxW = W - 2 * opts.margin;
    const maxH = H - 2 * opts.margin;
    const w = Math.max(5, Math.min(maxW, cat.w + Math.floor(rng() * 3) - 1));
    const h = Math.max(5, Math.min(maxH, cat.h + Math.floor(rng() * 3) - 1));
    const x = opts.margin + Math.floor(rng() * (W - w - 2 * opts.margin + 1));
    const y = opts.margin + Math.floor(rng() * (H - h - 2 * opts.margin + 1));
    let ok = true;
    for (const r of rooms) {
      if (rectOverlaps(x, y, w, h, r, opts.padding)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    rooms.push({ x, y, w, h, cx: x + w / 2, cy: y + h / 2, shape: pickShape(rng, w, h), kind: "normal" });
  }
  return rooms;
}

/* ===================== граф ===================== */

const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

function roomDist(rooms: LayoutRoom[], a: number, b: number): number {
  return Math.hypot(rooms[a].cx - rooms[b].cx, rooms[a].cy - rooms[b].cy);
}

/** Kruskal-MST (по всем парам) + дополнительные рёбра-циклы. */
function buildGraph(
  rooms: LayoutRoom[],
  rng: () => number,
  opts: LayoutOptions,
): { mst: LayoutEdge[]; extra: LayoutEdge[] } {
  const n = rooms.length;
  const all: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) all.push({ a: i, b: j, d: roomDist(rooms, i, j) });
  }
  all.sort((p, q) => p.d - q.d);

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const mst: LayoutEdge[] = [];
  const inTree = new Set<string>();
  for (const e of all) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    mst.push({ a: e.a, b: e.b, width: opts.corridorWidth });
    inTree.add(edgeKey(e.a, e.b));
    if (mst.length === n - 1) break;
  }

  // Циклы: часть нетривиальных рёбер, но только короткие (иначе «телепорты»).
  const meanD = all.reduce((s, e) => s + e.d, 0) / Math.max(1, all.length);
  const extra: LayoutEdge[] = [];
  for (const e of all) {
    if (inTree.has(edgeKey(e.a, e.b))) continue;
    if (e.d > meanD * 1.5) continue;
    if (rng() < 0.18) extra.push({ a: e.a, b: e.b, width: opts.corridorWidth });
  }

  return { mst, extra };
}

function bfsDist(adj: number[][], src: number): number[] {
  const dist = new Array<number>(adj.length).fill(-1);
  dist[src] = 0;
  const q = [src];
  for (let head = 0; head < q.length; head++) {
    const c = q[head];
    for (const nb of adj[c]) {
      if (dist[nb] < 0) {
        dist[nb] = dist[c] + 1;
        q.push(nb);
      }
    }
  }
  return dist;
}

/** Рёбра на пути entry → dst (в MST) — главный путь. */
function pathEdgeKeys(mst: LayoutEdge[], n: number, src: number, dst: number): Set<string> {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of mst) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  const prev = new Array<number>(n).fill(-2);
  prev[src] = -1;
  const q = [src];
  for (let head = 0; head < q.length; head++) {
    const c = q[head];
    for (const nb of adj[c]) {
      if (prev[nb] === -2) {
        prev[nb] = c;
        q.push(nb);
      }
    }
  }
  const keys = new Set<string>();
  let cur = dst;
  while (cur >= 0 && prev[cur] >= 0) {
    keys.add(edgeKey(cur, prev[cur]));
    cur = prev[cur];
  }
  return keys;
}

/** Комната входа: ближе всего к нижнему центру карты. */
function pickEntry(rooms: LayoutRoom[], W: number, H: number): number {
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    const score = (H - r.cy) + Math.abs(r.cx - W / 2) * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Босс: самый далёкий от входа ЛИСТ MST (чтобы комната была тупиковой). */
function pickBoss(rooms: LayoutRoom[], mst: LayoutEdge[], entry: number): number {
  const adj: number[][] = Array.from({ length: rooms.length }, () => []);
  for (const e of mst) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  const dist = bfsDist(adj, entry);
  let boss = -1;
  let bd = -1;
  for (let i = 0; i < rooms.length; i++) {
    if (i === entry) continue;
    if (adj[i].length === 1 && dist[i] > bd) {
      bd = dist[i];
      boss = i;
    }
  }
  if (boss < 0) {
    for (let i = 0; i < rooms.length; i++) {
      if (i === entry) continue;
      if (dist[i] > bd) {
        bd = dist[i];
        boss = i;
      }
    }
  }
  return boss;
}

/** Расширить комнату босса до арены (по свободному месту). */
function expandRoom(
  rooms: LayoutRoom[],
  idx: number,
  W: number,
  H: number,
  minW: number,
  minH: number,
  padding: number,
): void {
  const r = rooms[idx];
  const others = rooms.filter((_, i) => i !== idx);
  const free = (nx: number, ny: number, nw: number, nh: number): boolean =>
    nx >= 1 &&
    ny >= 1 &&
    nx + nw <= W - 1 &&
    ny + nh <= H - 1 &&
    !others.some((o) => rectOverlaps(nx, ny, nw, nh, o, padding));
  for (let guard = 0; guard < 400 && (r.w < minW || r.h < minH); guard++) {
    let grew = false;
    if (r.w < minW && free(r.x, r.y, r.w + 1, r.h)) {
      r.w++;
      grew = true;
    }
    if (r.h < minH && free(r.x, r.y, r.w, r.h + 1)) {
      r.h++;
      grew = true;
    }
    if (r.w < minW && free(r.x - 1, r.y, r.w + 1, r.h)) {
      r.x--;
      r.w++;
      grew = true;
    }
    if (r.h < minH && free(r.x, r.y - 1, r.w, r.h + 1)) {
      r.y--;
      r.h++;
      grew = true;
    }
    if (!grew) break;
  }
  r.cx = r.x + r.w / 2;
  r.cy = r.y + r.h / 2;
  r.shape = "rect";
}

/** Построить планировку. Возвращает null, если не удалось разместить достаточно комнат. */
export function generateLayout(
  rng: () => number,
  W: number,
  H: number,
  optsIn?: Partial<LayoutOptions>,
): DungeonLayout | null {
  const opts: LayoutOptions = { ...DEFAULT_LAYOUT, ...optsIn };
  const rooms = placeRooms(rng, W, H, opts);
  if (rooms.length < opts.minRooms) return null;

  const { mst, extra } = buildGraph(rooms, rng, opts);
  if (mst.length !== rooms.length - 1) return null; // граф несвязен

  const entry = pickEntry(rooms, W, H);
  const boss = pickBoss(rooms, mst, entry);
  if (boss < 0 || boss === entry) return null;

  // Рёбра: MST + циклы, но у босса ровно одно ребро (тупик).
  const edges: LayoutEdge[] = [...mst];
  for (const e of extra) {
    if (e.a === boss || e.b === boss) continue;
    edges.push(e);
  }

  // Главный путь (вход → босс) — шире. Но подход к боссу оставляем узким (2),
  // чтобы дверь (18px) реально перекрывала единственный проход.
  const mainPath = pathEdgeKeys(mst, rooms.length, entry, boss);
  for (const e of edges) e.width = mainPath.has(edgeKey(e.a, e.b)) ? opts.mainWidth : opts.corridorWidth;
  const bossEdge = edges.find((e) => e.a === boss || e.b === boss);
  if (bossEdge) bossEdge.width = opts.corridorWidth;

  expandRoom(rooms, boss, W, H, opts.bossMinW, opts.bossMinH, opts.padding);
  rooms[entry].kind = "entry";
  rooms[boss].kind = "boss";

  return { rooms, edges, entry, boss };
}

/* ===================== вырезание пола ===================== */

function isInsideShape(shape: RoomShape, x: number, y: number, r: LayoutRoom): boolean {
  const lx = x - r.x;
  const ly = y - r.y;
  switch (shape) {
    case "rect":
      return true;
    case "L": {
      // Вырезаем один угловой квадрант; центр комнаты всегда остаётся внутри.
      const nw = Math.max(2, Math.floor(r.w / 2) - 1);
      const nh = Math.max(2, Math.floor(r.h / 2) - 1);
      const corner = ((r.x * 31 + r.y * 17) >>> 0) % 4;
      const right = lx >= r.w - nw;
      const bottom = ly >= r.h - nh;
      const left = lx < nw;
      const top = ly < nh;
      switch (corner) {
        case 0:
          return !(right && bottom);
        case 1:
          return !(left && bottom);
        case 2:
          return !(left && top);
        default:
          return !(right && top);
      }
    }
    case "cross": {
      const cw = Math.max(2, Math.floor(r.w / 3));
      const ch = Math.max(2, Math.floor(r.h / 3));
      const inX = lx < cw || lx >= r.w - cw;
      const inY = ly < ch || ly >= r.h - ch;
      return !(inX && inY);
    }
    case "round": {
      // Скашиваем углы (манхэттенское расстояние до ближайшего угла).
      const k = Math.min(3, Math.max(1, Math.floor(Math.min(r.w, r.h) / 4)));
      const tl = lx + ly;
      const tr = r.w - 1 - lx + ly;
      const bl = lx + (r.h - 1 - ly);
      const br = r.w - 1 - lx + (r.h - 1 - ly);
      return Math.min(tl, tr, bl, br) >= k;
    }
  }
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

function carveH(
  set: (x: number, y: number) => void,
  x0: number,
  x1: number,
  y: number,
  width: number,
  protect?: Rect,
): void {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  for (let x = lo; x <= hi; x++) {
    for (let k = 0; k < width; k++) {
      const yy = y + k;
      if (protect && inRect(x, yy, protect)) continue;
      set(x, yy);
    }
  }
}

function carveV(
  set: (x: number, y: number) => void,
  y0: number,
  y1: number,
  x: number,
  width: number,
  protect?: Rect,
): void {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  for (let y = lo; y <= hi; y++) {
    for (let k = 0; k < width; k++) {
      const xx = x + k;
      if (protect && inRect(xx, y, protect)) continue;
      set(xx, y);
    }
  }
}

function carveRoom(set: (x: number, y: number) => void, r: LayoutRoom, forceRect: boolean): void {
  const shape: RoomShape = forceRect ? "rect" : r.shape;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (isInsideShape(shape, x, y, r)) set(x, y);
    }
  }
}

/** Пересечение интервалов [lo,hi); null, если пусто. */
function overlapLoHi(lo1: number, hi1: number, lo2: number, hi2: number): [number, number] | null {
  const lo = Math.max(lo1, lo2);
  const hi = Math.min(hi1, hi2);
  return lo < hi ? [lo, hi] : null;
}

/**
 * Начало полосы ширины width около v: целиком внутри [lo,hi] и не задевающая
 * forbidden-координаты (стены другой комнаты). Иначе — ближайшее допустимое.
 */
function safeBandStart(v: number, lo: number, hi: number, width: number, forbidden: number[]): number {
  const fits = (s: number) => s >= lo && s + width - 1 <= hi;
  const clean = (s: number) => {
    for (let k = 0; k < width; k++) if (forbidden.indexOf(s + k) >= 0) return false;
    return true;
  };
  const start = v - Math.floor((width - 1) / 2);
  if (fits(start) && clean(start)) return start;
  for (let d = 1; d <= 8; d++) {
    if (fits(start + d) && clean(start + d)) return start + d;
    if (fits(start - d) && clean(start - d)) return start - d;
  }
  return Math.max(lo, Math.min(hi - width + 1, start));
}

/**
 * Соединить комнаты L-коридором. Ось выбирается по НЕперекрывающейся стороне —
 * тогда дальняя комната всегда получает ровно один проход ширины width
 * (важно для герметичной двери босса).
 */
function carveCorridor(
  set: (x: number, y: number) => void,
  a: LayoutRoom,
  b: LayoutRoom,
  width: number,
  _rng: () => number,
  protect?: Rect,
): void {
  const aCx = Math.round(a.cx), aCy = Math.round(a.cy);
  const bCx = Math.round(b.cx), bCy = Math.round(b.cy);
  const xOv = overlapLoHi(a.x, a.x + a.w, b.x, b.x + b.w);
  const yOv = overlapLoHi(a.y, a.y + a.h, b.y, b.y + b.h);
  const horizontal = !xOv && yOv ? true : xOv && !yOv ? false : Math.abs(bCx - aCx) >= Math.abs(bCy - aCy);

  if (horizontal) {
    // Строка прохода: внутри перекрытия по Y (прямой ход), иначе — в A, не задевая стены B.
    const row = yOv
      ? safeBandStart(Math.floor((yOv[0] + yOv[1] - width) / 2), yOv[0], yOv[1] - 1, width, [])
      : safeBandStart(aCy, a.y, a.y + a.h - 1, width, [b.y - 1, b.y + b.h]);
    // Столбец — внутри B (вне A по X, поэтому стены A не мешают).
    const col = safeBandStart(bCx, b.x, b.x + b.w - 1, width, []);
    carveH(set, aCx, col + width - 1, row, width, protect);
    carveV(set, row, bCy, col, width, protect);
  } else {
    const col = xOv
      ? safeBandStart(Math.floor((xOv[0] + xOv[1] - width) / 2), xOv[0], xOv[1] - 1, width, [])
      : safeBandStart(aCx, a.x, a.x + a.w - 1, width, [b.x - 1, b.x + b.w]);
    const row = safeBandStart(bCy, b.y, b.y + b.h - 1, width, []);
    carveV(set, aCy, row + width - 1, col, width, protect);
    carveH(set, col, bCx, row, width, protect);
  }
}

/** Проходы (открытые тайлы) в стене-периметре комнаты босса. */
export function findBossOpenings(
  tiles: Uint8Array,
  W: number,
  H: number,
  b: LayoutRoom,
  floorTile: number,
): { x: number; y: number }[] {
  const isF = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && tiles[y * W + x] === floorTile;
  const out: { x: number; y: number }[] = [];
  for (let x = b.x; x < b.x + b.w; x++) {
    if (isF(x, b.y - 1) && isF(x, b.y - 2)) out.push({ x, y: b.y - 1 });
    if (isF(x, b.y + b.h) && isF(x, b.y + b.h + 1)) out.push({ x, y: b.y + b.h });
  }
  for (let y = b.y; y < b.y + b.h; y++) {
    if (isF(b.x - 1, y) && isF(b.x - 2, y)) out.push({ x: b.x - 1, y });
    if (isF(b.x + b.w, y) && isF(b.x + b.w + 1, y)) out.push({ x: b.x + b.w, y });
  }
  return out;
}

/**
 * Вырезать пол планировки в tiles.
 * Комнаты (кроме босса) и обычные коридоры вырезаются первыми; прямоугольник
 * босса защищается, чтобы случайный коридор не пробил лишний проход. Затем
 * вырезается комната босса и ровно один коридор к ней.
 */
export function carveLayout(
  tiles: Uint8Array,
  W: number,
  H: number,
  layout: DungeonLayout,
  rng: () => number,
  floorTile: number,
  _opts?: Partial<LayoutOptions>,
): CarveResult {
  const { rooms, edges, boss } = layout;
  const set = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = floorTile;
  };

  for (let i = 0; i < rooms.length; i++) {
    if (i !== boss) carveRoom(set, rooms[i], false);
  }

  const b = rooms[boss];
  const protect: Rect = { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 };
  const bossEdge = edges.find((e) => e.a === boss || e.b === boss);
  for (const e of edges) {
    if (e === bossEdge) continue;
    carveCorridor(set, rooms[e.a], rooms[e.b], e.width, rng, protect);
  }

  carveRoom(set, rooms[boss], true);
  if (bossEdge) {
    const other = bossEdge.a === boss ? bossEdge.b : bossEdge.a;
    carveCorridor(set, rooms[boss], rooms[other], bossEdge.width, rng, undefined);
  }

  const openings = findBossOpenings(tiles, W, H, rooms[boss], floorTile);
  const bossEntrance = openings.length
    ? {
        x: openings.reduce((s, o) => s + o.x, 0) / openings.length,
        y: openings.reduce((s, o) => s + o.y, 0) / openings.length,
      }
    : null;

  // Сторона стены арены, в которой пробит проход — направление двери.
  let bossDir: DoorDir | null = null;
  if (openings.length) {
    const o = openings[0];
    const br = rooms[boss];
    if (o.y < br.y) bossDir = "up";
    else if (o.y >= br.y + br.h) bossDir = "down";
    else if (o.x < br.x) bossDir = "left";
    else if (o.x >= br.x + br.w) bossDir = "right";
    else bossDir = "down";
  }

  return { bossEntrance, bossOpenings: openings.length, bossDir };
}

/** Проверка: пол связен от входа, все комнаты достижимы, у босса один проход. */
export function validateLayout(
  tiles: Uint8Array,
  W: number,
  H: number,
  layout: DungeonLayout,
  floorTile: number,
  expectedOpenings?: number,
): ValidationResult {
  const { rooms, entry, boss } = layout;
  const anchor = (r: LayoutRoom) => ({ x: Math.round(r.cx), y: Math.round(r.cy) });
  const entrance = anchor(rooms[entry]);
  const startIdx = entrance.y * W + entrance.x;
  const startOk = startIdx >= 0 && startIdx < W * H && tiles[startIdx] === floorTile;

  const reach = new Uint8Array(W * H);
  if (startOk) {
    const q = [startIdx];
    reach[startIdx] = 1;
    for (let head = 0; head < q.length; head++) {
      const c = q[head];
      const x = c % W;
      const y = (c / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (reach[ni] || tiles[ni] !== floorTile) continue;
        reach[ni] = 1;
        q.push(ni);
      }
    }
  }

  let unreachable = 0;
  for (const r of rooms) {
    const a = anchor(r);
    const i = a.y * W + a.x;
    if (tiles[i] !== floorTile || !reach[i]) unreachable++;
  }

  const bossOpenings = findBossOpenings(tiles, W, H, rooms[boss], floorTile).length;
  const ok =
    startOk &&
    unreachable === 0 &&
    bossOpenings > 0 &&
    (expectedOpenings === undefined || bossOpenings === expectedOpenings);
  return { ok, unreachable, bossOpenings };
}

/** Расстояния (в рёбрах) от комнаты входа до всех комнат; -1 — недостижимо. */
export function graphDistances(layout: DungeonLayout): number[] {
  const adj: number[][] = Array.from({ length: layout.rooms.length }, () => []);
  for (const e of layout.edges) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  return bfsDist(adj, layout.entry);
}
