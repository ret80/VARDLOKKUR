/* ============ EntityManager ============ */
import { Graphics, Sprite } from "pixi.js";
import type { Body } from "planck-js";
import { Vec2 } from "planck-js";
import { EventBus } from "../event-bus";
import { WorldData, Vec, T, solidTileAt, DUNGEONS } from "../world";
import { dist2, clamp } from "../utils";
import { Player, Enemy, Projectile, makeEnemy } from "../entities";
import { PlanckWorld, Cat } from "./planck-world";
import type { ProjectileRt, DropRt, ChestRt, PedestalRt, ShrineRt, NpcRt, DoorRt } from "../store";
import {
  HouseSpriteEntry, WallTextureCache, HouseTextureCache,
} from "../tiles";
import { buildMinimapBase } from "../map-display";
import { type GraphicsFactory, DefaultGraphicsFactory } from "./render-system";

/** Интерфейс для сервисов, которые требует EntityManager (инверсия зависимостей). */
export interface EntityManagerServices {
  loadMap: (map: WorldData, spawn: Vec) => void;
  toast: (msg: string) => void;
}

export interface EntityManagerEntities {
  enemies: (Enemy & { g: Graphics })[];
  projectiles: ProjectileRt[];
  drops: DropRt[];
  chests: ChestRt[];
  pedestals: PedestalRt[];
  shrines: ShrineRt[];
  npcs: NpcRt[];
  doors: DoorRt[];
}

export interface EntityManagerDynamicContainer {
  addChild(child: Graphics | Sprite): void;
  removeChildren(): void;
}

export interface EntityManagerFlags {
  secretKnown: boolean;
  shrineIdx: number;
  runes: number;
  snakeStarted: boolean;
}

export class EntityManager {
  private planck: PlanckWorld;
  private bus: EventBus;
  private services: EntityManagerServices;
  private gfxFactory: GraphicsFactory;
  public entities: EntityManagerEntities;
  public dynamic: EntityManagerDynamicContainer;

  // Локальные данные сущностей
  public wallTiles: (Graphics | Sprite)[] = [];
  public groundSpr: Sprite | null = null;
  public slamZones: { x: number; y: number; r: number; t: number; boom: boolean }[] = [];
  public barrier: { x: number; y: number; active: boolean; g: Graphics } | null = null;
  public altar: { x: number; y: number; g: Graphics } | null = null;
  public roofSnow = true;

  constructor(bus: EventBus, services: EntityManagerServices, entities: EntityManagerEntities, dynamic: EntityManagerDynamicContainer, gfxFactory: GraphicsFactory = DefaultGraphicsFactory) {
    this.bus = bus;
    this.services = services;
    this.entities = entities;
    this.dynamic = dynamic;
    this.gfxFactory = gfxFactory;
    this.planck = new PlanckWorld();
  }

  /* ===== Свойства ===== */

  get planckWorld(): PlanckWorld { return this.planck; }

  /* ===== Управление текстурами карты ===== */

  buildMapTextures(map: WorldData, wallCache: WallTextureCache, houseCache: HouseTextureCache, groundSprites: (Graphics | Sprite)[], houseSprites: HouseSpriteEntry[], groundSpr: Sprite): void {
    this.groundSpr?.destroy();
    for (const wt of this.wallTiles) wt.destroy();
    this.wallTiles = [];
    this.groundSpr = groundSpr;
    this.groundSpr.zIndex = 0;
    this.dynamic.addChild(this.groundSpr);
    for (const ws of groundSprites) {
      this.wallTiles.push(ws);
      this.dynamic.addChild(ws);
    }
  }

  buildMinimapBase(map: WorldData): ImageData | null {
    return buildMinimapBase(map);
  }

  /* ===== Очистка сущностей ===== */

  clearEntities(): void {
    for (const e of this.entities.enemies) {
      const enemy = e as Enemy & { g: Graphics };
      enemy.g.destroy();
      if ((enemy as any).body) this.farBody((enemy as any).body);
    }
    for (const p of this.entities.projectiles) p.g.destroy();
    for (const d of this.entities.drops) d.g.destroy();
    for (const c of this.entities.chests) c.g.destroy();
    for (const p of this.entities.pedestals) p.g.destroy();
    for (const s of this.entities.shrines) s.g.destroy();
    for (const n of this.entities.npcs) n.g.destroy();
    for (const d of this.entities.doors) d.g.destroy();
    for (const f of this.slamZones) { /* no graphics */ }
    this.barrier?.g.destroy();
    this.altar?.g.destroy();
    this.entities.enemies.length = 0;
    this.entities.projectiles.length = 0;
    this.entities.drops.length = 0;
    this.entities.chests.length = 0;
    this.entities.pedestals.length = 0;
    this.entities.shrines.length = 0;
    this.entities.npcs.length = 0;
    this.entities.doors.length = 0;
    this.slamZones.length = 0;
    this.barrier = null;
    this.altar = null;
  }

  /* ===== Физические тела (Planck.js) ===== */

  makeBody(r: number, position: Vec, category: number, userData: any = {}): Body {
    const body = this.planck.createEntityBody(position.x, position.y, r, category, userData);
    const key = `${position.x}_${position.y}_${Date.now()}_${Math.random()}`;
    this.planck.registerBody(key, body);
    return body;
  }

  farBody(body: Body | null): void {
    if (!body) return;
    body.setPosition(Vec2(-9999, -9999));
    body.setLinearVelocity(Vec2(0, 0));
  }

  /* ===== Спавн врагов ===== */

  spawnEnemy(kind: Enemy["kind"], x: number, y: number): Enemy & { g: Graphics } {
    const e = makeEnemy(kind, x, y, this.entities.enemies.length);
    const g = this.gfxFactory.createGraphics();
    g.position.set(x, y);
    (e as Enemy & { g: Graphics }).g = g;
    this.entities.enemies.push(e as Enemy & { g: Graphics });
    this.dynamic.addChild(g);

    const isBoss = kind === "reaper" || kind === "giant";
    if (kind === "ghost") {
      const body = this.planck.createGhostBody(x, y, e.r);
      (e as any).body = body;
    } else if (isBoss) {
      const body = this.makeBody(e.r, { x, y }, Cat.Boss, { kind, dead: false });
      (e as any).body = body;
    } else {
      const body = this.makeBody(e.r, { x, y }, Cat.Enemy, { kind, dead: false });
      if (kind === "raven" || kind === "snake" || kind === "spider") {
        this.farBody(body);
      }
      (e as any).body = body;
    }
    return e as Enemy & { g: Graphics };
  }

  /* ===== Безопасность спавна ===== */

  ensureSpawnSafety(map: WorldData, spawn: Vec): void {
    const safeR = map.isDungeon ? 170 : 300;
    for (const e of this.entities.enemies) {
      const enemy = e as Enemy & { g: Graphics };
      const r = map.isDungeon ? 170 : enemy.kind === "crawler" ? 250 : safeR;
      if (dist2(enemy.x, enemy.y, spawn.x, spawn.y) < r * r && !enemy.hidden) {
        let moved = false;
        for (let tries = 0; tries < 26; tries++) {
          const a = Math.random() * Math.PI * 2;
          const d = map.isDungeon ? 200 + Math.random() * 120 : 340 + Math.random() * 220;
          const nx = spawn.x + Math.cos(a) * d;
          const ny = spawn.y + Math.sin(a) * d;
          const tx = Math.floor(nx / T);
          const ty = Math.floor(ny / T);
          if (tx > 1 && ty > 1 && tx < map.W - 2 && ty < map.H - 2 && !solidTileAt(map, tx, ty)) {
            enemy.x = nx;
            enemy.y = ny;
            enemy.g.position.set(nx, ny);
            if ((enemy as any).body) {
              (enemy as any).body.setPosition(Vec2(nx, ny));
            }
            moved = true;
            break;
          }
        }
        if (!moved) enemy.dead = true;
      }
    }
  }

  /* ===== Очистка ===== */

  destroy(): void {
    if (this.groundSpr) this.groundSpr.destroy();
    for (const wt of this.wallTiles) wt.destroy();
    for (const e of this.entities.enemies) {
      (e as Enemy & { g: Graphics }).g.destroy();
    }
    for (const p of this.entities.projectiles) p.g.destroy();
    for (const d of this.entities.drops) d.g.destroy();
    for (const c of this.entities.chests) c.g.destroy();
    for (const p of this.entities.pedestals) p.g.destroy();
    for (const s of this.entities.shrines) s.g.destroy();
    for (const n of this.entities.npcs) n.g.destroy();
    for (const d of this.entities.doors) d.g.destroy();
    this.barrier?.g.destroy();
    this.altar?.g.destroy();
  }
}
