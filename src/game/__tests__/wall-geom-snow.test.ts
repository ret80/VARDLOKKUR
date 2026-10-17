/* wall-geom-snow.test.ts — регрессия отрисовки деревьев/травы:
   - снег рисуется только в снежном биоме (флаг snow);
   - пивот в основании: спрайты растут вверх от (0,0). */

import { describe, it, expect } from "vitest";
import { drawWallGeometry } from "../geometry/wall-geom";
import { Tl } from "../world";
import { rgb } from "../geometry/geom-utils";

interface RectCall { x: number; y: number; w: number; h: number; color: any; }

/** Мок IRenderer — записывает прямоугольники (P) и игнорирует остальное. */
class MockRenderer {
  rects: RectCall[] = [];
  createGraphics(): any { return 0; }
  drawRect(_g: any, r: { x: number; y: number; width: number; height: number }, color: any): void {
    this.rects.push({ x: r.x, y: r.y, w: r.width, h: r.height, color });
  }
  drawEllipse(): void { /* no-op */ }
  drawPoly(): void { /* no-op */ }
}

function draw(t: number, variant: number, snow: boolean): MockRenderer {
  const r = new MockRenderer();
  drawWallGeometry(r as any, 0 as any, t, variant, 0, 0, 0, snow);
  return r;
}

const eq = (c: any, hex: number): boolean => {
  const e = rgb(hex);
  return Math.abs(c.r - e.r) < 1e-6 && Math.abs(c.g - e.g) < 1e-6 && Math.abs(c.b - e.b) < 1e-6;
};

const SNOW_COLORS = [0xc8d3dc, 0xeef6fc, 0x8b98a6];
const hasSnow = (r: MockRenderer): boolean =>
  r.rects.some((c) => SNOW_COLORS.some((h) => eq(c.color, h)));

const baseOnly = (r: MockRenderer): boolean =>
  Math.max(...r.rects.map((c) => c.y + c.h)) <= 0 && Math.min(...r.rects.map((c) => c.y)) < 0;

describe("wall-geom: снег и пивот в основании", () => {
  it("TREE: снег только при snow=true", () => {
    expect(hasSnow(draw(Tl.TREE, 0, false)), "дерево без снега не должно рисовать снег").toBe(false);
    expect(hasSnow(draw(Tl.TREE, 0, true)), "дерево в снегу должно рисовать снег").toBe(true);
    // ель (variant bit0)
    expect(hasSnow(draw(Tl.TREE, 1, false)), "ель без снега не должна рисовать снег").toBe(false);
    expect(hasSnow(draw(Tl.TREE, 1, true)), "ель в снегу должна рисовать снег").toBe(true);
  });

  it("FIR/DEADTREE: снег только при snow=true", () => {
    expect(hasSnow(draw(Tl.FIR, 0, false))).toBe(false);
    expect(hasSnow(draw(Tl.FIR, 0, true))).toBe(true);
    expect(hasSnow(draw(Tl.DEADTREE, 0, false))).toBe(false);
    expect(hasSnow(draw(Tl.DEADTREE, 0, true))).toBe(true);
  });

  it("TREE/FIR/GRASS: спрайт растёт вверх от основания (0,0)", () => {
    for (const t of [Tl.TREE, Tl.FIR, Tl.DEADTREE, Tl.GRASS]) {
      expect(baseOnly(draw(t, 0, false)), `tile ${t}`).toBe(true);
      expect(baseOnly(draw(t, 2, false)), `tile ${t} mirrored`).toBe(true);
    }
  });

  it("GRASS: объёмный пучок (более одного тайла-пикселя в высоту)", () => {
    const r = draw(Tl.GRASS, 0, false);
    expect(r.rects.length, "у пучка травы должно быть несколько колосков").toBeGreaterThan(4);
    expect(r.rects.some((c) => c.h >= 10), "высокий центральный колосок").toBe(true);
    expect(r.rects.some((c) => eq(c.color, 0x364807)), "тёмные наружные колоски").toBe(true);
  });

  it("ROCK: снежная шапка при snow=true", () => {
    expect(draw(Tl.ROCK, 0, false).rects.some((c) => eq(c.color, 0xdbe5ee))).toBe(false);
    expect(draw(Tl.ROCK, 0, true).rects.some((c) => eq(c.color, 0xdbe5ee))).toBe(true);
  });
});
