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
  PhysicsBody,
  Returning,
} from '../ecs-components';
import { dist2 } from '../../utils';
import type { EnemyKind, ProjectileKind } from '../../generators/types';
import type { PlanckWorld } from '../../physics/planck-world';
import { Vec2 } from 'planck-js';

// ============================================================
// Конфигурация оружия
// ============================================================

const SWORD_RANGE = 24;
const SWORD_ANGLE = 1.2;
const AXE_SPEED = 200;
const AXE_LIFETIME = 6;
const ARROW_SPEED = 260;
const ARROW_LIFETIME = 2.2;
const AXE_RETURN_DIST = 130;
const AXE_PICKUP_DIST = 12;

// ============================================================
// Sword attack
// ============================================================

/** Атака мечом */
export function swordAttackSystem(
  world: World,
  playerEid: number,
  hasSword: boolean,
  swordUp: boolean,
  hasHammer: boolean,
  hasGhostBane: boolean,
  onDamageEnemy: (enemyEid: number, dmg: number, fx: number, fy: number) => void,
  onFreezeEnemy: (enemyEid: number, duration: number) => void,
  onFloatText: (x: number, y: number, text: string, color: number) => void,
  onAudioHit: () => void,
  onAudioClang: () => void,
  planckWorld: PlanckWorld
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
      if (e.state === 'open') {
        const timeVal = Time.value[enemyEid] || 0;
        const ex = px[enemyEid] + Math.sin(timeVal * 1.6) * 4;
        const ey = py[enemyEid] - 8;
        if (dist2(playerX + dx[playerEid] * 14, playerY + dy[playerEid] * 14, ex, ey) < 20 * 20) {
          damageSnake(enemyEid, onFloatText, onAudioHit, () => {});
        }
      } else {
        const dist = Math.sqrt(dist2(playerX, playerY, px[enemyEid], py[enemyEid]));
        if (dist < r[enemyEid] + 18) {
          onFloatText(px[enemyEid], py[enemyEid], 'Чешуя крепче камня', 0x6e7f8d);
          onAudioClang();
        }
      }
      continue;
    }

    // Ghost immunity check
    if (e.kind === 'ghost' && !hasGhostBane) {
      onFloatText(px[enemyEid], py[enemyEid], 'Не пробивает', 0x8fd8e8);
      onAudioClang();
      continue;
    }

    const dist = Math.sqrt(
      (playerX - px[enemyEid]) ** 2 +
      (playerY - py[enemyEid]) ** 2
    );

    if (dist > SWORD_RANGE + r[enemyEid]) continue;

    const enemyAngle = Math.atan2(
      py[enemyEid] - playerY,
      px[enemyEid] - playerX
    );
    let angleDiff = Math.abs(enemyAngle - dirAngle);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
    if (angleDiff > SWORD_ANGLE) continue;

    // Draugr shield check
    if (e.kind === 'draugr' && e.freezeT <= 0) {
      const d = Math.hypot(px[enemyEid] - playerX, py[enemyEid] - playerY) || 1;
      const fromDirX = (playerX - px[enemyEid]) / d;
      const fromDirY = (playerY - py[enemyEid]) / d;
      if (fromDirX * e.facingX + fromDirY * e.facingY > 0.35) {
        onFloatText(px[enemyEid], py[enemyEid], 'Щит!', 0x8f9aa8);
        onAudioClang();
        continue;
      }
    }

    // Hit!
    onDamageEnemy(enemyEid, dmg, playerX, playerY);
    applyKnockback(planckWorld, enemyEid, playerX, playerY, 5);
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

/** Apply knockback impulse to enemy body */
export function applyKnockback(
  planckWorld: PlanckWorld,
  enemyEid: number,
  fromX: number,
  fromY: number,
  strength: number
): void {
  const pb = PhysicsBody[enemyEid];
  if (!pb || !pb.body) return;

  const d = Math.hypot(Position.x[enemyEid] - fromX, Position.y[enemyEid] - fromY) || 1;
  const impulseX = ((Position.x[enemyEid] - fromX) / d) * strength;
  const impulseY = ((Position.y[enemyEid] - fromY) / d) * strength;

  pb.body.applyLinearImpulse(Vec2(impulseX, impulseY), pb.body.getWorldCenter());
}

/** Check if projectile should hit enemy (ghost immunity, draugr shield, snake phases) */
export function canProjectileHitEnemy(
  projKind: ProjectileKind,
  enemyEid: number,
  hasGhostBane: boolean,
  onClang: () => void,
  onFloatText: (x: number, y: number, text: string, color: number) => void,
  fromX: number,
  fromY: number
): boolean {
  const e = Enemy[enemyEid];
  if (!e || Dead[enemyEid]) return false;

  // Ghost immunity
  if (e.kind === 'ghost' && !hasGhostBane) {
    onFloatText(Position.x[enemyEid], Position.y[enemyEid], 'Не пробивает', 0x8fd8e8);
    onClang();
    return false;
  }

  // Snake phase check
  if (e.kind === 'snake') {
    if (e.state === 'open') return true;
    onFloatText(Position.x[enemyEid], Position.y[enemyEid], 'Чешуя крепче камня', 0x6e7f8d);
    onClang();
    return false;
  }

  // Draugr shield check
  if (e.kind === 'draugr' && e.freezeT <= 0) {
    const facingX = e.facingX;
    const facingY = e.facingY;
    const dx = Position.x[enemyEid] - fromX;
    const dy = Position.y[enemyEid] - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const fromDirX = -dx / dist;
    const fromDirY = -dy / dist;
    if (fromDirX * facingX + fromDirY * facingY > 0.35) {
      onFloatText(Position.x[enemyEid], Position.y[enemyEid], 'Щит!', 0x8f9aa8);
      onClang();
      return false;
    }
  }

  return true;
}

/** Handle axe return to player */
export function updateAxeReturn(
  world: World,
  projEid: number,
  playerEid: number,
  dt: number,
  onPickup: () => void,
  onRemove: (eid: number) => void
): boolean {
  const p = Projectile[projEid];
  if (!p || p.kind !== 'axe' || !p.returning) return false;

  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;

  const dx = px[playerEid] - px[projEid];
  const dy = py[playerEid] - 2 - py[projEid];
  const d = Math.hypot(dx, dy) || 1;

  // Move toward player
  const newVx = (dx / d) * 240;
  const newVy = (dy / d) * 240;
  vx[projEid] = newVx;
  vy[projEid] = newVy;

  // Check pickup
  if (d < AXE_PICKUP_DIST) {
    onPickup();
    onRemove(projEid);
    removeEntity(world, projEid);
    return true;
  }

  return false;
}

/** Kill enemy and spawn drops */
export function killEnemy(
  world: World,
  enemyEid: number,
  onDropSpawn: (kind: string, x: number, y: number, life?: number) => void,
  onEnemyKilled: (kind: string, x: number, y: number) => void,
  onBossKilled: (id: number) => void,
  onSnakeDeath: () => void,
  isBoss: (kind: string) => boolean,
  getBossId: (kind: string) => number
): void {
  const e = Enemy[enemyEid];
  if (!e || Dead[enemyEid]) return;

  const { x: px, y: py } = Position;

  // Boss handling
  if (isBoss(e.kind)) {
    // Don't remove boss immediately — handled by interaction system
    const bossId = getBossId(e.kind);
    onBossKilled(bossId);
    return;
  }

  // Snake death
  if (e.kind === 'snake') {
    onSnakeDeath();
    return;
  }

  // Ghost special drop
  if (e.kind === 'ghost') {
    onDropSpawn('dew', px[enemyEid], py[enemyEid], 40);
    if (Math.random() < 0.35) {
      onDropSpawn(Math.random() < 0.5 ? 'shard' : 'heart', px[enemyEid], py[enemyEid]);
    }
    addComponents(world, enemyEid, Dead);
    return;
  }

  // Normal enemy death
  addComponents(world, enemyEid, Dead);
  e.pathI = 0;
  onEnemyKilled(e.kind, px[enemyEid], py[enemyEid]);
}

// ============================================================
// Legacy CombatSystem logic ported to ECS
// ============================================================

/** Hit enemy with damage, flash, knockback */
export function hitEnemy(
  world: World,
  enemyEid: number,
  dmg: number,
  sx: number,
  sy: number,
  ignoreShield: boolean,
  hasGhostBane: boolean,
  planckWorld: PlanckWorld,
  onFloat: (x: number, y: number, text: string, color: number) => void,
  onAudioClang: () => void,
  onAudioHit: () => void,
  onAudioFreeze: () => void,
  onEnemyHit: (eid: number, dmg: number) => void,
  onEnemyKilled: (eid: number) => void,
  freezeDuration?: number
): void {
  const e = Enemy[enemyEid];
  if (!e || Dead[enemyEid]) return;

  // Ghost immunity check
  if (e.kind === 'ghost' && !hasGhostBane) {
    onFloat(Position.x[enemyEid], Position.y[enemyEid], 'Не пробивает', 0x8fd8e8);
    onAudioClang();
    return;
  }

  // Draugr shield check
  if (e.kind === 'draugr' && !ignoreShield && e.freezeT <= 0) {
    const d = Math.hypot(e.facingX, e.facingY) || 1;
    const fromX = (sx - Position.x[enemyEid]) / d;
    const fromY = (sy - Position.y[enemyEid]) / d;
    if (fromX * e.facingX + fromY * e.facingY > 0.35) {
      onAudioClang();
      onFloat(Position.x[enemyEid], Position.y[enemyEid], 'Щит!', 0x8f9aa8);
      return;
    }
  }

  // Apply damage
  Health.current[enemyEid] -= dmg;
  e.flashT = 0.12;
  onAudioHit();
  onFloat(Position.x[enemyEid], Position.y[enemyEid], String(dmg), 0xe8dcc0);
  onEnemyHit(enemyEid, dmg);

  // Knockback via Planck body
  const pb = PhysicsBody[enemyEid];
  if (pb && pb.body) {
    const d = Math.hypot(Position.x[enemyEid] - sx, Position.y[enemyEid] - sy) || 1;
    pb.body.applyLinearImpulse(
      Vec2(((Position.x[enemyEid] - sx) / d) * 5, ((Position.y[enemyEid] - sy) / d) * 5),
      pb.body.getWorldCenter()
    );
  }

  // Freeze if hammer
  if (freezeDuration !== undefined && e.freezeT <= 0) {
    e.freezeT = freezeDuration;
    onAudioFreeze();
    onFloat(Position.x[enemyEid], Position.y[enemyEid], 'Заморожен', 0x9fe0ee);
  }

  // Check death
  if (Health.current[enemyEid] <= 0) {
    onEnemyKilled(enemyEid);
  }
}

/** Damage snake (special case) */
export function damageSnake(
  enemyEid: number,
  onFloat: (x: number, y: number, text: string, color: number) => void,
  onAudioHit: () => void,
  onSnakeDeath: () => void
): void {
  const e = Enemy[enemyEid];
  if (!e || Dead[enemyEid]) return;

  Health.current[enemyEid] -= 1;
  e.flashT = 0.15;
  onAudioHit();
  onFloat(Position.x[enemyEid], Position.y[enemyEid], '1', 0xe8c979);
  
  if (Health.current[enemyEid] <= 0) {
    onSnakeDeath();
  }
}

/** Damage player */
export function damagePlayerEcs(
  world: World,
  playerEid: number,
  dmg: number,
  sx: number,
  sy: number,
  pierce: boolean,
  playerDomain: any,
  onFloat: (x: number, y: number, text: string, color: number) => void,
  onAudioHurt: () => void,
  onPlayerDamaged: () => void
): void {
  if (playerEid < 0) return;

  const p = Player[playerEid];
  if (!p) return;

  if (!pierce && p.hurtT > 0) return;
  if (pierce && p.hurtT > 0.6) return;

  // Apply damage via PlayerDomain
  playerDomain?.takeDamage(dmg, sx, sy);
  onAudioHurt();
  onFloat(Position.x[playerEid], Position.y[playerEid], `-${dmg}`, 0xe06060);

  // Knockback via Planck body
  const pb = PhysicsBody[playerEid];
  if (pb && pb.body) {
    const d = Math.hypot(Position.x[playerEid] - sx, Position.y[playerEid] - sy) || 1;
    pb.body.applyLinearImpulse(
      Vec2(((Position.x[playerEid] - sx) / d) * 8, ((Position.y[playerEid] - sy) / d) * 8),
      pb.body.getWorldCenter()
    );
  }

  onPlayerDamaged();

  // Check death
  if (Health.current[playerEid] <= 0) {
    // Death handled by life-system
  }
}

/** Create projectile entity */
export function fireProjectileEcs(
  world: World,
  kind: ProjectileKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  dmg: number,
  lifetime: number,
  onProjectileSpawn: (eid: number) => void
): number {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Velocity, Projectile, Time, RenderLayer, Radius);

  Position.x[eid] = x;
  Position.y[eid] = y;
  Velocity.x[eid] = vx;
  Velocity.y[eid] = vy;
  Projectile[eid] = { kind, dmg, life: lifetime, dist: 0, returning: false, spin: 0 };
  Time.value[eid] = 0;
  RenderLayer.value[eid] = 60;
  Radius.value[eid] = kind === 'fire' ? 5 : 4;

  onProjectileSpawn(eid);
  return eid;
}

/** Update projectiles — full legacy logic ported */
export function updateProjectilesEcs(
  world: World,
  dt: number,
  playerEid: number,
  hasGhostBane: boolean,
  planckWorld: PlanckWorld,
  onProjectileRemove: (eid: number) => void,
  onFloat: (x: number, y: number, text: string, color: number) => void,
  onAudioClang: () => void,
  onAudioHit: () => void,
  onAudioFreeze: () => void,
  onEnemyHit: (eid: number, dmg: number) => void,
  onEnemyKilled: (eid: number) => void,
  onPlayerDamaged: () => void,
  onSnakeDeath: () => void,
  playerDomain: any
): void {
  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;
  const proj = Projectile;
  const t = Time.value;
  const r = Radius.value;
  const h = Health.current;

  for (let i = query(world, [Position, Velocity, Projectile, Time]).length - 1; i >= 0; i--) {
    const eid = query(world, [Position, Velocity, Projectile, Time])[i];
    const p = proj[eid];
    if (!p) continue;

    p.life -= dt;
    if (p.life <= 0) {
      onProjectileRemove(eid);
      removeEntity(world, eid);
      continue;
    }

    // Sync position from Planck body
    const pb = PhysicsBody[eid];
    if (pb && pb.body) {
      const pos = pb.body.getPosition();
      px[eid] = pos.x;
      py[eid] = pos.y;
    }

    p.spin += dt * 18;

    // Axe return logic
    if (p.kind === 'axe') {
      if (!p.returning) {
        p.dist += Math.sqrt(vx[eid] * vx[eid] + vy[eid] * vy[eid]) * dt;
        if (p.dist > 130) p.returning = true;
      }
      if (p.returning) {
        const pdx = px[playerEid] - px[eid];
        const pdy = py[playerEid] - 2 - py[eid];
        const pd = Math.hypot(pdx, pdy) || 1;
        const newVx = (pdx / pd) * 240;
        const newVy = (pdy / pd) * 240;
        
        if (pb && pb.body) {
          pb.body.setLinearVelocity(Vec2(newVx, newVy));
        }
        vx[eid] = newVx;
        vy[eid] = newVy;

        if (pd < 12) {
          onProjectileRemove(eid);
          removeEntity(world, eid);
          continue;
        }
      }
    }

    // Collision check with enemies
    if (p.kind === 'arrow' || p.kind === 'axe') {
      let consumed = false;
      for (const enemyEid of query(world, [Enemy, Position, Health, Radius])) {
        const e = Enemy[enemyEid];
        if (!e || Dead[enemyEid]) continue;

        // Ghost immunity
        if (e.kind === 'ghost' && !hasGhostBane) {
          if (p.kind === 'axe') {
            p.returning = true;
          } else {
            onProjectileRemove(eid);
            removeEntity(world, eid);
          }
          consumed = true;
          break;
        }

        // Snake phase check
        if (e.kind === 'snake') {
          if (e.state === 'open') {
            const ex = px[enemyEid] + Math.sin(t[enemyEid] * 1.6) * 4;
            const ey = py[enemyEid] - 8;
            if ((px[eid] - ex) ** 2 + (py[eid] - ey) ** 2 < 11 * 11) {
              damageSnake(enemyEid, onFloat, onAudioHit, onSnakeDeath);
              consumed = true;
              if (p.kind !== 'axe') {
                onProjectileRemove(eid);
                removeEntity(world, eid);
              }
              break;
            }
          } else {
            if ((px[eid] - px[enemyEid]) ** 2 + (py[eid] - py[enemyEid]) ** 2 < (r[enemyEid] + 6) ** 2) {
              onAudioClang();
              consumed = true;
              if (p.kind !== 'axe') {
                onProjectileRemove(eid);
                removeEntity(world, eid);
              }
              break;
            }
          }
          continue;
        }

        // Normal enemy collision
        const rr = r[eid] + r[enemyEid];
        if ((px[eid] - px[enemyEid]) ** 2 + (py[eid] - py[enemyEid]) ** 2 < rr * rr) {
          if (p.kind === 'axe') {
            e.freezeT = 2.6;
            onAudioFreeze();
            onFloat(px[enemyEid], py[enemyEid], 'Заморожен', 0x9fe0ee);
            if (e.kind === 'raven' || e.kind === 'crawler') {
              hitEnemy(world, enemyEid, p.dmg, px[eid], py[eid], true, hasGhostBane, planckWorld, onFloat, onAudioClang, onAudioHit, onAudioFreeze, onEnemyHit, onEnemyKilled);
            }
          } else {
            hitEnemy(world, enemyEid, p.dmg, px[eid], py[eid], true, hasGhostBane, planckWorld, onFloat, onAudioClang, onAudioHit, onAudioFreeze, onEnemyHit, onEnemyKilled);
          }
          consumed = true;
          if (p.kind !== 'axe') {
            onProjectileRemove(eid);
            removeEntity(world, eid);
          }
          break;
        }
      }
      if (consumed && p.kind === 'axe') {
        p.returning = true;
        continue;
      }
      if (consumed) continue;
    } else {
      // Enemy projectile hits player
      const pr = px[playerEid];
      const pyr = py[playerEid];
      const rr = r[eid] + 10; // player radius approx
      if (p.life > 0 && (px[eid] - pr) ** 2 + (py[eid] - pyr) ** 2 < rr * rr) {
        damagePlayerEcs(world, playerEid, p.dmg, px[eid], py[eid], false, playerDomain, onFloat, onAudioClang, onPlayerDamaged);
        onProjectileRemove(eid);
        removeEntity(world, eid);
        continue;
      }
    }
  }
}
