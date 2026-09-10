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
  return Health.current[eid] > 0;
}

/** Получить расстояние между двумя сущностями */
export function distBetween(world: World, a: number, b: number): number {
  const dx = Position.x[a] - Position.x[b];
  const dy = Position.y[a] - Position.y[b];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Проверить расстояние между двумя сущностями */
export function distSqBetween(a: number, b: number): number {
  const dx = Position.x[a] - Position.x[b];
  const dy = Position.y[a] - Position.y[b];
  return dx * dx + dy * dy;
}

/** Установить позицию */
export function setPosition(world: World, eid: number, x: number, y: number): void {
  Position.x[eid] = x;
  Position.y[eid] = y;
}

/** Установить скорость */
export function setVelocity(world: World, eid: number, vx: number, vy: number): void {
  Velocity.x[eid] = vx;
  Velocity.y[eid] = vy;
}

/** Нанести урон */
export function damageEntity(world: World, eid: number, amount: number): void {
  if (!hasComponent(world, eid, Health)) return;
  Health.current[eid] = Math.max(0, Health.current[eid] - amount);
}

/** Восстановить здоровье */
export function healEntity(world: World, eid: number, amount: number): void {
  if (!hasComponent(world, eid, Health)) return;
  const max = Health.max[eid];
  Health.current[eid] = Math.min(max, Health.current[eid] + amount);
}

/** Получить количество живых сущностей */
export function getAliveCount(world: World): number {
  const index = (world as any)._entityIndex;
  return index ? index.aliveCount || 0 : 0;
}
