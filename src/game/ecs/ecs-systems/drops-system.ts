/* drops-system.ts — система дропов на основе ECS */

import { query, removeEntity, hasComponent, addComponent, type World } from 'bitecs';
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
import { swampTilesFor } from './fog-system';
import { logger } from '../../debug/logger';

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
  world: World,
  factory: EntityFactory,
  kind: DropKind,
  x: number,
  y: number,
  magnet: boolean = false,
  life?: number
): number {
  const eid = factory.createDrop(kind, x, y, magnet, life ?? 0);
  if (magnet) addComponent(world, eid, Magnet);
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
    if (hasComponent(world, eid, Taken)) continue;

    tm.value += dt;

    // Remove old drops with alpha blink
    if (drop.life !== 0) {
      drop.life -= dt;
      if (drop.life <= 0) {
        onDropRemove(eid);
        removeEntity(world, eid);
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
        addComponent(world, eid, Taken);
        // Collect drop via drop-handlers
        const dropKind = poolGet(StringPool.dropKinds, drop.kind) as DropKind;
        const handler = dropRegistry?.get(dropKind);
        if (handler) {
        const ok = handler.handle({
          player: { hp: playerDomain.hp, maxHp: playerDomain.maxHp },
          flags: store.flags,
          bus,
        });
        if (ok) bus.emit("drop:collected", { kind: dropKind, x: pos.x, y: pos.y });
        }
        onDropRemove(eid);
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
    // Алтарный призрак (leash) — рун не роняет, росу не роняет
    if (isGhostLeash) return;
    // Бродячий призрак: роса НЕ дропается — она разбросана по топям заранее
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
// Туманная Роса: статичные улучшения клинка в топях
// ============================================================

/** Всего росы в мире — 3 (каждая = одно улучшение клинка) */
export const DEW_TOTAL = 3;
const DEW_MIN_SEP = 240;        // минимальная дистанция между росами (px)
const DEW_ALTAR_KEEP_OUT = 180; // роса не лежит ближе этого к алтарю (px)

/**
 * Разбросать недостающую Туманную Росу по проходимым клеткам биома SWAMP.
 *
 * @param map          карта мира (нужен biomes/tiles/treeAltar)
 * @param alreadyPlaced роса, уже лежащая на карте (живые дропы из savedDrops)
 * @param alreadyTaken  уже собранная роса (flags.dew)
 * @param onDropSpawn   колбэк спавна (kind, x, y, life)
 */
export function scatterMistDew(
  map: any,
  alreadyPlaced: number,
  alreadyTaken: number,
  onDropSpawn: (kind: DropKind, x: number, y: number, life?: number) => void
): void {
  if (!map || map.isDungeon || !map.treeAltar) return;
  const missing = DEW_TOTAL - (alreadyPlaced + alreadyTaken);
  if (missing <= 0) return;

  const tiles = swampTilesFor(map);
  if (tiles.length === 0) {
    logger.warn('drop', 'scatterMistDew: в карте нет проходимых клеток болота');
    return;
  }

  const T0 = 16;
  const altarX = map.treeAltar.x * T0 + 8;
  const altarY = map.treeAltar.y * T0 + 8;
  const chosen: Array<{ x: number; y: number }> = [];

  for (let n = 0; n < missing; n++) {
    let pt: { x: number; y: number } | null = null;
    for (let tries = 0; tries < 80; tries++) {
      const i = tiles[Math.floor(Math.random() * tiles.length)];
      const cand = {
        x: (i % map.W) * T0 + 8,
        y: Math.floor(i / map.W) * T0 + 8,
      };
      const dAltar = Math.hypot(cand.x - altarX, cand.y - altarY);
      if (dAltar < DEW_ALTAR_KEEP_OUT) continue;
      let tooClose = false;
      for (const c of chosen) {
        if (Math.hypot(cand.x - c.x, cand.y - c.y) < DEW_MIN_SEP) { tooClose = true; break; }
      }
      if (tooClose) continue;
      pt = cand;
      break;
    }
    // Запасной вариант: первая подходящая клетка без требований к «свежести»
    if (!pt) {
      const i = tiles[Math.floor(Math.random() * tiles.length)];
      pt = { x: (i % map.W) * T0 + 8, y: Math.floor(i / map.W) * T0 + 8 };
    }
    chosen.push(pt);
    onDropSpawn('dew', pt.x, pt.y);
  }
  logger.debug('drop', `scatterMistDew: разбросано ${missing} Туманной Росы`);
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
