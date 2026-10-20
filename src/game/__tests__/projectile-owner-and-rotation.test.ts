/* scratch-int-arrow.test.ts — интеграционная проверка костяной стрелы лучника:
 * 1) стрела летит остриём вперёд (направление rotation == направление полёта);
 * 2) стрела не наносит урон владельцу-лучнику;
 * 3) стрела пролетает сквозь лучника, не уничтожаясь о его тело (groupIndex).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { createWorld, addEntity, addComponents, query, type World } from "bitecs";
import {
  Position, Velocity, Projectile, Time, Radius, Health, Enemy, EnemyState,
  StringPool, poolAdd, Sprite, PhysicsBody, PhysicsBodyRegistry, Dead,
} from "../ecs/ecs-components";
import { EntityFactory } from "../ecs/entity-factory";
import { updateProjectilesEcs } from "../ecs/ecs-systems/combat-system";
import { createBodyForEntity, syncVelocityToBody, syncBodyToPosition } from "../ecs/ecs-systems/physics-system";
import { PlanckWorld, Cat } from "../physics/planck-world";

function makeArcher(world: World, x: number, y: number): number {
  const eid = addEntity(world);
  addComponents(world, eid, [Position, Velocity, Health, Enemy, Radius, Time]);
  Position[eid] = { x, y };
  Velocity[eid] = { x: 0, y: 0 };
  Health[eid] = { current: 2, max: 2 };
  Radius[eid] = { value: 5 };
  Time[eid] = { value: 0 };
  Enemy[eid] = {
    kind: poolAdd(StringPool.enemyKinds, "skeleton_archer"),
    radius: 5, speed: 50, dmg: 1,
    aggro: 1, state: EnemyState.cool, stateT: 1,
    freezeT: 0, flashT: 0, facingX: 1, facingY: 0,
    pathI: 0, leashX: 0, leashY: 0,
  } as any;
  return eid;
}

/** Точная копия обработчика projectile:fire из ecs-game-loop.ts */
function fireLikeProduction(
  world: World, pw: PlanckWorld, factory: EntityFactory,
  e: { kind: string; x: number; y: number; vx: number; vy: number; dmg: number; owner: number }
): number {
  const lifetime = (e.kind as any) === 'arrow' ? 2.2 : (e.kind as any) === 'bone_arrow' ? 2.6 : 3;
  const eid = (factory as any).createProjectile(e.kind, e.x, e.y, e.vx, e.vy, e.dmg, lifetime);
  // callback как в обработчике: спрайт + owner
  try {
    Sprite[eid] = { ref: 1 };
    if (e.owner !== undefined) Projectile[eid].owner = e.owner;
  } catch { /* в проде логируется */ }
  const peid = -1;
  const ownerEid = e.owner !== undefined ? e.owner : -1;
  const groupIndex = ownerEid >= 0 ? -(ownerEid + 1) : 0;
  const projRadius = (e.kind === 'arrow' || e.kind === 'bone_arrow') ? 2 : 4;
  createBodyForEntity(pw, world, eid, projRadius, Cat.Projectile, Cat.Enemy | Cat.Player | Cat.Ground, e.vx, e.vy, { fromEnemy: ownerEid >= 0 && ownerEid !== peid }, groupIndex);
  return eid;
}

function runProjectileFrame(world: World, pw: PlanckWorld, dt: number): void {
  syncVelocityToBody(world, -1);
  pw.step(dt);
  syncBodyToPosition(world, -1);
  updateProjectilesEcs(
    world, dt, -1, 0, pw,
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    () => {}, () => {}, () => {}, () => {}
  );
}

describe("bone_arrow integration", () => {
  let world: World; let pw: PlanckWorld; let factory: EntityFactory; let archer: number;

  beforeEach(() => {
    world = createWorld() as any;
    PhysicsBodyRegistry.length = 0;
    pw = new PlanckWorld();
    factory = new EntityFactory(world);
    archer = makeArcher(world, 100, 100);
    // тело лучника — как createEnemyInEcs
    createBodyForEntity(pw, world, archer, 5, Cat.Enemy, Cat.Enemy | Cat.Player | Cat.Projectile | Cat.Ground, undefined, undefined, undefined, -(archer + 1));
  });

  it("не бьёт владельца и летит остриём вперёд", () => {
    // Лучник стреляет ВЛЕВО по игроку (dx<0) — как из ai-system
    const eid = fireLikeProduction(world, pw, factory, {
      kind: "bone_arrow", x: 100, y: 96, vx: -150, vy: 0, dmg: 1, owner: archer,
    });
    const start = { x: Position[eid].x, y: Position[eid].y };
    const samples: Array<{ dx: number; dy: number; ang: number }> = [];
    const dt = 1 / 60;
    for (let f = 0; f < 30; f++) {
      const px = Position[eid].x, py = Position[eid].y;
      runProjectileFrame(world, pw, dt);
      const dx = Position[eid].x - px, dy = Position[eid].y - py;
      samples.push({ dx, dy, ang: Math.atan2(Velocity[eid].y, Velocity[eid].x) });
    }
    // 1) владелец не пострадал
    expect(Health[archer].current).toBe(2);
    // 2) стрела пролетела мимо/сквозь и продолжает путь (не уничтожена телом лучника)
    expect(Position[eid]).toBeDefined();
    const moved = Math.hypot(Position[eid].x - start.x, Position[eid].y - start.y);
    expect(moved).toBeGreaterThan(40);
    // 3) каждый кадр: направление полёта совпадает с углом rotation
    for (const s of samples) {
      if (Math.hypot(s.dx, s.dy) < 1e-4) continue;
      const moveAng = Math.atan2(s.dy, s.dx);
      let diff = Math.abs(moveAng - s.ang);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      expect(diff).toBeLessThan(0.01);
    }
  });

  it("control: owner=-1 → стрела бьёт лучника (воспроизводит баг)", () => {
    const eid = fireLikeProduction(world, pw, factory, {
      kind: "bone_arrow", x: 100, y: 96, vx: -150, vy: 0, dmg: 1, owner: archer,
    });
    Projectile[eid].owner = -1; // имитация сбоя: owner не установлен
    runProjectileFrame(world, pw, 1 / 60);
    expect(Health[archer].current).toBeLessThan(2);
  });
});
