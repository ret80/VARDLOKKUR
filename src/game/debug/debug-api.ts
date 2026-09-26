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
  if (!Player[playerEid]) return null;
  
  return {
    eid: playerEid,
    x: Position[playerEid].x,
    y: Position[playerEid].y,
    hp: Health[playerEid].current,
    maxHp: Player[playerEid].maxHp,
    arrows: 0,
    runes: Player[playerEid].runes,
    hearts: 0,
    dead: !!Dead[playerEid],
    moving: Player[playerEid].moving,
    swingT: Player[playerEid].swingT,
    hurtT: Player[playerEid].hurtT,
    slowT: Player[playerEid].slowT,
    hasSword: Player[playerEid].hasSword,
  };
}

/** Получить список всех врагов */
export function getEnemiesState(world: World): DebugEnemy[] {
  const enemies: DebugEnemy[] = [];
  
  for (const eid of query(world, [Enemy, Position])) {
    const en = Enemy[eid];
    const pos = Position[eid];
    const hp = Health[eid];
    if (!en || !pos || !hp) continue; // AoS элемент может быть undefined

    const kindIdx = en.kind;
    const kind = poolGet(StringPool.enemyKinds, kindIdx);
    const stateName = getEnemyStateName(en.state);
    const isGhost = kind === 'ghost';

    enemies.push({
      eid,
      kind,
      x: pos.x,
      y: pos.y,
      hp: hp.current,
      maxHp: hp.max,
      state: en.state,
      stateName,
      stateT: en.stateT,
      isGhost,
      leashX: en.leashX,
      leashY: en.leashY,
      aggro: en.aggro,
      fogOnly: en.fogOnly,
      fade: en.fade,
      guardOf: en.guardOf,
      speed: en.speed,
      dmg: en.dmg,
      hidden: en.hidden,
      radius: en.radius,
    });
  }
  
  return enemies;
}

/** Получить список всех дропов */
export function getDropsState(world: World): DebugDrop[] {
  const drops: DebugDrop[] = [];
  
  for (const eid of query(world, [Drop, Position])) {
    const drop = Drop[eid];
    const pos = Position[eid];
    if (!drop || !pos) continue; // AoS элемент может быть undefined

    const kind = poolGet(StringPool.dropKinds, drop.kind);

    drops.push({
      eid,
      kind,
      x: pos.x,
      y: pos.y,
      life: drop.life,
      t: drop.t,
      magnet: drop.magnet,
    });
  }
  
  return drops;
}

/** Получить список всех снарядов */
export function getProjectilesState(world: World): DebugProjectile[] {
  const projectiles: DebugProjectile[] = [];
  
  for (const eid of query(world, [Projectile, Position, Velocity])) {
    const proj = Projectile[eid];
    const pos = Position[eid];
    const vel = Velocity[eid];
    if (!proj || !pos || !vel) continue; // AoS элемент может быть undefined

    const kind = poolGet(StringPool.projectileKinds, proj.kind);

    projectiles.push({
      eid,
      kind,
      x: pos.x,
      y: pos.y,
      vx: vel.x,
      vy: vel.y,
      dmg: proj.dmg,
      life: proj.life,
      dist: proj.dist,
    });
  }
  
  return projectiles;
}

/** Получить список всех NPC */
export function getNpcsState(world: World): DebugNpc[] {
  const npcs: DebugNpc[] = [];
  
  for (const eid of query(world, [NPC, Position])) {
    if (!NPC[eid]) continue;
    
    const id = poolGet(StringPool.npcIds, NPC[eid].id);
    const name = poolGet(StringPool.npcNames, NPC[eid].name);
    
    npcs.push({
      eid,
      id,
      name,
      x: Position[eid].x,
      y: Position[eid].y,
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

    if (hasComponent(world, eid, Position)) {
      entity.components.push('Position');
      componentCounts['Position']++;
      entity.Position = { x: Position[eid].x, y: Position[eid].y };
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Velocity)) {
      entity.components.push('Velocity');
      componentCounts['Velocity']++;
      entity.Velocity = { x: Velocity[eid].x, y: Velocity[eid].y };
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Health)) {
      entity.components.push('Health');
      componentCounts['Health']++;
      entity.Health = { current: Health[eid].current, max: Health[eid].max };
      if (Health[eid].current > 0) aliveEntities++;
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Radius)) {
      entity.components.push('Radius');
      componentCounts['Radius']++;
      entity.Radius = Radius[eid].value;
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Time)) {
      entity.components.push('Time');
      componentCounts['Time']++;
      entity.Time = Time[eid].value;
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Direction)) {
      entity.components.push('Direction');
      componentCounts['Direction']++;
      entity.Direction = { x: Direction[eid].x, y: Direction[eid].y };
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, RenderLayer)) {
      entity.components.push('RenderLayer');
      componentCounts['RenderLayer']++;
      entity.RenderLayer = RenderLayer[eid].value;
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Player)) {
      entity.components.push('Player');
      componentCounts['Player']++;
      if (Player[eid]) {
        entity.Player = {
          moving: Player[eid].moving,
          animT: Player[eid].animT,
          swingT: Player[eid].swingT,
          hurtT: Player[eid].hurtT,
          slowT: Player[eid].slowT,
          hasSword: Player[eid].hasSword,
          runes: Player[eid].runes,
          swingDirX: Player[eid].swingDirX,
          swingDirY: Player[eid].swingDirY,
          aiming: Player[eid].aiming,
          maxHp: Player[eid].maxHp,
        };
      }
      aliveEntities++;
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Enemy)) {
      entity.components.push('Enemy');
      componentCounts['Enemy']++;
      if (Enemy[eid]) {
        entity.Enemy = {
          kind: poolGet(StringPool.enemyKinds, Enemy[eid].kind),
          radius: Enemy[eid].radius,
          facingX: Enemy[eid].facingX,
          facingY: Enemy[eid].facingY,
          t: Enemy[eid].t,
          state: Enemy[eid].state,
          stateName: getEnemyStateName(Enemy[eid].state),
          aggro: Enemy[eid].aggro,
          hidden: Enemy[eid].hidden,
          lungeT: Enemy[eid].lungeT,
          freezeT: Enemy[eid].freezeT,
          flashT: Enemy[eid].flashT,
          seed: Enemy[eid].seed,
          speed: Enemy[eid].speed,
          dmg: Enemy[eid].dmg,
          stateT: Enemy[eid].stateT,
          pathI: Enemy[eid].pathI,
          repathT: Enemy[eid].repathT,
          contactCd: Enemy[eid].contactCd,
          guardOf: Enemy[eid].guardOf,
          guardPedestalEid: Enemy[eid].guardPedestalEid,
          fade: Enemy[eid].fade,
          dropDew: Enemy[eid].dropDew,
          leashX: Enemy[eid].leashX,
          leashY: Enemy[eid].leashY,
          fogOnly: Enemy[eid].fogOnly,
          nearLitShrine: Enemy[eid].nearLitShrine,
        };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Projectile)) {
      entity.components.push('Projectile');
      componentCounts['Projectile']++;
      if (Projectile[eid]) {
        entity.Projectile = {
          kind: poolGet(StringPool.projectileKinds, Projectile[eid].kind),
          dmg: Projectile[eid].dmg,
          life: Projectile[eid].life,
          dist: Projectile[eid].dist,
          returning: Projectile[eid].returning,
          spin: Projectile[eid].spin,
        };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Drop)) {
      entity.components.push('Drop');
      componentCounts['Drop']++;
      if (Drop[eid]) {
        entity.Drop = {
          kind: poolGet(StringPool.dropKinds, Drop[eid].kind),
          t: Drop[eid].t,
          magnet: Drop[eid].magnet,
          life: Drop[eid].life,
        };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, NPC)) {
      entity.components.push('NPC');
      componentCounts['NPC']++;
      if (NPC[eid]) {
        entity.NPC = {
          id: poolGet(StringPool.npcIds, NPC[eid].id),
          name: poolGet(StringPool.npcNames, NPC[eid].name),
        };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Chest)) {
      entity.components.push('Chest');
      componentCounts['Chest']++;
      if (Chest[eid]) {
        entity.Chest = {
          item: poolGet(StringPool.chestItems, Chest[eid].item),
          opened: !!Chest[eid].opened,
        };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Pedestal)) {
      entity.components.push('Pedestal');
      componentCounts['Pedestal']++;
      if (Pedestal[eid]) {
        entity.Pedestal = {
          id: poolGet(StringPool.pedestalIds, Pedestal[eid].id),
          taken: !!Pedestal[eid].taken,
          guardsLeft: Pedestal[eid].guardsLeft,
          guardsSpawned: !!Pedestal[eid].guardsSpawned,
        };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Shrine)) {
      entity.components.push('Shrine');
      componentCounts['Shrine']++;
      if (Shrine[eid]) {
        entity.Shrine = { lit: !!Shrine[eid].lit };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Door)) {
      entity.components.push('Door');
      componentCounts['Door']++;
      if (Door[eid]) {
        entity.Door = { open: Door[eid].open, locked: !!Door[eid].locked };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Barrier)) {
      entity.components.push('Barrier');
      componentCounts['Barrier']++;
      if (Barrier[eid]) {
        entity.Barrier = { active: !!Barrier[eid].active };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Altar)) {
      entity.components.push('Altar');
      componentCounts['Altar']++;
      if (Altar[eid]) {
        entity.Altar = { runes: Altar[eid].runes };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, MapState)) {
      entity.components.push('MapState');
      componentCounts['MapState']++;
      if (MapState[eid]) {
        entity.MapState = {
          width: MapState[eid].width,
          height: MapState[eid].height,
          dungeonId: MapState[eid].dungeonId,
        };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, Sprite)) {
      entity.components.push('Sprite');
      componentCounts['Sprite']++;
      if (Sprite[eid]) {
        entity.Sprite = { ref: Sprite[eid].ref };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, PhysicsBody)) {
      entity.components.push('PhysicsBody');
      componentCounts['PhysicsBody']++;
      if (PhysicsBody[eid]) {
        const idx = PhysicsBody[eid].body;
        entity.PhysicsBody = { index: idx, exists: idx > 0 };
      }
      hasAnyComponent = true;
    }

    if (hasComponent(world, eid, EnemyAI)) {
      entity.components.push('EnemyAI');
      componentCounts['EnemyAI']++;
      if (EnemyAI[eid]) {
        entity.EnemyAI = {
          path: EnemyAI[eid].path,
          lightspeedT: EnemyAI[eid].lightspeedT,
          slowT: EnemyAI[eid].slowT,
          freezeT: EnemyAI[eid].freezeT,
          flashT: EnemyAI[eid].flashT,
          lungeT: EnemyAI[eid].lungeT,
          repathT: EnemyAI[eid].repathT,
          stateT: EnemyAI[eid].stateT,
          contactCd: EnemyAI[eid].contactCd,
          guardsSpawned: EnemyAI[eid].guardsSpawned,
        };
      }
      hasAnyComponent = true;
    }

    const markerComponents: Array<{ name: string; arr: any[] }> = [
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
    const has = hasComponent(world, eid, comp);
    return has;
  };

  if (check(Position as any, 'Position')) add('Position', { x: Position[eid].x, y: Position[eid].y });
  if (check(Velocity as any, 'Velocity')) add('Velocity', { x: Velocity[eid].x, y: Velocity[eid].y });
  if (check(Health as any, 'Health')) add('Health', { current: Health[eid].current, max: Health[eid].max });
  if (check(Radius as any, 'Radius')) add('Radius', Radius[eid].value);
  if (check(Time as any, 'Time')) add('Time', Time[eid].value);
  if (check(Direction as any, 'Direction')) add('Direction', { x: Direction[eid].x, y: Direction[eid].y });
  if (check(RenderLayer as any, 'RenderLayer')) add('RenderLayer', RenderLayer[eid].value);

  if (check(Player as any, 'Player')) {
    if (Player[eid]) {
      add('Player', {
        moving: Player[eid].moving, animT: Player[eid].animT, swingT: Player[eid].swingT,
        hurtT: Player[eid].hurtT, slowT: Player[eid].slowT, hasSword: Player[eid].hasSword,
        runes: Player[eid].runes, swingDirX: Player[eid].swingDirX, swingDirY: Player[eid].swingDirY,
        aiming: Player[eid].aiming, maxHp: Player[eid].maxHp,
      });
    }
  }
  if (check(Enemy as any, 'Enemy')) {
    if (Enemy[eid]) {
      add('Enemy', {
        kind: poolGet(StringPool.enemyKinds, Enemy[eid].kind), radius: Enemy[eid].radius,
        facingX: Enemy[eid].facingX, facingY: Enemy[eid].facingY, t: Enemy[eid].t,
        state: Enemy[eid].state, stateName: getEnemyStateName(Enemy[eid].state),
        aggro: Enemy[eid].aggro, hidden: Enemy[eid].hidden, lungeT: Enemy[eid].lungeT,
        freezeT: Enemy[eid].freezeT, flashT: Enemy[eid].flashT, seed: Enemy[eid].seed,
        speed: Enemy[eid].speed, dmg: Enemy[eid].dmg, stateT: Enemy[eid].stateT,
        pathI: Enemy[eid].pathI, repathT: Enemy[eid].repathT, contactCd: Enemy[eid].contactCd,
        guardOf: Enemy[eid].guardOf, guardPedestalEid: Enemy[eid].guardPedestalEid,
        fade: Enemy[eid].fade, dropDew: Enemy[eid].dropDew, leashX: Enemy[eid].leashX,
        leashY: Enemy[eid].leashY, fogOnly: Enemy[eid].fogOnly, nearLitShrine: Enemy[eid].nearLitShrine,
      });
    }
  }
  if (check(Projectile as any, 'Projectile')) {
    if (Projectile[eid]) {
      add('Projectile', {
        kind: poolGet(StringPool.projectileKinds, Projectile[eid].kind), dmg: Projectile[eid].dmg,
        life: Projectile[eid].life, dist: Projectile[eid].dist, returning: Projectile[eid].returning, spin: Projectile[eid].spin,
      });
    }
  }
  if (check(Drop as any, 'Drop')) {
    if (Drop[eid]) {
      add('Drop', {
        kind: poolGet(StringPool.dropKinds, Drop[eid].kind), t: Drop[eid].t,
        magnet: Drop[eid].magnet, life: Drop[eid].life,
      });
    }
  }
  if (check(NPC as any, 'NPC')) {
    if (NPC[eid]) {
      add('NPC', {
        id: poolGet(StringPool.npcIds, NPC[eid].id), name: poolGet(StringPool.npcNames, NPC[eid].name),
      });
    }
  }
  if (check(Chest as any, 'Chest')) {
    if (Chest[eid]) {
      add('Chest', { item: poolGet(StringPool.chestItems, Chest[eid].item), opened: !!Chest[eid].opened });
    }
  }
  if (check(Pedestal as any, 'Pedestal')) {
    if (Pedestal[eid]) {
      add('Pedestal', {
        id: poolGet(StringPool.pedestalIds, Pedestal[eid].id), taken: !!Pedestal[eid].taken,
        guardsLeft: Pedestal[eid].guardsLeft, guardsSpawned: !!Pedestal[eid].guardsSpawned,
      });
    }
  }
  if (check(Shrine as any, 'Shrine')) {
    if (Shrine[eid]) add('Shrine', { lit: !!Shrine[eid].lit });
  }
  if (check(Door as any, 'Door')) {
    if (Door[eid]) add('Door', { open: Door[eid].open, locked: !!Door[eid].locked });
  }
  if (check(Barrier as any, 'Barrier')) {
    if (Barrier[eid]) add('Barrier', { active: !!Barrier[eid].active });
  }
  if (check(Altar as any, 'Altar')) {
    if (Altar[eid]) add('Altar', { runes: Altar[eid].runes });
  }
  if (check(MapState as any, 'MapState')) {
    if (MapState[eid]) {
      add('MapState', { width: MapState[eid].width, height: MapState[eid].height, dungeonId: MapState[eid].dungeonId });
    }
  }
  if (check(Sprite as any, 'Sprite')) {
    if (Sprite[eid]) add('Sprite', { ref: Sprite[eid].ref });
  }
  
  // ВАЖНО: Убрана сериализация planck-объектов. Оставлены только безопасные примитивы.
  if (check(PhysicsBody as any, 'PhysicsBody')) {
    if (PhysicsBody[eid]) {
      const idx = PhysicsBody[eid].body;
      add('PhysicsBody', { index: idx, exists: idx > 0 });
    }
  }
  
  if (check(EnemyAI as any, 'EnemyAI')) {
    if (EnemyAI[eid]) {
      add('EnemyAI', {
        path: EnemyAI[eid].path, lightspeedT: EnemyAI[eid].lightspeedT, slowT: EnemyAI[eid].slowT,
        freezeT: EnemyAI[eid].freezeT, flashT: EnemyAI[eid].flashT, lungeT: EnemyAI[eid].lungeT,
        repathT: EnemyAI[eid].repathT, stateT: EnemyAI[eid].stateT, contactCd: EnemyAI[eid].contactCd,
        guardsSpawned: EnemyAI[eid].guardsSpawned,
      });
    }
  }

  // Маркеры
  const markerComponents: Array<{ name: string; arr: any[] }> = [
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

const MARKER_COMPONENTS: Array<{ name: string; arr: any[] }> = [
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
  if (playerEid < 0 || !Position[playerEid]) return false;
  Position[playerEid].x = x;
  Position[playerEid].y = y;
  Velocity[playerEid].x = 0;
  Velocity[playerEid].y = 0;
  return true;
}

/** Установить HP игрока */
export function setPlayerHp(world: World, playerEid: number, hp: number): boolean {
  if (playerEid < 0 || !Health[playerEid]) return false;
  Health[playerEid].current = Math.max(0, hp);
  return true;
}

/** Убить игрока */
export function killPlayer(world: World, playerEid: number): boolean {
  if (playerEid < 0 || !Health[playerEid]) return false;
  Health[playerEid].current = 0;
  return true;
}

/** Удалить врага по ID (полная реализация) */
export function removeEnemy(
  world: World,
  eid: number,
  onRemoveSprite?: (sprite: any) => void
): boolean {
  if (eid < 0 || !hasComponent(world, eid, Enemy)) return false;
  if (Dead[eid]) return false;
  
  // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
  Sprite[eid].ref = 0;
  
  const pbIdx = PhysicsBody[eid].body;
  if (pbIdx > 0) {
    PhysicsBodyRegistry[pbIdx - 1] = null as any;
    PhysicsBody[eid].body = 0;
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
    Sprite[eid].ref = 0;
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
    if (!Dead[eid] && poolGet(StringPool.enemyKinds, Enemy[eid].kind) === 'ghost') {
      toRemove.push(eid);
      count++;
    }
  }
  
  for (const eid of toRemove) {
    // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
    Sprite[eid].ref = 0;
    removeEntity(world, eid);
  }
  
  return count;
}

/** Удалить снаряд по ID */
export function removeProjectile(world: World, eid: number): boolean {
  if (eid < 0 || !hasComponent(world, eid, Projectile)) return false;
  
  // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
  Sprite[eid].ref = 0;
  
  removeEntity(world, eid);
  return true;
}

/** Удалить дроп по ID */
export function removeDrop(world: World, eid: number): boolean {
  if (eid < 0 || !hasComponent(world, eid, Drop)) return false;
  
  // Sprite.ref[eid] теперь хранит GraphicsHandle (number), не PixiJS объект
  Sprite[eid].ref = 0;
  
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
