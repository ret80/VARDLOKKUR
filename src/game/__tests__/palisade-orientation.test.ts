/* __tests__/palisade-orientation.test.ts — регрессия: частокол ориентируется по соседям */

import { describe, it, expect } from 'vitest';
import {
  drawWallGeometry,
  FENCE_N,
  FENCE_E,
  FENCE_S,
  FENCE_W,
} from '../geometry/wall-geom';
import { Tl } from '../world';

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

/** Отрисовать тайл PALISADE по маске соединений. */
function draw(mask: number): MockRenderer {
  const r = new MockRenderer();
  drawWallGeometry(r as any, 0 as any, Tl.PALISADE, mask, 0, 0);
  return r;
}

const hasRect = (r: MockRenderer, x: number, y: number, w: number, h: number): boolean =>
  r.rects.some((c) => c.x === x && c.y === y && c.w === w && c.h === h);

/** Колышки прямого горизонтального пролёта: тело 3×13 на y=2. */
const pickets = (r: MockRenderer): number[] =>
  r.rects.filter((c) => c.y === 2 && c.w === 3 && c.h === 13).map((c) => c.x).sort((a, b) => a - b);

describe('PALISADE — ориентация по соседям', () => {
  it('прямой горизонтальный пролёт: 4 колышка + перила на всю ширину', () => {
    const r = draw(FENCE_E | FENCE_W);
    expect(pickets(r)).toEqual([1, 5, 9, 13]);
    // Двойные перила во всю ширину тайла.
    expect(hasRect(r, 0, 6, 16, 1)).toBe(true);
    expect(hasRect(r, 0, 10, 16, 1)).toBe(true);
  });

  it('прямой вертикальный пролёт: два кола, без перил', () => {
    const r = draw(FENCE_N | FENCE_S);
    // Нет колышков горизонтального пролёта и нет перил во всю ширину.
    expect(pickets(r)).toEqual([]);
    expect(hasRect(r, 0, 6, 16, 1)).toBe(false);
    // Колья: воротник верхнего (y=1) и нижнего (y=9), тело 3px.
    expect(hasRect(r, 6, 1, 3, 1)).toBe(true);
    expect(hasRect(r, 7, 9, 3, 1)).toBe(true);
  });

  it('горизонтальный и вертикальный пролёты рисуются по-разному', () => {
    const h = draw(FENCE_E | FENCE_W);
    const v = draw(FENCE_N | FENCE_S);
    const key = (c: RectCall) => `${c.x},${c.y},${c.w},${c.h}`;
    expect(h.rects.map(key).sort()).not.toEqual(v.rects.map(key).sort());
  });

  it('угол E (соединён на восток и юг): перила к краю + столб у края', () => {
    const r = draw(FENCE_E | FENCE_S);
    // Перила только к восточной стороне (§ от x=6 до края).
    expect(hasRect(r, 6, 6, 10, 1)).toBe(true);
    // Столб-колышек у правого края.
    expect(pickets(r)).toEqual([12]);
    // Кол к нижней стороне.
    expect(hasRect(r, 7, 9, 3, 1)).toBe(true);
  });

  it('угол W зеркален углу E', () => {
    const r = draw(FENCE_W | FENCE_S);
    expect(hasRect(r, 0, 6, 10, 1)).toBe(true);
    expect(pickets(r)).toEqual([1]);
  });
});
