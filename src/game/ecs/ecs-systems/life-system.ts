/* life-system.ts — система жизней, смерти и удаления сущностей */

import {
  query,
  removeEntity,
  addComponent,
  addComponents,
  hasComponent,
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
import { logger } from '../../debug/logger';
import { getRenderer } from '../../renderer/RendererFactory';
import type { GraphicsHandle } from '../../renderer/IRenderer';

// ============================================================
// Система жизней
// ============================================================

/** Проверить здоровье, пометить мёртвых и очистить спрайт/тело */
export function lifeCheckSystem(world: World): void {
  for (const eid of query(world, [Health])) {
    const hp = Health[eid];
    if (!hp) continue; // AoS элемент может быть undefined
    if (hp.current <= 0 && !Dead[eid]) {
      addComponent(world, eid, Dead);
      Dead[eid] = {};
      // Лог: игрок умер
      if (hasComponent(world, eid, Player)) {
        logger.info('life', `PLAYER DIED! eid=${eid} hp=${hp.current}`);
      }
      // bus.emit('entity:died', { eid });
    }
  }

  // Очистить спрайт мёртвых врагов (физ. тело удалится в game loop)
  const r = getRenderer();
  for (const eid of query(world, [Dead, Enemy])) {
    const spriteData = Sprite[eid];
    if (!spriteData) continue;
    const spriteHandle = spriteData.ref as GraphicsHandle;
    if (spriteHandle) {
      r.destroyGraphics(spriteHandle);
    }
    // Сбросить ссылку — иначе renderGraphics попытается обратиться к уничтоженному Graphics
    Sprite[eid] = { ref: 0 };
  }
}

/** Удалить мёртвые сущности (кроме игрока — его Dead сбрасывается при респавне) */
export function deathCleanupSystem(world: World): void {
  for (const eid of query(world, [Dead])) {
    // Не удалять игрока — его Dead сбрасывается в respawn(), а спрайт удаляется в game loop
    if (hasComponent(world, eid, Player)) continue;
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
    const pl = Player[eid];
    if (!pl) continue; // AoS элемент может быть undefined
    if (pl.moving) {
      pl.animT += dt;
    }
    if (pl.hurtT > 0) pl.hurtT -= dt;
    if (pl.slowT > 0) pl.slowT -= dt;
    if (pl.swingT > 0) pl.swingT -= dt;
  }

  // Enemy timers
  for (const eid of query(world, [Enemy])) {
    const en = Enemy[eid];
    if (!en) continue; // AoS элемент может быть undefined
    if (en.flashT > 0) en.flashT -= dt;
    if (en.freezeT > 0) en.freezeT -= dt;
    if (en.lungeT > 0) en.lungeT -= dt;
    if (en.stateT > 0) en.stateT -= dt;
    if (en.repathT > 0) en.repathT -= dt;
    if (en.contactCd > 0) en.contactCd -= dt;
  }
}

// ============================================================
// Система магнита (дропы)
// ============================================================

/** Магнитное притяжение дропов к игроку */
export function magnetSystem(world: World, playerEid: number, dt: number): void {
  if (playerEid < 0) return;

  const pPos = Position[playerEid];
  if (!pPos) return;
  const playerX = pPos.x;
  const playerY = pPos.y;
  const magnetRange = 80;
  const magnetSpeed = 150;

  for (const eid of query(world, [Position, Velocity, Magnet])) {
    if (!Magnet[eid]) continue;
    const pos = Position[eid];
    const vel = Velocity[eid];
    if (!pos || !vel) continue;

    const dx = playerX - pos.x;
    const dy = playerY - pos.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < magnetRange * magnetRange && distSq > 1) {
      const dist = Math.sqrt(distSq);
      vel.x = (dx / dist) * magnetSpeed;
      vel.y = (dy / dist) * magnetSpeed;
    }
  }
}

// ============================================================
// Возвращающиеся снаряды
// ============================================================

/** Обновить возвращающиеся снаряды (бумеранг) */
export function returningProjectileSystem(world: World, playerEid: number, dt: number): void {
  if (playerEid < 0) return;

  const pPos = Position[playerEid];
  if (!pPos) return;
  const playerX = pPos.x;
  const playerY = pPos.y;

  for (const eid of query(world, [Position, Velocity, Projectile])) {
    const proj = Projectile[eid];
    if (!proj || !proj.returning) continue;
    const pos = Position[eid];
    const vel = Velocity[eid];
    if (!pos || !vel) continue;

    const dx = playerX - pos.x;
    const dy = playerY - pos.y;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);

    if (distToPlayer < 10) {
      removeEntity(world, eid);
      continue;
    }

    const speed = 200;
    vel.x = (dx / distToPlayer) * speed;
    vel.y = (dy / distToPlayer) * speed;
  }
}
