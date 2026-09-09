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
  SpriteRegistry,
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
  if (playerEid < 0 || !Position.x[playerEid]) return null;
  
  return {
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

/** Профилирование ECS запросов */
export function profileQueries(world: World): { queries: any[]; totalTime: string } {
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
    const results = query(world, qd.components);
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
    const spriteIdx = Sprite.ref[eid];
    entity.sprite = spriteIdx > 0 ? SpriteRegistry[spriteIdx - 1] : null;
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
  
  const spriteIdx = Sprite.ref[eid];
  if (spriteIdx > 0) {
    const sprite = SpriteRegistry[spriteIdx - 1];
    if (sprite) {
      if (onRemoveSprite) onRemoveSprite(sprite);
      sprite?.destroy({ children: true });
    }
    SpriteRegistry.splice(spriteIdx - 1, 1);
    for (const e of query(world, [Sprite])) {
      if (Sprite.ref[e] > spriteIdx) Sprite.ref[e]--;
    }
  }
  
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
  onRemoveSprite?: (sprite: any) => void
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
    const spriteIdx = Sprite.ref[eid];
    if (spriteIdx > 0) {
      const sprite = SpriteRegistry[spriteIdx - 1];
      if (sprite) {
        if (onRemoveSprite) onRemoveSprite(sprite);
        sprite?.destroy({ children: true });
      }
      SpriteRegistry.splice(spriteIdx - 1, 1);
    }
    removeEntity(world, eid);
  }
  
  return count;
}

/** Удалить всех призраков */
export function removeAllGhosts(
  world: World,
  onRemoveSprite?: (sprite: any) => void
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
    const spriteIdx = Sprite.ref[eid];
    if (spriteIdx > 0) {
      const sprite = SpriteRegistry[spriteIdx - 1];
      if (sprite) {
        if (onRemoveSprite) onRemoveSprite(sprite);
        sprite?.destroy({ children: true });
      }
      SpriteRegistry.splice(spriteIdx - 1, 1);
    }
    removeEntity(world, eid);
  }
  
  return count;
}

/** Удалить снаряд по ID */
export function removeProjectile(world: World, eid: number): boolean {
  if (eid < 0 || !hasComponent(world, Projectile as any, eid)) return false;
  
  const spriteIdx = Sprite.ref[eid];
  if (spriteIdx > 0) {
    const sprite = SpriteRegistry[spriteIdx - 1];
    if (sprite) sprite?.destroy({ children: true });
    SpriteRegistry.splice(spriteIdx - 1, 1);
    for (const e of query(world, [Sprite])) {
      if (Sprite.ref[e] > spriteIdx) Sprite.ref[e]--;
    }
  }
  
  removeEntity(world, eid);
  return true;
}

/** Удалить дроп по ID */
export function removeDrop(world: World, eid: number): boolean {
  if (eid < 0 || !hasComponent(world, Drop as any, eid)) return false;
  
  const spriteIdx = Sprite.ref[eid];
  if (spriteIdx > 0) {
    const sprite = SpriteRegistry[spriteIdx - 1];
    if (sprite) sprite?.destroy({ children: true });
    SpriteRegistry.splice(spriteIdx - 1, 1);
    for (const e of query(world, [Sprite])) {
      if (Sprite.ref[e] > spriteIdx) Sprite.ref[e]--;
    }
  }
  
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
