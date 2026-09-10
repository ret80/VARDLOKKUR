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
import type { EnemyKind, DropKind, ProjectileKind } from '../generators/types';
import { PREFABS } from './ecs-systems/init-system';

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
  // Клонирование префабов
  // ============================================================

  /**
   * Список всех SoA-массивов компонентов в порядке объявления (для клонирования).
   * Этот массив должен синхронизироваться с ecs-components.ts.
   */
  private static readonly COMPONENT_ARRAYS = [
    // Position
    'Position.x', 'Position.y',
    // Velocity
    'Velocity.x', 'Velocity.y',
    // Health
    'Health.current', 'Health.max',
    // Radius
    'Radius.value',
    // Time
    'Time.value',
    // Direction
    'Direction.x', 'Direction.y',
    // RenderLayer
    'RenderLayer.value',
    // Player
    'Player.moving', 'Player.animT', 'Player.swingT', 'Player.hurtT', 'Player.slowT',
    'Player.hasSword', 'Player.runes', 'Player.swingDirX', 'Player.swingDirY',
    'Player.aiming', 'Player.maxHp',
    // Enemy
    'Enemy.kind', 'Enemy.radius', 'Enemy.facingX', 'Enemy.facingY', 'Enemy.t',
    'Enemy.state', 'Enemy.aggro', 'Enemy.hidden', 'Enemy.lungeT', 'Enemy.freezeT',
    'Enemy.flashT', 'Enemy.seed', 'Enemy.speed', 'Enemy.dmg', 'Enemy.stateT',
    'Enemy.pathI', 'Enemy.repathT', 'Enemy.contactCd', 'Enemy.guardOf', 'Enemy.fade',
    'Enemy.dropDew', 'Enemy.leashX', 'Enemy.leashY', 'Enemy.fogOnly', 'Enemy.nearLitShrine',
    // Projectile
    'Projectile.kind', 'Projectile.dmg', 'Projectile.life', 'Projectile.dist',
    'Projectile.returning', 'Projectile.spin',
    // Drop
    'Drop.kind', 'Drop.t', 'Drop.magnet', 'Drop.life',
    // NPC
    'NPC.id', 'NPC.name',
    // Chest
    'Chest.item', 'Chest.opened',
    // Pedestal
    'Pedestal.id', 'Pedestal.taken', 'Pedestal.guardsLeft', 'Pedestal.guardsSpawned',
    // Shrine
    'Shrine.lit',
    // Door
    'Door.open', 'Door.locked',
    // Barrier
    'Barrier.active',
    // Altar
    'Altar.runes',
    // Dead
    'Dead',
    // EnemyAI
    'EnemyAI.path', 'EnemyAI.lightspeedT', 'EnemyAI.slowT', 'EnemyAI.freezeT',
    'EnemyAI.flashT', 'EnemyAI.lungeT', 'EnemyAI.repathT', 'EnemyAI.stateT',
    'EnemyAI.contactCd', 'EnemyAI.guardsSpawned',
    // Sprite
    'Sprite.ref',
    // PhysicsBody
    'PhysicsBody.body',
  ] as const;

  /**
   * Создать clone префаба на позиции (x, y).
   * Копирует все значения компонентов из prefabEid в новую сущность,
   * перезаписывая Position.x/y на новые координаты.
   */
  clonePrefab(prefabEid: number, x: number, y: number): number {
    const newEid = addEntity(this.world);

    // Копируем все Float32Array/Uint8Array/Int32Array/Uint32Array поля
    // Position.x
    (Position as any).x[newEid] = x;
    (Position as any).y[newEid] = y;

    // Остальные поля копируем из префаба
    const src = prefabEid;
    const dst = newEid;

    // Health
    (Health as any).current[dst] = (Health as any).current[src];
    (Health as any).max[dst] = (Health as any).max[src];

    // Radius
    (Radius as any).value[dst] = (Radius as any).value[src];

    // Time
    (Time as any).value[dst] = (Time as any).value[src];

    // Direction
    (Direction as any).x[dst] = (Direction as any).x[src];
    (Direction as any).y[dst] = (Direction as any).y[src];

    // RenderLayer
    (RenderLayer as any).value[dst] = (RenderLayer as any).value[src];

    // Velocity
    (Velocity as any).x[dst] = (Velocity as any).x[src];
    (Velocity as any).y[dst] = (Velocity as any).y[src];

    // Player fields
    (Player as any).moving[dst] = (Player as any).moving[src];
    (Player as any).animT[dst] = (Player as any).animT[src];
    (Player as any).swingT[dst] = (Player as any).swingT[src];
    (Player as any).hurtT[dst] = (Player as any).hurtT[src];
    (Player as any).slowT[dst] = (Player as any).slowT[src];
    (Player as any).hasSword[dst] = (Player as any).hasSword[src];
    (Player as any).runes[dst] = (Player as any).runes[src];
    (Player as any).swingDirX[dst] = (Player as any).swingDirX[src];
    (Player as any).swingDirY[dst] = (Player as any).swingDirY[src];
    (Player as any).aiming[dst] = (Player as any).aiming[src];
    (Player as any).maxHp[dst] = (Player as any).maxHp[src];

    // Enemy fields
    (Enemy as any).kind[dst] = (Enemy as any).kind[src];
    (Enemy as any).radius[dst] = (Enemy as any).radius[src];
    (Enemy as any).facingX[dst] = (Enemy as any).facingX[src];
    (Enemy as any).facingY[dst] = (Enemy as any).facingY[src];
    (Enemy as any).t[dst] = (Enemy as any).t[src];
    (Enemy as any).state[dst] = (Enemy as any).state[src];
    (Enemy as any).aggro[dst] = (Enemy as any).aggro[src];
    (Enemy as any).hidden[dst] = (Enemy as any).hidden[src];
    (Enemy as any).lungeT[dst] = (Enemy as any).lungeT[src];
    (Enemy as any).freezeT[dst] = (Enemy as any).freezeT[src];
    (Enemy as any).flashT[dst] = (Enemy as any).flashT[src];
    (Enemy as any).seed[dst] = (Enemy as any).seed[src];
    (Enemy as any).speed[dst] = (Enemy as any).speed[src];
    (Enemy as any).dmg[dst] = (Enemy as any).dmg[src];
    (Enemy as any).stateT[dst] = (Enemy as any).stateT[src];
    (Enemy as any).pathI[dst] = (Enemy as any).pathI[src];
    (Enemy as any).repathT[dst] = (Enemy as any).repathT[src];
    (Enemy as any).contactCd[dst] = (Enemy as any).contactCd[src];
    (Enemy as any).guardOf[dst] = (Enemy as any).guardOf[src];
    (Enemy as any).fade[dst] = (Enemy as any).fade[src];
    (Enemy as any).dropDew[dst] = (Enemy as any).dropDew[src];
    (Enemy as any).leashX[dst] = (Enemy as any).leashX[src];
    (Enemy as any).leashY[dst] = (Enemy as any).leashY[src];
    (Enemy as any).fogOnly[dst] = (Enemy as any).fogOnly[src];
    (Enemy as any).nearLitShrine[dst] = (Enemy as any).nearLitShrine[src];

    // Projectile fields
    (Projectile as any).kind[dst] = (Projectile as any).kind[src];
    (Projectile as any).dmg[dst] = (Projectile as any).dmg[src];
    (Projectile as any).life[dst] = (Projectile as any).life[src];
    (Projectile as any).dist[dst] = (Projectile as any).dist[src];
    (Projectile as any).returning[dst] = (Projectile as any).returning[src];
    (Projectile as any).spin[dst] = (Projectile as any).spin[src];

    // Drop fields
    (Drop as any).kind[dst] = (Drop as any).kind[src];
    (Drop as any).t[dst] = (Drop as any).t[src];
    (Drop as any).magnet[dst] = (Drop as any).magnet[src];
    (Drop as any).life[dst] = (Drop as any).life[src];

    // NPC fields
    (NPC as any).id[dst] = (NPC as any).id[src];
    (NPC as any).name[dst] = (NPC as any).name[src];

    // Chest fields
    (Chest as any).item[dst] = (Chest as any).item[src];
    (Chest as any).opened[dst] = (Chest as any).opened[src];

    // Pedestal fields
    (Pedestal as any).id[dst] = (Pedestal as any).id[src];
    (Pedestal as any).taken[dst] = (Pedestal as any).taken[src];
    (Pedestal as any).guardsLeft[dst] = (Pedestal as any).guardsLeft[src];
    (Pedestal as any).guardsSpawned[dst] = (Pedestal as any).guardsSpawned[src];

    // Shrine fields
    (Shrine as any).lit[dst] = (Shrine as any).lit[src];

    // Door fields
    (Door as any).open[dst] = (Door as any).open[src];
    (Door as any).locked[dst] = (Door as any).locked[src];

    // Barrier fields
    (Barrier as any).active[dst] = (Barrier as any).active[src];

    // Altar fields
    (Altar as any).runes[dst] = (Altar as any).runes[src];

    // Dead
    Dead[dst] = Dead[src];

    // EnemyAI fields
    (EnemyAI as any).path[dst] = (EnemyAI as any).path[src];
    (EnemyAI as any).lightspeedT[dst] = (EnemyAI as any).lightspeedT[src];
    (EnemyAI as any).slowT[dst] = (EnemyAI as any).slowT[src];
    (EnemyAI as any).freezeT[dst] = (EnemyAI as any).freezeT[src];
    (EnemyAI as any).flashT[dst] = (EnemyAI as any).flashT[src];
    (EnemyAI as any).lungeT[dst] = (EnemyAI as any).lungeT[src];
    (EnemyAI as any).repathT[dst] = (EnemyAI as any).repathT[src];
    (EnemyAI as any).stateT[dst] = (EnemyAI as any).stateT[src];
    (EnemyAI as any).contactCd[dst] = (EnemyAI as any).contactCd[src];
    (EnemyAI as any).guardsSpawned[dst] = (EnemyAI as any).guardsSpawned[src];

    // Sprite
    (Sprite as any).ref[dst] = (Sprite as any).ref[src];

    // PhysicsBody
    (PhysicsBody as any).body[dst] = (PhysicsBody as any).body[src];

    return newEid;
  }

  /**
   * Создать сущность из префаба врага.
   * Копирует префаб и перезаписывает позицию + случайные параметры.
   */
  cloneEnemyFromPrefab(kind: EnemyKind, x: number, y: number, hp: number, radius: number, speed: number, dmg: number): number {
    const prefabEid = PREFABS.enemy[kind];
    if (prefabEid === null || prefabEid === undefined) {
      // Fallback: создаём вручную если префаба нет
      return this.createEnemy(kind, x, y, hp, radius, speed, dmg);
    }

    const newEid = this.clonePrefab(prefabEid, x, y);

    // Перезаписываем переменные которые должны быть уникальны для каждой сущности
    Health.current[newEid] = hp;
    Health.max[newEid] = hp;
    Radius.value[newEid] = radius;
    Enemy.speed[newEid] = speed;
    Enemy.dmg[newEid] = dmg;
    Enemy.t[newEid] = Math.random() * 10;
    Enemy.seed[newEid] = Math.random() * 100;

    return newEid;
  }

  /**
   * Создать сущность из префаба снаряда.
   */
  cloneProjectileFromPrefab(
    kind: ProjectileKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    dmg: number,
    lifetime: number
  ): number {
    const prefabEid = PREFABS.projectile;
    if (prefabEid === null || prefabEid === undefined) {
      return this.createProjectile(kind, x, y, vx, vy, dmg, lifetime);
    }

    const newEid = this.clonePrefab(prefabEid, x, y);

    // Перезаписываем переменные
    Velocity.x[newEid] = vx;
    Velocity.y[newEid] = vy;
    Projectile.kind[newEid] = poolAdd(StringPool.projectileKinds, kind);
    Projectile.dmg[newEid] = dmg;
    Projectile.life[newEid] = lifetime;
    Projectile.dist[newEid] = 0;
    Projectile.returning[newEid] = 0;
    Projectile.spin[newEid] = 0;
    Radius.value[newEid] = kind === 'fire' ? 5 : 4;

    return newEid;
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

    const eid = this.cloneProjectileFromPrefab('axe', startX, startY, vx, vy, dmg, AXE_LIFETIME);
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

    const eid = this.cloneProjectileFromPrefab('arrow', startX, startY, vx, vy, 2, ARROW_LIFETIME);
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
    const eid = this.cloneEnemyFromPrefab(kind, x, y, stats.hp, stats.r, stats.speed, stats.dmg);
    onProjectileSpawn?.(eid);
    return eid;
  }

  // ============================================================
  // Создание призраков тумана
  // ============================================================

  /**
   * Создать призрака тумана (специальный тип врага).
   * Использует логику из spawnFogGhost (fog-system.ts).
   * @returns Entity ID
   */
  createFogGhost(x: number, y: number, hp: number = 5, speed: number = 100): number {
    const eid = addEntity(this.world);
    addComponents(this.world, eid, Position, Velocity, Health, Radius, Enemy, EnemyAI, Time, RenderLayer);

    // Position
    Position.x[eid] = x;
    Position.y[eid] = y;

    // Velocity
    Velocity.x[eid] = 0;
    Velocity.y[eid] = 0;

    // Health
    Health.current[eid] = hp;
    Health.max[eid] = hp;

    // Radius
    Radius.value[eid] = 6;
    RenderLayer.value[eid] = 50;

    // Time
    Time.value[eid] = 0;

    // Enemy fields (ghost-specific)
    Enemy.kind[eid] = poolAdd(StringPool.enemyKinds, 'ghost');
    Enemy.radius[eid] = 6;
    Enemy.facingX[eid] = 1;
    Enemy.facingY[eid] = 0;
    Enemy.t[eid] = 0;
    Enemy.state[eid] = EnemyState.appear;
    Enemy.aggro[eid] = 1;
    Enemy.hidden[eid] = 0;
    Enemy.lungeT[eid] = 0;
    Enemy.freezeT[eid] = 0;
    Enemy.flashT[eid] = 0;
    Enemy.seed[eid] = Math.random() * 100;
    Enemy.speed[eid] = speed;
    Enemy.dmg[eid] = 1;
    Enemy.stateT[eid] = 0;
    Enemy.pathI[eid] = 0;
    Enemy.repathT[eid] = 0.5;
    Enemy.contactCd[eid] = 0;
    Enemy.guardOf[eid] = -1;
    Enemy.fade[eid] = 0;
    Enemy.dropDew[eid] = 0;

    // EnemyAI
    EnemyAI.path[eid] = 0;

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
