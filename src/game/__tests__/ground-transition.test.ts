/* ground-transition.test.ts — регрессия грунта и скорости:
   - камень не меняет грунт биома (рисуется поверх луга/леса/болота/снега);
   - между биомами есть переход (дизеринг грунта у стыка);
   - скорость движения зависит от поверхности (дорога/пол = 1, снег/трава/болото < 1). */

import { describe, it, expect } from "vitest";
import { drawTileBatch } from "../geometry/tile-geom";
import { tileSpeedMul, speedMulAt } from "../terrain-speed";
import { T, Tl, Biome, type WorldData } from "../world";
import { rgb } from "../geometry/geom-utils";

interface RectCall { x: number; y: number; w: number; h: number; color: any; }

class MockRenderer {
  rects: RectCall[] = [];
  createGraphics(): any { return 0; }
  drawRect(_g: any, r: { x: number; y: number; width: number; height: number }, color: any): void {
    this.rects.push({ x: r.x, y: r.y, w: r.width, h: r.height, color });
  }
}

const eq = (c: any, hex: number): boolean => {
  const e = rgb(hex);
  return Math.abs(c.r - e.r) < 1e-6 && Math.abs(c.g - e.g) < 1e-6 && Math.abs(c.b - e.b) < 1e-6;
};

/** Базовый цвет грунта тайла (заливка T×T в его левом верхнем углу). */
function baseColorAt(r: MockRenderer, tx: number, ty: number): any {
  const rect = r.rects.find((c) => c.x === tx * T && c.y === ty * T && c.w === T && c.h === T);
  return rect ? rect.color : null;
}

function render(w: Partial<WorldData>): MockRenderer {
  const r = new MockRenderer();
  drawTileBatch(r as any, 0 as any, w as WorldData);
  return r;
}

const FOREST = 0x26333c, MEADOW = 0x5f6b52, SNOW = 0x8b98a6, SWAMP = 0x2c3a3e, ROCK_GREY = 0x5f6b78;
const TREE_DARK = 0x1c262e, SNOW2 = 0x7e8b99;

describe("грунт: камень не меняет тайл биома", () => {
  it("ROCK рисует грунт биома, а не серый камень", () => {
    // Один камень в однородном биоме (12×12 — сэмпл далеко от границ биома)
    const W = 12, H = 12, cx = 6, cy = 6;
    const cases: Array<[number, number, number]> = [
      [Biome.FOREST, FOREST, Tl.FOREST],
      [Biome.MEADOW, MEADOW, Tl.MEADOW],
      [Biome.SNOW, SNOW, Tl.SNOW],
      [Biome.SWAMP, SWAMP, Tl.SWAMP],
    ];
    for (const [biome, color, ground] of cases) {
      const tiles = new Uint8Array(W * H).fill(ground);
      tiles[cy * W + cx] = Tl.ROCK;
      const biomes = new Uint8Array(W * H).fill(biome);
      const r = render({ W, H, tiles, biomes });
      expect(eq(baseColorAt(r, cx, cy), color), `под камнем в биоме ${biome} — грунт биома`).toBe(true);
      expect(r.rects.some((c) => eq(c.color, ROCK_GREY)), "не должно быть серого каменного грунта").toBe(false);
    }
  });
});

describe("грунт: дерево на заснеженной горе стоит в снегу", () => {
  const W = 12, H = 12, cx = 6, cy = 6;

  it("TREE в биоме SNOW рисует снег своей террасы, а не тёмный лесной ковёр", () => {
    // Вершина (lv 5) и высокогорье (lv 3): под деревом — снег соответствующего тона
    const cases: Array<[number, number]> = [[0.87, SNOW], [0.54, SNOW2]];
    for (const [h, color] of cases) {
      const tiles = new Uint8Array(W * H).fill(color === SNOW ? Tl.SNOW : Tl.SNOW2);
      tiles[cy * W + cx] = Tl.TREE;
      const biomes = new Uint8Array(W * H).fill(Biome.SNOW);
      const height = new Float32Array(W * H).fill(h);
      const r = render({ W, H, tiles, biomes, height });
      expect(eq(baseColorAt(r, cx, cy), color), `под деревом на высоте ${h} — снег террасы`).toBe(true);
      expect(r.rects.some((c) => eq(c.color, TREE_DARK)), "не должно быть тёмного лесного грунта под деревом").toBe(false);
    }
  });

  it("TREE в лесу сохраняет тёмный лесной ковёр (роща не меняется)", () => {
    const tiles = new Uint8Array(W * H).fill(Tl.FOREST);
    tiles[cy * W + cx] = Tl.TREE;
    const biomes = new Uint8Array(W * H).fill(Biome.FOREST);
    const r = render({ W, H, tiles, biomes });
    expect(eq(baseColorAt(r, cx, cy), TREE_DARK), "в лесу под деревом — тёмный лесной грунт").toBe(true);
  });
});

describe("грунт: переход между биомами", () => {
  const W = 24, H = 8;
  const tiles = new Uint8Array(W * H);
  const biomes = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const forest = x < W / 2;
      tiles[i] = forest ? Tl.FOREST : Tl.MEADOW;
      biomes[i] = forest ? Biome.FOREST : Biome.MEADOW;
    }
  }
  const r = render({ W, H, tiles, biomes });

  it("вдали от стыка грунт чистый", () => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x <= 7; x++) {
        expect(eq(baseColorAt(r, x, y), FOREST), `лес x=${x},y=${y} далеко от границы`).toBe(true);
      }
      for (let x = 16; x < W; x++) {
        expect(eq(baseColorAt(r, x, y), MEADOW), `луг x=${x},y=${y} далеко от границы`).toBe(true);
      }
    }
  });

  it("у стыка появляются оба грунта (дизеринг-переход)", () => {
    let forestOnMeadowSide = 0, meadowOnForestSide = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 8; x <= 11; x++) if (eq(baseColorAt(r, x, y), MEADOW)) meadowOnForestSide++;
      for (let x = 12; x <= 15; x++) if (eq(baseColorAt(r, x, y), FOREST)) forestOnMeadowSide++;
    }
    expect(meadowOnForestSide, "луг должен «затекать» на лесную сторону").toBeGreaterThan(0);
    expect(forestOnMeadowSide, "лес должен «затекать» на луговую сторону").toBeGreaterThan(0);
  });
});

describe("скорость по поверхности", () => {
  it("дорога и пол подземелья — базовая (1)", () => {
    expect(tileSpeedMul(Tl.PATH)).toBe(1);
    expect(tileSpeedMul(Tl.DFLOOR)).toBe(1);
  });

  it("снег, трава и болото замедляют", () => {
    for (const t of [Tl.SNOW, Tl.SNOW2, Tl.GRASS, Tl.SWAMP, Tl.FOREST, Tl.MEADOW]) {
      expect(tileSpeedMul(t), `тайл ${t}`).toBeLessThan(1);
      expect(tileSpeedMul(t), `тайл ${t}`).toBeGreaterThan(0);
    }
    // Топь медленнее снега, снег медленнее луга
    expect(tileSpeedMul(Tl.SWAMP)).toBeLessThan(tileSpeedMul(Tl.SNOW));
    expect(tileSpeedMul(Tl.SNOW)).toBeLessThan(tileSpeedMul(Tl.MEADOW));
  });

  it("speedMulAt берёт тайл под точкой", () => {
    const W = 4, H = 2;
    const tiles = new Uint8Array(W * H).fill(Tl.MEADOW);
    tiles[1] = Tl.PATH;          // (1,0)
    const map = { W, H, tiles } as WorldData;
    expect(speedMulAt(map, 1 * T + 8, 0 * T + 8)).toBe(1);
    expect(speedMulAt(map, 2 * T + 8, 0 * T + 8)).toBe(tileSpeedMul(Tl.MEADOW));
    // вне карты — базовая
    expect(speedMulAt(map, -50, 0)).toBe(1);
  });
});
