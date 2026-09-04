/* ecs-components.ts — все компоненты для bitECS

Компоненты разделены на:
- SoA (Structure of Arrays) — для hot-path данных (Position, Velocity)
- Marker — булевы флаги (Dead, Taking, и т.д.)
- String pool — для строковых полей (kind, id, name)
- Object registry — для ссылок на объекты (PixiJS, Planck.js)
*/

import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';

// ============================================================
// 1. SOA КОМПОНЕНТЫ (Structure of Arrays — hot path)
// ============================================================

/** Позиция (SoA, Float32Array для производительности) */
export const Position = {
  x: new Float32Array(10000),
  y: new Float32Array(10000),
} as const;

/** Скорость (SoA) */
export const Velocity = {
  x: new Float32Array(10000),
  y: new Float32Array(10000),
} as const;

/** Здоровье (SoA) */
export const Health = {
  current: new Float32Array(10000),
  max: new Float32Array(10000),
} as const;

/** Радиус (SoA) */
export const Radius = {
  value: new Float32Array(10000),
} as const;

/** Время (SoA, для таймеров) */
export const Time = {
  value: new Float32Array(10000),
} as const;

/** Направление (SoA) */
export const Direction = {
  x: new Float32Array(10000),
  y: new Float32Array(10000),
} as const;

/** Слой отрисовки / z-order (SoA) */
export const RenderLayer = {
  value: new Int32Array(10000),
} as const;

// ============================================================
// 2. SOA КОМПОНЕНТЫ (бывшие AoS — конвертированы)
// ============================================================

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
} as const;

// --- Enemy ---
export const Enemy = {
  kind: new Uint32Array(10000),      // index into string pool
  radius: new Float32Array(10000),
  facingX: new Float32Array(10000),
  facingY: new Float32Array(10000),
  t: new Float32Array(10000),
  state: new Uint8Array(10000),      // index into enemyState enum
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
  leashX: new Float32Array(10000),   // leash anchor x (0 = no leash)
  leashY: new Float32Array(10000),   // leash anchor y (0 = no leash)
} as const;

/** Состояния врагов (enum для SoA) */
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
} as const;

/** Обратное отображение: enum value → string */
const _enemyStateNames: string[] = [
  'idle', 'wander', 'chase', 'lunge', 'hover', 'dive',
  'charge', 'cool', 'open', 'closed', 'appear', 'dissipate',
  'enter', 'wind', 'swing', 'stuck', 'aim', 'ring',
];
export function getEnemyStateName(idx: number): string {
  return _enemyStateNames[idx] ?? 'idle';
}

// --- Projectile ---
export const Projectile = {
  kind: new Uint32Array(10000),      // index into string pool
  dmg: new Float32Array(10000),
  life: new Float32Array(10000),
  dist: new Float32Array(10000),
  returning: new Uint8Array(10000),
  spin: new Float32Array(10000),
} as const;

// --- Drop ---
export const Drop = {
  kind: new Uint32Array(10000),      // index into string pool
  t: new Float32Array(10000),
  magnet: new Uint8Array(10000),
  life: new Float32Array(10000),
} as const;

// --- NPC ---
export const NPC = {
  id: new Uint32Array(10000),        // index into string pool
  name: new Uint32Array(10000),      // index into string pool
} as const;

// --- Chest ---
export const Chest = {
  item: new Uint32Array(10000),      // index into string pool
  opened: new Uint8Array(10000),
} as const;

// --- Pedestal ---
export const Pedestal = {
  id: new Uint32Array(10000),        // index into string pool
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
  runes: new Int32Array(10000),
} as const;

// --- PhysicsBody (объект Planck.js Body — не может быть в typed array) ---
export const PhysicsBody = {
  body: new Uint32Array(10000),      // index into body registry
} as const;
export const PhysicsBodyRegistry: any[] = [];

// --- Sprite (объект PixiJS — не может быть в typed array) ---
export const Sprite = {
  ref: new Uint32Array(10000),       // index into sprite registry
} as const;
export const SpriteRegistry: any[] = [];

// --- EnemyAI (path — массив объектов, не подходит для SoA) ---
export const EnemyAI = {
  path: new Uint32Array(10000),      // index into path registry
} as const;
export const EnemyAIRegistry: Array<{ x: number; y: number }[] | null> = [];

// ============================================================
// 3. STRING POOL (для строковых полей компонентов)
// ============================================================

export const StringPool = {
  enemyKinds: ['draugr', 'varg', 'raven', 'shroom', 'crawler', 'frost', 'reaper', 'spider', 'giant', 'snake', 'ghost'] as string[],
  dropKinds: ['heart', 'arrows', 'dew', 'shard', 'bear', 'horn', 'mead', 'ore', 'moss', 'amber', 'flower', 'diary', 'bundle', 'relic', 'rune'] as string[],
  projectileKinds: ['axe', 'arrow', 'spore', 'fire', 'ice'] as string[],
  npcIds: [] as string[],
  npcNames: [] as string[],
  chestItems: ['bow', 'arrows', 'heartPiece', 'key'] as string[],
  pedestalIds: [] as string[],
} as const;

/** Добавить строку в пул, вернуть индекс */
export function poolAdd(pool: string[], s: string): number {
  const idx = pool.indexOf(s);
  if (idx >= 0) return idx;
  if (pool.length >= 65535) throw new Error('String pool overflow');
  pool.push(s);
  return pool.length - 1;
}

export function poolGet(pool: string[], idx: number): string {
  return pool[idx] ?? '';
}

// ============================================================
// 4. MARKER КОМПОНЕНТЫ (булевы флаги — SoA Uint8Array)
// ============================================================

/** Сущность мертва (маркер для удаления) */
export const Dead = new Uint8Array(10000);

/** Сущность невидима */
export const Hidden = new Uint8Array(10000);

/** Сущность берётся (дропа) */
export const Taken = new Uint8Array(10000);

/** Сущность магнитится (дропа) */
export const Magnet = new Uint8Array(10000);

/** Сущность движется */
export const Moving = new Uint8Array(10000);

/** Сущность атакует */
export const Attacking = new Uint8Array(10000);

/** Сущность целится (лук) */
export const Aiming = new Uint8Array(10000);

/** Сущность заморожена */
export const Frozen = new Uint8Array(10000);

/** Сущность мигает (получила урон) */
export const Flashing = new Uint8Array(10000);

/** Сущность замедлена */
export const Slowed = new Uint8Array(10000);

/** Снаряд возвращается */
export const Returning = new Uint8Array(10000);

/** Святилище активировано */
export const ShrineLit = new Uint8Array(10000);

// ============================================================
// 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/** Инициализировать значение SoA-компонента */
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

/** Получить значение SoA-компонента */
export function getSoA<T extends Record<string, Float32Array>>(
  comp: T,
  eid: number,
  key: keyof T
): number {
  return comp[key][eid];
}

/** Установить числовое поле SoA-компонента */
export function setSoANum<T extends Record<string, Uint8Array | Int32Array | Float32Array>>(
  comp: T,
  eid: number,
  key: keyof T,
  value: number
): void {
  comp[key][eid] = value;
}

/** Получить числовое поле SoA-компонента */
export function getSoANum<T extends Record<string, Uint8Array | Int32Array | Float32Array>>(
  comp: T,
  eid: number,
  key: keyof T
): number {
  return comp[key][eid];
}

/** Установить строковое поле (через string pool) */
export function setSoAString(
  comp: { kind: Uint32Array; id: Uint32Array; name: Uint32Array; item: Uint32Array },
  eid: number,
  field: 'kind' | 'id' | 'name' | 'item',
  value: string,
  pool: string[]
): void {
  comp[field][eid] = poolAdd(pool, value);
}

/** Получить строковое поле (через string pool) */
export function getSoAString(
  comp: { kind: Uint32Array; id: Uint32Array; name: Uint32Array; item: Uint32Array },
  eid: number,
  field: 'kind' | 'id' | 'name' | 'item',
  pool: string[]
): string {
  return pool[comp[field][eid]] ?? '';
}

/** Установить объект (через registry) */
export function setSoAObject(
  registry: any[],
  arr: Uint32Array,
  eid: number,
  value: any
): void {
  arr[eid] = registry.length;
  registry.push(value);
}

/** Получить объект (через registry) */
export function getSoAObject(
  registry: any[],
  arr: Uint32Array,
  eid: number
): any {
  const idx = arr[eid];
  return idx > 0 ? registry[idx - 1] : undefined;
}
