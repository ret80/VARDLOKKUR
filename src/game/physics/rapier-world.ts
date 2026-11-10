/* rapier-world.ts — 3D-физика (Rapier3D) за фасадом прежнего PlanckWorld.
 *
 * Игра остаётся планарной: движение в плоскости XZ, Y — только высота
 * рельефа (визуальная). Поэтому тела создаются с замороженным Y и поворотом,
 * а наружу (в ECS) позиция отдаётся как (x, y=z) в игровых пикселях.
 *
 * Публичный API повторяет PlanckWorld (createTileBody/createEntityBody/step/
 * pointSolid/hasLOS/...), поэтому системы боя, AI и загрузчик карт не меняются.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import { Cat, CollidesWith } from './planck-world';
import { logger } from '../debug/logger';

// ============================================================
// Инициализация WASM (один раз, до создания мира)
// ============================================================

let rapierReady = false;
let rapierFailed = false;

export async function initRapier(): Promise<boolean> {
  if (rapierReady) return true;
  if (rapierFailed) return false;
  try {
    await RAPIER.init();
    rapierReady = true;
    logger.info('physics', 'Rapier3D initialized');
  } catch (err) {
    rapierFailed = true;
    logger.error('physics', `Rapier3D init failed: ${String(err)}`);
  }
  return rapierReady;
}

export function isRapierReady(): boolean {
  return rapierReady;
}

// ============================================================
// Адаптер тела (интерфейс Planck Body, которым пользуется игра)
// ============================================================

export type RapierBodyKind = 'dynamic' | 'fixed' | 'kinematic';

export class RapierBody {
  /** User data тела (eid, category, ...) — как body.getUserData() в Planck. */
  userData: Record<string, unknown>;
  /** Категория коллизий (Cat.*). */
  readonly category: number;

  constructor(
    readonly rb: RAPIER.RigidBody,
    readonly collider: RAPIER.Collider | null,
    category: number,
    userData: Record<string, unknown>,
  ) {
    this.category = category;
    this.userData = { ...userData, category };
  }

  getPosition(): { x: number; y: number } {
    const t = this.rb.translation();
    return { x: t.x, y: t.z };
  }

  setPosition(pos: { x: number; y: number }): void {
    this.rb.setTranslation({ x: pos.x, y: 0, z: pos.y }, true);
  }

  /** Аналог Planck `Body.setTransform(pos, angle)`: угол в 3D не нужен (Y заморожен). */
  setTransform(pos: { x: number; y: number }, _angle = 0): void {
    this.setPosition(pos);
    this.setAwake(true);
  }

  getLinearVelocity(): { x: number; y: number } {
    const v = this.rb.linvel();
    return { x: v.x, y: v.z };
  }

  setLinearVelocity(v: { x: number; y: number }): void {
    this.rb.setLinvel({ x: v.x, y: 0, z: v.y }, true);
  }

  applyLinearImpulse(impulse: { x: number; y: number }, _worldCenter?: unknown): void {
    this.rb.applyImpulse({ x: impulse.x, y: 0, z: impulse.y }, true);
  }

  getWorldCenter(): { x: number; y: number } {
    return this.getPosition();
  }

  setAwake(_awake = true): void {
    this.rb.wakeUp();
  }

  getUserData(): Record<string, unknown> {
    return this.userData;
  }

  setUserData(data: Record<string, unknown>): void {
    this.userData = data;
  }

  getAngle(): number {
    return 0;
  }
}

/** Мир Rapier3D с API PlanckWorld. */
export class RapierWorld {
  private world: RAPIER.World;
  private bodies = new Set<RapierBody>();
  /** Статические тела для pointSolid/hasLOS (собственная математика вместо query API). */
  private statics: Array<
    | { kind: 'circle'; x: number; y: number; r: number; category: number }
    | { kind: 'box'; x: number; y: number; hw: number; hh: number; category: number }
  > = [];
  private destroyed = false;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = 1 / 60;
  }

  // ============================================================
  // Создание статических тел
  // ============================================================

  createTileBody(x: number, y: number, radius: number): RapierBody {
    const body = this.addFixedCircle(x, y, radius, Cat.Tile);
    this.statics.push({ kind: 'circle', x, y, r: radius, category: Cat.Tile });
    return body;
  }

  createWallBody(cx: number, cy: number, halfW: number, halfH: number): RapierBody {
    const body = this.addFixedBox(cx, cy, halfW, halfH, Cat.Tile);
    this.statics.push({ kind: 'box', x: cx, y: cy, hw: halfW, hh: halfH, category: Cat.Tile });
    return body;
  }

  createStaticBody(x: number, y: number, radius: number, category: number): RapierBody {
    const body = this.addFixedCircle(x, y, radius, category);
    this.statics.push({ kind: 'circle', x, y, r: radius, category });
    return body;
  }

  createKinematicBody(x: number, y: number, w: number, h: number, category: number): RapierBody {
    // Двери/барьеры в игре не двигаются — тело фиксированное.
    const body = this.addFixedBox(x, y, w / 2, h / 2, category);
    this.statics.push({ kind: 'box', x, y, hw: w / 2, hh: h / 2, category });
    return body;
  }

  // ============================================================
  // Создание динамических тел
  // ============================================================

  createEntityBody(
    x: number,
    y: number,
    radius: number,
    category: number,
    userData: Record<string, unknown>,
    _groupIndex = 0,
  ): RapierBody {
    return this.addDynamicCircle(x, y, radius, category, userData, { x: 0, y: 0 });
  }

  createProjectileBody(
    x: number,
    y: number,
    radius: number,
    vx: number,
    vy: number,
    _groupIndex = 0,
  ): RapierBody {
    return this.addDynamicCircle(
      x,
      y,
      radius,
      Cat.Projectile,
      { category: Cat.Projectile, dead: false },
      { x: vx, y: vy },
    );
  }

  createDropBody(x: number, y: number, radius: number): RapierBody {
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0, y),
    );
    const cd = RAPIER.ColliderDesc.ball(radius)
      .setSensor(true)
      .setCollisionGroups(groups(Cat.Drop));
    const collider = this.world.createCollider(cd, rb);
    const body = new RapierBody(rb, collider, Cat.Drop, { category: Cat.Drop });
    this.bodies.add(body);
    return body;
  }

  /** Призрак: проходит сквозь всё (сенсор без коллизий), урон считается в ECS. */
  createGhostBody(x: number, y: number, radius: number): RapierBody {
    // Скоростное кинематическое тело: AI задаёт ему setLinearVelocity, а
    // position-based кинематика скорость игнорирует — призраки стояли на месте.
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(x, 0, y),
    );
    const cd = RAPIER.ColliderDesc.ball(radius)
      .setSensor(true)
      .setCollisionGroups(groups(Cat.Ghost));
    const collider = this.world.createCollider(cd, rb);
    const body = new RapierBody(rb, collider, Cat.Ghost, { category: Cat.Ghost });
    this.bodies.add(body);
    return body;
  }

  // ============================================================
  // Управление телами / шаг
  // ============================================================

  destroyBody(body: RapierBody | null | undefined): void {
    if (!body || this.destroyed) return;
    if (!this.bodies.has(body)) return;
    this.bodies.delete(body);
    try {
      this.world.removeRigidBody(body.rb);
    } catch {
      // тело уже удалено
    }
  }

  step(dt: number): void {
    if (this.destroyed) return;
    // Два подшага по dt/2: стабильнее на низком FPS и точнее для быстрых снарядов.
    const sub = Math.max(1 / 240, Math.min(dt / 2, 1 / 30));
    this.world.timestep = sub;
    this.world.step();
    if (dt / 2 > 1 / 240) this.world.step();
  }

  // ============================================================
  // Запросы (реализованы собственной математикой по статическим телам)
  // ============================================================

  pointSolid(x: number, y: number, doors: any[] = [], barrier: any = null): boolean {
    for (const d of doors) {
      if (d.open < 0.9 && x > d.x - 9 && x < d.x + 9 && y > d.y - 8 && y < d.y + 8) return true;
    }
    if (barrier && barrier.active) {
      if (x > barrier.x - 20 && x < barrier.x + 20 && y > barrier.y - 8 && y < barrier.y + 8) return true;
    }
    for (const s of this.statics) {
      if (s.category !== Cat.Tile) continue;
      if (s.kind === 'circle') {
        const dx = x - s.x, dy = y - s.y;
        if (dx * dx + dy * dy <= s.r * s.r) return true;
      } else if (Math.abs(x - s.x) <= s.hw && Math.abs(y - s.y) <= s.hh) {
        return true;
      }
    }
    return false;
  }

  hasLOS(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 10) return true;

    for (const s of this.statics) {
      if (s.category !== Cat.Tile && s.category !== Cat.Door && s.category !== Cat.Barrier) continue;
      const hit = s.kind === 'circle'
        ? segmentCircle(x0, y0, x1, y1, s.x, s.y, s.r)
        : segmentBox(x0, y0, x1, y1, s.x - s.hw, s.y - s.hh, s.hw * 2, s.hh * 2);
      if (hit) return false;
    }
    return true;
  }

  /** Совместимость с Planck API: колбэк получает тело, точку и нормаль. */
  raycast(
    callback: (body: RapierBody, point: { x: number; y: number }, normal: { x: number; y: number }, fraction: number) => number,
    p1: { x: number; y: number },
    p2: { x: number; y: number },
  ): void {
    let best: { body: RapierBody; f: number } | null = null;
    for (const body of this.bodies) {
      const data = body.getUserData() as { category?: number };
      if (data.category !== Cat.Tile) continue;
      const pos = body.getPosition();
      const radius = 1;
      const f = raySphereFraction(p1, p2, pos, radius);
      if (f === null) continue;
      if (!best || f < best.f) best = { body, f };
    }
    if (!best) return;
    const px = p1.x + (p2.x - p1.x) * best.f;
    const py = p1.y + (p2.y - p1.y) * best.f;
    callback(best.body, { x: px, y: py }, { x: 0, y: 1 }, best.f);
  }

  // ============================================================
  // Очистка
  // ============================================================

  clear(): void {
    for (const body of [...this.bodies]) {
      this.destroyBody(body);
    }
    this.bodies.clear();
    this.statics.length = 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clear();
    this.destroyed = true;
    try {
      this.world.free();
    } catch {
      /* уже освобождён */
    }
  }

  // ============================================================
  // Внутренние фабрики
  // ============================================================

  private addFixedCircle(x: number, y: number, radius: number, category: number): RapierBody {
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0, y),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(Math.max(0.5, radius)).setCollisionGroups(groups(category)),
      rb,
    );
    const body = new RapierBody(rb, collider, category, { category });
    this.bodies.add(body);
    return body;
  }

  private addFixedBox(x: number, y: number, hw: number, hh: number, category: number): RapierBody {
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0, y),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(Math.max(0.5, hw), 24, Math.max(0.5, hh))
        .setFriction(0)
        .setCollisionGroups(groups(category)),
      rb,
    );
    const body = new RapierBody(rb, collider, category, { category });
    this.bodies.add(body);
    return body;
  }

  private addDynamicCircle(
    x: number,
    y: number,
    radius: number,
    category: number,
    userData: Record<string, unknown>,
    velocity: { x: number; y: number },
  ): RapierBody {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, 0, y)
      .lockRotations()
      .setCcdEnabled(true);
    const rb = this.world.createRigidBody(desc);
    if (typeof rb.setEnabledTranslations === 'function') {
      // Y — только визуальный рельеф: физика строго в плоскости XZ.
      rb.setEnabledTranslations(true, false, true, true);
    }
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(Math.max(0.5, radius))
        .setFriction(0)
        .setDensity(1)
        .setCollisionGroups(groups(category)),
      rb,
    );
    if (velocity.x !== 0 || velocity.y !== 0) {
      rb.setLinvel({ x: velocity.x, y: 0, z: velocity.y }, true);
    }
    const body = new RapierBody(rb, collider, category, userData);
    this.bodies.add(body);
    return body;
  }
}

// ============================================================
// Утилиты
// ============================================================

/** Collision groups Rapier: старшие 16 бит — membership, младшие — filter. */
function groups(category: number): number {
  const membership = category & 0xffff;
  const filter = (CollidesWith[category] ?? 0) & 0xffff;
  return ((membership << 16) | filter) >>> 0;
}

function segmentCircle(
  x0: number, y0: number, x1: number, y1: number,
  cx: number, cy: number, r: number,
): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return false;
  let t = ((cx - x0) * dx + (cy - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + dx * t, py = y0 + dy * t;
  const ddx = cx - px, ddy = cy - py;
  return ddx * ddx + ddy * ddy <= r * r;
}

/** Пересечение отрезка с AABB (слэб-метод). */
function segmentBox(
  x0: number, y0: number, x1: number, y1: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  let tmin = 0, tmax = 1;
  const axes: Array<[number, number, number, number]> = [
    [x0, dx, bx, bx + bw],
    [y0, dy, by, by + bh],
  ];
  for (const [p, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
      continue;
    }
    let t1 = (lo - p) / d;
    let t2 = (hi - p) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

function raySphereFraction(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  c: { x: number; y: number },
  r: number,
): number | null {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return null;
  const fx = p1.x - c.x, fy = p1.y - c.y;
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * len2 * cc;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * len2);
  return t >= 0 && t <= 1 ? t : null;
}
