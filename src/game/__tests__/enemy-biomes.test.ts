/* enemy-biomes.test.ts — враги распределены по биомам и не попадают в
   запретные зоны (деревни, алтарь, непроходимые тайлы). */
import { describe, expect, it } from "vitest";
import { generateOverworld } from "../generators/overworld";
import { DUNGEONS } from "../generators/dungeons";
import { Biome, Tl, idx, isSolidTileId, type WorldData } from "../generators/types";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

/** Разрешённые виды врагов по биому (драугр не входит: он живёт только в
    Сожжённой Деревне и в подземелии гиганта) */
const ALLOWED: Record<number, Set<string>> = {
  [Biome.SNOW]: new Set(["frost", "varg"]),
  [Biome.FOREST]: new Set(["shroom", "raven", "varg"]),
  [Biome.SWAMP]: new Set(["crawler"]),
  [Biome.MEADOW]: new Set(["raven", "crawler"]),
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

  it("призраки не спавнятся статично (только в тумане)", { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      const ghosts = w.spawns.filter((s) => s.kind === "ghost");
      expect(ghosts.length, `seed ${seed}: найдено статичных призраков: ${ghosts.length}`).toBe(0);
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
      // Зима (снег): frost/varg живут вне зоны священной гряды
      expect(seen.has(Biome.SNOW), `seed ${seed}: нет врагов в снегу`).toBe(true);
      // В зоне священной гряды врагов быть не должно
      for (const s of w.spawns) {
        const tx = Math.floor(s.x / 16), ty = Math.floor(s.y / 16);
        expect(inZone(w, "Священная Гряда", tx, ty),
          `seed ${seed}: спавн ${s.kind} в священной зоне @(${tx},${ty})`).toBe(false);
      }
    }
  });

  it("драугр на поверхности встречается только в Сожжённой Деревне", { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      const draugrs = w.spawns.filter((s) => s.kind === "draugr");
      expect(draugrs.length, `seed ${seed}: драугров найдено: ${draugrs.length}`).toBeGreaterThan(0);
      for (const s of draugrs) {
        const tx = Math.floor(s.x / 16), ty = Math.floor(s.y / 16);
        expect(inZone(w, RUINED, tx, ty),
          `seed ${seed}: драугр вне Сожжённой Деревни @(${tx},${ty})`).toBe(true);
      }
    }
  });

  it("драугр есть только в подземелии гиганта (Каменная Крепость)", () => {
    for (const cfg of DUNGEONS) {
      const has = cfg.pool.includes("draugr");
      expect(has, `${cfg.name}: драугр в пуле`).toBe(cfg.boss === "giant");
    }
  });

  it("скелеты есть только в Склепе Хранителя (подземелье 1)", () => {
    for (const cfg of DUNGEONS) {
      const skeletons = cfg.pool.filter((k) => k === "skeleton" || k === "skeleton_archer");
      if (cfg.id === 0) {
        expect(skeletons.length, `${cfg.name}: скелеты в пуле`).toBeGreaterThan(0);
        expect(cfg.pool.includes("skeleton"), `${cfg.name}: мечник`).toBe(true);
        expect(cfg.pool.includes("skeleton_archer"), `${cfg.name}: лучник`).toBe(true);
      } else {
        expect(skeletons.length, `${cfg.name}: скелетов быть не должно`).toBe(0);
      }
    }
  });

  it("на поверхности нет пауков (босс подземелий)", { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const w = generateOverworld(seed);
      const spiders = w.spawns.filter((s) => s.kind === "spider");
      expect(spiders.length, `seed ${seed}: статичных пауков: ${spiders.length}`).toBe(0);
    }
  });
});
