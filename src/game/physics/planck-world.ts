/* ============ PlanckWorld ============
 * Обёртка над Planck.js World с поддержкой категорий и масок. */

import { Vec2, World, Body, Fixture, CircleShape, PolygonShape, BoxShape, Body as BodyConst } from "planck-js";
import type { Contact, Manifold } from "planck-js";
import { WorldData, T, solidTileAt } from "../world";
import { dist2 } from "../utils";
import type { EnemyKind } from "../world";

// ============================================================
// Категории (битовые маски) — collision filtering
// ============================================================

export const Cat: Record<string, number> = {
  None:       0x0000,
  Player:     0x0001,
  Enemy:      0x0002,
  Ground:     0x0004,
  Raven:      0x0008,
  Ghost:      0x0010,
  Projectile: 0x0020,
  Tile:       0x0040,
  Door:       0x0080,
  Barrier:    0x0100,
  Drop:       0x0200,
  Boss:       0x0400,
  Shrine:     0x0800,
  Altar:      0x1000,
  Pedestal:   0x2000,
};

// ============================================================
// Опции коллизий — что с чем коллидирует
// ============================================================

export const CollidesWith: Record<string, number> = {
  [Cat.Player]:     Cat.Tile | Cat.Enemy | Cat.Projectile | Cat.Door | Cat.Barrier | Cat.Drop | Cat.Shrine | Cat.Altar | Cat.Pedestal,
  [Cat.Enemy]:      Cat.Tile | Cat.Player | Cat.Projectile | Cat.Door | Cat.Barrier,
  // ⚠️ НЕ МЕНЯТЬ БЕЗ РАЗРЕШЕНИЯ — призрак не должен коллидировать с игроком
  [Cat.Ghost]:      Cat.None, // призрак проходит сквозь всё
  [Cat.Raven]:      Cat.None, // ворона не сталкивается ни с кем
  [Cat.Projectile]: Cat.Tile | Cat.Enemy | Cat.Player | Cat.Raven,
  [Cat.Tile]:       Cat.Player | Cat.Enemy | Cat.Projectile | Cat.Drop | Cat.Raven,
  [Cat.Door]:       Cat.Player | Cat.Enemy,
  [Cat.Barrier]:    Cat.Player | Cat.Enemy,
  [Cat.Drop]:       Cat.Player,
  [Cat.Boss]:       Cat.Tile | Cat.Player | Cat.Projectile | Cat.Door | Cat.Barrier,
  [Cat.Shrine]:     Cat.Player,
  [Cat.Altar]:      Cat.Player,
  [Cat.Pedestal]:   Cat.Player,
};

// ============================================================
// Вспомогательные функции для определения категорий врагов
// ============================================================

/** Битовая маска для "земли" — используется в явных масках коллизий */
export const GROUND_MASK = Cat.Ground;

/** Определить категорию врага по типу */
export function getEnemyCategory(kind: EnemyKind): number {
  switch (kind) {
    case "raven":
      return Cat.Raven;
    case "reaper":
      return Cat.Boss;
    default:
      return Cat.Enemy;
  }
}

/** Определить маску коллизий для врага по типу */
export function getEnemyMask(kind: EnemyKind): number {
  const base = Cat.Tile | Cat.Player | Cat.Projectile | Cat.Door | Cat.Barrier | Cat.Ground;
  switch (kind) {
    case "raven":
      // Ворона не сталкивается ни с кем
      return Cat.None;
    default:
      return base;
  }
}

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
  private destroyedBodies = new WeakSet<Body>();
  /** Набор тел, удалённых в текущем шаге — чтобы не синхронизировать их fixtures */
  private destroyedThisStep: Body[] = [];

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

      // Projectile → Raven
      if ((catA === Cat.Projectile && catB === Cat.Raven) || (catA === Cat.Raven && catB === Cat.Projectile)) {
        const projBody = catA === Cat.Projectile ? bodyA : bodyB;
        const ravenBody = catA === Cat.Raven ? bodyA : bodyB;
        if (this.callbacks.onProjectileHitEnemy) {
          this.callbacks.onProjectileHitEnemy(projBody, ravenBody, projBody.getUserData(), ravenBody.getUserData());
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

      // Enemy → Enemy (включая Boss)
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

  /** Создать static body для неподвижных объектов (святилища, алтари) */
  createStaticBody(x: number, y: number, radius: number, category: number): Body {
    const body = this.world.createBody({ type: BodyConst.STATIC, position: Vec2(x, y) });
    body.createFixture(CircleShape(radius), 0);
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
    if (this.destroyedBodies.has(body)) return;
    this.destroyedBodies.add(body);
    // Помечаем как уничтоженное в текущем шаге — это предотвратит
    // synchronizeFixtures для этого тела на следующем step()
    this.destroyedThisStep.push(body);
    if (this.world.isLocked()) {
      this.pendingDestroy.push(body);
    } else {
      try {
        this.world.destroyBody(body);
      } catch {
        // Тело уже было удалено (например, через pendingDestroy в том же кадре)
        // Очищаем WeakSet, чтобы не блокировать будущие попытки
        this.destroyedBodies.delete(body);
      }
    }
  }

  // ============================================================
  // Step
  // ============================================================

  step(dt: number): void {
    // Если мир заблокирован (мы внутри step), отменяем отложенное уничтожение —
    // оно будет обработано в следующем кадре. Иначе получим double-destroy.
    if (this.world.isLocked()) return;

    // ── Предварительная обработка pendingDestroy ──
    // Уничтожаем тела, которые были помечены ДО начала этого шага.
    // Это необходимо делать до world.step(), чтобы их fixtures не пытались
    // синхронизироваться при итерации по списку тел (Box2D не удаляет
    // тело из m_bodyList при уничтожении внутри шага, что вызывает краш
    // в DynamicTree.moveProxy).
    if (this.pendingDestroy.length > 0) {
      for (const b of this.pendingDestroy) {
        if (this.destroyedBodies.has(b)) continue;
        // Снимаем fixtures с дерева ДО уничтожения тела — иначе
        // synchronizeFixtures на world.step() попытается moveProxy
        // для proxy, которого уже нет в дереве.
        let fixture: any = b.getFixtureList();
        while (fixture) {
          const tree = (b.getWorld() as any)?.m_broadPhase?.m_tree;
          if (tree && fixture.m_proxy) {
            try { tree.removeProxy(fixture.m_proxy); } catch {}
            fixture.m_proxy = null;
          }
          fixture = fixture.m_next;
        }
        try { this.world.destroyBody(b); } catch {}
      }
      this.pendingDestroy.length = 0;
    }

    // ── Detach fixtures destroyed-тел от broadphase-дерева ──
    // Когда destroyBody() вызывается внутри world.step() (через begin-contact),
    // тело удаляется из мира, но остаётся в m_bodyList. При итерации
    // synchronizeFixtures пытается moveProxy для fixtures, которых уже нет в дереве.
    // Здесь мы вручную снимаем все fixtures уничтоженных тел с дерева.
    this.destroyedThisStep.forEach((body) => {
      if (!this.destroyedBodies.has(body)) return;
      let fixture: any = body.getFixtureList();
      while (fixture) {
        const tree = (body.getWorld() as any)?.m_broadPhase?.m_tree;
        if (tree && fixture.m_proxy) {
          try { tree.removeProxy(fixture.m_proxy); } catch {}
          // Обнуляем — иначе synchronizeFixtures на следующем кадре
          // попытается moveProxy для уже удалённого из дерева proxy
          fixture.m_proxy = null;
        }
        fixture = fixture.m_next;
      }
    });
    this.destroyedThisStep.length = 0;

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

  /** Очистить все тела (tile bodies + dynamic bodies через world.destroyBody) */
  clear(): void {
    for (const b of this.tileBodies) {
      if (!this.destroyedBodies.has(b)) {
        try { this.world.destroyBody(b); } catch {}
      }
    }
    this.tileBodies.length = 0;
    this.entityMap.clear();
    this.pendingDestroy.length = 0;
    this.destroyedBodies = new WeakSet<Body>();
  }

  /** Полное уничтожение мира — вызывает world.destroyBody() для всех тел */
  destroy(): void {
    // Уничтожаем все tile bodies
    for (const b of this.tileBodies) {
      if (!this.destroyedBodies.has(b)) {
        try { this.world.destroyBody(b); } catch {}
      }
    }
    this.tileBodies.length = 0;

    // Уничтожаем все динамические тела через linked list (getBodyList → m_next)
    // Это необходимо, т.к. Planck.js не имеет forEachBody в публичном API
    try {
      let body: Body | null = this.world.getBodyList();
      while (body) {
        const next = (body as any).m_next as Body | null;
        if (!(this.destroyedBodies as WeakSet<Body>).has(body)) {
          try { this.world.destroyBody(body); } catch {}
        }
        body = next;
      }
    } catch {
      // Мир мог быть уже заблокирован или повреждён — игнорируем
    }

    this.entityMap.clear();
    this.pendingDestroy.length = 0;
    this.destroyedBodies = new WeakSet<Body>();
    this.destroyedThisStep.length = 0;
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
