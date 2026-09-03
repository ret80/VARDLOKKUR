/* ============ PhysicsSystem ============
 * Адаптер между IPhysics (используется всеми системами) и PlanckWorld.
 * moveWithCollisions → no-op (Planck обрабатывает коллизии автоматически)
 * pointSolid → Planck queryAABB
 * hasLOS → Planck rayCast
 * followPath → остаётся как есть (AI-логика) */

import { WorldData, Vec, T, solidTileAt } from "../world";
import { dist2 } from "../utils";
import { PlanckWorld } from "./planck-world";

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
  private planck: PlanckWorld | null = null;

  setPlanckWorld(planck: PlanckWorld): void {
    this.planck = planck;
  }

  // ============================================================
  // moveWithCollisions — NO-OP
  // Planck.js обрабатывает коллизии автоматически через body.linearVelocity
  // Движение управляется через body.setLinearVelocity() в AI/Engine
  // ============================================================

  moveWithCollisions(e: { x: number; y: number; r: number }, dx: number, dy: number, map: WorldData, doors: any[], barrier: any): void {
    // NO-OP — Planck handles collision resolution automatically
    // Movement is controlled via body.setLinearVelocity()
  }

  // ============================================================
  // pointSolid — проверяем через Planck world query
  // ============================================================

  pointSolid(x: number, y: number, map: WorldData, doors: PhysicsDoor[], barrier: PhysicsBarrier | null): boolean {
    if (this.planck) {
      if (this.planck.pointSolid(x, y, doors, barrier)) return true;
    }

    // Fallback: tile-based check
    return solidTileAt(map, Math.floor(x / T), Math.floor(y / T));
  }

  // ============================================================
  // hasLOS — проверяем через Planck rayCast
  // ============================================================

  hasLOS(x0: number, y0: number, x1: number, y1: number, map: WorldData): boolean {
    if (this.planck) {
      if (!this.planck.hasLOS(x0, y0, x1, y1)) return false;
    }

    // Fallback: Bresenham-style raycast
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

  // ============================================================
  // followPath — без изменений (AI-логика)
  // ============================================================

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
