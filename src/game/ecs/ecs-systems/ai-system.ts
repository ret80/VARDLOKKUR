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
  EnemyState,
  poolGet,
  StringPool,
  EnemyAIRegistry,
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
    if (!!Dead[enemyEid]) continue;

    // Common updates
    Time.value[enemyEid] += dt;
    Enemy.flashT[enemyEid] = Math.max(0, Enemy.flashT[enemyEid] - dt);
    Enemy.contactCd[enemyEid] = Math.max(0, Enemy.contactCd[enemyEid] - dt);
    Enemy.lungeT[enemyEid] = Math.max(0, Enemy.lungeT[enemyEid] - dt);

    // Frozen enemies skip AI
    if (Enemy.freezeT[enemyEid] > 0) {
      vx[enemyEid] = 0;
      vy[enemyEid] = 0;
      continue;
    }

    // Compute aggro (common for non-boss enemies)
    const px_e = px[enemyEid];
    const py_e = py[enemyEid];
    const d2p = (px_e - playerX) ** 2 + (py_e - playerY) ** 2;
    const ek = poolGet(StringPool.enemyKinds, Enemy.kind[enemyEid]);
    const isFlyer = ek === 'raven' || ek === 'ghost';
    const aggroR = ek === 'raven' ? 150 : ek === 'crawler' ? 42 : ek === 'ghost' ? 160 : 100;

    // Apply aggro rules (original logic)
    if (inVillage && !!Enemy.aggro[enemyEid]) { Enemy.aggro[enemyEid] = 0; }
    if (!!!Enemy.aggro[enemyEid] && !inVillage && d2p < aggroR * aggroR) Enemy.aggro[enemyEid] = 1;
    if (!!Enemy.aggro[enemyEid] && !isFlyer && d2p > 300 * 300) { Enemy.aggro[enemyEid] = 0; }
    if (!!Enemy.aggro[enemyEid] && isFlyer && d2p > 300 * 300) Enemy.aggro[enemyEid] = 0;

    // Apply behavior based on kind
    switch (ek) {
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

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const stopD = Enemy.radius[eid] + 5 + 2;

  if (!!Enemy.aggro[eid]) {
    if (d > stopD + 1) {
      // followPath not available in ECS — direct toward player
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      vx[eid] = (dx / dd) * Enemy.speed[eid];
      vy[eid] = (dy / dd) * Enemy.speed[eid];
    }
    if (d > 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction.x[eid] = dx / dd;
      Direction.y[eid] = dy / dd;
    }
  } else if (Math.floor(Enemy.t[eid]) % 4 === 0) {
    vx[eid] = Math.sin(Enemy.t[eid] * 0.7 + Enemy.seed[eid]) * Enemy.speed[eid] * 0.3;
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

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const stopD = Enemy.radius[eid] + 5 + 2;

  if (!!Enemy.aggro[eid]) {
    if (d > 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction.x[eid] = dx / dd;
      Direction.y[eid] = dy / dd;
    }
    if (Enemy.stateT[eid] > 0) {
      Enemy.stateT[eid] -= dt;
      vx[eid] = Direction.x[eid] * Enemy.speed[eid] * 2.0;
      vy[eid] = Direction.y[eid] * Enemy.speed[eid] * 2.0;
      if (Enemy.stateT[eid] <= 0) Enemy.lungeT[eid] = 1.0;
    } else if (d < 46 && Enemy.lungeT[eid] <= 0) {
      Enemy.stateT[eid] = 0.35;
      // audio.swing();
    } else if (d > stopD + 1) {
      // followPath not available in ECS — direct toward player
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      vx[eid] = (dx / dd) * Enemy.speed[eid];
      vy[eid] = (dy / dd) * Enemy.speed[eid];
    }
  } else {
    vx[eid] = Math.sin(Enemy.t[eid] * 0.9 + Enemy.seed[eid]) * Enemy.speed[eid] * 0.35;
    vy[eid] = Math.cos(Enemy.t[eid] * 0.7 + Enemy.seed[eid]) * Enemy.speed[eid] * 0.35;
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

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);

  if (!!Enemy.aggro[eid]) {
    if (Enemy.state[eid] !== EnemyState.dive) {
      Enemy.stateT[eid] -= dt;
      const orbit = 34 + Math.sin(Enemy.t[eid] * 2 + Enemy.seed[eid]) * 8;
      const tang = Math.atan2(playerY - py[eid], playerX - px[eid]) + Math.PI / 2;
      const radial = d > orbit ? 1 : -0.6;
      vx[eid] = Math.cos(tang) * Enemy.speed[eid] * 0.8 + ((playerX - px[eid]) / (d || 1)) * Enemy.speed[eid] * 0.5 * radial;
      vy[eid] = Math.sin(tang) * Enemy.speed[eid] * 0.8 + ((playerY - py[eid]) / (d || 1)) * Enemy.speed[eid] * 0.5 * radial;
      if (d < 52 && Enemy.stateT[eid] <= 0) {
        Enemy.state[eid] = EnemyState.dive;
        Enemy.stateT[eid] = 0.55;
        const dd = Math.sqrt((playerX - px[eid]) ** 2 + (playerY - py[eid]) ** 2) || 1;
        Direction.x[eid] = (playerX - px[eid]) / dd;
        Direction.y[eid] = (playerY - py[eid]) / dd;
      }
    } else {
      Enemy.stateT[eid] -= dt;
      vx[eid] = Direction.x[eid] * Enemy.speed[eid] * 2.2;
      vy[eid] = Direction.y[eid] * Enemy.speed[eid] * 2.2;
      if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.hover; Enemy.stateT[eid] = 1.4; }
    }
  } else {
    vx[eid] = Math.sin(Enemy.t[eid] * 1.2 + Enemy.seed[eid]) * 30;
    vy[eid] = Math.cos(Enemy.t[eid] * 0.9 + Enemy.seed[eid]) * 24;
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

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const d2p = (px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2;
  const sees = !!Enemy.aggro[eid] && d2p < 105 * 105;

  if (sees) {
    Direction.x[eid] = Math.sign(playerX - px[eid]) || 1;
    Direction.y[eid] = 0;
    if (d < 40) {
      vx[eid] = ((px[eid] - playerX) / d) * 40;
      vy[eid] = ((py[eid] - playerY) / d) * 40;
    }
    Enemy.stateT[eid] -= dt;
    if (Enemy.state[eid] === EnemyState.cool) {
      if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.charge; Enemy.stateT[eid] = 0.7; }
    } else if (Enemy.state[eid] !== EnemyState.charge) {
      Enemy.state[eid] = EnemyState.charge;
      Enemy.stateT[eid] = 0.7;
    } else if (Enemy.stateT[eid] <= 0) {
      Enemy.state[eid] = EnemyState.cool;
      Enemy.stateT[eid] = 2.5;
      // Shoot spore projectile toward player
      // bus.emit("projectile:fire", { kind: "spore", x: px[eid], y: py[eid] - 4, vx: ((playerX - px[eid]) / d) * 74, vy: ((playerY - py[eid]) / d) * 74, dmg: 1 });
    }
  } else {
    Enemy.state[eid] = EnemyState.idle;
  }
}

/** Crawler — прячется, атакует при приближении */
function updateCrawler(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;

  const d2p = (px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2;
  const d = Math.sqrt(d2p);
  const stopD = Enemy.radius[eid] + 5 + 2;

  if (!!Enemy.hidden[eid]) {
    if (d2p < 40 * 40) {
      Enemy.hidden[eid] = 0;
      // audio.splash();
      Enemy.aggro[eid] = 1;
    }
    return;
  }
  if (!!Enemy.aggro[eid]) {
    if (d > 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction.x[eid] = dx / dd;
      Direction.y[eid] = dy / dd;
    }
    if (d > stopD) { vx[eid] = Direction.x[eid] * Enemy.speed[eid]; vy[eid] = Direction.y[eid] * Enemy.speed[eid]; }
  }
}

/** Frost — идентичен Draugr */
function updateFrost(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, inVillage: boolean
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const stopD = Enemy.radius[eid] + 5 + 2;

  if (!!Enemy.aggro[eid]) {
    if (d > stopD + 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      vx[eid] = (dx / dd) * Enemy.speed[eid];
      vy[eid] = (dy / dd) * Enemy.speed[eid];
    }
    if (d > 1) {
      const dx = playerX - px[eid];
      const dy = playerY - py[eid];
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction.x[eid] = dx / dd;
      Direction.y[eid] = dy / dd;
    }
  } else if (Math.floor(Enemy.t[eid]) % 4 === 0) {
    vx[eid] = Math.sin(Enemy.t[eid] * 0.7 + Enemy.seed[eid]) * Enemy.speed[eid] * 0.3;
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

  const d = Math.sqrt((px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2);
  const d2p = (px[eid] - playerX) ** 2 + (py[eid] - playerY) ** 2;

  // Dissipate phase (when fog ghost fading out)
  if (Enemy.state[eid] === EnemyState.dissipate) {
    Enemy.fade[eid] = Math.max(0, Enemy.fade[eid] - dt / 2);
    vx[eid] = Math.sin(Enemy.t[eid] * 1.3 + Enemy.seed[eid]) * 12;
    vy[eid] = -14;
    if (Enemy.fade[eid] <= 0) {
      if (!!Enemy.dropDew[eid]) {
        // bus.emit("drop:spawn", { kind: "dew", x: px[eid], y: py[eid], life: 40 });
      }
      Dead[eid] = 1;
    }
    return;
  }

  // Fade in
  if (Enemy.fade[eid] < 0.85) Enemy.fade[eid] = Math.min(0.85, Enemy.fade[eid] + dt / 1.5);

  let repX = 0, repY = 0;
  // TODO: shrine repulsion - check distance to shrines

  if (repX || repY) { vx[eid] = repX; vy[eid] = repY; return; }

  // Leash mechanic (snake leash)
  const lmx = Enemy.leashX[eid];
  const lmy = Enemy.leashY[eid];
  if (lmx !== 0 || lmy !== 0) {
    const leashDist = Math.sqrt((px[eid] - lmx) ** 2 + (py[eid] - lmy) ** 2);
    if (leashDist > 260 * 260) {
      const ld = Math.sqrt((lmx - px[eid]) ** 2 + (lmy - py[eid]) ** 2) || 1;
      vx[eid] = ((lmx - px[eid]) / ld) * Enemy.speed[eid];
      vy[eid] = ((lmy - py[eid]) / ld) * Enemy.speed[eid];
      return;
    }
  }

  if (!!Enemy.aggro[eid]) {
    if (Enemy.state[eid] === EnemyState.dive) {
      Enemy.stateT[eid] -= dt;
      vx[eid] = Direction.x[eid] * Enemy.speed[eid] * 2.4;
      vy[eid] = Direction.y[eid] * Enemy.speed[eid] * 2.4;
      if (Enemy.stateT[eid] <= 0) {
        Enemy.state[eid] = EnemyState.hover;
        Enemy.stateT[eid] = 1.5 + Math.random() * 1.0;
      }
    } else {
      Enemy.stateT[eid] -= dt;
      const orbit = 30 + Math.sin(Enemy.t[eid] * 2 + Enemy.seed[eid]) * 8;
      const tang = Math.atan2(playerY - py[eid], playerX - px[eid]) + Math.PI / 2;
      const radial = d > orbit ? 1 : -0.6;
      vx[eid] = Math.cos(tang) * Enemy.speed[eid] * 0.9 + ((playerX - px[eid]) / (d || 1)) * Enemy.speed[eid] * 0.6 * radial;
      vy[eid] = Math.sin(tang) * Enemy.speed[eid] * 0.9 + ((playerY - py[eid]) / (d || 1)) * Enemy.speed[eid] * 0.6 * radial;
      if (Enemy.stateT[eid] <= 0) {
        Enemy.state[eid] = EnemyState.dive;
        Enemy.stateT[eid] = 0.55;
        const dd = Math.sqrt((playerX - px[eid]) ** 2 + (playerY - py[eid]) ** 2) || 1;
        Direction.x[eid] = (playerX - px[eid]) / dd;
        Direction.y[eid] = (playerY - py[eid]) / dd;
      }
    }
  } else {
    vx[eid] = Math.sin(Enemy.t[eid] * 1.1 + Enemy.seed[eid]) * 26;
    vy[eid] = Math.cos(Enemy.t[eid] * 0.8 + Enemy.seed[eid]) * 20 - 6;
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

  const dx = playerX - px[eid];
  const dy = playerY - py[eid];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    Direction.x[eid] = dx / d;
    Direction.y[eid] = dy / d;
  }

  const phase2 = Health.current[eid] <= Health.max[eid] / 2;
  const spd = phase2 ? 72 : Enemy.speed[eid];

  Enemy.stateT[eid] -= dt;

  switch (Enemy.state[eid]) {
    case EnemyState.enter:
      if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.chase; Enemy.stateT[eid] = phase2 ? 1.4 : 2.2; }
      break;
    case EnemyState.chase:
      if (d > Enemy.radius[eid] + 5 + 4) {
        vx[eid] = Direction.x[eid] * spd;
        vy[eid] = Direction.y[eid] * spd;
      } else {
        vx[eid] = 0;
        vy[eid] = 0;
      }
      if (Enemy.stateT[eid] <= 0 || d < 30) {
        Enemy.state[eid] = EnemyState.wind;
        Enemy.stateT[eid] = phase2 ? 0.42 : 0.6;
        vx[eid] = 0;
        vy[eid] = 0;
      }
      break;
    case EnemyState.wind:
      vx[eid] = 0;
      vy[eid] = 0;
      if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.swing; Enemy.stateT[eid] = 0.26; }
      break;
    case EnemyState.swing:
      vx[eid] = 0;
      vy[eid] = 0;
      // Contact damage during swing
      if (Enemy.contactCd[eid] <= 0 && d < 40) {
        // Damage player via bus
      }
      Enemy.contactCd[eid] = Math.max(0, Enemy.contactCd[eid] - dt);
      if (Enemy.stateT[eid] <= 0) {
        Enemy.state[eid] = EnemyState.stuck;
        Enemy.stateT[eid] = phase2 ? 1.25 : 1.8;
      }
      break;
    case EnemyState.stuck:
      vx[eid] = 0;
      vy[eid] = 0;
      if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.chase; Enemy.stateT[eid] = phase2 ? 1.4 : 2.2; }
      break;
  }

  // Common contact damage (reaper close contact)
  if (Enemy.contactCd[eid] <= 0 && d < Enemy.radius[eid] + 5 + 4) {
    // bus.emit("player:damaged", { dmg: 1, sx: px[eid], sy: py[eid] });
    Enemy.contactCd[eid] = 1.1;
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

  const dx = playerX - px[eid];
  const dy = playerY - py[eid];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    Direction.x[eid] = dx / d;
    Direction.y[eid] = dy / d;
  }

  Enemy.stateT[eid] -= dt;
  vx[eid] = 0;
  vy[eid] = 0;

  if (Enemy.state[eid] === EnemyState.enter) {
    if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.aim; Enemy.stateT[eid] = 1.2; }
  } else if (Enemy.state[eid] === EnemyState.aim) {
    if (Enemy.stateT[eid] <= 0) {
      // Shoot 3 spores in a fan toward player
      // bus.emit("projectile:fire", { kind: "spore", x: px[eid], y: py[eid] - 6, vx: Math.cos(base) * 110, vy: Math.sin(base) * 110, dmg: 1 });
      Enemy.state[eid] = EnemyState.ring;
      Enemy.stateT[eid] = 1.8;
    }
  } else if (Enemy.state[eid] === EnemyState.ring) {
    if (Enemy.stateT[eid] <= 0) {
      // Shoot 8 spores in a ring
      // bus.emit("projectile:fire", { kind: "spore", x: px[eid], y: py[eid] - 6, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, dmg: 1 });
      Enemy.state[eid] = EnemyState.aim;
      Enemy.stateT[eid] = 1.4;
    }
  }

  // Randomly spawn crawlers
  if (Math.random() < dt * 0.12) {
    // spawn crawler near spider
  }

  // Contact damage
  if (Enemy.contactCd[eid] <= 0 && d < Enemy.radius[eid] + 5 + 4) {
    // bus.emit("player:damaged", { dmg: 1, sx: px[eid], sy: py[eid] });
    Enemy.contactCd[eid] = 1.1;
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

  const dx = playerX - px[eid];
  const dy = playerY - py[eid];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    Direction.x[eid] = dx / d;
    Direction.y[eid] = dy / d;
  }

  const phase2 = Health.current[eid] <= Health.max[eid] / 2;
  const spd = phase2 ? 58 : Enemy.speed[eid];

  Enemy.stateT[eid] -= dt;

  switch (Enemy.state[eid]) {
    case EnemyState.enter:
      if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.chase; Enemy.stateT[eid] = 2.0; }
      break;
    case EnemyState.chase:
      if (d > Enemy.radius[eid] + 5 + 4) {
        vx[eid] = Direction.x[eid] * spd;
        vy[eid] = Direction.y[eid] * spd;
      } else {
        vx[eid] = 0;
        vy[eid] = 0;
      }
      if (Enemy.stateT[eid] <= 0 || d < 34) {
        Enemy.state[eid] = EnemyState.wind;
        Enemy.stateT[eid] = phase2 ? 0.4 : 0.62;
        vx[eid] = 0;
        vy[eid] = 0;
      }
      break;
    case EnemyState.wind:
      vx[eid] = 0;
      vy[eid] = 0;
      if (Enemy.stateT[eid] <= 0) {
        Enemy.state[eid] = EnemyState.swing;
        Enemy.stateT[eid] = 0.3;
      }
      break;
    case EnemyState.swing:
      vx[eid] = 0;
      vy[eid] = 0;
      if (Enemy.contactCd[eid] <= 0 && d < 46) {
        // bus.emit("player:damaged", { dmg: 2, sx: px[eid], sy: py[eid] });
      }
      Enemy.contactCd[eid] = Math.max(0, Enemy.contactCd[eid] - dt);
      if (Enemy.stateT[eid] <= 0) {
        Enemy.state[eid] = EnemyState.stuck;
        Enemy.stateT[eid] = phase2 ? 1.1 : 1.7;
      }
      break;
    case EnemyState.stuck:
      vx[eid] = 0;
      vy[eid] = 0;
      if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.chase; Enemy.stateT[eid] = 2.0; }
      break;
  }

  // Common contact damage
  if (Enemy.contactCd[eid] <= 0 && d < Enemy.radius[eid] + 5 + 4) {
    // bus.emit("player:damaged", { dmg: 2, sx: px[eid], sy: py[eid] });
    Enemy.contactCd[eid] = 1.1;
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

  // Snake doesn't move
  vx[eid] = 0;
  vy[eid] = 0;

  Enemy.stateT[eid] -= dt;

  const mouthX = px[eid] + Math.sin(0 /* realT */ * 1.6) * 4;
  const mouthY = py[eid] - 2;

  if (Enemy.state[eid] === EnemyState.closed) {
    if (Enemy.stateT[eid] <= 1.5 && Enemy.seed[eid] > 0.5) {
      Enemy.seed[eid] = 0.2;
      // Fire 3 fire projectiles toward player
      // const base = Math.atan2(playerY - mouthY, playerX - mouthX);
      // for (let i = -1; i <= 1; i++) {
      //   const a = base + i * 0.3;
      //   bus.emit("projectile:fire", { kind: "fire", x: mouthX, y: mouthY, vx: Math.cos(a) * 84, vy: Math.sin(a) * 84, dmg: 1 });
      // }
    }
    if (Enemy.stateT[eid] <= 0.7 && Enemy.seed[eid] < 0.5) {
      Enemy.seed[eid] = -1;
    }
    if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.open; Enemy.stateT[eid] = 3.0; }
  } else if (Enemy.state[eid] === EnemyState.open) {
    if (Enemy.stateT[eid] <= 0) { Enemy.state[eid] = EnemyState.closed; Enemy.stateT[eid] = 3.8; Enemy.seed[eid] = 1; }
  } else {
    // Default: start closed
    Enemy.state[eid] = EnemyState.closed;
    Enemy.stateT[eid] = 3.8;
    Enemy.seed[eid] = 1;
  }
}
