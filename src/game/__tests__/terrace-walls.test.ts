/* terrace-walls.test.ts — уступы террас: замкнутость и подъём по ступенькам.

   Проверяем правило из generators/terrain-walls (buildTerrainWalls):
   - стена ставится на НИЖНЕЙ клетке каждого перепада уровней, поэтому
     возвышенность замкнута по кругу — и в поле, и у воды, и вдоль дорог;
   - открытыми остаются только «ступеньки»: стык двух «пандусных» тайлов
     (дорога/площадь/лестница/берег/озеро) и стыки, которые BFS связности
     пробивает, чтобы мир не распался. «Пробитых» стыков не может быть больше,
     чем нужно, чтобы сшить террасы: регионов − 1 (остовное дерево);
   - берег и озёра ровные: внутри полосы нет перепадов, иначе игрок поднимался
     бы сквозь уступ по невидимым микростенкам. */

import { describe, expect, it } from "vitest";
import { generateOverworld } from "../generators/overworld";
import { T, Tl, elevLevel, idx, isSolidTileId } from "../generators/types";
import {
  WALL_DIRS, edgeOpen, flattenRampSurfaces,
} from "../generators/terrain-walls";

const SEEDS = [1, 3, 11];

/** Тайлы, по которым подъём идёт ступеньками (см. isRampSurface). */
const RAMP = new Set<number>([Tl.PATH, Tl.VILLAGE, Tl.STAIRS, Tl.SHORE, Tl.POOL]);

describe("уступы террас", () => {
  it("террасы замкнуты, подъём — только по ступенькам", { timeout: 120000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      const { W, H, tiles } = w;
      const height = w.height;
      const m = w.walls;
      expect(height, `seed ${seed}: поля высот нет`).toBeDefined();
      expect(m, `seed ${seed}: маски стен нет`).toBeDefined();
      const h = height!;
      const walls = m!;
      const walk = (i: number): boolean => !isSolidTileId(tiles[i]);

      /* Регионы — связные области одного уровня, независимо от маски. */
      const reg = new Int32Array(W * H).fill(-1);
      let regions = 0;
      for (let i = 0; i < W * H; i++) {
        if (!walk(i) || reg[i] !== -1) continue;
        const id = regions++;
        const lv = elevLevel(h[i]);
        reg[i] = id;
        const st = [i];
        while (st.length) {
          const c = st.pop()!;
          const cx = c % W, cy = (c / W) | 0;
          for (const [dx, dy] of WALL_DIRS) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (reg[ni] !== -1 || !walk(ni) || elevLevel(h[ni]) !== lv) continue;
            reg[ni] = id;
            st.push(ni);
          }
        }
      }

      /* Классификация стыков «нижняя клетка → более высокий сосед». */
      let walled = 0, stepRamp = 0, stepCarved = 0, bandSeams = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!walk(i)) continue;
          for (const [dx, dy, bit] of WALL_DIRS) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (!walk(ni) || elevLevel(h[ni]) <= elevLevel(h[i])) continue;
            const t = tiles[i], nt = tiles[ni];
            if ((t === Tl.SHORE && nt === Tl.SHORE) || (t === Tl.POOL && nt === Tl.POOL)) bandSeams++;
            if (walls[i] & bit) walled++;
            else if (RAMP.has(t) && RAMP.has(nt)) stepRamp++;
            else stepCarved++;
          }
        }
      }

      expect(walled, `seed ${seed}: уступы не обнесены стенами`).toBeGreaterThan(0);
      expect(stepRamp, `seed ${seed}: нет ступенек на дорогах/берегу`).toBeGreaterThan(0);
      /* Каждый «пробитый» стык обязан быть нужен для связности террас. */
      expect(stepCarved, `seed ${seed}: лишние проходы сквозь уступы`).toBeLessThanOrEqual(regions - 1);
      expect(stepCarved, `seed ${seed}: террасы не соединены подъёмами`).toBeGreaterThan(0);
      /* Берег и озёра — ровная полоса, изнутри без перепадов. */
      expect(bandSeams, `seed ${seed}: берег/озеро не выровнены`).toBe(0);

      /* Связность: от спавна по открытым стыкам достижим весь крупнейший массив. */
      const start = idx(w, Math.floor(w.spawn.x / T), Math.floor(w.spawn.y / T));
      const comp = new Int32Array(W * H).fill(-1);
      let largest = 0;
      for (let i = 0; i < W * H; i++) {
        if (!walk(i) || comp[i] !== -1) continue;
        comp[i] = i;
        let size = 1;
        const st = [i];
        while (st.length) {
          const c = st.pop()!;
          const cx = c % W, cy = (c / W) | 0;
          for (const [dx, dy] of WALL_DIRS) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (comp[ni] !== -1 || !walk(ni)) continue;
            comp[ni] = i;
            size++;
            st.push(ni);
          }
        }
        if (size > largest) largest = size;
      }
      const seen = new Uint8Array(W * H);
      let reached = 0;
      const q = [start];
      seen[start] = 1;
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi];
        reached++;
        const cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy, bit] of WALL_DIRS) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (seen[ni] || !walk(ni) || !edgeOpen(walls, c, ni, bit)) continue;
          seen[ni] = 1;
          q.push(ni);
        }
      }
      expect(reached, `seed ${seed}: со спавна достижим не весь остров (${reached}/${largest})`).toBe(largest);
    }
  });

  it("flattenRampSurfaces: берег и озеро ровные, дорога не тронута", () => {
    const tiles = new Uint8Array([Tl.SHORE, Tl.POOL, Tl.PATH, Tl.MEADOW]);
    const height = new Float32Array([0.5, 0.42, 0.3, 0.2]);
    flattenRampSurfaces({ tiles, height });
    expect(height[0], "берег выровнен").toBeCloseTo(height[1]);
    expect(height[2], "дорога идёт по рельефу ступеньками").toBeCloseTo(0.3);
    expect(height[3], "обычный рельеф не тронут").toBeCloseTo(0.2);
  });
});
