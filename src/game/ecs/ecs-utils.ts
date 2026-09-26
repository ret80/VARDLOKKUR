/* ecs-utils.ts — вспомогательные функции для работы с ECS */

import {
  hasComponent,
  type World,
} from 'bitecs';
import {
  Position,
  Velocity,
  Health,
} from './ecs-components';

// ============================================================
// Утилиты для работы с компонентами
// ============================================================

/** Проверить, жива ли сущность (есть Health и current > 0) */
export function isAlive(world: World, eid: number): boolean {
  if (!hasComponent(world, eid, Health)) return true;
  return Health[eid].current > 0;
}

/** Получить расстояние между двумя сущностями */
export function distBetween(world: World, a: number, b: number): number {
  const dx = Position[a].x - Position[b].x;
  const dy = Position[a].y - Position[b].y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Проверить расстояние между двумя сущностями */
export function distSqBetween(a: number, b: number): number {
  const dx = Position[a].x - Position[b].x;
  const dy = Position[a].y - Position[b].y;
  return dx * dx + dy * dy;
}

/** Установить позицию */
export function setPosition(world: World, eid: number, x: number, y: number): void {
  Position[eid].x = x;
  Position[eid].y = y;
}

/** Установить скорость */
export function setVelocity(world: World, eid: number, vx: number, vy: number): void {
  Velocity[eid].x = vx;
  Velocity[eid].y = vy;
}

/** Нанести урон */
export function damageEntity(world: World, eid: number, amount: number): void {
  if (!hasComponent(world, eid, Health)) return;
  Health[eid].current = Math.max(0, Health[eid].current - amount);
}

/** Восстановить здоровье */
export function healEntity(world: World, eid: number, amount: number): void {
  if (!hasComponent(world, eid, Health)) return;
  const max = Health[eid].max;
  Health[eid].current = Math.min(max, Health[eid].current + amount);
}

/** Получить количество живых сущностей */
export function getAliveCount(world: World): number {
  const index = (world as any)._entityIndex;
  return index ? index.aliveCount || 0 : 0;
}
