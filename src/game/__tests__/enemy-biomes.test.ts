/* enemy-biomes.test.ts — враги распределены по биомам и не попадают в
   запретные зоны (деревни, алтарь, непроходимые тайлы). */
import { describe, expect, it } from "vitest";
import { generateOverworld } from "../generators/overworld";
import { Biome, Tl, idx, isSolidTileId, type WorldData } from "../generators/types";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

/** Разрешённые виды врагов по биому (элита включена) */
const ALLOWED: Record<number, Set<string>> = {
  [Biome.FOREST]: new Set(["shroom", "raven", "draugr", "spider"]),
  [Biome.SWAMP]: new Set(["crawler", "draugr", "ghost"]),
  [Biome.MEADOW]: new Set(["varg", "raven", "frost"]),
};

const RUINED = "Сожжённая Деревня";

function inZone(w: WorldData, name: string, x: number, y: number): boolean {
  return w.zones.some((z) => z.name === name && x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
}

describe("enemies by biome", () => {
  it("вид спавна входит в разрешённый набор для биома клетки", { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      for (const s of w.spawns) {
        const tx = Math.floor(s.x / 16), ty = Math.floor(s.y / 16);
        if (inZone(w, RUINED, tx, ty)) continue; // 3 спец-спавна сожжённой деревни
        const b = w.biomes![idx(w, tx, ty)];
        const allowed = ALLOWED[b];
        expect(allowed, `seed ${seed}: спавн ${s.kind} в биоме ${b}`).toBeDefined();
        expect(allowed.has(s.kind), `seed ${seed}: ${s.kind} не разрешён в биоме ${b} @(${tx},${ty})`).toBe(true);
      }
    }
  });

  it("нет спавнов на непроходимых тайлах и в noSpawn-зонах", { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      for (const s of w.spawns) {
        const tx = Math.floor(s.x / 16), ty = Math.floor(s.y / 16);
        const t = w.tiles[idx(w, tx, ty)];
        if (inZone(w, RUINED, tx, ty)) {
          // Спец-спавны сожжённой деревни: можно на VILLAGE/RUINS, но не на
          // солидах/воде/дорожном покрытии
          const badRuined = isSolidTileId(t) || t === Tl.WATER || t === Tl.POOL
            || t === Tl.SHORE || t === Tl.PATH;
          expect(badRuined, `seed ${seed}: спец-спавн vR на тайле ${t} @(${tx},${ty})`).toBe(false);
          continue;
        }
        const badTile = isSolidTileId(t) || t === Tl.WATER || t === Tl.POOL || t === Tl.SHORE
          || t === Tl.PATH || t === Tl.VILLAGE || t === Tl.PALISADE || t === Tl.HOUSE
          || t === Tl.STAIRS || t === Tl.ALTAR;
        expect(badTile, `seed ${seed}: спавн ${s.kind} на тайле ${t} @(${tx},${ty})`).toBe(false);

        for (const name of ["Поселение выживших", "Воронья Гавань"]) {
          const z = w.zones.find((zz) => zz.name === name)!;
          const within = tx >= z.x - 8 && tx <= z.x + z.w + 8 && ty >= z.y - 8 && ty <= z.y + z.h + 8;
          expect(within, `seed ${seed}: спавн в noSpawn деревни «${name}»`).toBe(false);
        }
        expect(Math.hypot(tx - w.treeAltar.x, ty - w.treeAltar.y) < 13,
          `seed ${seed}: спавн у алтаря`).toBe(false);
      }
    }
  });

  it("спавны есть во всех «боевых» биомах", { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      const seen = new Set<number>();
      for (const s of w.spawns) {
        const tx = Math.floor(s.x / 16), ty = Math.floor(s.y / 16);
        if (inZone(w, RUINED, tx, ty)) continue;
        seen.add(w.biomes![idx(w, tx, ty)]);
      }
      // Лес и топи — «высокая плотность», должны присутствовать
      expect(seen.has(Biome.FOREST), `seed ${seed}: нет врагов в лесу`).toBe(true);
      expect(seen.has(Biome.SWAMP), `seed ${seed}: нет врагов в топях`).toBe(true);
      // В снежном центре врагов быть не должно
      expect(seen.has(Biome.SNOW), `seed ${seed}: враги в снежном центре`).toBe(false);
    }
  });
});
