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
      Dead[eid] = 1;
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
    if (Player.hurtT[eid] > 0) Player.hurtT[eid] -= dt;
    if (Player.slowT[eid] > 0) Player.slowT[eid] -= dt;
    if (Player.swingT[eid] > 0) Player.swingT[eid] -= dt;
  }

  // Enemy timers
  for (const eid of query(world, [Enemy])) {
    if (Enemy.flashT[eid] > 0) Enemy.flashT[eid] -= dt;
    if (Enemy.freezeT[eid] > 0) Enemy.freezeT[eid] -= dt;
    if (Enemy.lungeT[eid] > 0) Enemy.lungeT[eid] -= dt;
    if (Enemy.stateT[eid] > 0) Enemy.stateT[eid] -= dt;
    if (Enemy.repathT[eid] > 0) Enemy.repathT[eid] -= dt;
    if (Enemy.contactCd[eid] > 0) Enemy.contactCd[eid] -= dt;
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
    if (!Projectile.returning[eid]) continue;

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
