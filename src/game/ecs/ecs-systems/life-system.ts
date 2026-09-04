/* life-system.ts — система жизней, смерти и удаления сущностей */

import {
  query,
  removeEntity,
  type World,
} from 'bitecs';
import {
  Health,
  Dead,
  Player,
  Enemy,
  Projectile,
  Magnet,
  Position,
  Velocity,
  Sprite,
} from '../ecs-components';

// ============================================================
// Система жизней
// ============================================================

/** Проверить здоровье и пометить мёртвых */
export function lifeCheckSystem(world: World): void {
  for (const eid of query(world, [Health])) {
    if (Health.current[eid] <= 0 && !Dead[eid]) {
      Dead[eid] = true;
      // bus.emit('entity:died', { eid });
    }
  }
}

/** Удалить мёртвые сущности */
export function deathCleanupSystem(world: World): void {
  for (const eid of query(world, [Dead])) {
    // bus.emit('entity:dead', { eid });
    removeEntity(world, eid);
  }
}

// ============================================================
// Таймеры состояний
// ============================================================

/** Обновить таймеры состояний (hurtT, slowT, flashT, freezeT, lungeT) */
export function stateTimerSystem(world: World, dt: number): void {
  // Player timers
  for (const eid of query(world, [Player])) {
    const p = Player[eid];
    if (!p) continue;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.slowT > 0) p.slowT -= dt;
    if (p.swingT > 0) p.swingT -= dt;
  }

  // Enemy timers
  for (const eid of query(world, [Enemy])) {
    const e = Enemy[eid];
    if (!e) continue;
    if (e.flashT > 0) e.flashT -= dt;
    if (e.freezeT > 0) e.freezeT -= dt;
    if (e.lungeT > 0) e.lungeT -= dt;
    if (e.stateT > 0) e.stateT -= dt;
    if (e.repathT > 0) e.repathT -= dt;
    if (e.contactCd > 0) e.contactCd -= dt;
  }
}

// ============================================================
// Система магнита (дропы)
// ============================================================

/** Магнитное притяжение дропов к игроку */
export function magnetSystem(world: World, playerEid: number, dt: number): void {
  if (playerEid < 0) return;

  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;

  const playerX = px[playerEid];
  const playerY = py[playerEid];
  const magnetRange = 80;
  const magnetSpeed = 150;

  for (const eid of query(world, [Position, Velocity, Magnet])) {
    if (!Magnet[eid]) continue;

    const dx = playerX - px[eid];
    const dy = playerY - py[eid];
    const distSq = dx * dx + dy * dy;

    if (distSq < magnetRange * magnetRange && distSq > 1) {
      const dist = Math.sqrt(distSq);
      vx[eid] = (dx / dist) * magnetSpeed;
      vy[eid] = (dy / dist) * magnetSpeed;
    }
  }
}

// ============================================================
// Возвращающиеся снаряды
// ============================================================

/** Обновить возвращающиеся снаряды (бумеранг) */
export function returningProjectileSystem(world: World, playerEid: number, dt: number): void {
  if (playerEid < 0) return;

  const { x: px, y: py } = Position;
  const { x: vx, y: vy } = Velocity;

  for (const eid of query(world, [Position, Velocity, Projectile])) {
    const proj = Projectile[eid];
    if (!proj || !proj.returning) continue;

    const dx = px[playerEid] - px[eid];
    const dy = py[playerEid] - py[eid];
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);

    if (distToPlayer < 10) {
      removeEntity(world, eid);
      continue;
    }

    const speed = 200;
    vx[eid] = (dx / distToPlayer) * speed;
    vy[eid] = (dy / distToPlayer) * speed;
  }
}
