/* ghost.ts — призрак: wander → orbit → freeze → lunge → cooldown.
 *
 * Особенности: игнорирует NavMesh (летает), замедляет игрока при контакте,
 * уязвим перед зажжёнными святилищами (не наносит урон рядом с ними).
 */

import {
  addComponent,
} from 'bitecs';
import {
  Position, Velocity, Direction, Enemy, EnemyState, Dead,
} from '../../../ecs-components';
import { EnemyBrain, type AiContext } from '../brain';

const DETECTION_RANGE = 160; // радиус видимости
const ACTION_RANGE = 250;    // радиус действия
const ORBIT_TIME_MIN = 2.0;
const ORBIT_TIME_SPREAD = 1.0;
const FREEZE_TIME = 0.5;
const LUNGE_SPEED_MUL = 2.4;
const LUNGE_COOLDOWN = 0.3;
const LEASH_RETURN_DIST = 260;
const DISSIPATE_FADE_TIME = 2;
const MAX_FADE = 0.85;

export class GhostBrain extends EnemyBrain {
  get aggroRange(): number {
    return 160;
  }

  update(ctx: AiContext, eid: number): void {
    const { dt } = ctx;
    const ex = Position[eid].x;
    const ey = Position[eid].y;
    const d = Math.hypot(ex - ctx.playerX, ey - ctx.playerY);
    const d2p = d * d;

    const nearLitShrine = ctx.isPlayerNearLitShrine();
    // Обновляем флаг nearLitShrine для рендеринга
    Enemy[eid].nearLitShrine = nearLitShrine ? 1 : 0;

    // --- Фаза dissipate (исчезновение) ---
    if (Enemy[eid].state === EnemyState.dissipate) {
      Enemy[eid].fade = Math.max(0, Enemy[eid].fade - dt / DISSIPATE_FADE_TIME);
      this.setVelocity(eid, Math.sin(Enemy[eid].t * 1.3 + Enemy[eid].seed) * 12, -14);
      if (Enemy[eid].fade <= 0) {
        addComponent(ctx.world, eid, Dead);
      }
      return;
    }

    // --- Leash mechanic (привязка к алтарю) ---
    const lmx = Enemy[eid].leashX;
    const lmy = Enemy[eid].leashY;
    if (lmx !== 0 || lmy !== 0) {
      const leashDist = Math.hypot(ex - lmx, ey - lmy);
      if (leashDist > LEASH_RETURN_DIST) {
        const ld = Math.hypot(lmx - ex, lmy - ey) || 1;
        this.setVelocity(eid, ((lmx - ex) / ld) * Enemy[eid].speed, ((lmy - ey) / ld) * Enemy[eid].speed);
        return;
      }
    }

    // --- Машина состояний ---
    switch (Enemy[eid].state) {
      // 0. ПОЯВЛЕНИЕ — призрак плавно проявляется при появлении тумана
      case EnemyState.appear: {
        Enemy[eid].stateT -= dt;
        Enemy[eid].fade = Math.min(MAX_FADE, Enemy[eid].fade + dt / DISSIPATE_FADE_TIME);
        this.stop(eid);
        if (Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.ghost_wander;
        }
        break;
      }

      // 1. ДРЕЙФ — спокойное блуждание по экрану
      case EnemyState.ghost_wander: {
        if (Enemy[eid].leashX !== 0 || Enemy[eid].leashY !== 0) {
          // Привязан к алтарю — кружит вокруг него
          this.orbitLeashPoint(eid, Enemy[eid].leashX, Enemy[eid].leashY);
        } else {
          this.setVelocity(
            eid,
            Math.sin(Enemy[eid].t * 1.1 + Enemy[eid].seed) * 26,
            Math.cos(Enemy[eid].t * 0.8 + Enemy[eid].seed) * 20 - 6
          );
        }

        // Если игрок в радиусе видимости И НЕ у зажжённого святилища — переходим к кружению
        if (d2p < DETECTION_RANGE * DETECTION_RANGE && !nearLitShrine) {
          Enemy[eid].state = EnemyState.ghost_orbit;
          Enemy[eid].stateT = ORBIT_TIME_MIN + Math.random() * ORBIT_TIME_SPREAD;
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
        const tang = Math.atan2(ctx.playerY - ey, ctx.playerX - ex) + Math.PI / 2;
        const radial = d > orbit ? 1 : -0.6;
        this.setVelocity(
          eid,
          Math.cos(tang) * Enemy[eid].speed * 0.9 + ((ctx.playerX - ex) / (d || 1)) * Enemy[eid].speed * 0.6 * radial,
          Math.sin(tang) * Enemy[eid].speed * 0.9 + ((ctx.playerY - ey) / (d || 1)) * Enemy[eid].speed * 0.6 * radial
        );

        // Если игрок у зажжённого святилища — теряем его и переходим к дрейфу
        if (nearLitShrine) {
          Enemy[eid].state = EnemyState.ghost_wander;
          break;
        }

        // Время кружения вышло — переходим к заморозке
        if (Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.ghost_freeze;
          Enemy[eid].stateT = FREEZE_TIME;
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
        this.stop(eid);

        // Если игрок у зажжённого святилища — теряем его и переходим к дрейфу
        if (nearLitShrine) {
          Enemy[eid].state = EnemyState.ghost_wander;
          break;
        }

        // Замер закончился — рывок
        if (Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.ghost_lunge;

          const dd = Math.hypot(ctx.playerX - ex, ctx.playerY - ey) || 1;
          Direction[eid].x = (ctx.playerX - ex) / dd;
          Direction[eid].y = (ctx.playerY - ey) / dd;

          // Рывок на 2 текущих дистанции до игрока
          Enemy[eid].stateT = (d * 2) / (Enemy[eid].speed * LUNGE_SPEED_MUL);

          // Сбрасываем кулдаун контакта — урон будет нанесён один раз
          Enemy[eid].contactCd = 0;
        }
        break;
      }

      // 4. РЫВОК — проносимся мимо игрока
      case EnemyState.ghost_lunge: {
        Enemy[eid].stateT -= dt;
        this.setVelocity(
          eid,
          Direction[eid].x * Enemy[eid].speed * LUNGE_SPEED_MUL,
          Direction[eid].y * Enemy[eid].speed * LUNGE_SPEED_MUL
        );

        if (Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.ghost_cooldown;
          Enemy[eid].stateT = LUNGE_COOLDOWN;
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
          if (nearLitShrine || d > ACTION_RANGE || d2p > DETECTION_RANGE * DETECTION_RANGE) {
            Enemy[eid].state = EnemyState.ghost_wander;
          } else {
            // В радиусе видимости — снова кружим
            Enemy[eid].state = EnemyState.ghost_orbit;
            Enemy[eid].stateT = ORBIT_TIME_MIN + Math.random() * ORBIT_TIME_SPREAD;
          }
        }
        break;
      }
    }

    // --- Обновление направления ---
    if (Velocity[eid].x !== 0) Direction[eid].x = Velocity[eid].x >= 0 ? 1 : -1;
  }

  /** Кружение по орбите вокруг точки привязки с коррекцией радиуса. */
  private orbitLeashPoint(eid: number, lx: number, ly: number): void {
    const ex = Position[eid].x;
    const ey = Position[eid].y;
    const leashDist = Math.hypot(ex - lx, ey - ly) || 1;
    const orbitAngle = Math.atan2(ey - ly, ex - lx);
    const targetRadius = 80;

    let vx = -Math.sin(orbitAngle) * Enemy[eid].speed * 0.4;
    let vy = Math.cos(orbitAngle) * Enemy[eid].speed * 0.4;

    // Корректировка радиуса
    if (leashDist < targetRadius - 10) {
      vx += ((ex - lx) / leashDist) * 30;
      vy += ((ey - ly) / leashDist) * 30;
    } else if (leashDist > targetRadius + 10) {
      vx -= ((ex - lx) / leashDist) * 30;
      vy -= ((ey - ly) / leashDist) * 30;
    }

    this.setVelocity(eid, vx, vy);
  }
}
