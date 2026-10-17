/* world-structure.test.ts — структура оверворлда: биомы, деревни с воротами,
   связность POI, входы подземелий. ~30 сидов. */
import { describe, expect, it } from "vitest";
import { generateOverworld } from "../generators/overworld";
import { Biome, Tl, idx, isSolidTileId, Edge } from "../generators/types";
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

  it("святилища: ровно одно на биом (7), у деревень — у ворот, не на дороге", { timeout: 90000 }, () => {
    const LAND = [Biome.SNOW, Biome.RIDGE, Biome.FOREST, Biome.SWAMP, Biome.MEADOW, Biome.RUINS, Biome.WASTE];
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      expect(w.shrines.length, `seed ${seed}: число святилищ`).toBe(7);
      const counts: Record<number, number> = {};
      for (const s of w.shrines) {
        expect(w.tiles[idx(w, s.x, s.y)], `seed ${seed}: святилище (${s.x},${s.y}) на дороге`).not.toBe(Tl.PATH);
        const b = w.biomes![idx(w, s.x, s.y)];
        counts[b] = (counts[b] ?? 0) + 1;
      }
      for (const b of LAND) {
        expect(counts[b] ?? 0, `seed ${seed}: святилищ в биоме ${b}`).toBe(1);
      }
      // обе «жилые» деревни имеют святилище у главных ворот
      for (const gi of [0, 1]) {
        const g = w.villageGates![gi][0];
        const near = w.shrines.some((s) => Math.hypot(s.x - g.x, s.y - g.y) <= 9);
        expect(near, `seed ${seed}: у ворот (${g.x},${g.y}) нет святилища`).toBe(true);
      }
    }
  });

  it("ворота: у деревни с 2 входами они на противоположных сторонах", { timeout: 90000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      for (const gates of w.villageGates!) {
        if (gates.length < 2) continue;
        const [a, b] = gates;
        const opposite = (a.edge === Edge.North && b.edge === Edge.South) || (a.edge === Edge.South && b.edge === Edge.North)
          || (a.edge === Edge.East && b.edge === Edge.West) || (a.edge === Edge.West && b.edge === Edge.East);
        expect(opposite, `seed ${seed}: ворота на соседних сторонах (${a.edge},${b.edge})`).toBe(true);
        expect(Math.hypot(a.x - b.x, a.y - b.y), `seed ${seed}: ворота слишком близко`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("подземелья: в биомах (паук — болото), не рядом с алтарём", { timeout: 90000 }, () => {
    const expectBiome: Record<number, number> = { 0: Biome.RUINS, 1: Biome.SWAMP, 2: Biome.RIDGE };
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      const seen = new Set<number>();
      for (const e of w.dungeonEntries) {
        seen.add(e.id);
        const b = w.biomes![idx(w, e.x, e.y)];
        expect(b, `seed ${seed}: вход ${e.id} не в биоме ${expectBiome[e.id]}`).toBe(expectBiome[e.id]);
        const d = Math.hypot(e.x - w.treeAltar.x, e.y - w.treeAltar.y);
        expect(d, `seed ${seed}: вход ${e.id} рядом с алтарём (${d.toFixed(1)})`).toBeGreaterThanOrEqual(13);
      }
      for (const id of [0, 1, 2]) expect(seen.has(id), `seed ${seed}: нет входа ${id}`).toBe(true);
    }
  });
});
