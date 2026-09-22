/* interaction-system.ts — система взаимодействия на основе ECS */

import { query, hasComponent, type World } from 'bitecs';
import { EventBus } from '../../event-bus';
import { GameStore } from '../../store';
import { audio } from '../../audio';
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
  Enemy,
  Health,
  poolGet,
  StringPool,
} from '../ecs-components';
import { dist2 } from '../../utils';
import { T, Tl, tileAt, solidTileAt } from '../../world';
import {
  InteractionHandlerRegistry,
  ChestItemHandlerRegistry,
  DungeonUnlockRegistry,
  createInteractionRegistry,
  createChestItemRegistry,
  createDungeonUnlockRegistry,
} from './interaction-handlers';

// ============================================================
// Конфигурация
// ============================================================

const INTERACTION_RANGE = 20;

/** Callback для спавна стража пьедестала */
export type GuardSpawnCallback = (kind: string, x: number, y: number, pedestalEid: number) => void;

// ============================================================
// Взаимодействие
// ============================================================

/** Проверить взаимодействие с ближайшим объектом */
export function tryInteract(
  world: World,
  playerEid: number,
  store: GameStore,
  bus: EventBus,
  onDialogue: (id: string) => void,
  onGuardSpawn?: GuardSpawnCallback,
  interactionRegistry?: InteractionHandlerRegistry,
  chestItemRegistry?: ChestItemHandlerRegistry,
  dungeonUnlockRegistry?: DungeonUnlockRegistry
): boolean {
  if (playerEid < 0 || !store.map) return false;

  const { x: px, y: py } = Position;
  const playerX = px[playerEid];
  const playerY = py[playerEid];

  const hit = findNearest(world, playerEid, store);
  if (!hit) return false;

  audio.uiClick();

  // Делегирование в Strategy Pattern registry
  const registry = interactionRegistry ?? createInteractionRegistry();
  const ctx: import('./interaction-handlers').InteractionContext = { 
    world, 
    store, 
    bus, 
    onDialogue, 
    onGuardSpawn,
    dungeonRegistry: dungeonUnlockRegistry,
    chestItemRegistry,
    playerX,
    playerY
  };

  return registry.interact(hit, ctx);
}

export interface InteractableHit {
  kind: string;
  eid: number;
  ref: any;
  x: number;
  y: number;
}

/** Найти ближайший интерактивный объект */
function findNearest(world: World, playerEid: number, store: GameStore): InteractableHit | null {
  const m = store.map!;
  const { x: px, y: py } = Position;
  const playerX = px[playerEid];
  const playerY = py[playerEid];

  let best: InteractableHit | null = null;
  let bd = INTERACTION_RANGE * INTERACTION_RANGE;

  const consider = (kind: string, eid: number, ref: any, x: number, y: number) => {
    const d2 = dist2(x, y, playerX, playerY);
    if (d2 < bd) {
      bd = d2;
      best = { kind, eid, ref, x, y };
    }
  };

  // NPCs
  for (const eid of query(world, [Position, NPC])) {
    consider('npc', eid, { id: poolGet(StringPool.npcIds, NPC.id[eid]), name: poolGet(StringPool.npcNames, NPC.name[eid]) }, px[eid], py[eid]);
  }

  // Chests (не открытые)
  for (const eid of query(world, [Position, Chest])) {
    if (!Chest.opened[eid]) {
      consider('chest', eid, { item: poolGet(StringPool.chestItems, Chest.item[eid]) }, px[eid], py[eid]);
    }
  }

  // Pedestals (не взятые)
  for (const eid of query(world, [Position, Pedestal])) {
    if (!Pedestal.taken[eid]) {
      consider('pedestal', eid, { id: poolGet(StringPool.pedestalIds, Pedestal.id[eid]), guardsLeft: Pedestal.guardsLeft[eid], guardsSpawned: !!Pedestal.guardsSpawned[eid] }, px[eid], py[eid]);
    }
  }

  // Shrines
  for (const eid of query(world, [Position, Shrine])) {
    consider('shrine', eid, { s: Shrine.lit[eid], i: eid }, px[eid], py[eid]);
  }

  // Altar (barrier) — если есть руны и змея не начата
  const f = store.flags;
  if (store.barrier && f.runes >= 5 && !f.snakeStarted) {
    const b = store.barrier;
    consider('altar', -1, b, b.x, b.y);
  }

  // Old Altar — если есть реликвия и ещё не искупился
  if (f.relic && !f.atoneDone && !m.isDungeon) {
    consider('oldAltar', -1, null, m.oldAltar.x * T + 8, m.oldAltar.y * T + 8);
  }

  // Stairs — проверка тайлов вокруг игрока
  const tx = Math.floor(playerX / T);
  const ty = Math.floor(playerY / T);
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (tileAt(m, tx + dx, ty + dy) === Tl.STAIRS) {
      consider('stairs', -1, null, (tx + dx) * T + 8, (ty + dy) * T + 8);
    }
  }

  return best;
}

/** Получить ближайший интерактивный объект (для рендеринга подсказки) */
export function getNearestInteractable(world: World, playerEid: number, store: GameStore): InteractableHit | null {
  return findNearest(world, playerEid, store);
}

// REPRO-ONLY debug snapshot of pedestal/guard state
(globalThis as any).__pedSnap = (world: World) => {
  const peds: any[] = [];
  for (const eid of query(world, [Position, Pedestal])) {
    peds.push({ eid, id: poolGet(StringPool.pedestalIds, Pedestal.id[eid]), guardsLeft: Pedestal.guardsLeft[eid], guardsSpawned: Pedestal.guardsSpawned[eid], taken: Pedestal.taken[eid] });
  }
  const guards: any[] = [];
  for (const eid of query(world, [Enemy])) {
    if (Enemy.guardPedestalEid[eid] > 0) guards.push({ eid, guardPedestalEid: Enemy.guardPedestalEid[eid], guardOf: Enemy.guardOf[eid] });
  }
  return { peds, guards };
};

/** Обработка убийства врага-стража */
export function onEnemyKilledEcs(world: World, enemyEid: number, store: GameStore, bus: EventBus): void {
  // Используем прямую ссылку на пьедестал, а не индекс (индекс ломается после clearWorld)
  const pdEid = Enemy.guardPedestalEid[enemyEid];
  if (pdEid <= 0) return;
  if (Pedestal.taken[pdEid] || Pedestal.guardsLeft[pdEid] <= 0) return;

  Pedestal.guardsLeft[pdEid] = Math.max(0, Pedestal.guardsLeft[pdEid] - 1);
  if (Pedestal.guardsLeft[pdEid] === 0) {
    bus.emit('toast', { msg: 'Печать пьедестала пала' });
    audio.chime();
  }
  bus.emit('pedestal:guardKilled', { pedestalIndex: 0 });
}
