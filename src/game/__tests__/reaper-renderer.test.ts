/* __tests__/reaper-renderer.test.ts — регрессия: коса Жнеца должна рисоваться */

import { describe, it, expect } from 'vitest';
import type { IEnemyData } from '../models';
import { ReaperRenderer } from '../renderers/enemy/ReaperRenderer';

interface PolyCall { points: number[]; color: any; }
interface LineCall { x1: number; y1: number; x2: number; y2: number; color: any; width: number; }

/** Мок IRenderer — записывает вызовы примитивов. */
class MockRenderer {
  polys: PolyCall[] = [];
  lines: LineCall[] = [];
  clearGraphics(): void { /* no-op */ }
  drawRect(): void { /* no-op */ }
  drawEllipse(): void { /* no-op */ }
  drawPoly(_g: any, points: number[], color: any): void {
    this.polys.push({ points, color });
  }
  drawLine(_g: any, x1: number, y1: number, x2: number, y2: number, color: any, width = 1): void {
    this.lines.push({ x1, y1, x2, y2, color, width });
  }
}

function reaperData(state: string): IEnemyData {
  return {
    x: 0, y: 0, kind: 'reaper', r: 10,
    hp: 16, maxHp: 16,
    facing: { x: 0, y: 0 }, t: 0, state,
    aggro: true, dead: false, hidden: false,
    lungeT: 0, freezeT: 0, flashT: 0,
    seed: 1, fade: 1, leash: null, dropDew: false, nearLitShrine: false,
  };
}

/** Отрисовать Жнеца в состоянии state и вернуть записанные примитивы (time=0 → float=0). */
function draw(state: string): MockRenderer {
  const r = new MockRenderer();
  new ReaperRenderer().render(0 as any, reaperData(state), { time: 0, renderer: r as any });
  return r;
}

/** Лезвие — полигон с наибольшим числом точек (дуги: 2*(N+1)). */
const bladeOf = (r: MockRenderer): PolyCall => r.polys.reduce((a, b) => (b.points.length > a.points.length ? b : a));

/** Черенок косы начинается в (8, -4) корпуса. */
const handleOf = (r: MockRenderer): LineCall => r.lines.find((l) => l.x1 === 8 && l.y1 === -4)!;

describe('ReaperRenderer — коса', () => {
  it('рисует черенок косы от корпуса к острию (state=idle)', () => {
    const handle = handleOf(draw('idle'));
    expect(handle).toBeTruthy();
    // При idle blade=0 → острие в (8 + 12, -4) = (20, -4)
    expect(handle.x2).toBeCloseTo(20, 5);
    expect(handle.y2).toBeCloseTo(-4, 5);
    expect(handle.width).toBe(2);
  });

  it('рисует изогнутое лезвие-полумесяц серебристого цвета', () => {
    const blade = bladeOf(draw('idle'));
    // Дуги лезвия: 2 * (N + 1) = 18 точек
    expect(blade.points.length).toBeGreaterThanOrEqual(10);

    // Цвет — объект Color, а не hex-число (регрессия: number → чёрное лезвие)
    expect(typeof blade.color).toBe('object');
    expect(blade.color.r).toBeCloseTo(0xb9 / 255, 5);
    expect(blade.color.g).toBeCloseTo(0xc2 / 255, 5);
    expect(blade.color.b).toBeCloseTo(0xc9 / 255, 5);
    expect(blade.color.a).toBeGreaterThan(0);
  });

  it('все полигоны получают объект Color, а не число', () => {
    for (const p of draw('swing').polys) {
      expect(typeof p.color).toBe('object');
    }
  });

  it('угол лезвия зависит от состояния (коса машет)', () => {
    const wind = handleOf(draw('wind'));
    const swing = handleOf(draw('swing'));
    const stuck = handleOf(draw('stuck'));
    expect(Math.hypot(handleOf(draw('idle')).x2 - 20, handleOf(draw('idle')).y2 + 4)).toBeLessThan(1e-9);
    expect(Math.hypot(wind.x2 - swing.x2, wind.y2 - swing.y2)).toBeGreaterThan(5);
    expect(Math.hypot(swing.x2 - stuck.x2, swing.y2 - stuck.y2)).toBeGreaterThan(1);
  });

  it('кольцо-телеграф рисуется только при замахе', () => {
    // wind: черенок + сегменты кольца; idle: только черенок
    expect(draw('wind').lines.length).toBeGreaterThan(8);
    expect(draw('idle').lines.length).toBe(1);
  });

  it('тело получает объект Color (не чёрный из числа)', () => {
    const body = draw('idle').polys.reduce((a, b) => (b.points.length < a.points.length ? b : a));
    expect(typeof body.color).toBe('object');
    expect(body.color.r).toBeGreaterThanOrEqual(0);
  });
});
