/* ============ Domain Models — immutable сущности ============ */

import { EnemyKind, DropKind, ProjectileKind } from "../world";

/** Игрок — доменная модель */
export interface PlayerModel {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly r: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly dir: { x: number; y: number };
  readonly moving: boolean;
  readonly animT: number;
  readonly swingT: number;
  readonly hurtT: number;
  readonly slowT: number;
}

/** Снаряд — доменная модель */
export interface ProjectileModel {
  readonly kind: ProjectileKind;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly r: number;
  readonly dmg: number;
  readonly life: number;
  readonly dist: number;
  readonly returning: boolean;
  readonly dead: boolean;
  readonly spin: number;
}

/** Дроп — доменная модель */
export interface DropModel {
  readonly kind: DropKind;
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly taken: boolean;
  readonly magnet: boolean;
  readonly life?: number;
}

/** Враг — доменная модель */
export interface EnemyModel {
  readonly kind: EnemyKind;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly r: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly facing: { x: number; y: number };
  readonly t: number;
  readonly state: string;
  readonly aggro: boolean;
  readonly dead: boolean;
  readonly hidden: boolean;
  readonly lungeT: number;
  readonly freezeT: number;
  readonly flashT: number;
  readonly seed: number;
  readonly speed: number;
  readonly dmg: number;
  readonly stateT: number;
  readonly path: { x: number; y: number }[] | null;
  readonly pathI: number;
  readonly repathT: number;
  readonly contactCd: number;
  readonly guardOf: number;
  readonly fade?: number;
  readonly leash?: { x: number; y: number };
  readonly dropDew?: boolean;
}
