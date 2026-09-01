/* Генерация навигационной сетки (NavMesh) */
import { NavMesh } from "navmesh";
import { WorldData, Tl, idx, inB } from "./types";
import { isSolidTileId } from "./types";

export class NavBuilder {
  public build(w: WorldData): NavMesh {
    const { W, H } = w;
    const walk = (x: number, y: number) => inB(w, x, y) && !isSolidTileId(w.tiles[idx(w, x, y)]);
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
          { x: x0 * 16 + shrink, y: y * 16 + shrink },
          { x: (x0 + len) * 16 - shrink, y: y * 16 + shrink },
          { x: (x0 + len) * 16 - shrink, y: (yy + 1) * 16 - shrink },
          { x: x0 * 16 + shrink, y: (yy + 1) * 16 - shrink },
        ]);
      }
    }
    return new NavMesh(polys, 1.2);
  }
}
