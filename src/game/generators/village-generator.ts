/* Генерация поселений: заборы (1-2 проёма), дома, дороги, площади */
import { WorldData, Tl, Vec, Edge, HouseDef, VillageResult, GateDef, isSolidTileId, idx, inB } from "./types";

/** Внешняя нормаль ребра прямоугольника деревни */
const EDGE_NORMAL: Record<Edge, Vec> = {
  [Edge.North]: { x: 0, y: -1 },
  [Edge.East]: { x: 1, y: 0 },
  [Edge.South]: { x: 0, y: 1 },
  [Edge.West]: { x: -1, y: 0 },
};

export class VillageGenerator {
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

  /**
   * @param targets точки, к которым должны «смотреть» ворота (центры соседних деревень).
   *                Число ворот = clamp(targets.length, 1, 2).
   */
  public generate(w: WorldData, cx: number, cy: number, rw: number, rh: number, targets: Vec[] = []): VillageResult {
    const wanted = Math.max(1, Math.min(2, targets.length || 1));
    const gates = this.placeGates(w, cx, cy, rw, rh, targets, wanted);
    this.buildFence(w, cx, cy, rw, rh, gates);
    const plazaCenter = this.placePlaza(w, cx, cy, rw, rh);
    const houses = this.placeHouses(w, cx, cy, rw, rh);
    for (const g of gates) this.buildPlazaGateRoad(w, plazaCenter, g);
    this.buildHouseRoads(w, houses, plazaCenter, gates);
    for (const g of gates) this.paveGate(w, g);

    // Каменный столб на месте святилища (после дорог, чтобы carveRoad не затер)
    if (inB(w, plazaCenter.x, plazaCenter.y))
      w.tiles[idx(w, plazaCenter.x, plazaCenter.y)] = Tl.COLUMN;

    const residentSpots = this.collectResidentSpots(w, cx, cy, rw, rh);
    const primary = gates[0];
    return {
      x0: cx, y0: cy, x1: cx + rw, y1: cy + rh,
      gate: { x: primary.x + 1, y: primary.y + 1 }, gateEdge: primary.edge,
      gates, houses, residentSpots, plazaCenter,
    };
  }

  /* ---------- Ворота ---------- */

  private placeGates(w: WorldData, cx: number, cy: number, rw: number, rh: number, targets: Vec[], count: number): GateDef[] {
    const edges: Edge[] = [Edge.North, Edge.East, Edge.South, Edge.West];
    const chosen: GateDef[] = [];
    const used = new Set<Edge>();

    const list: (Vec | undefined)[] = targets.slice(0, count);
    if (list.length === 0) list.push(undefined);

    for (const t of list) {
      let bestEdge: Edge | null = null;
      let bestScore = -Infinity;
      for (const e of edges) {
        if (used.has(e)) continue;
        const s = this.edgeScore(w, cx, cy, rw, rh, e, t);
        if (s > bestScore) { bestScore = s; bestEdge = e; }
      }
      if (bestEdge === null) break;
      const g = this.gateOnEdge(w, cx, cy, rw, rh, bestEdge, t);
      used.add(bestEdge);
      if (g) chosen.push({ ...g, target: t });
    }

    // Гарантируем хотя бы одни ворота
    if (chosen.length === 0) {
      for (const e of edges) {
        const g = this.gateOnEdge(w, cx, cy, rw, rh, e, list[0]);
        if (g) { chosen.push({ ...g, target: list[0] }); break; }
      }
    }
    // Аварийный вариант: если ни одно ребро не дало валидных ворот —
    // ставим проём без проверки окружения, чтобы деревня не осталась без выхода.
    if (chosen.length === 0) {
      const gx = cx + rw - 1;
      const gy = Math.max(cy + 2, Math.min(cy + rh - 3, cy + Math.floor(rh / 2)));
      for (const [ox, oy] of [[gx, gy], [gx, gy + 1]] as [number, number][]) {
        if (inB(w, ox, oy)) w.tiles[idx(w, ox, oy)] = Tl.PATH;
      }
      chosen.push({ x: gx, y: gy, edge: Edge.East, target: list[0] });
    }
    return chosen;
  }

  /** Скоринг ребра: направление на цель + проходимость полосы наружу */
  private edgeScore(w: WorldData, cx: number, cy: number, rw: number, rh: number, edge: Edge, target?: Vec): number {
    const n = EDGE_NORMAL[edge];
    let score = 0;
    if (target) {
      const vx = target.x - (cx + rw / 2);
      const vy = target.y - (cy + rh / 2);
      const m = Math.hypot(vx, vy) || 1;
      score += (n.x * (vx / m) + n.y * (vy / m)) * 3;
    }
    const ray = this.edgeRay(cx, cy, rw, rh, edge);
    let open = 0;
    for (let d = 1; d <= 4; d++) {
      const x = ray.ox + ray.dx * d;
      const y = ray.oy + ray.dy * d;
      if (!inB(w, x, y)) break;
      const t = w.tiles[idx(w, x, y)];
      if (t === Tl.WATER || t === Tl.SHORE || t === Tl.ROCK || t === Tl.TREE ||
          t === Tl.PALISADE || t === Tl.HOUSE || t === Tl.COLUMN) break;
      open++;
    }
    score += open * 1.5;
    if (open < 2) score -= 100;
    score += this.rng() * 0.4;
    return score;
  }

  private edgeRay(cx: number, cy: number, rw: number, rh: number, edge: Edge): { ox: number; oy: number; dx: number; dy: number } {
    switch (edge) {
      case Edge.North: return { ox: cx + Math.floor(rw / 2), oy: cy, dx: 0, dy: -1 };
      case Edge.South: return { ox: cx + Math.floor(rw / 2), oy: cy + rh, dx: 0, dy: 1 };
      case Edge.West: return { ox: cx, oy: cy + Math.floor(rh / 2), dx: -1, dy: 0 };
      case Edge.East:
      default: return { ox: cx + rw, oy: cy + Math.floor(rh / 2), dx: 1, dy: 0 };
    }
  }

  /** Разместить 2×2 проём на ребре ближе к цели; null, если наружу нет ≥2 проходимых тайлов */
  private gateOnEdge(w: WorldData, cx: number, cy: number, rw: number, rh: number, edge: Edge, target?: Vec): { x: number; y: number; edge: Edge } | null {
    let gx: number, gy: number;
    const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (edge === Edge.North || edge === Edge.South) {
      const lo = cx + 2, hi = cx + rw - 3;
      const along = target ? clampN(Math.round(target.x) - 1, lo, hi)
        : clampN(cx + 2 + Math.floor(this.rng() * Math.max(1, rw - 4)), lo, hi);
      gx = along;
      gy = edge === Edge.North ? cy : cy + rh - 1;
    } else {
      const lo = cy + 2, hi = cy + rh - 3;
      const along = target ? clampN(Math.round(target.y) - 1, lo, hi)
        : clampN(cy + 2 + Math.floor(this.rng() * Math.max(1, rh - 4)), lo, hi);
      gy = along;
      gx = edge === Edge.West ? cx : cx + rw - 1;
    }

    // Проём не должен опираться на воду/берег
    const opening: [number, number][] = edge === Edge.North || edge === Edge.South
      ? [[gx, gy], [gx + 1, gy]]
      : [[gx, gy], [gx, gy + 1]];
    for (const [ox, oy] of opening) {
      if (!inB(w, ox, oy)) return null;
      const t = w.tiles[idx(w, ox, oy)];
      if (t === Tl.WATER || t === Tl.SHORE) return null;
    }

    // Наружу — минимум 2 проходимых тайла в 2 полосы
    const n = EDGE_NORMAL[edge];
    const outCells: [number, number][] = edge === Edge.North
      ? [[gx, gy - 1], [gx + 1, gy - 1]]
      : edge === Edge.South
        ? [[gx, gy + 1], [gx + 1, gy + 1]]
        : edge === Edge.West
          ? [[gx - 1, gy], [gx - 1, gy + 1]]
          : [[gx + 1, gy], [gx + 1, gy + 1]];
    for (let step = 0; step < 2; step++) {
      for (const [bx, by] of outCells) {
        const x = bx + n.x * step, y = by + n.y * step;
        if (!inB(w, x, y)) return null;
        const t = w.tiles[idx(w, x, y)];
        if (t === Tl.WATER || t === Tl.SHORE || isSolidTileId(t)) return null;
      }
    }

    // Проём внутренне делаем проходимым сразу (забор его пропустит)
    for (const [ox, oy] of opening) w.tiles[idx(w, ox, oy)] = Tl.PATH;
    return { x: gx, y: gy, edge };
  }

  private buildFence(w: WorldData, cx: number, cy: number, rw: number, rh: number, gates: GateDef[]): void {
    const inGate = (x: number, y: number) =>
      gates.some((g) => x >= g.x && x < g.x + 2 && y >= g.y && y < g.y + 2);
    for (let y = cy; y <= cy + rh; y++) {
      for (let x = cx; x <= cx + rw; x++) {
        if (!inB(w, x, y)) continue;
        if (inGate(x, y)) continue;
        const isBorder = (x === cx || x === cx + rw || y === cy || y === cy + rh);
        w.tiles[idx(w, x, y)] = isBorder ? Tl.PALISADE : Tl.VILLAGE;
      }
    }
  }

  private placeHouses(w: WorldData, cx: number, cy: number, rw: number, rh: number): HouseDef[] {
    const { ix0, iy0, iw, ih } = this.interior(cx, cy, rw, rh);
    const houses: HouseDef[] = [];
    const occ: boolean[][] = [];
    for (let y = 0; y < ih; y++) occ[y] = new Array(iw).fill(false);
    const occHouse = (x: number, y: number): boolean => {
      const lx = x - ix0, ly = y - iy0;
      if (lx < 0 || lx >= iw || ly < 0 || ly >= ih) return false;
      return occ[ly][lx];
    };
    const canPlace = (x: number, y: number, hw: number, hh: number): boolean => {
      if (x < ix0 + 1 || y < iy0 + 1 || x + hw > ix0 + iw - 1 || y + hh > iy0 + ih - 1) return false;
      for (let dy = 0; dy < hh; dy++)
        for (let dx = 0; dx < hw; dx++)
          if (w.tiles[(y + dy) * w.W + (x + dx)] !== Tl.VILLAGE) return false;
      for (let dy = -2; dy < hh + 2; dy++)
        for (let dx = -2; dx < hw + 2; dx++)
          if (occHouse(x + dx, y + dy)) return false;
      return true;
    };
    const mark = (x: number, y: number, hw: number, hh: number) => {
      for (let dy = 0; dy < hh; dy++)
        for (let dx = 0; dx < hw; dx++) {
          const lx = x + dx - ix0, ly = y + dy - iy0;
          if (lx >= 0 && lx < iw && ly >= 0 && ly < ih) occ[ly][lx] = true;
        }
    };

    let failStreak = 0;
    const maxFails = 80, maxHouses = 14;
    while (failStreak < maxFails && houses.length < maxHouses) {
      const size = this.houseSizes[Math.floor(this.rng() * this.houseSizes.length)];
      const spanX = Math.max(1, iw - 2 - size.w + 1);
      const spanY = Math.max(1, ih - 2 - size.h + 1);
      const hx = ix0 + 1 + Math.floor(this.rng() * spanX);
      const hy = iy0 + 1 + Math.floor(this.rng() * spanY);
      if (canPlace(hx, hy, size.w, size.h)) {
        for (let dy = 0; dy < size.h; dy++)
          for (let dx = 0; dx < size.w; dx++)
            if (inB(w, hx + dx, hy + dy)) w.tiles[idx(w, hx + dx, hy + dy)] = Tl.HOUSE;
        mark(hx, hy, size.w, size.h);
        houses.push({ x: hx, y: hy, w: size.w, h: size.h });
        failStreak = 0;
      } else failStreak++;
    }
    return houses;
  }

  private interior(cx: number, cy: number, rw: number, rh: number) {
    return { ix0: cx + 1, iy0: cy + 1, iw: rw - 1, ih: rh - 1 };
  }

  private roadPassable(w: WorldData, x: number, y: number): boolean {
    if (!inB(w, x, y)) return false;
    const t = w.tiles[y * w.W + x];
    return t !== Tl.HOUSE && t !== Tl.PALISADE && t !== Tl.WATER;
  }

  private placePlaza(w: WorldData, cx: number, cy: number, rw: number, rh: number): Vec {
    const { ix0, iy0, iw, ih } = this.interior(cx, cy, rw, rh);
    const regionArea = iw * ih * 0.3;
    const side = Math.max(3, Math.min(Math.floor(Math.sqrt(regionArea)), iw, ih));
    const rx0 = ix0 + Math.floor((iw - side) / 2);
    const ry0 = iy0 + Math.floor((ih - side) / 2);
    const px = rx0 + Math.floor(this.rng() * Math.max(1, side - 3 + 1));
    const py = ry0 + Math.floor(this.rng() * Math.max(1, side - 3 + 1));
    for (let dy = 0; dy < 3; dy++)
      for (let dx = 0; dx < 3; dx++)
        if (inB(w, px + dx, py + dy)) w.tiles[idx(w, px + dx, py + dy)] = Tl.PATH;
    return { x: px + 1, y: py + 1 };
  }

  private gateInnerCenter(gate: GateDef): Vec {
    switch (gate.edge) {
      case Edge.North: return { x: gate.x + 1, y: gate.y + 1 };
      case Edge.South: return { x: gate.x + 1, y: gate.y };
      case Edge.West: return { x: gate.x + 1, y: gate.y + 1 };
      case Edge.East:
      default: return { x: gate.x, y: gate.y + 1 };
    }
  }

  private buildPlazaGateRoad(w: WorldData, plazaCenter: Vec, gate: GateDef): void {
    const gateInner = this.gateInnerCenter(gate);
    this.carveRoad(w, plazaCenter.x, plazaCenter.y, gateInner.x, gateInner.y);
  }

  private houseDoor(h: HouseDef): Vec {
    return { x: h.x + Math.floor(h.w / 2), y: h.y + h.h };
  }
  private allHouseSides(h: HouseDef): Vec[] {
    return [
      { x: h.x + Math.floor(h.w / 2), y: h.y + h.h },
      { x: h.x + Math.floor(h.w / 2), y: h.y - 1 },
      { x: h.x - 1, y: h.y + Math.floor(h.h / 2) },
      { x: h.x + h.w, y: h.y + Math.floor(h.h / 2) },
    ];
  }

  private buildHouseRoads(w: WorldData, houses: HouseDef[], plazaCenter: Vec, gates: GateDef[]): void {
    const goals = [plazaCenter, ...gates.map((g) => this.gateInnerCenter(g))];
    for (const h of houses) {
      const hcx = h.x + h.w / 2, hcy = h.y + h.h / 2;
      let goal = plazaCenter, best = Infinity;
      for (const g of goals) {
        const d = Math.hypot(g.x - hcx, g.y - hcy);
        if (d < best) { best = d; goal = g; }
      }
      let door = this.houseDoor(h);
      if (!this.roadPassable(w, door.x, door.y)) {
        const side = this.allHouseSides(h).find((p) => this.roadPassable(w, p.x, p.y));
        if (!side) continue;
        door = side;
      }
      this.carveRoad(w, door.x, door.y, goal.x, goal.y);
    }
  }

  private carveRoad(w: WorldData, ax: number, ay: number, bx: number, by: number): void {
    const W = w.W;
    const start = ay * W + ax, goal = by * W + bx;
    if (start === goal) return;
    if (!this.roadPassable(w, ax, ay) || !this.roadPassable(w, bx, by)) {
      this.carveL(w, ax, ay, bx, by); return;
    }
    const gScore = new Map<number, number>();
    const came = new Map<number, number>();
    const closed = new Set<number>();
    const hfn = (i: number) => Math.abs((i % W) - bx) + Math.abs(Math.floor(i / W) - by);
    gScore.set(start, 0);
    const open: number[] = [start];
    let found = false, guard = 0;
    while (open.length && guard++ < 6000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        const fi = (gScore.get(open[i]) ?? Infinity) + hfn(open[i]);
        const fb = (gScore.get(open[bi]) ?? Infinity) + hfn(open[bi]);
        if (fi < fb) bi = i;
      }
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) { found = true; break; }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cx0 = cur % W, cy0 = Math.floor(cur / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx0 + dx, ny = cy0 + dy;
        if (!this.roadPassable(w, nx, ny)) continue;
        const ni = ny * W + nx;
        if (closed.has(ni)) continue;
        const ng = (gScore.get(cur) ?? Infinity) + 1;
        if (ng < (gScore.get(ni) ?? Infinity)) {
          gScore.set(ni, ng); came.set(ni, cur);
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
    if (!found) { this.carveL(w, ax, ay, bx, by); return; }
    const path: number[] = [];
    let c: number | undefined = goal;
    while (c !== undefined && c !== start) { path.push(c); c = came.get(c); }
    path.push(start);
    for (const i of path) {
      const x = i % W, y = Math.floor(i / W);
      const t = w.tiles[y * W + x];
      if (t !== Tl.HOUSE && t !== Tl.PALISADE && t !== Tl.WATER) {
        if (inB(w, x, y)) w.tiles[idx(w, x, y)] = Tl.PATH;
      }
    }
  }

  private carveL(w: WorldData, ax: number, ay: number, bx: number, by: number): void {
    let x = ax, y = ay;
    const put = (px: number, py: number) => {
      if (!inB(w, px, py)) return;
      const t = w.tiles[py * w.W + px];
      if (t === Tl.HOUSE || t === Tl.PALISADE || t === Tl.WATER) return;
      if (isSolidTileId(t)) return;
      w.tiles[idx(w, px, py)] = Tl.PATH;
    };
    while (x !== bx) { x += Math.sign(bx - x); put(x, y); }
    while (y !== by) { y += Math.sign(by - y); put(x, y); }
  }

  private paveGate(w: WorldData, gate: GateDef): void {
    const n = EDGE_NORMAL[gate.edge];
    const cells: [number, number][] = [];
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) cells.push([gate.x + dx, gate.y + dy]);
    // Крыльцо наружу на 2 тайла
    const opening: [number, number][] = gate.edge === Edge.North || gate.edge === Edge.South
      ? [[gate.x, gate.y], [gate.x + 1, gate.y]]
      : [[gate.x, gate.y], [gate.x, gate.y + 1]];
    for (const [ox, oy] of opening)
      for (let step = 1; step <= 2; step++)
        cells.push([ox + n.x * step, oy + n.y * step]);
    for (const [x, y] of cells) {
      if (!inB(w, x, y)) continue;
      const t = w.tiles[idx(w, x, y)];
      if (t === Tl.WATER || t === Tl.SHORE || t === Tl.HOUSE || t === Tl.PALISADE) continue;
      w.tiles[idx(w, x, y)] = Tl.PATH;
    }
  }

  private collectResidentSpots(w: WorldData, cx: number, cy: number, rw: number, rh: number): Vec[] {
    const { ix0, iy0, iw, ih } = this.interior(cx, cy, rw, rh);
    const candidates: Vec[] = [];
    for (let y = iy0; y < iy0 + ih; y++)
      for (let x = ix0; x < ix0 + iw; x++) {
        if (!inB(w, x, y)) continue;
        const t = w.tiles[y * w.W + x];
        if (t === Tl.VILLAGE || t === Tl.PATH) candidates.push({ x, y });
      }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const hasRoad = (p: Vec): boolean => {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = p.x + dx, ny = p.y + dy;
        if (inB(w, nx, ny) && w.tiles[ny * w.W + nx] === Tl.PATH) return true;
      }
      return false;
    };
    const sorted = [...candidates.filter(hasRoad), ...candidates.filter((p) => !hasRoad(p))];
    return sorted.slice(0, Math.min(3, sorted.length));
  }
}
