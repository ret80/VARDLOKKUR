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
} from '../ecs-components';
import type { DropKind } from '../../generators/types';

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
  Drop[eid] = { kind, t: Math.random() * 5, magnet, life };
  Time.value[eid] = 0;
  RenderLayer.value[eid] = 40;
  Magnet[eid] = magnet;

  return eid;
}

// ============================================================
// Обновление дропов
// ============================================================

/** Обновить все дропы */
export function dropsUpdateSystem(
  world: World,
  playerEid: number,
  dt: number,
  onDropCollected: (eid: number, kind: string) => void
): void {
  const { x: px, y: py } = Position;
  const { value: r } = Radius;
  const t = Time.value;

  for (const eid of query(world, [Position, Drop, Time])) {
    const d = Drop[eid];
    if (!d || Taken[eid]) continue;

    t[eid] += dt;

    // Remove old drops with alpha blink
    if (d.life !== undefined) {
      d.life -= dt;
      if (d.life <= 0) {
        removeEntity(world, eid);
        continue;
      }
      if (d.life < 5) {
        // Alpha blink handled in render system
      }
    }

    // Magnet pull to player
    if (d.magnet && playerEid >= 0) {
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
        Taken[eid] = true;
        onDropCollected(eid, d.kind);
        removeEntity(world, eid);
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
