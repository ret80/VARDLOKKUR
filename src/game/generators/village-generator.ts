/* Генерация поселений: заборы, дома, дороги, площади */
import { WorldData, Tl, Vec, Edge, HouseDef, VillageResult, idx, inB } from "./types";

interface GateDef { x: number; y: number; edge: Edge }

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

  public generate(w: WorldData, cx: number, cy: number, rw: number, rh: number): VillageResult {
    const gate = this.placeGate(w, cx, cy, rw, rh);
    this.buildFence(w, cx, cy, rw, rh, gate);
    const plazaCenter = this.placePlaza(w, cx, cy, rw, rh);
    const houses = this.placeHouses(w, cx, cy, rw, rh);
    this.buildPlazaGateRoad(w, plazaCenter, gate);
    this.buildHouseRoads(w, houses, plazaCenter, gate);
    this.paveGate(w, gate);

    const residentSpots = this.collectResidentSpots(w, cx, cy, rw, rh);
    return {
      x0: cx, y0: cy, x1: cx + rw, y1: cy + rh,
      gate: { x: gate.x + 1, y: gate.y + 1 }, gateEdge: gate.edge,
      houses, residentSpots, plazaCenter,
    };
  }

  private placeGate(w: WorldData, cx: number, cy: number, rw: number, rh: number): GateDef {
    const edges: Edge[] = [Edge.North, Edge.East, Edge.South, Edge.West];
    const edge = edges[Math.floor(this.rng() * edges.length)];
    const gs = 2;
    const off = 2;
    const spanH = Math.max(1, rw - gs - 2 * off + 2);
    const spanV = Math.max(1, rh - gs - 2 * off + 2);
    let gx: number, gy: number;
    switch (edge) {
      case Edge.North:
        gx = cx + off + Math.floor(this.rng() * spanH); gy = cy; break;
      case Edge.South:
        gx = cx + off + Math.floor(this.rng() * spanH); gy = cy + rh - gs + 1; break;
      case Edge.West:
        gx = cx; gy = cy + off + Math.floor(this.rng() * spanV); break;
      case Edge.East:
      default:
        gx = cx + rw - gs + 1; gy = cy + off + Math.floor(this.rng() * spanV); break;
    }
    for (let dy = 0; dy < gs; dy++)
      for (let dx = 0; dx < gs; dx++)
        if (inB(w, gx + dx, gy + dy)) {
          if (inB(w, gx + dx, gy + dy)) w.tiles[idx(w, gx + dx, gy + dy)] = Tl.VILLAGE;
        }
    return { x: gx, y: gy, edge };
  }

  private buildFence(w: WorldData, cx: number, cy: number, rw: number, rh: number, gate: GateDef): void {
    for (let y = cy; y <= cy + rh; y++) {
      for (let x = cx; x <= cx + rw; x++) {
        if (!inB(w, x, y)) continue;
        if (x >= gate.x && x < gate.x + 2 && y >= gate.y && y < gate.y + 2) continue;
        const isBorder = (x === cx || x === cx + rw || y === cy || y === cy + rh);
        if (inB(w, x, y)) w.tiles[idx(w, x, y)] = isBorder ? Tl.PALISADE : Tl.VILLAGE;
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
      case Edge.West:  return { x: gate.x + 1, y: gate.y + 1 };
      case Edge.East:
      default:         return { x: gate.x,     y: gate.y + 1 };
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
      { x: h.x - 1,        y: h.y + Math.floor(h.h / 2) },
      { x: h.x + h.w,      y: h.y + Math.floor(h.h / 2) },
    ];
  }

  private buildHouseRoads(w: WorldData, houses: HouseDef[], plazaCenter: Vec, gate: GateDef): void {
    const gateInner = this.gateInnerCenter(gate);
    for (const h of houses) {
      const hcx = h.x + h.w / 2, hcy = h.y + h.h / 2;
      const dPlaza = Math.hypot(plazaCenter.x - hcx, plazaCenter.y - hcy);
      const dGate = Math.hypot(gateInner.x - hcx, gateInner.y - hcy);
      const goal = dGate < dPlaza ? gateInner : plazaCenter;

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
      if (inB(w, px, py)) w.tiles[idx(w, px, py)] = Tl.PATH;
    };
    while (x !== bx) { x += Math.sign(bx - x); put(x, y); }
    while (y !== by) { y += Math.sign(by - y); put(x, y); }
  }

  private paveGate(w: WorldData, gate: GateDef): void {
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++)
        if (inB(w, gate.x + dx, gate.y + dy)) w.tiles[idx(w, gate.x + dx, gate.y + dy)] = Tl.PATH;
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
