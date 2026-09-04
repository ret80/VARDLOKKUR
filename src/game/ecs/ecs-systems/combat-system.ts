/* combat-system.ts — боевая система на основе ECS */

import { query, addEntity, addComponents, removeEntity, hasComponent, type World } from 'bitecs';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Direction,
  Player,
  Enemy,
  Projectile,
  Time,
  RenderLayer,
  Flashing,
  Dead,
  Moving,
  Attacking,
} from '../ecs-components';
import { dist2 } from '../../utils';
import type { EnemyKind, ProjectileKind } from '../../generators/types';

// ============================================================
// Конфигурация оружия
// ============================================================

const SWORD_RANGE = 24;
const SWORD_ANGLE = 1.2;
const AXE_SPEED = 200;
const AXE_LIFETIME = 6;
const ARROW_SPEED = 260;
const ARROW_LIFETIME = 2.2;

// ============================================================
// Sword attack
// ============================================================

/** Атака мечом */
export function swordAttackSystem(
  world: World,
  playerEid: number,
  hasSword: boolean,
  swordUp: boolean,
  onDamageEnemy: (enemyEid: number, dmg: number, fx: number, fy: number) => void,
  onFreezeEnemy: (enemyEid: number, duration: number) => void,
  hasHammer: boolean
): void {
  if (playerEid < 0 || !hasSword) return;

  const p = Player[playerEid];
  if (!p || p.swingT > 0) return;

  // Set swing timer
  p.swingT = 0.22;

  const { x: px, y: py } = Position;
  const { x: dx, y: dy } = Direction;
  const { value: r } = Radius;

  const playerX = px[playerEid];
  const playerY = py[playerEid];
  const dirAngle = Math.atan2(dy[playerEid], dx[playerEid]);
  const dmg = swordUp ? 2 : 1;

  // Check all enemies in range
  for (const enemyEid of query(world, [Enemy, Health, Position, Radius])) {
    const e = Enemy[enemyEid];
    if (!e || Dead[enemyEid]) continue;

    // Snake special case
    if (e.kind === 'snake') {
      // Simplified — check if player is close to open snake
      const dist = Math.sqrt(
        (px[playerEid] - px[enemyEid]) ** 2 +
        (py[playerEid] - py[enemyEid]) ** 2
      );
      if (dist < r[enemyEid] + 18) {
        onDamageEnemy(enemyEid, dmg, px[playerEid], py[playerEid]);
      }
      continue;
    }

    const dist = Math.sqrt(
      (px[playerEid] - px[enemyEid]) ** 2 +
      (py[playerEid] - py[enemyEid]) ** 2
    );

    if (dist > SWORD_RANGE + r[enemyEid]) continue;

    const enemyAngle = Math.atan2(
      py[enemyEid] - py[playerEid],
      px[enemyEid] - px[playerEid]
    );
    let angleDiff = Math.abs(enemyAngle - dirAngle);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
    if (angleDiff > SWORD_ANGLE) continue;

    // Hit!
    onDamageEnemy(enemyEid, dmg, playerX, playerY);
    if (hasHammer && !Dead[enemyEid] && e.freezeT <= 0) {
      e.freezeT = 0.8;
    }
  }
}

// ============================================================
// Axe throw
// ============================================================

/** Бросок секиры (бумеранг) */
export function axeThrowSystem(
  world: World,
  playerEid: number,
  hasAxe: boolean,
  axeUp: boolean,
  onProjectileSpawn: (eid: number) => void
): number {
  if (playerEid < 0 || !hasAxe) return -1;

  const { x: px, y: py } = Position;
  const { x: dx, y: dy } = Direction;
  const p = Player[playerEid];
  if (!p) return -1;

  const dirAngle = Math.atan2(dy[playerEid], dx[playerEid]);
  const dmg = axeUp ? 2 : 1;

  // Create axe projectile
  const eid = addEntity(world);
  addComponents(world, eid, Position, Velocity, Projectile, Time, RenderLayer);

  const startX = px[playerEid] + Math.cos(dirAngle) * 8;
  const startY = py[playerEid] - 2 + Math.sin(dirAngle) * 8;

  Position.x[eid] = startX;
  Position.y[eid] = startY;
  Velocity.x[eid] = Math.cos(dirAngle) * AXE_SPEED;
  Velocity.y[eid] = Math.sin(dirAngle) * AXE_SPEED;
  Projectile[eid] = { kind: 'axe', dmg, life: AXE_LIFETIME, dist: 0, returning: false, spin: 0 };
  Time.value[eid] = 0;
  RenderLayer.value[eid] = 60;

  onProjectileSpawn(eid);
  return eid;
}

// ============================================================
// Arrow shoot
// ============================================================

/** Выстрел из лука */
export function arrowShootSystem(
  world: World,
  playerEid: number,
  hasBow: boolean,
  arrows: number,
  onProjectileSpawn: (eid: number) => void
): number {
  if (playerEid < 0 || !hasBow || arrows <= 0) return -1;

  const { x: px, y: py } = Position;
  const { x: dx, y: dy } = Direction;
  const p = Player[playerEid];
  if (!p) return -1;

  const dirAngle = Math.atan2(dy[playerEid], dx[playerEid]);

  const eid = addEntity(world);
  addComponents(world, eid, Position, Velocity, Projectile, Time, RenderLayer);

  Position.x[eid] = px[playerEid] + Math.cos(dirAngle) * 8;
  Position.y[eid] = py[playerEid] - 2 + Math.sin(dirAngle) * 8;
  Velocity.x[eid] = Math.cos(dirAngle) * ARROW_SPEED;
  Velocity.y[eid] = Math.sin(dirAngle) * ARROW_SPEED;
  Projectile[eid] = { kind: 'arrow', dmg: 2, life: ARROW_LIFETIME, dist: 0, returning: false, spin: 0 };
  Time.value[eid] = 0;
  RenderLayer.value[eid] = 60;

  onProjectileSpawn(eid);
  return eid;
}

// ============================================================
// Projectile update
// ============================================================

/** Обновить снаряды */
export function projectileUpdateSystem(
  world: World,
  dt: number,
  onProjectileHit: (projEid: number, targetEid: number) => void,
  onProjectileRemove: (projEid: number) => void
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const proj = Projectile;
  const t = Time.value;

  for (const eid of query(world, [Position, Velocity, Projectile, Time])) {
    const p = proj[eid];
    if (!p) continue;

    // Update lifetime
    t[eid] += dt;
    p.life -= dt;
    p.dist += Math.sqrt(vx[eid] * vx[eid] + vy[eid] * vy[eid]) * dt;

    // Move
    px[eid] += vx[eid] * dt;
    py[eid] += vy[eid] * dt;

    // Rotate axe
    if (p.kind === 'axe') {
      p.spin += dt * 10;
    }

    // Remove if expired
    if (p.life <= 0 || t[eid] > 10) {
      // Axe returns
      if (p.kind === 'axe' && !p.returning) {
        p.returning = true;
        // Set velocity toward player (simplified)
        // vx[eid] = ...; vy[eid] = ...;
      } else {
        onProjectileRemove(eid);
        removeEntity(world, eid);
      }
    }
  }
}

// ============================================================
// Projectile vs Enemy collision
// ============================================================

/** Проверить попадание снарядов во врагов */
export function projectileEnemyCollisionSystem(
  world: World,
  onHit: (projEid: number, enemyEid: number) => void
): void {
  const { x: px, y: py } = Position;
  const { value: r } = Radius;
  const proj = Projectile;

  for (const projEid of query(world, [Position, Projectile])) {
    const p = proj[projEid];
    if (!p) continue;

    for (const enemyEid of query(world, [Position, Health, Radius])) {
      if (Dead[enemyEid]) continue;

      const dx = px[projEid] - px[enemyEid];
      const dy = py[projEid] - py[enemyEid];
      const distSq = dx * dx + dy * dy;
      const minDist = r[projEid] + r[enemyEid];

      if (distSq < minDist * minDist) {
        onHit(projEid, enemyEid);
      }
    }
  }
}

// ============================================================
// Damage handling
// ============================================================

/** Нанести урон врагу */
export function damageEnemy(
  world: World,
  enemyEid: number,
  dmg: number,
  fx: number,
  fy: number,
  onFlash: (eid: number) => void,
  onDamageEvent: (eid: number, dmg: number, fx: number, fy: number) => void
): void {
  if (!hasComponent(world, enemyEid, Health)) return;

  Health.current[enemyEid] -= dmg;
  onDamageEvent(enemyEid, dmg, fx, fy);
  onFlash(enemyEid);
}

/** Нанести урон игроку */
export function damagePlayer(
  world: World,
  playerEid: number,
  dmg: number,
  fx: number,
  fy: number,
  onFlash: (eid: number) => void,
  onDamageEvent: (eid: number, dmg: number, fx: number, fy: number) => void
): void {
  if (playerEid < 0 || !hasComponent(world, playerEid, Health)) return;

  Health.current[playerEid] -= dmg;
  onDamageEvent(playerEid, dmg, fx, fy);
  onFlash(playerEid);
}

// ============================================================
// Helper
// ============================================================

// hasComponent is already imported from 'bitecs' above
