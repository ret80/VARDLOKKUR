/* ecs-components.ts — все компоненты для bitecs (AoS архитектура)

   Компоненты создаются через aos() и регистрируются в createEcsWorld().
   Данные хранятся в AoS-массивах: components[eid] = { x, y, ... }.
*/

import { aos } from 'bitecs';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';

// ============================================================
// 1. БАЗОВЫЕ КОМПОНЕНТЫ (AoS)
// ============================================================

/** Позиция сущности */
export const Position = aos<{ x: number; y: number }>();

/** Скорость сущности */
export const Velocity = aos<{ x: number; y: number }>();

/** Здоровье сущности */
export const Health = aos<{ current: number; max: number }>();

/** Радиус сущности */
export const Radius = aos<{ value: number }>();

/** Таймер сущности */
export const Time = aos<{ value: number }>();

/** Направление сущности */
export const Direction = aos<{ x: number; y: number }>();

/** Слой рендеринга */
export const RenderLayer = aos<{ value: number }>();

// ============================================================
// 2. КОМПОНЕНТЫ ИГРОКА
// ============================================================

export const Player = aos<{
  moving: number; animT: number; swingT: number; hurtT: number; slowT: number;
  hasSword: number; runes: number; swingDirX: number; swingDirY: number;
  aiming: number; maxHp: number;
}>();

// ============================================================
// 3. КОМПОНЕНТЫ ВРАГА
// ============================================================

export const Enemy = aos<{
  kind: number; radius: number; facingX: number; facingY: number;
  t: number; state: number; aggro: number; hidden: number;
  lungeT: number; freezeT: number; flashT: number; seed: number;
  speed: number; dmg: number; stateT: number; pathI: number; repathT: number;
  contactCd: number; guardOf: number; guardPedestalEid: number;
  fade: number; dropDew: number; leashX: number; leashY: number;
  fogOnly: number; nearLitShrine: number;
}>();

// ============================================================
// 4. КОМПОНЕНТЫ СНАРЯДОВ И ДРОПОВ
// ============================================================

export const Projectile = aos<{
  kind: number; dmg: number; life: number; dist: number; returning: number; spin: number;
}>();

export const Drop = aos<{
  kind: number; t: number; magnet: number; life: number;
}>();

export const NPC = aos<{ id: number; name: number }>();

export const Chest = aos<{ item: number; opened: number }>();

export const Pedestal = aos<{
  id: number; taken: number; guardsLeft: number; guardsSpawned: number;
}>();

export const Shrine = aos<{ lit: number }>();

export const Door = aos<{ open: number; locked: number }>();

export const Barrier = aos<{ active: number }>();

export const Altar = aos<{ runes: number }>();

// ============================================================
// 5. КОМПОНЕНТ КАРТЫ
// ============================================================

/** Параметры текущей карты (синглтон-сущность) */
export const MapState = aos<{ width: number; height: number; dungeonId: number }>();

/** Информация о per-tile Graphics карты */
export interface MapTileInfo {
  handle: number;
  x: number;
  y: number;
  layer: number;
}

/** Хранение per-tile Graphics: ключ → информация о Graphics */
export const MapTiles = new Map<string, MapTileInfo>();

// ============================================================
// 6. МАРКЕРНЫЕ КОМПОНЕНТЫ (только битовые маски bitecs)
// ============================================================

/** Флаг мёртвой сущности */
export const Dead = aos<{}>();

/** Флаг скрытой сущности */
export const Hidden = aos<{}>();

/** Флаг взятого объекта */
export const Taken = aos<{}>();

/** Флаг магнита (дроп притягивается) */
export const Magnet = aos<{}>();

/** Флаг перемещения */
export const Moving = aos<{}>();

/** Флаг атаки */
export const Attacking = aos<{}>();

/** Флаг прицеливания */
export const Aiming = aos<{}>();

/** Флаг заморозки */
export const Frozen = aos<{}>();

/** Флаг мигания */
export const Flashing = aos<{}>();

/** Флаг замедления */
export const Slowed = aos<{}>();

/** Флаг возвращающегося снаряда */
export const Returning = aos<{}>();

/** Флаг зажжённого святилища */
export const ShrineLit = aos<{}>();

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
// 3. STRING POOL
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
// 4. КОМПОНЕНТЫ AI, СПРАЙТОВ И ФИЗИКИ
// ============================================================

export const EnemyAI = aos<{
  path: number; lightspeedT: number; slowT: number; freezeT: number; flashT: number;
  lungeT: number; repathT: number; stateT: number; contactCd: number; guardsSpawned: number;
}>();

/** Ссылка на спрайт (GraphicsHandle) */
export const Sprite = aos<{ ref: number }>();

/** Индекс физического тела в PhysicsBodyRegistry */
export const PhysicsBody = aos<{ body: number }>();

// ============================================================
// 5. ОБЪЕКТНЫЕ РЕЕСТРЫ
// ============================================================

/** Физические тела сущностей */
export const PhysicsBodyRegistry: any[] = [];
export const EnemyAIRegistry: any[] = [];

/** Временный Container для запекания DYNAMIC_TEXTURE сущностей (переиспользуется) */
export const SpriteBakeContainer: any[] = [];

/** Baked Sprite для DYNAMIC_TEXTURE сущностей (вместо Graphics) */
export const SpriteBakedSprite: any[] = [];

// ============================================================
// 6. УТИЛИТЫ
// ============================================================

/** Сбросить все AoS-массивы компонентов (при перезагрузке карты) */
export function resetAllComponents(): void {
  // Clear all AoS arrays (they grow dynamically)
  const arrays = [
    Position, Velocity, Health, Radius, Time, Direction, RenderLayer,
    Player, Enemy, Projectile, Drop, NPC, Chest, Pedestal,
    Shrine, Door, Barrier, Altar, MapState,
    Dead, Hidden, Taken, Magnet, Moving, Attacking, Aiming,
    Frozen, Flashing, Slowed, Returning, ShrineLit,
    EnemyAI, Sprite, PhysicsBody,
  ];
  for (const arr of arrays) arr.length = 0;

  // Clear registries
  PhysicsBodyRegistry.length = 0;
  EnemyAIRegistry.length = 0;
  SpriteBakeContainer.length = 0;
  SpriteBakedSprite.length = 0;

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
// 7. ECS-хелперы для здоровья
// ============================================================

export function damageEntityEcs(eid: number, dmg: number): number {
  Health[eid].current = Math.max(0, Health[eid].current - dmg);
  return Health[eid].current;
}

export function healEntityEcs(eid: number, amount: number): number {
  Health[eid].current = Math.min(Health[eid].max, Health[eid].current + amount);
  return Health[eid].current;
}

export function fullHealEntityEcs(eid: number): number {
  Health[eid].current = Health[eid].max;
  return Health[eid].current;
}

export function increaseMaxHpEcs(eid: number, amount: number): { hp: number; maxHp: number } {
  Health[eid].max += amount;
  Health[eid].current = Math.min(Health[eid].max, Health[eid].current + amount);
  return { hp: Health[eid].current, maxHp: Health[eid].max };
}

// ============================================================
// 8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/** Получить строку из пула по индексу */
export function getStringFromPool(pool: string[], idx: number): string {
  return pool[idx] ?? '';
}
