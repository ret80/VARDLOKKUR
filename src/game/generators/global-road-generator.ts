/* Генерация глобальных дорог между точками мира (A*) */
import { WorldData, Tl, Vec, idx, inB } from "./types";
import { isSolidTileId } from "./types";

export class GlobalRoadGenerator {
  private rng: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  public buildRoad(w: WorldData, from: Vec, to: Vec): void {
    const { W, H } = w;
    const cost = (x: number, y: number): number => {
      const t = w.tiles[idx(w, x, y)];
      if (isSolidTileId(t) && t !== Tl.PALISADE) return Infinity;
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
        case Tl.VILLAGE: return 50;
        case Tl.STAIRS: case Tl.ALTAR: return 1;
        default: return 1.2;
      }
    };

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const sx = clamp(from.x, 1, W - 2), sy = clamp(from.y, 1, H - 2);
    const gx = clamp(to.x, 1, W - 2), gy = clamp(to.y, 1, H - 2);
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
      if (t !== Tl.WATER && t !== Tl.PALISADE && t !== Tl.HOUSE && t !== Tl.STAIRS && t !== Tl.ALTAR && t !== Tl.VILLAGE) {
        if (inB(w, x, y)) w.tiles[idx(w, x, y)] = Tl.PATH;
      }
    }
  }

  private carvePath(w: WorldData, x0: number, y0: number, x1: number, y1: number): void {
    const put = (x: number, y: number) => {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (!inB(w, xx, yy)) continue;
        const cur = w.tiles[idx(w, xx, yy)];
        if (cur === Tl.WATER || cur === Tl.PALISADE || cur === Tl.HOUSE || cur === Tl.VILLAGE) continue;
        if (inB(w, xx, yy)) w.tiles[idx(w, xx, yy)] = Tl.PATH;
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
