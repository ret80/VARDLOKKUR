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

/** Хранилище ID префабов в prefabWorld */
interface PrefabRegistry {
  player: number | null;
  enemy: Record<string, number>;
  projectile: number | null;
  drop: number | null;
  npc: number | null;
  chest: number | null;
  pedestal: number | null;
  shrine: number | null;
  door: number | null;
  barrier: number | null;
  altar: number | null;
}

/** Тип SoA-массива компонента */
type ArrayComponent = Int32Array | Uint32Array | Uint8Array | Float32Array;

/** Описание поля компонента для декларативного клонирования */
export interface CloneableField {
  /** Ссылка на объект-компонент (Record<string, ArrayComponent>) или скалярный массив (ArrayComponent) */
  comp: Record<string, ArrayComponent> | ArrayComponent;
  /** Имя поля внутри компонента; пустая строка для скалярных массивов (Dead) */
  field: string;
}

export class EntityFactory {
  /** Игровой мир — сюда создаются сущности для текущей карты */
  private gameWorld: World;
  /** Мир префабов — шаблоны, живёт вечно, не имеет графики/физики */
  private prefabWorld: World;
  /** Зарегистрированные префабы (eid в prefabWorld) */
  private prefabs: PrefabRegistry;

  constructor(gameWorld: World, prefabWorld: World) {
    this.gameWorld = gameWorld;
    this.prefabWorld = prefabWorld;
    this.prefabs = {
      player: null,
      enemy: {},
      projectile: null,
      drop: null,
      npc: null,
      chest: null,
      pedestal: null,
      shrine: null,
      door: null,
      barrier: null,
      altar: null,
    };
  }

  /** Получить игровой world (для обратных вызовов и других систем) */
  getWorld(): World {
    return this.gameWorld;
  }

  /** Получить world префабов */
  getPrefabWorld(): World {
    return this.prefabWorld;
  }

  // ============================================================
  // Инициализация префабов (вызывается ОДИН раз при старте)
  // ============================================================

  /** Инициализировать все префабы в prefabWorld */
  initPrefabs(): void {
    this.createPlayerPrefab();
    this.createEnemyPrefabs();
    this.createProjectilePrefabs();
    this.createDropPrefabs();
    this.createNPCPrefabs();
    this.createChestPrefabs();
    this.createPedestalPrefabs();
    this.createShrinePrefabs();
    this.createDoorPrefabs();
    this.createBarrierPrefabs();
    this.createAltarPrefabs();
  }

  /** Создать префаб игрока в prefabWorld */
  private createPlayerPrefab(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, Direction, Health, Player, RenderLayer);
    Position.x[eid] = 0;
    Position.y[eid] = 0;
    Radius.value[eid] = 5;
    Direction.x[eid] = 0;
    Direction.y[eid] = 1;
    Health.current[eid] = 12;
    Health.max[eid] = 12;
    RenderLayer.value[eid] = 100;
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
    this.prefabs.player = eid;
  }

  /** Создать префабы врагов в prefabWorld */
  private createEnemyPrefabs(): void {
    for (const kind of Object.keys(ENEMY_STATS) as EnemyKind[]) {
      // Призраки не создаются как префабы
      if (kind === 'ghost') continue;

      const stats = ENEMY_STATS[kind];
      const eid = addEntity(this.prefabWorld);
      addComponents(this.prefabWorld, eid, Position, Radius, Velocity, Health, Enemy, EnemyAI, Direction, RenderLayer);
      Position.x[eid] = 0;
      Position.y[eid] = 0;
      Radius.value[eid] = stats.r;
      Velocity.x[eid] = 0;
      Velocity.y[eid] = 0;
      Health.current[eid] = stats.hp;
      Health.max[eid] = stats.hp;
      RenderLayer.value[eid] = 50;
      Enemy.kind[eid] = poolAdd(StringPool.enemyKinds, kind);
      Enemy.radius[eid] = stats.r;
      Enemy.facingX[eid] = 1;
      Enemy.facingY[eid] = 0;
      Direction.x[eid] = 1;
      Direction.y[eid] = 0;
      Enemy.t[eid] = 0;
      Enemy.state[eid] = EnemyState.idle;
      Enemy.aggro[eid] = 0;
      Enemy.hidden[eid] = kind === 'crawler' ? 1 : 0;
      Enemy.lungeT[eid] = 0;
      Enemy.freezeT[eid] = 0;
      Enemy.flashT[eid] = 0;
      Enemy.seed[eid] = 0;
      Enemy.speed[eid] = stats.speed;
      Enemy.dmg[eid] = stats.dmg;
      Enemy.stateT[eid] = 0;
      Enemy.pathI[eid] = 0;
      Enemy.repathT[eid] = 0.5;
      Enemy.contactCd[eid] = 0;
      Enemy.guardOf[eid] = -1;
      Enemy.fade[eid] = 1;
      Enemy.dropDew[eid] = 0;
      EnemyAI.path[eid] = 0;
      EnemyAIRegistry[eid] = null;
      this.prefabs.enemy[kind] = eid;
    }
  }

  /** Создать префаб снаряда в prefabWorld */
  private createProjectilePrefabs(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, Velocity, Projectile, Time, RenderLayer);
    Radius.value[eid] = 3;
    Velocity.x[eid] = 0;
    Velocity.y[eid] = 0;
    Time.value[eid] = 0;
    RenderLayer.value[eid] = 60;
    Projectile.kind[eid] = poolAdd(StringPool.projectileKinds, 'arrow');
    Projectile.dmg[eid] = 1;
    Projectile.life[eid] = 3;
    Projectile.dist[eid] = 0;
    Projectile.returning[eid] = 0;
    Projectile.spin[eid] = 0;
    this.prefabs.projectile = eid;
  }

  /** Создать префаб дропа в prefabWorld */
  private createDropPrefabs(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, Drop, Time, RenderLayer);
    Radius.value[eid] = 3;
    Time.value[eid] = 0;
    RenderLayer.value[eid] = 40;
    Drop.kind[eid] = poolAdd(StringPool.dropKinds, 'heart');
    Drop.t[eid] = 0;
    Drop.magnet[eid] = 0;
    Drop.life[eid] = 0;
    this.prefabs.drop = eid;
  }

  /** Создать префаб NPC в prefabWorld */
  private createNPCPrefabs(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, NPC, RenderLayer);
    Radius.value[eid] = 5;
    RenderLayer.value[eid] = 30;
    NPC.id[eid] = poolAdd(StringPool.npcIds, 'default');
    NPC.name[eid] = poolAdd(StringPool.npcNames, '');
    this.prefabs.npc = eid;
  }

  /** Создать префаб сундука в prefabWorld */
  private createChestPrefabs(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, Chest, RenderLayer);
    Radius.value[eid] = 6;
    RenderLayer.value[eid] = 20;
    Chest.item[eid] = poolAdd(StringPool.chestItems, 'arrows');
    Chest.opened[eid] = 0;
    this.prefabs.chest = eid;
  }

  /** Создать префаб пьедестала в prefabWorld */
  private createPedestalPrefabs(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, Pedestal, RenderLayer);
    Radius.value[eid] = 6;
    RenderLayer.value[eid] = 10;
    Pedestal.id[eid] = poolAdd(StringPool.pedestalIds, 'default');
    Pedestal.taken[eid] = 0;
    Pedestal.guardsLeft[eid] = 3;
    Pedestal.guardsSpawned[eid] = 0;
    this.prefabs.pedestal = eid;
  }

  /** Создать префаб святилища в prefabWorld */
  private createShrinePrefabs(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, Shrine, RenderLayer);
    Radius.value[eid] = 6;
    RenderLayer.value[eid] = 10;
    Shrine.lit[eid] = 0;
    this.prefabs.shrine = eid;
  }

  /** Создать префаб двери в prefabWorld */
  private createDoorPrefabs(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, Door, RenderLayer);
    Radius.value[eid] = 6;
    RenderLayer.value[eid] = 15;
    Door.open[eid] = 0;
    Door.locked[eid] = 0;
    this.prefabs.door = eid;
  }

  /** Создать префаб барьера в prefabWorld */
  private createBarrierPrefabs(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, Barrier, RenderLayer);
    Radius.value[eid] = 8;
    RenderLayer.value[eid] = 10;
    Barrier.active[eid] = 1;
    this.prefabs.barrier = eid;
  }

  /** Создать префаб алтаря в prefabWorld */
  private createAltarPrefabs(): void {
    const eid = addEntity(this.prefabWorld);
    addComponents(this.prefabWorld, eid, Position, Radius, Altar, RenderLayer);
    Radius.value[eid] = 8;
    RenderLayer.value[eid] = 10;
    Altar.runes[eid] = 0;
    this.prefabs.altar = eid;
  }

  // ============================================================
  // Клонирование префабов
  // ============================================================

  /**
   * Декларативный список всех SoA-полей, которые безопасно клонировать.
   * Sprite.ref и PhysicsBody.body НАМЕРЕННО исключены — они создаются в ecs-bridge.ts.
   * При добавлении нового компонента нужно добавить его поля сюда.
   */
  private static readonly CLONEABLE_FIELDS: CloneableField[] = [
    // Position
    { comp: Position, field: 'x' },
    { comp: Position, field: 'y' },
    // Velocity
    { comp: Velocity, field: 'x' },
    { comp: Velocity, field: 'y' },
    // Health
    { comp: Health, field: 'current' },
    { comp: Health, field: 'max' },
    // Radius
    { comp: Radius, field: 'value' },
    // Time
    { comp: Time, field: 'value' },
    // Direction
    { comp: Direction, field: 'x' },
    { comp: Direction, field: 'y' },
    // RenderLayer
    { comp: RenderLayer, field: 'value' },
    // Player
    { comp: Player, field: 'moving' },
    { comp: Player, field: 'animT' },
    { comp: Player, field: 'swingT' },
    { comp: Player, field: 'hurtT' },
    { comp: Player, field: 'slowT' },
    { comp: Player, field: 'hasSword' },
    { comp: Player, field: 'runes' },
    { comp: Player, field: 'swingDirX' },
    { comp: Player, field: 'swingDirY' },
    { comp: Player, field: 'aiming' },
    { comp: Player, field: 'maxHp' },
    // Enemy — все поля, включая leashX/leashY (Float32Array)
    { comp: Enemy, field: 'kind' },
    { comp: Enemy, field: 'radius' },
    { comp: Enemy, field: 'facingX' },
    { comp: Enemy, field: 'facingY' },
    { comp: Enemy, field: 't' },
    { comp: Enemy, field: 'state' },
    { comp: Enemy, field: 'aggro' },
    { comp: Enemy, field: 'hidden' },
    { comp: Enemy, field: 'lungeT' },
    { comp: Enemy, field: 'freezeT' },
    { comp: Enemy, field: 'flashT' },
    { comp: Enemy, field: 'seed' },
    { comp: Enemy, field: 'speed' },
    { comp: Enemy, field: 'dmg' },
    { comp: Enemy, field: 'stateT' },
    { comp: Enemy, field: 'pathI' },
    { comp: Enemy, field: 'repathT' },
    { comp: Enemy, field: 'contactCd' },
    { comp: Enemy, field: 'guardOf' },
    { comp: Enemy, field: 'fade' },
    { comp: Enemy, field: 'dropDew' },
    { comp: Enemy, field: 'leashX' },
    { comp: Enemy, field: 'leashY' },
    { comp: Enemy, field: 'fogOnly' },
    { comp: Enemy, field: 'nearLitShrine' },
    // Projectile
    { comp: Projectile, field: 'kind' },
    { comp: Projectile, field: 'dmg' },
    { comp: Projectile, field: 'life' },
    { comp: Projectile, field: 'dist' },
    { comp: Projectile, field: 'returning' },
    { comp: Projectile, field: 'spin' },
    // Drop
    { comp: Drop, field: 'kind' },
    { comp: Drop, field: 't' },
    { comp: Drop, field: 'magnet' },
    { comp: Drop, field: 'life' },
    // NPC
    { comp: NPC, field: 'id' },
    { comp: NPC, field: 'name' },
    // Chest
    { comp: Chest, field: 'item' },
    { comp: Chest, field: 'opened' },
    // Pedestal
    { comp: Pedestal, field: 'id' },
    { comp: Pedestal, field: 'taken' },
    { comp: Pedestal, field: 'guardsLeft' },
    { comp: Pedestal, field: 'guardsSpawned' },
    // Shrine
    { comp: Shrine, field: 'lit' },
    // Door
    { comp: Door, field: 'open' },
    { comp: Door, field: 'locked' },
    // Barrier
    { comp: Barrier, field: 'active' },
    // Altar
    { comp: Altar, field: 'runes' },
    // Dead — скалярный массив (без вложенного поля)
    { comp: Dead, field: '' },
    // EnemyAI
    { comp: EnemyAI, field: 'path' },
    { comp: EnemyAI, field: 'lightspeedT' },
    { comp: EnemyAI, field: 'slowT' },
    { comp: EnemyAI, field: 'freezeT' },
    { comp: EnemyAI, field: 'flashT' },
    { comp: EnemyAI, field: 'lungeT' },
    { comp: EnemyAI, field: 'repathT' },
    { comp: EnemyAI, field: 'stateT' },
    { comp: EnemyAI, field: 'contactCd' },
    { comp: EnemyAI, field: 'guardsSpawned' },
  ];

  /**
   * Универсальное копирование полей компонентов из srcEid в dstEid.
   * Использует CLONEABLE_FIELDS для декларативного определения копируемых полей.
   * Автоматически исключает Sprite.ref и PhysicsBody.body — их клонирование запрещено.
   */
  private cloneComponentFields(srcEid: number, dstEid: number): void {
    for (const f of EntityFactory.CLONEABLE_FIELDS) {
      if (f.field === '') {
        // Скалярный массив (например, Dead)
        const arr = f.comp as ArrayComponent;
        arr[dstEid] = arr[srcEid];
      } else {
        // Структурированный компонент (например, Position.x)
        const rec = f.comp as Record<string, ArrayComponent>;
        const arr = rec[f.field];
        arr[dstEid] = arr[srcEid];
      }
    }
  }

  /**
    * Создать clone префаба на позиции (x, y).
    * Копирует все значения компонентов из prefabEid (в prefabWorld) в новую сущность
    * в игровом мире. Sprite и PhysicsBody НЕ копируются — они создаются в ecs-bridge.ts.
    */
   clonePrefab(prefabEid: number, x: number, y: number): number {
     const newEid = addEntity(this.gameWorld);

     // Устанавливаем позицию из параметров (не из префаба)
     Position.x[newEid] = x;
     Position.y[newEid] = y;

     // Декларативно копируем все остальные поля из префаба
     this.cloneComponentFields(prefabEid, newEid);

     // ВАЖНО: Sprite.ref и PhysicsBody.body НЕ клонируются!
     // Они обнуляются — графика и физика создаются в ecs-bridge.ts
     Sprite.ref[newEid] = 0;
     PhysicsBody.body[newEid] = 0;

     return newEid;
   }

  /**
   * Создать сущность из префаба врага.
   * Копирует префаб и перезаписывает позицию + случайные параметры.
   */
  cloneEnemyFromPrefab(kind: EnemyKind, x: number, y: number, hp: number, radius: number, speed: number, dmg: number): number {
    const prefabEid = this.prefabs.enemy[kind];
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
    const prefabEid = this.prefabs.projectile;
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
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, Position, Velocity, Projectile, Time, RenderLayer, Radius);

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
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, Position, Health, Radius, RenderLayer, Enemy, Velocity, EnemyAI, Direction);

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
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, Position, Velocity, Health, Radius, Enemy, EnemyAI, Time, RenderLayer);

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
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, Position, Radius, Drop, Time, RenderLayer);

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
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, Position, Health, Radius, RenderLayer, Player, Direction, Velocity);

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
   * Создать пьедестал — явный метод с полным сбросом состояния.
   * Гарантирует что Pedestal.id обнуляется при пересоздании сущности,
   * чтобы логика активации не ломалась из-за сохранения старого состояния.
   * 
   * @param id — уникальный ID пьедестала (например, "ped_10_20")
   * @param x  — позиция X
   * @param y  — позиция Y
   * @param guardsLeft — количество стражей (0 = уже взят)
   */
  createPedestal(id: string, x: number, y: number, guardsLeft: number): number {
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, Position, Radius, Pedestal, RenderLayer);

    // Позиция
    Position.x[eid] = x;
    Position.y[eid] = y;

    // Радиус и слой
    Radius.value[eid] = 6;
    RenderLayer.value[eid] = 10;

    // Полностью сбрасываем все поля Pedestal
    Pedestal.id[eid] = poolAdd(StringPool.pedestalIds, id);
    Pedestal.taken[eid] = 0;
    Pedestal.guardsLeft[eid] = guardsLeft;
    Pedestal.guardsSpawned[eid] = 0;

    return eid;
  }

  /**
   * Создать базовую сущность (для статических объектов: сундуки, пьедесталы, святилища и т.д.).
   */
  createStaticEntity(layer: number = 0): number {
    const eid = addEntity(this.gameWorld);
    addComponents(this.gameWorld, eid, Position, Radius, RenderLayer);

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
    addComponents(this.gameWorld, eid, Velocity);
    Velocity.x[eid] = 0;
    Velocity.y[eid] = 0;
    return eid;
  }

  /**
   * Создать живую сущность (с Health).
   */
  createLivingEntity(hp: number, layer: number = 0): number {
    const eid = this.createStaticEntity(layer);
    addComponents(this.gameWorld, eid, Health);
    Health.current[eid] = hp;
    Health.max[eid] = hp;
    return eid;
  }
}

// ============================================================
// Фабричная функция и экспорт синглтона
// ============================================================

/** Создать экземпляр EntityFactory */
export function createEntityFactory(gameWorld: World, prefabWorld: World): EntityFactory {
  return new EntityFactory(gameWorld, prefabWorld);
}
