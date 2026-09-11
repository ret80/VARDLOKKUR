/* render-system.ts — ECS система рендеринга на основе PixiJS (SOLID: DIP) */

import { Application, Container, Graphics, Sprite } from "pixi.js";
import { query, hasComponent, type World } from 'bitecs';
import type { EnemyKind, DropKind, ProjectileKind } from '../../generators/types';
import {
  Position,
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
  Dead,
  Hidden,
  Flashing,
  Taken,
  SpriteRegistry,
  Radius,
  poolGet,
  StringPool,
} from '../ecs-components';
import {
  enemyRegistry,
  npcRegistry,
  dropRegistry,
  projectileRegistry,
  objectRegistry,
} from '../../renderers';
import { playerRenderer } from '../../renderers/player/playerRendererInstance';
import {
  eidToEnemyData,
  eidToDropData,
  eidToProjectileData,
  eidToNpcData,
  eidToChestData,
  eidToPedestalData,
  eidToShrineData,
  eidToDoorData,
  eidToBarrierData,
  eidToAltarData,
  playerToRenderData,
} from '../../renderers/ecs-mappers';
import type { InteractableHit } from './interaction-system';
import type { RenderContext } from '../../renderers';
import { FloatTextLayer } from '../../renderers/float/FloatTextLayer';
import { logger } from '../../debug/logger';
import { TextureCacheManager } from '../../renderers/core/TextureCacheManager';

// ============================================================
// Кэширование DYNAMIC_TEXTURE (Этап 3)
// ============================================================

/** prevData для каждой сущности — используется для needsTextureUpdate */
const enemyPrevDataMap = new Map<number, any>();
let playerPrevData: any = null;

/** Проверка видимости сущности в viewport камеры */
function isVisibleInViewport(
  entityX: number,
  entityY: number,
  camX: number,
  camY: number,
  entityRadius: number,
  viewportW: number,
  viewportH: number
): boolean {
  const dx = Math.abs(entityX - camX);
  const dy = Math.abs(entityY - camY);
  // viewportW/H — это ПОЛНЫЕ размеры viewport (renderer.width/height), а не половина
  return dx < viewportW && dy < viewportH;
}

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
    // console.log('[renderSprites] query found', matched.length, 'entities with [Position, Sprite]');
  }

  for (const eid of matched) {
    const ref = getSpriteRef(eid);
    if (!ref) continue;
    // Спрайт мог быть уничтожен (смерть врага) — проверяем destroyed флаг PixiJS
    if ((ref as any).destroyed) continue;
    
    const oldX = ref.x;
    const oldY = ref.y;
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
// Options для RenderSystem.render()
// ============================================================

export interface RenderSystemOptions {
  time: number;
  dt: number;
  app: Application;
  float: FloatTextLayer;
  cam: { x: number; y: number };
  gameWorld: Container | null;
  dynamic: Container | null;
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
  const { time, dt, float, cam, gameWorld, dynamic, hintLayer, playerEid } = opts;

  // Lazy-init TextureCacheManager — один раз при первом вызове renderSystem
  if (!TextureCacheManager.instance.isInit && opts.app) {
    TextureCacheManager.instance.init(opts.app);
  }
  
  // Лог: состояние игрока при рендере (раз в 5 сек)
  if (playerEid >= 0 && time % 5 < dt) {
    logger.debug('render', `playerEid=${playerEid} Dead=${!!Dead[playerEid]} ref=${SpriteComp.ref[playerEid]}`);
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
  renderPlayerEcs(world, playerEid, ctx, opts);
  
  // Враги
  renderByRegistry(
    world,
    [SpriteComp, Enemy],
    StringPool.enemyKinds,
    enemyRegistry,
    (eid) => eidToEnemyData(eid, world),
    time,
    opts
  );
  
  // Снаряды
  renderByRegistry(
    world,
    [SpriteComp, Projectile],
    StringPool.projectileKinds,
    projectileRegistry,
    (eid) => eidToProjectileData(eid, world),
    time
  );
  
  // Дропы
  renderByRegistry(
    world,
    [SpriteComp, Drop],
    StringPool.dropKinds,
    dropRegistry,
    (eid) => eidToDropData(eid, world),
    time
  );
  
  // NPC
  renderNpcsEcs(world, ctx, opts.getNpcSig, opts.talkedSig);
  
  // Объекты окружения (сундуки, пьедесталы, святилища, двери, барьеры, алтари)
  renderObjectsEcs(world, ctx);
  
  // Обновить плавающий текст
  float.update(dt);
  
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

/** Рендеринг игрока (ECS) — viewport culling + Graphics render */
function renderPlayerEcs(
  world: World,
  playerEid: number,
  ctx: RenderContext,
  opts: RenderSystemOptions
): void {
  if (playerEid < 0) return;
  if (!!Dead[playerEid]) return;

  const playerX = Position.x[playerEid];
  const playerY = Position.y[playerEid];

  // Viewport culling — camW/camH это ПОЛНЫЕ размеры viewport
  const camW = opts.app.renderer.width;
  const camH = opts.app.renderer.height;
  const ref = getSpriteRef(playerEid);
  
  logger.debug('render', `playerEid=${playerEid} x=${playerX} y=${playerY} ref=${!!ref} SpriteComp.ref=${SpriteComp.ref[playerEid]} SpriteRegistry.len=${SpriteRegistry.length} camX=${opts.cam.x} camY=${opts.cam.y} visible=${isVisibleInViewport(playerX, playerY, opts.cam.x, opts.cam.y, 8, camW, camH)}`);
  
  if (!ref) {
    logger.warn('render', `playerEid=${playerEid} ref is null/undefined`);
    return;
  }

  if (!isVisibleInViewport(playerX, playerY, opts.cam.x, opts.cam.y, 8, camW, camH)) {
    ref.visible = false;
    return;
  }

  ref.visible = true;
  playerRenderer.render(ref as Graphics, playerToRenderData(playerEid, ctx.time), ctx);
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
    const data = eidToNpcData(eid, world);
    
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

/** Конфигурация диспетчера объектов окружения */
type ObjectQueryConfig = {
  /** ECS-компоненты для query */
  components: any[];
  /** Ключ рендерера в objectRegistry */
  key: string;
  /** Маппер eid → data */
  mapper: (eid: number, world: World) => any;
};

/**
 * Конфигурация всех статических объектов окружения.
 * Новый тип объекта = одна строка здесь + регистрация рендерера в objectRegistry
 * (OCP — тело диспетчера не правится).
 */
const OBJECT_QUERIES: ObjectQueryConfig[] = [
  { components: [SpriteComp, Chest], key: "chest", mapper: eidToChestData },
  { components: [SpriteComp, Pedestal], key: "pedestal", mapper: eidToPedestalData },
  { components: [SpriteComp, Shrine], key: "shrine", mapper: eidToShrineData },
  { components: [SpriteComp, Door], key: "door", mapper: eidToDoorData },
  { components: [SpriteComp, Barrier], key: "barrier", mapper: eidToBarrierData },
  { components: [SpriteComp, Altar], key: "altar", mapper: eidToAltarData },
];

/**
 * Единый диспетчер отрисовки объектов окружения.
 * Рендереры берутся из objectRegistry (синглтоны, создаются один раз при старте),
 * данные — из ecs-mappers. Никаких new *Renderer() в кадровом цикле.
 */
function renderObjectsEcs(world: World, ctx: RenderContext): void {
  for (const config of OBJECT_QUERIES) {
    const renderer = objectRegistry.getOrThrow(config.key);
    for (const eid of query(world, config.components)) {
      const ref = getSpriteRef(eid);
      if (!ref) continue;
      renderer.render(ref as Graphics, config.mapper(eid, world), ctx);
    }
  }
}

/** Универсальная диспетчеризация через реестр (DYNAMIC_TEXTURE для врагов) */
function renderByRegistry<TKey extends string, TData>(
  world: World,
  mask: any[],
  pool: string[],
  reg: { get: (key: TKey) => any | undefined },
  mapper: (eid: number) => TData,
  time: number,
  opts?: RenderSystemOptions
): void {
  const isEnemy = mask.includes(Enemy);
  // camW/camH — ПОЛНЫЕ размеры viewport
  const camW = opts ? opts.app.renderer.width : 500;
  const camH = opts ? opts.app.renderer.height : 300;

  for (const eid of query(world, mask)) {
    // Для врагов проверяем dead
    if (isEnemy && Dead[eid]) continue;
    // Для дропов проверяем taken
    if (mask.includes(Drop) && Taken[eid]) continue;
    
    const kindArr = mask.includes(Enemy) ? Enemy.kind :
                    mask.includes(Drop) ? Drop.kind :
                    mask.includes(Projectile) ? Projectile.kind : null;
    const key = kindArr ? (poolGet(pool, kindArr[eid]) as TKey) : (null as any);
    const r = reg.get(key);
    if (!r) continue;
    
    // DYNAMIC_TEXTURE для врагов
    if (isEnemy && (r as any).strategy === 'dynamic' && opts) {
      const ref = getSpriteRef(eid);
      if (!ref) continue;

      const enemyX = Position.x[eid];
      const enemyY = Position.y[eid];
      const radius = Radius.value[eid] || 6;

      // Viewport culling
      if (!isVisibleInViewport(enemyX, enemyY, opts.cam.x, opts.cam.y, radius, camW, camH)) {
        ref.visible = false;
        continue;
      }

      ref.visible = true;

      const data = mapper(eid) as any;
      const needsUpdate = (r as any).needsTextureUpdate
        ? (r as any).needsTextureUpdate(data, enemyPrevDataMap.get(eid) || null)
        : true;

      if (needsUpdate) {
        try {
          const cache = TextureCacheManager.instance.getOrCreate(eid, radius);

          // Рисуем тело в контейнер
          (r as any).renderToContainer(cache.container, data, { time });

          // Запекаем в текстуру
          const baked = TextureCacheManager.instance.bake(eid);

          if (baked) {
            // Baked Sprite — используем его
            cache.sprite.x = enemyX;
            cache.sprite.y = enemyY;
            cache.sprite.zIndex = 40;

            // Alpha для призраков: (hidden ? 0.25 : 1) * fade
            cache.sprite.alpha = (data.hidden ? 0.25 : 1) * data.fade;

            // Добавляем в dynamic контейнер если нужно
            const dyn = opts.dynamic;
            if (dyn && !dyn.children.includes(cache.sprite as any)) {
              dyn.addChild(cache.sprite);
            }

            // Скрываем старый Graphics-спрайт
            ref.visible = false;
          } else {
            // Bake не удался — fallback на Graphics
            logger.warn('render', `Bake failed for enemy eid=${eid}, fallback to Graphics`);
            r.render(ref as Graphics, data, { time });
          }
        } catch (err) {
          // Fallback: если TextureCacheManager не инициализирован — рисуем в Graphics
          logger.warn('render', `DYNAMIC_TEXTURE failed for enemy eid=${eid}, fallback: ${err}`);
          r.render(ref as Graphics, data, { time });
        }

        // Сохраняем prevData
        enemyPrevDataMap.set(eid, { ...data });
      }
    } else {
      // Fallback: рисуем в Graphics как раньше
      const ref = getSpriteRef(eid);
      if (!ref) continue;
      r.render(ref as Graphics, mapper(eid), { time });
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
