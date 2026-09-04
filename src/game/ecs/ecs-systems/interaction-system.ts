/* interaction-system.ts — система взаимодействия на основе ECS */

import { query, hasComponent, type World } from 'bitecs';
import {
  Position,
  Radius,
  NPC,
  Chest,
  Pedestal,
  Shrine,
  Door,
  Barrier,
  Altar,
  Taken,
  Dead,
  Player,
} from '../ecs-components';
import { dist2 } from '../../utils';

// ============================================================
// Конфигурация
// ============================================================

const INTERACTION_RANGE = 20;

// ============================================================
// Взаимодействие
// ============================================================

/** Проверить взаимодействие с ближайшим объектом */
export function tryInteract(
  world: World,
  playerEid: number,
  onInteract: (type: string, eid: number) => boolean
): boolean {
  if (playerEid < 0) return false;

  const { x: px, y: py } = Position;
  const { value: r } = Radius;

  const playerX = px[playerEid];
  const playerY = py[playerEid];

  // Check NPCs
  for (const eid of query(world, [Position, NPC])) {
    const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
    if (dist < INTERACTION_RANGE) {
      return onInteract('npc', eid);
    }
  }

  // Check Chests
  for (const eid of query(world, [Position, Chest])) {
    const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
    if (dist < INTERACTION_RANGE && !Chest[eid]?.opened) {
      return onInteract('chest', eid);
    }
  }

  // Check Shrines
  for (const eid of query(world, [Position, Shrine])) {
    const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
    if (dist < INTERACTION_RANGE) {
      return onInteract('shrine', eid);
    }
  }

  // Check Doors
  for (const eid of query(world, [Position, Door])) {
    const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
    if (dist < INTERACTION_RANGE) {
      return onInteract('door', eid);
    }
  }

  // Check Pedestals
  for (const eid of query(world, [Position, Pedestal])) {
    const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
    if (dist < INTERACTION_RANGE && !Pedestal[eid]?.taken) {
      return onInteract('pedestal', eid);
    }
  }

  return false;
}

/** Открыть сундук */
export function openChest(world: World, chestEid: number): void {
  if (!hasComponent(world, chestEid, Chest)) return;
  Chest[chestEid].opened = true;
}

/** Зажечь святилище */
export function lightShrine(world: World, shrineEid: number): void {
  if (!hasComponent(world, shrineEid, Shrine)) return;
  Shrine[shrineEid].lit = true;
}

/** Открыть дверь */
export function openDoor(world: World, doorEid: number, hasKey: boolean): boolean {
  if (!hasComponent(world, doorEid, Door)) return false;
  const d = Door[doorEid];
  if (d.locked && !hasKey) return false;
  d.locked = false;
  d.open = Math.min(1, d.open + 0.01);
  return true;
}

/** Взять предмет с пьедестала */
export function takeFromPedestal(world: World, pedestalEid: number): void {
  if (!hasComponent(world, pedestalEid, Pedestal)) return;
  Pedestal[pedestalEid].taken = true;
}
