/* fog-system.ts — система тумана на основе ECS */

import { query, addEntity, addComponents, removeEntity, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Direction,
  Enemy,
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
} from '../ecs-components';

// ============================================================
// Конфигурация тумана
// ============================================================

const FOG_WAVE_INTERVAL = 60; // seconds
const FOG_GHOST_HP = 5;
const FOG_GHOST_SPEED = 100;

// ============================================================
// Обновление тумана
// ============================================================

/** Обновить туман */
export function fogUpdateSystem(
  world: World,
  playerEid: number,
  dt: number,
  fogWaves: number,
  onGhostSpawned: (eid: number) => void,
  onWaveComplete: (wave: number) => void
): { fogWaves: number; active: boolean } {
  if (playerEid < 0) return { fogWaves, active: false };

  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const t = Time.value;

  // Update ghost timers
  for (const eid of query(world, [Enemy, Time])) {
    const e = Enemy[eid];
    if (!e || Dead[eid]) continue;

    // Ghosts fade in
    if (e.kind === 'ghost' && e.fade < 1) {
      e.fade = Math.min(1, e.fade + dt * 0.3);
    }

    // Ghost dissipation
    if (e.state === 'dissipate') {
      e.fade -= dt * 0.5;
      if (e.fade <= 0) {
        removeEntity(world, eid);
        continue;
      }
    }
  }

  return { fogWaves, active: fogWaves > 0 };
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

  Enemy[eid] = {
    kind: 'ghost',
    facingX: 1, facingY: 0,
    t: 0, state: 'appear',
    aggro: true, hidden: false,
    lungeT: 0, freezeT: 0, flashT: 0,
    seed: Math.random() * 100,
    speed: FOG_GHOST_SPEED, dmg: 1,
    stateT: 0, pathI: 0, repathT: 0.5,
    contactCd: 0, guardOf: -1,
    fade: 0, dropDew: false,
  };
  EnemyAI[eid] = { path: null };

  return eid;
}
