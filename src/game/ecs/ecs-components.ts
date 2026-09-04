/* ecs-components.ts — все компоненты для bitECS

Компоненты разделены на:
- SoA (Structure of Arrays) — для hot-path данных (Position, Velocity)
- AoS (Array of Structures) — для составных данных сущностей (Player, Enemy)
- Marker — булевы флаги (Dead, Taking, и т.д.)
- Graphics — PixiJS объекты (any)
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
// 2. AOS КОМПОНЕНТЫ (Array of Structures — составные данные)
// ============================================================

/** Игрок */
export const Player = [] as {
  moving: boolean;
  animT: number;
  swingT: number;
  hurtT: number;
  slowT: number;
  hasSword: boolean;
  runes: number;
  swingDirX: number;
  swingDirY: number;
  aiming: boolean;
}[];

/** Враг */
export const Enemy = [] as {
  kind: EnemyKind;
  facingX: number;
  facingY: number;
  t: number;
  state: string;
  aggro: boolean;
  hidden: boolean;
  lungeT: number;
  freezeT: number;
  flashT: number;
  seed: number;
  speed: number;
  dmg: number;
  stateT: number;
  pathI: number;
  repathT: number;
  contactCd: number;
  guardOf: number;
  fade: number;
  dropDew: boolean;
  leash?: { x: number; y: number };
}[];

/** Снаряд */
export const Projectile = [] as {
  kind: ProjectileKind;
  dmg: number;
  life: number;
  dist: number;
  returning: boolean;
  spin: number;
}[];

/** Дроп */
export const Drop = [] as {
  kind: DropKind;
  t: number;
  magnet: boolean;
  life?: number;
}[];

/** NPC */
export const NPC = [] as {
  id: string;
  name: string;
}[];

/** Сундук */
export const Chest = [] as {
  item: string;
  opened: boolean;
}[];

/** Пьедестал */
export const Pedestal = [] as {
  id: string;
  taken: boolean;
  guardsLeft: number;
  guardsSpawned: boolean;
}[];

/** Святилище */
export const Shrine = [] as {
  lit: boolean;
}[];

/** Дверь */
export const Door = [] as {
  open: number;
  locked: boolean;
}[];

/** Барьер */
export const Barrier = [] as {
  active: boolean;
}[];

/** Алтарь */
export const Altar = [] as {
  runes: number;
}[];

/** Графический спрайт (PixiJS Sprite/Graphics — any) */
export const Sprite = [] as {
  ref: any; // PixiJS Sprite | Graphics
}[];

// ============================================================
// 3. MARKER КОМПОНЕНТЫ (булевы флаги)
// ============================================================

/** Сущность мертва (маркер для удаления) */
export const Dead = [] as boolean[];

/** Сущность невидима */
export const Hidden = [] as boolean[];

/** Сущность берётся (дропа) */
export const Taken = [] as boolean[];

/** Сущность магнитится (дропа) */
export const Magnet = [] as boolean[];

/** Сущность движется */
export const Moving = [] as boolean[];

/** Сущность атакует */
export const Attacking = [] as boolean[];

/** Сущность целится (лук) */
export const Aiming = [] as boolean[];

/** Сущность заморожена */
export const Frozen = [] as boolean[];

/** Сущность мигает (получила урон) */
export const Flashing = [] as boolean[];

/** Сущность замедлена */
export const Slowed = [] as boolean[];

/** Физическое тело (Planck.js Body — any) */
export const PhysicsBody = [] as {
  body: any; // Planck.js Body
}[];

/** Сущность — враг (для AI) */
export const EnemyAI = [] as {
  path: { x: number; y: number }[] | null;
}[];

/** Снаряд возвращается */
export const Returning = [] as boolean[];

/** Святилище активировано */
export const ShrineLit = [] as boolean[];

// ============================================================
// 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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

/** Инициализировать AoS-компонент */
export function setAoS<T>(arr: T[], eid: number, partial: Partial<T>): void {
  if (!arr[eid]) arr[eid] = {} as T;
  Object.assign(arr[eid] as any, partial);
}

/** Получить AoS-компонент */
export function getAoS<T>(arr: T[], eid: number): T | undefined {
  return arr[eid];
}
