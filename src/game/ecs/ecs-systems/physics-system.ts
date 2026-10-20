/* physics-system.ts — интеграция с Planck.js */

import { query, hasComponent, addComponent, type World } from 'bitecs';
import { Vec2 } from 'planck-js';
import {
  Position,
  Velocity,
  Radius,
  Door,
  PhysicsBody,
  PhysicsBodyRegistry,
  Projectile,
  Enemy,
} from '../ecs-components';
import { StringPool, poolGet } from '../ecs-components';
import { Cat } from '../../physics/planck-world';

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
  const pb = PhysicsBody[eid];
  if (!pb) return undefined;
  const idx = pb.body;
  return idx > 0 ? PhysicsBodyRegistry[idx - 1] : undefined;
}

/** Синхронизировать позицию из Position в Planck.js body */
export function syncPositionToBody(world: World): void {
  for (const eid of query(world, [Position, PhysicsBody])) {
    // Снаряды управляются Planck.js напрямую — не сбрасывать позицию через setPosition
    // Иначе тело "запирается" если пересекается с тайлом
    if (hasComponent(world, eid, Projectile)) continue;
    const pos = Position[eid];
    if (!pos) continue; // AoS элемент может be undefined
    const body = getBody(eid);
    if (body) {
      body.setPosition({ x: pos.x, y: pos.y });
    }
  }
}

/** Синхронизировать Velocity из ECS в Planck.js body */
export function syncVelocityToBody(
  world: World,
  playerEid?: number,
  speedMul?: (eid: number, x: number, y: number) => number,
): void {
  for (const eid of query(world, [Velocity, PhysicsBody])) {
    // Снаряды управляются Planck.js напрямую — не перезаписывать velocity из Velocity[eid] (который = 0)
    if (hasComponent(world, eid, Projectile)) continue;
    const vel = Velocity[eid];
    if (!vel) continue; // AoS элемент может быть undefined
    const body = getBody(eid);
    if (body) {
      const pos = Position[eid];
      let mul = 1;
      if (pos && speedMul) {
        mul = speedMul(eid, pos.x, pos.y);
      }
      body.setLinearVelocity(Vec2(vel.x * mul, vel.y * mul));
    }
  }
}

/** Синхронизировать позицию из Planck.js body в Position */
export function syncBodyToPosition(world: World, playerEid?: number): void {
  for (const eid of query(world, [Position, PhysicsBody])) {
    const pos = Position[eid];
    if (!pos) continue; // AoS элемент может быть undefined
    const body = getBody(eid);
    if (body) {
      const pos2 = body.getPosition();
      pos.x = pos2.x;
      pos.y = pos2.y;
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
  mask: number,
  vx?: number,
  vy?: number,
  extraUserData?: Record<string, any>,
  groupIndex: number = 0
): void {
  // Добавляем компонент PhysicsBody (если ещё не добавлен)
  addComponent(world, eid, PhysicsBody);
  PhysicsBody[eid] = { body: 0 }; // Инициализируем AoS-объект

  // Создаём физическое тело
  const pos = Position[eid];
  if (!pos) return; // AoS элемент может быть undefined
  const body = planckWorld.createEntityBody(pos.x, pos.y, radius, category, { eid, ...extraUserData }, groupIndex);
  if (vx !== undefined && vy !== undefined) {
    body.setLinearVelocity({ x: vx, y: vy });
    try { body.setAwake(true); } catch { /* не критично */ }
  }
  PhysicsBody[eid].body = PhysicsBodyRegistry.length + 1;
  PhysicsBodyRegistry.push(body);
}

/** Удалить физическое тело сущности */
export function destroyBodyForEntity(
  planckWorld: any,
  eid: number
): void {
  const idx = PhysicsBody[eid].body;
  if (idx > 0) {
    const body = PhysicsBodyRegistry[idx - 1];
    if (body) {
      planckWorld.destroyBody(body);
    }
    PhysicsBody[eid].body = 0;
  }
}

/**
 * Создать (или пересоздать) кинематическое тело двери.
 * Размер коллайдера зависит от ориентации проёма: для проёмов сверху/снизу —
 * широкий (18×16), для боковых — высокий (16×18).
 */
export function createDoorBody(
  planckWorld: any,
  world: World,
  eid: number
): void {
  const pos = Position[eid];
  const door = Door[eid];
  if (!pos || !door) return;

  const horizontal = door.dir === 0 || door.dir === 2; // 0 = вниз, 2 = вверх
  const w = horizontal ? 18 : 16;
  const h = horizontal ? 16 : 18;

  const body = planckWorld.createKinematicBody(pos.x, pos.y, w, h, Cat.Door);
  addComponent(world, eid, PhysicsBody);
  PhysicsBody[eid] = { body: PhysicsBodyRegistry.length + 1 };
  PhysicsBodyRegistry.push(body);
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
  const pos = Position[eid];
  const rad = Radius[eid];
  if (!pos || !rad) return false;
  const ex = pos.x;
  const ey = pos.y;
  const er = rad.value;

  for (const otherEid of query(world, [Position, Radius])) {
    if (otherEid === eid) continue;
    const oPos = Position[otherEid];
    const oRad = Radius[otherEid];
    if (!oPos || !oRad) continue;

    if (circlesOverlap(ex, ey, er, oPos.x, oPos.y, oRad.value)) {
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
  const pos = Position[eid];
  const rad = Radius[eid];
  if (!pos || !rad) return [];
  const ex = pos.x;
  const ey = pos.y;
  const er = rad.value;
  const results: number[] = [];

  for (const otherEid of query(world, [Position, Radius])) {
    if (otherEid === eid) continue;
    const oPos = Position[otherEid];
    const oRad = Radius[otherEid];
    if (!oPos || !oRad) continue;

    if (circlesOverlap(ex, ey, er, oPos.x, oPos.y, oRad.value)) {
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
