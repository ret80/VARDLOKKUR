/* renderers/ecs-mappers.ts — мапперы ECS компонентов → data-объекты для рендереров */

import type { World } from 'bitecs';
import type { IEnemyData } from '../models';
import type { IDropData } from '../models';
import type { IProjectileData } from '../models';
import type { INpcData } from '../models';
import type { IChestData } from '../models';
import type { IPedestalData } from '../models';
import type { IShrineData } from '../models';
import type { IDoorData } from '../models';
import type { IBarrierData } from '../models';
import type { IAltarData } from '../models';
import type { IPlayerData, IPlayerExtra } from '../models';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import {
  Position,
  Health,
  Radius,
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
  Direction,
  Player,
  EnemyState,
  poolGet,
  StringPool,
  getEnemyStateName,
} from '../ecs/ecs-components';
import { ENEMY_STATS } from '../entities';

// ============================================================
// Мапперы для врагов
// ============================================================

export function eidToEnemyData(eid: number, _world: World): IEnemyData {
  const kind = poolGet(StringPool.enemyKinds, Enemy.kind[eid]) as EnemyKind;
  const stats = ENEMY_STATS[kind];
  const hp = Health.current[eid];
  const maxHp = Health.max[eid];
  const r = Radius.value[eid];

  return {
    x: Position.x[eid],
    y: Position.y[eid],
    kind,
    r,
    hp,
    maxHp,
    facing: { x: Enemy.facingX[eid], y: Enemy.facingY[eid] },
    t: Enemy.t[eid],
    state: getEnemyStateName(Enemy.state[eid]),
    aggro: !!Enemy.aggro[eid],
    dead: false,
    hidden: !!Enemy.hidden[eid],
    lungeT: Enemy.lungeT[eid],
    freezeT: Enemy.freezeT[eid],
    flashT: Enemy.flashT[eid],
    seed: Enemy.seed[eid],
    fade: Enemy.fade[eid],
    leash: (Enemy.leashX[eid] !== 0 || Enemy.leashY[eid] !== 0)
      ? { x: Enemy.leashX[eid], y: Enemy.leashY[eid] }
      : null,
    dropDew: !!Enemy.dropDew[eid],
  };
}

// ============================================================
// Мапперы для дропов
// ============================================================

export function eidToDropData(eid: number, _world: World): IDropData {
  const kind = poolGet(StringPool.dropKinds, Drop.kind[eid]) as DropKind;
  return {
    x: Position.x[eid],
    y: Position.y[eid],
    kind,
    t: Drop.t[eid],
    taken: false,
    magnet: false,
  };
}

// ============================================================
// Мапперы для снарядов
// ============================================================

export function eidToProjectileData(eid: number, _world: World): IProjectileData {
  const kind = poolGet(StringPool.projectileKinds, Projectile.kind[eid]) as ProjectileKind;
  return {
    x: Position.x[eid],
    y: Position.y[eid],
    kind,
    r: 3,
    spin: Projectile.spin[eid],
    vx: 0,
    vy: 0,
  };
}

// ============================================================
// Мапперы для NPC
// ============================================================

export function eidToNpcData(eid: number, _world: World): INpcData {
  return {
    x: Position.x[eid],
    y: Position.y[eid],
    id: poolGet(StringPool.npcIds, NPC.id[eid]),
    name: poolGet(StringPool.npcNames, NPC.name[eid]),
  };
}

// ============================================================
// Мапперы для объектов окружения
// ============================================================

export function eidToChestData(eid: number, _world: World): IChestData {
  return {
    x: Position.x[eid],
    y: Position.y[eid],
    opened: !!Chest.opened[eid],
  };
}

export function eidToPedestalData(eid: number, _world: World): IPedestalData {
  return {
    x: Position.x[eid],
    y: Position.y[eid],
    taken: !!Pedestal.taken[eid],
    guardsLeft: Pedestal.guardsLeft[eid],
  };
}

export function eidToShrineData(eid: number, _world: World): IShrineData {
  return {
    x: Position.x[eid],
    y: Position.y[eid],
    lit: !!Shrine.lit[eid],
  };
}

export function eidToDoorData(eid: number, _world: World): IDoorData {
  return {
    x: Position.x[eid],
    y: Position.y[eid],
    open: Door.open[eid],
    locked: !!Door.locked[eid],
  };
}

export function eidToBarrierData(eid: number, _world: World): IBarrierData {
  return {
    x: Position.x[eid],
    y: Position.y[eid],
    active: !!Barrier.active[eid],
  };
}

export function eidToAltarData(eid: number, _world: World): IAltarData {
  return {
    x: Position.x[eid],
    y: Position.y[eid],
    runes: Altar.runes[eid],
  };
}

// ============================================================
// Маппер для игрока
// ============================================================

export function playerToRenderData(
  peid: number,
  _time: number
): { data: IPlayerData; extra: IPlayerExtra } {
  const d = Direction;
  return {
    data: {
      x: Position.x[peid],
      y: Position.y[peid],
      dir: { x: d.x[peid], y: d.y[peid] },
      moving: !!Player.moving[peid],
      animT: Player.animT[peid],
      swingT: Player.swingT[peid],
      hurtT: Player.hurtT[peid],
      slowT: Player.slowT[peid],
      r: 5,
    },
    extra: {
      hasSword: !!Player.hasSword[peid],
      runes: Player.runes[peid],
      swingDir: { x: Player.swingDirX[peid], y: Player.swingDirY[peid] },
      aiming: !!Player.aiming[peid],
    },
  };
}
