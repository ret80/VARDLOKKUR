/* ============ PhysicsSystem ============ */
import { WorldData, Vec, T, solidTileAt } from "../world";
import { dist2, clamp } from "../utils";

/* ---------- Интерфейс физики (DIP: системы зависят от абстракции) ---------- */

export interface PhysicsEntity {
  x: number; y: number; r: number;
}

export interface PhysicsDoor {
  open: number;
  x: number; y: number;
}

export interface PhysicsBarrier {
  active: boolean;
  x: number; y: number;
}

export interface IPhysics {
  moveWithCollisions(e: PhysicsEntity, dx: number, dy: number, map: WorldData, doors: PhysicsDoor[], barrier: PhysicsBarrier | null): void;
  pointSolid(x: number, y: number, map: WorldData, doors: PhysicsDoor[], barrier: PhysicsBarrier | null): boolean;
  hasLOS(x0: number, y0: number, x1: number, y1: number, map: WorldData): boolean;
  followPath(e: { repathT?: number; path?: { x: number; y: number }[] | null; pathI?: number; vx?: number; vy?: number }, tx: number, ty: number, speed: number, dt: number, map: WorldData): void;
}

export class PhysicsSystem implements IPhysics {
  circleHitsSolid(x: number, y: number, r: number, map: WorldData): boolean {
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
    const y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!solidTileAt(map, tx, ty)) continue;
      const cx = clamp(x, tx * T, tx * T + T), cy = clamp(y, ty * T, ty * T + T);
      if (dist2(x, y, cx, cy) < r * r) return true;
    }
    return false;
  }

  solidRects(doors: any[], barrier: any): { x: number; y: number; w: number; h: number }[] {
    const rs: { x: number; y: number; w: number; h: number }[] = [];
    for (const d of doors) {
      if (d.open < 0.9) rs.push({ x: d.x - 9, y: d.y - 8, w: 18, h: 16 });
    }
    if (barrier && barrier.active) rs.push({ x: barrier.x - 20, y: barrier.y - 8, w: 40, h: 16 });
    return rs;
  }

  circleBlocked(x: number, y: number, r: number, map: WorldData, doors: any[], barrier: any): boolean {
    if (this.circleHitsSolid(x, y, r, map)) return true;
    const rects = this.solidRects(doors, barrier);
    for (const rc of rects) {
      const cx = clamp(x, rc.x, rc.x + rc.w), cy = clamp(y, rc.y, rc.y + rc.h);
      if (dist2(x, y, cx, cy) < r * r) return true;
    }
    return false;
  }

  moveWithCollisions(e: { x: number; y: number; r: number }, dx: number, dy: number, map: WorldData, doors: any[], barrier: any) {
    if (dx) { const nx = e.x + dx; if (!this.circleBlocked(nx, e.y, e.r, map, doors, barrier)) e.x = nx; }
    if (dy) { const ny = e.y + dy; if (!this.circleBlocked(e.x, ny, e.r, map, doors, barrier)) e.y = ny; }
  }

  resolveTiles(e: { x: number; y: number; r: number }, safe: Vec, map: WorldData) {
    for (let iter = 0; iter < 3; iter++) {
      if (!this.circleHitsSolid(e.x, e.y, e.r, map)) return;
      const x0 = Math.floor((e.x - e.r) / T), x1 = Math.floor((e.x + e.r) / T);
      const y0 = Math.floor((e.y - e.r) / T), y1 = Math.floor((e.y + e.r) / T);
      let pushed = false;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (!solidTileAt(map, tx, ty)) continue;
        const cx = clamp(e.x, tx * T, tx * T + T), cy = clamp(e.y, ty * T, ty * T + T);
        const dx = e.x - cx, dy = e.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < e.r * e.r && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          e.x = cx + (dx / d) * e.r;
          e.y = cy + (dy / d) * e.r;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
    if (this.circleHitsSolid(e.x, e.y, e.r, map)) { e.x = safe.x; e.y = safe.y; }
  }

  hasLOS(x0: number, y0: number, x1: number, y1: number, map: WorldData): boolean {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 10) return true;
    const steps = Math.max(1, Math.ceil(d / 8));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (solidTileAt(map, Math.floor((x0 + dx * t) / T), Math.floor((y0 + dy * t) / T))) return false;
    }
    return true;
  }

  pointSolid(x: number, y: number, map: WorldData, doors: any[], barrier: any): boolean {
    return solidTileAt(map, Math.floor(x / T), Math.floor(y / T)) ||
      this.solidRects(doors, barrier).some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  }

  followPath(e: any, tx: number, ty: number, speed: number, dt: number, map: WorldData) {
    e.repathT -= dt;
    if (e.repathT <= 0 || !e.path) {
      e.repathT = 0.45 + Math.random() * 0.25;
      try {
        const path = map.nav.findPath({ x: e.x, y: e.y }, { x: tx, y: ty });
        e.path = path ? path.map((pt: any) => ({ x: pt.x, y: pt.y })) : null;
        e.pathI = 0;
      } catch { e.path = null; }
    }
    let gx = tx, gy = ty;
    if (e.path && e.pathI < e.path.length) {
      const wp = e.path[e.pathI];
      if (dist2(e.x, e.y, wp.x, wp.y) < 5 * 5) e.pathI++;
      if (e.pathI < e.path.length) { gx = e.path[e.pathI].x; gy = e.path[e.pathI].y; }
    }
    const dx = gx - e.x, dy = gy - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) { e.vx = (dx / d) * speed; e.vy = (dy / d) * speed; }
  }
}


