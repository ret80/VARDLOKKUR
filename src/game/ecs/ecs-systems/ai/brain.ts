/* brain.ts — базовые абстракции AI врагов.
 *
 * Каждый вид врага реализует собственный `EnemyBrain` (принцип открытости/закрытости:
 * новый вид = новый класс + регистрация, без правок AI-системы).
 *
 * Важно: мозги без состояния (stateless) — поведение хранится в ECS-компонентах
 * (`Enemy.state`, `Enemy.stateT` и т.д.), поэтому один экземпляр мозга безопасно
 * переиспользуется для всех сущностей одного вида.
 */

import { hasComponent, addComponent, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Direction,
  Enemy,
  Health,
  Dead,
  StringPool,
  poolGet,
} from '../../ecs-components';
import { chaseVelocity, homeVelocity } from '../enemy-path';
import type { WorldData } from '../../../world';
import type { EventBus } from '../../../event-bus';
import type { EnemyKind } from '../../../generators/types';

// ============================================================
// Контекст кадра
// ============================================================

/** Данные текущего кадра, доступные каждому мозгу. */
export interface AiContext {
  world: World;
  map: WorldData;
  dt: number;
  playerEid: number;
  playerX: number;
  playerY: number;
  bus: EventBus | null;
  /** Урон игроку (контактный, снаряд и т.п.). */
  onPlayerDamaged(dmg: number, sx: number, sy: number): void;
  /** Замедлить игрока на N секунд. */
  onPlayerSlowed(duration: number): void;
  /** Игрок рядом со зажжённым святилищем (кэшируется один раз за кадр). */
  isPlayerNearLitShrine(): boolean;
}

// ============================================================
// Базовый мозг
// ============================================================

export abstract class EnemyBrain {
  /** Основное обновление поведения — вызывается каждый кадр для живого врага. */
  abstract update(ctx: AiContext, eid: number): void;

  /** Радиус агро (по умолчанию 100). */
  get aggroRange(): number {
    return 100;
  }

  /**
   * Контактный урон при касании игрока. Вызывается AI-системой один раз за
   * кулдаун; переопределяется видами с особой логикой контакта (призрак).
   */
  onContact(ctx: AiContext, eid: number): void {
    ctx.onPlayerDamaged(Enemy[eid].dmg, Position[eid].x, Position[eid].y);
  }

  // ------------------------------------------------------------
  // Хелперы поведения
  // ------------------------------------------------------------

  /** Расстояние до игрока. */
  protected distToPlayer(ctx: AiContext, eid: number): number {
    return Math.hypot(Position[eid].x - ctx.playerX, Position[eid].y - ctx.playerY);
  }

  /** Повернуться лицом к игроку. */
  protected facePlayer(ctx: AiContext, eid: number): void {
    this.faceTowards(eid, ctx.playerX - Position[eid].x, ctx.playerY - Position[eid].y);
  }

  /** Повернуться по вектору (dx, dy). */
  protected faceTowards(eid: number, dx: number, dy: number): void {
    const d = Math.hypot(dx, dy);
    if (d <= 1) return;
    Direction[eid].x = dx / d;
    Direction[eid].y = dy / d;
  }

  protected setVelocity(eid: number, x: number, y: number): void {
    Velocity[eid].x = x;
    Velocity[eid].y = y;
  }

  protected stop(eid: number): void {
    Velocity[eid].x = 0;
    Velocity[eid].y = 0;
  }

  /** Вектор скорости к цели по NavMesh-пути (не применяет его). */
  protected chaseVector(ctx: AiContext, eid: number, x: number, y: number, speed: number): { x: number; y: number } {
    return chaseVelocity(eid, ctx.map, x, y, speed, ctx.dt);
  }

  /** Двигаться к цели по NavMesh-пути (обходит уступы/стены). */
  protected chaseTo(ctx: AiContext, eid: number, x: number, y: number, speed: number): void {
    const v = this.chaseVector(ctx, eid, x, y, speed);
    this.setVelocity(eid, v.x, v.y);
  }

  /**
   * Поведение без агро: далеко от дома — возвращается по NavMesh-пути,
   * иначе выполняет callback блуждания.
   */
  protected idleGround(ctx: AiContext, eid: number, wander: () => void): void {
    const home = homeVelocity(eid, ctx.map, Enemy[eid].speed * 0.55, ctx.dt);
    if (home) {
      this.setVelocity(eid, home.x, home.y);
      const m = Math.hypot(home.x, home.y) || 1;
      Direction[eid].x = home.x / m;
      Direction[eid].y = home.y / m;
      return;
    }
    wander();
  }

  /** Стандартная смерть босса: пометить Dead + отправить `boss:killed`. */
  protected markBossDead(ctx: AiContext, eid: number): void {
    if (Health[eid].current > 0 || hasComponent(ctx.world, eid, Dead)) return;
    addComponent(ctx.world, eid, Dead);
    ctx.bus?.emit('boss:killed', {
      kind: poolGet(StringPool.enemyKinds, Enemy[eid].kind) as EnemyKind,
      id: (ctx.map as WorldData & { dungeonId?: number })?.dungeonId ?? 0,
      x: Position[eid].x,
      y: Position[eid].y,
    });
  }
}
