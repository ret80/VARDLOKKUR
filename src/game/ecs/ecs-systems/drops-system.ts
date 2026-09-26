/* drops-system.ts — система дропов на основе ECS */

import { query, removeEntity, type World } from 'bitecs';
import {
  Position,
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
  StringPool,
} from '../ecs-components';
import type { DropKind } from '../../generators/types';
import { DropHandlerRegistry } from '../../drop-handlers';
import type { EntityFactory } from '../entity-factory';

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
  g: any;
  life?: number;
  body?: any;
  ambientIdx?: number;
}

// ============================================================
// Создание дропа
// ============================================================

/** Создать дроп */
export function spawnDrop(
  factory: EntityFactory,
  kind: DropKind,
  x: number,
  y: number,
  magnet: boolean = false,
  life?: number
): number {
  const eid = factory.createDrop(kind, x, y, magnet, life ?? 0);
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
  for (const eid of query(world, [Position, Drop, Time])) {
    const pos = Position[eid];
    const drop = Drop[eid];
    const tm = Time[eid];
    if (!pos || !drop || !tm) continue; // AoS элемент может быть undefined
    if (Taken[eid]) continue;

    tm.value += dt;

    // Remove old drops with alpha blink
    if (drop.life !== 0) {
      drop.life -= dt;
      if (drop.life <= 0) {
        removeEntity(world, eid);
        onDropRemove(eid);
        continue;
      }
      if (drop.life < 5) {
        // Alpha blink handled in render system
      }
    }

    // Magnet pull to player
    if (drop.magnet && playerEid >= 0) {
      const pPos = Position[playerEid];
      if (!pPos) continue;
      const dx = pPos.x - pos.x;
      const dy = pPos.y - pos.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 34 * 34 && distSq > 1) {
        const dd = Math.sqrt(distSq);
        pos.x += (dx / dd) * 120 * dt;
        pos.y += (dy / dd) * 120 * dt;
      }
    }

    // Check pickup by player
    if (playerEid >= 0) {
      const pPos = Position[playerEid];
      if (!pPos) continue;
      const dx = pos.x - pPos.x;
      const dy = pos.y - pPos.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 11 * 11) {
        Taken[eid] = 1;
        // Collect drop via drop-handlers
        const dropKind = poolGet(StringPool.dropKinds, drop.kind) as DropKind;
        const handler = dropRegistry?.get(dropKind);
        if (handler) {
        handler.handle({
          player: { hp: playerDomain.hp, maxHp: playerDomain.maxHp },
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
