/* render-system.ts — ECS система рендеринга на основе IRenderer (SOLID: DIP) */

import { query, hasComponent, type World } from 'bitecs';
import type { IRenderer, GraphicsHandle, LayerHandle, Vec2 } from '../../renderer/IRenderer';
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
// Утилиты рендеринга (module-level private)
// ============================================================

/** Map eid → SpriteHandle для быстрого доступа */
const eidToSpriteHandle = new Map<number, number>();

/** Получить SpriteHandle из registry по eid */
function getSpriteHandle(eid: number): number | undefined {
  const idx = SpriteComp.ref[eid];
  if (idx <= 0 || idx > SpriteRegistry.length) {
    return undefined;
  }
  // Registry индекс 1-based, массив 0-based
  const handle = idx - 1;
  return handle;
}

/** Зарегистрировать SpriteHandle для eid */
export function registerSpriteHandle(eid: number, handle: number): void {
  eidToSpriteHandle.set(eid, handle);
}

/** Конфигурация диспетчера объектов окружения */
type ObjectQueryConfig = {
  components: any[];
  key: string;
  mapper: (eid: number, world: World) => any;
};

/** Обновить позицию спрайта из Position компонента */
export function updateSpritePosition(world: World, eid: number, renderer: IRenderer): void {
  const { x: px, y: py } = Position;
  
  if (eid < 0 || eid >= SpriteComp.ref.length) return;
  const handle = getSpriteHandle(eid);
  if (handle === undefined) return;
  
  renderer.setSpritePosition(handle as any, { x: px[eid], y: py[eid] });
}

/** Обновить все спрайты */
export function renderSprites(world: World, renderer: IRenderer): void {
  const { x: px, y: py } = Position;

  const matched = [...query(world, [Position, SpriteComp])];
  if (matched.length > 0) {
    // console.log('[renderSprites] query found', matched.length, 'entities with [Position, Sprite]');
  }

  for (const eid of matched) {
    const handle = getSpriteHandle(eid);
    if (handle === undefined) continue;
    
    renderer.setSpritePosition(handle as any, { x: px[eid], y: py[eid] });
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

/** Выполнить сортировка всех спрайтов по z-index на основе слоя и Y */
export function renderSortSystem(
  world: World,
  playerEid: number,
  renderer: IRenderer
): void {
  const { x: px, y: py } = Position;

  for (const eid of query(world, [SpriteComp])) {
    const handle = getSpriteHandle(eid);
    if (handle === undefined) continue;

    // Определяем слой сущности
    let layer = ENTITY_LAYER.Player; // default — 40

    if (hasComponent(world, eid, Drop)) {
      layer = ENTITY_LAYER.Drop;
    }

    // zIndex = layer + rounded Y (для сортировки по глубине)
    const zIndex = layer + Math.round(py[eid]);
    renderer.setSpriteZIndex(handle as any, zIndex);
  }
}

/** Обновить видимость спрайтов (Dead, Hidden, hurt-мигание) */
export function renderVisibilitySystem(
  world: World,
  playerEid: number,
  time: number,
  renderer: IRenderer
): void {
  const dead = Dead;
  const hidden = Hidden;

  for (const eid of query(world, [SpriteComp])) {
    const handle = getSpriteHandle(eid);
    if (handle === undefined) continue;
    
    // Dead проверяем только для игрока — остальные сущности удаляются
    // через removeEntity при смерти, и их eid может переиспользоваться,
    // что приведёт к ложному скрытию (например, святилища не зажигаются).
    if (eid === playerEid && dead[eid]) {
      renderer.setSpriteAlpha(handle as any, 0);
    } else if (hidden[eid]) {
      renderer.setSpriteAlpha(handle as any, 0.25);
    } else if (Player.hurtT[eid] > 0 && Math.floor(time * 14) % 2 === 0) {
      // hurt-мигание для игрока
      renderer.setSpriteAlpha(handle as any, 0.35);
    } else {
      renderer.setSpriteAlpha(handle as any, 1);
    }
  }
}

/** Обновить мигание (получение урона врагов) */
export function renderFlashSystem(world: World, time: number, renderer: IRenderer): void {
  const flashing = Flashing;

  for (const eid of query(world, [SpriteComp, Flashing])) {
    const handle = getSpriteHandle(eid);
    if (handle === undefined) continue;
    
    if (Math.floor(time * 14) % 2 === 0) {
      renderer.setSpriteAlpha(handle as any, 0.35);
    } else {
      renderer.setSpriteAlpha(handle as any, 1);
    }
  }
}

// ============================================================
// Options для RenderSystem.render()
// ============================================================

export interface RenderSystemOptions {
  world: World;
  time: number;
  dt: number;
  /** FloatTextLayer для плавающего текста */
  float: FloatTextLayer;
  /** ID игрока */
  playerEid: number;
  /** Позиция камеры (для screen-space элементов: hint-подсказки) */
  cam: { x: number; y: number };
  /** Callback для получения сигнатуры NPC */
  getNpcSig?: (npcId: string) => string;
  /** Карта сигнатур диалогов */
  talkedSig?: Map<string, string>;
  /** Ближайший интерактивный объект */
  nearestInteractable?: InteractableHit | null;
}

// ============================================================
// Главный класс RenderSystem (ECS-оркестратор) — Этап 6
// ============================================================

/**
 * RenderSystem — класс-оркестратор рендеринга ECS-сущностей.
 *
 * Этап 6: полностью переписан для использования IRenderer.
 * Владее:
 * - enemyPrevDataMap — prevData для DYNAMIC_TEXTURE
 * - playerPrevData — prevData для игрока
 * - _hintG — GraphicsHandle для interaction hints
 * - entityLayer, fxLayer, overlayLayer — LayerHandle от IRenderer
 * - renderer — IRenderer (внедряется через init())
 *
 * Метод render() выполняет полный рендеринг сущностей.
 */
export class RenderSystem {
  /** IRenderer — внедряется через init() (DIP) */
  private renderer: IRenderer | null = null;

  /** Слои отрисовки — создаются через IRenderer.createLayer() */
  private entityLayer: LayerHandle | null = null;
  private fxLayer: LayerHandle | null = null;
  private overlayLayer: LayerHandle | null = null;

  /** Persistent GraphicsHandle для подсказки взаимодействия */
  private _hintG: GraphicsHandle | null = null;

  /** prevData для каждой сущности — используется для needsTextureUpdate */
  private enemyPrevDataMap = new Map<number, any>();
  private playerPrevData: any = null;

  /** Конфигурация всех статических объектов окружения */
  private readonly OBJECT_QUERIES: ObjectQueryConfig[] = [
    { components: [SpriteComp, Chest], key: "chest", mapper: eidToChestData },
    { components: [SpriteComp, Pedestal], key: "pedestal", mapper: eidToPedestalData },
    { components: [SpriteComp, Shrine], key: "shrine", mapper: eidToShrineData },
    { components: [SpriteComp, Door], key: "door", mapper: eidToDoorData },
    { components: [SpriteComp, Barrier], key: "barrier", mapper: eidToBarrierData },
    { components: [SpriteComp, Altar], key: "altar", mapper: eidToAltarData },
  ];

  /** Инициализировать рендерер (внедрение зависимости) */
  init(renderer: IRenderer): void {
    this.renderer = renderer;
    
    // Создаём слои через IRenderer (Этап 6)
    this.entityLayer = renderer.createLayer('entities', 40);
    this.fxLayer = renderer.createLayer('fx', 50);
    this.overlayLayer = renderer.createLayer('overlay', 9999);
    
    // Создаём Graphics для hint-подсказок
    this._hintG = renderer.createGraphics(this.overlayLayer);
  }

  /** Получить рендерер (для внутренних методов) */
  private getR(): IRenderer {
    if (!this.renderer) {
      throw new Error('RenderSystem not initialized. Call init(renderer) first.');
    }
    return this.renderer;
  }

  /** Получить handle спрайта по eid */
  private getSpriteHandle(eid: number): number | undefined {
    return getSpriteHandle(eid);
  }

  /** Получить слой сущности по типу компонента */
  private getLayer(world: World, eid: number): number {
    if (hasComponent(world, eid, Drop)) {
      return ENTITY_LAYER.Drop;
    }
    return ENTITY_LAYER.Player; // default
  }

  /** Проверить, есть ли у NPC маркер */
  private npcHasMark(
    npcId: string,
    getNpcSig?: (npcId: string) => string,
    talkedSig?: Map<string, string>
  ): boolean {
    const sig = getNpcSig ? getNpcSig(npcId) : "";
    if (!sig) return false;
    return talkedSig?.get(npcId) !== sig;
  }

  /** Рендеринг NPC (ECS) */
  private renderNpcsEcs(
    world: World,
    ctx: RenderContext,
    getNpcSig?: (npcId: string) => string,
    talkedSig?: Map<string, string>
  ): void {
    for (const eid of query(world, [SpriteComp, NPC])) {
      const spriteIdx = SpriteComp.ref[eid];
      if (spriteIdx <= 0 || spriteIdx > SpriteRegistry.length) continue;
      const sprite = SpriteRegistry[spriteIdx - 1];
      if (!sprite) continue;

      const npcId = poolGet(StringPool.npcIds, NPC.id[eid]);
      const mark = this.npcHasMark(npcId, getNpcSig, talkedSig);
      const data = eidToNpcData(eid, world);

      const npcCtx = { ...ctx, mark } as any;
      const renderer = npcRegistry.get(npcId as any) ?? npcRegistry.get("default" as any);
      if (renderer) {
        try {
          (renderer as any).render(sprite, data, npcCtx);
        } catch (err) {
          logger.warn('render', `NPC render failed for eid=${eid}: ${err}`);
        }
      }
    }
  }

  /** Единый диспетчер отрисовки объектов окружения */
  private renderObjectsEcs(world: World, ctx: RenderContext): void {
    for (const config of this.OBJECT_QUERIES) {
      const renderer = objectRegistry.getOrThrow(config.key);
      for (const eid of query(world, config.components)) {
        const spriteIdx = SpriteComp.ref[eid];
        if (spriteIdx <= 0 || spriteIdx > SpriteRegistry.length) continue;
        // Legacy path: объекты используют PixiJS Graphics из SpriteRegistry
        const sprite = SpriteRegistry[spriteIdx - 1];
        if (!sprite) continue;
        
        const data = config.mapper(eid, world);
        try {
          (renderer as any).render(sprite, data, ctx);
        } catch (err) {
          logger.warn('render', `Object render failed for eid=${eid}: ${err}`);
        }
      }
    }
  }

  /** Инициализировать подсказку взаимодействия — вызывается один раз */
  initInteractionHint(layer: LayerHandle): void {
    if (this._hintG) return;
    const r = this.getR();
    this._hintG = r.createGraphics(layer);
  }

  /** Выполнить полный рендеринг */
  render(
    world: World,
    opts: RenderSystemOptions
  ): void {
    const { time, dt, float, playerEid, nearestInteractable } = opts;
    const r = this.getR();

    // Lazy-init TextureCacheManager — один раз при первом вызове render()
    if (!TextureCacheManager.instance.isInit) {
      TextureCacheManager.instance.init(r);
    }

    // Lazy-init FloatTextLayer — один раз при первом вызове render()
    if (!(float as any).isInit) {
      (float as any).init(r);
    }

    // Лог: состояние игрока при рендере (раз в 5 сек)
    if (playerEid >= 0 && time % 5 < dt) {
      logger.debug('render', `playerEid=${playerEid} Dead=${!!Dead[playerEid]} handle=${this.getSpriteHandle(playerEid)}`);
    }

    // === Обновление позиций спрайтов (Этап 6) ===
    for (const eid of query(world, [Position, SpriteComp])) {
      const handle = this.getSpriteHandle(eid);
      if (handle !== undefined) {
        r.setSpritePosition(handle as any, { x: Position.x[eid], y: Position.y[eid] });
      }
    }

    // === Видимость: проверяем через IRenderer.isVisibleInViewport (Этап 6) ===
    for (const eid of query(world, [SpriteComp])) {
      const handle = this.getSpriteHandle(eid);
      if (handle === undefined) continue;
      
      const visible = r.isVisibleInViewport(
        { x: Position.x[eid], y: Position.y[eid] }, 
        Radius.value[eid] || 8
      );
      r.setSpriteVisible(handle as any, visible);
      
      // Альфа для Dead/Hidden
      if (Dead[eid]) r.setSpriteAlpha(handle as any, 0);
      else if (Hidden[eid]) r.setSpriteAlpha(handle as any, 0.25);
      else r.setSpriteAlpha(handle as any, 1);
    }

    // === Сортировка (через zIndex) (Этап 6) ===
    for (const eid of query(world, [SpriteComp])) {
      const handle = this.getSpriteHandle(eid);
      if (handle !== undefined) {
        const layer = this.getLayer(world, eid);
        r.setSpriteZIndex(handle as any, layer + Math.round(Position.y[eid]));
      }
    }

    // === Диспетчеризация через реестры ===
    const ctx: RenderContext = { time, renderer: r };

    // Игрок
    this.renderPlayerEcs(world, playerEid, ctx, opts);

    // Враги
    this.renderByRegistry(
      world,
      [SpriteComp, Enemy],
      StringPool.enemyKinds,
      enemyRegistry,
      (eid) => eidToEnemyData(eid, world),
      time,
      opts
    );

    // Снаряды
    this.renderByRegistry(
      world,
      [SpriteComp, Projectile],
      StringPool.projectileKinds,
      projectileRegistry,
      (eid) => eidToProjectileData(eid, world),
      time
    );

    // Дропы
    this.renderByRegistry(
      world,
      [SpriteComp, Drop],
      StringPool.dropKinds,
      dropRegistry,
      (eid) => eidToDropData(eid, world),
      time
    );

    // NPC
    this.renderNpcsEcs(world, ctx, opts.getNpcSig, opts.talkedSig);

    // Объекты окружения (сундуки, пьедесталы, святилища, двери, барьеры, алтари)
    this.renderObjectsEcs(world, ctx);

    // Обновить плавающий текст
    float.update(dt);

    // Interaction hint (E) — подсказка взаимодействия над ближайшим объектом
    this.renderInteractionHint(opts.cam, nearestInteractable, time);

    // === Финальный рендер через IRenderer (Этап 6) ===
    r.render();
  }

  /** Рендеринг игрока (ECS) — viewport culling + Graphics render */
  private renderPlayerEcs(
    world: World,
    playerEid: number,
    ctx: RenderContext,
    opts: RenderSystemOptions
  ): void {
    if (playerEid < 0) return;
    if (!!Dead[playerEid]) return;

    const playerX = Position.x[playerEid];
    const playerY = Position.y[playerEid];
    const handle = this.getSpriteHandle(playerEid);
    const r = this.getR();
    const visible = r.isVisibleInViewport({ x: playerX, y: playerY }, 8);

    logger.debug('render', `playerEid=${playerEid} x=${playerX} y=${playerY} handle=${handle} visible=${visible}`);

    if (handle === undefined) {
      logger.warn('render', `playerEid=${playerEid} handle is undefined`);
      return;
    }

    if (!visible) {
      r.setSpriteVisible(handle as any, false);
      return;
    }

    r.setSpriteVisible(handle as any, true);

    // Рендерим игрока через PixiJS Graphics из SpriteRegistry
    const spriteIdx = SpriteComp.ref[playerEid];
    if (spriteIdx <= 0 || spriteIdx > SpriteRegistry.length) return;
    const sprite = SpriteRegistry[spriteIdx - 1];
    if (!sprite) return;

    const { data, extra } = playerToRenderData(playerEid, ctx.time);
    try {
      playerRenderer.render(sprite, { data, extra }, ctx);
    } catch (err) {
      logger.warn('render', `Player render failed for eid=${playerEid}: ${err}`);
    }
  }

  /** Универсальная диспетчеризация через реестр (DYNAMIC_TEXTURE для врагов) */
  private renderByRegistry<TKey extends string, TData>(
    world: World,
    mask: any[],
    pool: string[],
    reg: { get: (key: TKey) => any | undefined },
    mapper: (eid: number) => TData,
    time: number,
    opts?: RenderSystemOptions
  ): void {
    const isEnemy = mask.includes(Enemy);
    const r = opts ? this.getR() : null;

    for (const eid of query(world, mask)) {
      // Для врагов проверяем dead
      if (isEnemy && Dead[eid]) continue;
      // Для дропов проверяем taken
      if (mask.includes(Drop) && Taken[eid]) continue;

      const kindArr = mask.includes(Enemy) ? Enemy.kind :
                      mask.includes(Drop) ? Drop.kind :
                      mask.includes(Projectile) ? Projectile.kind : null;
      const key = kindArr ? (poolGet(pool, kindArr[eid]) as TKey) : (null as any);
      const renderer = reg.get(key);
      if (!renderer) continue;

      // DYNAMIC_TEXTURE для врагов
      if (isEnemy && (renderer as any).strategy === 'dynamic' && opts) {
        const handle = this.getSpriteHandle(eid);
        if (handle === undefined) continue;

        const enemyX = Position.x[eid];
        const enemyY = Position.y[eid];
        const radius = Radius.value[eid] || 6;

        // Viewport culling — через IRenderer.isVisibleInViewport (Этап 6)
        if (!r!.isVisibleInViewport({ x: enemyX, y: enemyY }, radius)) {
          r!.setSpriteVisible(handle as any, false);
          continue;
        }

        r!.setSpriteVisible(handle as any, true);

        const data = mapper(eid) as any;
        const needsUpdate = (renderer as any).needsTextureUpdate
          ? (renderer as any).needsTextureUpdate(data, this.enemyPrevDataMap.get(eid) || null)
          : true;

        if (needsUpdate) {
          try {
            const cache = TextureCacheManager.instance.getOrCreate(eid, radius);

            // Рисуем тело в GraphicsHandle
            (renderer as any).render(cache.graphics, data, { time, renderer: r! });

            // Запекаем в текстуру
            const baked = TextureCacheManager.instance.bake(eid);

            if (baked) {
              // Baked Sprite — используем его
              r!.setSpritePosition(cache.sprite, { x: enemyX, y: enemyY });
              r!.setSpriteZIndex(cache.sprite, 40);

              // Alpha для призраков: (hidden ? 0.25 : 1) * fade
              r!.setSpriteAlpha(cache.sprite, (data.hidden ? 0.25 : 1) * data.fade);

              // Скрываем старый Graphics-спрайт
              r!.setSpriteVisible(handle as any, false);
            } else {
              // Bake не удался — fallback на прямой рендер в PixiJS Graphics
              logger.warn('render', `Bake failed for enemy eid=${eid}, fallback to direct Graphics`);
              const spriteIdx = SpriteComp.ref[eid];
              if (spriteIdx > 0 && spriteIdx <= SpriteRegistry.length) {
                const sprite = SpriteRegistry[spriteIdx - 1];
                if (sprite) {
                  try {
                    (renderer as any).render(sprite, data, { time, renderer: r! });
                  } catch (e) {
                    logger.warn('render', `Direct render fallback failed: ${e}`);
                  }
                }
              }
            }
          } catch (err) {
            // Fallback: если TextureCacheManager не инициализирован — рисуем в Graphics
            logger.warn('render', `DYNAMIC_TEXTURE failed for enemy eid=${eid}, fallback: ${err}`);
            const spriteIdx = SpriteComp.ref[eid];
            if (spriteIdx > 0 && spriteIdx <= SpriteRegistry.length) {
              const sprite = SpriteRegistry[spriteIdx - 1];
              if (sprite) {
                try {
                  (renderer as any).render(sprite, data, { time, renderer: r! });
                } catch (e) {
                  logger.warn('render', `Direct render fallback failed: ${e}`);
                }
              }
            }
          }

          // Сохраняем prevData
          this.enemyPrevDataMap.set(eid, { ...data });
        }
      } else {
        // Fallback: рисуем через PixiJS Graphics из SpriteRegistry
        const spriteIdx = SpriteComp.ref[eid];
        if (spriteIdx <= 0 || spriteIdx > SpriteRegistry.length) continue;
        const sprite = SpriteRegistry[spriteIdx - 1];
        if (!sprite) continue;

        const data = mapper(eid);
        try {
          (renderer as any).render(sprite, data, { time, renderer: r! });
        } catch (err) {
          logger.warn('render', `Fallback render failed for eid=${eid}: ${err}`);
        }
      }
    }
  }

  /** Отрисовать подсказку взаимодействия над ближайшим интерактивным объектом */
  private renderInteractionHint(
    cam: { x: number; y: number },
    nearestInteractable: InteractableHit | null | undefined,
    time: number
  ): void {
    if (!this._hintG) return;
    const r = this.getR();

    if (!nearestInteractable) {
      r.setGraphicsVisible(this._hintG, false);
      return;
    }

    r.setGraphicsVisible(this._hintG, true);
    
    // Экраные координаты: gameWorld сдвинут на -cam.x/-cam.y, а hintLayer — нет
    const hx = nearestInteractable.x - cam.x;
    const hy = nearestInteractable.y - cam.y - 20 + Math.sin(time * 5) * 1.5;

    r.clearGraphics(this._hintG);
    
    // Тёмный фон
    r.drawRect(this._hintG, 
      { x: hx - 6, y: hy - 6, width: 12, height: 10 },
      { r: 0x0a, g: 0x0f, b: 0x16, a: 0.85 }, true);
    
    // Золотая рамка
    r.drawRect(this._hintG, 
      { x: hx - 6, y: hy - 6, width: 12, height: 10 },
      { r: 0xc9, g: 0xa2, b: 0x4b, a: 0.8 }, false, 1);
    
    // Буква "E" — пиксель-арт стиль
    r.drawPoly(this._hintG, [
      hx - 2, hy - 3, hx + 2, hy - 3,
      hx + 2, hy - 1, hx, hy - 1,
      hx, hy + 2, hx - 2, hy + 2
    ], { r: 0xe8, g: 0xdc, b: 0xc0, a: 1 });
  }
}

// ============================================================
// Обёртки для обратной совместимости
// ============================================================

/** Синглтон RenderSystem — создаётся один раз и переиспользуется */
const _renderSystemInstance = new RenderSystem();

/** Выполнить полный рендеринг (обёртка для обратной совместимости) */
export function renderSystem(
  world: World,
  opts: RenderSystemOptions
): void {
  _renderSystemInstance.render(world, opts);
}

/** Инициализировать подсказку — вызывается один раз (обёртка над RenderSystem) */
export function initInteractionHint(layer: LayerHandle): void {
  _renderSystemInstance.initInteractionHint(layer);
}
