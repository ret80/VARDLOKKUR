/* boss-system.ts — система спавна боссов подземелий (ECS) */

import { query, addComponents, type World } from 'bitecs';
import {
  Position,
  MapState,
  BossSpawned,
  Enemy,
  EnemyState,
  Sprite,
} from '../ecs-components';
import { type EntityFactory } from '../entity-factory';
import { createBodyForEntity } from './physics-system';
import { Cat } from '../../physics/planck-world';
import type { EnemyKind } from '../../generators/types';
import { ENEMY_STATS } from '../../entities';
import { audio } from '../../audio';
import { logger } from '../../debug/logger';

// ============================================================
// Конфигурация
// ============================================================

/** Маппинг dungeonId → boss kind (соответствует DUNGEONS в dungeons.ts) */
const DUNGEON_BOSS_MAP: Record<number, EnemyKind> = {
  0: 'reaper',
  1: 'spider',
  2: 'giant',
};

// ============================================================
// Спавн босса
// ============================================================

/**
 * Спавнить босса подземелья.
 * Вызывается из BossSpawnSystem когда игрок входит в комнату босса.
 */
export function spawnDungeonBoss(
  world: World,
  entityFactory: EntityFactory,
  planckWorld: any,
  spriteFactory: { create: (x: number, y: number) => number },
  dungeonId: number,
  bossSpotX: number,
  bossSpotY: number,
  dungeonName: string,
  onToast: (msg: string) => void,
  onHudDirty: () => void
): void {
  const bossKind = DUNGEON_BOSS_MAP[dungeonId];
  if (!bossKind) {
    logger.warn('boss-system', `No boss for dungeonId=${dungeonId}`);
    return;
  }

  const stats = ENEMY_STATS[bossKind];
  if (!stats) {
    logger.warn('boss-system', `No stats for boss kind: ${bossKind}`);
    return;
  }

  // Создать спрайт
  const spriteRef = spriteFactory.create(bossSpotX, bossSpotY);

  // Создать ECS-сущность врага через фабрику
  const eid = entityFactory.createEnemy(bossKind, bossSpotX, bossSpotY, stats.hp, stats.r, stats.speed, stats.dmg);

  // Добавить Sprite компонент
  addComponents(world, eid, [Sprite]);
  Sprite[eid] = { ref: spriteRef };

  // Создать физическое тело
  createBodyForEntity(planckWorld, world, eid, stats.r, Cat.Enemy, Cat.Enemy | Cat.Player | Cat.Projectile | Cat.Ground);

  // Установить состояние "enter" (анимация появления)
  Enemy[eid].state = EnemyState.enter;
  Enemy[eid].stateT = 1.0;
  if (dungeonId === 0) Enemy[eid].seed = 1; // reaper special

  // Добавить компонент BossSpawned на MapState (чтобы не спавнить повторно)
  for (const msEid of query(world, [MapState])) {
    addComponents(world, msEid, [BossSpawned]);
    break;
  }

  // Звуковые и визуальные эффекты
  audio.horn();
  onToast(`${dungeonName}: страж пробудился`);
  onHudDirty();

  logger.info('boss-system', `Boss spawned: kind=${bossKind} dungeonId=${dungeonId} eid=${eid} pos=(${bossSpotX},${bossSpotY})`);
}

// ============================================================
// Система проверки спавна босса
// ============================================================

/**
 * BossSpawnSystem — проверяет, вошёл ли игрок в комнату босса,
 * и спавнит босса если он ещё не спавнился.
 */
export function bossSpawnSystem(
  world: World,
  playerEid: number,
  entityFactory: EntityFactory,
  planckWorld: any,
  spriteFactory: { create: (x: number, y: number) => number },
  map: {
    isDungeon: boolean;
    dungeonId: number;
    dungeonName: string;
    bossRoom: { x: number; y: number; w: number; h: number };
    bossSpot: { x: number; y: number };
    doors: Array<{ x: number; y: number }>;
  },
  dungeonBossDead: (id: number) => boolean,
  onToast: (msg: string) => void,
  onHudDirty: () => void
): void {
  if (playerEid < 0) return;
  if (!map.isDungeon) return;
  if (dungeonBossDead(map.dungeonId)) return;

  // Проверить: есть ли уже BossSpawned компонент на MapState
  let bossAlreadySpawned = false;
  for (const msEid of query(world, [MapState, BossSpawned])) {
    bossAlreadySpawned = true;
    break;
  }
  if (bossAlreadySpawned) return;

  // Проверить: игрок в комнате босса?
  const playerPos = Position[playerEid];
  if (!playerPos) return;

  const br = map.bossRoom;
  if (playerPos.x > br.x && playerPos.x < br.x + br.w &&
      playerPos.y > br.y && playerPos.y < br.y + br.h) {
    // Спавним босса!
    spawnDungeonBoss(
      world,
      entityFactory,
      planckWorld,
      spriteFactory,
      map.dungeonId,
      map.bossSpot.x,
      map.bossSpot.y,
      map.dungeonName,
      onToast,
      onHudDirty
    );
  }
}
