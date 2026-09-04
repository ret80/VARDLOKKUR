/* ai-system.ts — AI система врагов на основе ECS */

import { query, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Direction,
  Enemy,
  EnemyAI,
  Time,
  Dead,
  Hidden,
  Moving,
  Frozen,
  Flashing,
  Magnet,
  Taken,
  Attacking,
  Aiming,
} from '../ecs-components';
import { dist2 } from '../../utils';
import type { EnemyKind } from '../../generators/types';
import { solidTileAt, T, zoneFor, type WorldData } from '../../world';

// ============================================================
// Конфигурация AI
// ============================================================

const DETECTION_RANGE = 120;
const AGGRO_RANGE = 100;
const PATH_REPATH_TIME = 0.5;
const CONTACT_COOLDOWN = 0.5;

// ============================================================
// Базовое обновление AI
// ============================================================

/** Обновить все вражеские AI */
export function aiUpdateSystem(
  world: World,
  playerEid: number,
  map: WorldData | null,
  dt: number,
  onEnemySpawned: (eid: number) => void,
  onEnemyDied: (eid: number) => void
): void {
  if (playerEid < 0 || !map) return;

  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const { x: dx, y: dy } = Direction;
  const { value: r } = Radius;
  const t = Time.value;

  const playerX = px[playerEid];
  const playerY = py[playerEid];

  // Get zone info
  const zone = zoneFor(map, Math.floor(playerX / T), Math.floor(playerY / T));
  const inVillage = zone === 'Поселение выживших' || zone === 'Воронья Гавань';

  for (const enemyEid of query(world, [Enemy, Position, Velocity, Health])) {
    if (Dead[enemyEid]) continue;

    const e = Enemy[enemyEid];
    if (!e) continue;

    // Common updates
    t[enemyEid] += dt;
    e.flashT = Math.max(0, e.flashT - dt);
    e.contactCd = Math.max(0, e.contactCd - dt);
    e.lungeT = Math.max(0, e.lungeT - dt);

    // Frozen enemies skip AI
    if (e.freezeT > 0) {
      continue;
    }

    // Apply behavior based on kind
    switch (e.kind) {
      case 'draugr':
        updateDraugr(world, enemyEid, playerEid, playerX, playerY, map, dt, inVillage);
        break;
      case 'varg':
        updateVarg(world, enemyEid, playerEid, playerX, playerY, map, dt, inVillage);
        break;
      case 'raven':
        updateRaven(world, enemyEid, playerEid, playerX, playerY, map, dt);
        break;
      case 'shroom':
        updateShroom(world, enemyEid, playerEid, playerX, playerY, dt);
        break;
      case 'crawler':
        updateCrawler(world, enemyEid, playerEid, playerX, playerY, map, dt);
        break;
      case 'frost':
        updateFrost(world, enemyEid, playerEid, playerX, playerY, map, dt, inVillage);
        break;
      case 'ghost':
        updateGhost(world, enemyEid, playerEid, playerX, playerY, map, dt);
        break;
      // Bosses (reaper, spider, giant, snake) — handled separately
    }
  }
}

// ============================================================
// Поведения врагов
// ============================================================

/** Draugr — медленный, преследует */
function updateDraugr(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, inVillage: boolean
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);

  if (dist < AGGRO_RANGE && !inVillage) {
    e.aggro = true;
    e.state = 'chase';
    // Move toward player
    const dx = playerX - px[eid];
    const dy = playerY - py[eid];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) {
      vx[eid] = (dx / d) * e.speed;
      vy[eid] = (dy / d) * e.speed;
    }
  } else {
    e.aggro = false;
    e.state = 'idle';
    vx[eid] = 0;
    vy[eid] = 0;
  }
}

/** Varg — быстрый, прыгает на игрока */
function updateVarg(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, inVillage: boolean
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);

  if (dist < AGGRO_RANGE && !inVillage) {
    e.aggro = true;
    if (e.state === 'idle' && e.lungeT <= 0) {
      e.state = 'lunge';
      e.lungeT = 0.5;
    }
    if (e.lungeT > 0) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        vx[eid] = (dx / d) * e.speed * 1.5;
        vy[eid] = (dy / d) * e.speed * 1.5;
      }
    } else {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        vx[eid] = (dx / d) * e.speed;
        vy[eid] = (dy / d) * e.speed;
      }
    }
  } else {
    e.aggro = false;
    e.state = 'idle';
    vx[eid] = 0;
    vy[eid] = 0;
  }
}

/** Raven — летает, атакует с воздуха */
function updateRaven(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);

  if (dist < DETECTION_RANGE) {
    e.aggro = true;
    e.state = 'fly';
    const dx = playerX - px[eid];
    const dy = playerY - py[eid];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) {
      vx[eid] = (dx / d) * e.speed;
      vy[eid] = (dy / d) * e.speed;
    }
  } else {
    e.aggro = false;
    e.state = 'idle';
    // Hover
    vx[eid] = Math.sin(Time.value[eid] * 3) * 20;
    vy[eid] = Math.cos(Time.value[eid] * 2) * 15;
  }
}

/** Shroom — заряжается и бросается */
function updateShroom(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);

  if (dist < AGGRO_RANGE && e.state !== 'charge') {
    e.state = 'charge';
    e.stateT = 1.0; // charge time
  }

  if (e.state === 'charge') {
    e.stateT -= dt;
    if (e.stateT <= 0) {
      // Lunge!
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        vx[eid] = (dx / d) * e.speed * 2;
        vy[eid] = (dy / d) * e.speed * 2;
      }
      e.state = 'lunge';
      e.lungeT = 0.3;
    }
  } else if (e.state === 'lunge' && e.lungeT <= 0) {
    e.state = 'idle';
    vx[eid] = 0;
    vy[eid] = 0;
  }
}

/** Crawler — прячется, атакует при приближении */
function updateCrawler(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);

  if (!e.hidden && dist > 60) {
    e.hidden = true;
  } else if (e.hidden && dist < 30) {
    e.hidden = false;
    e.state = 'attack';
  }

  if (!e.hidden) {
    const dx = playerX - px[eid];
    const dy = playerY - py[eid];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) {
      vx[eid] = (dx / d) * e.speed;
      vy[eid] = (dy / d) * e.speed;
    }
  } else {
    vx[eid] = 0;
    vy[eid] = 0;
  }
}

/** Frost — стреляет ледяными снарядами */
function updateFrost(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, inVillage: boolean
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);

  if (dist < AGGRO_RANGE && !inVillage) {
    e.aggro = true;
    e.state = 'chase';
    const dx = playerX - px[eid];
    const dy = playerY - py[eid];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) {
      vx[eid] = (dx / d) * e.speed * 0.7;
      vy[eid] = (dy / d) * e.speed * 0.7;
    }
  } else {
    e.aggro = false;
    e.state = 'idle';
    vx[eid] = 0;
    vy[eid] = 0;
  }
}

/** Ghost — летает сквозь стены, появляется/исчезает */
function updateGhost(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dist = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);

  // Fade in/out
  if (e.fade < 1 && dist < DETECTION_RANGE) {
    e.fade = Math.min(1, e.fade + dt * 0.5);
  } else if (e.fade > 0 && dist > DETECTION_RANGE * 1.5) {
    e.fade = Math.max(0, e.fade - dt * 0.5);
  }

  if (e.fade > 0) {
    e.aggro = dist < AGGRO_RANGE;
    if (e.aggro) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        vx[eid] = (dx / d) * e.speed;
        vy[eid] = (dy / d) * e.speed;
      }
    } else {
      // Drift
      vx[eid] = Math.sin(Time.value[eid] * 1.5 + e.seed) * 30;
      vy[eid] = Math.cos(Time.value[eid] * 1.2 + e.seed) * 25;
    }
  }
}
