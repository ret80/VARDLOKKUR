/* passages-free.test.ts — инвариант «проходы всегда свободны».
 *
 * Регрессия к багу: объекты со спавном (пьедесталы, враги) вставали на дороги
 * и на открытые стыки террас (рампы), из-за чего1-клеточный проход перекрывался
 * телом, и через террасу было нельзя пройти.
 *
 * Проверяем на пачке сидов:
 *   1. ни одно коллайдер-тело (пьедестал/святилище r=6, враг r из ENEMY_STATS)
 *      не стоит ближе (r + 5) px к центру клетки-прохода;
 *   2. на клетках проходов нет солидов (декор не может занять проход);
 *   3. из спавна игрока по проходимым клеткам с открытыми стыками террас
 *      достижим каждый интерактивный POI (пьедестал, святилище, сундук, душа,
 *      квестовая точка, вход в подземелье).
 */
import { describe, it, expect } from "vitest";
import { generateOverworld } from "../generators/overworld";
import { passageMask, forbiddenMask, PLAYER_BODY_R, STATIC_BODY_R } from "../generators/passages";
import { WALL_DIRS, edgeOpen } from "../generators/terrain-walls";
import { Tl, isSolidTileId, idx, inB, T, type WorldData } from "../generators/types";
import { ENEMY_STATS } from "../balance";

const SEEDS = [1, 2, 3, 5, 7, 11, 13, 17, 23, 42, 71, 99];

/** Компоненты проходимости: открытые стыки террас + отсутствие солидов. */
function spawnComponent(w: WorldData): Int32Array {
  const comp = new Int32Array(w.W * w.H).fill(-1);
  const start = idx(w, Math.floor(w.spawn.x / T), Math.floor(w.spawn.y / T));
  if (w.tiles[start] === undefined || isSolidTileId(w.tiles[start])) return comp;
  const q = [start];
  comp[start] = 0;
  while (q.length) {
    const c = q.pop()!;
    const cx = c % w.W, cy = (c / w.W) | 0;
    for (const [dx, dy, bit] of WALL_DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inB(w, nx, ny)) continue;
      const ni = ny * w.W + nx;
      if (comp[ni] >= 0 || isSolidTileId(w.tiles[ni])) continue;
      if (w.walls && !edgeOpen(w.walls, c, ni, bit)) continue;
      comp[ni] = 0;
      q.push(ni);
    }
  }
  return comp;
}

describe("проходы свободны от коллайдеров", () => {
  it("тела не перекрывают дороги и рампы террас", { timeout: 180_000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      const passages = passageMask(w);
      const fbCache = new Map<number, Uint8Array>();
      const forbidden = (r: number) => {
        let m = fbCache.get(r);
        if (!m) { m = forbiddenMask(w, passages, r); fbCache.set(r, m); }
        return m;
      };
      const where = (x: number, y: number) => `seed=${seed} (${x},${y})`;

      // 1. Статика: пьедесталы и святилища (r=6, ecs-map-loader).
      for (const p of w.pedestals)
        expect(forbidden(STATIC_BODY_R)[idx(w, p.x, p.y)], `пьедестал ${where(p.x, p.y)}`).toBe(0);
      for (const s of w.shrines)
        expect(forbidden(STATIC_BODY_R)[idx(w, s.x, s.y)], `святилище ${where(s.x, s.y)}`).toBe(0);

      // 1b. Враги: радиус индивидуален (враг может быть крупнее клетки).
      for (const sp of w.spawns) {
        const r = ENEMY_STATS[sp.kind].r;
        const x = Math.floor(sp.x / T), y = Math.floor(sp.y / T);
        expect(forbidden(r)[idx(w, x, y)], `враг ${sp.kind} ${where(x, y)} (r=${r}, игрок r=${PLAYER_BODY_R})`).toBe(0);
      }

      // 2. На клетках проходов нет солидов.
      for (let y = 0; y < w.H; y++)
        for (let x = 0; x < w.W; x++) {
          if (!passages[idx(w, x, y)]) continue;
          expect(isSolidTileId(w.tiles[idx(w, x, y)]), `солид на проходе ${where(x, y)}`).toBe(false);
        }

      // 3. Достижимость интерактивных POI из спавна (клетка или её сосед —
      //    солидные POI вроде алтаря подходятся сбоку, как reachedNear в Ф5b).
      const comp = spawnComponent(w);
      const reachable = (x: number, y: number): boolean =>
        inB(w, x, y) && (comp[idx(w, x, y)] === 0 ||
          [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
            inB(w, x + dx, y + dy) && comp[idx(w, x + dx, y + dy)] === 0));
      const poiList: Array<[string, number, number]> = [
        ...w.pedestals.map((p): [string, number, number] => ["пьедестал", p.x, p.y]),
        ...w.shrines.map((s): [string, number, number] => ["святилище", s.x, s.y]),
        ...w.chests.map((c): [string, number, number] => ["сундук", c.x, c.y]),
        ...w.souls.map((s): [string, number, number] => ["душа", s.x, s.y]),
        ...w.dungeonEntries.map((e): [string, number, number] => ["вход в подземелье", e.x, e.y]),
        ["алтарь Древа", w.treeAltar.x, w.treeAltar.y + 8],
        ["медведь", w.bearSpot.x, w.bearSpot.y],
        ["рог", w.hornSpot.x, w.hornSpot.y],
        ["мед", w.meadSpot.x, w.meadSpot.y],
        ["руда", w.oreSpot.x, w.oreSpot.y],
        ["мох", w.mossSpot.x, w.mossSpot.y],
        ["янтарь", w.amberSpot.x, w.amberSpot.y],
        ["цветок", w.flowerSpot.x, w.flowerSpot.y],
        ["дневник", w.diarySpot.x, w.diarySpot.y],
        ["связка", w.bundleSpot.x, w.bundleSpot.y],
        ["реликвия", w.relicSpot.x, w.relicSpot.y],
        ["старый алтарь", w.oldAltar.x, w.oldAltar.y],
        ["схрон", w.stashSpot.x, w.stashSpot.y],
      ];
      for (const [kind, x, y] of poiList)
        expect(reachable(x, y), `${kind} недостижим из спавна, seed=${seed}`).toBe(true);

      // 4. Переносы не должны были выкосить врагов (квота Ф8 ~84).
      expect(w.spawns.length, `мало врагов, seed=${seed}`).toBeGreaterThanOrEqual(60);
    }
  });
});
