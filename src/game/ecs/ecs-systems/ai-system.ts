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
  Shrine,
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
const GHOST_SLOW_DURATION = 2.0; // призрак замедляет игрока на 2 секунды
const SHRINE_PROTECT_RADIUS = 80; // радиус защиты святилища (в пикселях)

// ============================================================
// Кэш для isPlayerNearLitShrine — вычисляется один раз за кадр
// ============================================================
let _cachedNearLitShrine: boolean | null = null;

/** Вычислить и закешировать результат isPlayerNearLitShrine на текущий кадр */
function cachedIsPlayerNearLitShrine(world: World, playerX: number, playerY: number, radius: number): boolean {
  if (_cachedNearLitShrine === null) {
    _cachedNearLitShrine = isPlayerNearLitShrine(world, playerX, playerY, radius);
  }
  return _cachedNearLitShrine;
}

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
  onEnemyDied: (eid: number) => void,
  onPlayerDamaged?: (dmg: number, sx: number, sy: number) => void,
  onPlayerSlowed?: (duration: number) => void,
  fogActive?: boolean
): void {
  if (playerEid < 0 || !map) return;

  // Сброс кэша nearLitShrine — будет вычислен один раз за кадр
  _cachedNearLitShrine = null;

  const playerX = Position[playerEid].x;
  const playerY = Position[playerEid].y;

  // Get zone info
  const zone = zoneFor(map, Math.floor(playerX / T), Math.floor(playerY / T));
  const inVillage = zone === 'Поселение выживших' || zone === 'Воронья Гавань';

  for (const enemyEid of query(world, [Enemy, Position, Velocity, Health])) {
    if (!!Dead[enemyEid]) continue;
    if (!Enemy[enemyEid]) continue; // AoS элемент может быть undefined

    // Common updates
    Time[enemyEid].value += dt;
    Enemy[enemyEid].t += dt;
    Enemy[enemyEid].flashT = Math.max(0, Enemy[enemyEid].flashT - dt);
    Enemy[enemyEid].contactCd = Math.max(0, Enemy[enemyEid].contactCd - dt);
    Enemy[enemyEid].lungeT = Math.max(0, Enemy[enemyEid].lungeT - dt);

    // Frozen enemies skip AI
    if (Enemy[enemyEid].freezeT > 0) {
      Velocity[enemyEid].x = 0;
      Velocity[enemyEid].y = 0;
      continue;
    }

    // Compute enemy kind BEFORE contact damage
    const ek = poolGet(StringPool.enemyKinds, Enemy[enemyEid].kind);

    // Contact damage — наносим урон игроку при столкновении
    // Буфер +3: урон наносится ДО физического касания, иначе Planck не даёт телам сблизиться
    {
      const d2 = (Position[enemyEid].x - playerX) ** 2 + (Position[enemyEid].y - playerY) ** 2;
      const minDist = Enemy[enemyEid].radius + 5 + 3;
      if (d2 < minDist * minDist && Enemy[enemyEid].contactCd <= 0) {
        // Призрак не наносит урон, если игрок рядом со зажжённым святилищем
        if (ek === 'ghost') {
          const nearLitShrine = cachedIsPlayerNearLitShrine(world, playerX, playerY, SHRINE_PROTECT_RADIUS);
          if (nearLitShrine) {
            Enemy[enemyEid].contactCd = 0.5;
            Enemy[enemyEid].flashT = 0.12;
            // Не наносим урон и не замедляем
          } else {
            Enemy[enemyEid].contactCd = 0.5;
            const dmg = Enemy[enemyEid].dmg;
            if (onPlayerDamaged) onPlayerDamaged(dmg, Position[enemyEid].x, Position[enemyEid].y);
            if (onPlayerSlowed) onPlayerSlowed(GHOST_SLOW_DURATION);
            Enemy[enemyEid].flashT = 0.12;
          }
        } else {
          Enemy[enemyEid].contactCd = 0.5;
          const dmg = Enemy[enemyEid].dmg;
          if (onPlayerDamaged) onPlayerDamaged(dmg, Position[enemyEid].x, Position[enemyEid].y);
          // Призрак замедляет игрока при контакте
          if (ek === 'ghost' && onPlayerSlowed) onPlayerSlowed(GHOST_SLOW_DURATION);
          // Flash enemy on hit
          Enemy[enemyEid].flashT = 0.12;
        }
      }
    }

    // Compute aggro (common for non-boss enemies)
    const px_e = Position[enemyEid].x;
    const py_e = Position[enemyEid].y;
    const d2p = (px_e - playerX) ** 2 + (py_e - playerY) ** 2;
    const isFlyer = ek === 'raven' || ek === 'ghost';
    const aggroR = ek === 'raven' ? 150 : ek === 'crawler' ? 42 : ek === 'ghost' ? 160 : 100;

    // Apply aggro rules (original logic)
    if (inVillage && !!Enemy[enemyEid].aggro) { Enemy[enemyEid].aggro = 0; }
    if (!!!Enemy[enemyEid].aggro && !inVillage && d2p < aggroR * aggroR) Enemy[enemyEid].aggro = 1;
    if (!!Enemy[enemyEid].aggro && !isFlyer && d2p > 300 * 300) { Enemy[enemyEid].aggro = 0; }
    if (!!Enemy[enemyEid].aggro && isFlyer && d2p > 300 * 300) Enemy[enemyEid].aggro = 0;

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
        updateGhost(world, enemyEid, playerEid, playerX, playerY, map, dt, fogActive ?? false);
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

  const d = Math.sqrt((Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2);
  const stopD = Enemy[eid].radius + 5 + 2;

  if (!!Enemy[eid].aggro) {
    if (d > stopD + 1) {
      // followPath not available in ECS — direct toward player
      const dx = playerX - Position[eid].x;
      const dy = playerY - Position[eid].y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Velocity[eid].x = (dx / dd) * Enemy[eid].speed;
      Velocity[eid].y = (dy / dd) * Enemy[eid].speed;
    }
    if (d > 1) {
      const dx = playerX - Position[eid].x;
      const dy = playerY - Position[eid].y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction[eid].x = dx / dd;
      Direction[eid].y = dy / dd;
    }
  } else if (Math.floor(Enemy[eid].t) % 4 === 0) {
    Velocity[eid].x = Math.sin(Enemy[eid].t * 0.7 + Enemy[eid].seed) * Enemy[eid].speed * 0.3;
  } else {
    Velocity[eid].x = 0;
    Velocity[eid].y = 0;
  }
}

/** Varg — лунг-атака, преследование */
function updateVarg(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, inVillage: boolean
): void {

  const d = Math.sqrt((Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2);
  const stopD = Enemy[eid].radius + 5 + 2;

  if (!!Enemy[eid].aggro) {
    if (d > 1) {
      const dx = playerX - Position[eid].x;
      const dy = playerY - Position[eid].y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction[eid].x = dx / dd;
      Direction[eid].y = dy / dd;
    }
    if (Enemy[eid].stateT > 0) {
      Enemy[eid].stateT -= dt;
      Velocity[eid].x = Direction[eid].x * Enemy[eid].speed * 2.0;
      Velocity[eid].y = Direction[eid].y * Enemy[eid].speed * 2.0;
      if (Enemy[eid].stateT <= 0) Enemy[eid].lungeT = 1.0;
    } else if (d < 46 && Enemy[eid].lungeT <= 0) {
      Enemy[eid].stateT = 0.35;
      // audio.swing();
    } else if (d > stopD + 1) {
      // followPath not available in ECS — direct toward player
      const dx = playerX - Position[eid].x;
      const dy = playerY - Position[eid].y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Velocity[eid].x = (dx / dd) * Enemy[eid].speed;
      Velocity[eid].y = (dy / dd) * Enemy[eid].speed;
    }
  } else {
    Velocity[eid].x = Math.sin(Enemy[eid].t * 0.9 + Enemy[eid].seed) * Enemy[eid].speed * 0.35;
    Velocity[eid].y = Math.cos(Enemy[eid].t * 0.7 + Enemy[eid].seed) * Enemy[eid].speed * 0.35;
    if (Velocity[eid].x !== 0 || Velocity[eid].y !== 0) {
      const m2 = Math.sqrt(Velocity[eid].x * Velocity[eid].x + Velocity[eid].y * Velocity[eid].y);
      Direction[eid].x = Velocity[eid].x / m2;
      Direction[eid].y = Velocity[eid].y / m2;
    }
  }
}

/** Raven — орбитальное поведение + dive атака */
function updateRaven(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {

  const d = Math.sqrt((Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2);

  if (!!Enemy[eid].aggro) {
    if (Enemy[eid].state !== EnemyState.dive) {
      Enemy[eid].stateT -= dt;
      const orbit = 34 + Math.sin(Enemy[eid].t * 2 + Enemy[eid].seed) * 8;
      const tang = Math.atan2(playerY - Position[eid].y, playerX - Position[eid].x) + Math.PI / 2;
      const radial = d > orbit ? 1 : -0.6;
      Velocity[eid].x = Math.cos(tang) * Enemy[eid].speed * 0.8 + ((playerX - Position[eid].x) / (d || 1)) * Enemy[eid].speed * 0.5 * radial;
      Velocity[eid].y = Math.sin(tang) * Enemy[eid].speed * 0.8 + ((playerY - Position[eid].y) / (d || 1)) * Enemy[eid].speed * 0.5 * radial;
      if (d < 52 && Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.dive;
        Enemy[eid].stateT = 0.55;
        const dd = Math.sqrt((playerX - Position[eid].x) ** 2 + (playerY - Position[eid].y) ** 2) || 1;
        Direction[eid].x = (playerX - Position[eid].x) / dd;
        Direction[eid].y = (playerY - Position[eid].y) / dd;
      }
    } else {
      Enemy[eid].stateT -= dt;
      Velocity[eid].x = Direction[eid].x * Enemy[eid].speed * 2.2;
      Velocity[eid].y = Direction[eid].y * Enemy[eid].speed * 2.2;
      if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.hover; Enemy[eid].stateT = 1.4; }
    }
  } else {
    Velocity[eid].x = Math.sin(Enemy[eid].t * 1.2 + Enemy[eid].seed) * 30;
    Velocity[eid].y = Math.cos(Enemy[eid].t * 0.9 + Enemy[eid].seed) * 24;
  }
  if (Velocity[eid].x !== 0) Direction[eid].x = Velocity[eid].x >= 0 ? 1 : -1;
}

/** Shroom — стреляет спорами когда видит игрока */
function updateShroom(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, dt: number
): void {

  const d = Math.sqrt((Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2);
  const d2p = (Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2;
  const sees = !!Enemy[eid].aggro && d2p < 105 * 105;

  if (sees) {
    Direction[eid].x = Math.sign(playerX - Position[eid].x) || 1;
    Direction[eid].y = 0;
    if (d < 40) {
      Velocity[eid].x = ((Position[eid].x - playerX) / d) * 40;
      Velocity[eid].y = ((Position[eid].y - playerY) / d) * 40;
    }
    Enemy[eid].stateT -= dt;
    if (Enemy[eid].state === EnemyState.cool) {
      if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.charge; Enemy[eid].stateT = 0.7; }
    } else if (Enemy[eid].state !== EnemyState.charge) {
      Enemy[eid].state = EnemyState.charge;
      Enemy[eid].stateT = 0.7;
    } else if (Enemy[eid].stateT <= 0) {
      Enemy[eid].state = EnemyState.cool;
      Enemy[eid].stateT = 2.5;
      // Shoot spore projectile toward player
      // bus.emit("projectile:fire", { kind: "spore", x: px[eid], y: py[eid] - 4, vx: ((playerX - px[eid]) / d) * 74, vy: ((playerY - py[eid]) / d) * 74, dmg: 1 });
    }
  } else {
    Enemy[eid].state = EnemyState.idle;
  }
}

/** Crawler — прячется, атакует при приближении */
function updateCrawler(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {

  const d2p = (Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2;
  const d = Math.sqrt(d2p);
  const stopD = Enemy[eid].radius + 5 + 2;

  if (!!Enemy[eid].hidden) {
    if (d2p < 40 * 40) {
      Enemy[eid].hidden = 0;
      // audio.splash();
      Enemy[eid].aggro = 1;
    }
    return;
  }
  if (!!Enemy[eid].aggro) {
    if (d > 1) {
      const dx = playerX - Position[eid].x;
      const dy = playerY - Position[eid].y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction[eid].x = dx / dd;
      Direction[eid].y = dy / dd;
    }
    if (d > stopD) { Velocity[eid].x = Direction[eid].x * Enemy[eid].speed; Velocity[eid].y = Direction[eid].y * Enemy[eid].speed; }
  }
}

/** Frost — идентичен Draugr */
function updateFrost(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, inVillage: boolean
): void {

  const d = Math.sqrt((Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2);
  const stopD = Enemy[eid].radius + 5 + 2;

  if (!!Enemy[eid].aggro) {
    if (d > stopD + 1) {
      const dx = playerX - Position[eid].x;
      const dy = playerY - Position[eid].y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Velocity[eid].x = (dx / dd) * Enemy[eid].speed;
      Velocity[eid].y = (dy / dd) * Enemy[eid].speed;
    }
    if (d > 1) {
      const dx = playerX - Position[eid].x;
      const dy = playerY - Position[eid].y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      Direction[eid].x = dx / dd;
      Direction[eid].y = dy / dd;
    }
  } else if (Math.floor(Enemy[eid].t) % 4 === 0) {
    Velocity[eid].x = Math.sin(Enemy[eid].t * 0.7 + Enemy[eid].seed) * Enemy[eid].speed * 0.3;
  } else {
    Velocity[eid].x = 0;
    Velocity[eid].y = 0;
  }
}

/** Проверить, находится ли игрок рядом со зажжённым святилищем */
function isPlayerNearLitShrine(world: World, playerX: number, playerY: number, shrineCheckRadius: number): boolean {
  for (const shrineEid of query(world, [Shrine, Position])) {
    if (Shrine[shrineEid].lit) {
      const sx = Position[shrineEid].x;
      const sy = Position[shrineEid].y;
      const d2 = (playerX - sx) ** 2 + (playerY - sy) ** 2;
      if (d2 < shrineCheckRadius * shrineCheckRadius) {
        return true;
      }
    }
  }
  return false;
}

/** Ghost — wander → orbit → freeze → lunge → cooldown */
function updateGhost(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number, fogActive: boolean
): void {
  const d = Math.sqrt((Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2);
  const d2p = (Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2;

  // --- Константы поведения призрака ---
  const DETECTION_RANGE = 160; // радиус видимости
  const ACTION_RANGE = 250;    // радиус действия
  const ATTACK_RADIUS = Enemy[eid].radius + 5 + 3; // радиус урона при атаке

  // --- Проверка: игрок рядом со зажжённым святилищем ---
  const nearLitShrine = cachedIsPlayerNearLitShrine(world, playerX, playerY, SHRINE_PROTECT_RADIUS);
  
  // Обновляем флаг nearLitShrine для рендеринга
  Enemy[eid].nearLitShrine = nearLitShrine ? 1 : 0;

  // --- Фаза dissipate (исчезновение) ---
  if (Enemy[eid].state === EnemyState.dissipate) {
    Enemy[eid].fade = Math.max(0, Enemy[eid].fade - dt / 2);
    Velocity[eid].x = Math.sin(Enemy[eid].t * 1.3 + Enemy[eid].seed) * 12;
    Velocity[eid].y = -14;
    if (Enemy[eid].fade <= 0) {
      if (!!Enemy[eid].dropDew) {
        // bus.emit("drop:spawn", { kind: "dew", x: px[eid], y: py[eid], life: 40 });
      }
      Dead[eid] = {};
    }
    return;
  }

  // --- Появление (fade in) ---
  if (Enemy[eid].fade < 0.85) Enemy[eid].fade = Math.min(0.85, Enemy[eid].fade + dt / 1.5);

  // --- Leash mechanic (привязка) ---
  const lmx = Enemy[eid].leashX;
  const lmy = Enemy[eid].leashY;
  if (lmx !== 0 || lmy !== 0) {
    const leashDist = Math.sqrt((Position[eid].x - lmx) ** 2 + (Position[eid].y - lmy) ** 2);
    if (leashDist > 260 * 260) {
      const ld = Math.sqrt((lmx - Position[eid].x) ** 2 + (lmy - Position[eid].y) ** 2) || 1;
      Velocity[eid].x = ((lmx - Position[eid].x) / ld) * Enemy[eid].speed;
      Velocity[eid].y = ((lmy - Position[eid].y) / ld) * Enemy[eid].speed;
      return;
    }
  }

  // --- Машина состояний ---
  switch (Enemy[eid].state) {
    // 0. ПОЯВЛЕНИЕ — призрак плавно проявляется при появлении тумана
    case EnemyState.appear: {
      Enemy[eid].stateT -= dt;
      Enemy[eid].fade = Math.min(0.85, Enemy[eid].fade + dt * 1.2);
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;

      // Появление завершено — переходим к дрейфу
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.ghost_wander;
      }
      break;
    }

    // 1. ДРЕЙФ — спокойное блуждание по экрану
    case EnemyState.ghost_wander: {
      // Если привязан к алтарю — кружит вокруг него на расстоянии
      if (Enemy[eid].leashX !== 0 || Enemy[eid].leashY !== 0) {
        const lx = Enemy[eid].leashX;
        const ly = Enemy[eid].leashY;
        const leashDist = Math.sqrt((Position[eid].x - lx) ** 2 + (Position[eid].y - ly) ** 2);
        const orbitAngle = Math.atan2(Position[eid].y - ly, Position[eid].x - lx);
        const orbitSpeed = 0.5;
        const targetRadius = 80;
        
        // Двигаемся по орбите
        const tangX = -Math.sin(orbitAngle);
        const tangY = Math.cos(orbitAngle);
        Velocity[eid].x = tangX * Enemy[eid].speed * 0.4;
        Velocity[eid].y = tangY * Enemy[eid].speed * 0.4;
        
        // Корректировка радиуса
        if (leashDist < targetRadius - 10) {
          Velocity[eid].x += ((Position[eid].x - lx) / leashDist) * 30;
          Velocity[eid].y += ((Position[eid].y - ly) / leashDist) * 30;
        } else if (leashDist > targetRadius + 10) {
          Velocity[eid].x -= ((Position[eid].x - lx) / leashDist) * 30;
          Velocity[eid].y -= ((Position[eid].y - ly) / leashDist) * 30;
        }
      } else {
        Velocity[eid].x = Math.sin(Enemy[eid].t * 1.1 + Enemy[eid].seed) * 26;
        Velocity[eid].y = Math.cos(Enemy[eid].t * 0.8 + Enemy[eid].seed) * 20 - 6;
      }

      // Если игрок в радиусе видимости И НЕ у зажжённого святилища — переходим к кружению
      if (d2p < DETECTION_RANGE * DETECTION_RANGE && !nearLitShrine) {
        Enemy[eid].state = EnemyState.ghost_orbit;
        Enemy[eid].stateT = 2.0 + Math.random() * 1.0; // 2–3 секунды кружения
      }
      // Если игрок у зажжённого святилища — теряем его и остаёмся дрейфовать
      if (nearLitShrine && d2p < DETECTION_RANGE * DETECTION_RANGE) {
        Enemy[eid].state = EnemyState.ghost_wander;
      }
      break;
    }

    // 2. КРУЖЕНИЕ — орбитальное поведение вокруг игрока
    case EnemyState.ghost_orbit: {
      Enemy[eid].stateT -= dt;

      const orbit = 30 + Math.sin(Enemy[eid].t * 2 + Enemy[eid].seed) * 8;
      const tang = Math.atan2(playerY - Position[eid].y, playerX - Position[eid].x) + Math.PI / 2;
      const radial = d > orbit ? 1 : -0.6;
      Velocity[eid].x = Math.cos(tang) * Enemy[eid].speed * 0.9 + ((playerX - Position[eid].x) / (d || 1)) * Enemy[eid].speed * 0.6 * radial;
      Velocity[eid].y = Math.sin(tang) * Enemy[eid].speed * 0.9 + ((playerY - Position[eid].y) / (d || 1)) * Enemy[eid].speed * 0.6 * radial;

      // Если игрок у зажжённого святилища — теряем его и переходим к дрейфу
      if (nearLitShrine) {
        Enemy[eid].state = EnemyState.ghost_wander;
        break;
      }

      // Время кружения вышло — переходим к заморозке
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.ghost_freeze;
        Enemy[eid].stateT = 0.5; // 0.5 секунды замерзает
        break;
      }

      // Игрок ушёл из радиуса видимости — возвращаемся к дрейфу
      if (d2p > DETECTION_RANGE * DETECTION_RANGE) {
        Enemy[eid].state = EnemyState.ghost_wander;
      }
      break;
    }

    // 3. ЗАМОРОЗКА — призрак замирает, издаёт вой
    case EnemyState.ghost_freeze: {
      Enemy[eid].stateT -= dt;
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;

      // Если игрок у зажжённого святилища — теряем его и переходим к дрейфу
      if (nearLitShrine) {
        Enemy[eid].state = EnemyState.ghost_wander;
        break;
      }

      // Замер закончился — рывок
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.ghost_lunge;

        // Направление на игрока
        const dd = Math.sqrt((playerX - Position[eid].x) ** 2 + (playerY - Position[eid].y) ** 2) || 1;
        Direction[eid].x = (playerX - Position[eid].x) / dd;
        Direction[eid].y = (playerY - Position[eid].y) / dd;

        // Рывок на 2 текущих дистанции до игрока
        Enemy[eid].stateT = (d * 2) / (Enemy[eid].speed * 2.4);

        // Сбрасываем кулдаун контакта — урон будет нанесён один раз
        Enemy[eid].contactCd = 0;
      }
      break;
    }

    // 4. РЫВОК — проносимся мимо игрока
    case EnemyState.ghost_lunge: {
      Enemy[eid].stateT -= dt;
      Velocity[eid].x = Direction[eid].x * Enemy[eid].speed * 2.4;
      Velocity[eid].y = Direction[eid].y * Enemy[eid].speed * 2.4;

      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.ghost_cooldown;
        Enemy[eid].stateT = 0.3;
      }
      break;
    }

    // 5. ПОСЛЕ АТАКИ — определяем дальнейшее поведение
    case EnemyState.ghost_cooldown: {
      Enemy[eid].stateT -= dt;
      // Плавное замедление после рывка
      Velocity[eid].x *= 0.9;
      Velocity[eid].y *= 0.9;

      if (Enemy[eid].stateT <= 0) {
        // Если игрок у зажжённого святилища — дрейфуем
        if (nearLitShrine) {
          Enemy[eid].state = EnemyState.ghost_wander;
        } else if (d > ACTION_RANGE) {
          // Дистанция больше радиуса действия — дрейфуем
          Enemy[eid].state = EnemyState.ghost_wander;
        } else if (d2p < DETECTION_RANGE * DETECTION_RANGE) {
          // В радиусе видимости — снова кружим
          Enemy[eid].state = EnemyState.ghost_orbit;
          Enemy[eid].stateT = 2.0 + Math.random() * 1.0;
        } else {
          // Между радиусами — дреф
          Enemy[eid].state = EnemyState.ghost_wander;
        }
      }
      break;
    }
  }

  // --- Обновление направления ---
  if (Velocity[eid].x !== 0) Direction[eid].x = Velocity[eid].x >= 0 ? 1 : -1;
}

// ============================================================
// Босс-AI: Жнец (Reaper)
// ============================================================

/** Reaper — enter → chase → wind → swing → stuck (phase2 at HP ≤ 50%) */
function updateReaper(
  world: World, eid: number, playerEid: number,
  playerX: number, playerY: number, map: WorldData, dt: number
): void {

  const dx = playerX - Position[eid].x;
  const dy = playerY - Position[eid].y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    Direction[eid].x = dx / d;
    Direction[eid].y = dy / d;
  }

  const phase2 = Health[eid].current <= Health[eid].max / 2;
  const spd = phase2 ? 72 : Enemy[eid].speed;

  Enemy[eid].stateT -= dt;

  switch (Enemy[eid].state) {
    case EnemyState.enter:
      if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.chase; Enemy[eid].stateT = phase2 ? 1.4 : 2.2; }
      break;
    case EnemyState.chase:
      if (d > Enemy[eid].radius + 5 + 4) {
        Velocity[eid].x = Direction[eid].x * spd;
        Velocity[eid].y = Direction[eid].y * spd;
      } else {
        Velocity[eid].x = 0;
        Velocity[eid].y = 0;
      }
      if (Enemy[eid].stateT <= 0 || d < 30) {
        Enemy[eid].state = EnemyState.wind;
        Enemy[eid].stateT = phase2 ? 0.42 : 0.6;
        Velocity[eid].x = 0;
        Velocity[eid].y = 0;
      }
      break;
    case EnemyState.wind:
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;
      if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.swing; Enemy[eid].stateT = 0.26; }
      break;
    case EnemyState.swing:
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;
      // Contact damage during swing
      if (Enemy[eid].contactCd <= 0 && d < 40) {
        // Damage player via bus
      }
      Enemy[eid].contactCd = Math.max(0, Enemy[eid].contactCd - dt);
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.stuck;
        Enemy[eid].stateT = phase2 ? 1.25 : 1.8;
      }
      break;
    case EnemyState.stuck:
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;
      if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.chase; Enemy[eid].stateT = phase2 ? 1.4 : 2.2; }
      break;
  }

  // Common contact damage (reaper close contact)
  if (Enemy[eid].contactCd <= 0 && d < Enemy[eid].radius + 5 + 4) {
    // bus.emit("player:damaged", { dmg: 1, sx: px[eid], sy: py[eid] });
    Enemy[eid].contactCd = 1.1;
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

  const dx = playerX - Position[eid].x;
  const dy = playerY - Position[eid].y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    Direction[eid].x = dx / d;
    Direction[eid].y = dy / d;
  }

  Enemy[eid].stateT -= dt;
  Velocity[eid].x = 0;
  Velocity[eid].y = 0;

  if (Enemy[eid].state === EnemyState.enter) {
    if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.aim; Enemy[eid].stateT = 1.2; }
  } else if (Enemy[eid].state === EnemyState.aim) {
    if (Enemy[eid].stateT <= 0) {
      // Shoot 3 spores in a fan toward player
      // bus.emit("projectile:fire", { kind: "spore", x: px[eid], y: py[eid] - 6, vx: Math.cos(base) * 110, vy: Math.sin(base) * 110, dmg: 1 });
      Enemy[eid].state = EnemyState.ring;
      Enemy[eid].stateT = 1.8;
    }
  } else if (Enemy[eid].state === EnemyState.ring) {
    if (Enemy[eid].stateT <= 0) {
      // Shoot 8 spores in a ring
      // bus.emit("projectile:fire", { kind: "spore", x: px[eid], y: py[eid] - 6, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, dmg: 1 });
      Enemy[eid].state = EnemyState.aim;
      Enemy[eid].stateT = 1.4;
    }
  }

  // Randomly spawn crawlers
  if (Math.random() < dt * 0.12) {
    // spawn crawler near spider
  }

  // Contact damage
  if (Enemy[eid].contactCd <= 0 && d < Enemy[eid].radius + 5 + 4) {
    // bus.emit("player:damaged", { dmg: 1, sx: px[eid], sy: py[eid] });
    Enemy[eid].contactCd = 1.1;
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

  const dx = playerX - Position[eid].x;
  const dy = playerY - Position[eid].y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    Direction[eid].x = dx / d;
    Direction[eid].y = dy / d;
  }

  const phase2 = Health[eid].current <= Health[eid].max / 2;
  const spd = phase2 ? 58 : Enemy[eid].speed;

  Enemy[eid].stateT -= dt;

  switch (Enemy[eid].state) {
    case EnemyState.enter:
      if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.chase; Enemy[eid].stateT = 2.0; }
      break;
    case EnemyState.chase:
      if (d > Enemy[eid].radius + 5 + 4) {
        Velocity[eid].x = Direction[eid].x * spd;
        Velocity[eid].y = Direction[eid].y * spd;
      } else {
        Velocity[eid].x = 0;
        Velocity[eid].y = 0;
      }
      if (Enemy[eid].stateT <= 0 || d < 34) {
        Enemy[eid].state = EnemyState.wind;
        Enemy[eid].stateT = phase2 ? 0.4 : 0.62;
        Velocity[eid].x = 0;
        Velocity[eid].y = 0;
      }
      break;
    case EnemyState.wind:
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.swing;
        Enemy[eid].stateT = 0.3;
      }
      break;
    case EnemyState.swing:
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;
      if (Enemy[eid].contactCd <= 0 && d < 46) {
        // bus.emit("player:damaged", { dmg: 2, sx: px[eid], sy: py[eid] });
      }
      Enemy[eid].contactCd = Math.max(0, Enemy[eid].contactCd - dt);
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.stuck;
        Enemy[eid].stateT = phase2 ? 1.1 : 1.7;
      }
      break;
    case EnemyState.stuck:
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;
      if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.chase; Enemy[eid].stateT = 2.0; }
      break;
  }

  // Common contact damage
  if (Enemy[eid].contactCd <= 0 && d < Enemy[eid].radius + 5 + 4) {
    // bus.emit("player:damaged", { dmg: 2, sx: px[eid], sy: py[eid] });
    Enemy[eid].contactCd = 1.1;
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

  // Snake doesn't move
  Velocity[eid].x = 0;
  Velocity[eid].y = 0;

  Enemy[eid].stateT -= dt;

  const mouthX = Position[eid].x + Math.sin(0 /* realT */ * 1.6) * 4;
  const mouthY = Position[eid].y - 2;

  if (Enemy[eid].state === EnemyState.closed) {
    if (Enemy[eid].stateT <= 1.5 && Enemy[eid].seed > 0.5) {
      Enemy[eid].seed = 0.2;
      // Fire 3 fire projectiles toward player
      // const base = Math.atan2(playerY - mouthY, playerX - mouthX);
      // for (let i = -1; i <= 1; i++) {
      //   const a = base + i * 0.3;
      //   bus.emit("projectile:fire", { kind: "fire", x: mouthX, y: mouthY, vx: Math.cos(a) * 84, vy: Math.sin(a) * 84, dmg: 1 });
      // }
    }
    if (Enemy[eid].stateT <= 0.7 && Enemy[eid].seed < 0.5) {
      Enemy[eid].seed = -1;
    }
    if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.open; Enemy[eid].stateT = 3.0; }
  } else if (Enemy[eid].state === EnemyState.open) {
    if (Enemy[eid].stateT <= 0) { Enemy[eid].state = EnemyState.closed; Enemy[eid].stateT = 3.8; Enemy[eid].seed = 1; }
  } else {
    // Default: start closed
    Enemy[eid].state = EnemyState.closed;
    Enemy[eid].stateT = 3.8;
    Enemy[eid].seed = 1;
  }
}
