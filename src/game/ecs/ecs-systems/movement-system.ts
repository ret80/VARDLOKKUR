/* movement-system.ts — система движения на основе Velocity */

import { query, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Direction,
  Player,
  Time,
} from '../ecs-components';

// ============================================================
// Базовое движение
// ============================================================

/** Обновить позиции на основе скорости */
export function movementSystem(world: World, dt: number): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const dtSec = dt;

  for (const eid of query(world, [Position, Velocity])) {
    px[eid] += vx[eid] * dtSec;
    py[eid] += vy[eid] * dtSec;
  }
}

/** Обновить направление на основе скорости */
export function directionFromVelocitySystem(world: World): void {
  const { x: vx, y: vy } = Velocity;
  const { x: dx, y: dy } = Direction;

  for (const eid of query(world, [Velocity, Direction])) {
    const speed = Math.sqrt(vx[eid] * vx[eid] + vy[eid] * vy[eid]);
    if (speed > 0.5) {
      dx[eid] = vx[eid] / speed;
      dy[eid] = vy[eid] / speed;
    }
  }
}

/** Обновить таймеры */
export function timerSystem(world: World, dt: number): void {
  const t = Time.value;

  for (const eid of query(world, [Time])) {
    t[eid] += dt;
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
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const { x: dx, y: dy } = Direction;

  if (playerEid < 0) return;

  // Apply input
  const mag = Math.sqrt(inputX * inputX + inputY * inputY);
  if (mag > 0.12) {
    vx[playerEid] = inputX * speed;
    vy[playerEid] = inputY * speed;
    Player.moving[playerEid] = 1;
  } else {
    vx[playerEid] = 0;
    vy[playerEid] = 0;
    Player.moving[playerEid] = 0;
  }

  // Update direction
  if (mag > 0.12) {
    dx[playerEid] = inputX / Math.max(1, mag);
    dy[playerEid] = inputY / Math.max(1, mag);
  }

  // Update slow timer
  if (Player.slowT[playerEid] > 0) {
    Player.slowT[playerEid] -= 0.016;
  }
}

// ============================================================
// Кинематическое движение (для призраков)
// ============================================================

/** Кинематическое движение — задаётся напрямую, игнорирует физику */
export function kinematicMovementSystem(world: World, dt: number): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;

  for (const eid of query(world, [Position, Velocity])) {
    px[eid] += vx[eid] * dt;
    py[eid] += vy[eid] * dt;
  }
}
