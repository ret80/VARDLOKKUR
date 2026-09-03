/* BossEnemyBehaviors — handler'ы для боссов */

import { EventBus } from "../event-bus";
import { GameStore } from "../store";
import { Enemy } from "../entities";
import { WorldData, Vec } from "../world";
import { IPhysics } from "./physics-system";
import { dist2 } from "../utils";
import { audio } from "../audio";
import { EnemyBehavior } from "./enemy-behavior";

// ============================================================
//  Reaper — boss with wind/swing/stuck phases
// ============================================================

export class ReaperBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    e.stateT -= dt;
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const phase2 = e.hp <= e.maxHp / 2;
    const spd = phase2 ? 72 : e.speed;

    if (d > 1) e.facing = { x: (player.x - e.x) / d, y: (player.y - e.y) / d };

    switch (e.state) {
      case "enter":
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = phase2 ? 1.4 : 2.2; }
        break;
      case "chase":
        if (d > e.r + player.r + 4) { e.vx = e.facing.x * spd; e.vy = e.facing.y * spd; }
        else { e.vx = 0; e.vy = 0; }
        if (e.stateT <= 0 || d < 30) {
          e.state = "wind";
          e.stateT = phase2 ? 0.42 : 0.6;
          e.vx = e.vy = 0;
          audio.swing();
        }
        break;
      case "wind":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) { e.state = "swing"; e.stateT = 0.26; audio.swing(); }
        break;
      case "swing":
        e.vx = e.vy = 0;
        if (e.contactCd <= 0 && d < 40) {
          bus.emit("player:damaged", { dmg: 2, sx: e.x, sy: e.y });
          e.contactCd = 0.6;
        }
        if (e.stateT <= 0) {
          e.state = "stuck";
          e.stateT = phase2 ? 1.25 : 1.8;
        }
        break;
      case "stuck":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = phase2 ? 1.4 : 2.2; }
        break;
    }

    if (e.contactCd <= 0 && d < e.r + player.r + 4) {
      bus.emit("player:damaged", { dmg: 1, sx: e.x, sy: e.y });
      e.contactCd = 1.1;
    }
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      store.bossRef = e;
      bus.emit("boss:killed", { kind: e.kind as any, id: map.dungeonId });
    }
  }
}

// ============================================================
//  Spider — projectile spinner with crawler spawns
// ============================================================

export class SpiderBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    e.stateT -= dt;
    e.vx = 0;
    e.vy = 0;
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    if (d > 1) e.facing = { x: (player.x - e.x) / d, y: (player.y - e.y) / d };

    if (e.state === "enter" && e.stateT <= 0) {
      e.state = "aim";
      e.stateT = 1.2;
    } else if (e.state === "aim" && e.stateT <= 0) {
      const base = Math.atan2(player.y - e.y, player.x - e.x);
      for (let i = -1; i <= 1; i++) {
        const a = base + i * 0.25;
        bus.emit("projectile:fire", { kind: "spore", x: e.x, y: e.y - 6, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, dmg: 1 });
      }
      audio.splash();
      e.state = "ring";
      e.stateT = 1.8;
    } else if (e.state === "ring" && e.stateT <= 0) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        bus.emit("projectile:fire", { kind: "spore", x: e.x, y: e.y - 6, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, dmg: 1 });
      }
      audio.splash();
      e.state = "aim";
      e.stateT = 1.4;
    }

    if (Math.random() < dt * 0.12 && store.entities.enemies.all.filter((x) => !x.dead && x.kind === "crawler").length < 2) {
      const a = Math.random() * Math.PI * 2;
      store.services.spawnEnemy("crawler", e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26);
    }

    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      bus.emit("boss:killed", { kind: e.kind as any, id: map.dungeonId });
    }
  }
}

// ============================================================
//  Giant — boss with wind/swing/stuck phases (similar to reaper)
// ============================================================

export class GiantBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    e.stateT -= dt;
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const phase2 = e.hp <= e.maxHp / 2;
    const spd = phase2 ? 58 : e.speed;

    if (d > 1) e.facing = { x: (player.x - e.x) / d, y: (player.y - e.y) / d };

    switch (e.state) {
      case "enter":
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = 2.0; }
        break;
      case "chase":
        if (d > e.r + player.r + 4) { e.vx = e.facing.x * spd; e.vy = e.facing.y * spd; }
        else { e.vx = 0; e.vy = 0; }
        if (e.stateT <= 0 || d < 34) {
          e.state = "wind";
          e.stateT = phase2 ? 0.4 : 0.62;
          e.vx = e.vy = 0;
          audio.swing();
        }
        break;
      case "wind":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) {
          e.state = "swing";
          e.stateT = 0.3;
          audio.hit();
        }
        break;
      case "swing":
        e.vx = e.vy = 0;
        if (e.contactCd <= 0 && d < 46) {
          bus.emit("player:damaged", { dmg: 2, sx: e.x, sy: e.y });
          e.contactCd = 0.7;
        }
        if (e.stateT <= 0) {
          e.state = "stuck";
          e.stateT = phase2 ? 1.1 : 1.7;
        }
        break;
      case "stuck":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = 2.0; }
        break;
    }

    if (e.contactCd <= 0 && d < e.r + player.r + 4) {
      bus.emit("player:damaged", { dmg: 2, sx: e.x, sy: e.y });
      e.contactCd = 1.1;
    }
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      store.bossRef = e;
      bus.emit("boss:killed", { kind: e.kind as any, id: map.dungeonId });
    }
  }
}

// ============================================================
//  Snake — timed projectile shooter
// ============================================================

export class SnakeBehavior implements EnemyBehavior {
  update(e: Enemy, dt: number, player: { x: number; y: number; r: number }, map: WorldData, physics: IPhysics, bus: EventBus, store: GameStore, inVillage: boolean, realT: number): void {
    e.stateT -= dt;
    e.vx = 0;
    e.vy = 0;

    const mouthX = e.x + Math.sin(realT * 1.6) * 4;
    const mouthY = e.y - 2;

    if (e.state === "closed") {
      if (e.stateT <= 1.5 && e.seed > 0.5) {
        e.seed = 0.2;
        const base = Math.atan2(player.y - mouthY, player.x - mouthX);
        for (let i = -1; i <= 1; i++) {
          const a = base + i * 0.3;
          bus.emit("projectile:fire", { kind: "fire", x: mouthX, y: mouthY, vx: Math.cos(a) * 84, vy: Math.sin(a) * 84, dmg: 1 });
        }
        audio.splash();
      }
      if (e.stateT <= 0.7 && e.seed < 0.5) {
        e.seed = -1;
        audio.locked();
      }
      if (e.stateT <= 0) { e.state = "open"; e.stateT = 3.0; audio.chime(); }
    } else if (e.state === "open") {
      if (e.stateT <= 0) { e.state = "closed"; e.stateT = 3.8; e.seed = 1; }
    }
  }
}
