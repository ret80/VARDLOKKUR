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

export function eidToEnemyData(
  eid: number,
  _world: World,
  prevData?: IEnemyData | null
): IEnemyData {
  if (!Enemy[eid]) {
    // Fallback: возвращаем нейтральные данные если AoS элемент не инициализирован
    return {
      x: 0, y: 0, kind: 'default' as any, r: 10, hp: 0, maxHp: 0,
      facing: { x: 0, y: 0 }, t: 0, state: 'idle', aggro: false,
      dead: false, hidden: false, lungeT: 0, freezeT: 0, flashT: 0,
      seed: 0, fade: 1, leash: null, dropDew: false, nearLitShrine: false, prevData,
    };
  }
  const kind = poolGet(StringPool.enemyKinds, Enemy[eid].kind) as EnemyKind;
  const stats = ENEMY_STATS[kind];
  const hp = Health[eid].current;
  const maxHp = Health[eid].max;
  const r = Radius[eid].value;

  return {
    x: Position[eid].x,
    y: Position[eid].y,
    kind,
    r,
    hp,
    maxHp,
    facing: { x: Enemy[eid].facingX, y: Enemy[eid].facingY },
    t: Enemy[eid].t,
    state: getEnemyStateName(Enemy[eid].state),
    aggro: !!Enemy[eid].aggro,
    dead: false,
    hidden: !!Enemy[eid].hidden,
    lungeT: Enemy[eid].lungeT,
    freezeT: Enemy[eid].freezeT,
    flashT: Enemy[eid].flashT,
    seed: Enemy[eid].seed,
    fade: Enemy[eid].fade,
    leash: (Enemy[eid].leashX !== 0 || Enemy[eid].leashY !== 0)
      ? { x: Enemy[eid].leashX, y: Enemy[eid].leashY }
      : null,
    dropDew: !!Enemy[eid].dropDew,
    nearLitShrine: !!Enemy[eid].nearLitShrine,
    prevData,
  };
}

// ============================================================
// Мапперы для дропов
// ============================================================

export function eidToDropData(eid: number, _world: World): IDropData {
  const kind = poolGet(StringPool.dropKinds, Drop[eid].kind) as DropKind;
  return {
    x: Position[eid].x,
    y: Position[eid].y,
    kind,
    t: Drop[eid].t,
    taken: false,
    magnet: false,
  };
}

// ============================================================
// Мапперы для снарядов
// ============================================================

export function eidToProjectileData(eid: number, _world: World): IProjectileData {
  const kind = poolGet(StringPool.projectileKinds, Projectile[eid].kind) as ProjectileKind;
  return {
    x: Position[eid].x,
    y: Position[eid].y,
    kind,
    r: 3,
    spin: Projectile[eid].spin,
    vx: 0,
    vy: 0,
  };
}

// ============================================================
// Мапперы для NPC
// ============================================================

export function eidToNpcData(eid: number, _world: World): INpcData {
  return {
    x: Position[eid].x,
    y: Position[eid].y,
    id: poolGet(StringPool.npcIds, NPC[eid].id),
    name: poolGet(StringPool.npcNames, NPC[eid].name),
  };
}

// ============================================================
// Мапперы для объектов окружения
// ============================================================

export function eidToChestData(eid: number, _world: World): IChestData {
  return {
    x: Position[eid].x,
    y: Position[eid].y,
    opened: !!Chest[eid].opened,
  };
}

export function eidToPedestalData(eid: number, _world: World): IPedestalData {
  return {
    x: Position[eid].x,
    y: Position[eid].y,
    taken: !!Pedestal[eid].taken,
    guardsLeft: Pedestal[eid].guardsLeft,
  };
}

export function eidToShrineData(eid: number, _world: World): IShrineData {
  return {
    x: Position[eid].x,
    y: Position[eid].y,
    lit: !!Shrine[eid].lit,
  };
}

export function eidToDoorData(eid: number, _world: World): IDoorData {
  return {
    x: Position[eid].x,
    y: Position[eid].y,
    open: Door[eid].open,
    locked: !!Door[eid].locked,
  };
}

export function eidToBarrierData(eid: number, _world: World): IBarrierData {
  return {
    x: Position[eid].x,
    y: Position[eid].y,
    active: !!Barrier[eid].active,
  };
}

export function eidToAltarData(eid: number, _world: World): IAltarData {
  return {
    x: Position[eid].x,
    y: Position[eid].y,
    runes: Altar[eid].runes,
  };
}

// ============================================================
// Маппер для игрока
// ============================================================

export function playerToRenderData(
  peid: number,
  _time: number
): { data: IPlayerData; extra: IPlayerExtra } {
  return {
    data: {
      x: Position[peid].x,
      y: Position[peid].y,
      dir: { x: Direction[peid].x, y: Direction[peid].y },
      moving: !!Player[peid].moving,
      animT: Player[peid].animT,
      swingT: Player[peid].swingT,
      hurtT: Player[peid].hurtT,
      slowT: Player[peid].slowT,
      r: 5,
    },
    extra: {
      hasSword: !!Player[peid].hasSword,
      runes: Player[peid].runes,
      swingDir: { x: Player[peid].swingDirX, y: Player[peid].swingDirY },
      aiming: !!Player[peid].aiming,
    },
  };
}
