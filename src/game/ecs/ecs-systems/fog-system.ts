/* fog-system.ts — система тумана на основе ECS */

import { query, addEntity, addComponents, removeEntity, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Direction,
  Enemy,
  EnemyState,
  Time,
  RenderLayer,
  Dead,
  Moving,
  Attacking,
  Aiming,
  Frozen,
  Flashing,
  Slowed,
  Returning,
  ShrineLit,
  Hidden,
  Taken,
  Magnet,
  Sprite,
  PhysicsBody,
  EnemyAI,
  poolAdd,
  poolGet,
  StringPool,
} from '../ecs-components';
import { dist2 } from '../../utils';
import { T } from '../../world';
import { audio } from '../../audio';
import { logger } from '../../debug/logger';

// ============================================================
// Конфигурация тумана
// ============================================================

const FOG_WAVE_INTERVAL = 60; // seconds
const FOG_GHOST_HP = 5;
const FOG_GHOST_SPEED = 100;

// ============================================================
// Fog State Interface
// ============================================================

export interface FogState {
  fogTimer: number;
  fogActive: boolean;
  fogLeft: number;
  fogRadius: number;
  fogSpawned: boolean;
  fogWarned: boolean;
  fogAmbient: boolean;
  ghostClangT: number;
}

export function createFogState(): FogState {
  return {
    fogTimer: 60,
    fogActive: false,
    fogLeft: 0,
    fogRadius: 2600,
    fogSpawned: false,
    fogWarned: false,
    fogAmbient: false,
    ghostClangT: 0,
  };
}

// ============================================================
// Обновление тумана
// ============================================================

/** Обновить туман */
export function fogUpdateSystem(
  world: World,
  playerEid: number,
  dt: number,
  rdt: number,
  fogState: FogState,
  map: any,
  flags: any,
  bus: any,
  spawnEnemyInEcs: (kind: string, x: number, y: number) => number,
  getRunes: () => number
): void {
  if (!map || playerEid < 0) return;
  
  const f = flags;
  const px = Position.x[playerEid];
  const py = Position.y[playerEid];
  
  fogState.ghostClangT = Math.max(0, fogState.ghostClangT - dt);
  
  // Disable fog in dungeon or after snake death
  if (map.isDungeon || f.snakeDead) {
    fogState.fogRadius += (2600 - fogState.fogRadius) * Math.min(1, rdt * 0.8);
    if (fogState.fogActive) endWave(fogState, false, bus, getRunes, f);
    return;
  }
  
  // Check zone
  const zn = zoneFor(map, Math.floor(px / T), Math.floor(py / T));
  const inVillage = zn === "Поселение выживших" || zn === "Поселение" || zn === "Воронья Гавань";
  
  // Check altar proximity
  const ax = map.treeAltar.x * T + 8;
  const ay = map.treeAltar.y * T + 8;
  const nearAltar = !f.snakeStarted && dist2(px, py, ax, ay) < 240 * 240;
  
  if (inVillage) {
    if (fogState.fogActive) endWave(fogState, true, bus, getRunes, f);
    fogState.fogRadius += (2600 - fogState.fogRadius) * Math.min(1, rdt * 0.8);
    return;
  }
  
  if (nearAltar) {
    logger.info('fog', `NEAR ALTAR: fogActive=${fogState.fogActive} fogAmbient=${fogState.fogAmbient} px=${px} py=${py}`);
    if (!fogState.fogActive) {
      fogState.fogActive = true;
      fogState.fogAmbient = true;
      audio.setFog(true);
      bus.emit('toast', { msg: 'Саван Древа... оно не отпустит просто так' });
    }
    fogState.fogAmbient = true;
    fogState.fogRadius += (350 - fogState.fogRadius) * Math.min(1, rdt * 0.6);
    ensureGhosts(world, 2, true, map, px, py, spawnEnemyInEcs);
    return;
  }
  
  // Игрок ушёл от алтаря — призраки исчезают
  if (fogState.fogAmbient) {
    logger.info('fog', 'ALTAR LEAVE: emitting fog:altarLeave');
    bus.emit('fog:altarLeave', {});
    endWave(fogState, true, bus, getRunes, f);
  }
  
  if (!fogState.fogActive) {
    fogState.fogTimer -= dt;
    fogState.fogRadius += (2600 - fogState.fogRadius) * Math.min(1, rdt * 0.8);
    
    if (!fogState.fogWarned && fogState.fogTimer < 4 && fogState.fogTimer > 0 && f.hasItem('sword')) {
      fogState.fogWarned = true;
      audio.setFog(true);
      audio.horn();
      bus.emit('toast', { msg: 'Ветер стихает... Туман близко' });
    }
    
    if (fogState.fogTimer <= 0 && f.hasItem('sword')) {
      fogState.fogActive = true;
      fogState.fogLeft = 40;
      fogState.fogSpawned = false;
      fogState.fogRadius = 900;
      audio.setFog(true);
      bus.emit('toast', { msg: 'ВОЛНА ТУМАНА. Ниды шепчут...' });
    }
  } else {
    fogState.fogLeft -= dt;
    fogState.fogRadius += (140 - fogState.fogRadius) * Math.min(1, rdt * 0.35);
    
    if (!fogState.fogSpawned && fogState.fogLeft < 38) {
      fogState.fogSpawned = true;
      ensureGhosts(world, 2 + Math.floor(getRunes() / 2), false, map, px, py, spawnEnemyInEcs);
    }
    
    if (fogState.fogLeft <= 0) endWave(fogState, true, bus, getRunes, f);
  }
}

function zoneFor(map: any, tx: number, ty: number): string {
  if (!map.zones) return '';
  for (const z of map.zones) {
    if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) {
      return z.name;
    }
  }
  return '';
}

function endWave(state: FogState, dropDew: boolean, bus: any, getRunes: () => number, flags: any) {
  logger.info('fog', 'endWave: resetting fogActive, fogAmbient, fogSpawned');
  state.fogActive = false;
  state.fogWarned = false;
  state.fogAmbient = false;
  state.fogSpawned = false;
  state.fogLeft = 0;
  state.fogTimer = Math.max(60, 80 - getRunes() * 4 + Math.random() * 30);
  
  if (flags) {
    flags.fogWaves = (flags.fogWaves || 0) + 1;
  }
  
  audio.setFog(false);
  bus.emit('toast', { msg: 'Туман рассеялся' });
  bus.emit('fog:waveEnd', { dropDew });
  bus.emit('fog:ghostDissipate', {});
}

export function ensureGhosts(
  world: World,
  n: number,
  leashed: boolean,
  map: any,
  cx: number,
  cy: number,
  spawnEnemyInEcs: (kind: string, x: number, y: number) => number
) {
  const T = 16;
  // Count alive ghosts
  let alive = 0;
  let totalEnemy = 0;
  for (const eid of query(world, [Enemy])) {
    totalEnemy++;
    const kind = poolGet(StringPool.enemyKinds, Enemy.kind[eid]);
    const state = Enemy.state[eid];
    if (kind === 'ghost') {
      logger.debug('fog', `ensureGhosts: ghost eid=${eid} state=${state} dissipate=${EnemyState.dissipate}`);
      if (state !== EnemyState.dissipate) {
        alive++;
      }
    }
  }
  logger.debug('fog', `ensureGhosts: n=${n} leashed=${leashed} alive=${alive} totalEnemy=${totalEnemy}`);
  
  const altarX = map.treeAltar.x * T + 8;
  const altarY = map.treeAltar.y * T + 8;
  const targetCx = leashed ? altarX : cx;
  const targetCy = leashed ? altarY : cy;
  logger.debug('fog', `ensureGhosts: targetCx=${targetCx} targetCy=${targetCy} limit=${Math.min(4, n)}`);
  
  for (let i = alive; i < Math.min(4, n); i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 110 + Math.random() * 60;
    const x = targetCx + Math.cos(a) * d;
    const y = targetCy + Math.sin(a) * d;
    
    if (x < T || y < T || x > (map.W - 1) * T || y > (map.H - 1) * T) continue;
    
    const eid = spawnEnemyInEcs('ghost', x, y);
    Enemy.aggro[eid] = 1;
    Enemy.state[eid] = EnemyState.appear;
    Enemy.stateT[eid] = 1.5 + Math.random() * 0.5;
    Enemy.fogOnly[eid] = 1;
    // Привязка к алтарю
    if (leashed) {
      Enemy.leashX[eid] = altarX;
      Enemy.leashY[eid] = altarY;
    }
  }
}

/** Спавн призрака тумана */
export function spawnFogGhost(
  world: World,
  x: number,
  y: number,
  targetEid: number
): number {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Velocity, Health, Radius, Enemy, EnemyAI, Time, RenderLayer);

  Position.x[eid] = x;
  Position.y[eid] = y;
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  Health.current[eid] = FOG_GHOST_HP;
  Health.max[eid] = FOG_GHOST_HP;
  Radius.value[eid] = 6;
  Time.value[eid] = 0;
  RenderLayer.value[eid] = 50;

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
  Enemy.speed[eid] = FOG_GHOST_SPEED;
  Enemy.dmg[eid] = 1;
  Enemy.stateT[eid] = 0;
  Enemy.pathI[eid] = 0;
  Enemy.repathT[eid] = 0.5;
  Enemy.contactCd[eid] = 0;
  Enemy.guardOf[eid] = -1;
  Enemy.fade[eid] = 0;
  Enemy.dropDew[eid] = 0;
  EnemyAI.path[eid] = 0;

  return eid;
}
