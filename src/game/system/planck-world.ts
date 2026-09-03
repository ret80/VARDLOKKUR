/* ============ PlanckWorld ============
 * Обёртка над Planck.js World с поддержкой категорий и масок. */

import { Vec2, World, Body, Fixture, CircleShape, PolygonShape, BoxShape, Body as BodyConst } from "planck-js";
import type { Contact, Manifold } from "planck-js";
import { WorldData, T, solidTileAt } from "../world";
import { dist2 } from "../utils";

// ============================================================
// Категории (битовые маски) — collision filtering
// ============================================================

export const Cat: Record<string, number> = {
  None:       0x0000,
  Player:     0x0001,
  Enemy:      0x0002,
  Ghost:      0x0010,
  Projectile: 0x0020,
  Tile:       0x0040,
  Door:       0x0080,
  Barrier:    0x0100,
  Drop:       0x0200,
  Boss:       0x0400,
};

// ============================================================
// Опции коллизий — что с чем коллидирует
// ============================================================

export const CollidesWith: Record<string, number> = {
  [Cat.Player]:     Cat.Tile | Cat.Enemy | Cat.Projectile | Cat.Door | Cat.Barrier | Cat.Drop | Cat.Ghost,
  [Cat.Enemy]:      Cat.Tile | Cat.Player | Cat.Projectile | Cat.Door | Cat.Barrier,
  [Cat.Ghost]:      Cat.Player, // призрак проходит сквозь всё, но коллидирует с игроком для урона
  [Cat.Projectile]: Cat.Tile | Cat.Enemy | Cat.Player,
  [Cat.Tile]:       Cat.Player | Cat.Enemy | Cat.Projectile | Cat.Drop,
  [Cat.Door]:       Cat.Player | Cat.Enemy,
  [Cat.Barrier]:    Cat.Player | Cat.Enemy,
  [Cat.Drop]:       Cat.Player,
  [Cat.Boss]:       Cat.Tile | Cat.Player | Cat.Projectile | Cat.Door | Cat.Barrier,
};

// ============================================================
// Настройка фильтра на fixture
// ============================================================

function applyFilter(fixture: Fixture, category: number): void {
  fixture.setFilterCategoryBits(category);
  const mask = CollidesWith[category] || Cat.None;
  fixture.setFilterMaskBits(mask);
  // НЕ устанавливаем группу — иначе коллизии между разными группами не будет
}

// ============================================================
// Интерфейс коллбэков
// ============================================================

export interface PhysicsCallbacks {
  onProjectileHitEnemy?: (projectileBody: Body, enemyBody: Body, projData: any, enemyData: any) => void;
  onProjectileHitPlayer?: (projectileBody: Body, playerBody: Body, projData: any) => void;
  onEnemyHitPlayer?: (enemyBody: Body, playerBody: Body, enemyData: any) => void;
  onProjectileHitTile?: (projectileBody: Body, projData: any) => void;
  onEnemyHitEnemy?: (enemyA: Body, enemyB: Body, dataA: any, dataB: any) => void;
  onPlayerPickupDrop?: (playerBody: Body, dropBody: Body, dropData: any) => void;
}

// ============================================================
// PlanckWorld
// ============================================================

export class PlanckWorld {
  private world: World;
  private tileBodies: Body[] = [];
  private entityMap = new Map<string, Body>();
  private callbacks: PhysicsCallbacks;
  private pendingDestroy: Body[] = [];

  constructor(callbacks: PhysicsCallbacks = {}) {
    this.callbacks = callbacks;
    this.world = new World(Vec2(0, 0));
    this.world.setAllowSleeping(false);
    this.world.setAutoClearForces(true);
    this.setupListeners();
  }

  setCallbacks(callbacks: PhysicsCallbacks): void {
    this.callbacks = callbacks;
  }

  private setupListeners(): void {
    this.world.on("begin-contact", (contact: Contact) => {
      const fA = contact.getFixtureA();
      const fB = contact.getFixtureB();
      const bodyA = fA.getBody();
      const bodyB = fB.getBody();
      const dataA = bodyA.getUserData() as any;
      const dataB = bodyB.getUserData() as any;
      const catA = dataA?.category;
      const catB = dataB?.category;

      // Projectile → Enemy
      if ((catA === Cat.Projectile && catB === Cat.Enemy) || (catA === Cat.Enemy && catB === Cat.Projectile)) {
        const projBody = catA === Cat.Projectile ? bodyA : bodyB;
        const enemyBody = catA === Cat.Enemy ? bodyA : bodyB;
        if (this.callbacks.onProjectileHitEnemy) {
          this.callbacks.onProjectileHitEnemy(projBody, enemyBody, projBody.getUserData(), enemyBody.getUserData());
        }
        this.pendingDestroy.push(projBody);
      }

      // Projectile → Player
      if ((catA === Cat.Projectile && catB === Cat.Player) || (catA === Cat.Player && catB === Cat.Projectile)) {
        const projBody = catA === Cat.Projectile ? bodyA : bodyB;
        if (this.callbacks.onProjectileHitPlayer) {
          this.callbacks.onProjectileHitPlayer(projBody, catA === Cat.Player ? bodyA : bodyB, projBody.getUserData());
        }
        this.pendingDestroy.push(projBody);
      }

      // Projectile → Tile
      if ((catA === Cat.Projectile && catB === Cat.Tile) || (catA === Cat.Tile && catB === Cat.Projectile)) {
        const projBody = catA === Cat.Projectile ? bodyA : bodyB;
        if (this.callbacks.onProjectileHitTile) {
          this.callbacks.onProjectileHitTile(projBody, projBody.getUserData());
        }
        this.pendingDestroy.push(projBody);
      }

      // Enemy → Player
      if ((catA === Cat.Enemy && catB === Cat.Player) || (catA === Cat.Player && catB === Cat.Enemy)) {
        const enemyBody = catA === Cat.Enemy ? bodyA : bodyB;
        if (this.callbacks.onEnemyHitPlayer) {
          this.callbacks.onEnemyHitPlayer(enemyBody, catA === Cat.Player ? bodyA : bodyB, enemyBody.getUserData());
        }
      }

      // Ghost → Player (contact damage)
      if ((catA === Cat.Ghost && catB === Cat.Player) || (catA === Cat.Player && catB === Cat.Ghost)) {
        const ghostBody = catA === Cat.Ghost ? bodyA : bodyB;
        if (this.callbacks.onEnemyHitPlayer) {
          this.callbacks.onEnemyHitPlayer(ghostBody, catA === Cat.Player ? bodyA : bodyB, ghostBody.getUserData());
        }
      }

      // Enemy → Enemy
      if ((catA === Cat.Enemy && catB === Cat.Enemy) || (catA === Cat.Boss && catB === Cat.Enemy) ||
          (catA === Cat.Enemy && catB === Cat.Boss) || (catA === Cat.Boss && catB === Cat.Boss)) {
        const eA = catA === Cat.Enemy || catA === Cat.Boss ? bodyA : bodyB;
        const eB = catA === Cat.Enemy || catA === Cat.Boss ? bodyB : bodyA;
        if (this.callbacks.onEnemyHitEnemy) {
          this.callbacks.onEnemyHitEnemy(eA, eB, eA.getUserData(), eB.getUserData());
        }
      }

      // Player → Drop (sensor)
      if ((catA === Cat.Player && catB === Cat.Drop) || (catA === Cat.Drop && catB === Cat.Player)) {
        const dropBody = catA === Cat.Drop ? bodyA : bodyB;
        if (this.callbacks.onPlayerPickupDrop) {
          this.callbacks.onPlayerPickupDrop(bodyA, bodyB, dropBody.getUserData());
        }
      }
    });

    this.world.on("pre-solve", (contact: Contact, oldManifold: Manifold) => {
      const bodyA = contact.getFixtureA().getBody();
      const bodyB = contact.getFixtureB().getBody();
      const dataA = bodyA.getUserData() as any;
      const dataB = bodyB.getUserData() as any;
      if ((dataA?.dead === true || dataB?.dead === true) &&
          dataA?.category !== Cat.Tile && dataB?.category !== Cat.Tile) {
        contact.setEnabled(false);
      }
    });
  }

  // ============================================================
  // Создание тел
  // ============================================================

  createTileBody(x: number, y: number, radius: number): Body {
    const body = this.world.createBody({ type: BodyConst.STATIC, position: Vec2(x, y) });
    const fixture = body.createFixture(CircleShape(radius), 0);
    applyFilter(fixture, Cat.Tile);
    body.setUserData({ category: Cat.Tile, solid: true });
    this.tileBodies.push(body);
    return body;
  }

  createEntityBody(x: number, y: number, radius: number, category: number, userData: any): Body {
    const body = this.world.createDynamicBody({
      position: Vec2(x, y),
      fixedRotation: true,
      bullet: true,
    });
    body.createFixture(CircleShape(radius), { density: 1.0 });
    applyFilter(body.getFixtureList()!, category);
    body.setUserData({ ...userData, category });
    return body;
  }

  /** Создать kinematic body для призрака — проходит сквозь static, но коллидирует с игроком */
  createGhostBody(x: number, y: number, radius: number): Body {
    const body = this.world.createKinematicBody({
      position: Vec2(x, y),
      fixedRotation: true,
    });
    body.createFixture(CircleShape(radius), 0);
    applyFilter(body.getFixtureList()!, Cat.Ghost);
    body.setUserData({ category: Cat.Ghost });
    return body;
  }

  createKinematicBody(x: number, y: number, w: number, h: number, category: number): Body {
    const body = this.world.createKinematicBody({ position: Vec2(x, y), fixedRotation: true });
    body.createFixture(PolygonShape(boxVertices(w / 2, h / 2)), 0);
    applyFilter(body.getFixtureList()!, category);
    body.setUserData({ category });
    return body;
  }

  createProjectileBody(x: number, y: number, radius: number, vx: number, vy: number): Body {
    const body = this.world.createDynamicBody({
      position: Vec2(x, y),
      linearVelocity: Vec2(vx, vy),
      fixedRotation: true,
      bullet: true,
    });
    body.createFixture(CircleShape(radius), { density: 0.5 });
    applyFilter(body.getFixtureList()!, Cat.Projectile);
    body.setUserData({ category: Cat.Projectile, dead: false });
    return body;
  }

  createDropBody(x: number, y: number, radius: number): Body {
    const body = this.world.createDynamicBody({
      position: Vec2(x, y),
      fixedRotation: true,
    });
    const fixture = body.createFixture(CircleShape(radius), 0);
    applyFilter(body.getFixtureList()!, Cat.Drop);
    fixture.setSensor(true);
    body.setUserData({ category: Cat.Drop });
    return body;
  }

  // ============================================================
  // Управление телами
  // ============================================================

  registerBody(key: string, body: Body): void {
    this.entityMap.set(key, body);
  }

  unregisterBody(key: string): void {
    this.entityMap.delete(key);
  }

  destroyBody(body: Body): void {
    if (this.world.isLocked()) {
      this.pendingDestroy.push(body);
    } else {
      this.world.destroyBody(body);
    }
  }

  // ============================================================
  // Step
  // ============================================================

  step(dt: number): void {
    if (this.pendingDestroy.length > 0 && !this.world.isLocked()) {
      for (const b of this.pendingDestroy) {
        try { this.world.destroyBody(b); } catch {}
      }
      this.pendingDestroy.length = 0;
    }

    // Sub-stepping для точных коллизий
    const subSteps = 4;
    const subDt = dt / subSteps;
    for (let i = 0; i < subSteps; i++) {
      this.world.step(subDt, 12, 16);
    }
  }

  // ============================================================
  // Queries
  // ============================================================

  pointSolid(x: number, y: number, doors: any[], barrier: any): boolean {
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    for (const d of doors) {
      if (d.open < 0.9) rects.push({ x: d.x - 9, y: d.y - 8, w: 18, h: 16 });
    }
    if (barrier && barrier.active) {
      rects.push({ x: barrier.x - 20, y: barrier.y - 8, w: 40, h: 16 });
    }
    for (const r of rects) {
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
    }

    const point = Vec2(x, y);
    const aabb = {
      lowerBound: Vec2(x - 0.1, y - 0.1),
      upperBound: Vec2(x + 0.1, y + 0.1),
    };
    let hit = false;
    this.world.queryAABB(aabb, (fixture: Fixture) => {
      const body = fixture.getBody();
      const data = body.getUserData() as any;
      if (data?.category === Cat.Tile) {
        if (fixture.testPoint(point)) {
          hit = true;
          return false;
        }
      }
      return true;
    });
    return hit;
  }

  hasLOS(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 10) return true;

    let hit = false;
    this.world.rayCast(Vec2(x0, y0), Vec2(x1, y1), (fixture, point, normal, fraction) => {
      const body = fixture.getBody();
      const data = body.getUserData() as any;
      if (data?.category === Cat.Tile || data?.category === Cat.Door || data?.category === Cat.Barrier) {
        hit = true;
        return 0;
      }
      return 1;
    });
    return !hit;
  }

  get worldRef(): World {
    return this.world;
  }

  clear(): void {
    for (const b of this.tileBodies) {
      try { this.world.destroyBody(b); } catch {}
    }
    this.tileBodies.length = 0;
    this.entityMap.clear();
    this.pendingDestroy.length = 0;
  }
}

// ============================================================
// Утилиты
// ============================================================

function boxVertices(halfW: number, halfH: number): Vec2[] {
  return [
    Vec2(-halfW, -halfH),
    Vec2(halfW, -halfH),
    Vec2(halfW, halfH),
    Vec2(-halfW, halfH),
  ];
}
