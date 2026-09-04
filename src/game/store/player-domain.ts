/* ============ PlayerDomain — инкапсулированная модель игрока ============ */

import { Vec } from "../world";
import { Player } from "../entities";

/** События игрока */
export interface PlayerEvents {
  onDamaged?: (dmg: number, sx: number, sy: number) => void;
  onDied?: () => void;
  onHealed?: (amount: number) => void;
  onHeartUsed?: (amount: number) => void;
}

/** Интерфейс для получения данных игрока */
export interface IPlayerDomain {
  /** Текущее здоровье */
  readonly hp: number;
  /** Максимальное здоровье */
  readonly maxHp: number;
  /** Позиция */
  readonly pos: Vec;
  /** Направление */
  readonly dir: Vec;
  /** Таймер атаки */
  readonly swingT: number;
  /** Таймер урона */
  readonly hurtT: number;
  /** Таймер замедления */
  readonly slowT: number;
  /** Радиус */
  readonly r: number;
}

/** Мутаторы игрока */
export interface IPlayerMutations {
  /** Нанести урон */
  takeDamage(dmg: number, sx: number, sy: number): void;
  /** Лечение */
  heal(amount: number): void;
  /** Полное лечение */
  fullHeal(): void;
  /** Использовать сердце */
  useHeart(amount: number): void;
  /** Сбросить таймеры */
  resetTimers(): void;
  /** Установить позицию */
  setPosition(x: number, y: number): void;
  /** Установить скорость */
  setVelocity(vx: number, vy: number): void;
  /** Установить направление */
  setDirection(dir: Vec): void;
}

export class PlayerDomain implements IPlayerDomain, IPlayerMutations {
  private _hp: number;
  private _maxHp: number;
  private _x: number;
  private _y: number;
  private _vx: number;
  private _vy: number;
  private _dir: Vec;
  private _r: number;
  private _swingT: number;
  private _hurtT: number;
  private _slowT: number;
  private events: PlayerEvents;

  constructor(
    hp: number,
    maxHp: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    dir: Vec,
    r: number,
    events?: PlayerEvents
  ) {
    this._hp = hp;
    this._maxHp = maxHp;
    this._x = x;
    this._y = y;
    this._vx = vx;
    this._vy = vy;
    this._dir = dir;
    this._r = r;
    this._swingT = 0;
    this._hurtT = 0;
    this._slowT = 0;
    this.events = events ?? {};
  }

  // ── Геттеры (IPlayerDomain) ──

  get hp(): number { return this._hp; }
  set hp(v: number) { this._hp = v; }
  get maxHp(): number { return this._maxHp; }
  set maxHp(v: number) { this._maxHp = v; }
  get pos(): Vec { return { x: this._x, y: this._y }; }
  get x(): number { return this._x; }
  set x(v: number) { this._x = v; }
  get y(): number { return this._y; }
  set y(v: number) { this._y = v; }
  get dir(): Vec { return this._dir; }
  get swingT(): number { return this._swingT; }
  set swingT(v: number) { this._swingT = v; }
  get hurtT(): number { return this._hurtT; }
  set hurtT(v: number) { this._hurtT = v; }
  get slowT(): number { return this._slowT; }
  set slowT(v: number) { this._slowT = v; }
  get r(): number { return this._r; }

  // ── Мутаторы (IPlayerMutations) ──

  takeDamage(dmg: number, sx: number, sy: number): number {
    this._hp = Math.max(0, this._hp - dmg);
    return this._hp;
  }

  heal(amount: number): number {
    this._hp = Math.min(this._maxHp, this._hp + amount);
    return this._hp;
  }

  fullHeal(): number {
    this._hp = this._maxHp;
    return this._hp;
  }

  useHeart(amount: number): void {
    this.heal(amount * 4);
    this.events.onHeartUsed?.(amount);
  }

  resetTimers(): void {
    this._swingT = 0;
    this._hurtT = 0;
    this._slowT = 0;
  }

  setPosition(x: number, y: number): void {
    this._x = x;
    this._y = y;
  }

  setVelocity(vx: number, vy: number): void {
    this._vx = vx;
    this._vy = vy;
  }

  setDirection(dir: Vec): void {
    this._dir = dir;
  }

  // ── Утилиты ──

  isAlive(): boolean { return this._hp > 0; }

  /** Увеличить максимальное здоровье */
  increaseMaxHp(amount: number): { hp: number; maxHp: number } {
    this._maxHp += amount;
    this._hp = Math.min(this._maxHp, this._hp + amount);
    return { hp: this._hp, maxHp: this._maxHp };
  }

  /** Обновить таймеры */
  updateTimers(dt: number): void {
    this._swingT = Math.max(0, this._swingT - dt);
    this._hurtT = Math.max(0, this._hurtT - dt);
    this._slowT = Math.max(0, this._slowT - dt);
  }

  /** Обновить из старого Player (engine tick) */
  syncFrom(old: { x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; swingT: number; hurtT: number; slowT: number }): void {
    this._x = old.x;
    this._y = old.y;
    this._vx = old.vx;
    this._vy = old.vy;
    this._hp = old.hp;
    this._maxHp = old.maxHp;
    this._swingT = old.swingT;
    this._hurtT = old.hurtT;
    this._slowT = old.slowT;
  }

  /** Получить скорость с учётом замедления */
  getSpeed(baseSpeed: number): number {
    return this._slowT > 0 ? baseSpeed * 0.6 : baseSpeed;
  }

  /** Синхронизировать hp/maxHp/timers обратно в Player (после тика) */
  syncToPlayer(p: { hp: number; maxHp: number; swingT: number; hurtT: number; slowT: number }): void {
    p.hp = this._hp;
    p.maxHp = this._maxHp;
    p.swingT = this._swingT;
    p.hurtT = this._hurtT;
    p.slowT = this._slowT;
  }

  /** Получить immutable модель */
  toModel(): Player {
    return {
      x: this._x, y: this._y,
      vx: this._vx, vy: this._vy,
      r: this._r,
      hp: this._hp, maxHp: this._maxHp,
      dir: this._dir,
      moving: false,
      animT: 0,
      swingT: this._swingT,
      hurtT: this._hurtT,
      slowT: this._slowT,
    };
  }
}
