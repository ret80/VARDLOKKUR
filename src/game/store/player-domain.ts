/* ============ PlayerDomain — read-only view над ECS Player + Health ============
 *
 * PlayerDomain больше НЕ хранит состояние. Это view-layer для HUD/UI:
 * - Все геттеры читают из ECS компонентов (Player, Health, Position, Velocity)
 * - Все мутации удалены — вместо них ECS-системы (combat, life, movement)
 * - IPlayerMutations сохраним как type alias для обратной совместимости
 *
 * Связь с ECS:
 * - takeDamage → damageEntityEcs (ecs-components.ts)
 * - heal/fullHeal → healEntityEcs / fullHealEntityEcs
 * - increaseMaxHp → increaseMaxHpEcs
 * - setPosition/setVelocity → не нужны (movement-system управляет Position/Velocity)
 */

import {
  Position, Velocity, Health, Player, Direction,
} from "../ecs/ecs-components";
import type { Vec } from "../world";

/** События игрока */
export interface PlayerEvents {
  onDamaged?: (dmg: number, sx: number, sy: number) => void;
  onDied?: () => void;
  onHealed?: (amount: number) => void;
  onHeartUsed?: (amount: number) => void;
}

/** Интерфейс для получения данных игрока (read-only) */
export interface IPlayerDomain {
  readonly hp: number;
  readonly maxHp: number;
  readonly pos: Vec;
  readonly dir: Vec;
  readonly swingT: number;
  readonly hurtT: number;
  readonly slowT: number;
  readonly r: number;
}

/** Мутаторы игрока (DEPRECATED — использовать ECS-хелперы) */
export interface IPlayerMutations {
  /** @deprecated Используйте damageEntityEcs */
  takeDamage(dmg: number, sx: number, sy: number): number;
  /** @deprecated Используйте healEntityEcs */
  heal(amount: number): number;
  /** @deprecated Используйте fullHealEntityEcs */
  fullHeal(): number;
  /** @deprecated Используйте healEntityEcs + flags.hearts-- */
  useHeart(amount: number): void;
  /** @deprecated Таймеры сбрасываются через ECS Player component */
  resetTimers(): void;
  /** @deprecated Не используется — movement-system управляет позицией */
  setPosition(x: number, y: number): void;
  /** @deprecated Не используется — movement-system управляет скоростью */
  setVelocity(vx: number, vy: number): void;
  /** @deprecated Не используется — direction-from-velocity system */
  setDirection(dir: Vec): void;
}

/** ECS-хелперы для мутаций (встраиваются в GameStoreConfig) */
export interface IEcsPlayerHelpers {
  damageEntityEcs: (eid: number, dmg: number) => number;
  healEntityEcs: (eid: number, amount: number) => number;
  fullHealEntityEcs: (eid: number) => number;
  increaseMaxHpEcs: (eid: number, amount: number) => { hp: number; maxHp: number };
}

export class PlayerDomain implements IPlayerDomain, IPlayerMutations {
  private _eid: number;
  private _helpers: IEcsPlayerHelpers | null;
  private _events: PlayerEvents;

  constructor(
    eid: number,
    helpers?: IEcsPlayerHelpers,
    events?: PlayerEvents
  ) {
    this._eid = eid;
    this._helpers = helpers ?? null;
    this._events = events ?? {};
  }

  /** Установить ECS entity ID (для респавна) */
  setEid(eid: number): void {
    this._eid = eid;
  }

  /** Установить ECS-хелперы (для мутаций: takeDamage, heal, etc.) */
  setHelpers(helpers: IEcsPlayerHelpers): void {
    this._helpers = helpers;
  }

  // ── Геттеры (IPlayerDomain — читают из ECS) ──

  get hp(): number {
    return this._eid >= 0 ? Health.current[this._eid] : 0;
  }

  get maxHp(): number {
    // Приоритет: Player.maxHp (если инициализирован) → Health.max
    return this._eid >= 0
      ? (Player.maxHp[this._eid] > 0 ? Player.maxHp[this._eid] : Health.max[this._eid])
      : 0;
  }

  get pos(): Vec {
    return this._eid >= 0
      ? { x: Position.x[this._eid], y: Position.y[this._eid] }
      : { x: 0, y: 0 };
  }

  get x(): number {
    return this._eid >= 0 ? Position.x[this._eid] : 0;
  }

  get y(): number {
    return this._eid >= 0 ? Position.y[this._eid] : 0;
  }

  get dir(): Vec {
    return this._eid >= 0
      ? { x: Direction.x[this._eid], y: Direction.y[this._eid] }
      : { x: 0, y: 1 };
  }

  get swingT(): number {
    return this._eid >= 0 ? Player.swingT[this._eid] : 0;
  }

  get hurtT(): number {
    return this._eid >= 0 ? Player.hurtT[this._eid] : 0;
  }

  get slowT(): number {
    return this._eid >= 0 ? Player.slowT[this._eid] : 0;
  }

  get animT(): number {
    return this._eid >= 0 ? Player.animT[this._eid] : 0;
  }

  get moving(): boolean {
    return this._eid >= 0 ? !!Player.moving[this._eid] : false;
  }

  get vx(): number {
    return this._eid >= 0 ? Velocity.x[this._eid] : 0;
  }

  get vy(): number {
    return this._eid >= 0 ? Velocity.y[this._eid] : 0;
  }

  get r(): number {
    return 10; // player radius
  }

  // ── Мутаторы (IPlayerMutations — делегируют ECS-хелперам) ──

  takeDamage(dmg: number, sx: number, sy: number): number {
    if (this._eid < 0 || !this._helpers) return 0;
    const hp = this._helpers.damageEntityEcs(this._eid, dmg);
    this._events.onDamaged?.(dmg, sx, sy);
    return hp;
  }

  heal(amount: number): number {
    if (this._eid < 0 || !this._helpers) return 0;
    const hp = this._helpers.healEntityEcs(this._eid, amount);
    this._events.onHealed?.(amount);
    return hp;
  }

  fullHeal(): number {
    if (this._eid < 0 || !this._helpers) return 0;
    const hp = this._helpers.fullHealEntityEcs(this._eid);
    this._events.onHealed?.(this.maxHp);
    return hp;
  }

  useHeart(amount: number): void {
    this.heal(amount * 4);
    this._events.onHeartUsed?.(amount);
  }

  resetTimers(): void {
    if (this._eid >= 0) {
      Player.swingT[this._eid] = 0;
      Player.hurtT[this._eid] = 0;
      Player.slowT[this._eid] = 0;
    }
  }

  setPosition(_x: number, _y: number): void {
    // DEPRECATED — position управляется через Position ECS component
    if (this._eid >= 0) {
      Position.x[this._eid] = _x;
      Position.y[this._eid] = _y;
    }
  }

  setVelocity(_vx: number, _vy: number): void {
    // DEPRECATED — velocity управляется через Velocity ECS component
    if (this._eid >= 0) {
      Velocity.x[this._eid] = _vx;
      Velocity.y[this._eid] = _vy;
    }
  }

  setDirection(_dir: Vec): void {
    // DEPRECATED — direction управляется direction-from-velocity system
    if (this._eid >= 0) {
      Direction.x[this._eid] = _dir.x;
      Direction.y[this._eid] = _dir.y;
    }
  }

  // ── Утилиты ──

  isAlive(): boolean {
    return this._eid >= 0 && Health.current[this._eid] > 0;
  }

  /** Увеличить максимальное здоровье (DEPRECATED — используйте increaseMaxHpEcs) */
  increaseMaxHp(amount: number): { hp: number; maxHp: number } {
    if (this._eid >= 0 && this._helpers) {
      return this._helpers.increaseMaxHpEcs(this._eid, amount);
    }
    return { hp: 0, maxHp: 0 };
  }

  /** Обновить таймеры (DEPRECATED — stateTimerSystem делает это в ECS) */
  updateTimers(_dt: number): void {
    // stateTimerSystem в life-system.ts обрабатывает это в ECS
  }

  /** Получить скорость с учётом замедления */
  getSpeed(baseSpeed: number): number {
    return this.slowT > 0 ? baseSpeed * 0.6 : baseSpeed;
  }

  /** Получить immutable модель (для HUD/UI) */
  toModel(): import("../models").Player {
    const eid = this._eid;
    return {
      x: eid >= 0 ? Position.x[eid] : 0,
      y: eid >= 0 ? Position.y[eid] : 0,
      vx: eid >= 0 ? Velocity.x[eid] : 0,
      vy: eid >= 0 ? Velocity.y[eid] : 0,
      r: 10,
      hp: this.hp,
      maxHp: this.maxHp,
      dir: this.dir,
      moving: eid >= 0 ? !!Player.moving[eid] : false,
      animT: eid >= 0 ? Player.animT[eid] : 0,
      swingT: this.swingT,
      hurtT: this.hurtT,
      slowT: this.slowT,
    };
  }
}
