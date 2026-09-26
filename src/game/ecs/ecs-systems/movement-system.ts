/* movement-system.ts — система движения на основе Velocity */

import { query, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Direction,
  Enemy,
  Player,
  Time,
} from '../ecs-components';

// Проверка что AoS элемент инициализирован
function isSet<T>(arr: T[], eid: number): boolean {
  return eid < arr.length && arr[eid] !== undefined;
}

// ============================================================
// Базовое движение
// ============================================================

/** Обновить позиции на основе скорости */
export function movementSystem(world: World, dt: number): void {
  const dtSec = dt;

  for (const eid of query(world, [Position, Velocity])) {
    Position[eid].x += Velocity[eid].x * dtSec;
    Position[eid].y += Velocity[eid].y * dtSec;
  }
}

/** Обновить направление на основе скорости + синхронизировать Enemy.facingX/Y */
export function directionFromVelocitySystem(world: World): void {
  for (const eid of query(world, [Velocity, Direction])) {
    const vx = Velocity[eid].x;
    const vy = Velocity[eid].y;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > 0.5) {
      Direction[eid].x = vx / speed;
      Direction[eid].y = vy / speed;
    }
    // Синхронизировать Enemy.facingX/Y с Direction (только для врагов)
    if (isSet(Enemy, eid)) {
      Enemy[eid].facingX = Direction[eid].x;
      Enemy[eid].facingY = Direction[eid].y;
    }
  }
}

/** Обновить таймеры */
export function timerSystem(world: World, dt: number): void {
  for (const eid of query(world, [Time])) {
    Time[eid].value += dt;
  }
}

// ============================================================
// Движение игрока
// ============================================================

/** Движение игрока с учётом скорости тайла */
export function playerMovementSystem(
  world: World,
  playerEid: number,
  inputX: number,
  inputY: number,
  speed: number,
  isSlowed: boolean
): void {
  if (playerEid < 0) return;

  // Apply input
  const mag = Math.sqrt(inputX * inputX + inputY * inputY);
  if (mag > 0.12) {
    Velocity[playerEid].x = inputX * speed;
    Velocity[playerEid].y = inputY * speed;
    Player[playerEid].moving = 1;
  } else {
    Velocity[playerEid].x = 0;
    Velocity[playerEid].y = 0;
    Player[playerEid].moving = 0;
  }

  // Update direction
  if (mag > 0.12) {
    Direction[playerEid].x = inputX / Math.max(1, mag);
    Direction[playerEid].y = inputY / Math.max(1, mag);
  }

  // Update slow timer
  if (Player[playerEid].slowT > 0) {
    Player[playerEid].slowT -= 0.016;
  }
}

// ============================================================
// Кинематическое движение (для призраков)
// ============================================================

/** Кинематическое движение — задаётся напрямую, игнорирует физику */
export function kinematicMovementSystem(world: World, dt: number): void {
  for (const eid of query(world, [Position, Velocity])) {
    Position[eid].x += Velocity[eid].x * dt;
    Position[eid].y += Velocity[eid].y * dt;
  }
}
