/* roads.test.ts — регрессия на carvePath (дорога не пробивает солиды) и
   проверка наличия дорожной сети между деревнями на реальной карте. */
import { describe, expect, it } from "vitest";
import { generateOverworld } from "../generators/overworld";
import { GlobalRoadGenerator } from "../generators/global-road-generator";
import { Tl, idx, inB, isSolidTileId, type WorldData } from "../generators/types";
import { mulberry } from "../noise";
import { emptyWorld } from "./_world-helpers";

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

/** BFS только по «дорожным» тайлам (PATH/VILLAGE) */
function roadReach(w: WorldData, sx: number, sy: number): Uint8Array {
  const isRoad = (t: number) => t === Tl.PATH || t === Tl.VILLAGE;
  const reach = new Uint8Array(w.W * w.H);
  if (!inB(w, sx, sy) || !isRoad(w.tiles[idx(w, sx, sy)])) return reach;
  const q: number[] = [sy * w.W + sx];
  reach[q[0]] = 1;
  while (q.length) {
    const c = q.pop()!;
    const x = c % w.W, y = Math.floor(c / w.W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (!inB(w, nx, ny)) continue;
      const ni = ny * w.W + nx;
      if (reach[ni] || !isRoad(w.tiles[ni])) continue;
      reach[ni] = 1; q.push(ni);
    }
  }
  return reach;
}

describe("roads", () => {
  it("carvePath не пробивает монолитную стену (фолбэк A*)", () => {
    const w = emptyWorld(40, 30, Tl.SNOW);
    const wallX = 20;
    for (let y = 0; y < w.H; y++) w.tiles[y * w.W + wallX] = Tl.ROCK;
    const gen = new GlobalRoadGenerator(mulberry(1));
    gen.buildRoad(w, { x: 5, y: 15 }, { x: 35, y: 15 });
    for (let y = 0; y < w.H; y++) {
      expect(w.tiles[y * w.W + wallX], `стена пробита на y=${y}`).toBe(Tl.ROCK);
    }
  });

  it("A* проводит дорогу через разрыв в стене", () => {
    const w = emptyWorld(40, 30, Tl.SNOW);
    const wallX = 20;
    for (let y = 0; y < w.H; y++) if (y !== 15) w.tiles[y * w.W + wallX] = Tl.ROCK;
    const gen = new GlobalRoadGenerator(mulberry(2));
    gen.buildRoad(w, { x: 5, y: 15 }, { x: 35, y: 15 });
    expect(w.tiles[15 * w.W + wallX], "проход не проложен").toBe(Tl.PATH);
  });

  it("carvePath не пишет PATH на воду", () => {
    const w = emptyWorld(40, 30, Tl.SNOW);
    const wallX = 20;
    // монолитная стена воды — A* не пройдёт, фолбэк не должен класть PATH на воду
    for (let y = 0; y < w.H; y++) w.tiles[y * w.W + wallX] = Tl.WATER;
    const gen = new GlobalRoadGenerator(mulberry(3));
    gen.buildRoad(w, { x: 5, y: 15 }, { x: 35, y: 15 });
    for (let y = 0; y < w.H; y++) {
      expect(w.tiles[y * w.W + wallX], `вода замощена на y=${y}`).toBe(Tl.WATER);
    }
  });

  it("дорожная сеть соединяет все деревни (цепочка PATH/VILLAGE)", { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      // Старт — ворота vA (проём/дорога)
      const start = w.villageGates![0][0];
      const reach = roadReach(w, start.x, start.y);
      for (const gates of w.villageGates!) {
        for (const g of gates) {
          // Проверяем достижимость проёма (или клетки под ним/рядом)
          const ok = [[0, 0], [1, 0], [0, 1], [1, 1]].some(([dx, dy]) => {
            const x = g.x + dx, y = g.y + dy;
            return inB(w, x, y) && reach[idx(w, x, y)] === 1;
          });
          expect(ok, `seed ${seed}: ворота (${g.x},${g.y}) не соединены дорогой`).toBe(true);
        }
      }
    }
  });

  it("к каждому входу подземелья примыкает дорожный тайл", { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      for (const e of w.dungeonEntries) {
        let hasRoad = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const t = w.tiles[idx(w, e.x + dx, e.y + dy)];
          if (t === Tl.PATH) { hasRoad = true; break; }
        }
        expect(hasRoad, `seed ${seed}: ко входу ${e.id} не примыкает дорога`).toBe(true);
        expect(isSolidTileId(w.tiles[idx(w, e.x, e.y)]), `seed ${seed}: вход ${e.id} на солиде`).toBe(false);
      }
    }
  });
});
