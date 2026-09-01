/* ============ CombatSystem ============ */
import { EventBus } from "../event-bus";
import { GameState, GameEvents } from "../game-states";
import { Enemy, Projectile, Player } from "../entities";
import { Graphics } from "pixi.js";
import { audio } from "../audio";
import { IPhysics } from "./physics-system";
import { dist2 } from "../utils";

export class CombatSystem {
  private state: GameState;
  private bus: EventBus;
  private physics: IPhysics;
  private axeProj: Projectile | null = null;
  private axeState: "ready" | "out" = "ready";
  private ghostClangT = 0;

  constructor(bus: EventBus, state: GameState, physics: IPhysics) {
    this.bus = bus;
    this.state = state;
    this.physics = physics;
    // Подписки на события от Engine и других систем
    bus.on("combat:trySword", () => this.trySword());
    bus.on("combat:tryAxe", () => this.tryAxe());
    bus.on("boss:start-dungeon", () => this.startDungeonBoss());
    bus.on("boss:killed", (e) => this.onDungeonBossDeath(e));
    bus.on("player:damaged", (e) => this.onPlayerDamaged(e));
    bus.on("projectile:fire", (e) => this.fireProjectile(e.kind, e.x, e.y, e.vx, e.vy, e.dmg));
  }

  trySword() {
    const p = this.state.player;
    const f = this.state.flags;
    if (!f.hasSword) { this.float(p, "Нужен клинок", 0x6e7f8d); return; }
    if (p.swingT > 0) return;
    p.swingT = f.furyRune ? 0.17 : 0.22;
    audio.swing();
    const a = Math.atan2(p.dir.y, p.dir.x);
    const dmg = f.swordUp ? 2 : 1;
    for (const e of this.state.enemies) {
      if (e.dead || e.hidden) continue;
      if (e.kind === "snake") {
        if (e.state === "open") {
          const ex = e.x + Math.sin(this.state.realT * 1.6) * 4, ey = e.y - 8;
          if (dist2(p.x + p.dir.x * 14, p.y + p.dir.y * 14, ex, ey) < 20 * 20) this.damageSnake(e);
        } else if (dist2(p.x, p.y, e.x, e.y) < (e.r + 18) * (e.r + 18)) {
          this.float(e, "Чешуя крепче камня", 0x6e7f8d);
          audio.clang();
        }
        continue;
      }
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > 24 + e.r) continue;
      const ea = Math.atan2(e.y - p.y, e.x - p.x);
      let da = Math.abs(ea - a);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > 1.2) continue;
      this.hitEnemy(e, dmg, p.x, p.y, false);
      if (f.hasHammer && !e.dead && e.freezeT <= 0) { e.freezeT = 0.8; }
    }
  }

  tryAxe() {
    const p = this.state.player;
    const f = this.state.flags;
    if (!f.hasAxe) { this.float(p, "Секира у Жнеца", 0x6e7f8d); return; }
    if (this.axeState !== "ready") { audio.locked(); return; }
    this.axeState = "out";
    const a = Math.atan2(p.dir.y, p.dir.x);
    const dmg = f.axeUp ? 2 : 1;
    const pr = this.fireProjectile("axe", p.x + Math.cos(a) * 8, p.y - 2 + Math.sin(a) * 8, Math.cos(a) * 200, Math.sin(a) * 200, dmg);
    this.axeProj = pr;
    audio.throwAxe();
  }

  fireProjectile(kind: any, x: number, y: number, vx: number, vy: number, dmg: number): Projectile {
    const pr: Projectile = { kind, x, y, vx, vy, r: kind === "fire" ? 5 : 4, dmg, life: kind === "axe" ? 6 : 2.2, dist: 0, returning: false, dead: false, spin: 0, g: new Graphics() };
    pr.g.position.set(x, y);
    this.state.projectiles.push(pr);
    this.state.onProjectileAdd(pr.g);
    return pr;
  }

  removeProjectile(i: number) {
    const pr = this.state.projectiles[i];
    pr.g.destroy();
    if (this.axeProj === pr) { this.axeProj = null; this.axeState = "ready"; }
    this.state.projectiles.splice(i, 1);
  }

  hitEnemy(e: Enemy, dmg: number, sx: number, sy: number, ignoreShield: boolean) {
    if (e.kind === "ghost" && !this.state.flags.ghostBane) {
      if (this.ghostClangT <= 0) {
        this.ghostClangT = 0.8;
        audio.clang();
        this.float(e, "Не пробивает", 0x8fd8e8);
      }
      return;
    }
    if (e.kind === "draugr" && !ignoreShield && e.freezeT <= 0) {
      const d = Math.hypot(e.x - sx, e.y - sy) || 1;
      const fromX = (sx - e.x) / d, fromY = (sy - e.y) / d;
      if (fromX * e.facing.x + fromY * e.facing.y > 0.35) {
        audio.clang();
        this.float(e, "Щит!", 0x8f9aa8);
        return;
      }
    }
    e.hp -= dmg;
    e.flashT = 0.12;
    audio.hit();
    this.float(e, String(dmg), 0xe8dcc0);
    const d = Math.hypot(e.x - sx, e.y - sy) || 1;
    this.physics.moveWithCollisions(e, ((e.x - sx) / d) * 5, ((e.y - sy) / d) * 5, this.state.map, this.state.doors, null);
    this.bus.emit("enemy:hit", { enemy: e, dmg, sx, sy });
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e: Enemy) {
    if (e.kind === "reaper" || e.kind === "spider" || e.kind === "giant") return;
    if (e.kind === "ghost") {
      this.bus.emit("drop:spawn", { kind: "dew", x: e.x, y: e.y, life: 40 });
      if (Math.random() < 0.35) this.bus.emit("drop:spawn", { kind: Math.random() < 0.5 ? "shard" : "heart", x: e.x, y: e.y });
      e.dead = true;
      return;
    }
    e.dead = true;
    e.path = null; e.pathI = 0;
    this.bus.emit("enemy:killed", { enemy: e, kind: e.kind, x: e.x, y: e.y });
  }

  damageSnake(e: Enemy) {
    e.hp -= 1;
    e.flashT = 0.15;
    audio.hit();
    this.float(e, "1", 0xe8c979);
    if (e.hp <= 0) this.bus.emit("snake:death", {});
  }

  damagePlayer(dmg: number, sx: number, sy: number, pierce = false) {
    const p = this.state.player;
    if (!pierce && p.hurtT > 0) return;
    if (pierce && p.hurtT > 0.6) return;
    p.hp -= dmg;
    p.hurtT = 1.05;
    audio.hurt();
    this.float(p, `-${dmg}`, 0xe06060);
    const d = Math.hypot(p.x - sx, p.y - sy) || 1;
    this.physics.moveWithCollisions(p, ((p.x - sx) / d) * 8, ((p.y - sy) / d) * 8, this.state.map, this.state.doors, null);
    this.bus.emit("player:damaged", { dmg, sx, sy });
    this.bus.emit("hud:dirty", {});
    if (p.hp <= 0) this.bus.emit("player:died", {});
  }

  /** Эмитит событие урона игрока (для вызова из других систем через EventBus). */
  onPlayerDamaged(payload: { dmg: number; sx: number; sy: number }) {
    this.damagePlayer(payload.dmg, payload.sx, payload.sy);
  }

  updateProjectiles(dt: number) {
    const p = this.state.player;
    const m = this.state.map;
    for (let i = this.state.projectiles.length - 1; i >= 0; i--) {
      const pr = this.state.projectiles[i];
      pr.life -= dt;
      if (pr.life <= 0) { this.removeProjectile(i); continue; }
      pr.spin += dt * 18;
      if (pr.kind === "axe") {
        if (!pr.returning) {
          pr.dist += Math.hypot(pr.vx, pr.vy) * dt;
          if (pr.dist > 130 || this.physics.pointSolid(pr.x + pr.vx * dt, pr.y + pr.vy * dt, m, this.state.doors, null)) pr.returning = true;
        }
        if (pr.returning) {
          const dx = p.x - pr.x, dy = p.y - 2 - pr.y;
          const d = Math.hypot(dx, dy) || 1;
          pr.vx = (dx / d) * 240; pr.vy = (dy / d) * 240;
          if (d < 12) {
            this.axeState = "ready"; this.axeProj = null;
            audio.pickup();
            this.removeProjectile(i);
            continue;
          }
        }
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.g.position.set(pr.x, pr.y);
      if (pr.kind !== "axe" && pr.kind !== "spore" && this.physics.pointSolid(pr.x, pr.y, m, this.state.doors, null)) {
        this.removeProjectile(i);
        continue;
      }
      if (pr.kind === "arrow" || pr.kind === "axe") {
        let consumed = false;
        for (const e of this.state.enemies) {
          if (e.dead || e.hidden) continue;
          if (e.kind === "ghost" && !this.state.flags.ghostBane) {
            if (this.ghostClangT <= 0) {
              this.ghostClangT = 0.8; audio.clang();
              this.float(e, "Не пробивает", 0x8fd8e8);
            }
            consumed = true; break;
          }
          if (e.kind === "snake") {
            if (e.state === "open") {
              const ex = e.x + Math.sin(this.state.realT * 1.6) * 4, ey = e.y - 8;
              if (dist2(pr.x, pr.y, ex, ey) < 11 * 11) { this.damageSnake(e); consumed = true; break; }
            } else if (dist2(pr.x, pr.y, e.x, e.y) < (e.r + 6) * (e.r + 6)) {
              audio.clang(); consumed = true; break;
            }
            continue;
          }
          const rr = pr.r + e.r;
          if (dist2(pr.x, pr.y, e.x, e.y) < rr * rr) {
            if (pr.kind === "axe") {
              e.freezeT = 2.6;
              audio.freeze();
              this.float(e, "Заморожен", 0x9fe0ee);
              if (e.kind === "raven" || e.kind === "crawler") this.hitEnemy(e, pr.dmg, pr.x, pr.y, true);
            } else {
              this.hitEnemy(e, pr.dmg, pr.x, pr.y, true);
            }
            consumed = true;
            break;
          }
        }
        if (consumed) {
          if (pr.kind === "axe") pr.returning = true;
          else this.removeProjectile(i);
          continue;
        }
      } else {
        const rr = pr.r + p.r;
        if (p.hurtT <= 0 && dist2(pr.x, pr.y, p.x, p.y) < rr * rr) {
          this.damagePlayer(pr.dmg, pr.x, pr.y);
          this.removeProjectile(i);
          continue;
        }
      }
    }
  }

  /* Боссы */
  onDungeonBossDeath(payload: { id: number }) {
    const m = this.state.map;
    const f = this.state.flags;
    if (m.dungeonId === 0) f.reaperDead = true;
    else if (m.dungeonId === 1) f.spiderDead = true;
    else f.giantDead = true;
    const boss = this.state.bossRef;
    this.state.bossRef = null;
    audio.bossDie();
    const reward = m.bossReward;
    if (reward && boss) this.bus.emit("drop:spawn", { kind: reward, x: boss.x, y: boss.y });
    const msg: Record<string, string> = {
      axe: "Жнец пал. Ледяная Секира твоя — метай её на [J]",
      bow: "Корень иссох. Лук Сумерек твой — целься на [L]",
      hammer: "Великан рассыпался. Рунический Молот твой — меч оглушает",
    };
    this.bus.emit("toast", { msg: msg[reward ?? "axe"] });
  }

  onSnakeDeath() {
    this.state.flags.snakeDead = true;
    this.state.bossRef = null;
    audio.bossDie();
    this.bus.emit("toast", { msg: "МИРАЖ ЁРМУНГАНДА повержен!" });
    this.bus.emit("snake:death", {});
    this.bus.emit("hud:dirty", {});
  }

  startDungeonBoss() {
    const m = this.state.map;
    const f = this.state.flags;
    const kind = m.bossReward === "axe" ? "reaper" : m.bossReward === "bow" ? "spider" : "giant";
    const e = this.state.spawnEnemy(kind, m.bossSpot.x, m.bossSpot.y);
    e.state = "enter"; e.stateT = 1.0;
    if (m.dungeonId === 0) e.seed = 1;
    this.state.bossRef = e;
    audio.horn();
    this.bus.emit("toast", { msg: `${m.dungeonName}: страж пробудился` });
    this.bus.emit("boss:spawned", { kind: kind as any, id: m.dungeonId });
  }

  startSnakeBattle() {
    const f = this.state.flags;
    if (f.snakeStarted) return;
    f.snakeStarted = true;
    const m = this.state.map;
    const e = this.state.spawnEnemy("snake", m.snakeSpot.x, m.snakeSpot.y - 10);
    e.state = "closed"; e.stateT = 2.4; e.seed = 0.9;
    this.state.bossRef = e;
    audio.horn();
    this.bus.emit("toast", { msg: "МИРАЖ ЁРМУНГАНДА" });
    this.bus.emit("boss:spawned", { kind: "snake" as any, id: -1 });
  }

  private float(entity: { x: number; y: number }, text: string, color: number) {
    // Просто эмитим тост — всплывающий текст обрабатывается в Engine
    this.bus.emit("hud:float", { x: entity.x, y: entity.y, text, color });
  }
}


