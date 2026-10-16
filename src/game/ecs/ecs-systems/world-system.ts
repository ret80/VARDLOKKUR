/* world-system.ts — системы мира: двери, зоны, боссы */

import { query, hasComponent, type World } from 'bitecs';
import {
  Position,
  Radius,
  Door,
  PhysicsBody,
  Barrier,
  Player,
} from '../ecs-components';
import { dist2 } from '../../utils';
import { zoneFor, T, Tl } from '../../world';
import type { GameStore } from '../../store';
import type { EventBus } from '../../event-bus';
import type { PlanckWorld } from '../../physics/planck-world';
import { destroyBodyForEntity, createDoorBody } from './physics-system';

// ============================================================
// Двери
// ============================================================

/** Обновить двери */
export function updateDoors(
  world: World,
  playerEid: number,
  planckWorld: PlanckWorld,
  store: GameStore,
  flags: { hasKey: boolean },
  toast: (msg: string) => void,
  pushHud: (force?: boolean) => void
): void {
  if (playerEid < 0) return;

  for (const doorEid of query(world, [Position, Door])) {
    const doorPos = Position[doorEid];
    const playerPos = Position[playerEid];
    const door = Door[doorEid];

    // Разблокировка ключом — только если арена не запечатана.
    if (door.locked && !door.sealed && flags.hasKey &&
        dist2(doorPos.x, doorPos.y, playerPos.x, playerPos.y) < 24 * 24) {
      door.locked = 0;
      flags.hasKey = false;
      door.open = 0.01;
      toast("Ключ повернут — путь к стражу открыт");
      pushHud(true);
    }

    // Целевое состояние створки: заперта/запечатана — закрывается, иначе открывается.
    if (door.sealed || door.locked) {
      if (door.open > 0) door.open = Math.max(0, door.open - 0.08);
    } else if (door.open < 1) {
      door.open = Math.min(1, door.open + 0.032); // ~2 секунды при 60fps
    }

    // Коллизия есть, пока дверь должна быть закрыта: заперта/запечатана или
    // створка ещё не поднялась достаточно. Иначе — снимаем.
    const wantSolid = !!door.sealed || !!door.locked || door.open <= 0.5;
    const hasBody = hasComponent(world, doorEid, PhysicsBody) && PhysicsBody[doorEid].body > 0;
    if (wantSolid && !hasBody) {
      createDoorBody(planckWorld, world, doorEid);
    } else if (!wantSolid && hasBody) {
      destroyBodyForEntity(planckWorld, doorEid);
    }
  }
}

/**
 * Запечатать двери арены: запереть и закрыть. Вызывается, когда игрок
 * входит в комнату босса. Коллайдер восстанавливается в updateDoors.
 */
export function sealDoors(world: World): void {
  for (const doorEid of query(world, [Door])) {
    Door[doorEid].sealed = 1;
    Door[doorEid].locked = 1;
  }
}

/** Снять печать после смерти стража — двери вновь открываются. */
export function unsealDoors(world: World): void {
  for (const doorEid of query(world, [Door])) {
    Door[doorEid].sealed = 0;
    Door[doorEid].locked = 0;
  }
}

// ============================================================
// Зоны
// ============================================================

/** Обновить текущую зону */
export function updateZone(
  world: World,
  playerEid: number,
  map: any, // WorldData
  store: GameStore,
  toast: (msg: string) => void,
  pushHud: (force?: boolean) => void
): void {
  if (playerEid < 0) return;

  const playerPos = Position[playerEid];
  const zn = zoneFor(map, Math.floor(playerPos.x / T), Math.floor(playerPos.y / T));
  if (zn !== store.zone) {
    if (store.zone !== "") toast(zn);
    store.setZone(zn);
    pushHud(true);
  }
}

// ============================================================
// Боссы подземелий
// ============================================================

/** Проверить появление босса */
export function checkDungeonBoss(
  world: World,
  playerEid: number,
  map: { isDungeon: boolean; dungeonId: number; bossRoom: { x: number; y: number; w: number; h: number } },
  dungeonBossDead: (id: number) => boolean,
  bus: EventBus
): void {
  if (playerEid < 0) return;

  if (map.isDungeon && !dungeonBossDead(map.dungeonId)) {
    const playerPos = Position[playerEid];
    const br = map.bossRoom;
    if (playerPos.x > br.x && playerPos.x < br.x + br.w &&
        playerPos.y > br.y && playerPos.y < br.y + br.h) {
      bus.emit("boss:start-dungeon", {});
    }
  }
}

// ============================================================
// Барьеры
// ============================================================

/** Обновить барьеры */
export function updateBarriers(
  world: World,
  flags: { runes: number; snakeStarted: boolean }
): void {
  for (const barrierEid of query(world, [Position, Barrier])) {
    // Барьер активируется/деактивируется в зависимости от рун
    const active = flags.runes < 5 && !flags.snakeStarted;
    Barrier[barrierEid].active = active ? 1 : 0;
  }
}
