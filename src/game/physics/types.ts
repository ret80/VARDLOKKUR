/* types.ts — общий контракт физического мира.
 *
 * Позволяет держать две реализации: Planck.js (2D, legacy-фолбэк) и Rapier3D
 * (основная). Системы ECS зависят только от этого интерфейса.
 */

/**
 * Тело в терминах игры: позиция/скорость в пикселях, userData.
 * Реализации (Planck Body / RapierBody) намеренно не сводятся к общему типу:
 * системы работают через narrow-API (setPosition/getPosition/...), поэтому
 * контракт здесь — `any`, как и было в legacy-коде.
 */
export type PhysicsBody = any;

export interface IPhysicsWorld {
  createTileBody(x: number, y: number, radius: number): PhysicsBody;
  createWallBody(cx: number, cy: number, halfW: number, halfH: number): PhysicsBody;
  createStaticBody(x: number, y: number, radius: number, category: number): PhysicsBody;
  createKinematicBody(x: number, y: number, w: number, h: number, category: number): PhysicsBody;
  createEntityBody(
    x: number,
    y: number,
    radius: number,
    category: number,
    userData: Record<string, unknown>,
    groupIndex?: number,
  ): PhysicsBody;
  createProjectileBody(
    x: number,
    y: number,
    radius: number,
    vx: number,
    vy: number,
    groupIndex?: number,
  ): PhysicsBody;
  createDropBody(x: number, y: number, radius: number): PhysicsBody;
  createGhostBody(x: number, y: number, radius: number): PhysicsBody;

  destroyBody(body: PhysicsBody): void;
  step(dt: number): void;
  pointSolid(x: number, y: number, doors: any[], barrier: any): boolean;
  hasLOS(x0: number, y0: number, x1: number, y1: number): boolean;
  clear(): void;
  destroy(): void;
}
