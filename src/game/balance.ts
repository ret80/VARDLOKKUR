/* balance.ts – Балансные данные сущностей (характеристики врагов) */

import type { EnemyKind } from "./world";
import type { Enemy } from "./models";

/** Характеристики врагов по типам */
export const ENEMY_STATS: Record<EnemyKind, { r: number; hp: number; speed: number; dmg: number }> = {
  draugr:  { r: 6, hp: 3, speed: 52, dmg: 1 },
  varg:    { r: 6, hp: 3, speed: 68, dmg: 1 },
  raven:   { r: 5, hp: 2, speed: 78, dmg: 1 },
  shroom:  { r: 5, hp: 3, speed: 40, dmg: 1 },
  crawler: { r: 6, hp: 2, speed: 56, dmg: 1 },
  frost:   { r: 7, hp: 4, speed: 48, dmg: 1 },
  reaper:  { r: 10, hp: 16, speed: 58, dmg: 1 },
  spider:  { r: 11, hp: 12, speed: 44, dmg: 1 },
  giant:   { r: 13, hp: 20, speed: 44, dmg: 2 },
  snake:   { r: 16, hp: 14, speed: 0,  dmg: 1 },
  ghost:   { r: 6, hp: 5, speed: 100, dmg: 1 },
};

/** Создать plain-object врага по типу */
export function makeEnemy(kind: EnemyKind, x: number, y: number, idx: number): Enemy {
  const stats = ENEMY_STATS[kind];
  const e: Enemy = {
    kind, x, y, vx: 0, vy: 0, r: stats.r,
    hp: stats.hp, maxHp: stats.hp,
    facing: { x: 1, y: 0 },
    t: Math.random() * 10,
    state: "idle",
    aggro: false,
    dead: false,
    hidden: kind === "crawler",
    lungeT: 0,
    freezeT: 0,
    flashT: 0,
    seed: idx * 7.31 + Math.random(),
    body: null,
    speed: stats.speed,
    dmg: stats.dmg,
    stateT: 0,
    path: null,
    pathI: 0,
    repathT: 0.5,
    contactCd: 0,
    guardOf: -1,
    fade: kind === "ghost" ? 0 : 1,
    dropDew: false,
  };
  return e;
}