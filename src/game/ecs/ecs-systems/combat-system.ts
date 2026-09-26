/* combat-system.ts — боевая система на основе ECS */

import { query, addComponents, removeEntity, hasComponent, type World } from 'bitecs';
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
  PhysicsBody,
  // SOA helpers
  getEnemyStateName,
  poolGet,
  poolAdd,
  StringPool,
  PhysicsBodyRegistry,
} from '../ecs-components';
import { type EntityFactory } from '../entity-factory';
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

  if (Player[playerEid].swingT > 0) return;

  // Set swing timer
  Player[playerEid].swingT = 0.22;

  const playerX = Position[playerEid].x;
  const playerY = Position[playerEid].y;
  const dirAngle = Math.atan2(Direction[playerEid].y, Direction[playerEid].x);
  const dmg = swordUp ? 2 : 1;

  // Check all enemies in range
  for (const enemyEid of query(world, [Enemy, Health, Position, Radius])) {
    if (!!Dead[enemyEid]) continue;
    if (!Enemy[enemyEid]) continue; // AoS элемент может быть undefined

    // Snake special case
    const enemyKind = poolGet(StringPool.enemyKinds, Enemy[enemyEid].kind);
    if (enemyKind === 'snake') {
      const enemyState = getEnemyStateName(Enemy[enemyEid].state);
      if (enemyState === 'open') {
        const timeVal = Time[enemyEid].value || 0;
        const ex = Position[enemyEid].x + Math.sin(timeVal * 1.6) * 4;
        const ey = Position[enemyEid].y - 8;
        if (dist2(playerX + Direction[playerEid].x * 14, playerY + Direction[playerEid].y * 14, ex, ey) < 20 * 20) {
          damageSnake(enemyEid, onFloatText, onAudioHit, () => {});
        }
      } else {
        const dist = Math.sqrt(dist2(playerX, playerY, Position[enemyEid].x, Position[enemyEid].y));
        if (dist < Radius[enemyEid].value + 18) {
          onFloatText(Position[enemyEid].x, Position[enemyEid].y, 'Чешуя крепче камня', 0x6e7f8d);
          onAudioClang();
        }
      }
      continue;
    }

    // Ghost immunity check
    if (enemyKind === 'ghost' && !hasGhostBane) {
      onFloatText(Position[enemyEid].x, Position[enemyEid].y, 'Не пробивает', 0x8fd8e8);
      onAudioClang();
      continue;
    }

    const dist = Math.sqrt(
      (playerX - Position[enemyEid].x) ** 2 +
      (playerY - Position[enemyEid].y) ** 2
    );

    if (dist > SWORD_RANGE + Radius[enemyEid].value) continue;

    const enemyAngle = Math.atan2(
      Position[enemyEid].y - playerY,
      Position[enemyEid].x - playerX
    );
    let angleDiff = Math.abs(enemyAngle - dirAngle);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
    if (angleDiff > SWORD_ANGLE) continue;

    // Draugr shield check
    if (enemyKind === 'draugr' && Enemy[enemyEid].freezeT <= 0) {
      const d = Math.hypot(Position[enemyEid].x - playerX, Position[enemyEid].y - playerY) || 1;
      const fromDirX = (playerX - Position[enemyEid].x) / d;
      const fromDirY = (playerY - Position[enemyEid].y) / d;
      if (fromDirX * Enemy[enemyEid].facingX + fromDirY * Enemy[enemyEid].facingY > 0.35) {
        onFloatText(Position[enemyEid].x, Position[enemyEid].y, 'Щит!', 0x8f9aa8);
        onAudioClang();
        continue;
      }
    }

    // Hit!
    onDamageEnemy(enemyEid, dmg, playerX, playerY);
    applyKnockback(planckWorld, enemyEid, playerX, playerY, 5);
    if (hasHammer && !Dead[enemyEid] && Enemy[enemyEid].freezeT <= 0) {
      Enemy[enemyEid].freezeT = 0.8;
    }
  }
}

// ============================================================
// Axe throw
// ============================================================

/** Бросок секиры (бумеранг) */
export function axeThrowSystem(
  factory: EntityFactory,
  playerEid: number,
  hasAxe: boolean,
  axeUp: boolean,
  onProjectileSpawn: (eid: number) => void
): number {
  if (playerEid < 0 || !hasAxe) return -1;

  const dirAngle = Math.atan2(Direction[playerEid].y, Direction[playerEid].x);
  const dmg = axeUp ? 2 : 1;

  // Create axe projectile via factory
  const eid = factory.createAxe(Position[playerEid].x, Position[playerEid].y, dirAngle, dmg, onProjectileSpawn);
  return eid;
}

// ============================================================
// Arrow shoot
// ============================================================

/** Выстрел из лука */
export function arrowShootSystem(
  factory: EntityFactory,
  playerEid: number,
  hasBow: boolean,
  arrows: number,
  onProjectileSpawn: (eid: number) => void
): number {
  if (playerEid < 0 || !hasBow || arrows <= 0) return -1;

  const dirAngle = Math.atan2(Direction[playerEid].y, Direction[playerEid].x);

  // Create arrow via factory
  const eid = factory.createArrow(Position[playerEid].x, Position[playerEid].y, dirAngle, onProjectileSpawn);
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
    const pos = Position[eid];
    const vel = Velocity[eid];
    const proj = Projectile[eid];
    const tm = Time[eid];
    if (!pos || !vel || !proj || !tm) continue; // AoS элемент может быть undefined

    // Update lifetime
    tm.value += dt;
    proj.life -= dt;
    proj.dist += Math.sqrt(vel.x * vel.x + vel.y * vel.y) * dt;

    // Move
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;

    // Rotate axe
    if (poolGet(StringPool.projectileKinds, proj.kind) === 'axe') {
      proj.spin += dt * 10;
    }

    // Remove if expired
    if (proj.life <= 0 || tm.value > 10) {
      // Axe returns
      if (poolGet(StringPool.projectileKinds, proj.kind) === 'axe' && !!proj.returning) {
        proj.returning = 1;
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
    const pPos = Position[projEid];
    if (!pPos) continue;
    const pRad = Radius[projEid];
    if (!pRad) continue;

    for (const enemyEid of query(world, [Position, Health, Radius])) {
      if (!!Dead[enemyEid]) continue;

      const ePos = Position[enemyEid];
      const eRad = Radius[enemyEid];
      if (!ePos || !eRad) continue;

      const dx = pPos.x - ePos.x;
      const dy = pPos.y - ePos.y;
      const distSq = dx * dx + dy * dy;
      const minDist = pRad.value + eRad.value;

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

  Health[enemyEid].current -= dmg;
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

  Health[playerEid].current -= dmg;
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
  const pbIdx = PhysicsBody[enemyEid].body;
  if (pbIdx <= 0) return;

  const body = PhysicsBodyRegistry[pbIdx - 1];
  if (!body) return;

  const d = Math.hypot(Position[enemyEid].x - fromX, Position[enemyEid].y - fromY) || 1;
  const impulseX = ((Position[enemyEid].x - fromX) / d) * strength;
  const impulseY = ((Position[enemyEid].y - fromY) / d) * strength;

  body.applyLinearImpulse(Vec2(impulseX, impulseY), body.getWorldCenter());
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
  if (!!Dead[enemyEid]) return false;

  const enemyKind = poolGet(StringPool.enemyKinds, Enemy[enemyEid].kind);
  const enemyState = getEnemyStateName(Enemy[enemyEid].state);

  // Ghost immunity
  if (enemyKind === 'ghost' && !hasGhostBane) {
    onFloatText(Position[enemyEid].x, Position[enemyEid].y, 'Не пробивает', 0x8fd8e8);
    onClang();
    return false;
  }

  // Snake phase check
  if (enemyKind === 'snake') {
    if (enemyState === 'open') return true;
    onFloatText(Position[enemyEid].x, Position[enemyEid].y, 'Чешуя крепче камня', 0x6e7f8d);
    onClang();
    return false;
  }

  // Draugr shield check
  if (enemyKind === 'draugr' && Enemy[enemyEid].freezeT <= 0) {
    const facingX = Enemy[enemyEid].facingX;
    const facingY = Enemy[enemyEid].facingY;
    const dx = Position[enemyEid].x - fromX;
    const dy = Position[enemyEid].y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const fromDirX = -dx / dist;
    const fromDirY = -dy / dist;
    if (fromDirX * facingX + fromDirY * facingY > 0.35) {
      onFloatText(Position[enemyEid].x, Position[enemyEid].y, 'Щит!', 0x8f9aa8);
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
  const projKind = poolGet(StringPool.projectileKinds, Projectile[projEid].kind);
  if (projKind !== 'axe' || !!!Projectile[projEid].returning) return false;

  const dx = Position[playerEid].x - Position[projEid].x;
  const dy = Position[playerEid].y - 2 - Position[projEid].y;
  const d = Math.hypot(dx, dy) || 1;

  // Move toward player
  const newVx = (dx / d) * 240;
  const newVy = (dy / d) * 240;
  Velocity[projEid].x = newVx;
  Velocity[projEid].y = newVy;

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
  if (!!Dead[enemyEid]) return;

  const enemyKind = poolGet(StringPool.enemyKinds, Enemy[enemyEid].kind);

  // Boss handling
  if (isBoss(enemyKind)) {
    // Don't remove boss immediately — handled by interaction system
    const bossId = getBossId(enemyKind);
    onBossKilled(bossId);
    return;
  }

  // Snake death
  if (enemyKind === 'snake') {
    onSnakeDeath();
    return;
  }

  // Ghost special drop
  if (enemyKind === 'ghost') {
    onDropSpawn('dew', Position[enemyEid].x, Position[enemyEid].y, 40);
    if (Math.random() < 0.35) {
      onDropSpawn(Math.random() < 0.5 ? 'shard' : 'heart', Position[enemyEid].x, Position[enemyEid].y);
    }
    Dead[enemyEid] = {};
    addComponents(world, enemyEid, [Dead]);
    return;
  }

  // Normal enemy death
  Dead[enemyEid] = {};
  addComponents(world, enemyEid, [Dead]);
  Enemy[enemyEid].pathI = 0;
  onEnemyKilled(enemyKind, Position[enemyEid].x, Position[enemyEid].y);
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
  if (!!Dead[enemyEid]) return;

  const enemyKind = poolGet(StringPool.enemyKinds, Enemy[enemyEid].kind);

  // Ghost immunity check
  if (enemyKind === 'ghost' && !hasGhostBane) {
    onFloat(Position[enemyEid].x, Position[enemyEid].y, 'Не пробивает', 0x8fd8e8);
    onAudioClang();
    return;
  }

  // Draugr shield check
  if (enemyKind === 'draugr' && !ignoreShield && Enemy[enemyEid].freezeT <= 0) {
    const d = Math.hypot(Enemy[enemyEid].facingX, Enemy[enemyEid].facingY) || 1;
    const fromX = (sx - Position[enemyEid].x) / d;
    const fromY = (sy - Position[enemyEid].y) / d;
    if (fromX * Enemy[enemyEid].facingX + fromY * Enemy[enemyEid].facingY > 0.35) {
      onAudioClang();
      onFloat(Position[enemyEid].x, Position[enemyEid].y, 'Щит!', 0x8f9aa8);
      return;
    }
  }

  // Apply damage
  Health[enemyEid].current -= dmg;
  Enemy[enemyEid].flashT = 0.12;
  onAudioHit();
  onFloat(Position[enemyEid].x, Position[enemyEid].y, String(dmg), 0xe8dcc0);
  onEnemyHit(enemyEid, dmg);

  // Knockback via Planck body
  const pbIdx = PhysicsBody[enemyEid].body;
  if (pbIdx > 0) {
    const body = PhysicsBodyRegistry[pbIdx - 1];
    if (body) {
      const d = Math.hypot(Position[enemyEid].x - sx, Position[enemyEid].y - sy) || 1;
      body.applyLinearImpulse(
        Vec2(((Position[enemyEid].x - sx) / d) * 5, ((Position[enemyEid].y - sy) / d) * 5),
        body.getWorldCenter()
      );
    }
  }

  // Freeze if hammer
  if (freezeDuration !== undefined && Enemy[enemyEid].freezeT <= 0) {
    Enemy[enemyEid].freezeT = freezeDuration;
    onAudioFreeze();
    onFloat(Position[enemyEid].x, Position[enemyEid].y, 'Заморожен', 0x9fe0ee);
  }

  // Check death
  if (Health[enemyEid].current <= 0) {
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
  if (!!Dead[enemyEid]) return;

  Health[enemyEid].current -= 1;
  Enemy[enemyEid].flashT = 0.15;
  onAudioHit();
  onFloat(Position[enemyEid].x, Position[enemyEid].y, '1', 0xe8c979);
  
  if (Health[enemyEid].current <= 0) {
    onSnakeDeath();
  }
}

/** Damage player (ECS-based) */
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

  if (!pierce && Player[playerEid].hurtT > 0) return;
  if (pierce && Player[playerEid].hurtT > 0.6) return;

  // Apply damage via ECS Health component
  Health[playerEid].current -= dmg;
  Player[playerEid].hurtT = 0.35; // invulnerability window

  onAudioHurt();
  onFloat(Position[playerEid].x, Position[playerEid].y, `-${dmg}`, 0xe06060);

  // Knockback via Planck body
  const pbIdx = PhysicsBody[playerEid].body;
  if (pbIdx > 0) {
    const body = PhysicsBodyRegistry[pbIdx - 1];
    if (body) {
      const d = Math.hypot(Position[playerEid].x - sx, Position[playerEid].y - sy) || 1;
      body.applyLinearImpulse(
        Vec2(((Position[playerEid].x - sx) / d) * 8, ((Position[playerEid].y - sy) / d) * 8),
        body.getWorldCenter()
      );
    }
  }

  onPlayerDamaged();

  // Check death — handled by lifeCheckSystem
}

/** Create projectile entity */
export function fireProjectileEcs(
  factory: EntityFactory,
  kind: ProjectileKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  dmg: number,
  lifetime: number,
  onProjectileSpawn: (eid: number) => void
): number {
  const eid = factory.createProjectile(kind, x, y, vx, vy, dmg, lifetime);
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

  const projKinds = StringPool.projectileKinds;

  // query() возвращает IterableIterator, а не массив — материализуем один раз
  const projectiles = Array.from(query(world, [Position, Velocity, Projectile, Time]));

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const eid = projectiles[i];
    const pos = Position[eid];
    const vel = Velocity[eid];
    const proj = Projectile[eid];
    const tm = Time[eid];
    const rad = Radius[eid];
    if (!pos || !vel || !proj || !tm || !rad) continue; // AoS элемент может быть undefined

    const pKind = projKinds[proj.kind] ?? '';
    const pLife = proj.life;
    if (pLife <= 0) {
      onProjectileRemove(eid);
      removeEntity(world, eid);
      continue;
    }

    // Sync position from Planck body
    const pbIdx = PhysicsBody[eid].body;
    if (pbIdx > 0) {
      const body = PhysicsBodyRegistry[pbIdx - 1];
      if (body) {
        const pos2 = body.getPosition();
        pos.x = pos2.x;
        pos.y = pos2.y;
      }
    }

    proj.spin += dt * 18;

    // Axe return logic
    if (pKind === 'axe') {
      if (!proj.returning) {
        proj.dist += Math.sqrt(vel.x * vel.x + vel.y * vel.y) * dt;
        if (proj.dist > 130) proj.returning = 1;
      }
      if (!!proj.returning) {
        const pPos = Position[playerEid];
        if (!pPos) continue;
        const pdx = pPos.x - pos.x;
        const pdy = pPos.y - 2 - pos.y;
        const pd = Math.hypot(pdx, pdy) || 1;
        const newVx = (pdx / pd) * 240;
        const newVy = (pdy / pd) * 240;

        if (pbIdx > 0) {
          const body = PhysicsBodyRegistry[pbIdx - 1];
          if (body) {
            body.setLinearVelocity(Vec2(newVx, newVy));
          }
        }
        vel.x = newVx;
        vel.y = newVy;

        if (pd < 12) {
          onProjectileRemove(eid);
          removeEntity(world, eid);
          continue;
        }
      }
    }

    // Collision check with enemies
    if (pKind === 'arrow' || pKind === 'axe') {
      let consumed = false;
      for (const enemyEid of query(world, [Enemy, Position, Health, Radius])) {
        if (!!Dead[enemyEid]) continue;
        if (!Enemy[enemyEid]) continue; // AoS элемент может быть undefined

        const enemyKind = poolGet(StringPool.enemyKinds, Enemy[enemyEid].kind);
        const enemyState = getEnemyStateName(Enemy[enemyEid].state);

        // Ghost immunity
        if (enemyKind === 'ghost' && !hasGhostBane) {
          if (pKind === 'axe') {
            proj.returning = 1;
          } else {
            onProjectileRemove(eid);
            removeEntity(world, eid);
          }
          consumed = true;
          break;
        }

        // Snake phase check
        if (enemyKind === 'snake') {
          const ePos = Position[enemyEid];
          const eRad = Radius[enemyEid];
          if (!ePos || !eRad) continue;
          if (enemyState === 'open') {
            const ex = ePos.x + Math.sin(tm.value * 1.6) * 4;
            const ey = ePos.y - 8;
            if ((pos.x - ex) ** 2 + (pos.y - ey) ** 2 < 11 * 11) {
              damageSnake(enemyEid, onFloat, onAudioHit, onSnakeDeath);
              consumed = true;
              if (pKind !== 'axe') {
                onProjectileRemove(eid);
                removeEntity(world, eid);
              }
              break;
            }
          } else {
            if ((pos.x - ePos.x) ** 2 + (pos.y - ePos.y) ** 2 < (eRad.value + 6) ** 2) {
              onAudioClang();
              consumed = true;
              if (pKind !== 'axe') {
                onProjectileRemove(eid);
                removeEntity(world, eid);
              }
              break;
            }
          }
          continue;
        }

        // Normal enemy collision
        const ePos = Position[enemyEid];
        const eRad = Radius[enemyEid];
        if (!ePos || !eRad) continue;
        const rr = rad.value + eRad.value;
        if ((pos.x - ePos.x) ** 2 + (pos.y - ePos.y) ** 2 < rr * rr) {
          if (pKind === 'axe') {
            Enemy[enemyEid].freezeT = 2.6;
            onAudioFreeze();
            onFloat(ePos.x, ePos.y, 'Заморожен', 0x9fe0ee);
            if (enemyKind === 'raven' || enemyKind === 'crawler') {
              hitEnemy(world, enemyEid, proj.dmg, pos.x, pos.y, true, hasGhostBane, planckWorld, onFloat, onAudioClang, onAudioHit, onAudioFreeze, onEnemyHit, onEnemyKilled);
            }
          } else {
            hitEnemy(world, enemyEid, proj.dmg, pos.x, pos.y, true, hasGhostBane, planckWorld, onFloat, onAudioClang, onAudioHit, onAudioFreeze, onEnemyHit, onEnemyKilled);
          }
          consumed = true;
          if (pKind !== 'axe') {
            onProjectileRemove(eid);
            removeEntity(world, eid);
          }
          break;
        }
      }
      if (consumed && pKind === 'axe') {
        proj.returning = 1;
        continue;
      }
      if (consumed) continue;
    } else {
      // Enemy projectile hits player
      const pPos = Position[playerEid];
      if (!pPos) continue;
      const pr = pPos.x;
      const pyr = pPos.y;
      const rr = rad.value + 10; // player radius approx
      if (proj.life > 0 && (pos.x - pr) ** 2 + (pos.y - pyr) ** 2 < rr * rr) {
        damagePlayerEcs(world, playerEid, proj.dmg, pos.x, pos.y, false, playerDomain, onFloat, onAudioClang, onPlayerDamaged);
        onProjectileRemove(eid);
        removeEntity(world, eid);
        continue;
      }
    }
  }
}
