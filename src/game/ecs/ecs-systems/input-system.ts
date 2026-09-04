/* input-system.ts — система ввода и управления игроком */

import { type World } from 'bitecs';
import {
  Position,
  Velocity,
  Direction,
  Player,
} from '../ecs-components';
import type { InputSystem, InputState } from '../../input/input-system';
import type { EventBus } from '../../event-bus';

// ============================================================
// Обновление ввода игрока
// ============================================================

/** Обработать ввод и установить скорость игрока */
export function updatePlayerInput(
  world: World,
  playerEid: number,
  input: InputSystem,
  stepT: number,
  realT: number,
  onStepAudio: () => void,
  onProjectileSpawned: (eid: number) => void,
  inputState?: { ix: number; iy: number }
): { stepT: number; realT: number } {
  if (playerEid < 0) return { stepT, realT };

  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const { x: dx, y: dy } = Direction;

  // Захватываем ввод ОДИН раз за кадр (если не передан снаружи)
  const captured = inputState ?? input.getState();
  const ix = captured.ix;
  const iy = captured.iy;
  const mag = Math.hypot(ix, iy);

  const p = Player[playerEid];
  if (!p) return { stepT, realT };

  // Обновляем направление и анимацию
  if (mag > 0.12) {
    vx[playerEid] = ix * 92;
    vy[playerEid] = iy * 92;
    p.moving = true;
    dx[playerEid] = ix / Math.max(1, mag);
    dy[playerEid] = iy / Math.max(1, mag);
  } else {
    vx[playerEid] = 0;
    vy[playerEid] = 0;
    p.moving = false;
  }

  // Обновляем таймеры игрока
  if (p.slowT > 0) p.slowT -= 0.016;
  if (p.hurtT > 0) p.hurtT -= 0.016;
  if (p.swingT > 0) p.swingT -= 0.016;

  // Звуки шагов
  stepT -= 0.016;
  if (stepT <= 0) {
    stepT = 0.32;
    onStepAudio();
  }

  realT += 0.016;

  // Лук
  const bowKeyDown = input.isKeyHeld("KeyL") || input.isBowVirtualHeld();
  if (bowKeyDown) {
    input.updateBow(true);
  } else if (input.getBowHeld()) {
    input.updateBow(false);
    // Стрельба будет обрабатываться через событие bus
  }

  return { stepT, realT };
}

// ============================================================
// Обработка действий
// ============================================================

/** Обработать нажатия кнопок действий */
export function processActions(
  input: InputSystem,
  bus: EventBus,
  onInteract: () => void,
  inputState?: InputState
): void {
  const state = inputState ?? input.getState();
  if (state.atkPressed) bus.emit("combat:trySword", {});
  if (state.axePressed) bus.emit("combat:tryAxe", {});
  if (state.actPressed) onInteract();
  if (!inputState) input.clearPressed();
}

// ============================================================
// Стрельба из лука
// ============================================================

/** Обработать стрельбу из лука */
export function updateBow(
  world: World,
  playerEid: number,
  input: InputSystem,
  bus: EventBus,
  flags: { hasBow: boolean; arrows: number },
  onNoArrows: () => void
): void {
  if (playerEid < 0) return;

  const { x: px, y: py } = Position;
  const { x: dx, y: dy } = Direction;

  if (input.getBowHeld()) {
    input.updateBow(false);
    if (flags.hasBow && flags.arrows > 0) {
      flags.arrows--;
      const a = Math.atan2(dy[playerEid], dx[playerEid]);
      bus.emit("projectile:fire", {
        kind: "arrow",
        x: px[playerEid] + Math.cos(a) * 8,
        y: py[playerEid] - 2 + Math.sin(a) * 8,
        vx: Math.cos(a) * 260,
        vy: Math.sin(a) * 260,
        dmg: 2,
      });
    } else {
      onNoArrows();
    }
  }
}
