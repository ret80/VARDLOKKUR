/* ecs/index.ts — barrel export для ECS модуля */

export { createEcsWorld, getEcsWorld, updateWorldTime, resetWorldTime, destroyEcsWorld, type WorldContext } from './ecs-world';
export {
  // Components — SoA
  Position,
  Velocity,
  Health,
  Radius,
  Time,
  Direction,
  RenderLayer,
  // Components — AoS
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
  // Components — Markers
  Dead,
  Hidden,
  Taken,
  Magnet,
  Moving,
  Attacking,
  Aiming,
  Frozen,
  Flashing,
  Slowed,
  Returning,
  ShrineLit,
  // Components — Special
  PhysicsBody,
  EnemyAI,
  // Utility functions
  setSoA,
  getSoA,
  setAoS,
  getAoS,
} from './ecs-components';
export {
  // Relations
  ChildOf,
  Targeting,
  Targeted,
  Contains,
  Removing,
} from './ecs-relations';
export {
  // Entity creation
  createEntity,
  createMovableEntity,
  createLivingEntity,
  createPlayerEntity,
  createEnemyEntity,
  createProjectileEntity,
  createDropEntity,
  // Utilities
  isAlive,
  distBetween,
  distSqBetween,
  setPosition,
  setVelocity,
  damageEntity,
  healEntity,
  getAliveCount,
} from './ecs-utils';
