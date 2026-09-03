/* ============ AISystem — использует BehaviorRegistry для обновления врагов ============ */

import { EventBus } from "../event-bus";
import { GameStore } from "../store";
import { Enemy } from "../entities";
import { WorldData, Vec, T, solidTileAt, zoneFor } from "../world";
import { audio } from "../audio";
import { IPhysics } from "./physics-system";
import { dist2 } from "../utils";
import { BehaviorRegistry } from "./enemy-behavior";
import {
  DraugrBehavior,
  FrostBehavior,
  VargBehavior,
  RavenBehavior,
  ShroomBehavior,
  CrawlerBehavior,
  GhostBehavior,
} from "./common-enemy-behaviors";
import {
  ReaperBehavior,
  SpiderBehavior,
  GiantBehavior,
  SnakeBehavior,
} from "./boss-enemy-behaviors";

export class AISystem {
  private store: GameStore;
  private bus: EventBus;
  private physics: IPhysics;
  private behaviorRegistry: BehaviorRegistry;

  constructor(bus: EventBus, store: GameStore, physics: IPhysics) {
    this.bus = bus;
    this.store = store;
    this.physics = physics;

    // Register all enemy behaviors
    this.behaviorRegistry = new BehaviorRegistry();
    this.behaviorRegistry.register("draugr", new DraugrBehavior());
    this.behaviorRegistry.register("frost", new FrostBehavior());
    this.behaviorRegistry.register("varg", new VargBehavior());
    this.behaviorRegistry.register("raven", new RavenBehavior());
    this.behaviorRegistry.register("shroom", new ShroomBehavior());
    this.behaviorRegistry.register("crawler", new CrawlerBehavior());
    this.behaviorRegistry.register("ghost", new GhostBehavior());
    this.behaviorRegistry.register("reaper", new ReaperBehavior());
    this.behaviorRegistry.register("spider", new SpiderBehavior());
    this.behaviorRegistry.register("giant", new GiantBehavior());
    this.behaviorRegistry.register("snake", new SnakeBehavior());
  }

  private get player() { return this.store.player; }
  private get map() { return this.store.map!; }
  private get enemies() { return this.store.entities.enemies; }
  private get shrines() { return this.store.entities.shrines; }
  private get services() { return this.store.services; }
  private get realT() { return this.store.realT; }
  private get bossRef() { return this.store.bossRef; }
  private set bossRef(v: Enemy | null) { this.store.bossRef = v; }

  updateEnemies(dt: number) {
    const p = this.player;
    const m = this.map;
    if (!m) return;

    const zone = zoneFor(m, Math.floor(p.x / T), Math.floor(p.y / T));
    const inVillage = zone === "Поселение выживших" || zone === "Воронья Гавань";

    for (const e of this.enemies.all) {
      if (e.dead) continue;

      // Common updates (applied to all enemies)
      e.t += dt;
      e.flashT = Math.max(0, e.flashT - dt);
      e.contactCd = Math.max(0, e.contactCd - dt);
      e.lungeT = Math.max(0, e.lungeT - dt);

      if (e.freezeT > 0) {
        e.freezeT -= dt;
        e.vx = 0;
        e.vy = 0;
        continue;
      }

      // Compute aggro-related values (common for non-boss enemies)
      const d2p = dist2(e.x, e.y, p.x, p.y);
      const isFlyer = e.kind === "raven" || e.kind === "ghost";
      const aggroR = e.kind === "raven" ? 150 : e.kind === "crawler" ? 42 : e.kind === "ghost" ? 160 : 100;
      const canSee = isFlyer || d2p > 300 * 300 ? isFlyer : this.physics.hasLOS(e.x, e.y, p.x, p.y, m);
      applyAggroRules(e, d2p, aggroR, canSee, inVillage);

      // Reset velocity
      e.vx = 0;
      e.vy = 0;

      // Delegate to behavior handler
      const behavior = this.behaviorRegistry.get(e.kind);
      if (behavior) {
        behavior.update(e, dt, p, m, this.physics, this.bus, this.store, inVillage, this.realT);
      }

      // Common contact damage (applied after behavior update)
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
}

// ============================================================
//  Export common utility for aggro rules (used in Engine.ts if needed)
// ============================================================

export function applyAggroRules(
  e: Enemy,
  d2p: number,
  aggroR: number,
  canSee: boolean,
  inVillage: boolean,
): void {
  if (inVillage && e.aggro) { e.aggro = false; e.path = null; }
  if (!e.aggro && !inVillage && d2p < aggroR * aggroR && canSee) e.aggro = true;
  if (e.aggro && !isFlyerImpl(e.kind) && (!canSee || d2p > 300 * 300)) { e.aggro = false; e.path = null; }
  if (e.aggro && isFlyerImpl(e.kind) && d2p > 300 * 300) e.aggro = false;
}

function isFlyerImpl(kind: string): boolean {
  return kind === "raven" || kind === "ghost";
}
