/* render-system.ts — ECS система рендеринга на основе PixiJS */

import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import { query, type World } from 'bitecs';
import type { EnemyKind, DropKind, ProjectileKind } from '../../generators/types';
import {
  Position,
  Velocity,
  Health,
  Radius,
  Direction,
  Player,
  Enemy,
  Projectile,
  Drop,
  NPC,
  Chest,
  Pedestal,
  Shrine,
  Door,
  Barrier,
  Altar,
  Sprite as SpriteComp,
  RenderLayer,
  Dead,
  Hidden,
  Flashing,
  Time,
  Taken,
  SpriteRegistry,
  EnemyState,
  getEnemyStateName,
  poolGet,
  StringPool,
} from '../ecs-components';
import {
  drawPlayer,
  drawEnemy,
  drawNpc,
  drawDrop,
  drawProjectile,
  drawChest,
  drawPedestal,
  drawShrine,
  drawDoor,
  drawBarrier,
  drawAltar,
} from '../ecs-render-helpers';

// ============================================================
// Утилиты рендеринга
// ============================================================

/** Получить PixiJS объект из Sprite registry */
function getSpriteRef(eid: number): any {
  const idx = SpriteComp.ref[eid];
  return idx > 0 ? SpriteRegistry[idx - 1] : undefined;
}

/** Добавить объект в Sprite registry, вернуть индекс (1-based) */
export function registerSprite(sprite: any): number {
  SpriteRegistry.push(sprite);
  return SpriteRegistry.length;
}

/** Обновить позицию спрайта из Position компонента */
export function updateSpritePosition(world: World, eid: number): void {
  const { x: px, y: py } = Position;
  
  if (eid < 0 || eid >= SpriteComp.ref.length) return;
  const ref = getSpriteRef(eid);
  if (!ref) return;
  
  ref.x = px[eid];
  ref.y = py[eid];
}

/** Обновить все спрайты */
export function renderSprites(world: World): void {
  const { x: px, y: py } = Position;

  for (const eid of query(world, [Position, Sprite])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    ref.x = px[eid];
    ref.y = py[eid];
  }
}

/** Обновить видимость спрайтов (Dead, Hidden) */
export function renderVisibilitySystem(world: World): void {
  const dead = Dead;
  const hidden = Hidden;

  for (const eid of query(world, [SpriteComp])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    if (dead[eid]) {
      ref.alpha = 0;
    } else if (hidden[eid]) {
      ref.alpha = 0.25;
    } else {
      ref.alpha = 1;
    }
  }
}

/** Обновить мигание (получение урона) */
export function renderFlashSystem(world: World, time: number): void {
  const flashing = Flashing;

  for (const eid of query(world, [SpriteComp, Flashing])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    if (Math.floor(time * 14) % 2 === 0) {
      ref.alpha = 0.35;
    } else {
      ref.alpha = 1;
    }
  }
}

// ============================================================
// Рендеринг сущностей — вызов renderer функций каждый кадр
// ============================================================

/** Рендеринг игрока */
export function renderPlayer(
  world: World,
  playerEid: number,
  time: number
): void {
  if (playerEid < 0 || !Player.moving.length) return;
  
  const ref = getSpriteRef(playerEid);
  if (!ref) return;
  
  const d = Direction;
  
  drawPlayer(
    ref as Graphics,
    d.x[playerEid], d.y[playerEid],
    !!Player.moving[playerEid], Player.animT[playerEid], Player.swingT[playerEid],
    Player.hurtT[playerEid], Player.slowT[playerEid],
    !!Player.hasSword[playerEid], Player.runes[playerEid],
    Player.swingDirX[playerEid], Player.swingDirY[playerEid],
    !!Player.aiming[playerEid],
    time
  );
}

/** Рендеринг врагов */
export function renderEnemies(world: World, time: number): void {
  const dead = Dead;
  const health = Health;
  const radius = Radius;

  for (const eid of query(world, [SpriteComp, Enemy])) {
    if (dead[eid]) continue;
    
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    const hp = health.current[eid];
    const maxHp = health.max[eid];
    const r = radius.value[eid];
    
    drawEnemy(
      ref as Graphics,
      poolGet(StringPool.enemyKinds, Enemy.kind[eid]) as EnemyKind,
      Enemy.facingX[eid], Enemy.facingY[eid],
      Enemy.t[eid], getEnemyStateName(Enemy.state[eid]),
      !!Enemy.aggro[eid], !!Enemy.hidden[eid], !!Enemy.hidden[eid],
      Enemy.lungeT[eid], Enemy.freezeT[eid], Enemy.flashT[eid],
      Enemy.seed[eid], Enemy.fade[eid],
      hp, maxHp,
      r,
      !!Enemy.dropDew[eid],
      time
    );
  }
}

/** Рендеринг снарядов */
export function renderProjectiles(world: World, time: number): void {
  for (const eid of query(world, [SpriteComp, Projectile])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    drawProjectile(
      ref as Graphics,
      poolGet(StringPool.projectileKinds, Projectile.kind[eid]) as ProjectileKind,
      0, 0, // vx, vy — направление не критично для статического рисования
      Projectile.spin[eid],
      time
    );
  }
}

/** Рендеринг дропов */
export function renderDrops(world: World, time: number): void {
  const taken = Taken;

  for (const eid of query(world, [SpriteComp, Drop])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    drawDrop(
      ref as Graphics,
      poolGet(StringPool.dropKinds, Drop.kind[eid]) as DropKind,
      Drop.t[eid],
      !!taken[eid],
      false, // magnet — не влияет на визуал
      time
    );
  }
}

/** Рендеринг NPC */
export function renderNPCs(world: World, time: number): void {
  for (const eid of query(world, [SpriteComp, NPC])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    drawNpc(
      ref as Graphics,
      poolGet(StringPool.npcIds, NPC.id[eid]),
      poolGet(StringPool.npcNames, NPC.name[eid]),
      time,
      true // mark — показывать маркер
    );
  }
}

/** Рендеринг сундуков */
export function renderChests(world: World, time: number): void {
  for (const eid of query(world, [SpriteComp, Chest])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    drawChest(
      ref as Graphics,
      !!Chest.opened[eid],
      time
    );
  }
}

/** Рендеринг пьедесталов */
export function renderPedestals(world: World, time: number): void {
  for (const eid of query(world, [SpriteComp, Pedestal])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    drawPedestal(
      ref as Graphics,
      !!Pedestal.taken[eid],
      Pedestal.guardsLeft[eid],
      time
    );
  }
}

/** Рендеринг святилищ */
export function renderShrines(world: World, time: number): void {
  for (const eid of query(world, [SpriteComp, Shrine])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    drawShrine(
      ref as Graphics,
      !!Shrine.lit[eid],
      time
    );
  }
}

/** Рендеринг дверей */
export function renderDoors(world: World, time: number): void {
  for (const eid of query(world, [SpriteComp, Door])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    drawDoor(
      ref as Graphics,
      Door.open[eid],
      !!Door.locked[eid]
    );
  }
}

/** Рендеринг барьера */
export function renderBarrier(world: World, time: number): void {
  for (const eid of query(world, [SpriteComp, Barrier])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    drawBarrier(
      ref as Graphics,
      !!Barrier.active[eid],
      time
    );
  }
}

/** Рендеринг алтаря */
export function renderAltar(world: World, time: number): void {
  for (const eid of query(world, [SpriteComp, Altar])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    drawAltar(
      ref as Graphics,
      Altar.runes[eid],
      time
    );
  }
}

// ============================================================
// Плавающий текст
// ============================================================

/** Добавить плавающий текст */
export function addFloatText(
  floatLayer: Container,
  factory: { createText: (text: string, style: any) => Text },
  x: number,
  y: number,
  text: string,
  color: number
): void {
  const txt = factory.createText(text, {
    fontFamily: 'Arial',
    fontSize: 12,
    fill: color,
    fontWeight: 'bold',
  });
  txt.x = x;
  txt.y = y;
  txt.anchor.set(0.5, 0);
  floatLayer.addChild(txt);
}

/** Обновить плавающий текст */
export function updateFloatTexts(floatLayer: Container, dt: number): void {
  const children = floatLayer.children as Text[];
  for (let i = children.length - 1; i >= 0; i--) {
    const txt = children[i];
    txt.y -= 20 * dt;
    txt.alpha -= dt * 0.5;
    
    if (txt.alpha <= 0) {
      floatLayer.removeChild(txt);
      txt.destroy();
    }
  }
}

// ============================================================
// Главный цикл рендеринга
// ============================================================

/** Выполнить полный рендеринг */
export function renderSystem(
  world: World,
  playerEid: number,
  time: number,
  app: Application,
  floatLayer: Container,
  dt: number,
  cam: { x: number; y: number },
  gameWorld: Container | null
): void {
  // Применяем камеру к world контейнеру — он содержит tileLayer + dynamic
  if (gameWorld) {
    gameWorld.position.set(-Math.round(cam.x), -Math.round(cam.y));
  }
  
  // Update sprite positions
  renderSprites(world);
  
  // Update visibility
  renderVisibilitySystem(world);
  
  // Update flash effects
  renderFlashSystem(world, time);
  
  // Render entity types — вызывают renderer функции из entities.ts
  renderPlayer(world, playerEid, time);
  renderEnemies(world, time);
  renderProjectiles(world, time);
  renderDrops(world, time);
  renderNPCs(world, time);
  renderChests(world, time);
  renderPedestals(world, time);
  renderShrines(world, time);
  renderDoors(world, time);
  renderBarrier(world, time);
  renderAltar(world, time);
  
  // Update float texts
  updateFloatTexts(floatLayer, dt);
  
  // Render PixiJS app
  app.render();
}
