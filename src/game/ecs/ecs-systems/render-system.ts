/* render-system.ts — ECS система рендеринга на основе PixiJS */

import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import { query, type World } from 'bitecs';
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
// Конфигурация рендеринга
// ============================================================

export interface RenderSystemConfig {
  dynamic: Container;
  floatLayer: Container;
}

// ============================================================
// Утилиты рендеринга
// ============================================================

/** Обновить позицию спрайта из Position компонента */
export function updateSpritePosition(world: World, eid: number): void {
  const { x: px, y: py } = Position;
  const sp = SpriteComp;
  
  if (eid < 0 || eid >= sp.length) return;
  const ref = sp[eid]?.ref;
  if (!ref) return;
  
  ref.x = px[eid];
  ref.y = py[eid];
}

/** Обновить все спрайты */
export function renderSprites(world: World): void {
  const { x: px, y: py } = Position;
  const sp = SpriteComp;

  for (const eid of query(world, [Position, Sprite])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    ref.x = px[eid];
    ref.y = py[eid];
  }
}

/** Обновить видимость спрайтов (Dead, Hidden) */
export function renderVisibilitySystem(world: World): void {
  const sp = SpriteComp;
  const dead = Dead;
  const hidden = Hidden;

  for (const eid of query(world, [Sprite])) {
    const ref = sp[eid]?.ref;
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
  const sp = SpriteComp;
  const flashing = Flashing;

  for (const eid of query(world, [Sprite, Flashing])) {
    const ref = sp[eid]?.ref;
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
  if (playerEid < 0) return;
  
  const sp = SpriteComp;
  const ref = sp[playerEid]?.ref;
  if (!ref) return;
  
  const p = Player[playerEid];
  const d = Direction;
  
  drawPlayer(
    ref as Graphics,
    d.x[playerEid], d.y[playerEid],
    p.moving, p.animT, p.swingT,
    p.hurtT, p.slowT,
    p.hasSword, p.runes,
    p.swingDirX, p.swingDirY,
    p.aiming,
    time
  );
}

/** Рендеринг врагов */
export function renderEnemies(world: World, time: number): void {
  const sp = SpriteComp;
  const dead = Dead;
  const enemy = Enemy;
  const health = Health;
  const radius = Radius;

  for (const eid of query(world, [Sprite, Enemy])) {
    if (dead[eid]) continue;
    
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const e = enemy[eid];
    if (!e) continue;
    
    const hp = health.current[eid];
    const maxHp = health.max[eid];
    const r = radius.value[eid];
    
    drawEnemy(
      ref as Graphics,
      e.kind,
      e.facingX, e.facingY,
      e.t, e.state,
      e.aggro, e.hidden, e.hidden,
      e.lungeT, e.freezeT, e.flashT,
      e.seed, e.fade,
      hp, maxHp,
      r,
      e.dropDew,
      time
    );
  }
}

/** Рендеринг снарядов */
export function renderProjectiles(world: World, time: number): void {
  const sp = SpriteComp;
  const proj = Projectile;

  for (const eid of query(world, [Sprite, Projectile])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const p = proj[eid];
    if (!p) continue;
    
    drawProjectile(
      ref as Graphics,
      p.kind,
      0, 0, // vx, vy — направление не критично для статического рисования
      p.spin,
      time
    );
  }
}

/** Рендеринг дропов */
export function renderDrops(world: World, time: number): void {
  const sp = SpriteComp;
  const drop = Drop;
  const taken = Taken;
  const timeComp = Time;

  for (const eid of query(world, [Sprite, Drop])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const d = drop[eid];
    if (!d) continue;
    
    drawDrop(
      ref as Graphics,
      d.kind,
      d.t,
      taken[eid] ?? false,
      false, // magnet — не влияет на визуал
      time
    );
  }
}

/** Рендеринг NPC */
export function renderNPCs(world: World, time: number): void {
  const sp = SpriteComp;
  const npc = NPC;

  for (const eid of query(world, [Sprite, NPC])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const n = npc[eid];
    if (!n) continue;
    
    drawNpc(
      ref as Graphics,
      n.id, n.name,
      time,
      true // mark — показывать маркер
    );
  }
}

/** Рендеринг сундуков */
export function renderChests(world: World, time: number): void {
  const sp = SpriteComp;
  const chest = Chest;

  for (const eid of query(world, [Sprite, Chest])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const c = chest[eid];
    if (!c) continue;
    
    drawChest(
      ref as Graphics,
      c.opened,
      time
    );
  }
}

/** Рендеринг пьедесталов */
export function renderPedestals(world: World, time: number): void {
  const sp = SpriteComp;
  const pedestal = Pedestal;

  for (const eid of query(world, [Sprite, Pedestal])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const p = pedestal[eid];
    if (!p) continue;
    
    drawPedestal(
      ref as Graphics,
      p.taken,
      p.guardsLeft,
      time
    );
  }
}

/** Рендеринг святилищ */
export function renderShrines(world: World, time: number): void {
  const sp = SpriteComp;
  const shrine = Shrine;

  for (const eid of query(world, [Sprite, Shrine])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const s = shrine[eid];
    if (!s) continue;
    
    drawShrine(
      ref as Graphics,
      s.lit,
      time
    );
  }
}

/** Рендеринг дверей */
export function renderDoors(world: World, time: number): void {
  const sp = SpriteComp;
  const door = Door;

  for (const eid of query(world, [Sprite, Door])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const d = door[eid];
    if (!d) continue;
    
    drawDoor(
      ref as Graphics,
      d.open,
      d.locked
    );
  }
}

/** Рендеринг барьера */
export function renderBarrier(world: World, time: number): void {
  const sp = SpriteComp;
  const barrier = Barrier;

  for (const eid of query(world, [Sprite, Barrier])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const b = barrier[eid];
    if (!b) continue;
    
    drawBarrier(
      ref as Graphics,
      b.active,
      time
    );
  }
}

/** Рендеринг алтаря */
export function renderAltar(world: World, time: number): void {
  const sp = SpriteComp;
  const altar = Altar;

  for (const eid of query(world, [Sprite, Altar])) {
    const ref = sp[eid]?.ref;
    if (!ref) continue;
    
    const a = altar[eid];
    if (!a) continue;
    
    drawAltar(
      ref as Graphics,
      a.runes,
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
