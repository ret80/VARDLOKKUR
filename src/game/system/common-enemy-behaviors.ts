/* CommonEnemyBehaviors — handler'ы для обычных врагов */

import { EventBus } from "../event-bus";
import { GameStore } from "../store";
import { Enemy } from "../entities";
import { WorldData, Vec } from "../world";
import { IPhysics } from "./physics-system";
import { dist2 } from "../utils";
import { audio } from "../audio";
import { EnemyBehavior } from "./enemy-behavior";

// ============================================================
//  Общие утилиты
// ============================================================

function isFlyer(kind: string): boolean {
  return kind === "raven" || kind === "ghost";
}

function applyAggroRules(
  e: Enemy,
  d2p: number,
  aggroR: number,
  canSee: boolean,
  inVillage: boolean,
): void {
  if (inVillage && e.aggro) { e.aggro = false; e.path = null; }
  if (!e.aggro && !inVillage && d2p < aggroR * aggroR && canSee) e.aggro = true;
  if (e.aggro && !isFlyer(e.kind) && (!canSee || d2p > 300 * 300)) { e.aggro = false; e.path = null; }
  if (e.aggro && isFlyer(e.kind) && d2p > 300 * 300) e.aggro = false;
}

// ============================================================
//  Draugr / Frost — простой патфоллинг + idle wander
// ============================================================

export class DraugrBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const stopD = e.r + player.r + 2;

    if (e.aggro) {
      if (d > stopD + 1) physics.followPath(e, player.x, player.y, e.speed, dt, map);
      if (d > 1) e.facing = { x: (player.x - e.x) / d, y: (player.y - e.y) / d };
    } else if (Math.floor(e.t) % 4 === 0) {
      e.vx = Math.sin(e.t * 0.7 + e.seed) * e.speed * 0.3;
    }
  }
}

export class FrostBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const stopD = e.r + player.r + 2;

    if (e.aggro) {
      if (d > stopD + 1) physics.followPath(e, player.x, player.y, e.speed, dt, map);
      if (d > 1) e.facing = { x: (player.x - e.x) / d, y: (player.y - e.y) / d };
    } else if (Math.floor(e.t) % 4 === 0) {
      e.vx = Math.sin(e.t * 0.7 + e.seed) * e.speed * 0.3;
    }
  }
}

// ============================================================
//  Varg — лунг-атака
// ============================================================

export class VargBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const stopD = e.r + player.r + 2;

    if (e.aggro) {
      if (d > 1) e.facing = { x: (player.x - e.x) / d, y: (player.y - e.y) / d };
      if (e.stateT > 0) {
        e.stateT -= dt;
        e.vx = e.facing.x * e.speed * 2.0;
        e.vy = e.facing.y * e.speed * 2.0;
        if (e.stateT <= 0) e.lungeT = 1.0;
      } else if (d < 46 && e.lungeT <= 0) {
        e.stateT = 0.35;
        audio.swing();
      } else if (d > stopD + 1) {
        physics.followPath(e, player.x, player.y, e.speed, dt, map);
      }
    } else {
      e.vx = Math.sin(e.t * 0.9 + e.seed) * e.speed * 0.35;
      e.vy = Math.cos(e.t * 0.7 + e.seed) * e.speed * 0.35;
      if (e.vx !== 0 || e.vy !== 0) {
        const m2 = Math.hypot(e.vx, e.vy);
        e.facing = { x: e.vx / m2, y: e.vy / m2 };
      }
    }
  }
}

// ============================================================
//  Raven — орбитальное поведение + dive
// ============================================================

export class RavenBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    const d = Math.hypot(player.x - e.x, player.y - e.y);

    if (e.aggro) {
      if (e.state !== "dive") {
        e.stateT -= dt;
        const orbit = 34 + Math.sin(e.t * 2 + e.seed) * 8;
        const tang = Math.atan2(player.y - e.y, player.x - e.x) + Math.PI / 2;
        const radial = d > orbit ? 1 : -0.6;
        e.vx = Math.cos(tang) * e.speed * 0.8 + ((player.x - e.x) / (d || 1)) * e.speed * 0.5 * radial;
        e.vy = Math.sin(tang) * e.speed * 0.8 + ((player.y - e.y) / (d || 1)) * e.speed * 0.5 * radial;
        if (d < 52 && e.stateT <= 0) {
          e.state = "dive";
          e.stateT = 0.55;
          e.facing = { x: (player.x - e.x) / d, y: (player.y - e.y) / d };
          audio.swing();
        }
      } else {
        e.stateT -= dt;
        e.vx = e.facing.x * e.speed * 2.2;
        e.vy = e.facing.y * e.speed * 2.2;
        if (e.stateT <= 0) { e.state = "hover"; e.stateT = 1.4; }
      }
    } else {
      e.vx = Math.sin(e.t * 1.2 + e.seed) * 30;
      e.vy = Math.cos(e.t * 0.9 + e.seed) * 24;
    }
    if (e.vx !== 0) e.facing = { x: e.vx >= 0 ? 1 : -1, y: 0 };
  }
}

// ============================================================
//  Shroom — projectile shooter
// ============================================================

export class ShroomBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const d2p = dist2(e.x, e.y, player.x, player.y);
    const sees = e.aggro && d2p < 105 * 105 && physics.hasLOS(e.x, e.y, player.x, player.y, map);

    if (sees) {
      e.facing = { x: Math.sign(player.x - e.x) || 1, y: 0 };
      if (d < 40) {
        e.vx = ((e.x - player.x) / d) * 40;
        e.vy = ((e.y - player.y) / d) * 40;
      }
      e.stateT -= dt;
      if (e.state === "cool") {
        if (e.stateT <= 0) { e.state = "charge"; e.stateT = 0.7; }
      } else if (e.state !== "charge") {
        e.state = "charge";
        e.stateT = 0.7;
      } else if (e.stateT <= 0) {
        e.state = "cool";
        e.stateT = 2.5;
        bus.emit("projectile:fire", { kind: "spore", x: e.x, y: e.y - 4, vx: ((player.x - e.x) / d) * 74, vy: ((player.y - e.y) / d) * 74, dmg: 1 });
        audio.splash();
      }
    } else {
      e.state = "idle";
    }
  }
}

// ============================================================
//  Crawler — stealth + chase
// ============================================================

export class CrawlerBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    const d2p = dist2(e.x, e.y, player.x, player.y);
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const stopD = e.r + player.r + 2;

    if (e.hidden) {
      if (d2p < 40 * 40) {
        e.hidden = false;
        audio.splash();
        e.aggro = true;
      }
      return;
    }
    if (e.aggro) {
      if (d > 1) e.facing = { x: (player.x - e.x) / d, y: (player.y - e.y) / d };
      if (d > stopD) { e.vx = e.facing.x * e.speed; e.vy = e.facing.y * e.speed; }
    }
  }
}

// ============================================================
//  Ghost — dissipate + shrine repulsion
// ============================================================

export class GhostBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const d2p = dist2(e.x, e.y, player.x, player.y);

    if (e.state === "dissipate") {
      e.fade = Math.max(0, (e.fade ?? 0.85) - dt / 2);
      e.vx = Math.sin(e.t * 1.3 + e.seed) * 12;
      e.vy = -14;
      if (e.fade <= 0) {
        if (e.dropDew) bus.emit("drop:spawn", { kind: "dew", x: e.x, y: e.y, life: 40 });
        e.dead = true;
      }
      return;
    }
    if ((e.fade ?? 0) < 0.85) e.fade = Math.min(0.85, (e.fade ?? 0) + dt / 1.5);
    if (inVillage) e.aggro = false;

    let repX = 0, repY = 0;
    for (const s of store.entities.shrines.all) {
      const sd2 = dist2(e.x, e.y, s.x, s.y);
      if (sd2 < 64 * 64) {
        e.aggro = false;
        const sd = Math.sqrt(sd2) || 1;
        repX = ((e.x - s.x) / sd) * 70;
        repY = ((e.y - s.y) / sd) * 70;
      }
    }
    if (repX || repY) { e.vx = repX; e.vy = repY; return; }

    if (e.leash && dist2(e.x, e.y, e.leash.x, e.leash.y) > 260 * 260) {
      e.aggro = false;
      const ld = Math.hypot(e.leash.x - e.x, e.leash.y - e.y) || 1;
      e.vx = ((e.leash.x - e.x) / ld) * e.speed;
      e.vy = ((e.leash.y - e.y) / ld) * e.speed;
      return;
    }

    if (e.aggro) {
      if (e.state === "dive") {
        e.stateT -= dt;
        e.vx = e.facing.x * e.speed * 2.4;
        e.vy = e.facing.y * e.speed * 2.4;
        if (e.stateT <= 0) {
          e.state = "hover";
          e.stateT = 1.5 + Math.random() * 1.0;
        }
      } else {
        e.stateT -= dt;
        const orbit = 30 + Math.sin(e.t * 2 + e.seed) * 8;
        const tang = Math.atan2(player.y - e.y, player.x - e.x) + Math.PI / 2;
        const radial = d > orbit ? 1 : -0.6;
        e.vx = Math.cos(tang) * e.speed * 0.9 + ((player.x - e.x) / (d || 1)) * e.speed * 0.6 * radial;
        e.vy = Math.sin(tang) * e.speed * 0.9 + ((player.y - e.y) / (d || 1)) * e.speed * 0.6 * radial;
        if (e.stateT <= 0) {
          e.state = "dive";
          e.stateT = 0.55;
          const dd = Math.hypot(player.x - e.x, player.y - e.y) || 1;
          e.facing = { x: (player.x - e.x) / dd, y: (player.y - e.y) / dd };
          audio.swing();
        }
      }
    } else {
      e.vx = Math.sin(e.t * 1.1 + e.seed) * 26;
      e.vy = Math.cos(e.t * 0.8 + e.seed) * 20 - 6;
    }
    if (e.vx !== 0) e.facing = { x: e.vx >= 0 ? 1 : -1, y: 0 };
  }
}
