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
      vx[enemyEid] = 0;
      vy[enemyEid] = 0;
      continue;
    }

    // Compute aggro (common for non-boss enemies)
    const px_e = px[enemyEid];
    const py_e = py[enemyEid];
    const d2p = (px_e - playerX) ** 2 + (py_e - playerY) ** 2;
    const isFlyer = e.kind === 'raven' || e.kind === 'ghost';
    const aggroR = e.kind === 'raven' ? 150 : e.kind === 'crawler' ? 42 : e.kind === 'ghost' ? 160 : 100;

    // Apply aggro rules (original logic)
    if (inVillage && e.aggro) { e.aggro = false; }
    if (!e.aggro && !inVillage && d2p < aggroR * aggroR) e.aggro = true;
    if (e.aggro && !isFlyer && d2p > 300 * 300) { e.aggro = false; }
    if (e.aggro && isFlyer && d2p > 300 * 300) e.aggro = false;

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
      case 'reaper':
        updateReaper(world, enemyEid, playerEid, playerX, playerY, map, dt);
        break;
      case 'spider':
        updateSpider(world, enemyEid, playerEid, playerX, playerY, map, dt);
        break;
      case 'giant':
        updateGiant(world, enemyEid, playerEid, playerX, playerY, map, dt);
        break;
      case 'snake':
        updateSnake(world, enemyEid, playerEid, playerX, playerY, map, dt);
        break;
    }
  }
}

// ============================================================
// Поведения врагов
// ============================================================

/** Draugr — преследует, idle wander */
function updateDraugr(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, inVillage: boolean
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const stopD = Enemy[eid].radius + 5 + 2;

  if (e.aggro) {
    if (d > stopD + 1) {
      // followPath not available in ECS — direct toward player
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      vx[eid] = (dx / dd) * e.speed;
      vy[eid] = (dy / dd) * e.speed;
    }
    if (d > 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction.x[eid] = dx / dd;
      Direction.y[eid] = dy / dd;
    }
  } else if (Math.floor(e.t) % 4 === 0) {
    vx[eid] = Math.sin(e.t * 0.7 + e.seed) * e.speed * 0.3;
  } else {
    vx[eid] = 0;
    vy[eid] = 0;
  }
}

/** Varg — лунг-атака, преследование */
function updateVarg(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, inVillage: boolean
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const stopD = Enemy[eid].radius + 5 + 2;

  if (e.aggro) {
    if (d > 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction.x[eid] = dx / dd;
      Direction.y[eid] = dy / dd;
    }
    if (e.stateT > 0) {
      e.stateT -= dt;
      vx[eid] = Direction.x[eid] * e.speed * 2.0;
      vy[eid] = Direction.y[eid] * e.speed * 2.0;
      if (e.stateT <= 0) e.lungeT = 1.0;
    } else if (d < 46 && e.lungeT <= 0) {
      e.stateT = 0.35;
      // audio.swing();
    } else if (d > stopD + 1) {
      // followPath not available in ECS — direct toward player
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      vx[eid] = (dx / dd) * e.speed;
      vy[eid] = (dy / dd) * e.speed;
    }
  } else {
    vx[eid] = Math.sin(e.t * 0.9 + e.seed) * e.speed * 0.35;
    vy[eid] = Math.cos(e.t * 0.7 + e.seed) * e.speed * 0.35;
    if (vx[eid] !== 0 || vy[eid] !== 0) {
      const m2 = Math.sqrt(vx[eid] * vx[eid] + vy[eid] * vy[eid]);
      Direction.x[eid] = vx[eid] / m2;
      Direction.y[eid] = vy[eid] / m2;
    }
  }
}

/** Raven — орбитальное поведение + dive атака */
function updateRaven(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);

  if (e.aggro) {
    if (e.state !== 'dive') {
      e.stateT -= dt;
      const orbit = 34 + Math.sin(e.t * 2 + e.seed) * 8;
      const tang = Math.atan2(playerY - py[eid], playerX - px[eid]) + Math.PI / 2;
      const radial = d > orbit ? 1 : -0.6;
      vx[eid] = Math.cos(tang) * e.speed * 0.8 + ((playerX - px[eid]) / (d || 1)) * e.speed * 0.5 * radial;
      vy[eid] = Math.sin(tang) * e.speed * 0.8 + ((playerY - py[eid]) / (d || 1)) * e.speed * 0.5 * radial;
      if (d < 52 && e.stateT <= 0) {
        e.state = 'dive';
        e.stateT = 0.55;
        const dd = Math.sqrt((playerX - px[eid]) ** 2 + (playerY - py[eid]) ** 2) || 1;
        Direction.x[eid] = (playerX - px[eid]) / dd;
        Direction.y[eid] = (playerY - py[eid]) / dd;
      }
    } else {
      e.stateT -= dt;
      vx[eid] = Direction.x[eid] * e.speed * 2.2;
      vy[eid] = Direction.y[eid] * e.speed * 2.2;
      if (e.stateT <= 0) { e.state = 'hover'; e.stateT = 1.4; }
    }
  } else {
    vx[eid] = Math.sin(e.t * 1.2 + e.seed) * 30;
    vy[eid] = Math.cos(e.t * 0.9 + e.seed) * 24;
  }
  if (vx[eid] !== 0) Direction.x[eid] = vx[eid] >= 0 ? 1 : -1;
}

/** Shroom — стреляет спорами когда видит игрока */
function updateShroom(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const d2p = (px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2;
  const sees = e.aggro && d2p < 105 * 105;

  if (sees) {
    Direction.x[eid] = Math.sign(playerX - px[eid]) || 1;
    Direction.y[eid] = 0;
    if (d < 40) {
      vx[eid] = ((px[eid] - playerX) / d) * 40;
      vy[eid] = ((py[eid] - playerY) / d) * 40;
    }
    e.stateT -= dt;
    if (e.state === 'cool') {
      if (e.stateT <= 0) { e.state = 'charge'; e.stateT = 0.7; }
    } else if (e.state !== 'charge') {
      e.state = 'charge';
      e.stateT = 0.7;
    } else if (e.stateT <= 0) {
      e.state = 'cool';
      e.stateT = 2.5;
      // Shoot spore projectile toward player
      // bus.emit("projectile:fire", { kind: "spore", x: px[eid], y: py[eid] - 4, vx: ((playerX - px[eid]) / d) * 74, vy: ((playerY - py[eid]) / d) * 74, dmg: 1 });
    }
  } else {
    e.state = 'idle';
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

  const d2p = (px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2;
  const d = Math.sqrt(d2p);
  const stopD = Enemy[eid].radius + 5 + 2;

  if (e.hidden) {
    if (d2p < 40 * 40) {
      e.hidden = false;
      // audio.splash();
      e.aggro = true;
    }
    return;
  }
  if (e.aggro) {
    if (d > 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction.x[eid] = dx / dd;
      Direction.y[eid] = dy / dd;
    }
    if (d > stopD) { vx[eid] = Direction.x[eid] * e.speed; vy[eid] = Direction.y[eid] * e.speed; }
  }
}

/** Frost — идентичен Draugr */
function updateFrost(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, inVillage: boolean
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const stopD = Enemy[eid].radius + 5 + 2;

  if (e.aggro) {
    if (d > stopD + 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      vx[eid] = (dx / dd) * e.speed;
      vy[eid] = (dy / dd) * e.speed;
    }
    if (d > 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction.x[eid] = dx / dd;
      Direction.y[eid] = dy / dd;
    }
  } else if (Math.floor(e.t) % 4 === 0) {
    vx[eid] = Math.sin(e.t * 0.7 + e.seed) * e.speed * 0.3;
  } else {
    vx[eid] = 0;
    vy[eid] = 0;
  }
}

/** Ghost — dissipate + shrine repulsion + orbital dive */
function updateGhost(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const d2p = (px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2;

  // Dissipate phase (when fog ghost fading out)
  if (e.state === 'dissipate') {
    e.fade = Math.max(0, (e.fade ?? 0.85) - dt / 2);
    vx[eid] = Math.sin(e.t * 1.3 + e.seed) * 12;
    vy[eid] = -14;
    if (e.fade <= 0) {
      if (e.dropDew) {
        // bus.emit("drop:spawn", { kind: "dew", x: px[eid], y: py[eid], life: 40 });
      }
      Dead[eid] = true;
    }
    return;
  }

  // Fade in
  if ((e.fade ?? 0) < 0.85) e.fade = Math.min(0.85, (e.fade ?? 0) + dt / 1.5);

  let repX = 0, repY = 0;
  // TODO: shrine repulsion - check distance to shrines

  if (repX || repY) { vx[eid] = repX; vy[eid] = repY; return; }

  // Leash mechanic (snake leash)
  if (e.leash) {
    const leashDist = Math.sqrt((px[eid] - e.leash.x) ** 2 + (py[eid] - e.leash.y) ** 2);
    if (leashDist > 260 * 260) {
      const ld = Math.sqrt((e.leash.x - px[eid]) ** 2 + (e.leash.y - py[eid]) ** 2) || 1;
      vx[eid] = ((e.leash.x - px[eid]) / ld) * e.speed;
      vy[eid] = ((e.leash.y - py[eid]) / ld) * e.speed;
      return;
    }
  }

  if (e.aggro) {
    if (e.state === 'dive') {
      e.stateT -= dt;
      vx[eid] = Direction.x[eid] * e.speed * 2.4;
      vy[eid] = Direction.y[eid] * e.speed * 2.4;
      if (e.stateT <= 0) {
        e.state = 'hover';
        e.stateT = 1.5 + Math.random() * 1.0;
      }
    } else {
      e.stateT -= dt;
      const orbit = 30 + Math.sin(e.t * 2 + e.seed) * 8;
      const tang = Math.atan2(playerY - py[eid], playerX - px[eid]) + Math.PI / 2;
      const radial = d > orbit ? 1 : -0.6;
      vx[eid] = Math.cos(tang) * e.speed * 0.9 + ((playerX - px[eid]) / (d || 1)) * e.speed * 0.6 * radial;
      vy[eid] = Math.sin(tang) * e.speed * 0.9 + ((playerY - py[eid]) / (d || 1)) * e.speed * 0.6 * radial;
      if (e.stateT <= 0) {
        e.state = 'dive';
        e.stateT = 0.55;
        const dd = Math.sqrt((playerX - px[eid]) ** 2 + (playerY - py[eid]) ** 2) || 1;
        Direction.x[eid] = (playerX - px[eid]) / dd;
        Direction.y[eid] = (playerY - py[eid]) / dd;
      }
    }
  } else {
    vx[eid] = Math.sin(e.t * 1.1 + e.seed) * 26;
    vy[eid] = Math.cos(e.t * 0.8 + e.seed) * 20 - 6;
  }
  if (vx[eid] !== 0) Direction.x[eid] = vx[eid] >= 0 ? 1 : -1;
}

// ============================================================
// Босс-AI: Жнец (Reaper)
// ============================================================

/** Reaper — enter → chase → wind → swing → stuck (phase2 at HP ≤ 50%) */
function updateReaper(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dx = playerX - px[eid];
  const dy = playerY - py[eid];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    Direction.x[eid] = dx / d;
    Direction.y[eid] = dy / d;
  }

  const phase2 = Health.current[eid] <= Health.max[eid] / 2;
  const spd = phase2 ? 72 : e.speed;

  e.stateT -= dt;

  switch (e.state) {
    case 'enter':
      if (e.stateT <= 0) { e.state = 'chase'; e.stateT = phase2 ? 1.4 : 2.2; }
      break;
    case 'chase':
      if (d > Enemy[eid].radius + 5 + 4) {
        vx[eid] = Direction.x[eid] * spd;
        vy[eid] = Direction.y[eid] * spd;
      } else {
        vx[eid] = 0;
        vy[eid] = 0;
      }
      if (e.stateT <= 0 || d < 30) {
        e.state = 'wind';
        e.stateT = phase2 ? 0.42 : 0.6;
        vx[eid] = 0;
        vy[eid] = 0;
      }
      break;
    case 'wind':
      vx[eid] = 0;
      vy[eid] = 0;
      if (e.stateT <= 0) { e.state = 'swing'; e.stateT = 0.26; }
      break;
    case 'swing':
      vx[eid] = 0;
      vy[eid] = 0;
      // Contact damage during swing
      if (e.contactCd <= 0 && d < 40) {
        // Damage player via bus
      }
      e.contactCd = Math.max(0, e.contactCd - dt);
      if (e.stateT <= 0) {
        e.state = 'stuck';
        e.stateT = phase2 ? 1.25 : 1.8;
      }
      break;
    case 'stuck':
      vx[eid] = 0;
      vy[eid] = 0;
      if (e.stateT <= 0) { e.state = 'chase'; e.stateT = phase2 ? 1.4 : 2.2; }
      break;
  }

  // Common contact damage (reaper close contact)
  if (e.contactCd <= 0 && d < Enemy[eid].radius + 5 + 4) {
    // bus.emit("player:damaged", { dmg: 1, sx: px[eid], sy: py[eid] });
    e.contactCd = 1.1;
  }
}

// ============================================================
// Босс-AI: Паук (Spider)
// ============================================================

/** Spider — enter → aim → ring (shoots spores), spawns crawlers */
function updateSpider(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dx = playerX - px[eid];
  const dy = playerY - py[eid];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    Direction.x[eid] = dx / d;
    Direction.y[eid] = dy / d;
  }

  e.stateT -= dt;
  vx[eid] = 0;
  vy[eid] = 0;

  if (e.state === 'enter') {
    if (e.stateT <= 0) { e.state = 'aim'; e.stateT = 1.2; }
  } else if (e.state === 'aim') {
    if (e.stateT <= 0) {
      // Shoot 3 spores in a fan toward player
      // bus.emit("projectile:fire", { kind: "spore", x: px[eid], y: py[eid] - 6, vx: Math.cos(base) * 110, vy: Math.sin(base) * 110, dmg: 1 });
      e.state = 'ring';
      e.stateT = 1.8;
    }
  } else if (e.state === 'ring') {
    if (e.stateT <= 0) {
      // Shoot 8 spores in a ring
      // bus.emit("projectile:fire", { kind: "spore", x: px[eid], y: py[eid] - 6, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, dmg: 1 });
      e.state = 'aim';
      e.stateT = 1.4;
    }
  }

  // Randomly spawn crawlers
  if (Math.random() < dt * 0.12) {
    // spawn crawler near spider
  }

  // Contact damage
  if (e.contactCd <= 0 && d < Enemy[eid].radius + 5 + 4) {
    // bus.emit("player:damaged", { dmg: 1, sx: px[eid], sy: py[eid] });
    e.contactCd = 1.1;
  }
}

// ============================================================
// Босс-AI: Великан (Giant)
// ============================================================

/** Giant — enter → chase → wind → swing → stuck (phase2 at HP ≤ 50%) */
function updateGiant(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  const dx = playerX - px[eid];
  const dy = playerY - py[eid];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    Direction.x[eid] = dx / d;
    Direction.y[eid] = dy / d;
  }

  const phase2 = Health.current[eid] <= Health.max[eid] / 2;
  const spd = phase2 ? 58 : e.speed;

  e.stateT -= dt;

  switch (e.state) {
    case 'enter':
      if (e.stateT <= 0) { e.state = 'chase'; e.stateT = 2.0; }
      break;
    case 'chase':
      if (d > Enemy[eid].radius + 5 + 4) {
        vx[eid] = Direction.x[eid] * spd;
        vy[eid] = Direction.y[eid] * spd;
      } else {
        vx[eid] = 0;
        vy[eid] = 0;
      }
      if (e.stateT <= 0 || d < 34) {
        e.state = 'wind';
        e.stateT = phase2 ? 0.4 : 0.62;
        vx[eid] = 0;
        vy[eid] = 0;
      }
      break;
    case 'wind':
      vx[eid] = 0;
      vy[eid] = 0;
      if (e.stateT <= 0) {
        e.state = 'swing';
        e.stateT = 0.3;
      }
      break;
    case 'swing':
      vx[eid] = 0;
      vy[eid] = 0;
      if (e.contactCd <= 0 && d < 46) {
        // bus.emit("player:damaged", { dmg: 2, sx: px[eid], sy: py[eid] });
      }
      e.contactCd = Math.max(0, e.contactCd - dt);
      if (e.stateT <= 0) {
        e.state = 'stuck';
        e.stateT = phase2 ? 1.1 : 1.7;
      }
      break;
    case 'stuck':
      vx[eid] = 0;
      vy[eid] = 0;
      if (e.stateT <= 0) { e.state = 'chase'; e.stateT = 2.0; }
      break;
  }

  // Common contact damage
  if (e.contactCd <= 0 && d < Enemy[eid].radius + 5 + 4) {
    // bus.emit("player:damaged", { dmg: 2, sx: px[eid], sy: py[eid] });
    e.contactCd = 1.1;
  }
}

// ============================================================
// Босс-AI: Ёрмунганд (Snake)
// ============================================================

/** Snake — closed → open phases, shoots fire projectiles from mouth */
function updateSnake(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const e = Enemy[eid];
  if (!e) return;

  // Snake doesn't move
  vx[eid] = 0;
  vy[eid] = 0;

  e.stateT -= dt;

  const mouthX = px[eid] + Math.sin(0 /* realT */ * 1.6) * 4;
  const mouthY = py[eid] - 2;

  if (e.state === 'closed') {
    if (e.stateT <= 1.5 && e.seed > 0.5) {
      e.seed = 0.2;
      // Fire 3 fire projectiles toward player
      // const base = Math.atan2(playerY - mouthY, playerX - mouthX);
      // for (let i = -1; i <= 1; i++) {
      //   const a = base + i * 0.3;
      //   bus.emit("projectile:fire", { kind: "fire", x: mouthX, y: mouthY, vx: Math.cos(a) * 84, vy: Math.sin(a) * 84, dmg: 1 });
      // }
    }
    if (e.stateT <= 0.7 && e.seed < 0.5) {
      e.seed = -1;
    }
    if (e.stateT <= 0) { e.state = 'open'; e.stateT = 3.0; }
  } else if (e.state === 'open') {
    if (e.stateT <= 0) { e.state = 'closed'; e.stateT = 3.8; e.seed = 1; }
  } else {
    // Default: start closed
    e.state = 'closed';
    e.stateT = 3.8;
    e.seed = 1;
  }
}
