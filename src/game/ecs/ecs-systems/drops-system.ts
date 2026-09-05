/* drops-system.ts — система дропов на основе ECS */

import { query, addEntity, addComponents, removeEntity, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Radius,
  Drop,
  Time,
  RenderLayer,
  Magnet,
  Taken,
  Health,
  Dead,
  PhysicsBody,
  poolGet,
  poolAdd,
  StringPool,
} from '../ecs-components';
import type { DropKind } from '../../generators/types';
import { Graphics } from 'pixi.js';
import { DropHandlerRegistry } from '../../drop-handlers';

// ============================================================
// ECS Drop Runtime Component
// ============================================================

export interface DropRt {
  kind: DropKind;
  x: number;
  y: number;
  t: number;
  taken: boolean;
  magnet: boolean;
  g: Graphics;
  life?: number;
  body?: any;
  ambientIdx?: number;
}

// ============================================================
// Создание дропа
// ============================================================

/** Создать дроп */
export function spawnDrop(
  world: World,
  kind: DropKind,
  x: number,
  y: number,
  magnet: boolean = false,
  life?: number
): number {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Radius, Drop, Time, RenderLayer, Magnet);

  Position.x[eid] = x;
  Position.y[eid] = y;
  Radius.value[eid] = 3;
  Drop.kind[eid] = poolAdd(StringPool.dropKinds, kind);
  Drop.t[eid] = Math.random() * 5;
  Drop.magnet[eid] = magnet ? 1 : 0;
  Drop.life[eid] = life ?? 0;
  Time.value[eid] = 0;
  RenderLayer.value[eid] = 40;
  Magnet[eid] = magnet ? 1 : 0;

  return eid;
}

// ============================================================
// Обновление дропов
// ============================================================

/** Обновить все дропы */
export function dropsUpdateSystem(
  world: World,
  dt: number,
  playerEid: number,
  store: any,
  bus: any,
  onDropRemove: (eid: number) => void,
  playerDomain: any,
  dropRegistry?: DropHandlerRegistry
): void {
  const { x: px, y: py } = Position;

  for (const eid of query(world, [Position, Drop, Time])) {
    if (Taken[eid]) continue;

    Time.value[eid] += dt;

    // Remove old drops with alpha blink
    if (Drop.life[eid] !== 0) {
      Drop.life[eid] -= dt;
      if (Drop.life[eid] <= 0) {
        removeEntity(world, eid);
        onDropRemove(eid);
        continue;
      }
      if (Drop.life[eid] < 5) {
        // Alpha blink handled in render system
      }
    }

    // Magnet pull to player
    if (Drop.magnet[eid] && playerEid >= 0) {
      const dx = px[playerEid] - px[eid];
      const dy = py[playerEid] - py[eid];
      const distSq = dx * dx + dy * dy;
      
      if (distSq < 34 * 34 && distSq > 1) {
        const dd = Math.sqrt(distSq);
        px[eid] += (dx / dd) * 120 * dt;
        py[eid] += (dy / dd) * 120 * dt;
      }
    }

    // Check pickup by player
    if (playerEid >= 0) {
      const dx = px[eid] - px[playerEid];
      const dy = py[eid] - py[playerEid];
      const distSq = dx * dx + dy * dy;

      if (distSq < 11 * 11) {
        Taken[eid] = 1;
        // Collect drop via drop-handlers
        const dropKind = poolGet(StringPool.dropKinds, Drop.kind[eid]) as DropKind;
        const handler = dropRegistry?.get(dropKind);
        if (handler) {
          const player = store.player;
          handler.handle({
            player: { hp: player.hp, maxHp: player.maxHp },
            flags: store.flags,
            bus,
          });
        }
        removeEntity(world, eid);
        onDropRemove(eid);
      }
    }
  }
}

// ============================================================
// Спавн дропа со смерти врага
// ============================================================

/** Спавн дропа со смерти врага (rollDrops logic) */
export function rollDropsForEnemy(
  world: World,
  enemyKind: string,
  x: number,
  y: number,
  isGhostLeash: boolean,
  onDropSpawn: (kind: DropKind, x: number, y: number, life?: number) => void
): void {
  if (enemyKind === 'ghost') {
    // Призрак у змея (leash) — ничего не даёт
    if (isGhostLeash) return;
    // Убийство: 90% шанс росы
    if (Math.random() < 0.9) {
      onDropSpawn('dew', x, y, 40);
    }
    if (Math.random() < 0.35) {
      onDropSpawn(Math.random() < 0.5 ? 'shard' : 'heart', x, y);
    }
    return;
  }

  const roll = Math.random();
  if (enemyKind !== 'frost') {
    if (roll < 0.4) onDropSpawn('heart', x, y);
    else if (roll < 0.62) onDropSpawn('arrows', x, y);
  } else {
    onDropSpawn(Math.random() < 0.5 ? 'heart' : 'arrows', x, y);
  }
}

// ============================================================
// Спавн мировых дропов
// ============================================================

/** Спавн мировых дропов из map data */
export function spawnWorldDrops(
  world: World,
  map: any,
  flags: any,
  takenAmbient: Set<number>,
  onDropSpawn: (kind: DropKind, x: number, y: number, life?: number) => void
): void {
  const T = 16; // tile size
  const add = (kind: DropKind, v: { x: number; y: number }) => {
    onDropSpawn(kind, v.x * T + 8, v.y * T + 8);
  };

  if (!flags.bearGone) add('bear', map.bearSpot);
  if (!flags.hornDone && !flags.horn) add('horn', map.hornSpot);
  if (!flags.meadDone && !flags.mead) add('mead', map.meadSpot);
  if (flags.giantDead && !flags.oreDone && !flags.ore) add('ore', map.oreSpot);
  if (!flags.shamanDone) {
    if (!flags.moss) add('moss', map.mossSpot);
    if (!flags.amber) add('amber', map.amberSpot);
    if (!flags.flower) add('flower', map.flowerSpot);
  }
  if (!flags.refugeeDone && !flags.diary) add('diary', map.diarySpot);
  if (!flags.merchantDone && !flags.bundle) add('bundle', map.bundleSpot);
  if (!flags.atoneDone && !flags.relic) add('relic', map.relicSpot);

  if (!map.isDungeon) {
    map.ambient.forEach((a: any, i: number) => {
      if (takenAmbient.has(i)) return;
      add(a.kind, { x: a.x, y: a.y });
    });
  }
}
