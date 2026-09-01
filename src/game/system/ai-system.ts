/* ============ AISystem ============ */
import { EventBus } from "../event-bus";
import { GameState, GameEvents } from "../game-states";
import { Enemy } from "../entities";
import { WorldData, Vec, T, solidTileAt, zoneFor } from "../world";
import { audio } from "../audio";
import { IPhysics } from "./physics-system";
import { dist2 } from "../utils";

export class AISystem {
  private state: GameState;
  private bus: EventBus;
  private physics: IPhysics;

  constructor(bus: EventBus, state: GameState, physics: IPhysics) {
    this.bus = bus;
    this.state = state;
    this.physics = physics;
  }

  updateEnemies(dt: number) {
    const p = this.state.player;
    const m = this.state.map;
    const inVillage = zoneFor(m, Math.floor(p.x / T), Math.floor(p.y / T)) === "Поселение выживших" ||
      zoneFor(m, Math.floor(p.x / T), Math.floor(p.y / T)) === "Воронья Гавань";

    for (const e of this.state.enemies) {
      if (e.dead) continue;
      e.t += dt;
      e.flashT = Math.max(0, e.flashT - dt);
      e.contactCd = Math.max(0, e.contactCd - dt);
      e.lungeT = Math.max(0, e.lungeT - dt);

      if (e.freezeT > 0) {
        e.freezeT -= dt;
        e.vx = 0; e.vy = 0;
        continue;
      }
      if (e.kind === "reaper") { this.updateReaper(e, dt); continue; }
      if (e.kind === "spider") { this.updateSpider(e, dt); continue; }
      if (e.kind === "giant") { this.updateGiant(e, dt); continue; }
      if (e.kind === "snake") { this.updateSnake(e, dt); continue; }

      const d2p = dist2(e.x, e.y, p.x, p.y);
      const aggroR = e.kind === "raven" ? 150 : e.kind === "crawler" ? 42 : e.kind === "ghost" ? 160 : 100;
      const isFlyer = e.kind === "raven" || e.kind === "ghost";
      const canSee = isFlyer || d2p > 300 * 300 ? isFlyer : this.physics.hasLOS(e.x, e.y, p.x, p.y, m);
      if (inVillage && e.aggro) { e.aggro = false; e.path = null; }
      if (!e.aggro && !inVillage && d2p < aggroR * aggroR && canSee) e.aggro = true;
      if (e.aggro && !isFlyer && (!canSee || d2p > 300 * 300)) { e.aggro = false; e.path = null; }
      if (e.aggro && isFlyer && d2p > 300 * 300) e.aggro = false;

      e.vx = 0; e.vy = 0;
      const d = Math.sqrt(d2p);
      const stopD = e.r + p.r + 2;

      switch (e.kind) {
        case "draugr":
        case "frost": {
          if (e.aggro) {
            if (d > stopD + 1) this.physics.followPath(e, p.x, p.y, e.speed, dt, m);
            if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
          } else if (Math.floor(e.t) % 4 === 0) {
            e.vx = Math.sin(e.t * 0.7 + e.seed) * e.speed * 0.3;
          }
          break;
        }
        case "varg": {
          if (e.aggro) {
            if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
            if (e.stateT > 0) {
              e.stateT -= dt;
              e.vx = e.facing.x * e.speed * 2.0;
              e.vy = e.facing.y * e.speed * 2.0;
              if (e.stateT <= 0) e.lungeT = 1.0;
            } else if (d < 46 && e.lungeT <= 0) {
              e.stateT = 0.35; audio.swing();
            } else if (d > stopD + 1) {
              this.physics.followPath(e, p.x, p.y, e.speed, dt, m);
            }
          } else {
            e.vx = Math.sin(e.t * 0.9 + e.seed) * e.speed * 0.35;
            e.vy = Math.cos(e.t * 0.7 + e.seed) * e.speed * 0.35;
            if (e.vx !== 0 || e.vy !== 0) { const m2 = Math.hypot(e.vx, e.vy); e.facing = { x: e.vx / m2, y: e.vy / m2 }; }
          }
          break;
        }
        case "raven": {
          if (e.aggro) {
            if (e.state !== "dive") {
              e.stateT -= dt;
              const orbit = 34 + Math.sin(e.t * 2 + e.seed) * 8;
              const tang = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2;
              const radial = d > orbit ? 1 : -0.6;
              e.vx = Math.cos(tang) * e.speed * 0.8 + ((p.x - e.x) / (d || 1)) * e.speed * 0.5 * radial;
              e.vy = Math.sin(tang) * e.speed * 0.8 + ((p.y - e.y) / (d || 1)) * e.speed * 0.5 * radial;
              if (d < 52 && e.stateT <= 0) { e.state = "dive"; e.stateT = 0.55; e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d }; audio.swing(); }
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
          break;
        }
        case "shroom": {
          const sees = e.aggro && d2p < 105 * 105 && this.physics.hasLOS(e.x, e.y, p.x, p.y, m);
          if (sees) {
            e.facing = { x: Math.sign(p.x - e.x) || 1, y: 0 };
            if (d < 40) {
              e.vx = ((e.x - p.x) / d) * 40;
              e.vy = ((e.y - p.y) / d) * 40;
            }
            e.stateT -= dt;
            if (e.state === "cool") {
              if (e.stateT <= 0) { e.state = "charge"; e.stateT = 0.7; }
            } else if (e.state !== "charge") {
              e.state = "charge"; e.stateT = 0.7;
            } else if (e.stateT <= 0) {
              e.state = "cool"; e.stateT = 2.5;
              this.bus.emit("projectile:fire", { kind: "spore", x: e.x, y: e.y - 4, vx: ((p.x - e.x) / d) * 74, vy: ((p.y - e.y) / d) * 74, dmg: 1 });
              audio.splash();
            }
          } else { e.state = "idle"; }
          break;
        }
        case "crawler": {
          if (e.hidden) {
            if (d2p < 40 * 40) {
              e.hidden = false;
              audio.splash();
              e.aggro = true;
            }
            break;
          }
          if (e.aggro) {
            if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
            if (d > stopD) { e.vx = e.facing.x * e.speed; e.vy = e.facing.y * e.speed; }
          }
          break;
        }
        case "ghost": {
          this.updateGhost(e, dt, d, inVillage);
          break;
        }
      }

      if (e.aggro && !e.hidden && e.contactCd <= 0) {
        const rr = e.r + p.r + 5;
        if (d2p < rr * rr) {
          this.bus.emit("player:damaged", { dmg: e.dmg, sx: e.x, sy: e.y });
          if (e.kind === "frost") p.slowT = 1.6;
          if (e.kind === "ghost") p.slowT = 0.8;
          e.contactCd = 1.1;
        }
      }
    }
  }

  private updateGhost(e: Enemy, dt: number, d: number, inVillage: boolean) {
    const p = this.state.player;
    if (e.state === "dissipate") {
      e.fade = Math.max(0, (e.fade ?? 0.85) - dt / 2);
      e.vx = Math.sin(e.t * 1.3 + e.seed) * 12; e.vy = -14;
      if (e.fade <= 0) {
        if (e.dropDew) this.bus.emit("drop:spawn", { kind: "dew", x: e.x, y: e.y, life: 40 });
        e.dead = true;
      }
      return;
    }
    if ((e.fade ?? 0) < 0.85) e.fade = Math.min(0.85, (e.fade ?? 0) + dt / 1.5);
    if (inVillage) e.aggro = false;
    let repX = 0, repY = 0;
    for (const s of this.state.shrines) {
      const sd2 = dist2(e.x, e.y, s.x, s.y);
      if (sd2 < 64 * 64) {
        e.aggro = false;
        const sd = Math.sqrt(sd2) || 1;
        repX = ((e.x - s.x) / sd) * 70; repY = ((e.y - s.y) / sd) * 70;
      }
    }
    if (repX || repY) { e.vx = repX; e.vy = repY; return; }
    if (e.leash && dist2(e.x, e.y, e.leash.x, e.leash.y) > 260 * 260) {
      e.aggro = false;
      const ld = Math.hypot(e.leash.x - e.x, e.leash.y - e.y) || 1;
      e.vx = ((e.leash.x - e.x) / ld) * e.speed; e.vy = ((e.leash.y - e.y) / ld) * e.speed;
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
        const tang = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2;
        const radial = d > orbit ? 1 : -0.6;
        e.vx = Math.cos(tang) * e.speed * 0.9 + ((p.x - e.x) / (d || 1)) * e.speed * 0.6 * radial;
        e.vy = Math.sin(tang) * e.speed * 0.9 + ((p.y - e.y) / (d || 1)) * e.speed * 0.6 * radial;
        if (e.stateT <= 0) {
          e.state = "dive";
          e.stateT = 0.55;
          const dd = Math.hypot(p.x - e.x, p.y - e.y) || 1;
          e.facing = { x: (p.x - e.x) / dd, y: (p.y - e.y) / dd };
          audio.swing();
        }
      }
    } else {
      e.vx = Math.sin(e.t * 1.1 + e.seed) * 26;
      e.vy = Math.cos(e.t * 0.8 + e.seed) * 20 - 6;
    }
    if (e.vx !== 0) e.facing = { x: e.vx >= 0 ? 1 : -1, y: 0 };
  }

  private updateReaper(e: Enemy, dt: number) {
    const p = this.state.player;
    e.stateT -= dt;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    const phase2 = e.hp <= e.maxHp / 2;
    const spd = phase2 ? 72 : e.speed;
    if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
    switch (e.state) {
      case "enter":
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = phase2 ? 1.4 : 2.2; }
        break;
      case "chase":
        if (d > e.r + p.r + 4) { e.vx = e.facing.x * spd; e.vy = e.facing.y * spd; }
        else { e.vx = 0; e.vy = 0; }
        if (e.stateT <= 0 || d < 30) { e.state = "wind"; e.stateT = phase2 ? 0.42 : 0.6; e.vx = e.vy = 0; audio.swing(); }
        break;
      case "wind":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) { e.state = "swing"; e.stateT = 0.26; audio.swing(); }
        break;
      case "swing":
        e.vx = e.vy = 0;
        if (e.contactCd <= 0 && d < 40) { this.bus.emit("player:damaged", { dmg: 2, sx: e.x, sy: e.y }); e.contactCd = 0.6; }
        if (e.stateT <= 0) {
          e.state = "stuck"; e.stateT = phase2 ? 1.25 : 1.8;
        }
        break;
      case "stuck":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = phase2 ? 1.4 : 2.2; }
        break;
    }
    if (e.contactCd <= 0 && d < e.r + p.r + 4) { this.bus.emit("player:damaged", { dmg: 1, sx: e.x, sy: e.y }); e.contactCd = 1.1; }
    if (e.hp <= 0 && !e.dead) { e.dead = true; this.state.bossRef = e; this.bus.emit("boss:killed", { kind: "reaper" as any, id: this.state.map.dungeonId }); }
  }

  private updateSpider(e: Enemy, dt: number) {
    const p = this.state.player;
    e.stateT -= dt;
    e.vx = 0; e.vy = 0;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
    if (e.state === "enter" && e.stateT <= 0) { e.state = "aim"; e.stateT = 1.2; }
    else if (e.state === "aim" && e.stateT <= 0) {
      const base = Math.atan2(p.y - e.y, p.x - e.x);
      for (let i = -1; i <= 1; i++) {
        const a = base + i * 0.25;
        this.bus.emit("projectile:fire", { kind: "spore", x: e.x, y: e.y - 6, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, dmg: 1 });
      }
      audio.splash();
      e.state = "ring"; e.stateT = 1.8;
    } else if (e.state === "ring" && e.stateT <= 0) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.bus.emit("projectile:fire", { kind: "spore", x: e.x, y: e.y - 6, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, dmg: 1 });
      }
      audio.splash();
      e.state = "aim"; e.stateT = 1.4;
    }
    if (Math.random() < dt * 0.12 && this.state.enemies.filter((x) => !x.dead && x.kind === "crawler").length < 2) {
      const a = Math.random() * Math.PI * 2;
      this.state.spawnEnemy("crawler", e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26);
    }
    if (e.hp <= 0 && !e.dead) { e.dead = true; this.bus.emit("boss:killed", { kind: "spider" as any, id: this.state.map.dungeonId }); }
  }

  private updateGiant(e: Enemy, dt: number) {
    const p = this.state.player;
    e.stateT -= dt;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    const phase2 = e.hp <= e.maxHp / 2;
    const spd = phase2 ? 58 : e.speed;
    if (d > 1) e.facing = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
    switch (e.state) {
      case "enter":
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = 2.0; }
        break;
      case "chase":
        if (d > e.r + p.r + 4) { e.vx = e.facing.x * spd; e.vy = e.facing.y * spd; }
        else { e.vx = 0; e.vy = 0; }
        if (e.stateT <= 0 || d < 34) { e.state = "wind"; e.stateT = phase2 ? 0.4 : 0.62; e.vx = e.vy = 0; audio.swing(); }
        break;
      case "wind":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) {
          e.state = "swing"; e.stateT = 0.3;
          audio.hit();
        }
        break;
      case "swing":
        e.vx = e.vy = 0;
        if (e.contactCd <= 0 && d < 46) { this.bus.emit("player:damaged", { dmg: 2, sx: e.x, sy: e.y }); e.contactCd = 0.7; }
        if (e.stateT <= 0) { e.state = "stuck"; e.stateT = phase2 ? 1.1 : 1.7; }
        break;
      case "stuck":
        e.vx = e.vy = 0;
        if (e.stateT <= 0) { e.state = "chase"; e.stateT = 2.0; }
        break;
    }
    if (e.contactCd <= 0 && d < e.r + p.r + 4) { this.bus.emit("player:damaged", { dmg: 2, sx: e.x, sy: e.y }); e.contactCd = 1.1; }
    if (e.hp <= 0 && !e.dead) { e.dead = true; this.state.bossRef = e; this.bus.emit("boss:killed", { kind: "giant" as any, id: this.state.map.dungeonId }); }
  }

  private updateSnake(e: Enemy, dt: number) {
    const p = this.state.player;
    e.stateT -= dt;
    e.vx = 0; e.vy = 0;
    const mouthX = e.x + Math.sin(this.state.realT * 1.6) * 4;
    const mouthY = e.y - 2;
    if (e.state === "closed") {
      if (e.stateT <= 1.5 && e.seed > 0.5) {
        e.seed = 0.2;
        const base = Math.atan2(p.y - mouthY, p.x - mouthX);
        for (let i = -1; i <= 1; i++) {
          const a = base + i * 0.3;
          this.bus.emit("projectile:fire", { kind: "fire", x: mouthX, y: mouthY, vx: Math.cos(a) * 84, vy: Math.sin(a) * 84, dmg: 1 });
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


