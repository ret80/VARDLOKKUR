/* render-system.ts — ECS система рендеринга на основе PixiJS (SOLID: DIP) */

import { Application, Container, Graphics, Text } from "pixi.js";
import { query, hasComponent, type World } from 'bitecs';
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
  poolGet,
  StringPool,
  EnemyState,
  getEnemyStateName,
} from '../ecs-components';
import {
  enemyRegistry,
  npcRegistry,
  dropRegistry,
  projectileRegistry,
  PlayerRenderer,
  ChestRenderer,
  PedestalRenderer,
  ShrineRenderer,
  DoorRenderer,
  BarrierRenderer,
  AltarRenderer,
} from '../../renderers';
import type { InteractableHit } from './interaction-system';
import type { RenderContext } from '../../renderers';

// ============================================================
// Утилиты рендеринга
// ============================================================

/** Получить PixiJS объект из Sprite registry */
function getSpriteRef(eid: number): any {
  const idx = SpriteComp.ref[eid];
  if (idx <= 0 || idx > SpriteRegistry.length) {
    return undefined;
  }
  const s = SpriteRegistry[idx - 1];
  // Спрайт мог быть уничтожен (смерть врага) — возвращаем undefined
  if (!s) return undefined;
  // Спрайт мог быть уничтожен в PixiJS — проверяем флаг destroyed
  if ((s as any).destroyed) return undefined;
  return s;
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

  const matched = [...query(world, [Position, SpriteComp])];
  if (matched.length > 0) {
    console.log('[renderSprites] query found', matched.length, 'entities with [Position, Sprite]');
  }

  for (const eid of matched) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    // Спрайт мог быть уничтожен (смерть врага) — проверяем destroyed флаг PixiJS
    if ((ref as any).destroyed) continue;
    
    ref.x = px[eid];
    ref.y = py[eid];
  }
}

// ============================================================
// Сортировка по глубине (z-index) на основе LAYER + y
// ============================================================

/** Слой отрисовки для каждого типа сущности */
export const ENTITY_LAYER: Record<string, number> = {
  Drop: 20,
  Wall: 40,
  House: 40,
  NPC: 40,
  Door: 40,
  Barrier: 40,
  Altar: 40,
  Enemy: 40,
  Projectile: 40,
  Player: 40,
};

/** Выполнить сортировка всех спрайтов в dynamic контейнере */
export function renderSortSystem(
  world: World,
  dynamic: { children: any[] }
): void {
  const { x: px, y: py } = Position;
  const children = dynamic.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const ud = (child as any).userData;
    if (!child || !ud) continue;

    // ECS-сущности (имеют userData.eid)
    if (ud.eid !== undefined && ud.eid > 0) {
      const eid = ud.eid;
      const idx = SpriteComp.ref[eid];
      if (idx <= 0) continue;

      // Определяем слой сущности
      let layer = ENTITY_LAYER.Player; // default — 40

      if (hasComponent(world, eid, Drop)) {
        layer = ENTITY_LAYER.Drop;
      }

      // bottomY = py[eid] (py = Y + T/2, значит py = Y + 8 — центр тайла + половина тайла = низ тайла)
      child.zIndex = layer + Math.round(py[eid]);
    }
    // Не-ECS объекты (дома, ёлки, камни) — имеют userData.layer и userData.y (уже bottomY = Y + T/2)
    else if (ud.y !== undefined) {
      const layer = ud.layer !== undefined ? ud.layer : ENTITY_LAYER.Wall;
      child.zIndex = layer + Math.round(ud.y);
    }
  }
}

/** Обновить видимость спрайтов (Dead, Hidden, hurt-мигание) */
export function renderVisibilitySystem(
  world: World,
  playerEid: number,
  time: number
): void {
  const dead = Dead;
  const hidden = Hidden;
  const hurtT = Player.hurtT;

  for (const eid of query(world, [SpriteComp])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    // Dead проверяем только для игрока — остальные сущности удаляются
    // через removeEntity при смерти, и их eid может переиспользоваться,
    // что приведёт к ложному скрытию (например, святилища не зажигаются).
    if (eid === playerEid && dead[eid]) {
      ref.alpha = 0;
    } else if (hidden[eid]) {
      ref.alpha = 0.25;
    } else if (Player.hurtT[eid] > 0 && Math.floor(time * 14) % 2 === 0) {
      // hurt-мигание для игрока
      ref.alpha = 0.35;
    } else {
      ref.alpha = 1;
    }
  }
}

/** Обновить мигание (получение урона врагов) */
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
// Мапперы ECS → data для рендереров
// ============================================================

/** Маппер ECS Player → PlayerRenderData */
function eidToPlayerRenderData(eid: number) {
  const d = Direction;
  return {
    data: {
      x: 0, y: 0,
      dir: { x: d.x[eid], y: d.y[eid] },
      moving: !!Player.moving[eid],
      animT: Player.animT[eid],
      swingT: Player.swingT[eid],
      hurtT: Player.hurtT[eid],
      slowT: Player.slowT[eid],
      r: 5,
    },
    extra: {
      hasSword: !!Player.hasSword[eid],
      runes: Player.runes[eid],
      swingDir: { x: Player.swingDirX[eid], y: Player.swingDirY[eid] },
      aiming: !!Player.aiming[eid],
    },
  };
}

/** Маппер ECS Enemy → IEnemyData */
function eidToEnemyData(eid: number) {
  const health = Health;
  const radius = Radius;
  return {
    x: 0, y: 0,
    kind: poolGet(StringPool.enemyKinds, Enemy.kind[eid]) as EnemyKind,
    r: radius.value[eid],
    hp: health.current[eid],
    maxHp: health.max[eid],
    facing: { x: Enemy.facingX[eid], y: Enemy.facingY[eid] },
    t: Enemy.t[eid],
    state: getEnemyStateName(Enemy.state[eid]),
    aggro: !!Enemy.aggro[eid],
    dead: false,
    hidden: !!Enemy.hidden[eid],
    lungeT: Enemy.lungeT[eid],
    freezeT: Enemy.freezeT[eid],
    flashT: Enemy.flashT[eid],
    seed: Enemy.seed[eid],
    fade: Enemy.fade[eid],
    leash: null,
    dropDew: !!Enemy.dropDew[eid],
    nearLitShrine: !!Enemy.nearLitShrine[eid],
  };
}

/** Маппер ECS Drop → IDropData */
function eidToDropData(eid: number) {
  return {
    x: 0, y: 0,
    kind: poolGet(StringPool.dropKinds, Drop.kind[eid]) as DropKind,
    t: Drop.t[eid],
    taken: !!Taken[eid],
    magnet: !!Drop.magnet[eid],
  };
}

/** Маппер ECS Projectile → IProjectileData */
function eidToProjectileData(eid: number) {
  return {
    x: 0, y: 0,
    kind: poolGet(StringPool.projectileKinds, Projectile.kind[eid]) as ProjectileKind,
    r: 3,
    spin: Projectile.spin[eid],
    vx: 0, vy: 0,
  };
}

/** Маппер ECS NPC → INpcData */
function eidToNpcData(eid: number) {
  return {
    x: 0, y: 0,
    id: poolGet(StringPool.npcIds, NPC.id[eid]),
    name: poolGet(StringPool.npcNames, NPC.name[eid]),
  };
}

/** Маппер ECS Chest → IChestData */
function eidToChestData(eid: number) {
  return {
    x: 0, y: 0,
    opened: !!Chest.opened[eid],
  };
}

/** Маппер ECS Pedestal → IPedestalData */
function eidToPedestalData(eid: number) {
  return {
    x: 0, y: 0,
    taken: !!Pedestal.taken[eid],
    guardsLeft: Pedestal.guardsLeft[eid],
  };
}

/** Маппер ECS Shrine → IShrineData */
function eidToShrineData(eid: number) {
  return {
    x: 0, y: 0,
    lit: !!Shrine.lit[eid],
  };
}

/** Маппер ECS Door → IDoorData */
function eidToDoorData(eid: number) {
  return {
    x: 0, y: 0,
    open: Door.open[eid],
    locked: !!Door.locked[eid],
  };
}

/** Маппер ECS Barrier → IBarrierData */
function eidToBarrierData(eid: number) {
  return {
    x: 0, y: 0,
    active: !!Barrier.active[eid],
  };
}

/** Маппер ECS Altar → IAltarData */
function eidToAltarData(eid: number) {
  return {
    x: 0, y: 0,
    runes: Altar.runes[eid],
  };
}

// ============================================================
// Options для RenderSystem.render()
// ============================================================

export interface RenderSystemOptions {
  time: number;
  dt: number;
  app: Application;
  floatLayer: Container;
  cam: { x: number; y: number };
  gameWorld: Container | null;
  dynamic: { children: any[] } | null;
  hintLayer: Container;
  playerEid: number;
  getNpcSig?: (npcId: string) => string;
  talkedSig?: Map<string, string>;
  nearestInteractable?: InteractableHit | null;
}

// ============================================================
// Главный класс RenderSystem (ECS-оркестратор)
// ============================================================

/** Выполнить полный рендеринг */
export function renderSystem(
  world: World,
  opts: RenderSystemOptions
): void {
  const { time, dt, floatLayer, cam, gameWorld, dynamic, hintLayer, playerEid } = opts;
  
  // Лог: состояние игрока при рендере (раз в 1 сек)
  if (playerEid >= 0 && time % 1 < dt) {
    console.log('[render] playerEid=', playerEid, 'Dead=', !!Dead[playerEid], 'ref=', SpriteComp.ref[playerEid]);
  }

  // Слежение камеры за игроком
  if (playerEid >= 0 && Position.x.length > playerEid) {
    const halfW = opts.app.renderer.width / 2;
    const halfH = opts.app.renderer.height / 2;
    cam.x = Position.x[playerEid] - halfW;
    cam.y = Position.y[playerEid] - halfH;
  }
  
  // Применяем камеру к world контейнеру — он содержит tileLayer + dynamic
  if (gameWorld) {
    gameWorld.position.set(-Math.round(cam.x), -Math.round(cam.y));
  }
  
  // Update sprite positions
  renderSprites(world);
  
  // Сортировка по глубине (z-index) на основе RenderLayer + Y
  if (dynamic) {
    renderSortSystem(world, dynamic);
  }
  
  // Update visibility
  renderVisibilitySystem(world, playerEid, time);
  
  // Update flash effects
  renderFlashSystem(world, time);

  // --- Диспетчеризация через реестры ---
  const ctx: RenderContext = { time };

  // Игрок
  renderPlayerEcs(world, playerEid, ctx);
  
  // Враги
  renderByRegistry(
    world,
    [SpriteComp, Enemy],
    StringPool.enemyKinds,
    enemyRegistry,
    eidToEnemyData,
    time
  );
  
  // Снаряды
  renderByRegistry(
    world,
    [SpriteComp, Projectile],
    StringPool.projectileKinds,
    projectileRegistry,
    eidToProjectileData,
    time
  );
  
  // Дропы
  renderByRegistry(
    world,
    [SpriteComp, Drop],
    StringPool.dropKinds,
    dropRegistry,
    eidToDropData,
    time
  );
  
  // NPC
  renderNpcsEcs(world, ctx, opts.getNpcSig, opts.talkedSig);
  
  // Объекты окружения
  renderChestsEcs(world, ctx);
  renderPedestalsEcs(world, ctx);
  renderShrinesEcs(world, ctx);
  renderDoorsEcs(world, ctx);
  renderBarrierEcs(world, ctx);
  renderAltarEcs(world, ctx);
  
  // Обновить плавающий текст
  updateFloatTexts(floatLayer, dt);
  
  // Interaction hint (E) — подсказка взаимодействия над ближайшим объектом
  renderInteractionHint(hintLayer, opts.nearestInteractable, cam, time);
  
  // Очистка уничтоженных спрайтов из dynamic контейнера
  // (они могли остаться если parent.removeChild не сработал)
  if (dynamic) {
    const dyn = dynamic as any;
    const children = dyn.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child && child.destroyed) {
        dyn.removeChild(child);
        try { child.destroy(); } catch {}
      }
    }
  }
  
  // Render PixiJS app
  opts.app.render();
}

/** Рендеринг игрока (ECS) */
function renderPlayerEcs(world: World, playerEid: number, ctx: RenderContext): void {
  if (playerEid < 0) {
    console.log('[renderPlayer] SKIP: playerEid < 0');
    return;
  }
  if (!!Dead[playerEid]) {
    console.log('[renderPlayer] SKIP: Dead=', !!Dead[playerEid], 'playerEid=', playerEid);
    return;
  }
  
  const ref = getSpriteRef(playerEid);
  if (!ref) {
    console.log('[renderPlayer] SKIP: ref is null, playerEid=', playerEid, 'ref=', SpriteComp.ref[playerEid]);
    return;
  }
  
  const renderer = new PlayerRenderer();
  renderer.render(ref as Graphics, eidToPlayerRenderData(playerEid), ctx);
}

/** Рендеринг NPC (ECS) */
function renderNpcsEcs(
  world: World,
  ctx: RenderContext,
  getNpcSig?: (npcId: string) => string,
  talkedSig?: Map<string, string>
): void {
  for (const eid of query(world, [SpriteComp, NPC])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    const npcId = poolGet(StringPool.npcIds, NPC.id[eid]);
    const mark = npcHasMark(npcId, getNpcSig, talkedSig);
    const data = eidToNpcData(eid);
    
    // Передаём mark через контекст
    const npcCtx = { ...ctx, mark } as any;
    // Fallback на GenericNpcRenderer для NPC, которых нет в реестре
    const renderer = npcRegistry.get(npcId as any) ?? npcRegistry.get("default" as any);
    if (renderer) {
      renderer.render(ref as Graphics, data, npcCtx);
    }
  }
}

/** Проверить, есть ли у NPC маркер */
function npcHasMark(
  npcId: string,
  getNpcSig?: (npcId: string) => string,
  talkedSig?: Map<string, string>
): boolean {
  const sig = getNpcSig ? getNpcSig(npcId) : "";
  if (!sig) return false;
  return talkedSig?.get(npcId) !== sig;
}

/** Рендеринг сундуков (ECS) */
function renderChestsEcs(world: World, ctx: RenderContext): void {
  for (const eid of query(world, [SpriteComp, Chest])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    const renderer = new ChestRenderer();
    renderer.render(ref as Graphics, eidToChestData(eid), ctx);
  }
}

/** Рендеринг пьедесталов (ECS) */
function renderPedestalsEcs(world: World, ctx: RenderContext): void {
  for (const eid of query(world, [SpriteComp, Pedestal])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    const renderer = new PedestalRenderer();
    renderer.render(ref as Graphics, eidToPedestalData(eid), ctx);
  }
}

/** Рендеринг святилищ (ECS) */
function renderShrinesEcs(world: World, ctx: RenderContext): void {
  for (const eid of query(world, [SpriteComp, Shrine])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    const renderer = new ShrineRenderer();
    renderer.render(ref as Graphics, eidToShrineData(eid), ctx);
  }
}

/** Рендеринг дверей (ECS) */
function renderDoorsEcs(world: World, ctx: RenderContext): void {
  for (const eid of query(world, [SpriteComp, Door])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    const renderer = new DoorRenderer();
    renderer.render(ref as Graphics, eidToDoorData(eid), ctx);
  }
}

/** Рендеринг барьера (ECS) */
function renderBarrierEcs(world: World, ctx: RenderContext): void {
  for (const eid of query(world, [SpriteComp, Barrier])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    const renderer = new BarrierRenderer();
    renderer.render(ref as Graphics, eidToBarrierData(eid), ctx);
  }
}

/** Рендеринг алтаря (ECS) */
function renderAltarEcs(world: World, ctx: RenderContext): void {
  for (const eid of query(world, [SpriteComp, Altar])) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    const renderer = new AltarRenderer();
    renderer.render(ref as Graphics, eidToAltarData(eid), ctx);
  }
}

/** Универсальная диспетчеризация через реестр */
function renderByRegistry<TKey extends string, TData>(
  world: World,
  mask: any[],
  pool: string[],
  reg: { get: (key: TKey) => any | undefined },
  mapper: (eid: number) => TData,
  time: number
): void {
  for (const eid of query(world, mask)) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    
    // Для врагов проверяем dead
    if (mask.includes(Enemy) && Dead[eid]) continue;
    // Для дропов проверяем taken
    if (mask.includes(Drop) && Taken[eid]) continue;
    
    const kindArr = mask.includes(Enemy) ? Enemy.kind :
                    mask.includes(Drop) ? Drop.kind :
                    mask.includes(Projectile) ? Projectile.kind : null;
    const key = kindArr ? (poolGet(pool, kindArr[eid]) as TKey) : (null as any);
    const r = reg.get(key);
    if (!r) continue;
    
    r.render(ref as Graphics, mapper(eid), { time });
  }
}

// ============================================================
// Плавающий текст
// ============================================================

/** Добавить плавающий текст */
export function addFloatText(
  floatLayer: Container,
  text: string,
  x: number,
  y: number,
  color: number
): void {
  const txt = new Text({
    text,
    style: {
      fontFamily: 'Arial',
      fontSize: 4,
      fill: color,
      fontWeight: 'bold',
    },
  });
  txt.x = x;
  txt.y = y;
  txt.anchor.set(0.5, 0);
  txt.alpha = 0.7;
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
// Подсказка взаимодействия (E)
// ============================================================

/** Persistent Graphics для подсказки взаимодействия */
let _hintG: Graphics | null = null;

/** Инициализировать подсказку — вызывается один раз */
export function initInteractionHint(layer: Container): void {
  if (_hintG) return;
  _hintG = new Graphics();
  _hintG.zIndex = 9999;
  layer.addChild(_hintG);
}

/** Отрисовать подсказку взаимодействия над ближайшим интерактивным объектом */
function renderInteractionHint(
  hintLayer: Container,
  nearestInteractable: InteractableHit | null | undefined,
  cam: { x: number; y: number },
  time: number
): void {
  if (!_hintG) return;
  
  if (!nearestInteractable) {
    _hintG.visible = false;
    return;
  }
  
  _hintG.visible = true;
  // Экраные координаты: gameWorld сдвинут на -cam.x/-cam.y, а hintLayer — нет
  const hx = nearestInteractable.x - cam.x;
  const hy = nearestInteractable.y - cam.y - 20 + Math.sin(time * 5) * 1.5;
  
  _hintG.clear();
  // Тёмный фон
  _hintG.rect(hx - 6, hy - 6, 12, 10).fill({ color: 0x0a0f16, alpha: 0.85 });
  // Золотая рамка
  _hintG.rect(hx - 6, hy - 6, 12, 10).stroke({ color: 0xc9a24b, width: 1, alpha: 0.8 });
  // Буква "E" — пиксель-арт стиль
  _hintG.poly([
    hx - 2, hy - 3, hx + 2, hy - 3,
    hx + 2, hy - 1, hx, hy - 1,
    hx, hy + 2, hx - 2, hy + 2
  ]).fill({ color: 0xe8dcc0 });
}
