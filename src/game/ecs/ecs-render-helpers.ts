/* ecs-render-helpers.ts — рисование ECS сущностей на Graphics каждый кадр */

import { Graphics } from 'pixi.js';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import {
  IPlayerData, IEnemyData, INpcData, IDropData, IProjectileData,
  IChestData, IPedestalData, IShrineData, IDoorData, IBarrierData, IAltarData,
  IPlayerExtra,
  renderPlayer,
  renderEnemy,
  renderNpc,
  renderDrop,
  renderProjectile,
  renderChest,
  renderPedestal,
  renderShrine,
  renderDoor,
  renderBarrier,
  renderAltar,
  ENEMY_STATS,
} from '../entities';

// ============================================================
// ECS компоненты (импортируются через require для избежания циклических зависимостей)
// ============================================================

type ComponentGetter<T> = T;

// ============================================================
// Рисование игрока
// ============================================================

export function drawPlayer(
  g: Graphics,
  dirX: number, dirY: number,
  moving: boolean, animT: number, swingT: number,
  hurtT: number, slowT: number,
  hasSword: boolean, runes: number,
  swingDirX: number, swingDirY: number,
  aiming: boolean,
  time: number
): void {
  g.clear();
  const data: IPlayerData = {
    x: 0, y: 0,
    dir: { x: dirX, y: dirY },
    moving, animT, swingT, hurtT, slowT, r: 5,
  };
  const extra: IPlayerExtra = {
    hasSword, runes,
    swingDir: { x: swingDirX, y: swingDirY },
    aiming,
  };
  renderPlayer(g, data, time, extra);
}

// ============================================================
// Рисование врагов
// ============================================================

export function drawEnemy(
  g: Graphics,
  kind: EnemyKind,
  facingX: number, facingY: number,
  t: number, state: string,
  aggro: boolean, dead: boolean, hidden: boolean,
  lungeT: number, freezeT: number, flashT: number,
  seed: number, fade: number,
  hp: number, maxHp: number,
  r: number,
  dropDew: boolean,
  time: number
): void {
  g.clear();
  const stats = ENEMY_STATS[kind];
  const data: IEnemyData = {
    x: 0, y: 0, kind, r,
    hp, maxHp,
    facing: { x: facingX, y: facingY },
    t, state, aggro, dead, hidden,
    lungeT, freezeT, flashT,
    seed, fade, leash: null, dropDew,
  };
  renderEnemy(g, data, time);
}

// ============================================================
// Рисование NPC
// ============================================================

export function drawNpc(
  g: Graphics,
  id: string, name: string,
  time: number, mark: boolean
): void {
  g.clear();
  const bob = Math.sin(time * 2 + id.length) * 0.5;
  g.ellipse(0, 5 + bob, 5, 2).fill({ color: 0x05080d, alpha: 0.5 });
  renderNpc(g, { x: 0, y: 0, id, name }, time, mark);
}

// ============================================================
// Рисование дропов
// ============================================================

export function drawDrop(
  g: Graphics,
  kind: DropKind,
  t: number,
  taken: boolean, magnet: boolean,
  time: number
): void {
  g.clear();
  const data: IDropData = { x: 0, y: 0, kind, t, taken, magnet };
  renderDrop(g, data, time);
}

// ============================================================
// Рисование снарядов
// ============================================================

export function drawProjectile(
  g: Graphics,
  kind: ProjectileKind,
  vx: number, vy: number,
  spin: number,
  time: number
): void {
  g.clear();
  const data: IProjectileData = { x: 0, y: 0, kind, r: 3, spin, vx, vy };
  renderProjectile(g, data, time);
}

// ============================================================
// Рисование объектов окружения
// ============================================================

export function drawChest(
  g: Graphics,
  opened: boolean,
  time: number
): void {
  g.clear();
  const data: IChestData = { x: 0, y: 0, opened };
  renderChest(g, data);
}

export function drawPedestal(
  g: Graphics,
  taken: boolean, guardsLeft: number,
  time: number
): void {
  g.clear();
  const data: IPedestalData = { x: 0, y: 0, taken, guardsLeft };
  renderPedestal(g, data, time);
}

export function drawShrine(
  g: Graphics,
  lit: boolean,
  time: number
): void {
  g.clear();
  const data: IShrineData = { x: 0, y: 0, lit };
  renderShrine(g, data, time);
}

export function drawDoor(
  g: Graphics,
  open: number, locked: boolean
): void {
  g.clear();
  const data: IDoorData = { x: 0, y: 0, open, locked };
  renderDoor(g, data);
}

export function drawBarrier(
  g: Graphics,
  active: boolean,
  time: number
): void {
  g.clear();
  const data: IBarrierData = { x: 0, y: 0, active };
  renderBarrier(g, data, time);
}

export function drawAltar(
  g: Graphics,
  runes: number,
  time: number
): void {
  g.clear();
  const data: IAltarData = { x: 0, y: 0, runes };
  renderAltar(g, data, time);
}
