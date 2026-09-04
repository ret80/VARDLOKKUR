/* world-system.ts — системы мира: двери, зоны, боссы */

import { query, hasComponent, type World } from 'bitecs';
import {
  Position,
  Radius,
  Door,
  Barrier,
  Player,
} from '../ecs-components';
import { dist2 } from '../../utils';
import { zoneFor, T, Tl } from '../../world';
import type { GameStore } from '../../store';
import type { EventBus } from '../../event-bus';

// ============================================================
// Двери
// ============================================================

/** Обновить двери */
export function updateDoors(
  world: World,
  playerEid: number,
  store: GameStore,
  flags: { hasKey: boolean },
  toast: (msg: string) => void,
  pushHud: (force?: boolean) => void
): void {
  if (playerEid < 0) return;

  const { x: px, y: py } = Position;

  for (const doorEid of query(world, [Position, Door])) {
    if (Door.locked[doorEid] && flags.hasKey && dist2(px[doorEid], py[doorEid], px[playerEid], py[playerEid]) < 24 * 24) {
      Door.locked[doorEid] = 0;
      flags.hasKey = false;
      Door.open[doorEid] = 0.01;
      toast("Ключ повернут — путь к стражу открыт");
      pushHud(true);
    }
    if (Door.open[doorEid] < 1 && Door.open[doorEid] > 0 && !Door.locked[doorEid]) {
      Door.open[doorEid] = Math.min(1, Door.open[doorEid] + 0.032); // ~2 секунды при 60fps
    }
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
  toast: (msg: string) => void
): void {
  if (playerEid < 0) return;

  const { x: px, y: py } = Position;
  const zn = zoneFor(map, Math.floor(px[playerEid] / T), Math.floor(py[playerEid] / T));
  if (zn !== store.zone) {
    if (store.zone !== "") toast(zn);
    store.setZone(zn);
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

  const { x: px, y: py } = Position;

  if (map.isDungeon && !dungeonBossDead(map.dungeonId)) {
    const br = map.bossRoom;
    if (px[playerEid] > br.x && px[playerEid] < br.x + br.w &&
        py[playerEid] > br.y && py[playerEid] < br.y + br.h) {
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
    Barrier.active[barrierEid] = active ? 1 : 0;
  }
}
