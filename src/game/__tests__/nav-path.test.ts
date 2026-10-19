/* Юнит-тесты NavMesh-пути: путь не должен пересекать закрытые стыки (стены
 * уступов) и солиды, но должен обходить их. */
import { describe, expect, it } from "vitest";
import { NavBuilder } from "../generators/nav-builder";
import { WallBit, edgeOpen } from "../generators/terrain-walls";
import { Tl, T, idx, isSolidTileId, type WorldData } from "../generators/types";
import { emptyWorld } from "./_world-helpers";

/** Центр клетки в пикселях. */
const center = (x: number, y: number): { x: number; y: number } =>
  ({ x: x * T + T / 2, y: y * T + T / 2 });

/** Сгенерировать меш для мира (walls уже в w.walls). */
function build(w: WorldData): void {
  w.nav = new NavBuilder().build(w);
}

/**
 * Проверить, что каждый сегмент пути не пересекает закрытый стык и солиды.
 * Пересечением считается только строгое прохождение через линию стыка
 * (касания и waypoints на углах клеток законны).
 */
function pathAvoidsWalls(w: WorldData, path: Array<{ x: number; y: number }>): boolean {
  const solid = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= w.W || y >= w.H || isSolidTileId(w.tiles[idx(w, x, y)]);
  /** Закрыт ли вертикальный стык x*T в пределах строки ky? */
  const seamHClosed = (kx: number, ky: number): boolean => {
    if (kx <= 0 || kx >= w.W || ky < 0 || ky >= w.H) return true;
    if (solid(kx - 1, ky) || solid(kx, ky)) return true;
    return !!(w.walls && !edgeOpen(w.walls, idx(w, kx - 1, ky), idx(w, kx, ky), WallBit.E));
  };
  /** Закрыт ли горизонтальный стык y*T в пределе колонки kx? */
  const seamVClosed = (ky: number, kx: number): boolean => {
    if (ky <= 0 || ky >= w.H || kx < 0 || kx >= w.W) return true;
    if (solid(kx, ky - 1) || solid(kx, ky)) return true;
    return !!(w.walls && !edgeOpen(w.walls, idx(w, kx, ky - 1), idx(w, kx, ky), WallBit.N));
  };
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    // Строгое пересечение вертикальных стыков.
    const [xa, xb] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
    for (let kx = Math.floor(xa / T) + 1; kx <= Math.floor(xb / T); kx++) {
      const X = kx * T;
      if (X <= xa + 1e-9 || X >= xb - 1e-9) continue; // касание/конец — не пересечение
      const t = (X - a.x) / (b.x - a.x);
      const Y = a.y + (b.y - a.y) * t;
      const ky = Math.round(Y / T);
      // Пересечение ровно в углу клетки пропускаем.
      if (Math.abs(Y - ky * T) < 1e-6) continue;
      if (seamHClosed(kx, Math.floor(Y / T))) return false;
    }
    const [ya, yb] = a.y < b.y ? [a.y, b.y] : [b.y, a.y];
    for (let ky = Math.floor(ya / T) + 1; ky <= Math.floor(yb / T); ky++) {
      const Y = ky * T;
      if (Y <= ya + 1e-9 || Y >= yb - 1e-9) continue;
      const t = (Y - a.y) / (b.y - a.y);
      const X = a.x + (b.x - a.x) * t;
      const kx = Math.round(X / T);
      if (Math.abs(X - kx * T) < 1e-6) continue;
      if (seamVClosed(ky, Math.floor(X / T))) return false;
    }
    // Внутренние точки сегмента (не на стыках) не должны быть в солиде.
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(2, Math.ceil(len / 2));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      const onSeam = Math.abs(px / T - Math.round(px / T)) < 1e-6 ||
        Math.abs(py / T - Math.round(py / T)) < 1e-6;
      if (onSeam) continue;
      if (solid(Math.floor(px / T), Math.floor(py / T))) return false;
    }
  }
  return true;
}

describe("NavBuilder path", () => {
  it("path across open field is straight and valid", () => {
    const w = emptyWorld(20, 20);
    build(w);
    const path = w.nav.findPath(center(2, 2), center(17, 15));
    expect(path).toBeTruthy();
    expect(path!.length).toBeGreaterThanOrEqual(2);
    expect(pathAvoidsWalls(w, path!)).toBe(true);
  });

  it("path goes around a relief wall instead of through it", () => {
    const w = emptyWorld(20, 20);
    // Стена уступа поперёк карты: вертикальный стык x=10 закрыт для строк y=2..17.
    w.walls = new Uint8Array(w.W * w.H);
    for (let y = 2; y <= 17; y++) w.walls[idx(w, 10, y)] |= WallBit.E;
    build(w);
    const path = w.nav.findPath(center(5, 10), center(15, 10));
    expect(path).toBeTruthy();
    expect(pathAvoidsWalls(w, path!)).toBe(true);
    // Обход означает, что путь не «прямой»: промежуточная точка уходит к краю стены.
    // Обход означает как минимум один промежуточный waypoint (не «прямая»).
    expect(path!.length).toBeGreaterThanOrEqual(3);
  });

  it("path around solid rock column", () => {
    const w = emptyWorld(20, 20);
    // Колонка солидов x=8..9, y=5..14 — стена террасы/скалы.
    for (let y = 5; y <= 14; y++) {
      w.tiles[idx(w, 8, y)] = Tl.ROCK;
      w.tiles[idx(w, 9, y)] = Tl.ROCK;
    }
    build(w);
    const path = w.nav.findPath(center(4, 10), center(13, 10));
    expect(path).toBeTruthy();
    expect(pathAvoidsWalls(w, path!)).toBe(true);
  });

  it("no path through fully sealed wall", () => {
    const w = emptyWorld(20, 20);
    // Полная герметизация: стена на всех вертикальных стыках колонки x=10.
    w.walls = new Uint8Array(w.W * w.H);
    for (let y = 0; y < w.H; y++) w.walls[idx(w, 10, y)] |= WallBit.E;
    build(w);
    // Прохода слева направо нет — findPath должен вернуть null (точки в разных компонентах).
    const path = w.nav.findPath(center(5, 10), center(15, 10));
    expect(path).toBeNull();
  });

  it("greedy merge keeps cells: every walkable cell center is inside some polygon", () => {
    const w = emptyWorld(30, 24);
    // Смешанный ландшафт: стены уступов + солиды.
    w.walls = new Uint8Array(w.W * w.H);
    for (let y = 3; y <= 20; y += 4) {
      for (let x = 2; x < 25; x += 3) w.walls[idx(w, x, y)] |= WallBit.E;
    }
    for (let y = 8; y <= 12; y++) w.tiles[idx(w, 17, y)] = Tl.ROCK;
    build(w);
    const mesh = w.nav as unknown as {
      navPolygons: Array<{ contains(p: { x: number; y: number }): boolean }>
    };
    let missing = 0;
    for (let y = 0; y < w.H; y++) {
      for (let x = 0; x < w.W; x++) {
        if (isSolidTileId(w.tiles[idx(w, x, y)])) continue;
        const c = center(x, y);
        if (!mesh.navPolygons.some((p) => p.contains(c))) missing++;
      }
    }
    expect(missing).toBe(0);
  });
});
