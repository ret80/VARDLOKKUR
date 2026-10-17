/* world-structure.test.ts — структура оверворлда: биомы, деревни с воротами,
   связность POI, входы подземелий. ~30 сидов. */
import { describe, expect, it } from "vitest";
import { generateOverworld } from "../generators/overworld";
import { Biome, Tl, idx, isSolidTileId } from "../generators/types";
import { floodReach } from "../generators/utils";
import { gateOpenRows, reachedNear } from "./_world-helpers";

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

describe("world structure: остров → биомы → деревни → POI", () => {
  it("остров: снег в центре, ALTAR на центре, r=8 без солидов", { timeout: 90000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      expect(w.biomes, `seed ${seed}: карта биомов отсутствует`).toBeDefined();
      expect(w.biomes!.length).toBe(w.W * w.H);
      expect(w.biomes![idx(w, w.treeAltar.x, w.treeAltar.y)], `seed ${seed}: центр не снег`).toBe(Biome.SNOW);
      expect(w.tiles[idx(w, w.treeAltar.x, w.treeAltar.y)], `seed ${seed}: на центре не ALTAR`).toBe(Tl.ALTAR);
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (Math.hypot(dx, dy) > 8) continue;
          const t = w.tiles[idx(w, w.treeAltar.x + dx, w.treeAltar.y + dy)];
          expect(isSolidTileId(t), `seed ${seed}: солид у алтаря (${dx},${dy})=${t}`).toBe(false);
        }
      }
    }
  });

  it("биомы: присутствуют лес, топи, луга, руины, хребет", { timeout: 90000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      const counts: Record<number, number> = {};
      for (let i = 0; i < w.biomes!.length; i++) counts[w.biomes![i]] = (counts[w.biomes![i]] ?? 0) + 1;
      expect(counts[Biome.FOREST] ?? 0, `seed ${seed}: лес`).toBeGreaterThan(900);
      expect(counts[Biome.SWAMP] ?? 0, `seed ${seed}: топи`).toBeGreaterThan(1800);
      expect(counts[Biome.MEADOW] ?? 0, `seed ${seed}: луга`).toBeGreaterThan(1000);
      expect(counts[Biome.RUINS] ?? 0, `seed ${seed}: руины`).toBeGreaterThan(80);
      expect(counts[Biome.RIDGE] ?? 0, `seed ${seed}: хребет`).toBeGreaterThan(200);
      expect(counts[Biome.SNOW] ?? 0, `seed ${seed}: снег-центр`).toBeGreaterThan(100);
    }
  });

  it("деревни: 1..2 ворот, за каждыми ≥2 проходимых тайла", { timeout: 90000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      expect(w.villageGates, `seed ${seed}: нет данных о воротах`).toBeDefined();
      expect(w.villageGates!.length).toBe(3);
      for (const gates of w.villageGates!) {
        expect(gates.length, `seed ${seed}: число ворот`).toBeGreaterThanOrEqual(1);
        expect(gates.length, `seed ${seed}: число ворот`).toBeLessThanOrEqual(2);
        for (const g of gates) {
          expect(gateOpenRows(w, g), `seed ${seed}: ворота (${g.x},${g.y}) заблокированы`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("связность: с ворот vA достижимы все ворота, входы и алтарь", { timeout: 90000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      const start = w.villageGates![0][0];
      const reach = floodReach(w, start.x, start.y);
      for (const gates of w.villageGates!) {
        for (const g of gates) {
          expect(reachedNear(w, reach, { x: g.x + 1, y: g.y + 1 }),
            `seed ${seed}: ворота (${g.x},${g.y}) недостижимы`).toBe(true);
        }
      }
      for (const e of w.dungeonEntries) {
        expect(reachedNear(w, reach, e), `seed ${seed}: вход ${e.id} недостижим`).toBe(true);
      }
      expect(reachedNear(w, reach, { x: w.treeAltar.x, y: w.treeAltar.y + 8 }),
        `seed ${seed}: алтарь недостижим`).toBe(true);
    }
  });

  it("входы подземелий: STAIRS, кольцо r=2 чисто, без сущностей", { timeout: 90000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      for (const e of w.dungeonEntries) {
        expect(w.tiles[idx(w, e.x, e.y)], `seed ${seed}: вход ${e.id} не STAIRS`).toBe(Tl.STAIRS);
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const t = w.tiles[idx(w, e.x + dx, e.y + dy)];
            expect(isSolidTileId(t) || t === Tl.WATER || t === Tl.SHORE,
              `seed ${seed}: вход ${e.id} перекрыт (${dx},${dy})=${t}`).toBe(false);
          }
        }
        const occupied = w.npcs.some((n) => n.x === e.x && n.y === e.y)
          || w.chests.some((c) => c.x === e.x && c.y === e.y)
          || w.pedestals.some((p) => p.x === e.x && p.y === e.y)
          || w.shrines.some((s) => s.x === e.x && s.y === e.y)
          || w.souls.some((s) => s.x === e.x && s.y === e.y)
          || w.spawns.some((sp) => Math.floor(sp.x / 16) === e.x && Math.floor(sp.y / 16) === e.y);
        expect(occupied, `seed ${seed}: вход ${e.id} занят сущностью`).toBe(false);
      }
    }
  });
});
