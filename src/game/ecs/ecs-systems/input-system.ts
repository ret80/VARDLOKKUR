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

  // Захватываем ввод ОДИН раз за кадр (если не передан снаружи)
  const captured = inputState ?? input.getState();
  const ix = captured.ix;
  const iy = captured.iy;
  const mag = Math.hypot(ix, iy);

  // Обновляем направление и анимацию
  if (mag > 0.12) {
    Velocity[playerEid].x = ix * 92;
    Velocity[playerEid].y = iy * 92;
    Player[playerEid].moving = 1;
    Direction[playerEid].x = ix / Math.max(1, mag);
    Direction[playerEid].y = iy / Math.max(1, mag);
  } else {
    Velocity[playerEid].x = 0;
    Velocity[playerEid].y = 0;
    Player[playerEid].moving = 0;
  }

  // Обновляем таймеры игрока
  if (Player[playerEid].slowT > 0) Player[playerEid].slowT -= 0.016;
  if (Player[playerEid].hurtT > 0) Player[playerEid].hurtT -= 0.016;
  if (Player[playerEid].swingT > 0) Player[playerEid].swingT -= 0.016;

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

  if (input.getBowHeld()) {
    input.updateBow(false);
    if (flags.hasBow && flags.arrows > 0) {
      flags.arrows--;
      const a = Math.atan2(Direction[playerEid].y, Direction[playerEid].x);
      bus.emit("projectile:fire", {
        kind: "arrow",
        x: Position[playerEid].x + Math.cos(a) * 8,
        y: Position[playerEid].y - 2 + Math.sin(a) * 8,
        vx: Math.cos(a) * 260,
        vy: Math.sin(a) * 260,
        dmg: 2,
      });
    } else {
      onNoArrows();
    }
  }
}
