/* physics-system.ts — интеграция с Planck.js */

import { query, hasComponent, addComponent, type World } from 'bitecs';
import { Vec2 } from 'planck-js';
import {
  Position,
  Velocity,
  Radius,
  PhysicsBody,
  PhysicsBodyRegistry,
} from '../ecs-components';

// ============================================================
// Callbacks для Planck.js collision
// ============================================================

export interface PhysicsCallbacks {
  /** Снаряд попал во врага */
  onProjectileHitEnemy?: (projEid: number, enemyEid: number) => void;
  /** Снаряд попал в игрока */
  onProjectileHitPlayer?: (projEid: number) => void;
  /** Враг коснулся игрока */
  onEnemyHitPlayer?: (enemyEid: number) => void;
  /** Снаряд попал в тайл */
  onProjectileHitTile?: (projEid: number) => void;
  /** Игрок подобрал дроп */
  onPlayerPickupDrop?: (dropEid: number) => void;
}

// ============================================================
// Управление физическими телами
// ============================================================

/** Получить Planck.js body из registry */
function getBody(eid: number): any {
  const idx = PhysicsBody.body[eid];
  return idx > 0 ? PhysicsBodyRegistry[idx - 1] : undefined;
}

/** Синхронизировать позицию из Position в Planck.js body */
export function syncPositionToBody(world: World): void {
  const { x: px, y: py } = Position;

  for (const eid of query(world, [Position, PhysicsBody])) {
    const body = getBody(eid);
    if (body) {
      body.setPosition({ x: px[eid], y: py[eid] });
    }
  }
}

/** Синхронизировать Velocity из ECS в Planck.js body */
export function syncVelocityToBody(world: World): void {
  const { x: vx, y: vy } = Velocity;

  for (const eid of query(world, [Velocity, PhysicsBody])) {
    const body = getBody(eid);
    if (body) {
      body.setLinearVelocity(Vec2(vx[eid], vy[eid]));
    }
  }
}

/** Синхронизировать позицию из Planck.js body в Position */
export function syncBodyToPosition(world: World): void {
  const { x: px, y: py } = Position;

  for (const eid of query(world, [Position, PhysicsBody])) {
    const body = getBody(eid);
    if (body) {
      const pos = body.getPosition();
      px[eid] = pos.x;
      py[eid] = pos.y;
    }
  }
}

/** Создать физическое тело для сущности (круг) — через PlanckWorld API */
export function createBodyForEntity(
  planckWorld: any, // PlanckWorld
  world: World,
  eid: number,
  radius: number,
  category: number,
  mask: number
): void {
  const { x: px, y: py } = Position;

  // Создаём физическое тело
  const body = planckWorld.createEntityBody(px[eid], py[eid], radius, category, {});
  PhysicsBody.body[eid] = PhysicsBodyRegistry.length + 1;
  PhysicsBodyRegistry.push(body);
}

/** Удалить физическое тело сущности */
export function destroyBodyForEntity(
  planckWorld: any,
  eid: number
): void {
  const idx = PhysicsBody.body[eid];
  if (idx > 0) {
    const body = PhysicsBodyRegistry[idx - 1];
    if (body) {
      planckWorld.destroyBody(body);
    }
    PhysicsBody.body[eid] = 0;
  }
}

// ============================================================
// Collision detection helpers
// ============================================================

/** Проверить пересечение двух кругов */
export function circlesOverlap(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number
): boolean {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const minDist = r1 + r2;
  return (dx * dx + dy * dy) < (minDist * minDist);
}

/** Проверить пересечение сущности с другими */
export function checkEntityOverlap(
  world: World,
  eid: number,
  predicate: (otherEid: number) => boolean
): boolean {
  const { x: px, y: py } = Position;
  const { value: r } = Radius;

  const ex = px[eid];
  const ey = py[eid];
  const er = r[eid];

  for (const otherEid of query(world, [Position, Radius])) {
    if (otherEid === eid) continue;

    if (circlesOverlap(ex, ey, er, px[otherEid], py[otherEid], r[otherEid])) {
      if (predicate(otherEid)) {
        return true;
      }
    }
  }
  return false;
}

/** Найти все перекрывающиеся сущности */
export function findOverlappingEntities(
  world: World,
  eid: number,
  predicate: (otherEid: number) => boolean
): number[] {
  const { x: px, y: py } = Position;
  const { value: r } = Radius;

  const ex = px[eid];
  const ey = py[eid];
  const er = r[eid];
  const results: number[] = [];

  for (const otherEid of query(world, [Position, Radius])) {
    if (otherEid === eid) continue;

    if (circlesOverlap(ex, ey, er, px[otherEid], py[otherEid], r[otherEid])) {
      if (predicate(otherEid)) {
        results.push(otherEid);
      }
    }
  }
  return results;
}

// ============================================================
// Raycast / Line of Sight
// ============================================================

/** Проверить линию видимости между двумя точками */
export function hasLineOfSight(
  planckWorld: any,
  x1: number, y1: number,
  x2: number, y2: number,
  callback: any // Planck.js raycast callback
): boolean {
  let hit = false;
  planckWorld.raycast(callback, { x: x1, y: y1 }, { x: x2, y: y2 });
  return !hit;
}
