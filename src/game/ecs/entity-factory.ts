/* entity-factory.ts — фабрика ECS-сущностей (чистая логика, без графики и физики) */

import { addEntity, addComponent, addComponents, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Time,
  Direction,
  RenderLayer,
  Player,
  Enemy,
  Projectile,
  Drop,
  EnemyAI,
  EnemyState,
  Dead,
  poolAdd,
  StringPool,
  NPC,
  Chest,
  Pedestal,
  Shrine,
  Door,
  Barrier,
  Altar,
  Sprite,
  PhysicsBody,
} from './ecs-components';
import { logger } from '../debug/logger';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import { ENEMY_STATS } from '../entities';
import { EnemyAIRegistry } from './ecs-components';

// ============================================================
// Конфигурация оружия
// ============================================================

const AXE_SPEED = 200;
const AXE_LIFETIME = 6;
const ARROW_SPEED = 260;
const ARROW_LIFETIME = 2.2;

// ============================================================
// EntityFactory — центральный класс создания ECS-сущностей
// ============================================================

/** Интерфейс статистики врага (минимальный набор) */
export interface EnemyStats {
  hp: number;
  r: number;
  speed: number;
  dmg: number;
}

export class EntityFactory {
  /** Игровой мир — сюда создаются сущности для текущей карты */
  private gameWorld: World;

  constructor(gameWorld: World) {
    this.gameWorld = gameWorld;
  }

  /** Получить игровой world (для обратных вызовов и других систем) */
  getWorld(): World {
    return this.gameWorld;
  }



  // ============================================================
  // Создание снарядов
  // ============================================================

  /**
   * Создать снаряд (секира, стрела, спора, огонь).
   * Использует логику из fireProjectileEcs (combat-system.ts) и createProjectileEntity (ecs-utils.ts).
   * @returns Entity ID
   */
  createProjectile(
    kind: ProjectileKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    dmg: number,
    lifetime: number
  ): number {
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, [Position, Velocity, Projectile, Time, RenderLayer, Radius]);

    Position[eid] = { x, y };
    Velocity[eid] = { x: vx, y: vy };
    Projectile[eid] = { kind: poolAdd(StringPool.projectileKinds, kind), dmg, life: lifetime, dist: 0, returning: 0, spin: 0 };
    Time[eid] = { value: 0 };
    RenderLayer[eid] = { value: 60 };
    Radius[eid] = { value: kind === 'fire' ? 5 : 4 };

    return eid;
  }

  createAxe(
    playerX: number,
    playerY: number,
    dirAngle: number,
    dmg: number,
    onProjectileSpawn?: (eid: number) => void
  ): number {
    const startX = playerX + Math.cos(dirAngle) * 8;
    const startY = playerY - 2 + Math.sin(dirAngle) * 8;
    const vx = Math.cos(dirAngle) * AXE_SPEED;
    const vy = Math.sin(dirAngle) * AXE_SPEED;

    const eid = this.createProjectile('axe', startX, startY, vx, vy, dmg, AXE_LIFETIME);
    onProjectileSpawn?.(eid);
    return eid;
  }

  /**
   * Создать стрелу, летящую от игрока.
   */
  createArrow(
    playerX: number,
    playerY: number,
    dirAngle: number,
    onProjectileSpawn?: (eid: number) => void
  ): number {
    const startX = playerX + Math.cos(dirAngle) * 8;
    const startY = playerY - 2 + Math.sin(dirAngle) * 8;
    const vx = Math.cos(dirAngle) * ARROW_SPEED;
    const vy = Math.sin(dirAngle) * ARROW_SPEED;

    const eid = this.createProjectile('arrow', startX, startY, vx, vy, 2, ARROW_LIFETIME);
    onProjectileSpawn?.(eid);
    return eid;
  }

  // ============================================================
  // Создание врагов
  // ============================================================

  createEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    hp: number,
    radius: number,
    speed: number,
    dmg: number
  ): number {
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, [Position, Health, Radius, RenderLayer, Enemy, Velocity, EnemyAI, Direction, Time, Sprite]);

    Position[eid] = { x, y };
    Health[eid] = { current: hp, max: hp };
    Radius[eid] = { value: radius };
    RenderLayer[eid] = { value: 50 };
    Velocity[eid] = { x: 0, y: 0 };
    Direction[eid] = { x: 1, y: 0 };
    Enemy[eid] = {
      kind: poolAdd(StringPool.enemyKinds, kind),
      radius,
      facingX: 1, facingY: 0,
      t: Math.random() * 10,
      state: EnemyState.idle,
      aggro: 0, hidden: kind === 'crawler' ? 1 : 0,
      lungeT: 0, freezeT: 0, flashT: 0, seed: Math.random() * 100,
      speed, dmg,
      stateT: 0, pathI: 0, repathT: 0.5,
      contactCd: 0, guardOf: -1,
      fade: 1, dropDew: 0,
      leashX: 0, leashY: 0, fogOnly: 0, nearLitShrine: 0,
      guardPedestalEid: 0,
    };
    logger.debug('entity-factory', `createEnemy: eid=${eid} kind=${kind} Enemy[eid]=${!!Enemy[eid]}`);
    EnemyAI[eid] = {
      path: 0, lightspeedT: 0, slowT: 0, freezeT: 0, flashT: 0,
      lungeT: 0, repathT: 0.5, stateT: 0, contactCd: 0, guardsSpawned: 0,
    };
    Time[eid] = { value: 0 };
    Sprite[eid] = { ref: 0 };

    EnemyAIRegistry[eid] = null;

    return eid;
  }

  /**
   * Создать врага со статистикой из ENEMY_STATS.
   */
  createEnemyWithStats(
    kind: EnemyKind,
    x: number,
    y: number,
    stats: EnemyStats,
    onProjectileSpawn?: (eid: number) => void
  ): number {
    const eid = this.createEnemy(kind, x, y, stats.hp, stats.r, stats.speed, stats.dmg);
    onProjectileSpawn?.(eid);
    return eid;
  }

  // ============================================================
  // Создание призраков тумана
  // ============================================================

  createFogGhost(x: number, y: number, hp: number = 5, speed: number = 100): number {
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, [Position, Velocity, Health, Radius, Enemy, EnemyAI, Time, RenderLayer, Sprite]);

    Position[eid] = { x, y };
    Velocity[eid] = { x: 0, y: 0 };
    Health[eid] = { current: hp, max: hp };
    Radius[eid] = { value: 6 };
    RenderLayer[eid] = { value: 50 };
    Time[eid] = { value: 0 };
    Enemy[eid] = {
      kind: poolAdd(StringPool.enemyKinds, 'ghost'),
      radius: 6,
      facingX: 1, facingY: 0,
      t: 0,
      state: EnemyState.appear,
      aggro: 1, hidden: 0,
      lungeT: 0, freezeT: 0, flashT: 0, seed: Math.random() * 100,
      speed, dmg: 1,
      stateT: 0, pathI: 0, repathT: 0.5,
      contactCd: 0, guardOf: -1,
      fade: 0, dropDew: 0,
      leashX: 0, leashY: 0, fogOnly: 0, nearLitShrine: 0,
      guardPedestalEid: 0,
    };
    EnemyAI[eid] = {
      path: 0, lightspeedT: 0, slowT: 0, freezeT: 0, flashT: 0,
      lungeT: 0, repathT: 0.5, stateT: 0, contactCd: 0, guardsSpawned: 0,
    };
    Sprite[eid] = { ref: 0 };

    EnemyAIRegistry[eid] = null;

    return eid;
  }

  // ============================================================
  // Создание дропов
  // ============================================================

  createDrop(
    kind: DropKind,
    x: number,
    y: number,
    magnet: boolean = false,
    life: number = 0
  ): number {
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, [Position, Radius, Drop, Time, RenderLayer]);

    Position[eid] = { x, y };
    Radius[eid] = { value: 3 };
    Drop[eid] = { kind: poolAdd(StringPool.dropKinds, kind), t: Math.random() * 5, magnet: magnet ? 1 : 0, life };
    Time[eid] = { value: 0 };
    RenderLayer[eid] = { value: 40 };

    return eid;
  }

  // ============================================================
  // Создание игрока
  // ============================================================

  createPlayer(x: number, y: number): number {
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, [Position, Health, Radius, RenderLayer, Player, Direction, Velocity]);

    Health[eid] = { current: 12, max: 12 };
    Position[eid] = { x, y };
    Radius[eid] = { value: 10 };
    RenderLayer[eid] = { value: 100 };
    Direction[eid] = { x: 0, y: 1 };
    Velocity[eid] = { x: 0, y: 0 };
    Player[eid] = {
      moving: 0, animT: 0, swingT: 0, hurtT: 0, slowT: 0,
      hasSword: 0, runes: 0, swingDirX: 0, swingDirY: 1,
      aiming: 0, maxHp: 12,
    };

    return eid;
  }

  // ============================================================
  // Создание статических объектов
  // ============================================================

  createPedestal(id: string, x: number, y: number, guardsLeft: number): number {
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, [Position, Radius, Pedestal, RenderLayer]);

    Position[eid] = { x, y };
    Radius[eid] = { value: 6 };
    RenderLayer[eid] = { value: 10 };
    Pedestal[eid] = {
      id: poolAdd(StringPool.pedestalIds, id),
      taken: 0,
      guardsLeft,
      guardsSpawned: 0,
    };

    return eid;
  }

  /**
   * Создать базовую сущность (для статических объектов: сундуки, пьедесталы, святилища и т.д.).
   */
  createStaticEntity(layer: number = 0): number {
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, [Position, Radius, RenderLayer]);

    Position[eid] = { x: 0, y: 0 };
    Radius[eid] = { value: 5 };
    RenderLayer[eid] = { value: layer };

    return eid;
  }

  /**
   * Создать сущность с движением (Position, Velocity, Radius).
   */
  createMovableEntity(layer: number = 0): number {
    const eid = this.createStaticEntity(layer);
    addComponents(this.gameWorld, eid, [Velocity]);
    Velocity[eid] = { x: 0, y: 0 };
    return eid;
  }

  /**
   * Создать живую сущность (с Health).
   */
  createLivingEntity(hp: number, layer: number = 0): number {
    const eid = this.createStaticEntity(layer);
    addComponents(this.gameWorld, eid, [Health]);
    Health[eid] = { current: hp, max: hp };
    return eid;
  }
}

// ============================================================
// Фабричная функция и экспорт синглтона
// ============================================================

/** Создать экземпляр EntityFactory */
export function createEntityFactory(gameWorld: World): EntityFactory {
  return new EntityFactory(gameWorld);
}
