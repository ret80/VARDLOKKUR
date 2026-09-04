/* ecs-utils.ts — вспомогательные функции для работы с ECS */

import {
  addEntity,
  addComponent,
  addComponents,
  removeEntity,
  hasComponent,
  getComponent,
  type World,
} from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Time,
  Direction,
  RenderLayer,
  Player,
  Enemy,
  Projectile,
  Drop,
  NPC,
  Chest,
  Pedestal,
  Shrine,
  Door,
  Barrier,
  Altar,
  Sprite,
  PhysicsBody,
  EnemyAI,
  setSoA,
  getSoA,
  setAoS,
  getAoS,
} from './ecs-components';

// ============================================================
// Создание сущностей
// ============================================================

/** Создать сущность с Position и Radius */
export function createEntity(world: World, layer: number = 0): number {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, RenderLayer);
  Position.x[eid] = 0;
  Position.y[eid] = 0;
  Radius.value[eid] = 5;
  RenderLayer.value[eid] = layer;
  return eid;
}

/** Создать сущность с Position, Velocity и Radius */
export function createMovableEntity(world: World, layer: number = 0): number {
  const eid = createEntity(world, layer);
  addComponents(world, eid, Velocity);
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  return eid;
}

/** Создать сущность с Position, Health и Radius */
export function createLivingEntity(world: World, hp: number, layer: number = 0): number {
  const eid = createEntity(world, layer);
  addComponents(world, eid, Health);
  Health.current[eid] = hp;
  Health.max[eid] = hp;
  return eid;
}

// ============================================================
// Создание сущностей с данными
// ============================================================

/** Создать игрока */
export function createPlayerEntity(world: World, x: number, y: number): number {
  const eid = createLivingEntity(world, 12, 100); // высокий layer
  addComponents(world, eid, Player, Direction, Velocity);
  addComponent(world, eid, PhysicsBody);
  Position.x[eid] = x;
  Position.y[eid] = y;
  Direction.x[eid] = 0;
  Direction.y[eid] = 1;
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  setAoS(Player, eid, {
    moving: false,
    animT: 0,
    swingT: 0,
    hurtT: 0,
    slowT: 0,
    hasSword: false,
    runes: 0,
    swingDirX: 0,
    swingDirY: 1,
    aiming: false,
  });
  return eid;
}

/** Создать врага */
export function createEnemyEntity(
  world: World,
  kind: string,
  x: number,
  y: number,
  hp: number,
  radius: number,
  speed: number,
  dmg: number
): number {
  const eid = createLivingEntity(world, hp, 50);
  addComponents(world, eid, Enemy, Velocity, EnemyAI);
  addComponent(world, eid, PhysicsBody);
  Position.x[eid] = x;
  Position.y[eid] = y;
  Radius.value[eid] = radius;
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  Health.current[eid] = hp;
  Health.max[eid] = hp;
  setAoS(Enemy, eid, {
    kind: kind as any,
    radius,
    facingX: 1,
    facingY: 0,
    t: Math.random() * 10,
    state: 'idle',
    aggro: false,
    hidden: kind === 'crawler',
    lungeT: 0,
    freezeT: 0,
    flashT: 0,
    seed: Math.random() * 100,
    speed,
    dmg,
    stateT: 0,
    pathI: 0,
    repathT: 0.5,
    contactCd: 0,
    guardOf: -1,
    fade: kind === 'ghost' ? 0 : 1,
    dropDew: false,
  });
  setAoS(EnemyAI, eid, { path: null });
  return eid;
}

/** Создать снаряд */
export function createProjectileEntity(
  world: World,
  kind: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  dmg: number,
  life: number
): number {
  const eid = createEntity(world, 60);
  addComponents(world, eid, Projectile, Velocity);
  Position.x[eid] = x;
  Position.y[eid] = y;
  Velocity.x[eid] = vx;
  Velocity.y[eid] = vy;
  setAoS(Projectile, eid, {
    kind: kind as any,
    dmg,
    life,
    dist: 0,
    returning: false,
    spin: 0,
  });
  return eid;
}

/** Создать дроп */
export function createDropEntity(
  world: World,
  kind: string,
  x: number,
  y: number
): number {
  const eid = createEntity(world, 40);
  addComponents(world, eid, Drop, Time);
  Position.x[eid] = x;
  Position.y[eid] = y;
  setAoS(Drop, eid, {
    kind: kind as any,
    t: Math.random() * 10,
    magnet: false,
  });
  Time.value[eid] = 0;
  return eid;
}

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
