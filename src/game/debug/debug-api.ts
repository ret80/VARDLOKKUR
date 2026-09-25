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
  Direction,
  Chest,
  Pedestal,
  Shrine,
  Door,
  Barrier,
  Altar,
  MapState,
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
  Position?: { x: number; y: number };
  Velocity?: { x: number; y: number };
  Health?: { current: number; max: number };
  Radius?: number;
  Time?: number;
  Direction?: { x: number; y: number };
  RenderLayer?: number;
  Player?: any;
  Enemy?: any;
  Projectile?: any;
  Drop?: any;
  NPC?: any;
  Chest?: any;
  Pedestal?: any;
  Shrine?: any;
  Door?: any;
  Barrier?: any;
  Altar?: any;
  MapState?: any;
  Sprite?: any;
  PhysicsBody?: { index: number; exists: boolean };
  EnemyAI?: any;
  Hidden?: number;
  Taken?: number;
  Magnet?: number;
  Flashing?: number;
  Dead?: number;
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
    let hasAnyComponent = false;

    if (hasComponent(world, Position as any, eid)) {
      entity.components.push('Position');
      componentCounts['Position']++;
      entity.Position = { x: Position.x[eid], y: Position.y[eid] };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Velocity as any, eid)) {
      entity.components.push('Velocity');
      componentCounts['Velocity']++;
      entity.Velocity = { x: Velocity.x[eid], y: Velocity.y[eid] };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Health as any, eid)) {
      entity.components.push('Health');
      componentCounts['Health']++;
      entity.Health = { current: Health.current[eid], max: Health.max[eid] };
      if (Health.current[eid] > 0) aliveEntities++;
      hasAnyComponent = true;
    }

    if (hasComponent(world, Radius as any, eid)) {
      entity.components.push('Radius');
      componentCounts['Radius']++;
      entity.Radius = Radius.value[eid];
      hasAnyComponent = true;
    }

    if (hasComponent(world, Time as any, eid)) {
      entity.components.push('Time');
      componentCounts['Time']++;
      entity.Time = Time.value[eid];
      hasAnyComponent = true;
    }

    if (hasComponent(world, Direction as any, eid)) {
      entity.components.push('Direction');
      componentCounts['Direction']++;
      entity.Direction = { x: Direction.x[eid], y: Direction.y[eid] };
      hasAnyComponent = true;
    }

    if (hasComponent(world, RenderLayer as any, eid)) {
      entity.components.push('RenderLayer');
      componentCounts['RenderLayer']++;
      entity.RenderLayer = RenderLayer.value[eid];
      hasAnyComponent = true;
    }

    if (hasComponent(world, Player as any, eid)) {
      entity.components.push('Player');
      componentCounts['Player']++;
      entity.Player = {
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
      };
      aliveEntities++;
      hasAnyComponent = true;
    }

    if (hasComponent(world, Enemy as any, eid)) {
      entity.components.push('Enemy');
      componentCounts['Enemy']++;
      entity.Enemy = {
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
      };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Projectile as any, eid)) {
      entity.components.push('Projectile');
      componentCounts['Projectile']++;
      entity.Projectile = {
        kind: poolGet(StringPool.projectileKinds, Projectile.kind[eid]),
        dmg: Projectile.dmg[eid],
        life: Projectile.life[eid],
        dist: Projectile.dist[eid],
        returning: Projectile.returning[eid],
        spin: Projectile.spin[eid],
      };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Drop as any, eid)) {
      entity.components.push('Drop');
      componentCounts['Drop']++;
      entity.Drop = {
        kind: poolGet(StringPool.dropKinds, Drop.kind[eid]),
        t: Drop.t[eid],
        magnet: Drop.magnet[eid],
        life: Drop.life[eid],
      };
      hasAnyComponent = true;
    }

    if (hasComponent(world, NPC as any, eid)) {
      entity.components.push('NPC');
      componentCounts['NPC']++;
      entity.NPC = {
        id: poolGet(StringPool.npcIds, NPC.id[eid]),
        name: poolGet(StringPool.npcNames, NPC.name[eid]),
      };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Chest as any, eid)) {
      entity.components.push('Chest');
      componentCounts['Chest']++;
      entity.Chest = {
        item: poolGet(StringPool.chestItems, Chest.item[eid]),
        opened: !!Chest.opened[eid],
      };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Pedestal as any, eid)) {
      entity.components.push('Pedestal');
      componentCounts['Pedestal']++;
      entity.Pedestal = {
        id: poolGet(StringPool.pedestalIds, Pedestal.id[eid]),
        taken: !!Pedestal.taken[eid],
        guardsLeft: Pedestal.guardsLeft[eid],
        guardsSpawned: !!Pedestal.guardsSpawned[eid],
      };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Shrine as any, eid)) {
      entity.components.push('Shrine');
      componentCounts['Shrine']++;
      entity.Shrine = { lit: !!Shrine.lit[eid] };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Door as any, eid)) {
      entity.components.push('Door');
      componentCounts['Door']++;
      entity.Door = { open: Door.open[eid], locked: !!Door.locked[eid] };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Barrier as any, eid)) {
      entity.components.push('Barrier');
      componentCounts['Barrier']++;
      entity.Barrier = { active: !!Barrier.active[eid] };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Altar as any, eid)) {
      entity.components.push('Altar');
      componentCounts['Altar']++;
      entity.Altar = { runes: Altar.runes[eid] };
      hasAnyComponent = true;
    }

    if (hasComponent(world, MapState as any, eid)) {
      entity.components.push('MapState');
      componentCounts['MapState']++;
      entity.MapState = {
        width: MapState.width[eid],
        height: MapState.height[eid],
        dungeonId: MapState.dungeonId[eid],
      };
      hasAnyComponent = true;
    }

    if (hasComponent(world, Sprite as any, eid)) {
      entity.components.push('Sprite');
      componentCounts['Sprite']++;
      entity.Sprite = { ref: Sprite.ref[eid] };
      hasAnyComponent = true;
    }

    if (hasComponent(world, PhysicsBody as any, eid)) {
      entity.components.push('PhysicsBody');
      componentCounts['PhysicsBody']++;
      const idx = PhysicsBody.body[eid];
      entity.PhysicsBody = { index: idx, exists: idx > 0 };
      hasAnyComponent = true;
    }

    if (hasComponent(world, EnemyAI as any, eid)) {
      entity.components.push('EnemyAI');
      componentCounts['EnemyAI']++;
      entity.EnemyAI = {
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
      };
      hasAnyComponent = true;
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
        hasAnyComponent = true;
      }
    }

    if (Dead[eid]) {
      entity.components.push('Dead');
      componentCounts['Dead']++;
      entity.Dead = 1;
      hasAnyComponent = true;
    }

    if (hasAnyComponent) {
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

/** Инспекция конкретной сущности: возвращает дерево компонентов */
export function inspectEntity(world: World, eid: number): DebugEntity | null {
  if (eid < 0 || eid >= 10000) return null;

  const entity: DebugEntity = { eid, components: [] };
  let hasAny = false;

  const add = (name: string, value?: any) => {
    entity.components.push(name);
    if (value !== undefined) {
      entity[name] = value;
    }
    hasAny = true;
  };

  const check = (comp: any, name: string) => {
    const has = hasComponent(world, comp, eid);
    // Fallback: check SoA array directly (clonePrefab copies SoA but never calls addComponents)
    const soaHas = comp[eid] !== 0;
    return has || soaHas;
  };

  if (check(Position as any, 'Position')) add('Position', { x: Position.x[eid], y: Position.y[eid] });
  if (check(Velocity as any, 'Velocity')) add('Velocity', { x: Velocity.x[eid], y: Velocity.y[eid] });
  if (check(Health as any, 'Health')) add('Health', { current: Health.current[eid], max: Health.max[eid] });
  if (check(Radius as any, 'Radius')) add('Radius', Radius.value[eid]);
  if (check(Time as any, 'Time')) add('Time', Time.value[eid]);
  if (check(Direction as any, 'Direction')) add('Direction', { x: Direction.x[eid], y: Direction.y[eid] });
  if (check(RenderLayer as any, 'RenderLayer')) add('RenderLayer', RenderLayer.value[eid]);

  if (check(Player as any, 'Player')) {
    add('Player', {
      moving: Player.moving[eid], animT: Player.animT[eid], swingT: Player.swingT[eid],
      hurtT: Player.hurtT[eid], slowT: Player.slowT[eid], hasSword: Player.hasSword[eid],
      runes: Player.runes[eid], swingDirX: Player.swingDirX[eid], swingDirY: Player.swingDirY[eid],
      aiming: Player.aiming[eid], maxHp: Player.maxHp[eid],
    });
  }
  if (check(Enemy as any, 'Enemy')) {
    add('Enemy', {
      kind: poolGet(StringPool.enemyKinds, Enemy.kind[eid]), radius: Enemy.radius[eid],
      facingX: Enemy.facingX[eid], facingY: Enemy.facingY[eid], t: Enemy.t[eid],
      state: Enemy.state[eid], stateName: getEnemyStateName(Enemy.state[eid]),
      aggro: Enemy.aggro[eid], hidden: Enemy.hidden[eid], lungeT: Enemy.lungeT[eid],
      freezeT: Enemy.freezeT[eid], flashT: Enemy.flashT[eid], seed: Enemy.seed[eid],
      speed: Enemy.speed[eid], dmg: Enemy.dmg[eid], stateT: Enemy.stateT[eid],
      pathI: Enemy.pathI[eid], repathT: Enemy.repathT[eid], contactCd: Enemy.contactCd[eid],
      guardOf: Enemy.guardOf[eid], guardPedestalEid: Enemy.guardPedestalEid[eid],
      fade: Enemy.fade[eid], dropDew: Enemy.dropDew[eid], leashX: Enemy.leashX[eid],
      leashY: Enemy.leashY[eid], fogOnly: Enemy.fogOnly[eid], nearLitShrine: Enemy.nearLitShrine[eid],
    });
  }
  if (check(Projectile as any, 'Projectile')) {
    add('Projectile', {
      kind: poolGet(StringPool.projectileKinds, Projectile.kind[eid]), dmg: Projectile.dmg[eid],
      life: Projectile.life[eid], dist: Projectile.dist[eid], returning: Projectile.returning[eid], spin: Projectile.spin[eid],
    });
  }
  if (check(Drop as any, 'Drop')) {
    add('Drop', {
      kind: poolGet(StringPool.dropKinds, Drop.kind[eid]), t: Drop.t[eid],
      magnet: Drop.magnet[eid], life: Drop.life[eid],
    });
  }
  if (check(NPC as any, 'NPC')) {
    add('NPC', {
      id: poolGet(StringPool.npcIds, NPC.id[eid]), name: poolGet(StringPool.npcNames, NPC.name[eid]),
    });
  }
  if (check(Chest as any, 'Chest')) {
    add('Chest', { item: poolGet(StringPool.chestItems, Chest.item[eid]), opened: !!Chest.opened[eid] });
  }
  if (check(Pedestal as any, 'Pedestal')) {
    add('Pedestal', {
      id: poolGet(StringPool.pedestalIds, Pedestal.id[eid]), taken: !!Pedestal.taken[eid],
      guardsLeft: Pedestal.guardsLeft[eid], guardsSpawned: !!Pedestal.guardsSpawned[eid],
    });
  }
  if (check(Shrine as any, 'Shrine')) add('Shrine', { lit: !!Shrine.lit[eid] });
  if (check(Door as any, 'Door')) add('Door', { open: Door.open[eid], locked: !!Door.locked[eid] });
  if (check(Barrier as any, 'Barrier')) add('Barrier', { active: !!Barrier.active[eid] });
  if (check(Altar as any, 'Altar')) add('Altar', { runes: Altar.runes[eid] });
  if (check(MapState as any, 'MapState')) {
    add('MapState', { width: MapState.width[eid], height: MapState.height[eid], dungeonId: MapState.dungeonId[eid] });
  }
  if (check(Sprite as any, 'Sprite')) add('Sprite', { ref: Sprite.ref[eid] });
  
  // ВАЖНО: Убрана сериализация planck-объектов. Оставлены только безопасные примитивы.
  if (check(PhysicsBody as any, 'PhysicsBody')) {
    const idx = PhysicsBody.body[eid];
    add('PhysicsBody', { index: idx, exists: idx > 0 });
  }
  
  if (check(EnemyAI as any, 'EnemyAI')) {
    add('EnemyAI', {
      path: EnemyAI.path[eid], lightspeedT: EnemyAI.lightspeedT[eid], slowT: EnemyAI.slowT[eid],
      freezeT: EnemyAI.freezeT[eid], flashT: EnemyAI.flashT[eid], lungeT: EnemyAI.lungeT[eid],
      repathT: EnemyAI.repathT[eid], stateT: EnemyAI.stateT[eid], contactCd: EnemyAI.contactCd[eid],
      guardsSpawned: EnemyAI.guardsSpawned[eid],
    });
  }

  // Маркеры
  const markerComponents: Array<{ name: string; arr: Uint8Array }> = [
    { name: 'Hidden', arr: Hidden }, { name: 'Taken', arr: Taken },
    { name: 'Magnet', arr: Magnet }, { name: 'Flashing', arr: Flashing },
  ];
  for (const mc of markerComponents) {
    if (mc.arr[eid]) add(mc.name);
  }
  if (Dead[eid]) add('Dead');

  if (!hasAny) {
    return null;
  }
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
// Маркеры для buildEntityComponents
// ============================================================

const MARKER_COMPONENTS: Array<{ name: string; arr: Uint8Array }> = [
  { name: 'Hidden', arr: Hidden },
  { name: 'Taken', arr: Taken },
  { name: 'Magnet', arr: Magnet },
  { name: 'Flashing', arr: Flashing },
];

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
