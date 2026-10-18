import { describe, it, expect } from "vitest";
import { generateOverworld } from "../generators/overworld";
import { Biome, Tl, elevLevel } from "../generators/types";
import { R_MOUNT, ICX, ICY } from "../generators/island-generator";

/** Требования из tasks/world_gen_imp_3.md + правила поселений/алтаря. */
describe("world gen rules (task 3)", () => {
  const seeds = [1, 2, 3, 5, 8, 13];

  it("террасы строго вложены: peak ⊂ highland ⊂ foothill; уровни не соприкасаются", () => {
    for (const seed of seeds) {
      const w = generateOverworld(seed);
      const lv = (x: number, y: number) => elevLevel(w.height![y * w.W + x]);
      let c1 = 0, c3 = 0, c5 = 0;
      const bad: string[] = [];
      for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
        const l = lv(x, y);
        if (l >= 5) c5++; else if (l >= 3) c3++; else if (l >= 1) c1++;
        const need = l >= 5 ? 3 : l === 3 ? 1 : -1; // минимум для соседей
        if (need < 0) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w.W || ny >= w.H) continue;
          if (lv(nx, ny) < need && bad.length < 5) bad.push(`(${nx},${ny}) lv=${lv(nx, ny)} у клетки lv=${l}`);
        }
      }
      expect(bad, `seed ${seed}: нарушенная вложенность террас`).toEqual([]);
      expect(c5, `seed ${seed}: пик`).toBeGreaterThan(0);
      expect(c5, `seed ${seed}: пик < highland`).toBeLessThan(c3);
      expect(c3, `seed ${seed}: highland < foothill`).toBeLessThan(c1);
    }
  }, 60000);

  it("болото всегда уровень 0 (без террас в болоте)", () => {
    for (const seed of seeds) {
      const w = generateOverworld(seed);
      for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
        if (w.biomes![y * w.W + x] !== Biome.SWAMP) continue;
        expect(elevLevel(w.height![y * w.W + x]), `seed ${seed}: болото (${x},${y}) на террасе`).toBe(0);
      }
    }
  });

  it("пятна холмов: уровень >0 только внутри массива луга (все соседи — луг)", () => {
    for (const seed of seeds) {
      const w = generateOverworld(seed);
      for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
        const i = y * w.W + x;
        if (w.biomes![i] !== Biome.MEADOW || elevLevel(w.height![i]) === 0) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w.W || ny >= w.H) continue;
          expect(w.biomes![ny * w.W + nx], `seed ${seed}: пятно холма вне луга (${nx},${ny})`).toBe(Biome.MEADOW);
        }
      }
    }
  });

  it("прямоугольник поселения целиком на одном уровне; болота в нём нет", () => {
    for (const seed of seeds) {
      const w = generateOverworld(seed);
      const settlements = w.zones.filter((z) => /Поселение выживших|Воронья Гавань|Сожжённая Деревня/.test(z.name));
      expect(settlements.length, `seed ${seed}: поселения не найдены`).toBeGreaterThanOrEqual(2);
      for (const z of settlements) {
        const lv0 = elevLevel(w.height![z.y * w.W + z.x]);
        for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) {
          const i = y * w.W + x;
          expect(w.biomes![i], `seed ${seed}: болото в поселении «${z.name}» (${x},${y})`).not.toBe(Biome.SWAMP);
          expect(elevLevel(w.height![i]), `seed ${seed}: «${z.name}» (${x},${y}) level != ${lv0}`).toBe(lv0);
        }
      }
    }
  });

  it("алтарь Древа стоит в болоте, вдали от гор (rMin = R_MOUNT)", () => {
    for (const seed of seeds) {
      const w = generateOverworld(seed);
      const a = w.treeAltar;
      const d = Math.hypot(a.x - ICX, a.y - ICY);
      expect(d, `seed ${seed}: алтарь у горы`).toBeGreaterThanOrEqual(R_MOUNT);
      expect(w.biomes![a.y * w.W + a.x], `seed ${seed}: алтарь не в болоте`).toBe(Biome.SWAMP);
    }
  });

  it("кромки террас не выкладываются камнем: CLIFF/SCREE отсутствуют в мире", () => {
    for (const seed of seeds) {
      const w = generateOverworld(seed);
      const bad: string[] = [];
      for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
        const t = w.tiles[y * w.W + x];
        if ((t === Tl.CLIFF || t === Tl.SCREE) && bad.length < 5) {
          const b = w.biomes![y * w.W + x];
          bad.push(`(${x},${y}) tile=${t} biome=${b} lv=${elevLevel(w.height![y * w.W + x])}`);
        }
      }
      expect(bad, `seed ${seed}: каменные тайлы на кромках террас`).toEqual([]);
    }
  });

  it("грунт клетки несёт цвет своего биома/уровня (снег не подменяется камнем)", () => {
    const GROUND = new Set<number>([Tl.SNOW, Tl.SNOW2, Tl.MTN, Tl.FOREST, Tl.MEADOW, Tl.SWAMP]);
    for (const seed of seeds) {
      const w = generateOverworld(seed);
      const bad: string[] = [];
      for (let y = 1; y < w.H - 1; y++) for (let x = 1; x < w.W - 1; x++) {
        const i = y * w.W + x;
        const t = w.tiles[i];
        // Проверяем только чистый грунт: декор (TREE/GRASS/...), дороги,
        // поселения и спец-точки кладут свои тайлы законно.
        if (!GROUND.has(t)) continue;
        const lv = elevLevel(w.height![i]);
        let want: number;
        switch (w.biomes![i]) {
          case Biome.SNOW: want = lv >= 5 ? Tl.SNOW : lv >= 3 ? Tl.SNOW2 : Tl.MTN; break;
          case Biome.MEADOW: want = lv >= 1 ? Tl.FOREST : Tl.MEADOW; break;
          case Biome.FOREST: want = Tl.FOREST; break;
          case Biome.SWAMP: want = Tl.SWAMP; break;
          default: continue;
        }
        // Снежное дазерение SNOW→SNOW2 — задуманная текстура, не подмена биома
        if (w.biomes![i] === Biome.SNOW && t === Tl.SNOW2 && want === Tl.SNOW) continue;
        if (t !== want && bad.length < 5) {
          bad.push(`(${x},${y}) tile=${t} want=${want} biome=${w.biomes![i]} lv=${lv}`);
        }
      }
      expect(bad, `seed ${seed}: грунт не соответствует биому/уровню`).toEqual([]);
    }
  }, 60000);
});
