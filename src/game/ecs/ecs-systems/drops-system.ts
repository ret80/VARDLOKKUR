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
  Drop[eid] = { kind, t: 0, magnet };
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

    // Remove old drops
    if (d.life && t[eid] > d.life) {
      removeEntity(world, eid);
      continue;
    }

    // Check pickup by player
    if (playerEid >= 0) {
      const dx = px[eid] - px[playerEid];
      const dy = py[eid] - py[playerEid];
      const distSq = dx * dx + dy * dy;
      const minDist = (r[eid] + 5) ** 2;

      if (distSq < minDist) {
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

/** Спавн дропа со смерти врага */
export function spawnDropFromEnemy(
  world: World,
  enemyKind: string,
  x: number,
  y: number,
  rng: number
): void {
  // Determine drop type based on enemy kind and RNG
  let kind: DropKind | null = null;

  switch (enemyKind) {
    case 'draugr':
      kind = rng < 0.3 ? 'heart' : rng < 0.5 ? 'bones' : null;
      break;
    case 'varg':
      kind = rng < 0.2 ? 'heart' : rng < 0.4 ? 'dew' : null;
      break;
    case 'raven':
      kind = rng < 0.3 ? 'arrows' : null;
      break;
    case 'shroom':
      kind = rng < 0.4 ? 'ore' : null;
      break;
    case 'ghost':
      kind = rng < 0.2 ? 'soul' : rng < 0.4 ? 'dew' : null;
      break;
    case 'frost':
      kind = rng < 0.3 ? 'heart' : null;
      break;
  }

  if (kind) {
    spawnDrop(world, kind, x, y, false);
  }
}
