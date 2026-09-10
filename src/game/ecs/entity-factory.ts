/* entity-factory.ts — фабрика ECS-сущностей (чистая логика, без графики и физики) */

import { addEntity, addComponents, type World } from 'bitecs';
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
} from './ecs-components';
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';

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
  constructor(private world: World) {}

  /** Получить world (для обратных вызовов и других систем) */
  getWorld(): World {
    return this.world;
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
    const eid = addEntity(this.world);
    addComponents(this.world, eid, Position, Velocity, Projectile, Time, RenderLayer, Radius);

    Position.x[eid] = x;
    Position.y[eid] = y;
    Velocity.x[eid] = vx;
    Velocity.y[eid] = vy;
    Projectile.kind[eid] = poolAdd(StringPool.projectileKinds, kind);
    Projectile.dmg[eid] = dmg;
    Projectile.life[eid] = lifetime;
    Projectile.dist[eid] = 0;
    Projectile.returning[eid] = 0;
    Projectile.spin[eid] = 0;
    Time.value[eid] = 0;
    RenderLayer.value[eid] = 60;
    Radius.value[eid] = kind === 'fire' ? 5 : 4;

    return eid;
  }

  /**
   * Создать секиру (бумеранг), летящую от игрока.
   */
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

  /**
   * Создать врага.
   * Использует логику из createEnemyEntity (ecs-utils.ts).
   * @returns Entity ID
   */
  createEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    hp: number,
    radius: number,
    speed: number,
    dmg: number
  ): number {
    const eid = addEntity(this.world);
    addComponents(this.world, eid, Position, Health, Radius, RenderLayer, Enemy, Velocity, EnemyAI, Direction);

    // Position
    Position.x[eid] = x;
    Position.y[eid] = y;

    // Health
    Health.current[eid] = hp;
    Health.max[eid] = hp;

    // Radius
    Radius.value[eid] = radius;
    RenderLayer.value[eid] = 50;

    // Velocity
    Velocity.x[eid] = 0;
    Velocity.y[eid] = 0;

    // Direction
    Direction.x[eid] = 1;
    Direction.y[eid] = 0;

    // Enemy fields
    Enemy.kind[eid] = poolAdd(StringPool.enemyKinds, kind);
    Enemy.radius[eid] = radius;
    Enemy.facingX[eid] = 1;
    Enemy.facingY[eid] = 0;
    Enemy.t[eid] = Math.random() * 10;
    Enemy.state[eid] = EnemyState.idle;
    Enemy.aggro[eid] = 0;
    Enemy.hidden[eid] = kind === 'crawler' ? 1 : 0;
    Enemy.lungeT[eid] = 0;
    Enemy.freezeT[eid] = 0;
    Enemy.flashT[eid] = 0;
    Enemy.seed[eid] = Math.random() * 100;
    Enemy.speed[eid] = speed;
    Enemy.dmg[eid] = dmg;
    Enemy.stateT[eid] = 0;
    Enemy.pathI[eid] = 0;
    Enemy.repathT[eid] = 0.5;
    Enemy.contactCd[eid] = 0;
    Enemy.guardOf[eid] = -1;
    Enemy.fade[eid] = 1;
    Enemy.dropDew[eid] = 0;

    // EnemyAI fields
    EnemyAI.path[eid] = 0;

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
  // Создание дропов
  // ============================================================

  /**
   * Создать дроп (предмет, выпающий со смерти врага или из мира).
   * Использует логику из createDropEntity (ecs-utils.ts) и spawnDrop (drops-system.ts).
   * @returns Entity ID
   */
  createDrop(
    kind: DropKind,
    x: number,
    y: number,
    magnet: boolean = false,
    life: number = 0
  ): number {
    const eid = addEntity(this.world);
    addComponents(this.world, eid, Position, Radius, Drop, Time, RenderLayer);

    Position.x[eid] = x;
    Position.y[eid] = y;
    Radius.value[eid] = 3;
    Drop.kind[eid] = poolAdd(StringPool.dropKinds, kind);
    Drop.t[eid] = Math.random() * 5;
    Drop.magnet[eid] = magnet ? 1 : 0;
    Drop.life[eid] = life;
    Time.value[eid] = 0;
    RenderLayer.value[eid] = 40;

    return eid;
  }

  // ============================================================
  // Создание игрока
  // ============================================================

  /**
   * Создать сущность игрока.
   * Использует логику из createPlayerEntity (ecs-utils.ts).
   * @returns Entity ID
   */
  createPlayer(x: number, y: number): number {
    const eid = addEntity(this.world);
    addComponents(this.world, eid, Position, Health, Radius, RenderLayer, Player, Direction, Velocity);

    // Health (12 HP)
    Health.current[eid] = 12;
    Health.max[eid] = 12;

    // Position
    Position.x[eid] = x;
    Position.y[eid] = y;

    // Radius
    Radius.value[eid] = 10;
    RenderLayer.value[eid] = 100;

    // Direction
    Direction.x[eid] = 0;
    Direction.y[eid] = 1;

    // Velocity
    Velocity.x[eid] = 0;
    Velocity.y[eid] = 0;

    // Player fields
    Player.moving[eid] = 0;
    Player.animT[eid] = 0;
    Player.swingT[eid] = 0;
    Player.hurtT[eid] = 0;
    Player.slowT[eid] = 0;
    Player.hasSword[eid] = 0;
    Player.runes[eid] = 0;
    Player.swingDirX[eid] = 0;
    Player.swingDirY[eid] = 1;
    Player.aiming[eid] = 0;

    // Гарантируем что Dead=0 — важно после респавна
    Dead[eid] = 0;

    return eid;
  }

  // ============================================================
  // Создание статических объектов
  // ============================================================

  /**
   * Создать базовую сущность (для статических объектов: сундуки, пьедесталы, святилища и т.д.).
   */
  createStaticEntity(layer: number = 0): number {
    const eid = addEntity(this.world);
    addComponents(this.world, eid, Position, Radius, RenderLayer);

    Position.x[eid] = 0;
    Position.y[eid] = 0;
    Radius.value[eid] = 5;
    RenderLayer.value[eid] = layer;

    return eid;
  }

  /**
   * Создать сущность с движением (Position, Velocity, Radius).
   */
  createMovableEntity(layer: number = 0): number {
    const eid = this.createStaticEntity(layer);
    addComponents(this.world, eid, Velocity);
    Velocity.x[eid] = 0;
    Velocity.y[eid] = 0;
    return eid;
  }

  /**
   * Создать живую сущность (с Health).
   */
  createLivingEntity(hp: number, layer: number = 0): number {
    const eid = this.createStaticEntity(layer);
    addComponents(this.world, eid, Health);
    Health.current[eid] = hp;
    Health.max[eid] = hp;
    return eid;
  }
}

// ============================================================
// Фабричная функция и экспорт синглтона
// ============================================================

/** Создать экземпляр EntityFactory */
export function createEntityFactory(world: World): EntityFactory {
  return new EntityFactory(world);
}
