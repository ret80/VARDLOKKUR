/* debug-api.ts — API для отладки: сбор состояния из ECS + управление + introspection */

import { query, hasComponent, removeEntity } from 'bitecs';
import type { World } from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  Enemy,
  EnemyState,
  getEnemyStateName,
  StringPool,
  poolGet,
  Dead,
  Player,
  Drop,
  Projectile,
  NPC,
  Sprite,
  PhysicsBody,
  PhysicsBodyRegistry,
  EnemyAI,
  Time,
  Radius,
  RenderLayer,
  Magnet,
  Taken,
  Flashing,
  Hidden,
} from '../ecs/ecs-components';

// ============================================================
// Типы данных для отладки
// ============================================================

export interface DebugPlayer {
  eid: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  arrows: number;
  runes: number;
  hearts: number;
  dead: boolean;
  moving: number;
  swingT: number;
  hurtT: number;
  slowT: number;
  hasSword: number;
}

export interface DebugEnemy {
  eid: number;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: number;
  stateName: string;
  stateT: number;
  isGhost: boolean;
  leashX: number;
  leashY: number;
  aggro: number;
  fogOnly: number;
  fade: number;
  guardOf: number;
  speed: number;
  dmg: number;
  hidden: number;
  radius: number;
}

export interface DebugDrop {
  eid: number;
  kind: string;
  x: number;
  y: number;
  life: number;
  t: number;
  magnet: number;
}

export interface DebugProjectile {
  eid: number;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  dist: number;
}

export interface DebugNpc {
  eid: number;
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface DebugEntity {
  eid: number;
  components: string[];
  position?: { x: number; y: number };
  health?: { current: number; max: number };
  [key: string]: any;
}

export interface DebugGameState {
  player: DebugPlayer | null;
  enemies: DebugEnemy[];
  drops: DebugDrop[];
  projectiles: DebugProjectile[];
  npcs: DebugNpc[];
  fog: any;
  flags: any;
  map: any;
  time: { elapsed: number; timeScale: number; paused: boolean };
}

// ============================================================
// Сбор состояния из ECS
// ============================================================

/** Получить состояние игрока из ECS */
export function getPlayerState(world: World, playerEid: number): DebugPlayer | null {
  if (playerEid < 0) return null;
  
  return {
    eid: playerEid,
    x: Position.x[playerEid],
    y: Position.y[playerEid],
    hp: Health.current[playerEid],
    maxHp: Player.maxHp[playerEid],
    arrows: 0,
    runes: Player.runes[playerEid],
    hearts: 0,
    dead: !!Dead[playerEid],
    moving: Player.moving[playerEid],
    swingT: Player.swingT[playerEid],
    hurtT: Player.hurtT[playerEid],
    slowT: Player.slowT[playerEid],
    hasSword: Player.hasSword[playerEid],
  };
}

/** Получить список всех врагов */
export function getEnemiesState(world: World): DebugEnemy[] {
  const enemies: DebugEnemy[] = [];
  
  for (const eid of query(world, [Enemy, Position])) {
    const kindIdx = Enemy.kind[eid];
    const kind = poolGet(StringPool.enemyKinds, kindIdx);
    const stateName = getEnemyStateName(Enemy.state[eid]);
    const isGhost = kind === 'ghost';
    
    enemies.push({
      eid,
      kind,
      x: Position.x[eid],
      y: Position.y[eid],
      hp: Health.current[eid],
      maxHp: Health.max[eid],
      state: Enemy.state[eid],
      stateName,
      stateT: Enemy.stateT[eid],
      isGhost,
      leashX: Enemy.leashX[eid],
      leashY: Enemy.leashY[eid],
      aggro: Enemy.aggro[eid],
      fogOnly: Enemy.fogOnly[eid],
      fade: Enemy.fade[eid],
      guardOf: Enemy.guardOf[eid],
      speed: Enemy.speed[eid],
      dmg: Enemy.dmg[eid],
      hidden: Enemy.hidden[eid],
      radius: Enemy.radius[eid],
    });
  }
  
  return enemies;
}

/** Получить список всех дропов */
export function getDropsState(world: World): DebugDrop[] {
  const drops: DebugDrop[] = [];
  
  for (const eid of query(world, [Drop, Position])) {
    const kind = poolGet(StringPool.dropKinds, Drop.kind[eid]);
    
    drops.push({
      eid,
      kind,
      x: Position.x[eid],
      y: Position.y[eid],
      life: Drop.life[eid],
      t: Drop.t[eid],
      magnet: Drop.magnet[eid],
    });
  }
  
  return drops;
}

/** Получить список всех снарядов */
export function getProjectilesState(world: World): DebugProjectile[] {
  const projectiles: DebugProjectile[] = [];
  
  for (const eid of query(world, [Projectile, Position, Velocity])) {
    const kind = poolGet(StringPool.projectileKinds, Projectile.kind[eid]);
    
    projectiles.push({
      eid,
      kind,
      x: Position.x[eid],
      y: Position.y[eid],
      vx: Velocity.x[eid],
      vy: Velocity.y[eid],
      dmg: Projectile.dmg[eid],
      life: Projectile.life[eid],
      dist: Projectile.dist[eid],
    });
  }
  
  return projectiles;
}

/** Получить список всех NPC */
export function getNpcsState(world: World): DebugNpc[] {
  const npcs: DebugNpc[] = [];
  
  for (const eid of query(world, [NPC, Position])) {
    const id = poolGet(StringPool.npcIds, NPC.id[eid]);
    const name = poolGet(StringPool.npcNames, NPC.name[eid]);
    
    npcs.push({
      eid,
      id,
      name,
      x: Position.x[eid],
      y: Position.y[eid],
    });
  }
  
  return npcs;
}

/** Получить полный дамп мира (все сущности с компонентами) */
export function getWorldDump(world: World): { entities: DebugEntity[]; stats: any } {
  const entities: DebugEntity[] = [];
  let totalEntities = 0;
  let aliveEntities = 0;
  const componentCounts: Record<string, number> = {};
  
  const allComponentNames = [
    'Position', 'Velocity', 'Health', 'Radius', 'Time', 'Direction', 'RenderLayer',
    'Player', 'Enemy', 'Projectile', 'Drop', 'NPC', 'Chest', 'Pedestal',
    'Shrine', 'Door', 'Barrier', 'Altar', 'Sprite', 'PhysicsBody', 'EnemyAI',
    'Dead', 'Hidden', 'Taken', 'Magnet', 'Flashing',
  ];
  
  for (const compName of allComponentNames) {
    componentCounts[compName] = 0;
  }
  
  const index = (world as any)._entityIndex;
  const entityIds = index ? index.entityIds : [];
  totalEntities = entityIds.length;
  
  for (const eid of entityIds) {
    const entity: DebugEntity = { eid, components: [] };
    let hasComponents = false;
    
    if (hasComponent(world, Position as any, eid)) {
      entity.components.push('Position');
      componentCounts['Position']++;
      entity.position = { x: Position.x[eid], y: Position.y[eid] };
      hasComponents = true;
    }
    
    if (hasComponent(world, Enemy as any, eid)) {
      entity.components.push('Enemy');
      componentCounts['Enemy']++;
      if (hasComponents) {
        entity.kind = poolGet(StringPool.enemyKinds, Enemy.kind[eid]);
        entity.state = Enemy.state[eid];
        entity.stateName = getEnemyStateName(Enemy.state[eid]);
      }
    }
    
    if (hasComponent(world, Health as any, eid)) {
      entity.components.push('Health');
      componentCounts['Health']++;
      if (hasComponents) {
        entity.health = { current: Health.current[eid], max: Health.max[eid] };
        if (Health.current[eid] > 0) aliveEntities++;
      }
    }
    
    if (hasComponent(world, Player as any, eid)) {
      entity.components.push('Player');
      componentCounts['Player']++;
      aliveEntities++;
    }
    
    if (hasComponent(world, Projectile as any, eid)) {
      entity.components.push('Projectile');
      componentCounts['Projectile']++;
      if (hasComponents) {
        entity.kind = poolGet(StringPool.projectileKinds, Projectile.kind[eid]);
      }
    }
    
    if (hasComponent(world, Drop as any, eid)) {
      entity.components.push('Drop');
      componentCounts['Drop']++;
      if (hasComponents) {
        entity.kind = poolGet(StringPool.dropKinds, Drop.kind[eid]);
      }
    }
    
    if (hasComponent(world, NPC as any, eid)) {
      entity.components.push('NPC');
      componentCounts['NPC']++;
    }
    
    if (hasComponent(world, Dead as any, eid)) {
      entity.components.push('Dead');
      componentCounts['Dead']++;
    }
    
    const markerComponents: Array<{ name: string; arr: Uint8Array }> = [
      { name: 'Hidden', arr: Hidden },
      { name: 'Taken', arr: Taken },
      { name: 'Magnet', arr: Magnet },
      { name: 'Flashing', arr: Flashing },
    ];
    
    for (const mc of markerComponents) {
      if (mc.arr[eid]) {
        entity.components.push(mc.name);
        componentCounts[mc.name]++;
      }
    }
    
    if (hasComponents) {
      entities.push(entity);
    }
  }
  
  return {
    entities,
    stats: {
      totalEntities,
      aliveEntities,
      componentCounts,
    },
  };
}

export interface DebugEntity {
  eid: number;
  components: string[];
  [key: string]: any;
}

/**
 * Собирает полный набор компонентов сущности в виде дерева:
 * `{ eid, components: [...], Position: {...}, Enemy: {...}, ... }`
 */
function buildEntityComponents(world: World, eid: number): Record<string, any> | null {
  const out: Record<string, any> = {};
  const names: string[] = [];

  const add = (name: string, value?: any) => {
    names.push(name);
    if (value !== undefined) out[name] = value;
  };

  if (hasComponent(world, Position as any, eid))
    add('Position', { x: Position.x[eid], y: Position.y[eid] });

  if (hasComponent(world, Velocity as any, eid))
    add('Velocity', { x: Velocity.x[eid], y: Velocity.y[eid] });

  if (hasComponent(world, Health as any, eid))
    add('Health', { current: Health.current[eid], max: Health.max[eid] });

  if (hasComponent(world, Radius as any, eid))
    add('Radius', Radius.value[eid]);

  if (hasComponent(world, Time as any, eid))
    add('Time', Time.value[eid]);

  if (hasComponent(world, Direction as any, eid))
    add('Direction', { x: Direction.x[eid], y: Direction.y[eid] });

  if (hasComponent(world, RenderLayer as any, eid))
    add('RenderLayer', RenderLayer.value[eid]);

  if (hasComponent(world, Player as any, eid))
    add('Player', {
      moving: Player.moving[eid],
      animT: Player.animT[eid],
      swingT: Player.swingT[eid],
      hurtT: Player.hurtT[eid],
      slowT: Player.slowT[eid],
      hasSword: Player.hasSword[eid],
      runes: Player.runes[eid],
      swingDirX: Player.swingDirX[eid],
      swingDirY: Player.swingDirY[eid],
      aiming: Player.aiming[eid],
      maxHp: Player.maxHp[eid],
    });

  if (hasComponent(world, Enemy as any, eid))
    add('Enemy', {
      kind: poolGet(StringPool.enemyKinds, Enemy.kind[eid]),
      radius: Enemy.radius[eid],
      facingX: Enemy.facingX[eid],
      facingY: Enemy.facingY[eid],
      t: Enemy.t[eid],
      state: Enemy.state[eid],
      stateName: getEnemyStateName(Enemy.state[eid]),
      aggro: Enemy.aggro[eid],
      hidden: Enemy.hidden[eid],
      lungeT: Enemy.lungeT[eid],
      freezeT: Enemy.freezeT[eid],
      flashT: Enemy.flashT[eid],
      seed: Enemy.seed[eid],
      speed: Enemy.speed[eid],
      dmg: Enemy.dmg[eid],
      stateT: Enemy.stateT[eid],
      pathI: Enemy.pathI[eid],
      repathT: Enemy.repathT[eid],
      contactCd: Enemy.contactCd[eid],
      guardOf: Enemy.guardOf[eid],
      guardPedestalEid: Enemy.guardPedestalEid[eid],
      fade: Enemy.fade[eid],
      dropDew: Enemy.dropDew[eid],
      leashX: Enemy.leashX[eid],
      leashY: Enemy.leashY[eid],
      fogOnly: Enemy.fogOnly[eid],
      nearLitShrine: Enemy.nearLitShrine[eid],
    });

  if (hasComponent(world, Projectile as any, eid))
    add('Projectile', {
      kind: poolGet(StringPool.projectileKinds, Projectile.kind[eid]),
      dmg: Projectile.dmg[eid],
      life: Projectile.life[eid],
      dist: Projectile.dist[eid],
      returning: Projectile.returning[eid],
      spin: Projectile.spin[eid],
    });

  if (hasComponent(world, Drop as any, eid))
    add('Drop', {
      kind: poolGet(StringPool.dropKinds, Drop.kind[eid]),
      t: Drop.t[eid],
      magnet: Drop.magnet[eid],
      life: Drop.life[eid],
    });

  if (hasComponent(world, NPC as any, eid))
    add('NPC', {
      id: poolGet(StringPool.npcIds, NPC.id[eid]),
      name: poolGet(StringPool.npcNames, NPC.name[eid]),
    });

  if (hasComponent(world, Chest as any, eid))
    add('Chest', {
      item: poolGet(StringPool.chestItems, Chest.item[eid]),
      opened: !!Chest.opened[eid],
    });

  if (hasComponent(world, Pedestal as any, eid))
    add('Pedestal', {
      id: poolGet(StringPool.pedestalIds, Pedestal.id[eid]),
      taken: !!Pedestal.taken[eid],
      guardsLeft: Pedestal.guardsLeft[eid],
      guardsSpawned: !!Pedestal.guardsSpawned[eid],
    });

  if (hasComponent(world, Shrine as any, eid))
    add('Shrine', { lit: !!Shrine.lit[eid] });

  if (hasComponent(world, Door as any, eid))
    add('Door', { open: Door.open[eid], locked: !!Door.locked[eid] });

  if (hasComponent(world, Barrier as any, eid))
    add('Barrier', { active: !!Barrier.active[eid] });

  if (hasComponent(world, Altar as any, eid))
    add('Altar', { runes: Altar.runes[eid] });

  if (hasComponent(world, MapState as any, eid))
    add('MapState', {
      width: MapState.width[eid],
      height: MapState.height[eid],
      dungeonId: MapState.dungeonId[eid],
    });

  if (hasComponent(world, Sprite as any, eid))
    add('Sprite', { ref: Sprite.ref[eid] });

  if (hasComponent(world, PhysicsBody as any, eid)) {
    const idx = PhysicsBody.body[eid];
    const body = idx > 0 ? PhysicsBodyRegistry[idx - 1] : null;
    // planck-тело нельзя сериализовать в JSON — выводим только значимые поля
    add('PhysicsBody', {
      index: idx,
      exists: !!body,
      position: body?.getPosition ? { x: body.getPosition().x, y: body.getPosition().y } : null,
      velocity: body?.getLinearVelocity ? { x: body.getLinearVelocity().x, y: body.getLinearVelocity().y } : null,
      type: body?.getType ? body.getType() : null,
      bullet: body?.isBullet ? !!body.isBullet() : null,
    });
  }

  if (hasComponent(world, EnemyAI as any, eid))
    add('EnemyAI', {
      path: EnemyAI.path[eid],
      lightspeedT: EnemyAI.lightspeedT[eid],
      slowT: EnemyAI.slowT[eid],
      freezeT: EnemyAI.freezeT[eid],
      flashT: EnemyAI.flashT[eid],
      lungeT: EnemyAI.lungeT[eid],
      repathT: EnemyAI.repathT[eid],
      stateT: EnemyAI.stateT[eid],
      contactCd: EnemyAI.contactCd[eid],
      guardsSpawned: EnemyAI.guardsSpawned[eid],
    });

  for (const mc of MARKER_COMPONENTS) {
    if (mc.arr[eid]) add(mc.name);
  }

  if (Dead[eid]) add('Dead');

  if (names.length === 0) return null;
  out.components = names;
  return out;
}

/** Профилирование ECS запросов */
export function profileQueries(world: World): { queries: any[]; totalTime: string } {
  console.log('[profile] Starting, world:', !!world, 'entityIds:', (world as any)?._entityIndex?.entityIds?.length);
  const queries: any[] = [];
  
  const queryDefs = [
    { name: 'All with Position', components: [Position] as any[] },
    { name: 'Enemies', components: [Enemy, Position] as any[] },
    { name: 'Player', components: [Player] as any[] },
    { name: 'Projectiles', components: [Projectile, Position] as any[] },
    { name: 'Drops', components: [Drop, Position] as any[] },
    { name: 'NPCs', components: [NPC, Position] as any[] },
    { name: 'Dead entities', components: [Dead] as any[] },
    { name: 'Living enemies', components: [Enemy, Health] as any[] },
  ];
  
  for (const qd of queryDefs) {
    const start = performance.now();
    const results = Array.from(query(world, qd.components));
    const elapsed = performance.now() - start;
    
    queries.push({
      name: qd.name,
      count: results.length,
      elapsed: elapsed.toFixed(3) + 'ms',
      eids: results.slice(0, 50),
    });
  }
  
  const totalTime = queries.reduce((sum, q) => sum + parseFloat(q.elapsed), 0);
  
  return { queries, totalTime: totalTime.toFixed(3) + 'ms' };
}

/** Инспекция конкретной сущности */
export function inspectEntity(world: World, eid: number): DebugEntity | null {
  const entity: DebugEntity = { eid, components: [] };
  
  if (eid < 0 || eid >= 10000) return null;
  
  if (hasComponent(world, Position as any, eid)) {
    entity.components.push('Position');
    entity.position = { x: Position.x[eid], y: Position.y[eid] };
  }
  
  if (hasComponent(world, Velocity as any, eid)) {
    entity.components.push('Velocity');
    entity.velocity = { x: Velocity.x[eid], y: Velocity.y[eid] };
  }
  
  if (hasComponent(world, Health as any, eid)) {
    entity.components.push('Health');
    entity.health = { current: Health.current[eid], max: Health.max[eid] };
  }
  
  if (hasComponent(world, Player as any, eid)) {
    entity.components.push('Player');
    entity.player = {
      moving: Player.moving[eid],
      runes: Player.runes[eid],
      swingT: Player.swingT[eid],
      hasSword: Player.hasSword[eid],
    };
  }
  
  if (hasComponent(world, Enemy as any, eid)) {
    entity.components.push('Enemy');
    entity.enemy = {
      kind: poolGet(StringPool.enemyKinds, Enemy.kind[eid]),
      state: Enemy.state[eid],
      stateName: getEnemyStateName(Enemy.state[eid]),
      speed: Enemy.speed[eid],
      dmg: Enemy.dmg[eid],
      radius: Enemy.radius[eid],
    };
  }
  
  if (hasComponent(world, Sprite as any, eid)) {
    entity.components.push('Sprite');
    entity.sprite = Sprite.ref[eid] || null;
  }
  
  if (hasComponent(world, PhysicsBody as any, eid)) {
    entity.components.push('PhysicsBody');
    const bodyIdx = PhysicsBody.body[eid];
    entity.physicsBody = bodyIdx > 0 ? PhysicsBodyRegistry[bodyIdx - 1] : null;
  }
  
  if (hasComponent(world, Dead as any, eid)) {
    entity.components.push('Dead');
    entity.dead = !!Dead[eid];
  }
  
  if (entity.components.length === 0) return null;
  
  return entity;
}

/** Получить полное состояние игры */
export function getFullGameState(
  world: World,
  playerEid: number,
  flags: any,
  fogState: any,
  map: any,
  timeScale: number,
  elapsed: number,
  paused: boolean
): DebugGameState {
  return {
    player: getPlayerState(world, playerEid),
    enemies: getEnemiesState(world),
    drops: getDropsState(world),
    projectiles: getProjectilesState(world),
    npcs: getNpcsState(world),
    fog: {
      fogActive: fogState?.fogActive ?? false,
      fogAmbient: fogState?.fogAmbient ?? false,
      fogLeft: fogState?.fogLeft ?? 0,
      fogTimer: fogState?.fogTimer ?? 60,
      fogRadius: fogState?.fogRadius ?? 2600,
      fogSpawned: fogState?.fogSpawned ?? false,
      fogWarned: fogState?.fogWarned ?? false,
    },
    flags,
    map: map ? {
      name: map.name ?? 'Unknown',
      isDungeon: map.isDungeon ?? false,
      treeAltar: map.treeAltar ?? { x: 0, y: 0 },
    } : null,
    time: {
      elapsed,
      timeScale,
      paused,
    },
  };
}

// ============================================================
// Управление состоянием
// ============================================================

/** Телепортировать игрока */
export function teleportPlayer(world: World, playerEid: number, x: number, y: number): boolean {
  if (playerEid < 0 || !Position.x[playerEid]) return false;
  Position.x[playerEid] = x;
  Position.y[playerEid] = y;
  Velocity.x[playerEid] = 0;
  Velocity.y[playerEid] = 0;
  return true;
}

/** Установить HP игрока */
export function setPlayerHp(world: World, playerEid: number, hp: number): boolean {
  if (playerEid < 0 || !Health.current[playerEid]) return false;
  Health.current[playerEid] = Math.max(0, hp);
  return true;
}

/** Убить игрока */
export function killPlayer(world: World, playerEid: number): boolean {
  if (playerEid < 0 || !Health.current[playerEid]) return false;
  Health.current[playerEid] = 0;
  return true;
}

/** Удалить врага по ID (полная реализация) */
export function removeEnemy(
  world: World,
  eid: number,
  onRemoveSprite?: (sprite: any) => void
): boolean {
  if (eid < 0 || !hasComponent(world, Enemy as any, eid)) return false;
  if (Dead[eid]) return false;
  
  // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
  Sprite.ref[eid] = 0;
  
  const pbIdx = PhysicsBody.body[eid];
  if (pbIdx > 0) {
    PhysicsBodyRegistry[pbIdx - 1] = null as any;
    PhysicsBody.body[eid] = 0;
  }
  
  removeEntity(world, eid);
  return true;
}

/** Удалить всех врагов */
export function removeAllEnemies(
  world: World,
  _onRemoveSprite?: (sprite: any) => void
): number {
  let count = 0;
  const toRemove: number[] = [];
  
  for (const eid of query(world, [Enemy])) {
    if (!Dead[eid]) {
      toRemove.push(eid);
      count++;
    }
  }
  
  for (const eid of toRemove) {
    // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
    Sprite.ref[eid] = 0;
    removeEntity(world, eid);
  }
  
  return count;
}

/** Удалить всех призраков */
export function removeAllGhosts(
  world: World,
  _onRemoveSprite?: (sprite: any) => void
): number {
  let count = 0;
  const toRemove: number[] = [];
  
  for (const eid of query(world, [Enemy])) {
    if (!Dead[eid] && poolGet(StringPool.enemyKinds, Enemy.kind[eid]) === 'ghost') {
      toRemove.push(eid);
      count++;
    }
  }
  
  for (const eid of toRemove) {
    // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
    Sprite.ref[eid] = 0;
    removeEntity(world, eid);
  }
  
  return count;
}

/** Удалить снаряд по ID */
export function removeProjectile(world: World, eid: number): boolean {
  if (eid < 0 || !hasComponent(world, Projectile as any, eid)) return false;
  
  // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
  Sprite.ref[eid] = 0;
  
  removeEntity(world, eid);
  return true;
}

/** Удалить дроп по ID */
export function removeDrop(world: World, eid: number): boolean {
  if (eid < 0 || !hasComponent(world, Drop as any, eid)) return false;
  
  // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
  Sprite.ref[eid] = 0;
  
  removeEntity(world, eid);
  return true;
}

/** Установить флаг */
export function setFlag(flags: any, key: string, value: any): void {
  (flags as any)[key] = value;
}

/** Добавить руны */
export function addRunes(flags: any, count: number): void {
  (flags as any).runes += count;
}

/** Добавить стрелы */
export function addArrows(flags: any, count: number): void {
  (flags as any).arrows += count;
}

/** Добавить сердца */
export function addHearts(flags: any, count: number): void {
  (flags as any).hearts += count;
}
