/* ecs-components.ts — все компоненты для bitECS */

import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import { Graphics } from 'pixi.js';

// ============================================================
// 1. SOA КОМПОНЕНТЫ (Structure of Arrays — hot path)
// ============================================================

export const Position = {
  x: new Float32Array(10000),
  y: new Float32Array(10000),
} as const;

export const Velocity = {
  x: new Float32Array(10000),
  y: new Float32Array(10000),
} as const;

export const Health = {
  current: new Float32Array(10000),
  max: new Float32Array(10000),
} as const;

export const Radius = {
  value: new Float32Array(10000),
} as const;

export const Time = {
  value: new Float32Array(10000),
} as const;

export const Direction = {
  x: new Float32Array(10000),
  y: new Float32Array(10000),
} as const;

export const RenderLayer = {
  value: new Int32Array(10000),
} as const;

// --- Player ---
export const Player = {
  moving: new Uint8Array(10000),
  animT: new Float32Array(10000),
  swingT: new Float32Array(10000),
  hurtT: new Float32Array(10000),
  slowT: new Float32Array(10000),
  hasSword: new Uint8Array(10000),
  runes: new Int32Array(10000),
  swingDirX: new Float32Array(10000),
  swingDirY: new Float32Array(10000),
  aiming: new Uint8Array(10000),
  maxHp: new Float32Array(10000),
} as const;

// --- Enemy ---
export const Enemy = {
  kind: new Uint32Array(10000),
  radius: new Float32Array(10000),
  facingX: new Float32Array(10000),
  facingY: new Float32Array(10000),
  t: new Float32Array(10000),
  state: new Uint8Array(10000),
  aggro: new Uint8Array(10000),
  hidden: new Uint8Array(10000),
  lungeT: new Float32Array(10000),
  freezeT: new Float32Array(10000),
  flashT: new Float32Array(10000),
  seed: new Float32Array(10000),
  speed: new Float32Array(10000),
  dmg: new Float32Array(10000),
  stateT: new Float32Array(10000),
  pathI: new Float32Array(10000),
  repathT: new Float32Array(10000),
  contactCd: new Float32Array(10000),
  guardOf: new Int32Array(10000),
  fade: new Float32Array(10000),
  dropDew: new Uint8Array(10000),
  leashX: new Float32Array(10000),
  leashY: new Float32Array(10000),
  fogOnly: new Uint8Array(10000),
  nearLitShrine: new Uint8Array(10000),
} as const;

// --- Projectile ---
export const Projectile = {
  kind: new Uint32Array(10000),
  dmg: new Float32Array(10000),
  life: new Float32Array(10000),
  dist: new Float32Array(10000),
  returning: new Uint8Array(10000),
  spin: new Float32Array(10000),
} as const;

// --- Drop ---
export const Drop = {
  kind: new Uint32Array(10000),
  t: new Float32Array(10000),
  magnet: new Uint8Array(10000),
  life: new Float32Array(10000),
} as const;

// --- NPC ---
export const NPC = {
  id: new Uint32Array(10000),
  name: new Uint32Array(10000),
} as const;

// --- Chest ---
export const Chest = {
  item: new Uint32Array(10000),
  opened: new Uint8Array(10000),
} as const;

// --- Pedestal ---
export const Pedestal = {
  id: new Uint32Array(10000),
  taken: new Uint8Array(10000),
  guardsLeft: new Int32Array(10000),
  guardsSpawned: new Uint8Array(10000),
} as const;

// --- Shrine ---
export const Shrine = {
  lit: new Uint8Array(10000),
} as const;

// --- Door ---
export const Door = {
  open: new Float32Array(10000),
  locked: new Uint8Array(10000),
} as const;

// --- Barrier ---
export const Barrier = {
  active: new Uint8Array(10000),
} as const;

// --- Altar ---
export const Altar = {
  runes: new Float32Array(10000),
} as const;

// --- Dead ---
export const Dead = new Uint8Array(10000);

// --- EnemyAI ---
export const EnemyAI = {
  path: new Int32Array(10000),
  lightspeedT: new Float32Array(10000),
  slowT: new Float32Array(10000),
  freezeT: new Float32Array(10000),
  flashT: new Float32Array(10000),
  lungeT: new Float32Array(10000),
  repathT: new Float32Array(10000),
  stateT: new Float32Array(10000),
  contactCd: new Float32Array(10000),
  guardsSpawned: new Uint8Array(10000),
} as const;

// --- EnemyState ---
export const EnemyState = {
  idle: 0,
  wander: 1,
  chase: 2,
  lunge: 3,
  hover: 4,
  dive: 5,
  charge: 6,
  cool: 7,
  open: 8,
  closed: 9,
  appear: 10,
  dissipate: 11,
  enter: 12,
  wind: 13,
  swing: 14,
  stuck: 15,
  aim: 16,
  ring: 17,
  ghost_wander: 18,
  ghost_orbit: 19,
  ghost_freeze: 20,
  ghost_lunge: 21,
  ghost_cooldown: 22,
} as const;

const _enemyStateNames: string[] = [
  'idle', 'wander', 'chase', 'lunge', 'hover', 'dive',
  'charge', 'cool', 'open', 'closed', 'appear', 'dissipate',
  'enter', 'wind', 'swing', 'stuck', 'aim', 'ring',
  'ghost_wander', 'ghost_orbit', 'ghost_freeze', 'ghost_lunge', 'ghost_cooldown',
];
export function getEnemyStateName(idx: number): string {
  return _enemyStateNames[idx] ?? 'idle';
}

// ============================================================
// 2. STRING POOL
// ============================================================

export const StringPool = {
  enemyKinds: [] as string[],
  dropKinds: [] as string[],
  projectileKinds: [] as string[],
  chestItems: [] as string[],
  pedestalIds: [] as string[],
  npcIds: [] as string[],
  npcNames: [] as string[],
};

export function poolAdd(pool: string[], value: string): number {
  const idx = pool.indexOf(value);
  if (idx >= 0) return idx;
  pool.push(value);
  return pool.length - 1;
}

export function poolGet(pool: string[], idx: number): string {
  return pool[idx] ?? '';
}

// ============================================================
// 3. МАРКЕР-КОМПОНЕНТЫ (булевы флаги)
// ============================================================

export const Hidden = new Uint8Array(10000);
export const Taken = new Uint8Array(10000);
export const Magnet = new Uint8Array(10000);
export const Moving = new Uint8Array(10000);
export const Attacking = new Uint8Array(10000);
export const Aiming = new Uint8Array(10000);
export const Frozen = new Uint8Array(10000);
export const Flashing = new Uint8Array(10000);
export const Slowed = new Uint8Array(10000);
export const Returning = new Uint8Array(10000);
export const ShrineLit = new Uint8Array(10000);

// ============================================================
// 3. ОБЪЕКТНЫЕ РЕЕСТРЫ
// ============================================================

export const SpriteRegistry: Graphics[] = [];
export const PhysicsBodyRegistry: any[] = [];
export const EnemyAIRegistry: any[] = [];

export const Sprite = {
  ref: new Int32Array(10000),
} as const;

export const PhysicsBody = {
  body: new Int32Array(10000),
} as const;

// ============================================================
// 4. УТИЛИТЫ
// ============================================================

/** Сбросить все SoA массивы компонентов (при перезагрузке карты) */
export function resetAllComponents(): void {
  // Reset all Float32Array fields
  const floatArrays: any[] = [
    Position.x, Position.y,
    Velocity.x, Velocity.y,
    Health.current, Health.max,
    Radius.value, Time.value,
    Direction.x, Direction.y,
    RenderLayer.value,
    Player.animT, Player.swingT, Player.hurtT, Player.slowT,
    Player.swingDirX, Player.swingDirY, Player.maxHp,
    Enemy.radius, Enemy.facingX, Enemy.facingY, Enemy.t,
    Enemy.lungeT, Enemy.freezeT, Enemy.flashT, Enemy.seed,
    Enemy.speed, Enemy.dmg, Enemy.stateT, Enemy.pathI,
    Enemy.repathT, Enemy.contactCd, Enemy.fade, Enemy.leashX, Enemy.leashY,
    Projectile.dmg, Projectile.life, Projectile.dist, Projectile.spin,
    Drop.t,
    EnemyAI.path, EnemyAI.lightspeedT, EnemyAI.slowT, EnemyAI.freezeT,
    EnemyAI.flashT, EnemyAI.lungeT, EnemyAI.repathT, EnemyAI.stateT,
    EnemyAI.contactCd,
  ];
  for (const a of floatArrays) a.fill(0);

  // Reset all Uint8Array fields
  const u8Arrays: any[] = [
    Player.moving, Player.hasSword, Player.aiming,
    Enemy.state, Enemy.aggro, Enemy.hidden, Enemy.dropDew, Enemy.leashX,
    Enemy.leashY, Enemy.fogOnly, Enemy.nearLitShrine,
    Dead,
    Projectile.returning,
    Drop.magnet,
    Chest.opened,
    Pedestal.taken, Pedestal.guardsSpawned,
    Shrine.lit,
    Door.open, Door.locked,
    Barrier.active,
    Hidden, Taken, Magnet, Moving, Attacking, Aiming,
    Frozen, Flashing, Slowed, Returning, ShrineLit,
  ];
  for (const a of u8Arrays) a.fill(0);

  // Reset all Int32Array fields
  const i32Arrays: any[] = [
    Player.runes,
    Pedestal.guardsLeft,
    Enemy.guardOf,
    EnemyAI.path,
  ];
  for (const a of i32Arrays) a.fill(0);

  // Reset all Uint32Array fields (string pool indices)
  const u32Arrays: any[] = [
    NPC.id, NPC.name,
    Chest.item,
    Pedestal.id,
    Enemy.kind,
    Projectile.kind,
    Drop.kind,
  ];
  for (const a of u32Arrays) a.fill(0);

  // Clear string pools
  StringPool.enemyKinds.length = 0;
  StringPool.dropKinds.length = 0;
  StringPool.projectileKinds.length = 0;
  StringPool.chestItems.length = 0;
  StringPool.pedestalIds.length = 0;
  StringPool.npcIds.length = 0;
  StringPool.npcNames.length = 0;
}

// ============================================================
// 5. ECS-хелперы для здоровья
// ============================================================

export function damageEntityEcs(eid: number, dmg: number): number {
  Health.current[eid] = Math.max(0, Health.current[eid] - dmg);
  return Health.current[eid];
}

export function healEntityEcs(eid: number, amount: number): number {
  Health.current[eid] = Math.min(Health.max[eid], Health.current[eid] + amount);
  return Health.current[eid];
}

export function fullHealEntityEcs(eid: number): number {
  Health.current[eid] = Health.max[eid];
  return Health.current[eid];
}

export function increaseMaxHpEcs(eid: number, amount: number): { hp: number; maxHp: number } {
  Health.max[eid] += amount;
  Health.current[eid] = Math.min(Health.max[eid], Health.current[eid] + amount);
  return { hp: Health.current[eid], maxHp: Health.max[eid] };
}

// ============================================================
// 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

export function setSoA<T extends Record<string, Float32Array>>(
  comp: T,
  eid: number,
  values: Partial<{ [K in keyof T]: number }>
): void {
  for (const key of Object.keys(comp) as (keyof T)[]) {
    if (values[key] !== undefined) {
      comp[key][eid] = values[key];
    }
  }
}

export function getSoA<T extends Record<string, Float32Array>>(
  comp: T,
  eid: number,
  key: keyof T
): number {
  return comp[key][eid];
}

export function setSoANum<T extends Record<string, Uint8Array | Int32Array | Float32Array>>(
  comp: T,
  eid: number,
  key: keyof T,
  value: number
): void {
  comp[key][eid] = value;
}

export function getSoANum<T extends Record<string, Uint8Array | Int32Array | Float32Array>>(
  comp: T,
  eid: number,
  key: keyof T
): number {
  return comp[key][eid];
}

export function setSoAString(
  comp: { kind: Uint32Array; id: Uint32Array; name: Uint32Array; item: Uint32Array },
  eid: number,
  field: 'kind' | 'id' | 'name' | 'item',
  value: string,
  pool: string[]
): void {
  comp[field][eid] = poolAdd(pool, value);
}

export function getSoAString(
  comp: { kind: Uint32Array; id: Uint32Array; name: Uint32Array; item: Uint32Array },
  eid: number,
  field: 'kind' | 'id' | 'name' | 'item',
  pool: string[]
): string {
  return pool[comp[field][eid]] ?? '';
}

export function setSoAObject(
  registry: any[],
  arr: Uint32Array,
  eid: number,
  value: any
): void {
  arr[eid] = registry.length;
  registry.push(value);
}

export function getSoAObject(
  registry: any[],
  arr: Uint32Array,
  eid: number
): any {
  const idx = arr[eid];
  return idx > 0 ? registry[idx - 1] : undefined;
}
